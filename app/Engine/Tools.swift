// Add any tool: MCP servers, a vault of named API keys and skill folders, for Claude Code, Codex and Hermes Agent.
// An MCP server goes into each AI tool's own settings: Claude Code through its own command, Codex as a block in
// ~/.codex/config.toml, Hermes as a block under mcp_servers in ~/.hermes/config.yaml with its secrets in ~/.hermes/.env.
// Each file is backed up once (.187n-backup) and every block the app writes is fenced by marker comments, so Remove
// takes out exactly that block and leaves the rest of the file byte for byte as it was.
// Secrets (a key, a command's environment values) live in the Keychain as vault:<NAME>; the registry (DocStore
// "tools") keeps names only. Vault keys reach every agent run the app starts as environment variables.
import Foundation

// MARK: - One MCP server, the way the AI tools need it

struct MCPSpec {
  struct Header { var name: String; var prefix: String; var envVar: String; var value: String }
  var name: String              // the name in each tool's settings, e.g. 187n-linear
  var kind: String              // "http" or "stdio"
  var url = ""
  var headers: [Header] = []
  var command = ""
  var args: [String] = []
  var env: [(name: String, value: String)] = []
  var secrets: [String] { headers.map(\.value) + env.map(\.value) }
}

// MARK: - The writers (shared with AgentApps, which adds the student's Composio apps the same way)

enum MCPConfig {
  static let tools = ["claude", "codex", "hermes"]
  static let toolNames = ["claude": "Claude Code", "codex": "Codex", "hermes": "Hermes Agent"]
  static let lock = NSRecursiveLock()
  static var home: String { Paths.home }
  static var codexFile: String { home + "/.codex/config.toml" }
  static var hermesFile: String { home + "/.hermes/config.yaml" }
  static var hermesEnvFile: String { home + "/.hermes/.env" }
  // Env lines an earlier version of the app wrote without tracking them.
  static let legacyEnv = ["COMPOSIO_MCP_API_KEY"]

  // Marker comments around every block the app writes. "nl": the app ended the file's last line to append the block.
  static let tag = "# 187N Agent HQ"
  static func markPrefix(_ name: String) -> String { tag + ": " + name + " ·" }
  static func startMark(_ name: String, nl: Bool = false) -> String { markPrefix(name) + " managed by the app" + (nl ? " · nl" : "") }
  static func endMark(_ name: String) -> String { "# end 187N Agent HQ: " + name }

  static func read(_ path: String) -> String { (try? String(contentsOfFile: path, encoding: .utf8)) ?? "" }
  static func lines(_ text: String) -> [String] { text.components(separatedBy: "\n") }
  static func blank(_ s: String) -> Bool { s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  static func lead(_ s: String) -> Int { s.prefix { $0 == " " }.count }

  // Writes a file atomically and keeps its permissions (or uses `mode` for a new file).
  static func save(_ path: String, _ text: String, mode: Int? = nil) throws {
    let fm = FileManager.default
    let old = (try? fm.attributesOfItem(atPath: path))?[.posixPermissions] as? Int
    let tmp = path + ".187n-tmp"
    try? fm.removeItem(atPath: tmp)
    guard fm.createFile(atPath: tmp, contents: Data(text.utf8), attributes: [.posixPermissions: mode ?? old ?? 0o644]) else { throw APIError(500, "write_failed", "Could not save \((path as NSString).lastPathComponent).") }
    if rename(tmp, path) != 0 { try? fm.removeItem(atPath: tmp); throw APIError(500, "write_failed", "Could not save \((path as NSString).lastPathComponent).") }
    if let mode { try? fm.setAttributes([.posixPermissions: mode], ofItemAtPath: path) }
  }
  // Once, before the app's first change: a copy of the file as the student had it (never one with the app's blocks in it).
  static func backup(_ path: String) {
    let b = path + ".187n-backup"
    guard FileManager.default.fileExists(atPath: path), !FileManager.default.fileExists(atPath: b), !read(path).contains(tag) else { return }
    try? FileManager.default.copyItem(atPath: path, toPath: b)
  }
  // A double-quoted string that TOML and YAML read the same way.
  static func quoted(_ s: String) -> String {
    var o = "\""
    for u in s.unicodeScalars {
      switch u {
      case "\\": o += "\\\\"
      case "\"": o += "\\\""
      case "\n": o += "\\n"
      case "\r": o += "\\r"
      case "\t": o += "\\t"
      default:
        if u.value < 0x20 || u.value == 0x7F || u.value == 0x85 || u.value == 0x2028 || u.value == 0x2029 { o += String(format: "\\u%04X", u.value) } else { o.unicodeScalars.append(u) }
      }
    }
    return o + "\""
  }
  // Secrets never travel in a message: a tool's error output is cleaned first.
  static func scrub(_ text: String, _ secrets: [String]) -> String {
    secrets.filter { $0.count >= 4 }.reduce(text) { $0.replacingOccurrences(of: $1, with: "•••") }
  }

  // Is it in this tool's settings now?
  static func present(_ name: String, in tool: String) -> Bool {
    switch tool {
    case "claude": return Skills.claudeMCP().contains { $0["name"] as? String == name }
    case "codex": return Skills.tomlMCP(codexFile).contains { $0["name"] as? String == name }
    default: return Skills.yamlMCP(hermesFile).contains { $0["name"] as? String == name }
    }
  }
  static func status(_ name: String) -> [String: Bool] { Dictionary(uniqueKeysWithValues: tools.map { ($0, present(name, in: $0)) }) }
  // In this tool's settings, but not put there by the app.
  static func foreign(_ name: String, in tool: String) -> Bool {
    switch tool {
    case "claude": return present(name, in: "claude")
    case "codex": return present(name, in: "codex") && !read(codexFile).contains(markPrefix(name))
    default: return present(name, in: "hermes") && !read(hermesFile).contains(markPrefix(name))
    }
  }

  static func write(_ s: MCPSpec, to tool: String) throws {
    lock.lock(); defer { lock.unlock() }
    switch tool {
    case "claude": try claudeWrite(s)
    case "codex": try codexWrite(s)
    default: try hermesWrite(s)
    }
  }
  static func remove(_ name: String, from tool: String) throws {
    lock.lock(); defer { lock.unlock() }
    switch tool {
    case "claude":
      guard present(name, in: "claude") else { return }
      guard let exe = Shell.which("claude") else { throw APIError(422, "missing", "Claude Code is not installed, so the app cannot take it out there.") }
      let (code, out) = Shell.run(exe, ["mcp", "remove", "--scope", "user", name], timeout: 20)
      if code != 0 && present(name, in: "claude") { throw APIError(502, "claude", "Claude Code did not remove it: " + String(out.prefix(160))) }
    case "codex":
      let text = read(codexFile)
      let next = tomlRemove(text, name)
      if next != text { try saveOrDrop(codexFile, next) }
    default:
      let text = read(hermesFile)
      let next = yamlRemove(text, name)
      if next != text { try saveOrDrop(hermesFile, next) }
      try hermesEnvSync()
    }
  }
  // A settings file the app created itself (there was nothing to back up) goes away again once it is empty.
  static func saveOrDrop(_ path: String, _ text: String) throws {
    if text.isEmpty && !FileManager.default.fileExists(atPath: path + ".187n-backup") { try? FileManager.default.removeItem(atPath: path); return }
    try save(path, text)
  }

  // MARK: Claude Code: its own command, no shell involved.
  static func claudeWrite(_ s: MCPSpec) throws {
    guard let exe = Shell.which("claude") else { throw APIError(422, "missing", "Claude Code is not installed.") }
    _ = Shell.run(exe, ["mcp", "remove", "--scope", "user", s.name], timeout: 20)
    var cfg: J
    if s.kind == "http" {
      cfg = ["type": "http", "url": s.url]
      if !s.headers.isEmpty { cfg["headers"] = Dictionary(s.headers.map { ($0.name, $0.prefix + $0.value) }, uniquingKeysWith: { $1 }) }
    } else {
      cfg = ["type": "stdio", "command": s.command, "args": s.args, "env": Dictionary(s.env.map { ($0.name, $0.value) }, uniquingKeysWith: { $1 })]
    }
    let (code, out) = Shell.run(exe, ["mcp", "add-json", "--scope", "user", s.name, jsonString(cfg)], timeout: 30)
    if code != 0 { throw APIError(502, "claude", "Claude Code did not accept this tool: " + scrub(String(out.prefix(200)), s.secrets)) }
  }

  // MARK: Codex: a [mcp_servers.<name>] block in ~/.codex/config.toml.
  static func tomlBlock(_ s: MCPSpec, nl: Bool) -> [String] {
    var l = [startMark(s.name, nl: nl), "[mcp_servers.\(s.name)]"]
    if s.kind == "http" {
      l.append("url = " + quoted(s.url))
      if !s.headers.isEmpty { l.append("http_headers = { " + s.headers.map { quoted($0.name) + " = " + quoted($0.prefix + $0.value) }.joined(separator: ", ") + " }") }
      l += ["startup_timeout_sec = 20", "tool_timeout_sec = 120"]
    } else {
      l.append("command = " + quoted(s.command))
      l.append("args = [" + s.args.map(quoted).joined(separator: ", ") + "]")
      if !s.env.isEmpty { l.append("env = { " + s.env.map { quoted($0.name) + " = " + quoted($0.value) }.joined(separator: ", ") + " }") }
      l += ["startup_timeout_sec = 60", "tool_timeout_sec = 120"]
    }
    l.append(endMark(s.name))
    return l
  }
  static func tomlRemove(_ text: String, _ name: String) -> String {
    var ls = lines(text)
    if let s = ls.firstIndex(where: { $0.hasPrefix(markPrefix(name)) }), let e = ls[s...].firstIndex(where: { $0 == endMark(name) }) {
      let nl = ls[s].hasSuffix(" · nl")
      ls.removeSubrange(s...e)
      var at = s
      if at > 0 && blank(ls[at - 1]) { ls.remove(at: at - 1); at -= 1 }   // the empty line the app put before the block
      if nl && at > 0 && at == ls.count - 1 && ls[at].isEmpty { ls.removeLast() }
      // Another block of the app follows: it now carries "the app ended the file's last line" for the next Remove.
      else if nl, let n = ls[at...].firstIndex(where: { $0.hasPrefix(tag + ": ") && $0.contains(" · managed by the app") }), !ls[n].hasSuffix(" · nl") { ls[n] += " · nl" }
      return ls.joined(separator: "\n")
    }
    // Not marked (an older version of the app wrote it, or the file was rewritten): the table and its sub-tables.
    guard ls.contains(where: { $0.trimmingCharacters(in: .whitespaces).hasPrefix("[mcp_servers.\(name)") || $0.trimmingCharacters(in: .whitespaces).hasPrefix("[mcp_servers.\"\(name)\"") }) else { return text }
    var out: [String] = [], skipping = false
    for line in ls {
      let t = line.trimmingCharacters(in: .whitespaces)
      if t.hasPrefix("[") { skipping = t == "[mcp_servers.\(name)]" || t == "[mcp_servers.\"\(name)\"]" || t.hasPrefix("[mcp_servers.\(name).") || t.hasPrefix("[mcp_servers.\"\(name)\".") }
      if !skipping { out.append(line) }
    }
    return out.joined(separator: "\n")
  }
  static func codexWrite(_ s: MCPSpec) throws {
    try FileManager.default.createDirectory(atPath: (codexFile as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    let text = read(codexFile)
    if text.range(of: #"(?m)^[ \t]*mcp_servers[ \t]*="#, options: .regularExpression) != nil {
      throw APIError(422, "codex_format", "Codex lists its MCP servers in a form the app cannot change safely. Add this one with `codex mcp add` instead.")
    }
    backup(codexFile)
    var out = tomlRemove(text, s.name), nl = false
    if !out.isEmpty && !out.hasSuffix("\n") { out += "\n"; nl = true }
    if !out.isEmpty { out += "\n" }
    out += tomlBlock(s, nl: nl).joined(separator: "\n") + "\n"
    try save(codexFile, out)
  }

  // MARK: Hermes: a block under mcp_servers in ~/.hermes/config.yaml; secrets as ${VAR} from ~/.hermes/.env.
  static func yamlBlock(_ s: MCPSpec, pad: String) -> [String] {
    var l = [pad + startMark(s.name), pad + s.name + ":"]
    if s.kind == "http" {
      l.append(pad + "  url: " + quoted(s.url))
      if !s.headers.isEmpty { l.append(pad + "  headers:"); l += s.headers.map { pad + "    " + quoted($0.name) + ": " + quoted($0.prefix + "${" + $0.envVar + "}") } }
    } else {
      l.append(pad + "  command: " + quoted(s.command))
      l.append(pad + "  args: [" + s.args.map(quoted).joined(separator: ", ") + "]")
      if !s.env.isEmpty { l.append(pad + "  env:"); l += s.env.map { pad + "    " + $0.name + ": " + quoted("${" + $0.name + "}") } }
    }
    l += [pad + "  enabled: true", pad + "  timeout: 300", pad + endMark(s.name)]
    return l
  }
  static func isServersKey(_ line: String) -> Bool { line.hasPrefix("mcp_servers:") }
  static func yamlInsert(_ text: String, _ s: MCPSpec) throws -> String {
    var ls = lines(text)
    if let i = ls.firstIndex(where: isServersKey) {
      let rest = String(ls[i].dropFirst("mcp_servers:".count)).trimmingCharacters(in: .whitespaces)
      if !rest.isEmpty && !rest.hasPrefix("#") {
        let value = rest.components(separatedBy: "#")[0].trimmingCharacters(in: .whitespaces)
        guard ["{}", "[]", "null", "~", "Null", "NULL"].contains(value) else {
          throw APIError(422, "hermes_format", "Hermes lists its MCP servers in a form the app cannot change safely. Add this one in Hermes instead.")
        }
        ls[i] = "mcp_servers: " + tag + " · was: " + rest
      }
      let child = ls[(i + 1)...].first { !blank($0) && !$0.trimmingCharacters(in: .whitespaces).hasPrefix("#") }
      let ind = child.map(lead) ?? 0
      ls.insert(contentsOf: yamlBlock(s, pad: String(repeating: " ", count: ind > 0 ? ind : 2)), at: i + 1)
      return ls.joined(separator: "\n")
    }
    var out = text, nl = false
    if !out.isEmpty && !out.hasSuffix("\n") { out += "\n"; nl = true }
    return out + "mcp_servers: " + tag + " · added" + (nl ? " · nl" : "") + "\n" + yamlBlock(s, pad: "  ").joined(separator: "\n") + "\n"
  }
  static func yamlRemove(_ text: String, _ name: String) -> String {
    var ls = lines(text)
    if let s = ls.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces).hasPrefix(markPrefix(name)) }),
       let e = ls[s...].firstIndex(where: { $0.trimmingCharacters(in: .whitespaces) == endMark(name) }) {
      ls.removeSubrange(s...e)
    } else {
      // Not marked (an older version of the app): the key and everything indented below it, inside mcp_servers.
      guard let i = ls.firstIndex(where: isServersKey) else { return text }
      var out = Array(ls[...i]), skip: Int? = nil, done = false
      for line in ls[(i + 1)...] {
        if done { out.append(line); continue }
        let ld = lead(line), t = line.trimmingCharacters(in: .whitespaces)
        if let sk = skip { if t.isEmpty || ld > sk { continue }; skip = nil }
        if ld == 0 && !t.isEmpty && !t.hasPrefix("#") { done = true; out.append(line); continue }
        if ld > 0 && (t == name + ":" || t == "\"" + name + "\":") { skip = ld; continue }
        out.append(line)
      }
      if out == ls { return text }
      ls = out
    }
    // The mcp_servers line the app added or changed goes back once no server is left under it.
    if let i = ls.firstIndex(where: { isServersKey($0) && $0.contains(tag + " ·") }) {
      let child = ls[(i + 1)...].first { !blank($0) && !$0.trimmingCharacters(in: .whitespaces).hasPrefix("#") }
      if (child.map(lead) ?? 0) == 0 {
        if let r = ls[i].range(of: tag + " · was: ") { ls[i] = "mcp_servers: " + ls[i][r.upperBound...] }
        else if ls[i].contains(tag + " · added") {
          let nl = ls[i].contains(" · nl")
          ls.remove(at: i)
          if nl && i > 0 && i == ls.count - 1 && ls[i].isEmpty { ls.removeLast() }
        }
      }
    }
    return ls.joined(separator: "\n")
  }
  static func hermesWrite(_ s: MCPSpec) throws {
    guard FileManager.default.fileExists(atPath: (hermesFile as NSString).deletingLastPathComponent) else { throw APIError(422, "missing", "Hermes Agent is not set up yet. Open Setup › Agents first.") }
    let vars = s.headers.map { ($0.envVar, $0.value) } + s.env.map { ($0.name, $0.value) }
    try hermesEnvCheck(vars)
    let text = read(hermesFile)
    let next = try yamlInsert(yamlRemove(text, s.name), s)
    backup(hermesFile)
    try hermesEnvSet(vars)
    try save(hermesFile, next)
  }

  // MARK: Hermes .env: the lines the app wrote are tracked, so they leave again with the last tool that needs them.
  static var envState: J {
    get { ToolsAPI.docs.value("hermesEnv") as? J ?? [:] }
    set { ToolsAPI.docs.setValue("hermesEnv", newValue) }
  }
  static func envKey(_ line: String) -> String? {
    var t = line.trimmingCharacters(in: .whitespaces)
    if t.isEmpty || t.hasPrefix("#") { return nil }
    if t.hasPrefix("export ") { t = String(t.dropFirst(7)).trimmingCharacters(in: .whitespaces) }
    guard let eq = t.firstIndex(of: "=") else { return nil }
    return t[..<eq].trimmingCharacters(in: .whitespaces)
  }
  static func envValue(_ line: String) -> String {
    guard let eq = line.firstIndex(of: "=") else { return "" }
    var v = line[line.index(after: eq)...].trimmingCharacters(in: .whitespaces)
    if v.count >= 2, let f = v.first, (f == "\"" || f == "'"), v.last == f { v = String(v.dropFirst().dropLast()); if f == "\"" { v = v.replacingOccurrences(of: "\\\"", with: "\"").replacingOccurrences(of: "\\\\", with: "\\") } }
    return v
  }
  static func envLine(_ k: String, _ v: String) -> String {
    if v.range(of: #"^[A-Za-z0-9_\-.:/+=@,~%]*$"#, options: .regularExpression) != nil { return k + "=" + v }
    if !v.contains("'") && !v.contains("\n") { return k + "='" + v + "'" }
    return k + "=\"" + v.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n") + "\""
  }
  static func managedEnv() -> [String] { envState["managed"] as? [String] ?? [] }
  // The student's own .env line under the same name, with another value, stays theirs: refuse instead of overwriting.
  static func hermesEnvCheck(_ vars: [(String, String)]) throws {
    let managed = managedEnv(), ls = lines(read(hermesEnvFile))
    for (k, v) in vars where !managed.contains(k) && !legacyEnv.contains(k) {
      if let line = ls.first(where: { envKey($0) == k }), envValue(line) != v {
        throw APIError(409, "env_taken", "Hermes already has \(k) in ~/.hermes/.env with another value. Remove that line there, or use another name.")
      }
    }
  }
  static func hermesEnvSet(_ vars: [(String, String)]) throws {
    guard !vars.isEmpty else { return }
    var st = envState, managed = st["managed"] as? [String] ?? []
    let exists = FileManager.default.fileExists(atPath: hermesEnvFile)
    let text = read(hermesEnvFile)
    var ls = text.isEmpty ? [] : lines(text)
    for (k, v) in vars {
      if let i = ls.firstIndex(where: { envKey($0) == k }) {
        if managed.contains(k) || legacyEnv.contains(k) { ls[i] = envLine(k, v); if !managed.contains(k) { managed.append(k) } }
        continue   // otherwise: the student's own line, with this same value
      }
      if managed.isEmpty { st["created"] = !exists; st["nl"] = false }
      if ls.isEmpty { ls = [envLine(k, v), ""] }
      else if ls.last == "" { ls.insert(envLine(k, v), at: ls.count - 1) }
      else { ls += [envLine(k, v), ""]; if managed.isEmpty { st["nl"] = true } }
      managed.append(k)
    }
    st["managed"] = managed; envState = st
    try save(hermesEnvFile, ls.joined(separator: "\n"), mode: 0o600)
  }
  // Takes out the .env lines the app wrote that nothing in config.yaml refers to any more.
  static func hermesEnvSync() throws {
    var st = envState, managed = st["managed"] as? [String] ?? []
    guard FileManager.default.fileExists(atPath: hermesEnvFile) else { if !managed.isEmpty { st = [:]; envState = st }; return }
    let cfg = read(hermesFile).components(separatedBy: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("#") }.joined(separator: "\n")
    let needed = Set(cfg.matches(of: /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/).map { String($0.1) })
    let drop = Set(managed + legacyEnv).subtracting(needed)
    let text = read(hermesEnvFile)
    var ls = lines(text)
    ls.removeAll { envKey($0).map(drop.contains) ?? false }
    managed.removeAll { drop.contains($0) }
    var out = ls.joined(separator: "\n")
    if managed.isEmpty {
      if st["created"] as? Bool == true && blank(out) { try? FileManager.default.removeItem(atPath: hermesEnvFile); envState = [:]; return }
      if st["nl"] as? Bool == true && out.hasSuffix("\n") { out.removeLast() }
      st = [:]
    } else { st["managed"] = managed }
    envState = st
    if out != text { try save(hermesEnvFile, out, mode: 0o600) }
  }
}

// MARK: - The API

enum ToolsAPI {
  static let docs = DocStore.named("tools")
  static let lock = NSRecursiveLock()

  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { try await handle(method, path, r) }
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { try await handle(method, path, r) }

  static func handle(_ method: String, _ path: String, _ r: HTTPRequest) async throws -> Any? {
    guard path == "tools" || path.hasPrefix("tools/") else { return nil }
    let b = r.json
    switch (method, path) {
    case ("GET", "tools"): return overview()
    case ("POST", "tools/mcp"):
      switch b["action"] as? String ?? "" {
      case "add": return try locked { try mcpAdd(b) }
      case "remove": return try locked { try mcpRemove(b["id"] as? String ?? "") }
      case "enable", "disable": return try locked { try mcpSwitch(b["id"] as? String ?? "", on: b["action"] as? String == "enable", tool: b["tool"] as? String) }
      default: throw APIError(422, "bad_action", "Choose add, remove, enable or disable.")
      }
    case ("POST", "tools/mcp/test"): return try await mcpTest(b["id"] as? String ?? "")
    case ("POST", "tools/vault"): return try locked { try vault(b) }
    case ("POST", "tools/skill"): return try locked { try skill(b) }
    default: throw APIError(404, "not_found", "Unknown request for Add tools.")
    }
  }
  static func locked<T>(_ body: () throws -> T) throws -> T { lock.lock(); defer { lock.unlock() }; return try body() }

  // For Setup's state: how much the student added here (the "More tools" step counts as done when > 0).
  static func summary() -> J {
    ["added": servers().count + docs.list("skills").count + Keychain.names().filter { $0.hasPrefix("vault:") }.count]
  }
  // Named keys from the student's vault, given to every agent run the app starts.
  static func runEnv() -> [String: String] {
    var out: [String: String] = [:]
    for k in Keychain.names() where k.hasPrefix("vault:") {
      let n = String(k.dropFirst(6))
      if nameProblem(n) == nil, let v = Keychain.get(k) { out[n] = v }
    }
    return out
  }

  // MARK: names
  static let nameRule = #"^[A-Z][A-Z0-9_]{1,40}$"#
  // Variables the Mac, the shells and the AI tools themselves rely on (an AI tool's own API key is set in Setup › Agents).
  static let reserved: Set<String> = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "PWD", "OLDPWD", "LANG", "LANGUAGE", "TERM", "TERM_PROGRAM", "COLORTERM",
    "NO_COLOR", "FORCE_COLOR", "EDITOR", "VISUAL", "PAGER", "DISPLAY", "TZ", "SHLVL", "MAIL", "IFS", "CDPATH", "ENV", "BASH_ENV", "ZDOTDIR", "PS1", "PROMPT_COMMAND",
    "SSH_AUTH_SOCK", "SSH_AGENT_PID", "NODE_OPTIONS", "NODE_PATH", "NODE_EXTRA_CA_CERTS", "NODE_TLS_REJECT_UNAUTHORIZED", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP",
    "PYTHONUSERBASE", "VIRTUAL_ENV", "PERL5LIB", "PERL5OPT", "RUBYLIB", "RUBYOPT", "GEM_HOME", "GEM_PATH", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY", "OPENROUTER_API_KEY", "NOUS_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY",
    "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "COMPOSIO_API_KEY", "COMPOSIO_MCP_API_KEY",
    "GIT_SSH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "GIT_DIR", "GIT_WORK_TREE", "GIT_EXEC_PATH", "GIT_EDITOR", "GIT_SEQUENCE_EDITOR", "GIT_PAGER", "GIT_EXTERNAL_DIFF",
    "GIT_PROXY_COMMAND", "GIT_TEMPLATE_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CEILING_DIRECTORIES", "SSH_ASKPASS"]
  static let reservedPrefixes = ["ANTHROPIC_", "OPENAI_", "CLAUDE_", "CODEX_", "HERMES_", "HQS_", "DYLD_", "LD_", "NPM_CONFIG_", "GIT_CONFIG", "GIT_TRACE", "XDG_", "LC_"]
  static func nameProblem(_ n: String) -> String? {
    if n.range(of: nameRule, options: .regularExpression) == nil { return "Use capital letters, numbers and _ only, starting with a letter, for example ELEVENLABS_API_KEY." }
    if reserved.contains(n) || reservedPrefixes.contains(where: { n.hasPrefix($0) }) {
      return "\(n) is used by your Mac or by the AI tools themselves, so it cannot be set here. An AI tool's own API key goes in Setup › Agents."
    }
    return nil
  }
  static func slug(_ s: String) -> String {
    var out = "", dash = false
    for c in s.lowercased().unicodeScalars {
      if (c >= "a" && c <= "z") || (c >= "0" && c <= "9") { out.unicodeScalars.append(c); dash = false } else if !out.isEmpty && !dash { out += "-"; dash = true }
    }
    while out.hasSuffix("-") { out.removeLast() }
    return String(out.prefix(32)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
  }
  static func toolName(_ t: String) -> String { MCPConfig.toolNames[t] ?? t }
  static func installedTools() -> Set<String> { Set(Agents.detect(wait: true).filter { ($0["installed"] as? Bool) == true }.compactMap { $0["id"] as? String }) }
  static func message(_ e: Error) -> String { (e as? APIError)?.message ?? (e as? NetError)?.message ?? e.localizedDescription }

  // MARK: registry
  static func servers() -> [J] { docs.list("servers") }
  static func server(_ id: String) -> J? { docs.get("servers", id: id) }
  static func varsOf(_ e: J) -> [String] { ((e["headerVar"] as? String).map { $0.isEmpty ? [] : [$0] } ?? []) + (e["envNames"] as? [String] ?? []) }
  // Names in the AI tools' settings that the app manages (for "added here" on Skills & tools).
  static func managedNames() -> Set<String> { Set(servers().compactMap { $0["id"] as? String } + [AgentApps.name]) }
  static func forTools(_ any: Any?) -> [String: Bool] {
    let given = any as? [String: Any] ?? [:]
    return Dictionary(uniqueKeysWithValues: MCPConfig.tools.map { ($0, given[$0] as? Bool ?? true) })
  }

  static func spec(_ e: J) throws -> MCPSpec {
    var s = MCPSpec(name: e["id"] as? String ?? "", kind: e["kind"] as? String ?? "http")
    if s.kind == "http" {
      s.url = e["url"] as? String ?? ""
      if let h = e["header"] as? String, !h.isEmpty, let v = e["headerVar"] as? String, !v.isEmpty {
        guard let key = Keychain.get(KeyName.vault(v)) else { throw APIError(422, "missing_key", "The key for \(e["name"] as? String ?? "this tool") (\(v)) is no longer in your vault. Add it again under Key vault.") }
        s.headers = [.init(name: h, prefix: (e["bearer"] as? Bool) == true ? "Bearer " : "", envVar: v, value: key)]
      }
    } else {
      s.command = e["command"] as? String ?? ""; s.args = e["args"] as? [String] ?? []
      for n in e["envNames"] as? [String] ?? [] {
        guard let v = Keychain.get(KeyName.vault(n)) else { throw APIError(422, "missing_key", "\(n) is no longer in your vault. Add it again under Key vault.") }
        s.env.append((n, v))
      }
    }
    return s
  }
  // Writes (or takes out) one server in every AI tool, as the registry says; returns what happened per tool.
  static func apply(_ e: J, installed: Set<String>) -> J {
    let id = e["id"] as? String ?? "", want = e["for"] as? [String: Bool] ?? [:], on = (e["enabled"] as? Bool) != false
    var results: J = [:], built: MCPSpec? = nil, problem = ""
    do { built = try spec(e) } catch { problem = message(error) }
    for t in MCPConfig.tools {
      let should = on && (want[t] ?? true)
      guard installed.contains(t) else { results[t] = ["ok": false, "state": "not installed", "error": toolName(t) + " is not installed."] as J; continue }
      do {
        if should { guard let built else { throw APIError(422, "missing_key", problem) }; try MCPConfig.write(built, to: t) } else { try MCPConfig.remove(id, from: t) }
        results[t] = ["ok": true, "state": should ? "on" : "off"] as J
      } catch { results[t] = ["ok": false, "state": "error", "error": message(error)] as J }
    }
    return results
  }
  static func publicView(_ e: J, installed: Set<String>) -> J {
    var x = e; x["owned"] = nil
    let id = e["id"] as? String ?? ""
    x["status"] = Dictionary(uniqueKeysWithValues: MCPConfig.tools.map { t in (t, installed.contains(t) ? (MCPConfig.present(id, in: t) ? "on" : "off") : "not installed") })
    return x
  }

  // MARK: GET tools
  static func overview() -> J {
    let rts = Agents.detect()
    let installed = Set(rts.filter { ($0["installed"] as? Bool) == true }.compactMap { $0["id"] as? String })
    let list = servers()
    let vaultNames = Keychain.names().filter { $0.hasPrefix("vault:") }.map { String($0.dropFirst(6)) }.sorted()
    let vault: [J] = vaultNames.map { n in ["name": n, "usedBy": list.filter { varsOf($0).contains(n) }.map { $0["name"] as? String ?? "" }] }
    let skills: [J] = docs.list("skills").map { s in
      var x = s
      let name = s["id"] as? String ?? ""
      x["status"] = Dictionary(uniqueKeysWithValues: MCPConfig.tools.map { t in (t, FileManager.default.fileExists(atPath: Skills.dir(t) + "/" + name + "/" + Skills.marker) ? "on" : installed.contains(t) ? "off" : "not installed") })
      return x
    }
    let found = Skills.installed()
    return ["servers": list.map { publicView($0, installed: installed) }, "vault": vault, "skills": skills,
            "agents": rts.map { ["id": $0["id"] ?? "", "name": $0["name"] ?? "", "installed": $0["installed"] ?? false, "ready": $0["ready"] ?? false] as J },
            "composio": ["connected": Composio.connected, "agentApps": AgentApps.status()], "found": found["tools"] ?? [J](), "observedAt": now()]
  }

  // MARK: POST tools/mcp
  static func mcpAdd(_ b: J) throws -> J {
    let display = (b["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let sl = slug(display)
    guard !sl.isEmpty else { throw APIError(422, "bad_name", "Give the tool a short name, for example Linear.") }
    let id = "187n-" + sl
    guard id != AgentApps.name else { throw APIError(409, "exists", "That name belongs to your Composio apps. Pick another name.") }
    guard server(id) == nil else { throw APIError(409, "exists", "You already added \(display). Remove it first, or pick another name.") }
    let kind = (b["kind"] as? String) == "stdio" ? "stdio" : "http"
    let want = forTools(b["for"])
    guard want.values.contains(true) else { throw APIError(422, "no_tools", "Choose at least one AI tool.") }
    var e: J = ["id": id, "name": String(display.prefix(60)), "kind": kind, "for": want, "enabled": true, "addedAt": now(),
                "url": "", "header": "", "bearer": false, "headerVar": "", "command": "", "args": [String](), "envNames": [String]()]
    var secrets: [(String, String)] = []   // stored only after every check passed
    let used = Set(servers().flatMap(varsOf))
    if kind == "http" {
      let url = (b["url"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard url.count < 2000, let u = URL(string: url), ["http", "https"].contains(u.scheme?.lowercased() ?? ""), !(u.host ?? "").isEmpty, !url.contains(" ") else {
        throw APIError(422, "bad_url", "Paste the MCP address from the tool's docs. It starts with https://")
      }
      e["url"] = url
      let key = (b["key"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      if !key.isEmpty {
        guard key.count <= 8000, !key.contains("\n") else { throw APIError(422, "bad_key", "That key looks wrong. Paste just the key itself.") }
        let header = (b["header"] as? String ?? "").trimmingCharacters(in: .whitespaces).isEmpty ? "Authorization" : (b["header"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        guard header.range(of: #"^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$"#, options: .regularExpression) != nil else { throw APIError(422, "bad_header", "A header name can only use letters, numbers and dashes, for example x-api-key.") }
        var v = ""
        if let asked = (b["keyName"] as? String)?.trimmingCharacters(in: .whitespaces), !asked.isEmpty {
          if let p = nameProblem(asked) { throw APIError(422, "bad_name", p) }
          guard !used.contains(asked) else { throw APIError(409, "key_used", "\(asked) is already used by another tool. Pick another name for this key.") }
          v = asked
        } else {
          let baseName = "MCP_" + String(sl.uppercased().replacingOccurrences(of: "-", with: "_").prefix(30)) + "_KEY"
          v = baseName; var n = 2
          while used.contains(v) { v = baseName + "_" + String(n); n += 1 }
        }
        e["header"] = header; e["bearer"] = (b["bearer"] as? Bool) ?? (header.lowercased() == "authorization"); e["headerVar"] = v
        secrets.append((v, key))
      }
    } else {
      var command = (b["command"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines), args: [String]
      if let given = b["args"] as? [Any] { args = given.compactMap { $0 as? String } } else {
        let words = try shellWords(command)
        command = words.first ?? ""; args = Array(words.dropFirst())
      }
      guard !command.isEmpty, command.count < 500, !command.contains("\n") else { throw APIError(422, "bad_command", "Paste the command from the tool's docs, for example: npx -y @modelcontextprotocol/server-github") }
      guard args.count <= 64, args.allSatisfy({ $0.count < 2000 && !$0.contains("\n") }) else { throw APIError(422, "bad_command", "That command is too long. Paste the command from the tool's docs.") }
      e["command"] = command; e["args"] = args
      let env = try parseEnv(b["env"])
      for (n, v) in env {
        if let p = nameProblem(n) { throw APIError(422, "bad_name", p) }
        if v.isEmpty { guard Keychain.get(KeyName.vault(n)) != nil else { throw APIError(422, "missing_value", "Give \(n) a value, or add it to your key vault first.") } }
        else { secrets.append((n, v)) }
      }
      e["envNames"] = env.map(\.0)
    }
    // A name that is already in an AI tool's settings, put there by someone else, stays theirs.
    let installed = installedTools()
    for t in MCPConfig.tools where want[t] == true && installed.contains(t) && MCPConfig.foreign(id, in: t) {
      throw APIError(409, "taken", "\(toolName(t)) already has an MCP server called \(id). Remove it there, or pick another name.")
    }
    if want["hermes"] == true && installed.contains("hermes") {
      let vars = varsOf(e).map { n in (n, secrets.first { $0.0 == n }?.1 ?? Keychain.get(KeyName.vault(n)) ?? "") }
      try MCPConfig.hermesEnvCheck(vars)
    }
    var owned: [String] = [], changed = Set<String>()
    for (n, v) in secrets {
      let old = Keychain.get(KeyName.vault(n))
      if old == nil { owned.append(n) } else if old != v { changed.insert(n) }
      Keychain.set(KeyName.vault(n), v)
    }
    e["owned"] = owned
    docs.upsert("servers", e)
    var results = apply(e, installed: installed)
    docs.update("servers", id: id) { $0["results"] = results }
    // Other tools that use a key whose value just changed get the new value too.
    if !changed.isEmpty { for o in servers() where (o["id"] as? String) != id && !Set(varsOf(o)).isDisjoint(with: changed) { _ = apply(o, installed: installed) } }
    results = server(id)?["results"] as? J ?? results
    Store.shared.emit("connector.updated", ["title": display])
    return ["server": publicView(server(id) ?? e, installed: installed), "results": results]
  }
  static func mcpRemove(_ id: String) throws -> J {
    guard let e = server(id) else { throw APIError(404, "not_found", "This tool is no longer in the list.") }
    var results: J = [:], failed: [String] = []
    for t in MCPConfig.tools {
      do { try MCPConfig.remove(id, from: t); results[t] = ["ok": true, "state": "off"] as J }
      catch { results[t] = ["ok": false, "state": "error", "error": message(error)] as J; failed.append(toolName(t) + ": " + message(error)) }
    }
    if !failed.isEmpty {
      docs.update("servers", id: id) { $0["enabled"] = false; $0["results"] = results }
      throw APIError(502, "remove_failed", "Not removed everywhere. " + failed.joined(separator: " · "))
    }
    docs.remove("servers", id: id)
    let stillUsed = Set(servers().flatMap(varsOf))
    for n in e["owned"] as? [String] ?? [] where !stillUsed.contains(n) { Keychain.set(KeyName.vault(n), nil) }
    try? MCPConfig.hermesEnvSync()
    Store.shared.emit("connector.updated", ["title": e["name"] as? String ?? "Tool"])
    return ["removed": true, "results": results]
  }
  static func mcpSwitch(_ id: String, on: Bool, tool: String?) throws -> J {
    guard var e = server(id) else { throw APIError(404, "not_found", "This tool is no longer in the list.") }
    if let t = tool, MCPConfig.tools.contains(t) {
      var f = e["for"] as? [String: Bool] ?? forTools(nil); f[t] = on; e["for"] = f
      if on { e["enabled"] = true }
    } else { e["enabled"] = on }
    let installed = installedTools()
    let results = apply(e, installed: installed)
    e["results"] = results
    docs.upsert("servers", e)
    Store.shared.emit("connector.updated", ["title": e["name"] as? String ?? "Tool"])
    return ["server": publicView(e, installed: installed), "results": results]
  }

  // MARK: POST tools/mcp/test: one MCP "initialize" call to the address the student entered (5 s), or a command check.
  final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  }
  static func mcpTest(_ id: String) async throws -> J {
    guard let e = server(id) else { throw APIError(404, "not_found", "This tool is no longer in the list.") }
    var res: J
    if e["kind"] as? String == "stdio" {
      let cmd = e["command"] as? String ?? ""
      let found = cmd.hasPrefix("/") ? FileManager.default.isExecutableFile(atPath: cmd) : Shell.which(cmd) != nil
      res = found ? ["ok": true, "message": "\(cmd) is on this Mac. Your AI tools start it when they need it."]
        : ["ok": false, "message": "\(cmd) was not found on this Mac. Install it first (the tool's docs say how), then test again."]
    } else { res = await probe(e) }
    res["at"] = now()
    docs.update("servers", id: id) { $0["lastTest"] = res }
    return res
  }
  static func probe(_ e: J) async -> J {
    guard let url = URL(string: e["url"] as? String ?? "") else { return ["ok": false, "message": "This address is not valid."] }
    var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5)
    req.httpMethod = "POST"; req.httpShouldHandleCookies = false
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("application/json, text/event-stream", forHTTPHeaderField: "Accept")
    if let h = e["header"] as? String, !h.isEmpty, let v = e["headerVar"] as? String, let key = Keychain.get(KeyName.vault(v)) {
      req.setValue(((e["bearer"] as? Bool) == true ? "Bearer " : "") + key, forHTTPHeaderField: h)
    }
    let body: J = ["jsonrpc": "2.0", "id": 1, "method": "initialize", "params": ["protocolVersion": "2025-06-18", "capabilities": J(), "clientInfo": ["name": "187N Agent HQ", "version": AppInfo.version]]]
    req.httpBody = Data(jsonString(body).utf8)
    let cfg = URLSessionConfiguration.ephemeral
    cfg.timeoutIntervalForRequest = 5; cfg.timeoutIntervalForResource = 6; cfg.httpCookieAcceptPolicy = .never; cfg.httpShouldSetCookies = false; cfg.urlCache = nil
    let session = URLSession(configuration: cfg, delegate: NoRedirects(), delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let host = url.host ?? "the server"
    do {
      let (data, response) = try await session.data(for: req)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let text = String(data: data.prefix(200_000), encoding: .utf8) ?? ""
      switch status {
      case 200..<300:
        let candidates = [text] + text.components(separatedBy: "\n").filter { $0.hasPrefix("data:") }.map { String($0.dropFirst(5)).trimmingCharacters(in: .whitespaces) }
        for c in candidates {
          if let j = (try? JSONSerialization.jsonObject(with: Data(c.utf8))) as? J, let r = j["result"] as? J {
            let name = (r["serverInfo"] as? J)?["name"] as? String ?? host
            return ["ok": true, "message": "Works: \(String(name.prefix(80))) answered.", "server": String(name.prefix(80))]
          }
        }
        return ["ok": false, "message": "\(host) answered, but not like an MCP server. Check the address in the tool's docs."]
      case 300..<400: return ["ok": false, "message": "This address sends you somewhere else. Use the exact MCP address from the tool's docs."]
      case 401, 403: return ["ok": false, "message": "\(host) refused the request (\(status)). Check the key and how it is sent. If the tool uses a browser login, your AI tool asks you to log in the first time."]
      case 404: return ["ok": false, "message": "There is no MCP server at this address (404). Check the address in the tool's docs."]
      default: return ["ok": false, "message": "\(host) answered \(status). Try again later, or check the address."]
      }
    } catch let err as URLError {
      if err.code == .timedOut { return ["ok": false, "message": "No answer from \(host) within 5 seconds."] }
      return ["ok": false, "message": "Could not reach \(host). Check the address and your internet connection."]
    } catch { return ["ok": false, "message": "Could not reach \(host)."] }
  }

  // MARK: POST tools/vault
  static func vault(_ b: J) throws -> J {
    let name = (b["name"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    if let p = nameProblem(name) { throw APIError(422, "bad_name", p) }
    switch b["action"] as? String ?? "" {
    case "add":
      let value = (b["value"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !value.isEmpty else { throw APIError(422, "missing_value", "Paste the key's value.") }
      guard value.count <= 8000 else { throw APIError(422, "bad_value", "That value is too long for a key.") }
      let users = servers().filter { varsOf($0).contains(name) }
      if !users.isEmpty, Keychain.get(KeyName.vault(name)) != value, users.contains(where: { ($0["for"] as? [String: Bool])?["hermes"] != false }) {
        try MCPConfig.hermesEnvCheck([(name, value)])
      }
      Keychain.set(KeyName.vault(name), value)
      // The tools that use this key get its new value.
      if !users.isEmpty { let installed = installedTools(); for e in users { _ = apply(e, installed: installed) } }
      Store.shared.emit("connector.updated", ["title": "Key vault"])
    case "remove":
      if let user = servers().first(where: { varsOf($0).contains(name) }) {
        throw APIError(409, "in_use", "\(name) is used by \(user["name"] as? String ?? "a tool"). Remove that tool first.")
      }
      Keychain.set(KeyName.vault(name), nil)
      Store.shared.emit("connector.updated", ["title": "Key vault"])
    default: throw APIError(422, "bad_action", "Choose add or remove.")
    }
    let list = servers()
    return ["vault": Keychain.names().filter { $0.hasPrefix("vault:") }.map { String($0.dropFirst(6)) }.sorted().map { n in ["name": n, "usedBy": list.filter { varsOf($0).contains(n) }.map { $0["name"] as? String ?? "" }] as J }]
  }

  // MARK: POST tools/skill: a SKILL.md folder, copied (no symlinks, at most 20 MB) into each AI tool's skills folder.
  static let skillLimit = 20 * 1024 * 1024, skillFileLimit = 2000
  static func skill(_ b: J) throws -> J {
    switch b["action"] as? String ?? "" {
    case "add": return try skillAdd(b)
    case "remove":
      var name = (b["name"] as? String ?? "").trimmingCharacters(in: .whitespaces)
      if name.isEmpty, let p = b["path"] as? String { name = (p as NSString).lastPathComponent }
      guard Skills.validName(name) else { throw APIError(422, "bad_name", "Unknown skill.") }
      var results: J = [:]
      for t in MCPConfig.tools {
        let dest = Skills.dir(t) + "/" + name
        guard FileManager.default.fileExists(atPath: dest + "/" + Skills.marker) else { results[t] = ["ok": true, "state": "off"] as J; continue }
        do { try FileManager.default.removeItem(atPath: dest); results[t] = ["ok": true, "state": "off"] as J } catch { results[t] = ["ok": false, "error": "Could not remove it: " + error.localizedDescription] as J }
      }
      docs.remove("skills", id: name)
      Store.shared.emit("connector.updated", ["title": "Skills"])
      return ["removed": true, "results": results]
    default: throw APIError(422, "bad_action", "Choose add or remove.")
    }
  }
  static func skillAdd(_ b: J) throws -> J {
    let fm = FileManager.default
    let raw = (b["path"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { throw APIError(422, "bad_folder", "Choose a skill folder.") }
    let root = URL(fileURLWithPath: (raw as NSString).expandingTildeInPath).standardizedFileURL
    var isDir: ObjCBool = false
    guard fm.fileExists(atPath: root.path, isDirectory: &isDir), isDir.boolValue else { throw APIError(422, "bad_folder", "That folder does not exist.") }
    let skillFile = root.appendingPathComponent("SKILL.md")
    let attrs = try? fm.attributesOfItem(atPath: skillFile.path)
    guard attrs?[.type] as? FileAttributeType == .typeRegular, let text = try? String(contentsOf: skillFile, encoding: .utf8) else {
      throw APIError(422, "no_skill", "This folder has no SKILL.md file. Choose the folder that holds the skill's SKILL.md.")
    }
    let meta = Skills.frontmatter(text)
    guard let name = meta["name"], !name.isEmpty else { throw APIError(422, "no_name", "SKILL.md needs a name at the top, for example:\n---\nname: my-skill\ndescription: What it does\n---") }
    guard Skills.validName(name) else { throw APIError(422, "bad_name", "The skill's name (\(String(name.prefix(60)))) can only use letters, numbers, dots, dashes and underscores.") }
    // What will be copied: real files and folders only.
    // The path walker gives paths relative to the folder and reports a symlink as a symlink (it never follows one).
    var dirs: [String] = [], files: [String] = [], bytes = 0, skipped = 0
    guard let walker = fm.enumerator(atPath: root.path) else { throw APIError(422, "bad_folder", "This folder cannot be read.") }
    let base = root.path.hasSuffix("/") ? root.path : root.path + "/"
    while let rel = walker.nextObject() as? String {
      let type = walker.fileAttributes?[.type] as? FileAttributeType, last = (rel as NSString).lastPathComponent
      if type == .typeSymbolicLink { skipped += 1; continue }
      if type == .typeDirectory {
        if [".git", "node_modules", "__pycache__"].contains(last) { walker.skipDescendants(); continue }
        dirs.append(rel); continue
      }
      guard type == .typeRegular, ![".DS_Store", Skills.marker].contains(last) else { continue }
      files.append(rel); bytes += (walker.fileAttributes?[.size] as? NSNumber)?.intValue ?? 0
      if bytes > skillLimit { throw APIError(422, "too_big", "This skill folder is larger than 20 MB. Remove big files (videos, archives) from it and try again.") }
      if files.count > skillFileLimit { throw APIError(422, "too_big", "This skill folder has more than 2,000 files. Choose just the skill's own folder.") }
    }
    let want = forTools(b["for"]), installed = installedTools()
    var results: J = [:]
    for t in MCPConfig.tools {
      guard want[t] == true else { results[t] = ["ok": true, "state": "off"] as J; continue }
      guard installed.contains(t) else { results[t] = ["ok": false, "state": "not installed", "error": toolName(t) + " is not installed."] as J; continue }
      let parent = Skills.dir(t), dest = parent + "/" + name
      if dest == root.path || dest.hasPrefix(base) { results[t] = ["ok": false, "state": "error", "error": "This folder is already \(toolName(t))'s own copy."] as J; continue }
      if fm.fileExists(atPath: dest) && !fm.fileExists(atPath: dest + "/" + Skills.marker) {
        results[t] = ["ok": false, "state": "error", "error": "\(toolName(t)) already has a skill called \(name) that was not added here. Rename yours, or remove that one first."] as J; continue
      }
      do {
        try fm.createDirectory(atPath: parent, withIntermediateDirectories: true)
        let tmp = dest + ".187n-tmp"
        try? fm.removeItem(atPath: tmp)
        try fm.createDirectory(atPath: tmp, withIntermediateDirectories: true)
        for d in dirs { try fm.createDirectory(atPath: tmp + "/" + d, withIntermediateDirectories: true) }
        for f in files { try fm.copyItem(atPath: base + f, toPath: tmp + "/" + f) }
        let mark: J = ["by": "187N Agent HQ", "skill": name, "source": root.path, "installedAt": isoNow()]
        try Data(jsonString(mark).utf8).write(to: URL(fileURLWithPath: tmp + "/" + Skills.marker))
        if fm.fileExists(atPath: dest) { try fm.removeItem(atPath: dest) }
        try fm.moveItem(atPath: tmp, toPath: dest)
        results[t] = ["ok": true, "state": "on"] as J
      } catch {
        try? fm.removeItem(atPath: dest + ".187n-tmp")
        results[t] = ["ok": false, "state": "error", "error": "Could not copy it: " + error.localizedDescription] as J
      }
    }
    let entry: J = ["id": name, "name": name, "description": String((meta["description"] ?? "").prefix(300)), "source": root.path, "files": files.count, "bytes": bytes,
                    "skippedLinks": skipped, "for": want, "results": results, "addedAt": now()]
    if results.values.contains(where: { ($0 as? J)?["state"] as? String == "on" }) { docs.upsert("skills", entry) }
    Store.shared.emit("connector.updated", ["title": "Skills"])
    return ["skill": entry, "results": results]
  }

  // MARK: parsing
  // "npx -y @scope/server --flag 'two words'" → ["npx", "-y", "@scope/server", "--flag", "two words"]
  static func shellWords(_ s: String) throws -> [String] {
    var out: [String] = [], cur = "", inWord = false, quote: Character? = nil, escape = false
    for c in s {
      if escape { cur.append(c); escape = false; inWord = true; continue }
      if c == "\\" && quote != "'" { escape = true; continue }
      if let q = quote { if c == q { quote = nil } else { cur.append(c) }; continue }
      if c == "\"" || c == "'" { quote = c; inWord = true; continue }
      if c == " " || c == "\t" { if inWord { out.append(cur); cur = ""; inWord = false }; continue }
      cur.append(c); inWord = true
    }
    if quote != nil { throw APIError(422, "bad_command", "A quote in the command is not closed.") }
    if inWord { out.append(cur) }
    return out
  }
  // [{name, value}] or "NAME=value" lines.
  static func parseEnv(_ any: Any?) throws -> [(String, String)] {
    var out: [(String, String)] = []
    if let list = any as? [J] {
      for x in list { let n = (x["name"] as? String ?? "").trimmingCharacters(in: .whitespaces); if !n.isEmpty { out.append((n, (x["value"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines))) } }
    } else if let text = any as? String {
      for line in text.components(separatedBy: .newlines) {
        let t = line.trimmingCharacters(in: .whitespaces)
        if t.isEmpty || t.hasPrefix("#") { continue }
        guard let eq = t.firstIndex(of: "=") else { throw APIError(422, "bad_env", "Write each key as NAME=value, one per line.") }
        out.append((t[..<eq].trimmingCharacters(in: .whitespaces), t[t.index(after: eq)...].trimmingCharacters(in: .whitespaces)))
      }
    }
    guard out.count <= 30 else { throw APIError(422, "bad_env", "That is a lot of keys. Keep it to 30 at most.") }
    var seen = Set<String>()
    for (n, _) in out where !seen.insert(n).inserted { throw APIError(422, "bad_env", "\(n) is listed twice.") }
    return out
  }
}
