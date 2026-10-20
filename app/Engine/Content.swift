// Content: ideas, scripts, the production board, jobs, campaigns and accounts (stored on this Mac in data/content.json).
// The pages (Studio, Production, Campaigns, Accounts) read and write through /api/hq/v1/marketing/…; other areas add
// ideas (Signals, Competitors, Creator Lab), record their jobs and attach rendered slides (the makers) through `Content`.
import Foundation

enum ContentAPI {
  // Only paths under marketing/ that this area knows; anything else is left to the other areas (nil).
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    guard path.hasPrefix("marketing/") else { return nil }
    let p = String(path.dropFirst(10)), q = r.query, body = r.json
    switch (method, p) {
    case ("GET", "content"): return await Content.listing(q)
    case ("POST", "content"): return try Content.change(body, router)
    case ("GET", "jobs"): return ["jobs": Content.jobs(), "items": Content.items().map(Content.brief)]
    case ("POST", "jobs/start"):
      return try ContentJobs.start(kind: body["kind"] as? String ?? "", itemID: body["itemId"] as? String ?? "", review: body["review"] as? Bool ?? true, router: router)
    case ("GET", "campaigns"): return ["campaigns": ContentCampaigns.list(), "items": Content.items().map(Content.brief), "zernio": Zernio.connected]
    case ("POST", "campaigns"): return try ContentCampaigns.change(body, router)
    case ("GET", "studio"): return await Content.studio()
    case ("GET", "accounts"): return await Content.accountsPage()
    case ("POST", "accounts"): return try Content.saveAccountNote(body)
    case ("GET", "file"), ("HEAD", "file"): return ContentFiles.serve(q["path"] ?? "", range: r.headers["range"], router)
    case ("GET", "files"): return ContentFiles.listing(router)
    #if DEBUG
    // Test builds only: the contracts the other areas call (ideas from research, renders from the makers).
    case ("POST", "test/idea"): return Content.addIdea(title: body["title"] as? String ?? "", hook: body["hook"] as? String ?? "", notes: body["notes"] as? String ?? "", source: body["source"] as? J ?? [:])
    case ("POST", "test/attach"):
      return Content.attachRenders(itemID: body["itemId"] as? String, kind: body["kind"] as? String ?? "carousel", title: body["title"] as? String ?? "", files: body["files"] as? [String] ?? [], slides: body["slides"] as? [J] ?? [])
    case ("POST", "test/job"):
      let job = Content.recordJob(kind: body["kind"] as? String ?? "carousel", itemID: body["itemId"] as? String, title: body["title"] as? String ?? "", status: body["status"] as? String ?? "running", runID: nil)
      if let changes = body["update"] as? J { Content.updateJob(job["id"] as? String ?? "", changes) }
      return Content.db.get("jobs", id: job["id"] as? String ?? "") ?? job
    #endif
    default:
      let parts = p.split(separator: "/").map(String.init)
      if method == "POST", parts.count == 3, parts[0] == "jobs", parts[2] == "cancel" { return try ContentJobs.cancel(parts[1], router) }
      if method == "POST", parts.count == 3, parts[0] == "campaigns", parts[2] == "draft" { return try await ContentCampaigns.draft(parts[1], body, router) }
      return nil
    }
  }
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { nil }
  // Jobs whose run was cut off (the app quit while it ran) are marked failed, so nothing waits forever.
  static func tick(_ router: Router) {
    let runs = Dictionary(router.store.list("runs").compactMap { r in (r["id"] as? String).map { ($0, r["status"] as? String ?? "") } }) { a, _ in a }
    for j in Content.jobs() where ["queued", "running"].contains(j["status"] as? String ?? "") {
      guard let run = j["runId"] as? String, runs[run] == "interrupted" else { continue }
      Content.updateJob(j["id"] as? String ?? "", ["status": "failed", "detail": ["error": "The app was closed while this job ran. Start it again."]])
    }
  }
}

enum Content {
  static let db = DocStore.named("content")
  static let stages = ["Idea", "Scripted", "To Edit", "Editing", "To Review", "Ready To Post", "Posted", "Archived"]
  static let formats = ["reel", "carousel", "story", "post", "video", "newsletter"]
  static let jobStates = ["queued", "running", "review", "failed", "done"]

  // MARK: contracts for the other areas
  // A new idea on the board (from Signals, a competitor post or a Creator Lab post). Returns the item.
  @discardableResult static func addIdea(title: String, hook: String = "", notes: String = "", source: J = [:]) -> J {
    let item = newItem(["title": title, "hook": hook, "notes": notes, "sourceRef": source, "format": source["format"] ?? "reel"])
    db.upsert("items", item); changed("Idea added", item); return item
  }
  // Rendered carousel or story slides (PNG files) attached to an item, or to a new item when itemID is nil. A slide that
  // carries a "campaignId" also adds the files to that campaign's carousel or story strip (as does the campaign the item
  // already belongs to). A new render of the same kind replaces the item's earlier slides of that kind.
  @discardableResult static func attachRenders(itemID: String?, kind: String, title: String, files: [String], slides: [J]) -> J {
    let fmt = kind.lowercased().hasPrefix("stor") ? "story" : kind.lowercased().hasPrefix("carousel") ? "carousel" : (formats.contains(kind) ? kind : "carousel")
    let added: [J] = files.enumerated().map { i, f in
      let s = i < slides.count ? slides[i] : [:]
      return ["path": f, "kind": fmt, "slide": i + 1, "title": clip(s["title"] ?? s["heading"], 200), "body": clip(s["body"] ?? s["text"], 600), "addedAt": isoNow()]
    }
    var item: J
    if let id = itemID, let existing = self.item(id) {
      item = existing
      item["files"] = ((existing["files"] as? [J]) ?? []).filter { ($0["kind"] as? String) != fmt } + added
      if index(existing["status"]) < index("To Review") { enterReview(&item, kind: "piece") }
      item["updatedAt"] = isoNow()
    } else {
      item = newItem(["title": title.isEmpty ? (fmt == "story" ? "Stories" : "Carousel") : title, "format": fmt])
      item["files"] = added; item["reviewFrom"] = "Editing"; item["reviewKind"] = "piece"; item["status"] = "To Review"
    }
    db.upsert("items", item)
    // The campaign named in the slides, or the one the item already belongs to (its strips then show the new render).
    let named = slides.compactMap({ $0["campaignId"] as? String }).first(where: { !$0.isEmpty }) ?? (item["campaignId"] as? String ?? "")
    if !named.isEmpty, ContentCampaigns.get(named) != nil {
      ContentCampaigns.link(named, itemID: item["id"] as? String ?? "")
      item = self.item(item["id"] as? String ?? "") ?? item
    }
    changed("Slides attached", item); return item
  }
  // A content job (script, hooks, caption, carousel, stories) on the Jobs page; other areas record theirs here too.
  @discardableResult static func recordJob(kind: String, itemID: String?, title: String, status: String, runID: String?, detail: J = [:]) -> J {
    let t = isoNow()
    let job: J = ["id": newID("job"), "kind": kind, "itemId": itemID ?? "", "title": clip(title, 200), "status": jobStates.contains(status) ? status : "queued",
                  "runId": runID ?? "", "detail": detail, "createdAt": t, "updatedAt": t]
    db.upsert("jobs", job, limit: 500); Store.shared.emit("content.updated", ["title": title]); return job
  }
  static func updateJob(_ id: String, _ changes: J) {
    db.update("jobs", id: id) { j in
      for (k, v) in changes where ["title", "itemId", "runId"].contains(k) { j[k] = v }
      if let s = changes["status"] as? String, jobStates.contains(s) { j["status"] = s }
      if let d = changes["detail"] as? J { var cur = j["detail"] as? J ?? [:]; for (k, v) in d { cur[k] = v }; j["detail"] = cur }
      j["updatedAt"] = isoNow()
    }
    Store.shared.emit("content.updated", ["job": id])
  }

  // MARK: storage helpers
  static func items() -> [J] { db.list("items") }
  static func item(_ id: String) -> J? { db.get("items", id: id) }
  static func jobs() -> [J] { db.list("jobs") }
  static func index(_ status: Any?) -> Int { stages.firstIndex(of: status as? String ?? "") ?? 0 }
  static func clip(_ v: Any?, _ n: Int) -> String { String(((v as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(n)) }
  // The few fields the other pages need about an item (names in a job list, a campaign's pieces).
  static func brief(_ i: J) -> J { ["id": i["id"] ?? "", "title": i["title"] ?? "", "status": i["status"] ?? "", "format": i["format"] ?? "", "accountId": i["accountId"] ?? "", "updatedAt": i["updatedAt"] ?? ""] }
  static func changed(_ title: String, _ item: J) { Store.shared.emit("content.updated", ["title": title + " · " + (item["title"] as? String ?? "")]) }

  static func newItem(_ b: J) -> J {
    let t = isoNow(), src = b["sourceRef"] as? J ?? [:]
    var item: J = ["id": newID("item"), "title": "", "status": "Idea", "format": "reel", "accountId": "", "hook": "", "hooks": [String](), "script": "", "caption": "", "notes": "",
                   "sourceRef": ["kind": clip(src["kind"], 40), "url": safeURL(src["url"]), "title": clip(src["title"], 300)], "campaignId": "", "files": [J](), "reviews": [J](),
                   "dueDate": "", "createdAt": t, "updatedAt": t]
    apply(b, to: &item)
    if (item["title"] as? String ?? "").isEmpty { item["title"] = "Untitled idea" }
    return item
  }
  // The fields a student may edit; anything else in the body is ignored.
  static func apply(_ b: J, to item: inout J) {
    let limits = ["title": 200, "hook": 500, "script": 20000, "caption": 5000, "notes": 5000, "accountId": 120]
    for (k, n) in limits where b[k] is String { item[k] = clip(b[k], n) }
    if let f = b["format"] as? String, formats.contains(f) { item["format"] = f }
    if let h = b["hooks"] as? [String] { item["hooks"] = h.map { clip($0, 300) }.filter { !$0.isEmpty }.prefix(10).map { $0 } }
    if let d = b["dueDate"] as? String { item["dueDate"] = d.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil ? d : "" }
  }
  static func safeURL(_ v: Any?) -> String { guard let s = v as? String, let u = URL(string: s), u.scheme == "https" || u.scheme == "http" else { return "" }; return s }
  // An item that enters To Review remembers where it came from (a rejection sends it back) and what is reviewed.
  // An item already in review keeps what is reviewed (new hooks for a script under review leave it a script).
  static func enterReview(_ item: inout J, kind: String) {
    if item["status"] as? String != "To Review" { item["reviewFrom"] = item["status"] ?? "Idea"; item["reviewKind"] = kind }
    else if ((item["reviewKind"] as? String) ?? "").isEmpty { item["reviewKind"] = kind }
    item["status"] = "To Review"
  }

  // MARK: the Library and Board
  static func listing(_ q: [String: String]) async -> J {
    let all = items().sorted { ($0["updatedAt"] as? String ?? "") > ($1["updatedAt"] as? String ?? "") }
    let status = q["status"] ?? "", format = q["format"] ?? "", search = (q["search"] ?? "").lowercased()
    let shown = all.filter { i in
      (status.isEmpty || i["status"] as? String == status) && (format.isEmpty || i["format"] as? String == format)
        && (search.isEmpty || ["title", "hook", "notes", "script", "caption"].contains { ((i[$0] as? String) ?? "").lowercased().contains(search) })
    }
    let counts = Dictionary(uniqueKeysWithValues: stages.map { s in (s, all.filter { $0["status"] as? String == s }.count) })
    return ["items": shown, "total": all.count, "counts": counts, "stages": stages, "formats": formats, "accounts": await accountList(),
            "campaigns": ContentCampaigns.list().map { ["id": $0["id"] ?? "", "name": $0["name"] ?? ""] as J }, "jobs": jobs().filter { ["queued", "running", "review"].contains($0["status"] as? String ?? "") }]
  }

  static func change(_ b: J, _ router: Router) throws -> Any {
    let action = b["action"] as? String ?? "", id = b["id"] as? String ?? ""
    if action == "add" {
      var created = newItem(b)
      if let s = b["status"] as? String, stages.contains(s), s != "To Review" { created["status"] = s }
      db.upsert("items", created)
      let cid = b["campaignId"] as? String ?? "", newID = created["id"] as? String ?? ""
      if !cid.isEmpty { ContentCampaigns.link(cid, itemID: newID) }
      changed("Idea added", created); return item(newID) ?? created
    }
    guard let current = item(id) else { throw APIError(404, "not_found", "This item no longer exists. Refresh the page.") }
    switch action {
    case "update":
      var next = current; apply(b, to: &next); next["updatedAt"] = isoNow()
      db.upsert("items", next)
      if let cid = b["campaignId"] as? String, cid != current["campaignId"] as? String ?? "" {
        if let old = current["campaignId"] as? String, !old.isEmpty { ContentCampaigns.unlink(old, itemID: id) }
        if !cid.isEmpty { ContentCampaigns.link(cid, itemID: id) }
      }
      changed("Item saved", next); return item(id) ?? next
    case "move":
      guard let s = b["status"] as? String, stages.contains(s) else { throw APIError(422, "bad_stage", "Choose one of the stages.") }
      let out = db.update("items", id: id) { i in
        if s == "To Review" { enterReview(&i, kind: "piece") } else { i["status"] = s }
        i["updatedAt"] = isoNow()
      }
      changed("Moved to " + s, out ?? current); return out ?? current
    case "delete":
      if let cid = current["campaignId"] as? String, !cid.isEmpty { ContentCampaigns.unlink(cid, itemID: id) }
      db.remove("items", id: id); changed("Item deleted", current); return ["ok": true, "id": id]
    case "review": return try review(current, b, router)
    default: throw APIError(422, "bad_action", "Unknown action.")
    }
  }

  // Approve sends a script to Recording and a finished piece to Ready To Post; reject goes back a step with the note;
  // rehook asks the writer for five new hooks (the item stays in Review until they are in).
  static func review(_ current: J, _ b: J, _ router: Router) throws -> J {
    let id = current["id"] as? String ?? "", decision = b["decision"] as? String ?? "", note = clip(b["note"], 4000)
    guard current["status"] as? String == "To Review" else { throw APIError(409, "not_in_review", "This item is not waiting for review any more. Refresh the page.") }
    guard ["approve", "reject", "rehook"].contains(decision) else { throw APIError(422, "bad_decision", "Choose approve, reject or rehook.") }
    if decision == "reject" && note.isEmpty { throw APIError(422, "note_required", "Write a short note so the next version can be better.") }
    if decision == "rehook", jobs().contains(where: { $0["itemId"] as? String == id && $0["kind"] as? String == "hooks.generate" && ["queued", "running"].contains($0["status"] as? String ?? "") }) {
      throw APIError(409, "busy", "New hooks are already being written for this item.")
    }
    let out = db.update("items", id: id) { i in
      var reviews = i["reviews"] as? [J] ?? []; reviews.append(["decision": decision, "note": note, "at": isoNow()]); i["reviews"] = Array(reviews.suffix(50))
      let files = (i["files"] as? [J] ?? []).isEmpty == false
      switch decision {
      case "approve": i["status"] = (i["reviewKind"] as? String) == "script.write" ? "Scripted" : "Ready To Post"
      case "reject":
        let back = i["reviewFrom"] as? String ?? ""
        i["status"] = stages.contains(back) && back != "To Review" ? back : (files ? "Editing" : "Idea")
      default: break
      }
      i["updatedAt"] = isoNow()
    } ?? current
    // The results that were waiting for this decision are settled.
    if decision != "rehook" { for j in jobs() where j["itemId"] as? String == id && j["status"] as? String == "review" { updateJob(j["id"] as? String ?? "", ["status": "done", "detail": ["decision": decision]]) } }
    var res: J = ["item": out]
    if decision == "rehook" { res["job"] = try ContentJobs.start(kind: "hooks.generate", itemID: id, review: true, note: note, router: router) }
    changed(decision == "approve" ? "Approved" : decision == "reject" ? "Rejected" : "New hooks asked", out)
    return res
  }

  // MARK: Studio
  static func studio() async -> J {
    let all = items(), active = all.filter { $0["status"] as? String != "Archived" }, now = Date()
    let stageLoad: [J] = stages.filter { $0 != "Archived" }.map { s in
      let here = active.filter { $0["status"] as? String == s }
      let oldest = here.compactMap { ISO8601DateFormatter().date(from: $0["updatedAt"] as? String ?? "") }.min()
      return ["stage": s, "count": here.count, "oldestDays": oldest.map { max(0, Int(now.timeIntervalSince($0) / 86400)) } ?? NSNull()]
    }
    let js = jobs()
    var own: J = ["connected": Zernio.connected, "analytics": false, "posts": [J](), "posted30": NSNull(), "note": ""]
    if Zernio.connected {
      if let r = try? await Zernio.posts(days: 90) {
        let cutoff = ISO8601DateFormatter().string(from: Date(timeIntervalSinceNow: -30 * 86400))
        let views = { (p: J) in ((p["metrics"] as? J)?["views"] as? Int) ?? 0 }
        own = ["connected": true, "analytics": r.analytics, "note": r.note, "posted30": r.posts.filter { ($0["publishedAt"] as? String ?? "") >= cutoff }.count,
               "posts": Array(r.posts.sorted { views($0) > views($1) }.prefix(8))]
      } else { own["note"] = "Zernio did not answer. Your posts show again when it does." }
    }
    return ["items": all.map(brief), "stages": stageLoad, "total": active.count, "rising": Research.risingPosts(limit: 8), "own": own,
            "jobs": ["review": js.filter { $0["status"] as? String == "review" }.count, "failed": js.filter { $0["status"] as? String == "failed" && ($0["detail"] as? J)?["cancelled"] as? Bool != true }.count,
                     "running": js.filter { ["queued", "running"].contains($0["status"] as? String ?? "") }.count],
            "campaigns": ContentCampaigns.list().count, "observedAt": isoNow()]
  }

  // MARK: accounts (Zernio) with the student's notes on what each account is for
  private static let cacheLock = NSLock()
  private static var cached: (at: Double, list: [J])?
  private static func cache(_ set: [J]? = nil) -> [J]? {
    cacheLock.lock(); defer { cacheLock.unlock() }
    if let set { cached = (now(), set); return set }
    guard let c = cached, now() - c.at < 60 else { return nil }
    return c.list
  }
  // The connected accounts (kept for a minute, so the Library does not ask Zernio on every visit).
  static func accountList(fresh: Bool = false) async -> [J] {
    guard Zernio.connected else { return [] }
    if !fresh, let c = cache() { return c }
    guard let list = try? await Zernio.accounts() else { return cache() ?? [] }
    return cache(list) ?? list
  }
  static func notes() -> J { db.value("accountNotes") as? J ?? [:] }
  static func accountsPage() async -> J {
    let list = await accountList(fresh: true), n = notes(), all = items()
    let accounts: [J] = list.map { a in
      let id = a["id"] as? String ?? "", note = n[id] as? J ?? [:]
      return a.merging(["purpose": note["purpose"] ?? "", "pillars": note["pillars"] ?? [String](), "items": all.filter { $0["accountId"] as? String == id && $0["status"] as? String != "Archived" }.count]) { $1 }
    }
    return ["connected": Zernio.connected, "accounts": accounts, "unassigned": all.filter { ($0["accountId"] as? String ?? "").isEmpty && $0["status"] as? String != "Archived" }.count,
            "note": Zernio.connected && list.isEmpty ? "No accounts are connected in Zernio yet." : ""]
  }
  static func saveAccountNote(_ b: J) throws -> J {
    guard let id = b["accountId"] as? String, !id.isEmpty else { throw APIError(422, "bad_request", "Choose an account.") }
    let raw = (b["pillars"] as? [String]) ?? ((b["pillars"] as? String) ?? "").split(separator: ",").map(String.init)
    let pillars = raw.map { clip($0, 60) }.filter { !$0.isEmpty }.prefix(8)
    let note: J = ["purpose": clip(b["purpose"], 600), "pillars": Array(pillars), "updatedAt": isoNow()]
    var all = notes(); all[id] = note; db.setValue("accountNotes", all)
    return note.merging(["accountId": id]) { $1 }
  }
}
