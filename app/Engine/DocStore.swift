// One JSON file per area (content, research, analysis, makers, voice, brain, tools, apify) in the app's data folder,
// so the main state file stays small. Writes are saved shortly after (atomically); flushAll() runs on quit.
import Foundation

final class DocStore {
  private static let registry = NSLock()
  private static var stores: [String: DocStore] = [:]
  static func named(_ name: String) -> DocStore {
    registry.lock(); defer { registry.unlock() }
    if let s = stores[name] { return s }
    let s = DocStore(name); stores[name] = s; return s
  }
  static func flushAll() { registry.lock(); let all = Array(stores.values); registry.unlock(); all.forEach { $0.save() } }
  static let dataDir: URL = { let d = supportDir.appendingPathComponent("data", isDirectory: true); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }()
  // Files that belong to an area (thumbnails, renders, transcripts), in the app's data folder.
  static func folder(_ area: String) -> URL { let d = supportDir.appendingPathComponent("media/" + area, isDirectory: true); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }

  private let file: URL
  private let lock = NSRecursiveLock()
  private var doc: J
  private var scheduled = false
  private init(_ name: String) {
    file = DocStore.dataDir.appendingPathComponent(name + ".json")
    doc = (try? Data(contentsOf: file)).flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? J } ?? [:]
  }
  func read<T>(_ body: (J) -> T) -> T { lock.lock(); defer { lock.unlock() }; return body(doc) }
  func write(_ body: (inout J) -> Void) {
    lock.lock(); body(&doc); let schedule = !scheduled; scheduled = true; lock.unlock()
    if schedule { DispatchQueue.global().asyncAfter(deadline: .now() + 0.4) { self.save() } }
  }
  func save() {
    lock.lock(); scheduled = false; let snapshot = doc; lock.unlock()
    if let data = try? JSONSerialization.data(withJSONObject: snapshot, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: file, options: .atomic) }
  }
  // Lists of records with an "id".
  func list(_ key: String) -> [J] { read { $0[key] as? [J] ?? [] } }
  func setList(_ key: String, _ items: [J]) { write { $0[key] = items } }
  func get(_ key: String, id: String) -> J? { list(key).first { ($0["id"] as? String) == id } }
  // Inserts (at the top) or replaces the record with the same id; keeps at most `limit`.
  @discardableResult func upsert(_ key: String, _ item: J, limit: Int = 5000) -> J {
    write { d in
      var l = d[key] as? [J] ?? []
      if let id = item["id"] as? String, let i = l.firstIndex(where: { ($0["id"] as? String) == id }) { l[i] = item } else { l.insert(item, at: 0) }
      if l.count > limit { l.removeLast(l.count - limit) }
      d[key] = l
    }
    return item
  }
  @discardableResult func update(_ key: String, id: String, _ change: (inout J) -> Void) -> J? {
    var out: J?
    write { d in var l = d[key] as? [J] ?? []; if let i = l.firstIndex(where: { ($0["id"] as? String) == id }) { change(&l[i]); out = l[i] }; d[key] = l }
    return out
  }
  func remove(_ key: String, id: String) { write { d in d[key] = (d[key] as? [J] ?? []).filter { ($0["id"] as? String) != id } } }
  func value(_ key: String) -> Any? { read { $0[key] } }
  func setValue(_ key: String, _ v: Any?) { write { $0[key] = v } }
}
