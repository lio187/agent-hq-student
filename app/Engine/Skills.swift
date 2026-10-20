// Skills & tools: what the student's AI tools already have, found on disk (read only). Skills are SKILL.md folders;
// tools are the MCP servers each AI tool is configured with. Names and descriptions only, never secrets. Entries the
// app added itself (Add tools) are marked "managed"; everything else is "found".
import Foundation

enum Skills {
  static var home: String { Paths.home }
  // Where each AI tool reads the student's own skills (Codex reads ~/.agents/skills; ~/.codex/skills is its older place).
  static func dir(_ tool: String) -> String { home + (tool == "claude" ? "/.claude/skills" : tool == "codex" ? "/.agents/skills" : "/.hermes/skills") }
  // A skill folder the app copied in carries this file; only those are ever removed by the app.
  static let marker = ".187n-installed"
  static func validName(_ n: String) -> Bool { n.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$"#, options: .regularExpression) != nil }
  // SKILL.md files under a folder (a few levels deep): name and description from the frontmatter.
  static func skills(in roots: [String], source: String) -> [J] {
    var out: [J] = [], seen = Set<String>()
    let fm = FileManager.default
    for root in roots where fm.fileExists(atPath: root) {
      guard let walker = fm.enumerator(at: URL(fileURLWithPath: root), includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) else { continue }
      for case let url as URL in walker {
        if walker.level > 6 || url.lastPathComponent == "node_modules" { walker.skipDescendants(); continue }
        guard url.lastPathComponent == "SKILL.md", out.count < 800, let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
        let meta = frontmatter(text)
        let name = meta["name"] ?? url.deletingLastPathComponent().lastPathComponent
        guard seen.insert(name).inserted else { continue }
        let folder = url.deletingLastPathComponent().path
        let managed = fm.fileExists(atPath: folder + "/" + marker)
        out.append(["name": name, "description": String((meta["description"] ?? "").prefix(300)), "source": managed ? "Added here" : source, "managed": managed, "path": folder.replacingOccurrences(of: "/private" + home, with: "~").replacingOccurrences(of: home, with: "~")])
      }
    }
    return out.sorted { ($0["name"] as? String ?? "") < ($1["name"] as? String ?? "") }
  }
  static func frontmatter(_ text: String) -> [String: String] {
    guard text.hasPrefix("---") else { return [:] }
    let lines = Array(text.split(separator: "\n", omittingEmptySubsequences: false).dropFirst())
    var out: [String: String] = [:], i = 0
    while i < lines.count {
      let l = lines[i]; if l.hasPrefix("---") { break }
      guard !l.hasPrefix(" "), let c = l.firstIndex(of: ":") else { i += 1; continue }
      let k = l[..<c].trimmingCharacters(in: .whitespaces)
      var v = l[l.index(after: c)...].trimmingCharacters(in: .whitespaces)
      if v.hasPrefix(">") || v.hasPrefix("|") || v.isEmpty {
        // A YAML block (> or |): the indented lines that follow.
        var block: [String] = []; i += 1
        while i < lines.count, lines[i].hasPrefix(" ") || lines[i].trimmingCharacters(in: .whitespaces).isEmpty { block.append(lines[i].trimmingCharacters(in: .whitespaces)); i += 1 }
        v = block.filter { !$0.isEmpty }.joined(separator: " ")
      } else { i += 1 }
      v = v.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
      if ["name", "description"].contains(k), !v.isEmpty { out[k] = v }
    }
    return out
  }
  // MCP server names per AI tool (no URLs with keys, no headers, no env values).
  static func claudeMCP() -> [J] {
    guard let d = try? Data(contentsOf: URL(fileURLWithPath: home + "/.claude.json")), let j = (try? JSONSerialization.jsonObject(with: d)) as? J, let servers = j["mcpServers"] as? J else { return [] }
    return servers.keys.sorted().map { name in
      let s = servers[name] as? J ?? [:]
      return ["name": name, "kind": (s["type"] as? String) ?? (s["command"] != nil ? "stdio" : "http")]
    }
  }
  static func tomlMCP(_ path: String) -> [J] {
    guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { return [] }
    var names: [String] = []
    for m in text.matches(of: /(?m)^\[mcp_servers\.("?)([A-Za-z0-9_.-]+)\1\]/) { let n = String(m.2); if !names.contains(n) { names.append(n) } }
    return names.map { ["name": $0, "kind": "configured"] }
  }
  // "key:" that opens a block, also with a comment after it ("mcp_servers: # …").
  static func isBlockKey(_ t: String, _ key: String) -> Bool {
    guard t.hasPrefix(key + ":") else { return false }
    let rest = t.dropFirst(key.count + 1).trimmingCharacters(in: .whitespaces)
    return rest.isEmpty || rest.hasPrefix("#")
  }
  static func yamlMCP(_ path: String) -> [J] {
    guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { return [] }
    var names: [String] = [], inBlock = false, indent = -1
    for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
      let line = String(raw); let trimmed = line.trimmingCharacters(in: .whitespaces)
      if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
      let lead = line.prefix { $0 == " " }.count
      if !inBlock { if lead == 0 && (isBlockKey(trimmed, "mcp_servers") || isBlockKey(trimmed, "mcp")) { inBlock = true; indent = -1 }; continue }
      if lead == 0 { break }
      if indent < 0 { indent = lead }
      if lead == indent, let i = trimmed.firstIndex(of: ":") { let n = String(trimmed[..<i]); if n != "servers" { names.append(n) } else { indent = -1 } }
    }
    return names.map { ["name": $0, "kind": "configured"] }
  }
  static func installed() -> J {
    let rts = Agents.detect()
    func entry(_ id: String, skills: [J], mcp: [J]) -> J {
      let rt = rts.first { ($0["id"] as? String) == id } ?? [:]
      return ["id": id, "name": rt["name"] ?? id, "installed": rt["installed"] ?? false, "ready": rt["ready"] ?? false, "skills": skills, "mcp": mcp]
    }
    let managed = ToolsAPI.managedNames()
    let mark: ([J]) -> [J] = { $0.map { m in var x = m; x["managed"] = managed.contains(m["name"] as? String ?? ""); return x } }
    let claude = entry("claude", skills: skills(in: [home + "/.claude/skills"], source: "Your skills") + skills(in: [home + "/.claude/plugins"], source: "Plugin"), mcp: mark(claudeMCP()))
    let codex = entry("codex", skills: skills(in: [home + "/.agents/skills", home + "/.codex/skills"], source: "Your skills"), mcp: mark(tomlMCP(home + "/.codex/config.toml")))
    let hermes = entry("hermes", skills: skills(in: [home + "/.hermes/skills"], source: "Your skills"), mcp: mark(yamlMCP(home + "/.hermes/config.yaml")))
    return ["tools": [claude, codex, hermes], "composio": Composio.connected, "observedAt": now()]
  }
}
