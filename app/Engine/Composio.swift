// Composio (apps such as Gmail, Google Calendar, Slack, Notion, GitHub): the student's own project API key,
// Composio-managed logins (no OAuth app of their own), connected accounts and tool calls. REST API v3.1.
import Foundation

enum Composio {
  static var key: String? { Keychain.get("composio") }
  static var connected: Bool { key != nil }
  // A stable id for this student in Composio (never "default", never an email).
  static var userID: String {
    if let id = Keychain.get("composio-user") { return id }
    let id = "hq-" + UUID().uuidString.lowercased(); Keychain.set("composio-user", id); return id
  }
  // Popular apps first in Setup.
  static let featured = ["gmail", "googlecalendar", "googledrive", "googlesheets", "googledocs", "slack", "notion", "github", "linear", "todoist", "calendly", "hubspot", "airtable", "outlook", "zoom", "trello", "asana", "clickup", "dropbox", "youtube"]

  private static func call(_ method: String, _ path: String, key override: String? = nil, body: Any? = nil) async throws -> J {
    guard let k = override ?? key else { throw NetError(status: 401, message: "Connect Composio in Setup first.", code: "not_connected") }
    let base = Net.base("COMPOSIO", "https://backend.composio.dev/api/v3.1")
    let r = try await Net.json(method, base + path, headers: ["x-api-key": k], body: body)
    return r as? J ?? [:]
  }
  static func raw(_ method: String, _ path: String, body: Any? = nil) async throws -> J { try await call(method, path, body: body) }
  static func q(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? s }

  static func validate(_ k: String) async throws { _ = try await call("GET", "/connected_accounts?limit=1", key: k) }

  static func toolkits(search: String?) async throws -> [J] {
    let s = (search ?? "").trimmingCharacters(in: .whitespaces)
    let r = try await call("GET", "/toolkits?limit=" + (s.isEmpty ? "200&sort_by=usage" : "50&search=" + q(s)))
    let items: [J] = (r["items"] as? [J] ?? []).compactMap { t in
      guard let slug = t["slug"] as? String else { return nil }
      let managed = !((t["composio_managed_auth_schemes"] as? [Any]) ?? []).isEmpty || (t["no_auth"] as? Bool) == true
      let meta = t["meta"] as? J ?? [:]
      return ["slug": slug, "name": t["name"] as? String ?? slug, "logo": meta["logo"] as? String ?? "", "description": meta["description"] as? String ?? "", "managed": managed]
    }
    if !s.isEmpty { return items }
    let rank = { (j: J) -> Int in featured.firstIndex(of: j["slug"] as? String ?? "") ?? 999 }
    return items.filter { $0["managed"] as? Bool == true }.sorted { rank($0) < rank($1) }
  }

  // The Composio-managed login for a toolkit: an existing enabled one, or a new one.
  private static func authConfig(_ toolkit: String) async throws -> String {
    let found = try await call("GET", "/auth_configs?toolkit_slug=\(q(toolkit))&is_composio_managed=true&limit=50")
    if let a = (found["items"] as? [J] ?? []).first(where: { ($0["is_composio_managed"] as? Bool) == true && ($0["status"] as? String ?? "ENABLED") == "ENABLED" }), let id = a["id"] as? String { return id }
    let created = try await call("POST", "/auth_configs", body: ["toolkit": ["slug": toolkit], "auth_config": ["type": "use_composio_managed_auth", "name": toolkit]])
    guard let id = (created["auth_config"] as? J)?["id"] as? String else { throw NetError(status: 502, message: "Composio could not prepare a login for \(toolkit). This app may need its own login set up in Composio.", code: "auth_config") }
    return id
  }
  // A login link (valid 10 minutes) the student opens in their browser.
  static func connect(toolkit: String, redirect: String) async throws -> (url: String, id: String) {
    guard !toolkit.isEmpty else { throw NetError(status: 422, message: "Choose an app.", code: "bad_request") }
    let ac = try await authConfig(toolkit)
    let r = try await call("POST", "/connected_accounts/link", body: ["auth_config_id": ac, "user_id": userID, "callback_url": redirect])
    guard let url = r["redirect_url"] as? String else { throw NetError(status: 502, message: "Composio returned no login link.", code: "no_url") }
    return (url, r["connected_account_id"] as? String ?? "")
  }
  static let names = ["gmail": "Gmail", "googlecalendar": "Google Calendar", "googledrive": "Google Drive", "googlesheets": "Google Sheets", "googledocs": "Google Docs", "slack": "Slack", "notion": "Notion",
    "github": "GitHub", "linear": "Linear", "todoist": "Todoist", "calendly": "Calendly", "hubspot": "HubSpot", "airtable": "Airtable", "outlook": "Outlook", "zoom": "Zoom", "trello": "Trello",
    "asana": "Asana", "clickup": "ClickUp", "dropbox": "Dropbox", "youtube": "YouTube"]
  static func shape(_ a: J) -> J {
    let state = (a["state"] as? J)?["val"] as? J ?? [:]
    let toolkit = (a["toolkit"] as? J)?["slug"] as? String ?? ""
    let label = state["displayName"] as? String ?? state["email"] as? String ?? a["alias"] as? String ?? a["word_id"] as? String ?? ""
    return ["id": a["id"] as? String ?? "", "toolkit": toolkit, "toolkitName": names[toolkit] ?? toolkit.capitalized, "status": a["status"] as? String ?? "", "reason": a["status_reason"] as? String ?? "",
            "label": label, "created": a["created_at"] as? String ?? ""]
  }
  static func accounts() async throws -> [J] {
    let r = try await call("GET", "/connected_accounts?user_ids=\(q(userID))&limit=100&order_by=updated_at&order_direction=desc")
    return (r["items"] as? [J] ?? []).filter { ($0["is_disabled"] as? Bool) != true }.map(shape)
  }
  static func account(_ id: String) async throws -> J { shape(try await call("GET", "/connected_accounts/" + q(id))) }
  static func disconnect(_ id: String) async throws { _ = try await call("DELETE", "/connected_accounts/" + q(id)) }

  // Runs a Composio tool for the student's account; provider failures come back as successful=false.
  static func execute(_ tool: String, account: String?, arguments: J) async throws -> J {
    var body: J = ["user_id": userID, "arguments": arguments]
    if let account { body["connected_account_id"] = account }
    let r = try await call("POST", "/tools/execute/" + tool, body: body)
    if (r["successful"] as? Bool) == false {
      let err = (r["error"] as? String) ?? ((r["error"] as? J)?["message"] as? String) ?? "The app did not answer."
      throw NetError(status: 424, message: err, code: "tool_failed")
    }
    return r["data"] as? J ?? [:]
  }
  static func calendarEvents(from: Date, to: Date) async throws -> [J] {
    let cal = try await accounts().first { ($0["toolkit"] as? String) == "googlecalendar" && ($0["status"] as? String)?.uppercased() == "ACTIVE" }
    guard let cal else { throw NetError(status: 424, message: "Connect Google Calendar in Setup (Composio).", code: "not_connected") }
    let f = ISO8601DateFormatter(); f.timeZone = .current; f.formatOptions = [.withInternetDateTime]
    let data = try await execute("GOOGLECALENDAR_EVENTS_LIST", account: cal["id"] as? String, arguments: ["calendarId": "primary", "timeMin": f.string(from: from), "timeMax": f.string(from: to),
                                                                                                        "singleEvents": true, "orderBy": "startTime", "maxResults": 250])
    return data["items"] as? [J] ?? (data["data"] as? J)?["items"] as? [J] ?? []
  }
}
