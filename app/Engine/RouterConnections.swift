// Connections (Composio apps, Zernio social accounts, agent runtimes), the calendar, social results and the Setup API.
import Foundation

extension Router {
  var callbackURL: String { "http://127.0.0.1:\(port)/connected" }

  // Every connection in one list, in the shape the Connections page and the office's connector strip read.
  func integrations() async -> [J] {
    var out: [J] = []
    if Composio.connected, let accounts = try? await Composio.accounts() {
      for a in accounts {
        let status = (a["status"] as? String ?? "").uppercased()
        let state = status == "ACTIVE" ? "verified" : ["EXPIRED", "FAILED", "INACTIVE"].contains(status) ? "expired" : "configured"
        out.append(["id": a["id"] ?? "", "name": a["toolkit"] ?? "", "account": a["label"] ?? "", "state": state, "verified": state == "verified", "adapter": "composio", "check_available": true,
                    "reason": state == "expired" ? "The login expired. Reconnect to continue." : state == "configured" ? "Finish the login in your browser." : "", "capability": a["toolkitName"] ?? a["toolkit"] ?? "",
                    "observed_at": now(), "agent_activity": [J](), "departments": [J](), "selected_departments": [J]()])
      }
    }
    if Zernio.connected, let accounts = try? await Zernio.accounts() {
      for a in accounts {
        let ok = (a["active"] as? Bool) == true && (a["needsReconnect"] as? Bool) != true
        out.append(["id": "zernio:" + (a["id"] as? String ?? ""), "name": a["platform"] ?? "", "account": (a["handle"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? a["name"] ?? "", "state": ok ? "verified" : "expired", "verified": ok,
                    "adapter": "zernio", "check_available": true, "reason": ok ? "" : "Reconnect this account in Zernio.", "capability": "Social results and publishing (Zernio)", "observed_at": now(),
                    "agent_activity": [J](), "departments": ["content"], "selected_departments": [J]()])
      }
    }
    out += RuntimesAPI.integrationEntries()
    return out
  }

  func integrationAction(_ id: String, _ action: String) async throws -> J {
    if id.hasPrefix("runtime:") {
      let rt = Agents.detect(force: true).first { "runtime:" + ($0["id"] as! String) == id } ?? [:]
      if action == "reconnect" { return ["url": rt["docs"] ?? "", "reason": (rt["note"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Open Terminal and sign in: \(rt["login"] ?? "")", "account": rt["name"] ?? ""] }
      return ["id": id, "state": (rt["ready"] as? Bool) == true ? "verified" : "configured", "verified": (rt["ready"] as? Bool) == true, "checked": true]
    }
    if id.hasPrefix("zernio:") {
      let zid = String(id.dropFirst(7))
      let account = try await Zernio.accounts().first { ($0["id"] as? String) == zid }
      if action == "reconnect" {
        let url = try await Zernio.connectURL(account?["platform"] as? String ?? "instagram", redirect: callbackURL, reconnect: zid)
        return ["url": url, "reason": "Log in again in the new tab.", "account": account?["handle"] ?? ""]
      }
      return ["id": id, "state": account == nil ? "unavailable" : "verified", "verified": account != nil, "checked": true]
    }
    if action == "reconnect" {
      let a = try await Composio.account(id)
      let r = try await Composio.connect(toolkit: a["toolkit"] as? String ?? "", redirect: callbackURL)
      return ["url": r.url, "reason": "Complete the login in the new tab.", "account": a["label"] ?? a["toolkit"] ?? ""]
    }
    let a = try await Composio.account(id)
    let ok = (a["status"] as? String ?? "").uppercased() == "ACTIVE"
    return ["id": id, "state": ok ? "verified" : "expired", "verified": ok, "checked": true]
  }

  // Calendar events from Google Calendar connected through Composio.
  func calendar(from: Date, to: Date) async -> J {
    let tz = TimeZone.current.identifier
    guard Composio.connected else {
      return ["events": [J](), "sources": [["source": "Google Calendar", "account": "", "accountId": "", "slot": 1, "state": "unavailable", "reason": "Connect Google Calendar in Setup (Composio).", "observedAt": now(), "via": "composio", "count": 0]], "observed_at": now()]
    }
    do {
      let events = try await Composio.calendarEvents(from: from, to: to)
      let mapped: [J] = events.map { e in
        let start = (e["start"] as? J)?["dateTime"] as? String ?? (e["start"] as? J)?["date"] as? String ?? ""
        let end = (e["end"] as? J)?["dateTime"] as? String ?? (e["end"] as? J)?["date"] as? String ?? start
        let allDay = (e["start"] as? J)?["date"] != nil
        return ["id": e["id"] ?? UUID().uuidString, "uid": e["iCalUID"] ?? e["id"] ?? "", "source": "Google Calendar", "account": (e["organizer"] as? J)?["email"] ?? "", "accountId": "google", "slot": 1,
                "title": e["summary"] ?? "(No title)", "start": start, "end": end, "allDay": allDay, "sourceTimezone": tz, "endTimezone": tz, "location": orNull(e["location"]),
                "conference": (e["hangoutLink"] as? String).map { ["uri": $0, "label": "Video call"] as Any } ?? NSNull(), "attendees": [J](), "organizer": orNull(e["organizer"]),
                "status": e["status"] ?? "confirmed", "description": NSNull(), "url": e["htmlLink"] ?? "", "recurring": e["recurringEventId"] != nil, "alsoOn": [String](), "sourceState": "connected", "via": "composio"]
      }
      return ["events": mapped, "sources": [["source": "Google Calendar", "account": "", "accountId": "google", "slot": 1, "state": "connected", "reason": NSNull(), "observedAt": now(), "via": "composio", "count": mapped.count]], "observed_at": now()]
    } catch {
      let message = (error as? NetError)?.message ?? error.localizedDescription
      return ["events": [J](), "sources": [["source": "Google Calendar", "account": "", "accountId": "google", "slot": 1, "state": "unavailable", "reason": message, "observedAt": now(), "via": "composio", "count": 0]], "observed_at": now()]
    }
  }

  // Social: accounts, posts and their results (Zernio).
  func social(days: Int) async throws -> J {
    guard Zernio.connected else { return ["connected": false, "accounts": [J](), "posts": [J](), "followers": J(), "analytics": false, "note": "Connect Zernio in Setup to see your social accounts here."] }
    async let accounts = Zernio.accounts()
    async let posts = Zernio.posts(days: days)
    async let followers = Zernio.followerStats(days: days)
    let (a, p, f) = try await (accounts, posts, followers)
    return ["connected": true, "accounts": a, "posts": p.posts, "analytics": p.analytics, "note": p.note, "followers": f, "days": days, "observedAt": iso(now())]
  }

  // MARK: /api/student (Setup)
  func student(_ method: String, _ path: String, _ r: HTTPRequest) async throws -> Any {
    let body = r.json
    let licensed = License.current.map { !$0.isExpired } == true
    if method == "GET" && path == "state" {
      return ["license": orNull(License.current?.summary), "settings": ["workspace": workspace, "notesFolder": store.setting("notesFolder") ?? "", "proposalsFolder": store.setting("proposalsFolder") ?? "", "handbookFolder": store.setting("handbookFolder") ?? "",
                           "currency": Records.currency, "permissions": store.setting("permissions") ?? "edit", "setupComplete": store.setting("setupComplete") ?? false],
              "runtimes": Agents.detect(wait: true), "agents": agents, "team": TEAM.map { ["id": $0.0, "name": $0.1, "department": $0.2, "role": $0.3] as J },
              "composio": ["connected": Composio.connected, "agentApps": AgentApps.status()], "tools": ToolsAPI.summary(), "zernio": ["connected": Zernio.connected, "platforms": Zernio.platforms], "notes": ["count": Knowledge.shared.snapshot().0.count], "voice": VoiceAPI.summary, "version": AppInfo.version,
              "keys": Dictionary(uniqueKeysWithValues: [KeyName.composio, KeyName.zernio, KeyName.elevenlabs, KeyName.apify, KeyName.groq, KeyName.typesafe].map { ($0, Keychain.get($0) != nil) })]
    }
    if method == "POST" && path == "license" {
      guard let l = License.store(body["key"] as? String ?? "") else { throw APIError(422, "invalid_license", "This licence key is not valid. Check that you copied all of it.") }
      if l.isExpired { throw APIError(422, "expired_license", "This licence expired. Ask 187N for a new one.") }
      return l.summary
    }
    guard licensed else { throw APIError(402, "license_required", "Enter your licence key first.") }
    for handler in Ext.student { if let res = try await handler(method, path, r, self) { return res } }
    switch (method, path) {
    case ("POST", "keys"):
      // A service key (ElevenLabs, Apify, Groq): checked with the service first; an empty key removes it.
      let name = body["name"] as? String ?? "", key = (body["key"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard let validate = Ext.validators[name] else { throw APIError(422, "bad_key_name", "Unknown key.") }
      if key.isEmpty { Keychain.set(name, nil); store.emit("connector.updated", ["title": name]); return ["name": name, "connected": false] }
      try await validate(key)
      Keychain.set(name, key); store.emit("connector.updated", ["title": name]); return ["name": name, "connected": true]
    case ("POST", "runtimes/check"): return Agents.detect(force: true)
    case ("POST", "agents-apps"): return (body["enable"] as? Bool) == false ? AgentApps.disable() : try await AgentApps.enable()
    case ("POST", "runtimes/terminal"): return try TerminalStep.open(runtime: body["runtime"] as? String ?? "", step: body["step"] as? String == "install" ? "install" : "login")
    case ("POST", "runtimes/test"):
      let rt = body["runtime"] as? String ?? "claude"
      return await withCheckedContinuation { (cont: CheckedContinuation<J, Never>) in
        AgentRun(id: newID("test")).start(runtime: rt, model: nil, role: "", prompt: "Reply with exactly: ready", cwd: workspace, resume: nil, editAllowed: false, onDelta: { _ in }, onTool: { _, _ in }) { res in
          cont.resume(returning: ["ok": res.error == nil, "text": String(res.text.prefix(200)), "error": orNull(res.error)])
        }
      }
    case ("POST", "composio/key"):
      let key = (body["key"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      if key.isEmpty { Keychain.set("composio", nil); return ["connected": false] }
      try await Composio.validate(key)
      Keychain.set("composio", key); store.emit("connector.updated", ["title": "Composio"]); return ["connected": true]
    case ("GET", "composio/toolkits"): return try await Composio.toolkits(search: r.query["search"])
    case ("GET", "composio/accounts"): return try await Composio.accounts()
    case ("POST", "composio/connect"):
      let res = try await Composio.connect(toolkit: body["toolkit"] as? String ?? "", redirect: callbackURL)
      return ["url": res.url, "id": res.id]
    case ("POST", "composio/disconnect"): try await Composio.disconnect(body["id"] as? String ?? ""); store.emit("connector.updated", ["title": "Composio"]); return ["ok": true]
    case ("POST", "zernio/key"):
      let key = (body["key"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      if key.isEmpty { Keychain.set("zernio", nil); return ["connected": false] }
      try await Zernio.validate(key)
      Keychain.set("zernio", key); store.emit("connector.updated", ["title": "Zernio"]); return ["connected": true]
    case ("GET", "zernio/accounts"): return try await Zernio.accounts()
    case ("POST", "zernio/connect"):
      let platform = body["platform"] as? String ?? ""
      guard Zernio.platforms.contains(platform) else { throw APIError(422, "bad_platform", "Choose a platform.") }
      return ["url": try await Zernio.connectURL(platform, redirect: callbackURL)]
    case ("POST", "folders"):
      var values: J = [:]
      for k in ["workspace", "notesFolder", "proposalsFolder", "handbookFolder"] {
        guard let p = body[k] as? String else { continue }
        if !p.isEmpty { var dir: ObjCBool = false; guard FileManager.default.fileExists(atPath: p, isDirectory: &dir), dir.boolValue else { throw APIError(422, "bad_folder", "That folder does not exist.") } }
        values[k] = p
      }
      if let perm = body["permissions"] as? String, ["edit", "read"].contains(perm) { values["permissions"] = perm }
      if let c = body["currency"] as? String, ["EUR", "USD", "GBP"].contains(c) { values["currency"] = c }
      store.setSettings(values)
      if values["notesFolder"] != nil { DispatchQueue.global().async { Knowledge.shared.index() } }
      return ["ok": true]
    case ("POST", "agents"):
      let picks = body["agents"] as? [J] ?? []
      let ready = Agents.detect(wait: true).filter { $0["ready"] as? Bool == true }.map { $0["id"] as! String }
      let fallback = ready.first ?? "claude"
      let team: [J] = TEAM.map { t in
        let pick = picks.first { $0["id"] as? String == t.0 }
        let existing = agents.first { $0["id"] as? String == t.0 }
        return ["id": t.0, "name": t.1, "department": t.2, "role": t.3, "instructions": existing?["instructions"] ?? t.3,
                "runtime": pick?["runtime"] as? String ?? existing?["runtime"] as? String ?? (t.0 == "builder" && ready.contains("codex") ? "codex" : fallback), "model": pick?["model"] as? String ?? existing?["model"] as? String ?? ""]
      }
      store.setList("agents", team); return ["agents": team]
    case ("POST", "finish"):
      if agents.isEmpty { _ = try await student("POST", "agents", HTTPRequest(method: "POST", path: "", query: [:], headers: [:], body: Data("{}".utf8))) }
      store.setSettings(["setupComplete": true]); return ["ok": true]
    default: throw APIError(404, "not_found", "Unknown setup step.")
    }
  }
}
