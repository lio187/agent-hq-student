// "Give my agents my apps": the student's Composio apps become tools inside Claude Code, Codex and Hermes Agent.
// One Composio Tool Router session per student gives an MCP address; it is added to each AI tool with the same writers
// as every other MCP server (MCPConfig in Tools.swift): Claude Code through `claude mcp add-json`, Codex in
// ~/.codex/config.toml, Hermes in ~/.hermes/config.yaml with the key in ~/.hermes/.env. Files are backed up once
// before the first change; Remove takes the blocks out again (also the unmarked ones an earlier version wrote).
import Foundation

enum AgentApps {
  static let name = "187n-apps"
  static let envVar = "COMPOSIO_MCP_API_KEY"

  // The student's MCP address from a (reused) Composio Tool Router session.
  static func mcpURL() async throws -> String {
    if let sid = Store.shared.setting("composioSession") as? String, !sid.isEmpty,
       let s = try? await Composio.raw("GET", "/tool_router/session/" + sid), let url = (s["mcp"] as? J)?["url"] as? String { return url }
    let active = try await Composio.accounts().filter { ($0["status"] as? String)?.uppercased() == "ACTIVE" }.compactMap { $0["toolkit"] as? String }
    var body: J = ["user_id": Composio.userID, "manage_connections": ["enable": true]]
    if !active.isEmpty { body["toolkits"] = ["enable": Array(Set(active)).sorted()] }
    let s = try await Composio.raw("POST", "/tool_router/session", body: body)
    guard let url = (s["mcp"] as? J)?["url"] as? String else { throw NetError(status: 502, message: "Composio did not return an address for your agents.", code: "no_mcp") }
    if let sid = s["session_id"] as? String { Store.shared.setSettings(["composioSession": sid]) }
    return url
  }

  // Which AI tools have the apps now: {claude, codex, hermes} → Bool.
  static func status() -> J { MCPConfig.status(name) as J }

  static func enable() async throws -> J {
    guard let key = Composio.key else { throw APIError(422, "not_connected", "Connect Composio first.") }
    let url = try await mcpURL()
    let spec = MCPSpec(name: name, kind: "http", url: url, headers: [.init(name: "x-api-key", prefix: "", envVar: envVar, value: key)])
    var results: J = [:]
    for rt in Agents.detect(wait: true) where (rt["installed"] as? Bool) == true {
      guard let id = rt["id"] as? String, MCPConfig.tools.contains(id) else { continue }
      do { try MCPConfig.write(spec, to: id); results[id] = ["ok": true] as J }
      catch { results[id] = ["ok": false, "error": (error as? APIError)?.message ?? error.localizedDescription] as J }
    }
    Store.shared.setSettings(["agentApps": true]); Store.shared.emit("connector.updated", ["title": "Apps for agents"])
    return ["results": results, "status": status()]
  }
  static func disable() -> J {
    for t in MCPConfig.tools { try? MCPConfig.remove(name, from: t) }
    Store.shared.setSettings(["agentApps": false]); Store.shared.emit("connector.updated", ["title": "Apps for agents"])
    return ["status": status()]
  }
}
