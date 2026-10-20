// Agent runtimes on the student's Mac: Claude Code, Codex and Hermes Agent, run through their own command-line
// tools (the student signs in to each one once, with their own subscription, or uses an API key instead). The app
// finds them, checks them in the background, and streams their work.
import Foundation
import AppKit

struct Runtime {
  let id: String, name: String, binary: String, docs: String, install: String, login: String
}
let RUNTIMES: [Runtime] = [
  Runtime(id: "claude", name: "Claude Code", binary: "claude", docs: "https://docs.claude.com/en/docs/claude-code/setup",
          install: "curl -fsSL https://claude.ai/install.sh | bash", login: "claude auth login"),
  Runtime(id: "codex", name: "Codex", binary: "codex", docs: "https://github.com/openai/codex",
          install: "if command -v brew >/dev/null; then brew install --cask codex; else npm install -g @openai/codex; fi", login: "codex login"),
  Runtime(id: "hermes", name: "Hermes Agent", binary: "hermes", docs: "https://github.com/NousResearch/hermes-agent",
          install: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash", login: "hermes setup"),
]

enum Shell {
  // Folders where the AI tools usually live; the user's own login-shell PATH is added in the background at launch
  // (apps started from the Dock get a minimal PATH, and reading the shell can take seconds).
  private static let lock = NSLock()
  private static var current: String = merge([])
  static var path: String { lock.lock(); defer { lock.unlock() }; return current }
  private static func merge(_ shell: [String]) -> String {
    let home = NSHomeDirectory()
    var parts = shell + ["\(home)/.local/bin", "/opt/homebrew/bin", "/usr/local/bin", "\(home)/.npm-global/bin", "\(home)/.bun/bin", "\(home)/.volta/bin", "\(home)/.hermes/node/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
    if let nvm = try? FileManager.default.contentsOfDirectory(atPath: "\(home)/.nvm/versions/node") { parts += nvm.sorted().reversed().map { "\(home)/.nvm/versions/node/\($0)/bin" } }
    #if DEBUG
    if let extra = ProcessInfo.processInfo.environment["HQS_EXTRA_PATH"], !extra.isEmpty { parts = extra.split(separator: ":").map(String.init) + parts.filter { !$0.contains("/.local/bin") && !$0.contains("/.hermes/") } }
    #endif
    var seen = Set<String>(); return parts.filter { !$0.isEmpty && seen.insert($0).inserted }.joined(separator: ":")
  }
  static func loadLoginPath() {
    let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/zsh"); p.arguments = ["-lic", "printf '__HQ__%s__HQ__' \"$PATH\""]
    let out = Pipe(); p.standardOutput = out; p.standardError = FileHandle.nullDevice; p.standardInput = FileHandle.nullDevice
    let box = DataBox(), group = DispatchGroup(); group.enter()
    DispatchQueue.global().async { box.data = out.fileHandleForReading.readDataToEndOfFile(); group.leave() }
    guard (try? p.run()) != nil else { return }
    if group.wait(timeout: .now() + 6) == .timedOut { p.terminate(); return }
    let text = String(data: box.data, encoding: .utf8) ?? ""
    guard let r = text.range(of: "__HQ__"), let e = text.range(of: "__HQ__", range: r.upperBound..<text.endIndex) else { return }
    let merged = merge(text[r.upperBound..<e.lowerBound].split(separator: ":").map(String.init))
    lock.lock(); current = merged; lock.unlock()
  }
  static func which(_ name: String) -> String? {
    for dir in path.split(separator: ":") { let f = "\(dir)/\(name)"; if FileManager.default.isExecutableFile(atPath: f) { return f } }
    return nil
  }
  static var environment: [String: String] { var e = ProcessInfo.processInfo.environment; e["PATH"] = path; e["NO_COLOR"] = "1"; e["TERM"] = "dumb"; return e }
  // Runs a short command and returns (exit code, output); used for versions and sign-in checks.
  static func run(_ exe: String, _ args: [String], timeout: Double = 15, env: [String: String]? = nil) -> (Int32, String) {
    let p = Process(); p.executableURL = URL(fileURLWithPath: exe); p.arguments = args; p.environment = env ?? environment
    p.currentDirectoryURL = URL(fileURLWithPath: NSHomeDirectory())
    let out = Pipe(); p.standardOutput = out; p.standardError = out; p.standardInput = FileHandle.nullDevice
    let box = DataBox(), group = DispatchGroup(); group.enter()
    DispatchQueue.global().async { box.data = out.fileHandleForReading.readDataToEndOfFile(); group.leave() }
    guard (try? p.run()) != nil else { return (-1, "") }
    if group.wait(timeout: .now() + timeout) == .timedOut { p.terminate(); return (-2, "timed out") }
    p.waitUntilExit()
    return (p.terminationStatus, String(data: box.data, encoding: .utf8) ?? "")
  }
}
final class DataBox { var data = Data() }
// Tools sometimes wrap an API error as JSON inside the message; show the human sentence.
func readable(_ message: String) -> String {
  var text = message.trimmingCharacters(in: .whitespacesAndNewlines)
  for _ in 0..<3 {
    guard text.hasPrefix("{"), let j = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? J else { break }
    if let inner = (j["error"] as? J)?["message"] as? String { text = inner } else if let inner = j["message"] as? String { text = inner } else if let inner = j["error"] as? String { text = inner } else { break }
  }
  return text
}

// What each tool says about itself (installed, version, signed in, which account), checked in the background and
// cached; pages always get the last known state at once. The status a page sees adds the student's own choices on
// top (subscription or API key, a sign-in or install in progress), so a choice shows without asking the tool again.
enum Agents {
  private static let lock = NSLock()
  private static var facts: [String: J] = [:]
  private static var checkedAt = 0.0
  private static var flight: DispatchGroup?
  private static func locked<T>(_ body: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return body() }

  // force: check every tool now. wait: check now only when nothing is known yet (the very first call). Otherwise the
  // cached state comes back at once and a check older than a minute is refreshed in the background.
  static func detect(force: Bool = false, wait: Bool = false) -> [J] {
    if force { checkAll(); return snapshot() }
    let (known, age) = locked { (!facts.isEmpty, now() - checkedAt) }
    if known { if age >= 60 { refreshInBackground() }; return snapshot() }
    if wait { checkAll(); return snapshot() }
    refreshInBackground()
    return snapshot()
  }
  static func refreshInBackground() { DispatchQueue.global().async { checkAll(waitIfRunning: false) } }
  static func ready(_ id: String) -> Bool { detect().contains { ($0["id"] as? String) == id && ($0["ready"] as? Bool) == true } }
  // The current status of one tool (from the cache; no check).
  static func status(_ id: String) -> J { snapshot().first { ($0["id"] as? String) == id } ?? [:] }

  // Checks every tool at once (one check at a time: a second caller waits for the running one).
  private static func checkAll(waitIfRunning: Bool = true) {
    let (running, group): (DispatchGroup?, DispatchGroup?) = locked {
      if let f = flight { return (f, nil) }
      let g = DispatchGroup(); g.enter(); flight = g; return (nil, g)
    }
    if let running { if waitIfRunning { running.wait() }; return }
    let previous = locked { facts }
    var results = [J?](repeating: nil, count: RUNTIMES.count)
    let rl = NSLock()
    DispatchQueue.concurrentPerform(iterations: RUNTIMES.count) { i in
      let f = check(RUNTIMES[i], previous: previous[RUNTIMES[i].id]); rl.lock(); results[i] = f; rl.unlock()
    }
    var changed = false
    locked {
      for (i, f) in results.enumerated() { if let f { if differs(facts[RUNTIMES[i].id], f) { changed = true }; facts[RUNTIMES[i].id] = f } }
      checkedAt = now(); flight = nil
    }
    group?.leave()
    if changed { Store.shared.emit("connector.updated", ["title": "AI tools"]) }
  }
  // Checks one tool now (used while a sign-in or install is in progress) and returns its new status.
  @discardableResult static func refresh(_ id: String) -> J {
    guard let r = RUNTIMES.first(where: { $0.id == id }) else { return [:] }
    let f = check(r, previous: locked { facts[id] })
    let changed = locked { () -> Bool in let c = differs(facts[id], f); facts[id] = f; return c }
    let s = status(id)
    if changed { Store.shared.emit("connector.updated", ["title": r.name, "runtime": id, "state": s["state"] ?? "", "ready": s["ready"] ?? false]) }
    return s
  }
  private static func differs(_ a: J?, _ b: J) -> Bool {
    guard let a else { return true }
    return ["installed", "signedIn", "method", "account", "version"].contains { k in String(describing: a[k] ?? "") != String(describing: b[k] ?? "") }
  }
  private static func snapshot() -> [J] { let f = locked { facts }; return RUNTIMES.map { compose($0, f[$0.id]) } }

  // MARK: what a page sees
  private static func compose(_ r: Runtime, _ f: J?) -> J {
    let installed = (f?["installed"] as? Bool) ?? (Shell.which(r.binary) != nil)
    let checking = f == nil && installed
    let signedIn = (f?["signedIn"] as? Bool) == true
    let mode = RuntimesAPI.mode(r.id), hasKey = RuntimesAPI.hasKey(r.id), pending = RuntimesAPI.pending(r.id), key = RuntimesAPI.keyInfo(r.id)
    let keyMode = mode == "api-key" && hasKey
    let ready = installed && !checking && (keyMode || signedIn)
    let cliMethod = f?["method"] as? String ?? "none", cliAccount = signedIn ? (f?["account"] as? String ?? "") : ""
    let method = !ready ? "none" : keyMode ? "api-key" : cliMethod == "none" ? "subscription" : cliMethod
    let state = !installed ? (pending == "install" ? "installing" : "not installed") : checking ? "checking" : ready ? "ready" : pending == "login" ? "signing in" : "sign in needed"
    var note = ""
    switch state {
    case "not installed": note = "Click Install: Terminal opens with the official installer. This page notices by itself when it is done."
    case "installing": note = "Installing in Terminal. Follow the steps there; this page updates by itself."
    case "signing in": note = r.id == "hermes" ? "Choose your model provider in Terminal. This page updates by itself when it is set up." : "Finish the sign-in in Terminal (your browser may open). This page updates by itself."
    case "sign in needed": note = r.id == "hermes" ? "Set it up once: click Sign in, then choose your model provider in Terminal." : "Sign in once with your own subscription: click Sign in, then follow the steps in Terminal."
    case "checking": note = "Checking…"
    default: note = ""
    }
    if mode == "api-key" && !hasKey && installed { note += (note.isEmpty ? "" : " ") + "API-key mode is on but no key is saved: your agents use your subscription." }
    // "Your API key" means the key saved in this app (API-key mode); a tool's own sign-in keeps its own name.
    let methodLabel = !ready ? "" : keyMode ? "Your API key" : r.id == "claude" ? (cliMethod == "api-key" ? "Your Claude Code sign-in (API key)" : "Your Claude subscription")
      : r.id == "codex" ? (cliAccount == "ChatGPT" ? "Your ChatGPT account" : "Your Codex sign-in") : "Your Hermes provider"
    return ["id": r.id, "name": r.name, "installed": installed, "path": orNull(f?["path"]), "version": f?["version"] as? String ?? "", "ready": ready, "state": state, "note": note,
            "method": method, "methodLabel": methodLabel, "account": keyMode ? key.label + " (in your Keychain)" : cliAccount,
            "signedIn": signedIn, "subscriptionAccount": cliAccount, "mode": mode, "hasKey": hasKey, "pending": orNull(pending),
            "key": ["label": key.label, "env": key.env, "prefix": key.prefix, "link": key.link, "provider": key.provider, "pattern": key.pattern],
            "checkedAt": orNull(f?["checkedAt"]), "docs": r.docs, "install": r.install, "login": r.login]
  }

  // MARK: asking each tool
  // facts: installed, path, version, signedIn, method (subscription | api-key | none), account, checkedAt.
  static func check(_ r: Runtime, previous: J? = nil) -> J {
    guard let exe = Shell.which(r.binary) else { return ["installed": false, "signedIn": false, "method": "none", "account": "", "checkedAt": now()] }
    // The same environment a run gets in subscription mode (a stray key in the app's environment would hide the real sign-in).
    let env = RuntimesAPI.scrub(runtime: r.id, Shell.environment, keyMode: false)
    var version = (previous?["path"] as? String) == exe ? (previous?["version"] as? String ?? "") : ""
    if version.isEmpty {
      let (vcode, vout) = Shell.run(exe, ["--version"], timeout: 10, env: env)
      if vcode == 0 { version = vout.split(separator: "\n").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? "" }
    }
    var s: (signedIn: Bool, method: String, account: String)
    switch r.id {
    case "claude":
      var (c, o) = Shell.run(exe, ["auth", "status", "--json"], timeout: 15, env: env)
      if !o.contains("{") && o.lowercased().contains("unknown option") { (c, o) = Shell.run(exe, ["auth", "status"], timeout: 15, env: env) }
      s = parseClaude(c, o)
    case "codex":
      let (c, o) = Shell.run(exe, ["login", "status"], timeout: 15, env: env)
      s = parseCodex(c, o)
    default:
      s = hermes(exe, env: env)
    }
    return ["installed": true, "path": exe, "version": version, "signedIn": s.signedIn, "method": s.signedIn ? s.method : "none", "account": s.signedIn ? s.account : "", "checkedAt": now()]
  }

  // `claude auth status` prints JSON (--json is the default in current versions): {loggedIn, authMethod ("claude.ai",
  // "api_key", "none", …), apiProvider, apiKeySource?, email?, orgName?, subscriptionType?}. Older versions print text:
  // "Login: …", "Organization: …", "Email: …" or "Not logged in. Run claude auth login to authenticate."
  static func parseClaude(_ code: Int32, _ out: String) -> (signedIn: Bool, method: String, account: String) {
    if let start = out.firstIndex(of: "{"), let end = out.lastIndex(of: "}"), start < end,
       let j = (try? JSONSerialization.jsonObject(with: Data(out[start...end].utf8))) as? J, let li = j["loggedIn"] as? Bool {
      guard li else { return (false, "none", "") }
      let auth = (j["authMethod"] as? String ?? "").lowercased()
      let method = auth == "api_key" || auth == "apikey" || (auth.isEmpty && j["apiKeySource"] != nil) ? "api-key" : "subscription"
      let pick = { (k: String) -> String? in (j[k] as? String).flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 } }
      var parts: [String] = []
      if let who = pick("email") ?? pick("orgName") { parts.append(who) }
      if let plan = pick("subscriptionType") { parts.append("Claude " + plan.prefix(1).uppercased() + plan.dropFirst()) }
      if parts.isEmpty { parts.append(method == "api-key" ? "API key" + (pick("apiKeySource").map { " (\($0))" } ?? "") : auth == "claude.ai" ? "Claude account" : auth.isEmpty ? "Signed in" : auth) }
      return (true, method, parts.joined(separator: " · "))
    }
    let lower = out.lowercased()
    let li = code == 0 && !lower.contains("not logged in") && !lower.contains("not signed in") && !lower.contains("unknown command")
    guard li else { return (false, "none", "") }
    var email = "", org = "", login = ""
    for line in out.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }) {
      if line.hasPrefix("Email:") { email = line.dropFirst(6).trimmingCharacters(in: .whitespaces) }
      if line.hasPrefix("Organization:") { org = line.dropFirst(13).trimmingCharacters(in: .whitespaces) }
      if line.hasPrefix("Login:") { login = line.dropFirst(6).trimmingCharacters(in: .whitespaces) }
    }
    let method = login.lowercased().contains("api key") ? "api-key" : "subscription"
    let who = !email.isEmpty ? email : !org.isEmpty ? org : (method == "api-key" ? "API key" : "Claude account")
    return (true, method, who)
  }

  // `codex login status`: "Logged in using ChatGPT", "Logged in using an API key - sk-…" (the key part is never
  // kept), "Logged in using access token" …, or "Not logged in" (exit code 1).
  static func parseCodex(_ code: Int32, _ out: String) -> (signedIn: Bool, method: String, account: String) {
    guard !out.contains("Not logged in"), let line = out.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }).first(where: { $0.hasPrefix("Logged in using") }) else { return (false, "none", "") }
    let how = line.dropFirst("Logged in using".count).components(separatedBy: " - ")[0].trimmingCharacters(in: .whitespaces)
    if how.lowercased().contains("api key") { return (true, "api-key", how.lowercased().contains("bedrock") ? "Amazon Bedrock API key" : "API key") }
    if how == "ChatGPT" { return (true, "subscription", "ChatGPT") }
    return (true, "subscription", how.isEmpty ? "Signed in" : how.prefix(1).uppercased() + how.dropFirst())
  }

  // Hermes keeps its provider in ~/.hermes/config.yaml (model.provider, model.default). When a provider is set,
  // `hermes auth status <provider>` says "<provider>: logged in" (with "  auth_type: oauth" for an account login) or
  // "<provider>: logged out (…)". Without a provider (auto) or when that fails, a Hermes setup on disk counts.
  private static func hermes(_ exe: String, env: [String: String]) -> (signedIn: Bool, method: String, account: String) {
    let cfg = hermesConfig()
    let label = { (p: String) -> String in ([hermesProviderName(p), cfg.model].filter { !$0.isEmpty }).joined(separator: " · ") }
    let p = cfg.provider.lowercased()
    if !p.isEmpty && p != "auto" && !p.hasPrefix("custom") {
      let (_, o) = Shell.run(exe, ["auth", "status", p], timeout: 20, env: env)
      for raw in o.split(separator: "\n") where raw.lowercased().hasPrefix(p + ":") {
        let rest = raw.dropFirst(p.count + 1).trimmingCharacters(in: .whitespaces).lowercased()
        if rest.hasPrefix("logged out") { return (false, "none", "") }
        let oauth = o.lowercased().contains("auth_type: oauth") || o.lowercased().contains("auth_type: device")
        return (true, oauth ? "subscription" : "api-key", label(p))
      }
    }
    let home = Paths.home
    let envFile = (try? String(contentsOfFile: home + "/.hermes/.env", encoding: .utf8)) ?? ""
    let keyNames = envFile.split(separator: "\n").compactMap { line -> String? in
      let t = line.trimmingCharacters(in: .whitespaces); guard !t.hasPrefix("#"), let eq = t.firstIndex(of: "=") else { return nil }
      let name = String(t[..<eq]).replacingOccurrences(of: "export ", with: ""), value = t[t.index(after: eq)...].trimmingCharacters(in: CharacterSet(charactersIn: " \"'"))
      return name.hasSuffix("_API_KEY") && !value.isEmpty ? name : nil
    }
    let hasConfig = FileManager.default.fileExists(atPath: home + "/.hermes/config.yaml"), hasAuth = FileManager.default.fileExists(atPath: home + "/.hermes/auth.json")
    guard hasConfig || !keyNames.isEmpty || hasAuth else { return (false, "none", "") }
    let provider = !p.isEmpty && p != "auto" ? p : keyNames.first.map { $0.replacingOccurrences(of: "_API_KEY", with: "").lowercased() } ?? ""
    return (true, !keyNames.isEmpty && !hasAuth ? "api-key" : "subscription", provider.isEmpty ? (cfg.model.isEmpty ? "Hermes setup found" : cfg.model) : label(provider))
  }
  // model.provider and model.default from Hermes' config (a small reader for this one block; no YAML library).
  static func hermesConfig() -> (provider: String, model: String) {
    guard let text = try? String(contentsOfFile: Paths.home + "/.hermes/config.yaml", encoding: .utf8) else { return ("", "") }
    func clean(_ s: Substring) -> String {
      var v = String(s); if let hash = v.range(of: " #") { v = String(v[..<hash.lowerBound]) }
      return v.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
    }
    var inModel = false, provider = "", model = ""
    for raw in text.components(separatedBy: .newlines) {
      let line = raw.replacingOccurrences(of: "\t", with: "  "), t = line.trimmingCharacters(in: .whitespaces)
      if t.isEmpty || t.hasPrefix("#") { continue }
      if !line.hasPrefix(" ") {
        inModel = t.hasPrefix("model:")
        if inModel, case let v = clean(t.dropFirst(6)), !v.isEmpty { model = v; inModel = false }
        continue
      }
      guard inModel else { continue }
      if t.hasPrefix("provider:") { provider = clean(t.dropFirst(9)) } else if t.hasPrefix("default:") { model = clean(t.dropFirst(8)) }
    }
    return (provider, model)
  }
  static func hermesProviderName(_ p: String) -> String {
    let names = ["openrouter": "OpenRouter", "nous": "Nous Portal", "anthropic": "Anthropic", "openai": "OpenAI", "openai-codex": "ChatGPT (Codex)", "copilot": "GitHub Copilot",
                 "gemini": "Google Gemini", "google": "Google Gemini", "zai": "Z.ai", "kimi-coding": "Kimi", "minimax": "MiniMax", "xai": "xAI", "deepseek": "DeepSeek", "custom": "Custom endpoint"]
    return names[p.lowercased()] ?? (p.isEmpty ? "" : p.prefix(1).uppercased() + p.dropFirst())
  }
}

// One click in Setup: the official install or sign-in command opens in Terminal, where the student sees every step.
// The app checks by itself while it runs (RuntimesAPI.start), so the student only closes the window when it is done.
enum TerminalStep {
  static func open(runtime: String, step: String) throws -> J {
    guard let r = RUNTIMES.first(where: { $0.id == runtime }) else { throw APIError(404, "not_found", "Unknown AI tool.") }
    let command = step == "install" ? r.install : r.login
    let dir = supportDir.appendingPathComponent("scripts", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent("\(r.id)-\(step).command")
    let script = """
    #!/bin/zsh -l
    clear
    echo "187N Agent HQ · \(r.name): \(step == "install" ? "install" : "sign in")"
    echo
    \(command)
    echo
    echo "\(step == "install" ? "When the installer is finished, you can close this window. 187N Agent HQ notices by itself and shows Sign in next." : "When you are signed in, you can close this window. 187N Agent HQ notices by itself.")"
    """
    try script.write(to: file, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path)
    if !Paths.noTerminal { DispatchQueue.main.async { NSWorkspace.shared.open(file) } }
    return ["ok": true, "command": command]
  }
}
