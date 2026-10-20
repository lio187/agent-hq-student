// "View steps": what an agent did in a run, as a chain the workflow drawer draws (trigger → model → each tool →
// result), built from the steps recorded while the run streamed.
import Foundation

enum Workflow {
  static let terminal: Set<String> = ["completed", "failed", "interrupted", "cancelled"]
  static func node(_ id: String, _ kind: String, _ label: String, _ sub: String, _ status: String, _ started: Double?, _ ended: Double?, extra: J = [:]) -> J {
    var n: J = ["id": id, "kind": kind, "status": status, "meta": J()]
    n["label"] = String(label.prefix(120)); n["sub"] = String(sub.prefix(160))
    n["startedAt"] = orNull(started); n["endedAt"] = orNull(ended)
    if let a = started, let b = ended { n["ms"] = Int((b - a) * 1000) } else { n["ms"] = NSNull() }
    for (k, v) in extra { n[k] = v }
    return n
  }
  // One run as a chain of steps.
  static func graph(_ run: J, kind: String, id: String, title: String?, agentName: (String) -> String) -> J {
    let created = run["created_at"] as? Double, updated = run["updated_at"] as? Double
    let status = run["status"] as? String ?? "running", live = !terminal.contains(status)
    let trigger = run["task"] is String ? "Task" : run["routine"] is String ? "Routine" : "Conversation"
    var nodes: [J] = [node("n1", "trigger", trigger, run["title"] as? String ?? "", "ok", created, created)]
    let rt = run["runtime"] as? J ?? [:]
    let model = (rt["model"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (rt["provider"] as? String ?? "Model")
    nodes.append(node("n2", "model", model, (rt["provider"] as? String ?? "") + " · " + agentName(run["profile"] as? String ?? ""), live ? "running" : "ok", created, live ? nil : updated, extra: ["service": rt["source"] as? String ?? ""]))
    let steps = run["steps"] as? [J] ?? []
    for (i, s) in steps.prefix(150).enumerated() {
      let at = s["at"] as? Double, next = i + 1 < steps.count ? steps[i + 1]["at"] as? Double : (live ? nil : updated)
      let tool = s["tool"] as? String ?? "Tool"
      nodes.append(node("n\(i + 3)", tool.lowercased().contains("skill") ? "skill" : "tool", tool, "", (live && i == steps.count - 1) ? "running" : "ok", at, next, extra: ["tool": tool]))
    }
    if !live {
      let failed = status != "completed"
      nodes.append(node("n\(nodes.count + 1)", "result", failed ? "Run " + status : "Result", failed ? (run["error"] as? String ?? "") : String((run["result"] as? String ?? "").prefix(160)), failed ? "error" : "ok", updated, updated))
    }
    var edges: [J] = []
    for i in 1..<nodes.count { edges.append(["from": nodes[i - 1]["id"]!, "to": nodes[i]["id"]!, "kind": "flow"]) }
    let usage = run["usage"] as? J ?? [:]
    let summary: J = ["tools": steps.count, "skills": steps.filter { ($0["tool"] as? String ?? "").lowercased().contains("skill") }.count, "agents": 1, "subagents": 0,
                      "durationMs": created.map { Int(((live ? now() : (updated ?? now())) - $0) * 1000) } ?? NSNull(), "tokens": (usage["total_tokens"] as? Int).flatMap { $0 > 0 ? $0 : nil } ?? NSNull(),
                      "cost": NSNull(), "errors": status == "failed" ? 1 : 0, "truncated": steps.count > 150, "parallelGroups": 0]
    return ["kind": kind, "id": id, "title": title ?? (run["title"] as? String ?? "Run"), "profile": run["profile"] ?? "", "nodes": nodes, "edges": edges, "summary": summary,
            "source": "187n-agent-hq", "live": live, "partial": false, "notice": NSNull(), "observedAt": now()]
  }
  static func route(_ q: [String: String], runs: [J], agentName: (String) -> String) throws -> J {
    let kind = q["kind"] ?? "index", id = q["id"] ?? ""
    switch kind {
    case "index", "agent":
      let profile = q["profile"] ?? "", routine = q["routine"]
      let mine = runs.filter { r in routine.map { (r["routine"] as? String) == $0 } ?? ((r["profile"] as? String) == profile) }.prefix(40)
      let items: [J] = mine.map { r in
        let st = r["status"] as? String ?? "running"
        return ["kind": "run", "id": r["id"] ?? "", "profile": r["profile"] ?? "", "label": String((r["title"] as? String ?? "Run").prefix(120)), "source": "office", "startedAt": orNull(r["created_at"]),
                "endedAt": terminal.contains(st) ? orNull(r["updated_at"]) : NSNull(), "status": !terminal.contains(st) ? "running" : st == "completed" ? "ok" : "error"]
      }
      return ["kind": "index", "profile": profile, "routine": orNull(routine), "items": items, "observedAt": now()]
    case "run", "session":
      guard let run = runs.first(where: { ($0["id"] as? String) == id || ($0["session_id"] as? String) == id }) else { throw APIError(404, "not_found", "This run is no longer recorded.") }
      return graph(run, kind: kind, id: id, title: nil, agentName: agentName)
    case "task", "routine":
      let key = kind == "task" ? "task" : "routine"
      let tid = id.split(separator: ":").last.map(String.init) ?? id
      guard let run = runs.first(where: { ($0[key] as? String) == tid }) else {
        return ["kind": kind, "id": id, "title": kind == "task" ? "Task" : "Routine", "profile": NSNull(), "nodes": [J](), "edges": [J](), "summary": ["tools": 0, "skills": 0, "agents": 0, "subagents": 0, "durationMs": NSNull(), "tokens": NSNull(), "cost": NSNull(), "errors": 0, "truncated": false, "parallelGroups": 0],
                "source": "187n-agent-hq", "live": false, "partial": false, "notice": "This has not run yet.", "observedAt": now()]
      }
      return graph(run, kind: kind, id: id, title: nil, agentName: agentName)
    default: throw APIError(400, "invalid_workflow", "Choose run, session, routine, task or index.")
    }
  }
}
