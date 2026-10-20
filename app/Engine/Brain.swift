// The second brain: the student's notes folders (Obsidian vaults found on this Mac, any folder, or a new starter
// brain), "Give my agents my brain" (a marked, reversible block in each AI tool's own instructions file, plus the
// folders on every run), "Save to brain", and the Brain pages' data across all folders.
//   Claude Code reads ~/.claude/CLAUDE.md, Codex ~/.codex/AGENTS.md, Hermes Agent ~/.hermes/SOUL.md (its global
//   identity file, loaded every session; AGENTS.md is per project for Hermes).
import Foundation
import AppKit

enum BrainAPI {
  private static weak var router: Router?
  static let docs = DocStore.named("brain")
  static let startMarker = "<!-- 187N Agent HQ · second brain (start) -->"
  static let endMarker = "<!-- 187N Agent HQ · second brain (end) -->"
  private static let fm = FileManager.default
  private static let agentLock = NSLock()   // one writer at a time for the AI tools' files

  // MARK: routes
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    if let res = try setup(method, path, r, router) { return res }
    let q = r.query
    switch (method, path) {
    case ("GET", "brain/graph"): return try graph(q["scope"] ?? "second", countOnly: q["count"] == "1", refresh: q["refresh"] == "1")
    case ("GET", "brain/communities"): return communities()
    case ("GET", "brain/vault"): return vault()
    case ("GET", "workspace/source/brain/librarian"): return librarian()
    case ("GET", "workspace/source/brain/log"): return logFeed()
    default:
      if method == "GET", path.hasPrefix("brain/vault/file/") { return try noteText(String(path.dropFirst("brain/vault/file/".count))) }
      return nil
    }
  }
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { try setup(method, path, r, router) }
  // Shared by Setup (/api/student) and the office (/api/hq/v1).
  private static func setup(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) throws -> Any? {
    self.router = router
    switch (method, path) {
    case ("GET", "brain/status"): return status()
    case ("GET", "brain/vaults"): return vaults()
    case ("POST", "brain/folders"): return try setFolders(r.json["folders"])
    case ("POST", "brain/create"): return try create(r.json["name"] as? String ?? "")
    case ("POST", "brain/agents"): return try (r.json["enable"] as? Bool ?? true) ? enableAgents() : disableAgents()
    case ("POST", "brain/open"): return try open(r.json["path"] as? String ?? "")
    case ("POST", "knowledge/save"): return try save(r.json)
    default: return nil
    }
  }
  static func launch(_ router: Router) {
    self.router = router
    Knowledge.queue.async { if !Knowledge.shared.watching { Knowledge.shared.watch(Knowledge.configuredRoots().filter(isDir)) } }
  }
  // Folders every agent run may read: the brain folders, once the student gave the agents their brain.
  static func addDirs() -> [String] {
    guard Store.shared.setting("brainAgents") as? Bool == true else { return [] }
    return Knowledge.configuredRoots().filter(isDir)
  }

  // MARK: helpers
  static func isDir(_ p: String) -> Bool { var d: ObjCBool = false; return fm.fileExists(atPath: p, isDirectory: &d) && d.boolValue }
  static func display(_ p: String) -> String { let h = Paths.home; return p == h ? "~" : p.hasPrefix(h + "/") ? "~" + p.dropFirst(h.count) : p }
  static func standardized(_ raw: String) -> String {
    var p = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if p == "~" { p = Paths.home } else if p.hasPrefix("~/") { p = Paths.home + p.dropFirst(1) }
    return p.hasPrefix("/") ? URL(fileURLWithPath: p).standardizedFileURL.path : p
  }
  // obsidian://open?path=<absolute path of a file>, every reserved character percent-encoded (Obsidian's URI docs).
  static func obsidianURL(_ file: String) -> String {
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    return "obsidian://open?path=" + (file.addingPercentEncoding(withAllowedCharacters: allowed) ?? file)
  }
  static var obsidianInstalled: Bool { URL(string: "obsidian://open").flatMap { NSWorkspace.shared.urlForApplication(toOpen: $0) } != nil }
  // A file or folder name: no slashes, colons or characters Obsidian refuses in note names; at most 80 characters.
  static func safeName(_ raw: String) -> String {
    let bad = CharacterSet(charactersIn: "/\\:*?\"<>|#^[]").union(.controlCharacters).union(.newlines)
    var s = raw.components(separatedBy: bad).joined(separator: " ").split(whereSeparator: { $0 == " " || $0 == "\t" }).joined(separator: " ")
    while s.hasPrefix(".") || s.hasPrefix(" ") { s.removeFirst() }
    s = String(s.prefix(80)).trimmingCharacters(in: CharacterSet(charactersIn: " ."))
    return s
  }
  private static func emit() { Store.shared.emit("connector.updated", ["title": "Second brain"]) }

  // MARK: status
  static func status() -> J {
    let k = Knowledge.shared.state(), configured = Knowledge.configuredRoots()
    let folders: [J] = configured.enumerated().map { i, p in
      let r = k.roots.first { $0.path == p }
      return ["path": p, "display": display(p), "name": r?.name ?? (p as NSString).lastPathComponent, "exists": isDir(p), "notes": r?.notes ?? 0, "links": r?.links ?? 0, "main": i == 0, "indexed": r != nil]
    }
    let inbox = configured.first.map { $0 + "/Inbox" }
    let inboxNotes = inbox.flatMap { try? fm.contentsOfDirectory(atPath: $0) }?.filter { $0.lowercased().hasSuffix(".md") }.count ?? 0
    return ["folders": folders, "totals": ["folders": configured.count, "notes": k.notes.count, "links": k.pairs.count, "unresolved": k.unresolved],
            "indexedAt": k.indexedAt, "indexSeconds": k.seconds, "watching": Knowledge.shared.watching, "capped": k.capped, "error": orNull(k.error),
            "inbox": ["path": orNull(inbox), "display": orNull(inbox.map(display)), "notes": inboxNotes], "agents": agentStatus(), "obsidian": obsidianInstalled]
  }

  // MARK: Obsidian vaults on this Mac (~/Library/Application Support/obsidian/obsidian.json: {vaults: {<id>: {path, ts, open}}})
  static func vaults() -> J {
    let file = Paths.home + "/Library/Application Support/obsidian/obsidian.json"
    guard let data = fm.contents(atPath: file), let j = (try? JSONSerialization.jsonObject(with: data)) as? J else { return ["vaults": [J](), "found": false] }
    var entries: [(String, J)] = []
    if let dict = j["vaults"] as? J { for (id, v) in dict { if let v = v as? J { entries.append((id, v)) } } }
    else if let list = j["vaults"] as? [J] { entries = list.enumerated().map { (String($0.offset), $0.element) } }
    let connected = Set(Knowledge.configuredRoots().map(standardized)), started = Date()
    let list: [J] = entries.prefix(40).compactMap { id, v in
      guard let raw = v["path"] as? String, raw.hasPrefix("/") else { return nil }
      // Counting stops after 2 s in all (a Mac with many large vaults); the rest show without a count.
      let path = standardized(raw), exists = isDir(path), counted = exists && Date().timeIntervalSince(started) < 2
      let (count, capped) = counted ? quickCount(path) : (0, false)
      return ["id": id, "name": (path as NSString).lastPathComponent, "path": path, "display": display(path), "exists": exists, "notes": counted ? count as Any : NSNull(), "capped": capped,
              "open": (v["open"] as? Bool) ?? false, "lastOpened": (v["ts"] as? Double) ?? 0, "connected": connected.contains(path)]
    }.sorted { a, b in
      let ao = a["open"] as? Bool == true, bo = b["open"] as? Bool == true, at = a["lastOpened"] as? Double ?? 0, bt = b["lastOpened"] as? Double ?? 0
      return ao != bo ? ao : at != bt ? at > bt : (a["name"] as? String ?? "") < (b["name"] as? String ?? "")
    }
    return ["vaults": list, "found": true]
  }
  // Markdown files in a folder, quickly: at most 5,000 and half a second.
  static func quickCount(_ path: String) -> (Int, Bool) {
    guard let walker = fm.enumerator(atPath: path) else { return (0, false) }
    let started = Date(); var n = 0
    while let item = walker.nextObject() as? String {
      let name = (item as NSString).lastPathComponent
      if name.hasPrefix(".") || name == "node_modules" { walker.skipDescendants(); continue }
      if name.lowercased().hasSuffix(".md") { n += 1 }
      if n >= 5000 || Date().timeIntervalSince(started) > 0.5 { return (n, true) }
    }
    return (n, false)
  }

  // MARK: folders
  static func setFolders(_ raw: Any?) throws -> J {
    guard let items = raw as? [Any] else { throw APIError(422, "bad_request", "Send the list of folders.") }
    var list: [String] = []
    for case let s as String in items {
      let p = standardized(s)
      if p.isEmpty { continue }
      guard p.hasPrefix("/") else { throw APIError(422, "bad_folder", "Use the full path of the folder, for example ~/Documents/Notes.") }
      guard isDir(p) else { throw APIError(422, "bad_folder", "This folder does not exist: \(display(p)).") }
      if p == "/" || p == Paths.home || p == NSHomeDirectory() { throw APIError(422, "too_big", "Choose a folder of notes, not your whole home folder.") }
      if list.contains(p) { continue }
      if let other = list.first(where: { p.hasPrefix($0 + "/") || $0.hasPrefix(p + "/") }) { throw APIError(422, "nested", "\(display(p)) and \(display(other)) overlap. Connect only one of them.") }
      list.append(p)
    }
    guard list.count <= 12 else { throw APIError(422, "too_many", "Connect at most 12 folders.") }
    let before = Knowledge.configuredRoots()
    Store.shared.setSettings(["notesFolders": list, "notesFolder": list.first ?? ""])
    if before != list { Knowledge.shared.addLog("connected", list.isEmpty ? "No folders connected" : "Folders: " + list.map { ($0 as NSString).lastPathComponent }.joined(separator: ", ")) }
    Knowledge.shared.index()
    syncAgents()
    emit()
    return status()
  }

  // MARK: a new second brain in ~/Documents/<name>
  static func create(_ raw: String) throws -> J {
    let name = safeName(raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Second Brain" : raw)
    guard !name.isEmpty else { throw APIError(422, "bad_name", "Give your second brain a name.") }
    let docs = Paths.home + "/Documents", path = docs + "/" + name
    if fm.fileExists(atPath: path) { throw APIError(409, "exists", "There is already a folder called “\(name)” in Documents. Pick another name, or connect that folder instead.") }
    try fm.createDirectory(atPath: docs, withIntermediateDirectories: true)
    do { try fm.createDirectory(atPath: path, withIntermediateDirectories: false) } catch { throw APIError(409, "exists", "The folder “\(name)” could not be made in Documents.") }
    for (rel, text) in starter() {
      let file = path + "/" + rel
      try fm.createDirectory(atPath: (file as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
      try Data(text.utf8).write(to: URL(fileURLWithPath: file), options: .withoutOverwriting)
    }
    let res = try setFolders(Knowledge.configuredRoots() + [path])
    return ["path": path, "display": display(path), "name": name, "url": obsidianURL(path + "/Home.md"), "status": res]
  }
  static func starter() -> [(String, String)] {
    let folder = { (title: String, text: String) in "# \(title)\n\n\(text)\n\nBack to [[Home]].\n" }
    return [
      (".obsidian/app.json", "{}\n"),
      ("Home.md", """
      ---
      tags: [home]
      ---
      # Home

      Welcome to your second brain. Start here.

      ## Where things go
      - [[About the inbox|Inbox]]: new notes and quick captures land here first.
      - [[About projects|Projects]]: what you are working on now, each with a goal and an end date.
      - [[About areas|Areas]]: parts of your work and life you keep up over time, such as clients or health.
      - [[About resources|Resources]]: topics and reference material you may need later.
      - [[About the archive|Archive]]: finished projects and anything you no longer need day to day.

      Read [[How this brain works]] for the simple rules.

      ## Your agents
      When you give your agents your brain in 187N Agent HQ, they read this page first and save new notes in the inbox.

      """),
      ("How this brain works.md", """
      ---
      tags: [guide]
      ---
      # How this brain works

      This brain uses PARA: four places for everything, plus an inbox.

      1. **Capture** everything in the inbox first. Don't sort while you capture.
      2. **Sort** the inbox once a week:
         - **Projects**: a goal with an end date, such as "Launch the new offer".
         - **Areas**: something you keep up with no end date, such as "Clients" or "Finance".
         - **Resources**: topics you care about or may need later.
         - **Archive**: anything that is done or no longer active.
      3. **Link** notes with double square brackets around a note's name, like [[Home]]. Links make the Brain map.
      4. **Keep notes small**: one idea per note, with a clear title.

      Your agents follow the same rules: they read [[Home]] first, save new notes in the inbox, and never delete or rename a note without asking you.

      """),
      ("Inbox/About the inbox.md", folder("About the inbox", "New notes land here: quick captures, ideas, and notes your agents save. Once a week, move each one to [[About projects|Projects]], [[About areas|Areas]], [[About resources|Resources]] or [[About the archive|Archive]].")),
      ("Projects/About projects.md", folder("About projects", "One note or folder per project, with its goal, its deadline and the next step. When a project is done, move it to the [[About the archive|Archive]].")),
      ("Areas/About areas.md", folder("About areas", "Ongoing responsibilities without an end date: clients, team, finance, health. Keep the standards and checklists for each area here.")),
      ("Resources/About resources.md", folder("About resources", "Topics and reference material: articles, book notes, templates and ideas you may need for a future project.")),
      ("Archive/About the archive.md", folder("About the archive", "Finished projects and notes you no longer need day to day. Nothing here is deleted; it just stays out of the way.")),
    ]
  }

  // MARK: Open in Obsidian (the brain's Home.md, or the folder)
  static func open(_ raw: String) throws -> J {
    let path = standardized(raw), roots = Knowledge.configuredRoots().map(standardized)
    guard !path.isEmpty, roots.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) else { throw APIError(422, "unknown_folder", "That folder is not part of your second brain.") }
    var target = path
    if isDir(path) {
      if fm.fileExists(atPath: path + "/Home.md") { target = path + "/Home.md" }
      else if let first = (try? fm.contentsOfDirectory(atPath: path))?.filter({ $0.lowercased().hasSuffix(".md") }).sorted().first { target = path + "/" + first }
    }
    let url = obsidianURL(target)
    // Test builds never open another app.
    if Paths.noTerminal || Paths.headless { return ["url": url, "opened": false, "installed": obsidianInstalled] }
    guard obsidianInstalled else { throw APIError(422, "no_obsidian", "Obsidian is not installed on this Mac. Get it free at obsidian.md, then try again.") }
    if let open = router?.openExternal { open(url) } else if let u = URL(string: url) { DispatchQueue.main.async { NSWorkspace.shared.open(u) } }
    return ["url": url, "opened": true, "installed": true]
  }

  // MARK: Save to brain: a note in the first folder's Inbox, never overwriting one.
  static func save(_ body: J) throws -> J {
    guard let first = Knowledge.configuredRoots().first(where: isDir) else { throw APIError(422, "no_brain", "Connect a second brain first: Knowledge › Second brain.") }
    let text = (body["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    var title = (body["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty || !title.isEmpty else { throw APIError(422, "empty", "Write something to save first.") }
    guard text.count <= 500_000 else { throw APIError(413, "too_long", "This note is too long to save at once.") }
    if title.isEmpty { title = String(text.split(separator: "\n").first ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "# ").union(.whitespaces)) }
    title = String(title.prefix(120))
    let df = ISO8601DateFormatter(); df.timeZone = .current
    var base = safeName(title)
    if base.isEmpty { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HHmm"; base = "Note " + f.string(from: Date()) }
    let inbox = first + "/Inbox"
    try fm.createDirectory(atPath: inbox, withIntermediateDirectories: true)
    let yaml = { (s: String) in "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\"" }
    var head = "---\ntitle: \(yaml(title.isEmpty ? base : title))\ncreated: \(df.string(from: Date()))\nsource: 187N Agent HQ\n"
    if let agent = body["agent"] as? String, !agent.isEmpty { head += "agent: \(yaml(String(agent.prefix(80))))\n" }
    head += "---\n\n"
    let content = head + (text.hasPrefix("# ") ? "" : "# \(title.isEmpty ? base : title)\n\n") + text + "\n"
    var name = base + ".md", n = 2
    while true {
      let url = URL(fileURLWithPath: inbox + "/" + name)
      if !fm.fileExists(atPath: url.path) {
        do { try Data(content.utf8).write(to: url, options: .withoutOverwriting); break } catch let e as NSError where e.code == NSFileWriteFileExistsError {}
      }
      guard n < 1000 else { throw APIError(409, "exists", "Too many notes with this title in your Inbox.") }
      name = "\(base) \(n).md"; n += 1
    }
    Knowledge.shared.addLog("saved", "Saved “\(title.isEmpty ? base : title)” to the Inbox")
    Knowledge.shared.indexSoon()
    return ["ok": true, "name": name, "rel": "Inbox/" + name, "path": inbox + "/" + name, "display": display(inbox + "/" + name), "folder": (first as NSString).lastPathComponent]
  }

  // MARK: Give my agents my brain
  struct AgentFile { let id: String, name: String, path: String, present: Bool }
  static func agentFiles() -> [AgentFile] {
    let h = Paths.home
    return [AgentFile(id: "claude", name: "Claude Code", path: h + "/.claude/CLAUDE.md", present: Shell.which("claude") != nil || isDir(h + "/.claude")),
            AgentFile(id: "codex", name: "Codex", path: h + "/.codex/AGENTS.md", present: Shell.which("codex") != nil || isDir(h + "/.codex")),
            AgentFile(id: "hermes", name: "Hermes Agent", path: h + "/.hermes/SOUL.md", present: isDir(h + "/.hermes"))]
  }
  static func hasBlock(_ path: String) -> Bool {
    guard let d = fm.contents(atPath: path), let s = d.range(of: Data(startMarker.utf8)) else { return false }
    return d.range(of: Data(endMarker.utf8), in: s.upperBound..<d.endIndex) != nil
  }
  static func agentStatus() -> J {
    let tools: [J] = agentFiles().map { f in
      let on = hasBlock(f.path)
      return ["id": f.id, "name": f.name, "file": display(f.path), "state": on ? "on" : f.present ? "off" : "missing", "backup": fm.fileExists(atPath: f.path + ".187n-backup"),
              "note": on ? "Reads your brain" : f.present ? "Not given yet" : "\(f.name) is not set up on this Mac"]
    }
    return ["enabled": Store.shared.setting("brainAgents") as? Bool == true, "tools": tools]
  }
  static func block(_ folders: [String]) -> String {
    var lines = [startMarker, "## My second brain", "My notes live in these folders (Markdown, Obsidian style):"]
    for (i, f) in folders.enumerated() { lines.append("- \(f)" + (i == 0 ? " (main: new notes go here)" : "")) }
    lines += ["", "When you work for me:",
              "- Start with `Home.md` (or the index note) in the main folder to find your way around.",
              "- Search these folders when a task touches my work, clients, projects or earlier decisions.",
              "- Put new notes in `Inbox/` of the main folder, with a clear title. Link related notes with [[note name]].",
              "- Never delete, move or rename a note without asking me first.",
              "(Added by 187N Agent HQ. Remove it in Knowledge › Second brain.)", endMarker]
    return lines.joined(separator: "\n")
  }
  private static var records: J { docs.value("agentFiles") as? J ?? [:] }
  private static func record(_ path: String, _ value: J?) { var r = records; r[path] = value; docs.setValue("agentFiles", r) }

  static func enableAgents() throws -> J {
    let folders = Knowledge.configuredRoots().filter(isDir)
    guard !folders.isEmpty else { throw APIError(422, "no_brain", "Connect a notes folder first.") }
    let results = writeAll(folders)
    Store.shared.setSettings(["brainAgents": true]); emit()
    return ["results": results, "status": status()]
  }
  static func disableAgents() throws -> J {
    agentLock.lock(); defer { agentLock.unlock() }
    var results: J = [:]
    for f in agentFiles() { do { results[f.id] = ["ok": true, "removed": try removeBlock(f.path)] } catch { results[f.id] = ["ok": false, "error": error.localizedDescription] } }
    Store.shared.setSettings(["brainAgents": false]); emit()
    return ["results": results, "status": status()]
  }
  private static func writeAll(_ folders: [String]) -> J {
    agentLock.lock(); defer { agentLock.unlock() }
    var results: J = [:]
    let text = block(folders)
    for f in agentFiles() {
      guard f.present || hasBlock(f.path) else { results[f.id] = ["ok": false, "skipped": true, "error": "\(f.name) is not set up on this Mac."]; continue }
      do { try writeBlock(f.path, text); results[f.id] = ["ok": true] } catch { results[f.id] = ["ok": false, "error": (error as? APIError)?.message ?? error.localizedDescription] }
    }
    return results
  }
  // After the folders change: the blocks follow (or go when no folder is left).
  static func syncAgents() {
    guard Store.shared.setting("brainAgents") as? Bool == true else { return }
    let folders = Knowledge.configuredRoots().filter(isDir)
    if folders.isEmpty { _ = try? disableAgents() } else { _ = writeAll(folders) }
  }
  // Writes through a symbolic link to the real file, atomically.
  private static func real(_ path: String) -> URL { URL(fileURLWithPath: (path as NSString).resolvingSymlinksInPath) }
  static func writeBlock(_ path: String, _ text: String) throws {
    let blockData = Data(text.utf8), start = Data(startMarker.utf8), end = Data(endMarker.utf8)
    if let old = fm.contents(atPath: path) {
      if let s = old.range(of: start), let e = old.range(of: end, in: s.upperBound..<old.endIndex) {
        var next = old.subdata(in: old.startIndex..<s.lowerBound); next.append(blockData); next.append(old.subdata(in: e.upperBound..<old.endIndex))
        if next != old { try next.write(to: real(path), options: .atomic) }
        return
      }
      if !fm.fileExists(atPath: path + ".187n-backup") { try old.write(to: URL(fileURLWithPath: path + ".187n-backup"), options: .withoutOverwriting) }
      let sep = old.isEmpty ? "" : old.last == 0x0A ? "\n" : "\n\n"
      var next = old; next.append(Data(sep.utf8)); next.append(blockData); next.append(0x0A)
      try next.write(to: real(path), options: .atomic)
      record(path, ["sep": sep, "created": false, "dirCreated": false])
    } else {
      let dir = (path as NSString).deletingLastPathComponent, dirCreated = !fm.fileExists(atPath: dir)
      if dirCreated { try fm.createDirectory(atPath: dir, withIntermediateDirectories: true) }
      var next = blockData; next.append(0x0A)
      try next.write(to: URL(fileURLWithPath: path), options: .withoutOverwriting)
      record(path, ["sep": "", "created": true, "dirCreated": dirCreated])
    }
  }
  // Takes out exactly the block (and the line break added before it): the file is as it was before.
  @discardableResult static func removeBlock(_ path: String) throws -> Bool {
    guard let old = fm.contents(atPath: path), let s = old.range(of: Data(startMarker.utf8)), let e = old.range(of: Data(endMarker.utf8), in: s.upperBound..<old.endIndex) else { record(path, nil); return false }
    let rec = records[path] as? J
    var lo = s.lowerBound, hi = e.upperBound
    if hi < old.endIndex, old[hi] == 0x0A { hi += 1 }
    if let sep = (rec?["sep"] as? String).map({ Data($0.utf8) }), !sep.isEmpty, lo - old.startIndex >= sep.count, old.subdata(in: (lo - sep.count)..<lo) == sep { lo -= sep.count }
    else if rec == nil, lo - old.startIndex >= 2, old[lo - 1] == 0x0A, old[lo - 2] == 0x0A { lo -= 1 }
    var next = old.subdata(in: old.startIndex..<lo); next.append(old.subdata(in: hi..<old.endIndex))
    if next.isEmpty, rec?["created"] as? Bool == true {
      try fm.removeItem(atPath: path)
      let dir = (path as NSString).deletingLastPathComponent
      if rec?["dirCreated"] as? Bool == true, (try? fm.contentsOfDirectory(atPath: dir))?.isEmpty == true { try? fm.removeItem(atPath: dir) }
    } else { try next.write(to: real(path), options: .atomic) }
    record(path, nil)
    return true
  }

  // MARK: the Brain pages' data, across every folder
  static func graph(_ scope: String, countOnly: Bool, refresh: Bool) throws -> J {
    guard ["second", "workspace"].contains(scope) else { throw APIError(400, "bad_scope", "scope must be second or workspace") }
    if refresh { Knowledge.shared.index() }
    let k = Knowledge.shared.state(), notes = k.notes
    var degree = [Int](repeating: 0, count: notes.count)
    let edges = k.pairs.sorted { $0.0 != $1.0 ? $0.0 < $1.0 : $0.1 < $1.1 }
    for (a, b) in edges { degree[a] += 1; degree[b] += 1 }
    let counts: J = ["nodes": notes.count, "edges": edges.count, "isolated": degree.filter { $0 == 0 }.count]
    let info = vaultInfo(k)
    if countOnly { return ["scope": scope, "counts": counts, "bytes_gzip": max(1024, notes.count * 40), "estimate": true, "vault": ["name": info["name"]!, "indexed_at": k.indexedAt]] }
    var folders: [String] = [], folderIndex: [String: Int] = [:], tagNames: [String] = [], tagIndex: [String: Int] = [:]
    for n in notes where folderIndex[n.folder] == nil { folderIndex[n.folder] = folders.count; folders.append(n.folder) }
    for n in notes { for t in n.tags where tagIndex[t] == nil { tagIndex[t] = tagNames.count; tagNames.append(t) } }
    var flat: [Int] = [], prev = 0
    for (a, b) in edges { flat.append(a - prev); flat.append(b); prev = a }
    let hubs = degree.enumerated().filter { $0.element > 0 }.sorted { $0.element > $1.element }.prefix(12).map { $0.offset }
    return ["format": 1, "scope": scope, "prefix": "", "folders": folders, "folder": notes.map { folderIndex[$0.folder]! }, "names": notes.map { ($0.path as NSString).lastPathComponent },
            "titles": notes.map { $0.title }, "kinds": ["note"], "kind": notes.map { _ in 0 }, "tag_names": tagNames, "tags": notes.map { $0.tags.map { tagIndex[$0]! } },
            "edges": flat, "edge_encoding": "source-delta", "hubs": hubs, "counts": counts, "vault": info]
  }
  private static func vaultInfo(_ k: Knowledge.State) -> J {
    let name = k.roots.count == 1 ? k.roots[0].name : k.roots.isEmpty ? "Second brain" : "Second brain · \(k.roots.count) folders"
    let errors = k.roots.filter { !$0.exists }.map { "Folder not found: \(display($0.path))" }
    return ["name": name, "root": "", "indexed_at": k.indexedAt, "index_seconds": k.seconds, "notes": k.notes.count, "canvases": 0, "attachments": 0, "unresolved_links": k.unresolved,
            "unresolved_scope": "all folders", "errors": errors, "error_count": errors.count, "complete": !k.capped, "scope": k.roots.map { $0.name }.joined(separator: ", "),
            "folders": k.roots.map { ["name": $0.name, "notes": $0.notes, "links": $0.links] as J }]
  }
  // Communities: the top-level folders of each brain folder ("Work › Projects"); notes at a folder's top form its own.
  static func communities() -> J {
    let k = Knowledge.shared.state()
    let key = { (n: Knowledge.Note) -> String in let p = n.path.split(separator: "/").map(String.init); return p.count > 2 ? p[0] + " › " + p[1] : p[0] }
    var sizes: [String: Int] = [:]
    for n in k.notes { sizes[key(n), default: 0] += 1 }
    let tops = sizes.keys.sorted { sizes[$0]! != sizes[$1]! ? sizes[$0]! > sizes[$1]! : $0 < $1 }.prefix(48)
    var labels: J = [:], community: J = [:], index: [String: Int] = [:]
    for (i, t) in tops.enumerated() { labels[String(i)] = t; index[t] = i }
    for n in k.notes { if let i = index[key(n)] { community[n.path] = i } }
    return ["available": !k.notes.isEmpty, "built_at": k.indexedAt, "built_at_source": "notes index", "commit": "", "root": "", "labels": labels, "community": community,
            "links": k.pairs.prefix(400).map { [k.notes[$0.0].path, k.notes[$0.1].path, "links_to", "EXTRACTED"] },
            "coverage": ["mapped": community.count, "graph_nodes": k.notes.count, "graph_files": k.notes.count, "missing_files": 0, "wiki_pages": k.notes.count, "communities": labels.count],
            "stale": false, "hyperedges": 0, "reason": k.notes.isEmpty ? "No notes yet." : ""]
  }
  static func vault() -> J {
    let k = Knowledge.shared.state()
    var info = vaultInfo(k); info["access"] = "Read only"; info["ignored_patterns"] = [".obsidian", ".trash", ".git", "node_modules"]
    return ["vault": info, "nodes": k.notes.prefix(150).map { ["id": $0.path, "path": true] as J }, "edges": k.pairs.prefix(150).map { ["source": k.notes[$0.0].path, "target": k.notes[$0.1].path, "kind": "vault-link"] as J },
            "files": k.notes.count, "total_nodes": k.notes.count, "total_edges": k.pairs.count, "summary": true]
  }
  // A note's text for the Brain's reader (a JSON string; frontend/patches/brain.mjs unwraps it).
  static func noteText(_ id: String) throws -> Any {
    let k = Knowledge.shared.state()
    guard let i = k.ids[id], k.notes[i].root < k.roots.count else { throw APIError(404, "not_found", "This note is no longer in your brain. Refresh the Brain.") }
    let n = k.notes[i], file = k.roots[n.root].path + "/" + n.rel
    guard let data = fm.contents(atPath: file) else { throw APIError(404, "not_found", "This note could not be read. It may have moved.") }
    return String(decoding: data.prefix(1_000_000), as: UTF8.self)
  }
  static func librarian() -> J {
    let k = Knowledge.shared.state(), configured = Knowledge.configuredRoots(), watching = Knowledge.shared.watching
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"
    let iso = { (t: Double) in ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: t)) }
    let line = configured.isEmpty ? "No folders connected yet: add one under Second brain." : (watching ? "Watching \(configured.count) folder\(configured.count == 1 ? "" : "s") live" : "Re-reading every 2 minutes")
    let at = k.indexedAt > 0 ? k.indexedAt : now()
    let entry: J = ["label": "notes-watcher", "name": "Notes watcher", "plist": "", "schedule": ["value": "live, plus a full check every 30 min", "source": "app", "measured": true],
                    "program": ["value": "built in", "source": "app", "measured": true], "plistNote": ["value": "", "source": "app", "measured": true],
                    "loaded": ["value": !configured.isEmpty, "source": "app", "measured": true], "lastExit": ["value": k.error == nil ? 0 : 1, "source": "app", "measured": true],
                    "running": ["value": false, "source": "app", "measured": true], "state": configured.isEmpty ? "not connected" : (k.error == nil ? "ok" : "failing"),
                    "lastTick": ["value": iso(at), "measured": true, "line": f.string(from: Date(timeIntervalSince1970: at)) + " " + line],
                    "lastOk": k.indexedAt > 0 ? ["value": iso(k.indexedAt), "source": "app", "measured": true] : ["value": NSNull(), "source": "app", "measured": false, "reason": "Not read yet."]]
    let inbox = configured.first.map { $0 + "/Inbox" }
    let waiting = inbox.flatMap { try? fm.contentsOfDirectory(atPath: $0) }?.filter { $0.lowercased().hasSuffix(".md") } ?? []
    return ["ok": true, "generatedAt": iso(now()), "agents": [entry],
            "queue": ["shared": ["value": waiting.count, "source": "Inbox folder", "measured": true, "files": waiting.prefix(20).map { ["name": $0] as J }],
                      "private": ["value": NSNull(), "source": "app", "measured": false, "reason": "not used"], "batchSize": ["value": 0, "source": "app", "measured": true, "note": ""]],
            "open": ["held": ["value": 0, "source": "app", "measured": true, "items": [String]()], "questions": ["value": 0, "source": "app", "measured": true, "items": [String]()]],
            "launchctl": ["value": true, "source": "app", "measured": true], "policy": ["notEnabledIsNotFailed": "No folder connected is not a failure."], "tookMs": Int(k.seconds * 1000), "observedAt": iso(now())]
  }
  static func logFeed() -> J {
    let k = Knowledge.shared.state(), iso = ISO8601DateFormatter()
    return ["ok": true, "generatedAt": iso.string(from: Date()), "source": "local", "modified": iso.string(from: Date(timeIntervalSince1970: k.indexedAt)), "rel": "", "total": k.log.count, "returned": k.log.count,
            "capped": false, "capNote": "", "opCounts": k.log.reduce(into: [String: Int]()) { $0[$1["op"] as? String ?? "indexed", default: 0] += 1 }, "entries": k.log,
            "caps": ["logEntries": 40, "logBodyChars": 400], "observedAt": iso.string(from: Date())]
  }
}
