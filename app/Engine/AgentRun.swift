// One agent run: the runtime's CLI in the student's workspace folder, its output streamed as events.
import Foundation

// What a run may get on top of the prompt: extra folders it may read (the second brain), environment values (the
// student's named keys, an API key instead of a subscription, only in API-key mode), a JSON schema for a structured
// answer, and no tools (for analysing untrusted text such as transcripts).
struct RunExtras {
  var addDirs: [String] = []
  var env: [String: String] = [:]
  var jsonSchema: J? = nil
  var noTools = false
  // Adds what the student switched on for every run (brain folders, key vault, API-key mode).
  func withHooks(runtime: String) -> RunExtras {
    var x = self
    for d in RunHooks.addDirs() where !x.addDirs.contains(d) { x.addDirs.append(d) }
    x.env = RunHooks.env(runtime: runtime).merging(env) { $1 }
    return x
  }
}

final class AgentRun {
  let id: String
  private var process: Process?
  private var stopped = false
  init(id: String) { self.id = id }
  func stop() { stopped = true; process?.terminate() }

  struct Result { var text: String; var session: String?; var input: Int; var output: Int; var error: String? }

  // Runs `prompt` with the agent's runtime; onDelta streams text, onTool reports tool use; done is called once.
  func start(runtime: String, model: String?, role: String, prompt: String, cwd: String, resume: String?, editAllowed: Bool, extras: RunExtras = RunExtras(),
             onDelta: @escaping (String) -> Void, onTool: @escaping (String, Bool) -> Void, done: @escaping (Result) -> Void) {
    let extras = extras.withHooks(runtime: runtime)
    guard let exe = Shell.which(RUNTIMES.first { $0.id == runtime }?.binary ?? runtime) else {
      done(Result(text: "", session: nil, input: 0, output: 0, error: (RUNTIMES.first { $0.id == runtime }?.name ?? runtime) + " is not installed on this Mac. Open Setup to install it.")); return
    }
    var args: [String] = []
    let usageFile = FileManager.default.temporaryDirectory.appendingPathComponent(id + "-usage.json")
    switch runtime {
    case "claude":
      args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-mode", editAllowed ? "acceptEdits" : "default", "--append-system-prompt", role]
      if let model, !model.isEmpty { args += ["--model", model] }
      if let resume, !resume.isEmpty { args += ["--resume", resume] }
      for d in extras.addDirs { args += ["--add-dir", d] }
      if let schema = extras.jsonSchema { args += ["--json-schema", jsonString(schema)] }
      if extras.noTools { args += ["--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Read", "Glob", "Grep", "Task"] }
    case "codex":
      args = ["exec", "--json", "--skip-git-repo-check", "-C", cwd, "-s", editAllowed && !extras.noTools ? "workspace-write" : "read-only"]
      if let model, !model.isEmpty { args += ["-m", model] }
      for d in extras.addDirs { args += ["--add-dir", d] }
      if let schema = extras.jsonSchema {
        let f = FileManager.default.temporaryDirectory.appendingPathComponent(id + "-schema.json")
        try? jsonString(schema).write(to: f, atomically: true, encoding: .utf8); args += ["--output-schema", f.path]
      }
      args.append(role.isEmpty ? prompt : role + "\n\n" + prompt)
    default:
      args = ["-z", role.isEmpty ? prompt : role + "\n\n" + prompt, "--usage-file", usageFile.path, "--in", cwd]
      if let model, !model.isEmpty { args += ["-m", model] }
    }
    args += RuntimesAPI.runArgs(runtime: runtime)
    // In subscription mode a stray API key (the app's own environment, the key vault) never replaces the subscription.
    let p = Process(); p.executableURL = URL(fileURLWithPath: exe); p.arguments = args; p.environment = RuntimesAPI.scrub(runtime: runtime, Shell.environment.merging(extras.env) { $1 })
    p.currentDirectoryURL = URL(fileURLWithPath: cwd)
    let out = Pipe(), err = Pipe(); p.standardOutput = out; p.standardError = err; p.standardInput = FileHandle.nullDevice
    var result = Result(text: "", session: nil, input: 0, output: 0, error: nil)
    var errText = "", streamed = false
    let lock = NSLock()
    func handle(line: String) {
      guard !line.isEmpty else { return }
      if runtime == "hermes" { result.text += (result.text.isEmpty ? "" : "\n") + line; onDelta((streamed ? "\n" : "") + line); streamed = true; return }
      guard let j = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? J else { return }
      let type = j["type"] as? String ?? ""
      if runtime == "claude" {
        if type == "system", let s = j["session_id"] as? String { result.session = s }
        if type == "stream_event", let ev = j["event"] as? J, ev["type"] as? String == "content_block_delta", let d = ev["delta"] as? J, let t = d["text"] as? String { onDelta(t); streamed = true }
        if type == "assistant", let m = j["message"] as? J, let content = m["content"] as? [J] {
          for c in content {
            if c["type"] as? String == "tool_use", let name = c["name"] as? String { onTool(name, true) }
            if c["type"] as? String == "text", let t = c["text"] as? String, !streamed { onDelta(t) }
          }
        }
        if type == "result" {
          result.text = j["result"] as? String ?? result.text
          if let structured = j["structured_output"], !(structured is NSNull) { result.text = jsonString(structured) }
          if let s = j["session_id"] as? String { result.session = s }
          if let u = j["usage"] as? J { result.input = (u["input_tokens"] as? Int ?? 0) + (u["cache_read_input_tokens"] as? Int ?? 0) + (u["cache_creation_input_tokens"] as? Int ?? 0); result.output = u["output_tokens"] as? Int ?? 0 }
          if (j["is_error"] as? Bool) == true { result.error = (j["result"] as? String) ?? "The agent reported an error." }
        }
      } else {  // codex
        if type == "thread.started", let t = j["thread_id"] as? String { result.session = t }
        if let item = j["item"] as? J {
          let kind = item["type"] as? String ?? ""
          if type == "item.started", kind == "command_execution" || kind == "mcp_tool_call" || kind == "web_search" || kind == "file_change" { onTool(kind == "command_execution" ? "Shell" : kind == "file_change" ? "Edit" : kind == "web_search" ? "WebSearch" : (item["tool"] as? String ?? "Tool"), true) }
          if type == "item.completed", kind == "agent_message", let t = item["text"] as? String { result.text += (result.text.isEmpty ? "" : "\n\n") + t; onDelta((streamed ? "\n\n" : "") + t); streamed = true }
        }
        if type == "turn.completed", let u = j["usage"] as? J { result.input += (u["input_tokens"] as? Int ?? 0); result.output += (u["output_tokens"] as? Int ?? 0) }
        if type == "turn.failed" || type == "error" { result.error = readable(((j["error"] as? J)?["message"] as? String) ?? (j["message"] as? String) ?? "Codex reported an error.") }
      }
    }
    // Output is read to the end on its own threads; the run only finishes once both readers are done (or 3 s after
    // the process exits, for tools that leave a background process holding the pipe).
    let readers = DispatchGroup()
    readers.enter()
    DispatchQueue.global().async {
      let h = out.fileHandleForReading; var buf = Data()
      while true {
        let d = h.availableData; if d.isEmpty { break }
        buf.append(d)
        while let nl = buf.firstIndex(of: 0x0a) {
          let line = String(decoding: buf[buf.startIndex..<nl], as: UTF8.self); buf.removeSubrange(buf.startIndex...nl)
          lock.lock(); handle(line: line.trimmingCharacters(in: .whitespaces)); lock.unlock()
        }
      }
      if !buf.isEmpty { lock.lock(); handle(line: String(decoding: buf, as: UTF8.self).trimmingCharacters(in: .whitespaces)); lock.unlock() }
      readers.leave()
    }
    readers.enter()
    DispatchQueue.global().async { let d = err.fileHandleForReading.readDataToEndOfFile(); lock.lock(); errText = String(decoding: d.suffix(8000), as: UTF8.self); lock.unlock(); readers.leave() }
    p.terminationHandler = { [weak self] proc in
      DispatchQueue.global().async {
        _ = readers.wait(timeout: .now() + 3)
        lock.lock()
        if runtime == "hermes", let d = try? Data(contentsOf: usageFile), let u = (try? JSONSerialization.jsonObject(with: d)) as? J {
          result.input = u["input_tokens"] as? Int ?? u["prompt_tokens"] as? Int ?? 0; result.output = u["output_tokens"] as? Int ?? u["completion_tokens"] as? Int ?? 0
          try? FileManager.default.removeItem(at: usageFile)
        }
        if self?.stopped == true { result.error = "Stopped." }
        else if proc.terminationStatus != 0 && result.error == nil {
          let tail = errText.split(separator: "\n").suffix(3).joined(separator: " ").trimmingCharacters(in: .whitespaces)
          result.error = tail.isEmpty ? "The agent stopped with exit code \(proc.terminationStatus)." : readable(String(tail.prefix(400)))
        }
        let final = result
        lock.unlock()
        done(final)
      }
    }
    do { try p.run(); process = p } catch { done(Result(text: "", session: nil, input: 0, output: 0, error: "Could not start the agent: \(error.localizedDescription)")) }
  }
}

