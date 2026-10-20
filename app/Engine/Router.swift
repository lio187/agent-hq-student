// The engine behind the window: serves the sealed dashboard and answers its API (/api/hq/v1/…) from the student's
// own agents, connections and notes. Only the app's window can reach it: a fresh key per launch (an HttpOnly cookie),
// the exact host, and the app's own origin for every write.
import Foundation

let DEPARTMENTS: [J] = [["id": "command", "name": "Chief of Staff"], ["id": "operations", "name": "Operations"], ["id": "growth", "name": "Growth & Research"],
  ["id": "content", "name": "Content & Social"], ["id": "revenue", "name": "Sales & Clients"], ["id": "outreach", "name": "Outreach"], ["id": "build", "name": "Build & Automation"],
  ["id": "finance", "name": "Finance & Admin"], ["id": "ecom", "name": "E-commerce"]]
// The starting team (Setup lets the student pick each agent's runtime).
let TEAM: [(String, String, String, String)] = [
  ("chief", "Chief of Staff", "command", "Plans the day, turns goals into tasks for the right agent and keeps decisions in one place."),
  ("ops", "Operations Manager", "operations", "Keeps routines, checklists and the weekly review running."),
  ("researcher", "Researcher", "growth", "Researches markets, competitors, audiences and trends, with sources."),
  ("writer", "Content Writer", "content", "Writes posts, scripts, captions and newsletters in the student's voice."),
  ("sales", "Sales Assistant", "revenue", "Prepares offers, follow-ups and call notes."),
  ("outreach", "Outreach Agent", "outreach", "Finds leads and drafts first messages for review."),
  ("builder", "Builder", "build", "Builds automations, scripts and small tools in the workspace folder."),
  ("finance", "Finance Assistant", "finance", "Tracks invoices, costs and subscriptions."),
  ("store", "Store Manager", "ecom", "Keeps an eye on products, orders and the shop."),
]

final class Router {
  var files: [String: (String, Data)] = [:]
  let token = (0..<4).map { _ in String(format: "%08x", UInt32.random(in: 0...UInt32.max)) }.joined()
  var port: UInt16 = 0
  private let lock = NSLock()
  private var active: [String: AgentRun] = [:]
  private var schedulerTimer: Timer?
  var openExternal: ((String) -> Void)?
  let store = Store.shared

  // MARK: entry
  func handle(_ r: HTTPRequest) async -> HTTPResponse {
    let origin = "http://127.0.0.1:\(port)"
    guard r.headers["host"] == "127.0.0.1:\(port)" else { return .error(403, "host", "Unknown host.") }
    if r.path == "/launch" {
      guard r.query["t"] == token else { return .error(403, "forbidden", "Open 187N Agent HQ from your Applications folder.") }
      return .redirect(License.current == nil || store.setting("setupComplete") as? Bool != true ? "/setup" : "/", headers: ["Set-Cookie": "hqs=\(token); HttpOnly; SameSite=Strict; Path=/"])
    }
    // Connection pages that finish in the student's browser land here (no data is returned).
    if r.path == "/connected" {
      store.emit("connector.updated", ["title": r.query["connected"] ?? r.query["platform"] ?? "account"])
      let ok = r.query["error"] == nil
      return .data(Data(Router.browserPage(ok ? "Connected" : "Not connected", ok ? "You can close this tab and go back to 187N Agent HQ." : (r.query["error_message"] ?? r.query["error"] ?? "The connection was not completed.")).utf8), type: "text/html; charset=utf-8")
    }
    guard r.cookie("hqs") == token else { var res = HTTPResponse.data(Data(Router.browserPage("187N Agent HQ", "Open 187N Agent HQ from your Applications folder.").utf8), type: "text/html; charset=utf-8"); res.status = 401; return res }
    if r.method != "GET" && r.method != "HEAD" && r.headers["origin"] != origin { return .error(403, "origin", "Writes are accepted from the app only.") }
    if r.path.hasPrefix("/api/hq/v1/") {
      guard License.current.map({ !$0.isExpired }) == true else { return .error(402, "license_required", "This copy of 187N Agent HQ needs a valid licence. Open Setup.") }
      if r.path == "/api/hq/v1/documents/file" { return Documents.serve(r.query) }
      do { let v = try await hq(r.method, String(r.path.dropFirst(11)), r); return v as? HTTPResponse ?? .json(v) }
      catch let e as NetError { return .error(e.status >= 400 ? (e.status == 401 ? 424 : e.status) : 502, e.code, e.message) }
      catch let e as APIError { return .error(e.status, e.code, e.message) }
      catch { return .error(500, "server_error", error.localizedDescription) }
    }
    if r.path.hasPrefix("/api/student/") {
      do { let v = try await student(r.method, String(r.path.dropFirst(13)), r); return v as? HTTPResponse ?? .json(v) }
      catch let e as NetError { return .error(e.status >= 400 ? (e.status == 401 ? 422 : e.status) : 502, e.code, e.message) }
      catch let e as APIError { return .error(e.status, e.code, e.message) }
      catch { return .error(500, "server_error", error.localizedDescription) }
    }
    return asset(r.path)
  }

  private func asset(_ path: String) -> HTTPResponse {
    let ready = License.current != nil && store.setting("setupComplete") as? Bool == true
    var key: String
    switch path {
    case "/": if !ready { return .redirect("/setup") }; key = "index.html"
    case "/setup": key = "setup.html"
    case "/favicon.ico": key = "static/logo-ui.png"
    default: key = String(path.dropFirst())
    }
    guard let (type, data) = files[key] else { return .error(404, "not_found", "Not found.") }
    let hashed = key.contains("/dist/chunk-") || key.contains("/dist/asset-")
    return .data(data, type: type, cache: hashed ? "public, max-age=31536000, immutable" : "no-cache")
  }

  static func browserPage(_ title: String, _ text: String) -> String {
    "<!doctype html><meta charset=utf-8><title>\(title)</title><body style=\"margin:0;display:grid;place-items:center;height:100vh;background:#08090a;color:#e6e8eb;font:15px -apple-system,system-ui\"><div style=\"text-align:center;max-width:420px\"><h1 style=\"font-weight:600;font-size:22px\">\(title)</h1><p style=\"color:#9aa0a6\">\(text)</p></div>"
  }

  // MARK: data helpers
  var workspace: String {
    let p = store.setting("workspace") as? String ?? (NSHomeDirectory() + "/Documents/187N Agent HQ")
    try? FileManager.default.createDirectory(atPath: p, withIntermediateDirectories: true)
    return p
  }
  var agents: [J] { store.list("agents") }
  func agent(_ id: String?) -> J? { agents.first { ($0["id"] as? String) == id } ?? agents.first }
  func runtimeName(_ id: String) -> String { RUNTIMES.first { $0.id == id }?.name ?? id }
  func profiles() -> [J] {
    agents.map { a in
      let rt = a["runtime"] as? String ?? "claude", dept = a["department"] as? String ?? "operations"
      return ["id": a["id"] ?? "", "name": a["name"] ?? "", "department": dept, "department_name": DEPARTMENTS.first { $0["id"] as? String == dept }?["name"] ?? dept,
              "role": a["role"] ?? "", "installed": Agents.ready(rt), "model": (a["model"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Default model", "provider": runtimeName(rt),
              "effort": a["effort"] as? String ?? "default", "fallback_enabled": false, "runtime_name": rt]
    }
  }
  func projects() -> [J] { [["id": "workspace", "name": (workspace as NSString).lastPathComponent, "path": workspace]] }
  func iso(_ t: Double) -> String { ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: t)) }

  func routinesShaped() -> [J] {
    let runs = store.list("runs")
    return store.list("routines").map { r in
      var x = r
      let expr = (r["schedule"] as? J)?["expr"] as? String ?? ""
      let mine = runs.filter { ($0["routine"] as? String) == (r["id"] as? String) && (($0["created_at"] as? Double) ?? 0) > now() - 48 * 3600 }
      x["schedule"] = ["kind": "cron", "expr": expr, "display": Cron.describe(expr)]
      x["state"] = (r["enabled"] as? Bool) == false ? "paused" : "scheduled"
      x["paused"] = (r["enabled"] as? Bool) == false ? true : NSNull()
      x["next_run_at"] = (r["enabled"] as? Bool) == false ? NSNull() : (Cron(expr)?.next(after: Date()).map { ISO8601DateFormatter().string(from: $0) } ?? NSNull())
      x["recent"] = ["hours": 48, "runs": mine.count, "failed": mine.filter { ($0["status"] as? String) == "failed" }.count]
      x["pending_results"] = [J]()
      x["office_project"] = "workspace"
      return x
    }
  }

  // MARK: runs
  // Starts an agent run (a chat message, a task or a routine) and streams it to the office.
  // extras: folders, environment, a JSON schema or no tools for this run; onDone: the result, once (after the office is updated).
  @discardableResult func startRun(profile: String?, prompt: String, conversation: String? = nil, task: String? = nil, routine: String? = nil, title: String,
                                   extras: RunExtras = RunExtras(), onDone: ((AgentRun.Result) -> Void)? = nil) -> J {
    let a = agent(profile) ?? [:]
    let agentID = a["id"] as? String ?? "chief", rt = a["runtime"] as? String ?? "claude"
    let runID = newID("run")
    let run: J = ["id": runID, "run_id": runID, "conversation": orNull(conversation), "task": orNull(task), "routine": orNull(routine), "title": title, "profile": agentID, "project": "workspace",
                  "status": "running", "last_event": "run.accepted", "created_at": now(), "updated_at": now(), "observed_at": now(), "requested_model": a["model"] ?? "", "requested_provider": runtimeName(rt),
                  "runtime": ["model": a["model"] ?? "", "phase": "running", "provider": runtimeName(rt), "source": rt], "session_id": NSNull(), "stale": false,
                  "usage": ["input_tokens": 0, "output_tokens": 0, "total_tokens": 0], "pending_approvals": [J](), "clarification": NSNull(), "cached": false]
    store.prepend("runs", run, limit: 300)
    let base: J = ["profile": agentID, "conversation": orNull(conversation), "run_id": runID, "title": title]
    store.emit("run.accepted", base)
    var fullPrompt = prompt, resume: String? = nil
    if let conversation {
      if rt == "claude" { resume = store.list("conversations").first { ($0["id"] as? String) == conversation }?["session_claude"] as? String }
      else {
        let history = store.messages(conversation).dropLast().suffix(8).map { (($0["role"] as? String) == "user" ? "User: " : "You: ") + (($0["content"] as? String) ?? "") }
        if !history.isEmpty { fullPrompt = "Conversation so far:\n" + history.joined(separator: "\n") + "\n\nNew message from the user:\n" + prompt }
      }
    }
    let role = "You are \(a["name"] as? String ?? "an agent") in the student's 187N Agent HQ (department: \(a["department"] as? String ?? "")). \(a["instructions"] as? String ?? a["role"] as? String ?? "") Work in the current folder. Answer in the language the user writes in, clearly and concisely."
    let ar = AgentRun(id: runID)
    lock.lock(); active[runID] = ar; lock.unlock()
    ar.start(runtime: rt, model: a["model"] as? String, role: role, prompt: fullPrompt, cwd: workspace, resume: resume, editAllowed: (store.setting("permissions") as? String ?? "edit") == "edit", extras: extras,
      onDelta: { [weak self] d in self?.store.emit("message.delta", base.merging(["delta": d, "event": "message.delta"]) { $1 }) },
      onTool: { [weak self] name, _ in
        self?.store.emit("tool.started", base.merging(["tool": name]) { $1 })
        self?.store.update("runs", id: runID) { x in var steps = x["steps"] as? [J] ?? []; if steps.count < 300 { steps.append(["tool": name, "at": now()]) }; x["steps"] = steps }
      },
      done: { [weak self] res in
        guard let self else { return }
        let failed = res.error != nil
        self.store.update("runs", id: runID) { x in
          x["status"] = failed ? "failed" : "completed"; x["last_event"] = failed ? "run.failed" : "run.completed"; x["updated_at"] = now(); x["observed_at"] = now()
          x["runtime"] = ["model": a["model"] ?? "", "phase": "finished", "provider": self.runtimeName(rt), "source": rt]
          x["usage"] = ["input_tokens": res.input, "output_tokens": res.output, "total_tokens": res.input + res.output]
          x["session_id"] = orNull(res.session); x["result"] = res.text; x["error"] = orNull(res.error)
        }
        if let conversation {
          self.store.appendMessage(conversation, ["role": "assistant", "content": failed ? "⚠️ " + (res.error ?? "") + (res.text.isEmpty ? "" : "\n\n" + res.text) : res.text, "at": now()])
          if rt == "claude", let s = res.session { self.store.update("conversations", id: conversation) { $0["session_claude"] = s } }
        }
        if let task {
          self.store.update("tasks", id: task) { t in t["status"] = failed ? "blocked" : "done"; t["updated_at"] = now(); t["completed_at"] = failed ? NSNull() : now(); t["result"] = failed ? (res.error ?? "") : res.text }
          self.store.emit("task.updated", ["profile": agentID, "task_id": task, "title": title])
        }
        if let routine {
          self.store.update("routines", id: routine) { x in x["last_run_at"] = self.iso(now()); x["last_status"] = failed ? "error" : "ok"
            var rep = x["repeat"] as? J ?? [:]; rep["completed"] = (rep["completed"] as? Int ?? 0) + 1; x["repeat"] = rep
            x["latest_execution"] = ["id": runID, "status": failed ? "failed" : "completed", "started_at": self.iso(now()), "finished_at": self.iso(now()), "error": orNull(res.error)] }
        }
        self.store.emit(failed ? "run.failed" : "run.completed", base.merging(["reason": res.error ?? ""]) { $1 })
        self.lock.lock(); self.active[runID] = nil; self.lock.unlock()
        onDone?(res)
      })
    return run
  }
  private func activeRuns() -> [AgentRun] { lock.lock(); defer { lock.unlock() }; return Array(active.values) }
  func stopRun(_ id: String) -> Bool { lock.lock(); let r = active[id]; lock.unlock(); r?.stop(); return r != nil }

  // Routines run on schedule while the app is open.
  func startScheduler() {
    DispatchQueue.main.async { [weak self] in
      self?.schedulerTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.tick() }
    }
  }
  private var lastTick = Date()
  private func tick() {
    let from = lastTick, to = Date(); lastTick = to
    guard License.current != nil else { return }
    for r in store.list("routines") where (r["enabled"] as? Bool) != false {
      guard let expr = (r["schedule"] as? J)?["expr"] as? String, let cron = Cron(expr), let next = cron.next(after: from.addingTimeInterval(-1)), next <= to else { continue }
      startRun(profile: r["profile"] as? String, prompt: r["prompt"] as? String ?? "", routine: r["id"] as? String, title: r["name"] as? String ?? "Routine")
    }
    Knowledge.shared.indexIfStale()
    Ext.tick(self)
  }

  // MARK: /api/hq/v1
  func hq(_ method: String, _ path: String, _ r: HTTPRequest) async throws -> Any {
    let q = r.query
    for handler in Ext.hq { if let res = try await handler(method, path, r, self) { return res } }
    if method == "GET" || method == "HEAD" {
      switch path {
      case "health": return ["ok": true, "service": "187n-agent-hq", "observed_at": now(), "workers": 1, "execution": "local", "release": AppInfo.version, "event_replay": "memory", "emergency_stop_available": true, "scope": "this Mac"]
      case "bootstrap":
        return ["version": AppInfo.version, "last_event_id": store.latestEventID, "observed_at": now(), "connected": true, "reason": NSNull(), "profiles": profiles(), "departments": DEPARTMENTS,
                "projects": projects(), "boards": ["operations"], "preferences": ["theme": "dark"], "conversations": store.list("conversations"), "source": "187N Agent HQ", "release": AppInfo.version,
                "capabilities": ["chat_completions": false, "session_chat": true, "session_chat_streaming": true, "run_submission": true, "run_status": true, "run_events_sse": false, "run_stop": true,
                                 "run_steer": false, "run_approval_response": false, "tool_progress_events": true, "approval_events": false, "model_options": true, "jobs_admin": true,
                                 "memory_write_api": false, "skills_api": false, "audio_api": VoiceAPI.ready, "realtime_voice": VoiceAPI.ready, "admin_config_rw": false]]
      case "boards": return ["boards": [["board": "operations", "connected": true, "tasks": store.list("tasks")]], "routines": routinesShaped(), "observed_at": now()]
      case "runs": return store.list("runs")
      case "team":
        let rs = routinesShaped()
        let groups: [J] = DEPARTMENTS.compactMap { d in
          let did = d["id"] as! String
          let jobs: [J] = rs.filter { r in agents.first { $0["id"] as? String == r["profile"] as? String }?["department"] as? String == did }.map { x in
            ["id": x["id"] ?? "", "name": x["name"] ?? "", "profile": x["profile"] ?? "", "group": did, "enabled": x["enabled"] ?? true, "schedule": (x["schedule"] as? J)?["display"] ?? "",
             "last_run_at": orNull(x["last_run_at"]), "last_status": orNull(x["last_status"]), "next_run_at": orNull(x["next_run_at"])] }
          if jobs.isEmpty { return nil }
          let issues = jobs.filter { $0["last_status"] as? String == "error" }.count
          return ["id": did, "name": d["name"]!, "department": did, "owner_profile": agents.first { $0["department"] as? String == did }?["id"] ?? "", "description": "Scheduled work for \(d["name"]!).",
                  "jobs": jobs, "enabled_count": jobs.filter { $0["enabled"] as? Bool != false }.count, "issue_count": issues, "state": issues > 0 ? "needs attention" : "enabled"]
        }
        return ["groups": groups, "other_routines": [J](), "observed_at": now(), "read_errors": [J](), "source": "local", "scope": "local"]
      case "readiness":
        let rs = routinesShaped(), rts = Agents.detect()
        return ["schema": "local", "observed_at": now(), "live": true, "ready": rts.contains { $0["ready"] as? Bool == true }, "gateway_reachable": true, "acceptance": "local",
                "profiles": profiles().map { ["id": $0["id"]!, "name": $0["name"]!, "installed": $0["installed"]!, "reachable": $0["installed"]!, "state": ($0["installed"] as? Bool) == true ? "configured" : "unavailable", "observed_at": now(), "verification": "local", "last_verified_result": NSNull()] as J },
                "fleet": ["observed_at": now(), "stale": false, "incidents": [J](), "workflows": rs.map { ["id": $0["id"]!, "name": $0["name"]!, "enabled": $0["enabled"] ?? true, "status": ($0["last_status"] as? String) == "error" ? "failing" : "ok", "last_run": $0["last_run_at"] ?? NSNull(), "next_run": $0["next_run_at"] ?? NSNull(), "failure_kind": NSNull(), "last_verified_result": NSNull()] as J }],
                "native_runtimes": [J](), "blockers": rts.filter { $0["installed"] as? Bool == true && $0["ready"] as? Bool != true }.map { ["id": "runtime:" + ($0["id"] as! String), "reason": ($0["name"] as! String) + " needs sign-in"] as J },
                "connector_evidence": [J](), "scope": "local", "continuity": "local"]
      case "routines": return routinesShaped()
      case "conversations": return store.list("conversations")
      case "models":
        let p = agent(q["profile"]) ?? [:], rt = p["runtime"] as? String ?? "claude"
        let models: [String: [String]] = ["claude": ["opus", "sonnet", "haiku"], "codex": ["gpt-5.5", "gpt-5.5-codex", "gpt-5-mini"], "hermes": []]
        return ["profile": p["id"] ?? "chief", "model": p["model"] ?? "", "provider": runtimeName(rt), "providers": [["id": rt, "name": runtimeName(rt), "configured": true, "current": true, "models": models[rt] ?? []]], "source": "local", "observed_at": now(), "capability_scope": "local"]
      case "departments", "approvals", "lessons", "skills", "usage", "brain/submissions": return [J]()
      case "skills/installed": return Skills.installed()
      case "briefs": return ["text": agent(q["profile"])?["instructions"] ?? "", "updated_at": NSNull()]
      case "workflow": return try Workflow.route(q, runs: store.list("runs")) { [weak self] id in self?.agent(id)?["name"] as? String ?? id }
      case "integrations": return await integrations()
      case "events": return ["events": store.recentEvents(), "observed_at": now()]
      case "cockpit/usage": return usage(days: Int(q["days"] ?? "30") ?? 30)
      case "cockpit/revenue": return Records.revenue()
      case "brain/vault": return vault()
      case "brain/graph": return try graph(q["scope"] ?? "", countOnly: q["count"] == "1")
      case "brain/communities": return communities()
      case "workspace/dashboard":
        return ["context": store.value("context") ?? J(), "tasks": store.list("tasks").map { $0.merging(["source": "Agents"]) { $1 } }, "runs": [J](), "approvals": [J](), "agents": profiles(),
                "calendar": await calendar(from: Date(), to: Date(timeIntervalSinceNow: 7 * 86400)), "revenue": Records.periodRevenue([:]), "observed_at": now(), "stale": false]
      case "workspace/dashboard-layout": return store.value("layout") ?? ["hidden": [String](), "revision": 1]
      case "workspace/work":
        let tasks: [J] = store.list("tasks").map { ["id": $0["id"]!, "title": $0["title"]!, "status": $0["status"]!, "assignee": $0["assignee"]!, "office_project": "workspace", "board": "operations", "business_membership": "all"] }
        return ["tasks": tasks, "missions": [J](), "observed_at": now(), "stale": false, "scope": ["business": q["business"] ?? "all", "project": NSNull(), "omitted_active_tasks": 0, "unknown_projects": "", "shared_projects": "", "coverage": "complete"]]
      case "workspace/calendar":
        let f = ISO8601DateFormatter()
        return await calendar(from: q["timeMin"].flatMap { f.date(from: $0) } ?? Date(timeIntervalSinceNow: -7 * 86400), to: q["timeMax"].flatMap { f.date(from: $0) } ?? Date(timeIntervalSinceNow: 30 * 86400))
      case "workspace/team/calendar": return ["calendar": [J](), "items": [J](), "sync": J()]
      case "workspace/team/content": return ["tasks": [J](), "items": [J](), "accounts": [J](), "jobs": [J](), "audit": [J](), "campaigns": [J](), "guides": [J](), "research": ["posts": [J]()], "sync": J()]
      case "workspace/team/revenue": return Records.periodRevenue(q)
      case "workspace/team/outreach": return Records.outreach()
      case "documents": return try Documents.list(q["kind"] ?? "")
      case "workspace/delivery": return Records.delivery()
      case "workspace/crm": return Records.crm()
      case "workspace/portfolio": return Records.portfolio()
      case "workspace/records/finance": return Records.financeRegister()
      case "workspace/records/finance/summary": return Records.financeSummary()
      case "workspace/records/ledger": return Records.ledger()
      case "workspace/records/finance/item":
        let id = q["id"] ?? ""
        guard let r = (Records.financeRegister()["records"] as? [J] ?? []).first(where: { ($0["recordId"] as? String) == id }) ?? Records.ledgerRows().first(where: { ($0["recordId"] as? String) == id }) else { throw APIError(404, "not_found", "This record no longer exists.") }
        return ["record": r, "revision": "1"]
      case "workspace/agents/roster":
        let rs = routinesShaped()
        return ["profiles": profiles().map { p in
          let own = rs.filter { $0["profile"] as? String == p["id"] as? String }
          return p.merging(["enrolled": true, "hasSoul": true, "soulModified": iso(now()), "soulBytes": ((agent(p["id"] as? String)?["instructions"] as? String) ?? "").utf8.count, "skills": 0,
                            "routines": ["total": own.count, "enabled": own.filter { $0["enabled"] as? Bool != false }.count, "failing": own.filter { $0["last_status"] as? String == "error" }.count,
                                         "names": own.map { ["name": $0["name"]!, "enabled": $0["enabled"] ?? true, "schedule": ($0["schedule"] as? J)?["display"] ?? "", "lastRunAt": $0["last_run_at"] ?? NSNull()] as J }]]) { $1 }
        }, "defaultRoutines": ["total": 0, "enabled": 0, "failing": 0, "names": [J]()], "distinctSkills": 0, "generatedAt": iso(now()), "source": ["path": "local", "scope": "local", "note": "Your agents"]]
      case "workspace/agents/soul":
        guard let a = agent(q["profile"]) else { throw APIError(404, "not_found", "Unknown agent.") }
        let text = "# \(a["name"] as? String ?? "")\n\n\(a["instructions"] as? String ?? a["role"] as? String ?? "")\n\nRuntime: \(runtimeName(a["runtime"] as? String ?? "claude"))"
        return ["profile": a["id"]!, "text": text, "content": text, "bytes": text.utf8.count, "modified": iso(now()), "path": "Agent instructions"]
      case "workspace/records/people": return Records.people()
      case "workspace/source/tasks/records": return ["ok": true, "domain": "tasks", "source": "local", "records": [J](), "syncState": "local", "projectNames": J(), "sectionStages": J(), "defaultStages": J(), "via": "local", "syncedAt": iso(now()), "observedAt": iso(now())]
      case "workspace/source/activity": return activity(limit: Int(q["limit"] ?? "50") ?? 50)
      case "workspace/source/hermes/sessions":
        let data: [J] = store.list("runs").prefix(100).map { x in
          let u = x["usage"] as? J ?? [:], created = x["created_at"] as? Double ?? now(), updated = x["updated_at"] as? Double ?? created
          return ["id": x["id"]!, "source": x["routine"] is String ? "cron" : "chat", "kind": x["routine"] is String ? "cron" : "chat", "jobId": orNull(x["routine"]), "model": (x["runtime"] as? J)?["model"] ?? "",
                  "provider": (x["runtime"] as? J)?["provider"] ?? "", "messageCount": 2, "toolCallCount": 0, "apiCallCount": 1,
                  "tokens": ["input": u["input_tokens"] ?? 0, "output": u["output_tokens"] ?? 0, "cacheRead": 0, "cacheWrite": 0, "reasoning": 0, "total": u["total_tokens"] ?? 0],
                  "highToken": (u["total_tokens"] as? Int ?? 0) > 100_000, "cwd": NSNull(), "title": x["title"] ?? "Run", "startedAt": iso(created), "endedAt": iso(updated), "rel": "",
                  "endReason": x["status"] ?? "", "durationSec": Int(updated - created), "archived": false, "costStatus": "not reported"]
        }
        return ["ok": true, "generatedAt": iso(now()), "sessions": ["ok": true, "source": "local", "data": data], "counts": ["total": data.count, "returned": data.count, "limit": 100, "messageRows": 0], "note": "", "via": "local", "syncedAt": iso(now()), "observedAt": iso(now())]
      case "workspace/source/hermes/memory":
        if let name = q["file"] {
          guard let f = memoryFiles().first(where: { $0.name == name }) else { throw APIError(404, "not_found", "Unknown document.") }
          return ["file": ["measured": true, "value": (try? String(contentsOfFile: f.path, encoding: .utf8)) ?? ""]]
        }
        let files = memoryFiles()
        return ["ok": true, "generatedAt": iso(now()), "files": ["ok": true, "source": "workspace", "data": files.map { ["name": $0.name, "path": $0.path, "bytes": $0.bytes, "human": ByteCountFormatter.string(fromByteCount: Int64($0.bytes), countStyle: .file), "modified": iso($0.modified), "rel": $0.name] as J }],
                "counts": ["files": files.count, "bytes": files.reduce(0) { $0 + $1.bytes }], "observedAt": iso(now())]
      case "workspace/source/hermes/soul": return ["soul": ["ok": false]]
      case "workspace/source/brain/librarian": return librarian()
      case "workspace/source/brain/log":
        let log = Knowledge.shared.log
        return ["ok": true, "generatedAt": iso(now()), "source": "local", "modified": iso(Knowledge.shared.indexedAt), "rel": "", "total": log.count, "returned": log.count, "capped": false, "capNote": "",
                "opCounts": log.reduce(into: [String: Int]()) { $0[$1["op"] as? String ?? "update", default: 0] += 1 }, "entries": log, "caps": ["logEntries": 40, "logBodyChars": 400], "observedAt": iso(now())]
      case "workspace/source/revenue/overview": return ["ok": true, "generatedAt": iso(now()), "tiles": J(), "sources": J(), "connected": [String](), "missing": [String](), "via": "local", "syncedAt": iso(now()), "observedAt": iso(now())]
      case "workspace/services":
        return [["id": "engine", "name": "187N Agent HQ engine", "port": Int(port), "origin": "http://127.0.0.1:\(port)", "state": "up", "detail": "Runs inside the app", "ms": 1, "checkedAt": iso(now()), "start": "Opens with the app", "launchd": NSNull(), "role": "dashboard"]] +
          Agents.detect().map { ["id": "runtime-" + ($0["id"] as! String), "name": $0["name"]!, "port": 0, "origin": "", "state": ($0["ready"] as? Bool) == true ? "up" : "down", "detail": ($0["installed"] as? Bool) == true ? (($0["version"] as? String) ?? "") : "Not installed", "ms": 0, "checkedAt": iso(now()), "start": $0["login"] ?? "", "launchd": NSNull(), "role": "agent runtime"] as J }
      case "workspace/todoist/priority": return ["actions": [J]()]
      case "social": return try await social(days: Int(q["days"] ?? "30") ?? 30)
      default:
        if path.hasPrefix("runs/"), let run = store.list("runs").first(where: { ($0["id"] as? String) == String(path.dropFirst(5)) }) { return run }
        if path.hasPrefix("records/"), Records.kinds[String(path.dropFirst(8))] != nil { return Records.list(String(path.dropFirst(8))) }
        if path.hasPrefix("conversations/"), path.hasSuffix("/messages") {
          let cid = String(path.dropFirst(14).dropLast(9))
          return ["messages": store.messages(cid)]
        }
        if path.hasPrefix("tasks/") {
          let id = String(path.split(separator: "/").last ?? "")
          guard let t = store.list("tasks").first(where: { ($0["id"] as? String) == id }) else { throw APIError(404, "not_found", "This task no longer exists.") }
          return ["task": t, "board": "operations", "office_project": projects().first?["name"] ?? "workspace", "latest_summary": t["result"] ?? "", "cancel_pending": false, "office_owned": true, "comments": [J](), "runs": store.list("runs").filter { ($0["task"] as? String) == id }]
        }
        if path == "routines/results" || path == "routines/result" {
          let id = q["id"] ?? ""
          return ["results": store.list("runs").filter { ($0["routine"] as? String) == id }.prefix(20).map { ["id": $0["id"]!, "status": $0["status"]!, "at": iso($0["created_at"] as? Double ?? now()), "text": $0["result"] ?? $0["error"] ?? ""] as J }]
        }
        throw APIError(404, "not_found", "No such page in 187N Agent HQ: \(path)")
      }
    }
    // Writes
    let body = r.json
    switch path {
    case "tasks":
      let id = newID("t"), title = (body["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Task", profile = body["profile"] as? String ?? "chief"
      let t: J = ["id": id, "title": String(title.prefix(180)), "assignee": agent(profile)?["id"] ?? profile, "status": "running", "board": "operations", "office_project": "workspace", "office_owned": true,
                  "created_at": now(), "updated_at": now(), "started_at": now(), "completed_at": NSNull(), "prompt": body["prompt"] ?? "", "mission_id": NSNull(), "session_id": NSNull(), "project_id": NSNull(),
                  "model_override": NSNull(), "provider_override": NSNull(), "reasoning_effort": NSNull(), "parent_id": NSNull()]
      store.prepend("tasks", t, limit: 400)
      store.emit("task.created", ["task_id": id, "profile": t["assignee"]!, "title": title])
      startRun(profile: t["assignee"] as? String, prompt: (title + "\n\n" + (body["prompt"] as? String ?? "")).trimmingCharacters(in: .whitespacesAndNewlines), task: id, title: title)
      return ["id": id, "task": t]
    case "conversations":
      let c: J = ["id": newID("c"), "profile": body["profile"] as? String ?? "chief", "project": "workspace", "title": body["title"] as? String ?? "Conversation", "created_at": now()]
      store.prepend("conversations", c, limit: 300); return c
    case "workspace/dashboard-layout":
      let layout: J = ["hidden": body["hidden"] as? [String] ?? [], "revision": ((store.value("layout") as? J)?["revision"] as? Int ?? 1) + 1]
      store.setValue("layout", layout); return layout
    case "context", "workspace/context":
      var c = store.value("context") as? J ?? [:]; for (k, v) in body { c[k] = v }; c["revision"] = (c["revision"] as? Int ?? 1) + 1; c["updated_at"] = now()
      store.setValue("context", c); return c
    case "cache/refresh": _ = Agents.detect(force: true); return ["ok": true]
    case "emergency-stop":
      let all = activeRuns(); all.forEach { $0.stop() }
      return ["ok": true, "stopped": all.count]
    case "profiles/settings":
      guard let id = body["profile"] as? String else { throw APIError(422, "bad_request", "Choose an agent.") }
      store.update("agents", id: id) { a in
        if let m = body["model"] as? String { a["model"] = m }
        if let rt = body["runtime"] as? String, RUNTIMES.contains(where: { $0.id == rt }) { a["runtime"] = rt }
        if let e = body["effort"] as? String { a["effort"] = e }
      }
      return profiles().first { $0["id"] as? String == id } ?? [:]
    case "briefs":
      guard let id = body["profile"] as? String else { throw APIError(422, "bad_request", "Choose an agent.") }
      store.update("agents", id: id) { $0["instructions"] = String((body["text"] as? String ?? "").prefix(8000)) }
      return ["ok": true]
    case "routines/create":
      let expr = (body["schedule"] as? String ?? "").trimmingCharacters(in: .whitespaces)
      guard Cron(expr) != nil else { throw APIError(422, "bad_schedule", "Use a schedule like 0 9 * * 1-5 (weekdays at 09:00).") }
      let r: J = ["id": newID("r"), "name": body["name"] as? String ?? body["title"] as? String ?? "Routine", "profile": body["profile"] as? String ?? "chief", "prompt": body["prompt"] as? String ?? "",
                  "schedule": ["kind": "cron", "expr": expr], "enabled": !((body["paused"] as? Bool) ?? false), "needs_ok": orNull(body["needs_ok"]), "last_run_at": NSNull(), "last_status": NSNull(),
                  "repeat": ["times": NSNull(), "completed": 0], "timezone": NSNull(), "workdir": workspace, "model": "", "provider": "", "reasoning_effort": "", "created_at": now()]
      store.prepend("routines", r, limit: 200); store.emit("routine.created", ["profile": r["profile"]!, "title": r["name"]!])
      return ["id": r["id"]!, "routine": r]
    case "routines/edit":
      guard let id = body["id"] as? String else { throw APIError(422, "bad_request", "Choose a routine.") }
      if let s = body["schedule"] as? String, Cron(s) == nil { throw APIError(422, "bad_schedule", "That schedule is not valid.") }
      store.update("routines", id: id) { x in
        for k in ["name", "prompt", "profile"] { if let v = body[k] as? String { x[k] = v } }
        if let s = body["schedule"] as? String { x["schedule"] = ["kind": "cron", "expr": s] }
      }
      store.emit("routine.updated", ["title": body["name"] as? String ?? "routine"]); return ["ok": true]
    case "integrations/layout": return ["ok": true]
    case "documents/open": return try Documents.open(body)
    default:
      if path.hasPrefix("conversations/"), path.hasSuffix("/prompt") {
        let cid = String(path.dropFirst(14).dropLast(7))
        guard let c = store.list("conversations").first(where: { ($0["id"] as? String) == cid }) else { throw APIError(404, "not_found", "Unknown conversation.") }
        let text = (body["prompt"] as? String ?? body["input"] as? String ?? body["message"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw APIError(422, "bad_request", "Write a message first.") }
        store.appendMessage(cid, ["role": "user", "content": text, "at": now()])
        return startRun(profile: c["profile"] as? String, prompt: text, conversation: cid, title: c["title"] as? String ?? "Conversation")
      }
      if path.hasPrefix("records/") { return try Records.write(String(path.dropFirst(8)), body) }
      if path.hasPrefix("runs/"), path.hasSuffix("/stop") { let id = String(path.dropFirst(5).dropLast(5)); return ["ok": stopRun(id)] }
      if path.hasPrefix("tasks/"), path.hasSuffix("/cancel") {
        let id = String(path.dropFirst(6).dropLast(7))
        for run in store.list("runs") where (run["task"] as? String) == id && (run["status"] as? String) == "running" { _ = stopRun(run["id"] as! String) }
        store.update("tasks", id: id) { $0["status"] = "cancelled"; $0["updated_at"] = now() }
        store.emit("task.updated", ["task_id": id]); return ["ok": true]
      }
      if path.hasPrefix("routines/") {
        let op = String(path.dropFirst(9)), id = body["id"] as? String ?? ""
        guard let r = store.list("routines").first(where: { ($0["id"] as? String) == id }) else { throw APIError(404, "not_found", "Unknown routine.") }
        switch op {
        case "run": return startRun(profile: r["profile"] as? String, prompt: r["prompt"] as? String ?? "", routine: id, title: r["name"] as? String ?? "Routine")
        case "pause", "resume": store.update("routines", id: id) { $0["enabled"] = op == "resume" }; store.emit("routine.updated", ["title": r["name"] ?? ""]); return ["ok": true]
        case "delete", "remove": store.setList("routines", store.list("routines").filter { ($0["id"] as? String) != id }); store.emit("routine.updated", ["title": r["name"] ?? ""]); return ["ok": true]
        default: break
        }
      }
      if path.hasPrefix("integrations/") {
        let parts = path.split(separator: "/").map(String.init)
        if parts.count == 3 { return try await integrationAction(parts[1].removingPercentEncoding ?? parts[1], parts[2]) }
      }
      throw APIError(501, "not_available", "This action is not available in this edition.")
    }
  }

  // MARK: pages' data
  func usage(days: Int) -> J {
    let since = now() - Double(days) * 86400, runs = store.list("runs").filter { ($0["created_at"] as? Double ?? 0) >= since }
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    let sources: [J] = RUNTIMES.compactMap { rt in
      let mine = runs.filter { (($0["runtime"] as? J)?["source"] as? String) == rt.id }
      guard !mine.isEmpty || Agents.detect().contains(where: { $0["id"] as? String == rt.id && $0["installed"] as? Bool == true }) else { return nil }
      let series: [J] = (0..<min(days, 60)).reversed().map { back in
        let day = f.string(from: Date(timeIntervalSinceNow: -Double(back) * 86400))
        let today = mine.filter { f.string(from: Date(timeIntervalSince1970: $0["created_at"] as? Double ?? 0)) == day }
        let i = today.reduce(0) { $0 + ((($1["usage"] as? J)?["input_tokens"] as? Int) ?? 0) }, o = today.reduce(0) { $0 + ((($1["usage"] as? J)?["output_tokens"] as? Int) ?? 0) }
        return ["date": day, "input": i, "output": o, "cacheRead": 0, "cacheWrite": 0, "reasoning": 0, "tokens": i + o, "calls": today.count]
      }
      let sum = { (k: String) in series.reduce(0) { $0 + ($1[k] as? Int ?? 0) } }
      return ["id": rt.id, "name": rt.name, "state": "connected", "source": "Runs in 187N Agent HQ", "totals": ["input": sum("input"), "output": sum("output"), "cacheRead": 0, "cacheWrite": 0, "reasoning": 0, "tokens": sum("tokens"), "calls": sum("calls"), "sessions": mine.count],
              "series": series, "models": [J](), "cost": NSNull(), "costLabel": "Cost is billed by \(rt.name)", "observedAt": now(), "lastActivity": orNull(mine.first?["created_at"]), "limits": NSNull(),
              "coverage": ["indexed": 1, "total": 1, "missing": 0], "note": "Tokens from runs started in 187N Agent HQ"]
    }
    return ["days": days, "sources": sources, "observedAt": now()]
  }

  func activity(limit: Int) -> J {
    let df = DateFormatter(); df.dateFormat = "EEEE d MMMM"
    let tf = DateFormatter(); tf.dateFormat = "HH:mm"
    let items: [J] = store.list("activity").prefix(limit).map { a in
      let ts = a["ts"] as? String ?? iso(now()), d = ISO8601DateFormatter().date(from: ts) ?? Date()
      let who = agent(a["profile"] as? String)?["name"] as? String ?? ""
      return ["ts": ts, "relative": "", "source": "agents", "kind": a["kind"] ?? "event", "title": a["title"] ?? "", "detail": who, "severity": a["severity"] ?? "info", "day": String(ts.prefix(10)), "dayLabel": df.string(from: d), "time": tf.string(from: d), "precision": "minute", "href": "", "ref": ""]
    }
    let dayKeys = Array(Set(items.compactMap { $0["day"] as? String })).sorted(by: >)
    var days: [J] = []
    for day in dayKeys {
      let same = items.filter { ($0["day"] as? String) == day }
      let label: Any = same.first?["dayLabel"] ?? day
      days.append(["date": day, "label": label, "count": same.count])
    }
    return ["ok": true, "generatedAt": iso(now()), "cap": limit, "total": items.count, "shown": items.count, "truncated": false, "capNote": "", "oldestShown": orNull(items.last?["ts"]), "newestShown": orNull(items.first?["ts"]),
            "sources": [["key": "agents", "label": "Your office", "source": "local", "ok": true, "count": items.count, "cap": NSNull(), "files": 0, "note": ""]], "sourceCounts": ["agents": items.count],
            "days": days, "privacy": "Stored on this Mac", "events": ["ok": true, "source": "local", "data": items], "via": "local", "syncedAt": iso(now()), "observedAt": iso(now())]
  }

  struct MemoryFile { let name: String, path: String, bytes: Int, modified: Double }
  func memoryFiles() -> [MemoryFile] {
    ["CLAUDE.md", "AGENTS.md", "README.md"].compactMap { n in
      let p = (workspace as NSString).appendingPathComponent(n)
      guard let a = try? FileManager.default.attributesOfItem(atPath: p) else { return nil }
      return MemoryFile(name: n, path: p, bytes: (a[.size] as? Int) ?? 0, modified: (a[.modificationDate] as? Date)?.timeIntervalSince1970 ?? now())
    }
  }

  func librarian() -> J {
    let k = Knowledge.shared, folder = k.root
    let entry: J = ["label": "notes-indexer", "name": "Notes indexer", "plist": "", "schedule": ["value": "every 10 minutes while the app is open", "source": "app", "measured": true], "program": ["value": "built in", "source": "app", "measured": true],
                    "plistNote": ["value": "", "source": "app", "measured": true], "loaded": ["value": folder != nil, "source": "app", "measured": true], "lastExit": ["value": k.error == nil ? 0 : 1, "source": "app", "measured": true],
                    "running": ["value": false, "source": "app", "measured": true], "state": folder == nil ? "not enabled" : (k.error == nil ? "ok" : "failing"),
                    "lastOk": k.indexedAt > 0 ? ["value": iso(k.indexedAt), "source": "app", "measured": true] : ["value": NSNull(), "source": "app", "measured": false, "reason": folder == nil ? "Choose a notes folder in Setup." : "Not indexed yet."]]
    return ["ok": true, "generatedAt": iso(now()), "agents": [entry], "queue": ["shared": ["value": 0, "source": "app", "measured": true, "files": [J]()], "private": ["value": 0, "source": "app", "measured": true], "batchSize": ["value": 0, "source": "app", "measured": true, "note": ""]],
            "open": ["held": ["value": 0, "source": "app", "measured": true, "items": [String]()], "questions": ["value": 0, "source": "app", "measured": true, "items": [String]()]],
            "launchctl": ["value": true, "source": "app", "measured": true], "policy": ["notEnabledIsNotFailed": "Choosing no notes folder is not a failure."], "tookMs": Int(k.seconds * 1000), "observedAt": iso(now())]
  }

  func graph(_ scope: String, countOnly: Bool) throws -> J {
    guard ["second", "workspace"].contains(scope) else { throw APIError(400, "bad_scope", "scope must be second or workspace") }
    let (notes, pairs) = Knowledge.shared.snapshot()
    var degree = [Int](repeating: 0, count: notes.count)
    let edges = pairs.sorted { $0.0 != $1.0 ? $0.0 < $1.0 : $0.1 < $1.1 }
    for (a, b) in edges { degree[a] += 1; degree[b] += 1 }
    let counts: J = ["nodes": notes.count, "edges": edges.count, "isolated": degree.filter { $0 == 0 }.count]
    let vaultInfo: J = ["name": (Knowledge.shared.root as NSString?)?.lastPathComponent ?? "Notes", "root": "", "indexed_at": Knowledge.shared.indexedAt, "index_seconds": Knowledge.shared.seconds,
                        "notes": notes.count, "canvases": 0, "attachments": 0, "unresolved_links": 0, "unresolved_scope": "entire vault", "errors": [String](), "error_count": 0, "complete": true, "scope": "Your notes folder"]
    if countOnly { return ["scope": scope, "counts": counts, "bytes_gzip": max(1024, notes.count * 40), "estimate": false, "vault": ["name": vaultInfo["name"]!, "indexed_at": vaultInfo["indexed_at"]!]] }
    var folders: [String] = [], folderIndex: [String: Int] = [:]
    for n in notes where folderIndex[n.folder] == nil { folderIndex[n.folder] = folders.count; folders.append(n.folder) }
    var tagNames: [String] = [], tagIndex: [String: Int] = [:]
    for n in notes { for t in n.tags where tagIndex[t] == nil { tagIndex[t] = tagNames.count; tagNames.append(t) } }
    var flat: [Int] = [], prev = 0
    for (a, b) in edges { flat.append(a - prev); flat.append(b); prev = a }
    let hubs = degree.enumerated().sorted { $0.element > $1.element }.prefix(12).map { $0.offset }
    return ["format": 1, "scope": scope, "prefix": "", "folders": folders, "folder": notes.map { folderIndex[$0.folder]! }, "names": notes.map { ($0.path as NSString).lastPathComponent },
            "titles": notes.map { $0.title }, "kinds": ["note"], "kind": notes.map { _ in 0 }, "tag_names": tagNames, "tags": notes.map { $0.tags.map { tagIndex[$0]! } },
            "edges": flat, "edge_encoding": "source-delta", "hubs": hubs, "counts": counts, "vault": vaultInfo]
  }
  func communities() -> J {
    let (notes, pairs) = Knowledge.shared.snapshot()
    let tops = Array(Set(notes.map { $0.path.split(separator: "/").count > 1 ? String($0.path.split(separator: "/")[0]) : "Notes" })).sorted()
    var labels: J = [:], community: J = [:]
    for (i, t) in tops.prefix(24).enumerated() { labels[String(i)] = t }
    for n in notes { let t = n.path.split(separator: "/").count > 1 ? String(n.path.split(separator: "/")[0]) : "Notes"; if let i = tops.prefix(24).firstIndex(of: t) { community[n.path] = i } }
    return ["available": !notes.isEmpty, "built_at": Knowledge.shared.indexedAt, "built_at_source": "notes index", "commit": "", "root": "", "labels": labels, "community": community,
            "links": pairs.prefix(400).map { [notes[$0.0].path, notes[$0.1].path, "links_to", "EXTRACTED"] }, "coverage": ["mapped": community.count, "graph_nodes": notes.count, "graph_files": notes.count, "missing_files": 0, "wiki_pages": notes.count, "communities": labels.count],
            "stale": false, "hyperedges": 0]
  }
  func vault() -> J {
    let (notes, pairs) = Knowledge.shared.snapshot()
    return ["vault": ["name": (Knowledge.shared.root as NSString?)?.lastPathComponent ?? "Notes", "root": "", "notes": notes.count, "canvases": 0, "attachments": 0, "unresolved_links": 0, "errors": [String](), "complete": true,
                      "ignored_patterns": [String](), "indexed_at": Knowledge.shared.indexedAt, "index_seconds": Knowledge.shared.seconds, "access": "Read only", "scope": "Your notes folder"],
            "nodes": notes.prefix(150).map { ["id": $0.path, "path": true] as J }, "edges": pairs.prefix(150).map { ["source": notes[$0.0].path, "target": notes[$0.1].path, "kind": "vault-link"] as J },
            "files": notes.count, "total_nodes": notes.count, "total_edges": pairs.count, "summary": true]
  }
}

struct APIError: Error { let status: Int, code: String, message: String; init(_ s: Int, _ c: String, _ m: String) { status = s; code = c; message = m } }
