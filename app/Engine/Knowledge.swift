// The Brain: the student's second brain, one or more folders of Markdown notes (Obsidian vaults or any folder),
// indexed into notes and links. Paths start with the folder's name, so several folders form one brain.
// [[Wiki links]] (also through `aliases` in a note's front matter) and relative Markdown links count; front matter
// `title`, `tags` and `aliases` are read. Hidden folders, .obsidian, .trash, .git and node_modules are skipped.
// A file watcher (FSEvents) re-reads the folders two seconds after a note changes; a slow full re-read is the fallback.
import Foundation
import CoreServices
import CryptoKit

final class Knowledge {
  static let shared = Knowledge()
  struct Note {
    let path: String      // "<folder name>/<path inside the folder>"
    let folder: String    // the directory part of `path`
    let title: String
    let tags: [String]
    let modified: Double
    let bytes: Int
    let root: Int         // index into `roots`
    let rel: String       // path inside its folder
    let aliases: [String]
  }
  struct Root { let path: String; let name: String; var notes: Int; var links: Int; var exists: Bool }

  static let maxNotes = 6000
  static let skipped: Set<String> = ["node_modules", ".git", ".obsidian", ".trash"]
  // [[links]] to these are attachments, not notes.
  static let attachments: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic", "pdf", "mp3", "wav", "m4a", "ogg", "flac", "mp4", "mov", "webm",
                                         "canvas", "excalidraw", "base", "csv", "json", "zip", "docx", "xlsx", "pptx", "txt"]

  private(set) var notes: [Note] = []
  private(set) var pairs: [(Int, Int)] = []      // links: (source, target), each pair once
  private(set) var roots: [Root] = []
  private(set) var ids: [String: Int] = [:]      // the Brain's file id ("vault-" + sha256(path)) → note
  private(set) var unresolved = 0
  private(set) var capped = false
  private(set) var indexedAt: Double = 0
  private(set) var seconds: Double = 0
  private(set) var log: [J] = []
  private(set) var error: String?
  private let lock = NSLock(), indexLock = NSLock()
  static let queue = DispatchQueue(label: "ai.187n.knowledge.index", qos: .utility)

  // The first folder (older code reads one notes folder).
  var root: String? { Knowledge.configuredRoots().first }

  // The folders from the settings. `notesFolders` is the list; `notesFolder` (older code) stays the first one.
  // A notesFolder set by older code (Setup's folder step) is moved to the front of the list.
  static func configuredRoots() -> [String] {
    let s = Store.shared, legacy = (s.setting("notesFolder") as? String) ?? ""
    var list = (s.setting("notesFolders") as? [String])?.filter { !$0.isEmpty }
    var changed = list == nil
    if list == nil { list = legacy.isEmpty ? [] : [legacy] }
    if !legacy.isEmpty, list!.first != legacy { list!.removeAll { $0 == legacy }; list!.insert(legacy, at: 0); changed = true }
    if legacy.isEmpty, !list!.isEmpty { changed = true }
    if changed { s.setSettings(["notesFolders": list!, "notesFolder": list!.first ?? ""]) }
    return list!
  }

  func snapshot() -> ([Note], [(Int, Int)]) { lock.lock(); defer { lock.unlock() }; return (notes, pairs) }
  struct State { let notes: [Note]; let pairs: [(Int, Int)]; let roots: [Root]; let ids: [String: Int]; let unresolved: Int; let capped: Bool; let indexedAt: Double; let seconds: Double; let error: String?; let log: [J] }
  func state() -> State {
    lock.lock(); defer { lock.unlock() }
    return State(notes: notes, pairs: pairs, roots: roots, ids: ids, unresolved: unresolved, capped: capped, indexedAt: indexedAt, seconds: seconds, error: error, log: log)
  }

  // Router's tick (every 30 s): a full re-read when the folders changed, or as the slow fallback for the watcher.
  private var pending = false
  func indexIfStale() {
    let paths = Knowledge.configuredRoots()
    lock.lock(); let known = roots.map { $0.path }, age = now() - indexedAt, busy = pending; lock.unlock()
    guard !busy, paths != known || age > (watching ? 1800 : 120) else { return }
    indexSoon()
  }
  func indexSoon() {
    lock.lock(); if pending { lock.unlock(); return }; pending = true; lock.unlock()
    Knowledge.queue.async { self.lock.lock(); self.pending = false; self.lock.unlock(); self.index() }
  }

  // MARK: the index
  func index() {
    indexLock.lock(); defer { indexLock.unlock() }
    let paths = Knowledge.configuredRoots(), started = Date(), fm = FileManager.default
    var found: [Note] = [], bodies: [String] = [], list: [Root] = [], names = Set<String>(), hitCap = false
    for (ri, path) in paths.enumerated() {
      let base = (path as NSString).lastPathComponent.isEmpty ? "Notes" : (path as NSString).lastPathComponent
      var name = base, n = 2
      while names.contains(name.lowercased()) { name = "\(base) \(n)"; n += 1 }
      names.insert(name.lowercased())
      var isDir: ObjCBool = false
      let exists = fm.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
      list.append(Root(path: path, name: name, notes: 0, links: 0, exists: exists))
      guard exists, !hitCap, let walker = fm.enumerator(atPath: path) else { continue }
      while let item = walker.nextObject() as? String {
        if found.count >= Knowledge.maxNotes || Date().timeIntervalSince(started) > 30 { hitCap = true; break }
        let file = (item as NSString).lastPathComponent, attrs = walker.fileAttributes
        let dir = (attrs?[.type] as? FileAttributeType) == .typeDirectory
        if file.hasPrefix(".") || Knowledge.skipped.contains(file) { if dir { walker.skipDescendants() }; continue }
        guard !dir, (file as NSString).pathExtension.lowercased() == "md" else { continue }
        let bytes = (attrs?[.size] as? Int) ?? 0
        var text = bytes > 5_000_000 ? "" : ((try? String(contentsOfFile: path + "/" + item, encoding: .utf8)) ?? "")
        if text.utf8.contains(13) { text = text.replacingOccurrences(of: "\r\n", with: "\n") }
        let (meta, body) = Knowledge.frontMatter(text)
        let heading = body.split(separator: "\n", maxSplits: 400).first { $0.hasPrefix("# ") }.map { String($0.dropFirst(2)).trimmingCharacters(in: .whitespaces) }
        var tags: [String] = []
        for t in (meta["tags"] ?? []) + (meta["tag"] ?? []) + body.matches(of: /(?:^|\s)#([A-Za-z][\w\/-]{1,40})/).map({ String($0.1) }) {
          let clean = t.trimmingCharacters(in: CharacterSet(charactersIn: "#").union(.whitespaces))
          if !clean.isEmpty, !tags.contains(clean), tags.count < 12 { tags.append(clean) }
        }
        let full = name + "/" + item
        found.append(Note(path: full, folder: (full as NSString).deletingLastPathComponent, title: meta["title"]?.first(where: { !$0.isEmpty }) ?? heading ?? (file as NSString).deletingPathExtension,
                          tags: tags, modified: (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0, bytes: bytes, root: ri, rel: item,
                          aliases: ((meta["aliases"] ?? []) + (meta["alias"] ?? [])).filter { !$0.isEmpty }))
        bodies.append(String(body.prefix(200_000)))
      }
    }
    // Links resolve inside the note's own folder (as in Obsidian): relative path, path from the folder's top, then a
    // file name (the shortest path wins), then an alias.
    var byPath: [String: Int] = [:], byStem: [String: [Int]] = [:], byAlias: [String: [Int]] = [:]
    for (i, n) in found.enumerated() {
      byPath[n.path.lowercased()] = i
      byStem[list[n.root].name.lowercased() + "\u{0}" + ((n.rel as NSString).lastPathComponent as NSString).deletingPathExtension.lowercased(), default: []].append(i)
      for a in n.aliases { byAlias[list[n.root].name.lowercased() + "\u{0}" + a.lowercased(), default: []].append(i) }
    }
    let shortest = { (l: [Int]?) -> Int? in l?.min { found[$0].path.count < found[$1].path.count } }
    var seen = Set<Int>(), result: [(Int, Int)] = [], missing = 0
    for (i, text) in bodies.enumerated() {
      let n = found[i], rootName = list[n.root].name.lowercased(), here = (n.rel as NSString).deletingLastPathComponent
      var wiki: [String] = text.matches(of: /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/).map { String($0.1).trimmingCharacters(in: .whitespaces) }
      wiki = wiki.filter { !Knowledge.attachments.contains(($0 as NSString).pathExtension.lowercased()) }
      var md: [String] = text.matches(of: /\]\(<?([^)>\n]+?\.md)>?(?:#[^)]*)?\)/).map { String($0.1) }
      md = md.filter { !$0.contains("://") }.map { $0.removingPercentEncoding ?? $0 }
      for (t, isWiki) in wiki.map({ ($0, true) }) + md.map({ ($0, false) }) {
        let lower = t.lowercased(), file = lower.hasSuffix(".md") ? lower : lower + ".md"
        var j = byPath[rootName + "/" + Knowledge.resolve(here.lowercased(), file)] ?? byPath[rootName + "/" + Knowledge.resolve("", file)]
        if j == nil, isWiki {
          j = shortest(byStem[rootName + "\u{0}" + ((lower as NSString).lastPathComponent as NSString).deletingPathExtension.lowercased()].map { $0.filter { found[$0].root == n.root } })
            ?? shortest(byAlias[rootName + "\u{0}" + lower])
        }
        guard let j else { missing += 1; continue }
        guard j != i, seen.insert(i * 1_000_000 + j).inserted else { continue }
        result.append((i, j))
      }
    }
    for (a, _) in result { list[found[a].root].links += 1 }
    for n in found { list[n.root].notes += 1 }
    var idMap: [String: Int] = [:]
    for (i, n) in found.enumerated() { idMap[Knowledge.fileID(n.path)] = i }
    let took = Date().timeIntervalSince(started)
    lock.lock()
    let before = (notes.count, pairs.count, roots.map { $0.path }), first = indexedAt == 0
    notes = found; pairs = result; roots = list; ids = idMap; unresolved = missing; capped = hitCap; indexedAt = now(); seconds = took
    error = list.filter { !$0.exists }.isEmpty ? nil : "Not found: " + list.filter { !$0.exists }.map { $0.name }.joined(separator: ", ")
    let changed = first || before.0 != found.count || before.1 != result.count || before.2 != paths
    if changed { addLogLocked("indexed", "Read \(found.count) notes and \(result.count) links" + (paths.count > 1 ? " in \(paths.count) folders" : "")) }
    lock.unlock()
    if before.2 != paths || !watching { watch(list.filter { $0.exists }.map { $0.path }) }
    if before.2 != paths && !first { DispatchQueue.global().async { BrainAPI.syncAgents() } }
    Store.shared.emit(changed ? "knowledge.indexed" : "brain.updated", ["title": "\(found.count) notes"])
  }

  func addLog(_ op: String, _ title: String) { lock.lock(); addLogLocked(op, title); lock.unlock() }
  private func addLogLocked(_ op: String, _ title: String) {
    log.insert(["date": String(isoNow().prefix(10)), "at": isoNow(), "op": op, "title": title, "body": "", "bodyChars": 0, "bodyTruncated": false, "rel": ""], at: 0)
    if log.count > 40 { log.removeLast(log.count - 40) }
  }

  // The Brain's id for a file: "vault-" + the first 24 hex characters of sha256(path), as brain-model.mjs nodeId().
  static func fileID(_ path: String) -> String { "vault-" + SHA256.hash(data: Data(path.utf8)).map { String(format: "%02x", $0) }.joined().prefix(24) }

  // "a/b" + "../c.md" → "a/c.md" (lowercase keys; leading "/" means the folder's top).
  static func resolve(_ dir: String, _ target: String) -> String {
    var parts: [Substring] = target.hasPrefix("/") ? [] : dir.split(separator: "/")
    for p in target.split(separator: "/") { if p == ".." { _ = parts.popLast() } else if p != "." && !p.isEmpty { parts.append(p) } }
    return parts.joined(separator: "/")
  }

  // YAML front matter between --- lines: `key: value`, `key: [a, b]` and `key:` followed by `- item` lines.
  static func frontMatter(_ text: String) -> ([String: [String]], Substring) {
    guard text.hasPrefix("---") else { return ([:], Substring(text)) }
    let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
    guard lines.first?.trimmingCharacters(in: .whitespaces) == "---",
          let end = lines.dropFirst().firstIndex(where: { ["---", "..."].contains($0.trimmingCharacters(in: .whitespaces)) }) else { return ([:], Substring(text)) }
    var out: [String: [String]] = [:], key: String?
    let unquote = { (s: Substring) -> String in
      var v = s.trimmingCharacters(in: .whitespaces)
      if v.count >= 2, let f = v.first, let l = v.last, (f == "\"" && l == "\"") || (f == "'" && l == "'") { v = String(v.dropFirst().dropLast()) }
      return v
    }
    for raw in lines[1..<end] {
      let line = raw.replacingOccurrences(of: "\r", with: ""), t = line.trimmingCharacters(in: .whitespaces)
      if t.isEmpty || t.hasPrefix("#") { continue }
      if t.hasPrefix("- "), let k = key { out[k, default: []].append(unquote(t.dropFirst(2)[...])); continue }
      guard !line.hasPrefix(" "), !line.hasPrefix("\t"), let colon = line.firstIndex(of: ":") else { continue }
      let k = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased(), value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      key = k
      if value.isEmpty { out[k] = out[k] ?? []; continue }
      if value.hasPrefix("[") && value.hasSuffix("]") {
        out[k] = value.dropFirst().dropLast().split(separator: ",").map { unquote($0) }.filter { !$0.isEmpty }
      } else if ["tags", "tag"].contains(k) {
        out[k] = value.split(whereSeparator: { $0 == "," || $0 == " " }).map { unquote($0) }.filter { !$0.isEmpty }
      } else if ["aliases", "alias"].contains(k) {
        out[k] = value.split(separator: ",").map { unquote($0) }.filter { !$0.isEmpty }
      } else { out[k] = [unquote(value[...])] }
    }
    let bodyStart = lines[...end].reduce(0) { $0 + $1.utf8.count + 1 }
    let utf8 = text.utf8
    let idx = utf8.index(utf8.startIndex, offsetBy: min(bodyStart, utf8.count))
    return (out, text[idx...])
  }

  // MARK: the watcher (FSEvents): any change to a Markdown note or a folder re-reads the brain 2 s later.
  private var stream: FSEventStreamRef?
  private let watchLock = NSLock()
  private let watchQueue = DispatchQueue(label: "ai.187n.knowledge.watch")
  private var debounce: DispatchWorkItem?
  private var firstChange: Double = 0
  var watching: Bool { lock.lock(); defer { lock.unlock() }; return stream != nil }

  func watch(_ paths: [String]) {
    watchLock.lock(); defer { watchLock.unlock() }
    lock.lock(); let old = stream; stream = nil; lock.unlock()
    if let old { FSEventStreamStop(old); FSEventStreamInvalidate(old); FSEventStreamRelease(old) }
    guard !paths.isEmpty else { return }
    var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
    let flags = FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagWatchRoot)
    guard let s = FSEventStreamCreate(kCFAllocatorDefault, Knowledge.callback, &context, paths as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.3, flags) else { return }
    FSEventStreamSetDispatchQueue(s, watchQueue)
    guard FSEventStreamStart(s) else { FSEventStreamInvalidate(s); FSEventStreamRelease(s); return }
    lock.lock(); stream = s; lock.unlock()
  }

  private static let callback: FSEventStreamCallback = { _, info, count, paths, flags, _ in
    guard let info = info else { return }
    let me = Unmanaged<Knowledge>.fromOpaque(info).takeUnretainedValue()
    let list = (Unmanaged<CFArray>.fromOpaque(paths).takeUnretainedValue() as NSArray) as? [String] ?? []
    let isDir = UInt32(kFSEventStreamEventFlagItemIsDir), structural = UInt32(kFSEventStreamEventFlagItemCreated | kFSEventStreamEventFlagItemRemoved | kFSEventStreamEventFlagItemRenamed)
    let rescan = UInt32(kFSEventStreamEventFlagMustScanSubDirs | kFSEventStreamEventFlagRootChanged)
    var relevant = false
    for i in 0..<min(count, list.count) {
      let p = list[i], f = flags[i]
      if p.contains("/.obsidian") || p.contains("/.trash") || p.contains("/.git/") || p.hasSuffix("/.git") || p.contains("/node_modules") { continue }
      if f & rescan != 0 || p.lowercased().hasSuffix(".md") || (f & isDir != 0 && f & structural != 0) { relevant = true; break }
    }
    if relevant { me.changed() }
  }

  // On the watch queue: re-read 2 s after the last change (at most 8 s after the first one in a burst).
  private func changed() {
    let t = now()
    if debounce == nil { firstChange = t }
    debounce?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.debounce = nil; self?.indexSoon() }
    debounce = work
    watchQueue.asyncAfter(deadline: .now() + (t - firstChange > 8 ? 0 : 2), execute: work)
  }
}
