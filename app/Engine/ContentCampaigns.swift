// Campaigns: a name, a comment keyword and a goal; the pieces that belong to it; their carousel and story slides (the
// rendered files); and one caption. A campaign becomes a Zernio draft only after the student confirms in the page, and
// nothing here publishes or schedules: the student does that in Zernio.
import Foundation

enum ContentCampaigns {
  static var db: DocStore { Content.db }
  static let states = ["Planning", "Ready", "Drafted", "Done"]
  static func list() -> [J] { db.list("campaigns") }
  static func get(_ id: String) -> J? { db.get("campaigns", id: id) }

  static func change(_ b: J, _ router: Router) throws -> J {
    let action = b["action"] as? String ?? "", id = b["id"] as? String ?? ""
    if action == "add" {
      let name = Content.clip(b["name"], 120)
      guard !name.isEmpty else { throw APIError(422, "name_required", "Give the campaign a name.") }
      var c: J = ["id": newID("camp"), "name": name, "keyword": "", "goal": "", "caption": "", "status": "Planning", "itemIds": [String](), "formats": ["carousel": [J](), "story": [J]()],
                  "drafts": [J](), "createdAt": isoNow(), "updatedAt": isoNow()]
      apply(b, to: &c); db.upsert("campaigns", c)
      for item in (b["itemIds"] as? [String] ?? []) { link(c["id"] as? String ?? "", itemID: item) }
      emit("Campaign created", c); return get(c["id"] as? String ?? "") ?? c
    }
    guard let c = get(id) else { throw APIError(404, "not_found", "This campaign no longer exists. Refresh the page.") }
    switch action {
    case "update":
      let out = db.update("campaigns", id: id) { x in apply(b, to: &x); x["updatedAt"] = isoNow() } ?? c
      emit("Campaign saved", out); return out
    case "delete":
      for item in c["itemIds"] as? [String] ?? [] { Content.db.update("items", id: item) { if $0["campaignId"] as? String == id { $0["campaignId"] = "" } } }
      db.remove("campaigns", id: id); emit("Campaign deleted", c); return ["ok": true, "id": id]
    case "link", "unlink":
      guard let item = b["itemId"] as? String, Content.item(item) != nil else { throw APIError(404, "not_found", "This item no longer exists.") }
      if action == "link" { link(id, itemID: item) } else { unlink(id, itemID: item) }
      return get(id) ?? c
    case "addFiles":
      // Files from the Marketing folder (or renders), added after the slides already in the strip.
      let format = b["format"] as? String == "story" ? "story" : "carousel"
      let picked = (b["files"] as? [String] ?? []).compactMap { ContentFiles.allowed($0, router)?.path }
      guard !picked.isEmpty else { throw APIError(422, "no_files", "Choose at least one PNG, JPG or MP4 from your Marketing folder.") }
      return db.update("campaigns", id: id) { x in
        var f = x["formats"] as? J ?? [:]; let have = f[format] as? [J] ?? []
        let fresh = picked.filter { p in !have.contains { $0["file"] as? String == p } }
        f[format] = have + fresh.enumerated().map { i, p in ["file": p, "slide": have.count + i + 1, "title": (p as NSString).lastPathComponent, "body": "", "itemId": ""] as J }
        x["formats"] = f; x["updatedAt"] = isoNow()
      } ?? c
    case "removeFile":
      let format = b["format"] as? String == "story" ? "story" : "carousel", file = b["file"] as? String ?? ""
      return db.update("campaigns", id: id) { x in
        var f = x["formats"] as? J ?? [:]; f[format] = (f[format] as? [J] ?? []).filter { $0["file"] as? String != file }; x["formats"] = f; x["updatedAt"] = isoNow()
      } ?? c
    default: throw APIError(422, "bad_action", "Unknown action.")
    }
  }
  static func apply(_ b: J, to c: inout J) {
    for (k, n) in ["name": 120, "keyword": 40, "goal": 600, "caption": 5000] where b[k] is String { c[k] = Content.clip(b[k], n) }
    if (c["name"] as? String ?? "").isEmpty { c["name"] = "Campaign" }
    if let s = b["status"] as? String, states.contains(s) { c["status"] = s }
  }
  static func emit(_ title: String, _ c: J) { Store.shared.emit("content.updated", ["title": title + " · " + (c["name"] as? String ?? "")]) }

  // An item joins one campaign; its carousel and story slides join that campaign's strips (replacing its earlier ones).
  static func link(_ cid: String, itemID: String) {
    guard get(cid) != nil, let item = Content.item(itemID) else { return }
    if let old = item["campaignId"] as? String, !old.isEmpty, old != cid { unlink(old, itemID: itemID) }
    Content.db.update("items", id: itemID) { $0["campaignId"] = cid }
    let files = item["files"] as? [J] ?? []
    db.update("campaigns", id: cid) { c in
      var ids = c["itemIds"] as? [String] ?? []; if !ids.contains(itemID) { ids.append(itemID) }; c["itemIds"] = ids
      var f = c["formats"] as? J ?? [:]
      for format in ["carousel", "story"] {
        let mine: [J] = files.filter { $0["kind"] as? String == format }.map { ["file": $0["path"] ?? "", "slide": $0["slide"] ?? 0, "title": $0["title"] ?? "", "body": $0["body"] ?? "", "itemId": itemID] }
        f[format] = (f[format] as? [J] ?? []).filter { $0["itemId"] as? String != itemID } + mine
      }
      c["formats"] = f; c["updatedAt"] = isoNow()
    }
  }
  static func unlink(_ cid: String, itemID: String) {
    db.update("campaigns", id: cid) { c in
      c["itemIds"] = (c["itemIds"] as? [String] ?? []).filter { $0 != itemID }
      var f = c["formats"] as? J ?? [:]
      for format in ["carousel", "story"] { f[format] = (f[format] as? [J] ?? []).filter { $0["itemId"] as? String != itemID } }
      c["formats"] = f; c["updatedAt"] = isoNow()
    }
    Content.db.update("items", id: itemID) { if $0["campaignId"] as? String == cid { $0["campaignId"] = "" } }
  }

  // A Zernio draft of the campaign's carousel (one post with up to ten slides) or stories (one draft per story, up to
  // ten), with the caption, for the chosen accounts. Needs {confirm: true} from the page's confirm dialog.
  static func draft(_ id: String, _ b: J, _ router: Router) async throws -> J {
    guard (b["confirm"] as? Bool) == true else { throw APIError(400, "confirm_required", "Confirm the draft in the dialog first.") }
    guard let c = get(id) else { throw APIError(404, "not_found", "This campaign no longer exists. Refresh the page.") }
    guard Zernio.connected else { throw APIError(424, "not_connected", "Connect Zernio in Setup first.") }
    let story = b["format"] as? String == "story", word = story ? "stories" : "carousel slides"
    let accounts = (b["accountIds"] as? [String] ?? []).filter { !$0.isEmpty }
    guard !accounts.isEmpty else { throw APIError(422, "no_accounts", "Choose at least one account.") }
    let slides = (c["formats"] as? J)?[story ? "story" : "carousel"] as? [J] ?? []  // in strip order: per piece, slide by slide
    guard !slides.isEmpty else { throw APIError(422, "no_slides", "This campaign has no \(word) yet. Make them in Carousels & stories, then attach them here.") }
    let files = slides.compactMap { ContentFiles.allowed($0["file"] as? String ?? "", router) }
    guard files.count == slides.count else { throw APIError(422, "missing_files", "Some \(word) are no longer on this Mac. Make them again, then try once more.") }
    let caption = b["caption"] is String ? Content.clip(b["caption"], 5000) : (c["caption"] as? String ?? "")
    var drafts: [J] = []
    if story { for f in files.prefix(10) { drafts.append(try await Zernio.createDraft(text: caption, accountIds: accounts, mediaFiles: [f], story: true)) } }
    else { drafts.append(try await Zernio.createDraft(text: caption, accountIds: accounts, mediaFiles: Array(files.prefix(10)))) }
    let record: J = ["format": story ? "story" : "carousel", "postIds": drafts.map { $0["id"] ?? "" }, "accountIds": accounts, "slides": min(files.count, 10), "at": isoNow()]
    let out = db.update("campaigns", id: id) { x in x["drafts"] = Array(((x["drafts"] as? [J] ?? []) + [record]).suffix(20)); x["status"] = "Drafted"; x["updatedAt"] = isoNow() } ?? c
    emit("Zernio draft created", out)
    return ["drafts": drafts, "campaign": out, "message": drafts.count == 1 ? "Draft saved in Zernio. Open Zernio to check it and schedule it." : "\(drafts.count) drafts saved in Zernio. Open Zernio to check and schedule them."]
  }
}
