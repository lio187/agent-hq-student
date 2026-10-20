// The student's data: settings, agents, tasks, routines, conversations, runs and the event stream. Kept in
// ~/Library/Application Support/187N Agent HQ/state.json (API keys live in the Keychain, never here).
import Foundation

func now() -> Double { Date().timeIntervalSince1970 }
func isoNow(_ offset: Double = 0) -> String { ISO8601DateFormatter().string(from: Date(timeIntervalSinceNow: offset)) }
func newID(_ prefix: String) -> String { prefix + "_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12).lowercased() }

let supportDir: URL = {
  let base = Paths.supportDirOverride.map { URL(fileURLWithPath: $0, isDirectory: true) }
    ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(AppInfo.supportFolder, isDirectory: true)
  try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
  return base
}()

final class Store {
  static let shared = Store()
  private let lock = NSRecursiveLock()
  private var state: J
  private let file = supportDir.appendingPathComponent("state.json")
  private var saveScheduled = false

  // Live events (the office listens on the WebSocket); the last 500 are kept for reconnects.
  private var events: [J] = []
  private var lastEventID = 0
  private var clients: [ObjectIdentifier: WSClient] = [:]

  private init() {
    if let data = try? Data(contentsOf: file), let s = (try? JSONSerialization.jsonObject(with: data)) as? J { state = s } else { state = [:] }
    for k in ["agents", "tasks", "routines", "conversations", "runs", "activity"] where state[k] == nil { state[k] = [J]() }
    for k in ["messages", "settings"] where state[k] == nil { state[k] = J() }
    if state["layout"] == nil { state["layout"] = ["hidden": [String](), "revision": 1] }
    if state["context"] == nil { state["context"] = ["conversation": NSNull(), "profile": "chief", "project": "workspace", "revision": 1, "section": "overview", "updated_at": now()] }
    // Runs that were active when the app closed did not finish.
    var runs = state["runs"] as? [J] ?? []
    for i in runs.indices where (runs[i]["status"] as? String) == "running" { runs[i]["status"] = "interrupted"; runs[i]["last_event"] = "run.interrupted" }
    state["runs"] = runs
    var tasks = state["tasks"] as? [J] ?? []
    for i in tasks.indices where (tasks[i]["status"] as? String) == "running" { tasks[i]["status"] = "blocked"; tasks[i]["result"] = "The app was closed while this task ran. Start it again." }
    state["tasks"] = tasks
  }

  func read<T>(_ body: (J) -> T) -> T { lock.lock(); defer { lock.unlock() }; return body(state) }
  func write(_ body: (inout J) -> Void) {
    lock.lock(); body(&state); let schedule = !saveScheduled; saveScheduled = true; lock.unlock()
    if schedule { DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { self.save() } }
  }
  func save() {
    lock.lock(); saveScheduled = false; let snapshot = state; lock.unlock()
    if let data = try? JSONSerialization.data(withJSONObject: snapshot, options: [.prettyPrinted]) { try? data.write(to: file, options: .atomic) }
  }

  // Convenience accessors
  var settings: J { read { $0["settings"] as? J ?? [:] } }
  func setting(_ key: String) -> Any? { settings[key] }
  func setSettings(_ values: J) { write { s in var cur = s["settings"] as? J ?? [:]; for (k, v) in values { cur[k] = v }; s["settings"] = cur } }
  func list(_ key: String) -> [J] { read { $0[key] as? [J] ?? [] } }
  func setList(_ key: String, _ value: [J]) { write { $0[key] = value } }
  func update(_ key: String, id: String, _ change: (inout J) -> Void) {
    write { s in var l = s[key] as? [J] ?? []; if let i = l.firstIndex(where: { ($0["id"] as? String) == id }) { change(&l[i]) }; s[key] = l }
  }
  func prepend(_ key: String, _ item: J, limit: Int = 500) { write { s in var l = s[key] as? [J] ?? []; l.insert(item, at: 0); if l.count > limit { l.removeLast(l.count - limit) }; s[key] = l } }
  func messages(_ cid: String) -> [J] { read { ($0["messages"] as? J)?[cid] as? [J] ?? [] } }
  func appendMessage(_ cid: String, _ m: J) { write { s in var all = s["messages"] as? J ?? [:]; var l = all[cid] as? [J] ?? []; l.append(m); all[cid] = l; s["messages"] = all } }
  func value(_ key: String) -> Any? { read { $0[key] } }
  func setValue(_ key: String, _ v: Any) { write { $0[key] = v } }

  // Events
  func attach(_ c: WSClient, after: Int) {
    lock.lock(); let id = ObjectIdentifier(c); clients[id] = c; let backlog = events.filter { ($0["id"] as? Int ?? 0) > after }; lock.unlock()
    c.onClose = { [weak self] in self?.lock.lock(); self?.clients[id] = nil; self?.lock.unlock() }
    for e in backlog { c.send(text: jsonString(e)) }
  }
  @discardableResult func emit(_ kind: String, _ data: J = [:]) -> J {
    lock.lock()
    lastEventID += 1
    var d = data; d["timestamp"] = now()
    let e: J = ["id": lastEventID, "dedupe": kind + ":" + String(lastEventID), "kind": kind, "data": d, "at": now()]
    events.append(e); if events.count > 500 { events.removeFirst() }
    let targets = Array(clients.values)
    lock.unlock()
    let text = jsonString(e)
    for c in targets { c.send(text: text) }
    if !kind.hasPrefix("message.delta") && !kind.hasPrefix("tool.") { logActivity(kind, data) }
    return e
  }
  func recentEvents(_ n: Int = 200) -> [J] { lock.lock(); defer { lock.unlock() }; return Array(events.suffix(n)) }
  var latestEventID: Int { lock.lock(); defer { lock.unlock() }; return lastEventID }

  // Activity (persisted, for the Activity page)
  private func logActivity(_ kind: String, _ data: J) {
    let titles: [String: String] = ["run.completed": "Run finished", "run.failed": "Run failed", "run.accepted": "Run started", "task.created": "Task created",
      "task.updated": "Task updated", "routine.created": "Routine created", "routine.updated": "Routine updated", "connector.updated": "Connection updated", "knowledge.indexed": "Knowledge indexed"]
    guard let title = titles[kind] else { return }
    prepend("activity", ["ts": isoNow(), "kind": kind, "title": (data["title"] as? String).map { title + " · " + $0 } ?? title, "profile": data["profile"] as? String ?? "", "severity": kind.hasSuffix("failed") ? "warn" : "info"], limit: 400)
  }
}

// An optional as a JSON value: the value, or null.
func orNull(_ v: Any?) -> Any { v ?? NSNull() }

func jsonString(_ v: Any) -> String {
  guard let d = try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed]) else { return "null" }
  return String(data: d, encoding: .utf8) ?? "null"
}
