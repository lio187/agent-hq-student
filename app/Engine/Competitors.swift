// Competitors: the accounts the student watches (Instagram, TikTok, YouTube; at most 25), collected with the
// student's own Apify key. Nothing is collected until the student has seen the maximum cost and confirmed it; every
// run has a hard cost limit and stays within the monthly limit (Apify.swift). Each collection adds an observation per
// post, so growth can be measured; thumbnails are copied from the platforms' image servers (allow-list, 5 MB each)
// and kept for 90 days. Playback uses each platform's official embed player, so no video is stored.
import Foundation

enum Competitors {
  static let platforms = ["instagram", "tiktok", "youtube"]
  static let names = ["instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube"]
  static let maxAccounts = 25, perAccount = 6
  private static var store: DocStore { Research.store }

  // Public Apify tools per platform, best first. All are billed per result (pay per event), so their cost can be
  // capped. When one cannot be capped (its price model changed), the next one is used and the reason is shown.
  // TikTok: the TikTok Data Extractor comes first because Apify's TikTok Scraper asks for a cost limit of at least
  // $0.50 per run, which is more than a small watchlist costs.
  struct Actor { let id: String; let input: ([J]) -> J; let items: (Int) -> Int }
  static let actors: [String: [Actor]] = [
    "instagram": [
      Actor(id: "apify~instagram-scraper", input: { a in ["directUrls": a.map { profileURL("instagram", $0["handle"] as? String ?? "") }, "resultsType": "posts", "resultsLimit": perAccount, "addParentData": false] }, items: { $0 * perAccount }),
      Actor(id: "apify~instagram-post-scraper", input: { a in ["username": a.map { $0["handle"] as? String ?? "" }, "resultsLimit": perAccount, "skipPinnedPosts": true, "dataDetailLevel": "basicData"] }, items: { $0 * perAccount }),
    ],
    "tiktok": [
      Actor(id: "clockworks~free-tiktok-scraper", input: tiktokInput, items: { $0 * perAccount }),
      Actor(id: "clockworks~tiktok-scraper", input: tiktokInput, items: { $0 * perAccount }),
    ],
    "youtube": [
      Actor(id: "streamers~youtube-scraper", input: { a in ["startUrls": a.map { ["url": profileURL("youtube", $0["handle"] as? String ?? "")] }, "maxResults": perAccount / 2, "maxResultsShorts": perAccount / 2, "maxResultStreams": 0] }, items: { $0 * perAccount }),
      Actor(id: "streamers~youtube-shorts-scraper", input: { a in ["channels": a.map { $0["handle"] as? String ?? "" }, "maxResultsShorts": perAccount] }, items: { $0 * perAccount }),
    ],
  ]
  private static func tiktokInput(_ a: [J]) -> J {
    ["profiles": a.map { $0["handle"] as? String ?? "" }, "resultsPerPage": perAccount, "profileScrapeSections": ["videos"], "profileSorting": "latest", "shouldDownloadVideos": false, "shouldDownloadCovers": false,
     "shouldDownloadSlideshowImages": false, "shouldDownloadAvatars": false, "shouldDownloadMusicCovers": false, "downloadSubtitlesOptions": "NEVER_DOWNLOAD_SUBTITLES", "commentsPerPost": 0, "maxFollowersPerProfile": 0, "maxFollowingPerProfile": 0]
  }
  static func profileURL(_ platform: String, _ handle: String) -> String {
    switch platform {
    case "instagram": return "https://www.instagram.com/" + handle + "/"
    case "tiktok": return "https://www.tiktok.com/@" + handle
    default: return handle.hasPrefix("UC") && handle.count == 24 ? "https://www.youtube.com/channel/" + handle : "https://www.youtube.com/@" + handle
    }
  }

  // MARK: API
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    let body = r.json
    switch (method, path) {
    case ("GET", "marketing/competitors"): return page()
    case ("GET", "marketing/competitors/videos"): return ["items": posts().sorted(by: newest).prefix(300).map(wallItem)]
    case ("GET", "marketing/media"): return try media(r.query["id"] ?? "")
    case ("POST", "marketing/competitors/roster"):
      if let add = body["add"] as? J { try addAccount(add) } else if let id = body["remove"] as? String { removeAccount(id) } else { throw APIError(422, "bad_request", "Say which account to add or remove.") }
      return page()
    case ("POST", "marketing/competitors/quote"): return try await plan(only: body["platform"] as? String)
    case ("POST", "marketing/competitors/collect"):
      guard body["confirm"] as? Bool == true else { throw APIError(422, "confirm_required", "Check the cost and confirm it first. Nothing was collected.") }
      guard let confirmed = ResearchAPI.number(body["maxUsd"]), confirmed > 0 else { throw APIError(422, "no_cap", "A maximum cost is required. Nothing was collected.") }
      return try await startCollection(confirmed: confirmed, platform: body["platform"] as? String, reason: "manual")
    case ("POST", "marketing/competitors/auto"): return try await setAuto(body)
    default: break
    }
    let prefix = "marketing/competitors/", suffix = "/idea"
    if method == "POST", path.hasPrefix(prefix), path.hasSuffix(suffix), path.count > prefix.count + suffix.count { return try addIdea(String(path.dropFirst(prefix.count).dropLast(suffix.count))) }
    throw APIError(404, "not_found", "Unknown Competitors request.")
  }

  static func page() -> J {
    let all = posts(), list = roster(), med = medians(all)
    let since14 = Date(timeIntervalSinceNow: -14 * 86400)
    var byCreator: [String: (Double, Int)] = [:]
    for p in all where (Research.date(p["lastSeen"]) ?? .distantPast) >= since14 { let k = display(p); let v = byCreator[k] ?? (0, 0); byCreator[k] = (v.0 + metric(p), v.1 + 1) }
    let health = store.value("health") as? J ?? [:]
    return ["connected": Apify.connected, "maxAccounts": maxAccounts, "perAccount": perAccount,
            "roster": list.map { a -> J in
              let mine = all.filter { $0["accountId"] as? String == a["id"] as? String }
              var x = a; x["platformLabel"] = names[a["platform"] as? String ?? ""] ?? ""; x["url"] = profileURL(a["platform"] as? String ?? "", a["handle"] as? String ?? "")
              x["posts"] = mine.count; x["lastPostAt"] = mine.compactMap { $0["publishedAt"] as? String }.max() ?? ""; return x },
            "health": platforms.filter { p in list.contains { $0["platform"] as? String == p } }.map { p -> J in
              let h = health[p] as? J ?? [:]
              let state = h["at"] == nil ? (h["error"] != nil ? "unavailable" : "pending") : h["error"] is String ? "stale" : (Research.date(h["at"]).map { Date().timeIntervalSince($0) > 8 * 86400 } ?? true) ? "stale" : "current"
              return ["platform": p, "label": names[p] ?? p, "state": state, "at": h["at"] ?? NSNull(), "count": h["count"] ?? 0, "error": h["error"] ?? NSNull(), "actor": h["actor"] ?? NSNull()] },
            "collection": collection(), "thumbsPending": isThumbing(), "ledger": Apify.ledger(), "auto": store.value("auto") ?? ["enabled": false],
            "posts": all.sorted(by: newest).prefix(300).map { shaped($0, medians: med) }, "rising": rising(limit: 8),
            "charts": ["viewsByCreator": byCreator.map { ["label": $0.key, "value": $0.value.0, "posts": $0.value.1] as J }.sorted { ($0["value"] as? Double ?? 0) > ($1["value"] as? Double ?? 0) },
                       "rhythm": platforms.compactMap { p -> J? in let d = all.filter { $0["platform"] as? String == p }.compactMap { $0["publishedAt"] as? String }; return d.isEmpty ? nil : ["platform": p, "label": names[p] ?? p, "dates": d] }],
            "observedAt": isoNow()]
  }

  // MARK: roster
  static func roster() -> [J] { store.list("roster") }
  static func addAccount(_ a: J) throws {
    let platform = (a["platform"] as? String ?? "").lowercased()
    guard platforms.contains(platform) else { throw APIError(422, "bad_platform", "Choose Instagram, TikTok or YouTube.") }
    guard let handle = cleanHandle(platform, a["handle"] as? String ?? "") else { throw APIError(422, "bad_handle", "Enter the account's handle (for example @studio.name) or its profile address.") }
    let id = platform + ":" + handle.lowercased(), list = roster()
    guard !list.contains(where: { $0["id"] as? String == id }) else { throw APIError(409, "exists", "You already watch this account.") }
    guard list.count < maxAccounts else { throw APIError(422, "too_many", "You can watch at most \(maxAccounts) accounts. Remove one first.") }
    let label = Signals.plain(a["label"] as? String ?? "", 60)
    var items = list; items.append(["id": id, "platform": platform, "handle": handle, "label": label, "addedAt": isoNow()])
    store.setList("roster", items)
  }
  static func removeAccount(_ id: String) {
    store.remove("roster", id: id)
    store.write { d in d["posts"] = (d["posts"] as? [J] ?? []).filter { $0["accountId"] as? String != id } }
  }
  // A handle from "@name", "name" or a profile address; nil when it is not a plausible handle.
  static func cleanHandle(_ platform: String, _ raw: String) -> String? {
    var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.contains("/") {
      let u = URL(string: s.hasPrefix("http") ? s : "https://" + s)
      let parts = (u?.path ?? "").split(separator: "/").map(String.init)
      switch platform {
      case "tiktok": s = parts.first { $0.hasPrefix("@") } ?? ""
      case "youtube": s = parts.first { $0.hasPrefix("@") } ?? (parts.count >= 2 && ["channel", "c", "user"].contains(parts[0]) ? parts[1] : "")
      default: s = parts.first ?? ""
      }
    }
    if s.hasPrefix("@") { s.removeFirst() }
    guard s.range(of: "^[A-Za-z0-9._-]{1,60}$", options: .regularExpression) != nil, !["p", "reel", "reels", "explore", "watch", "shorts"].contains(s.lowercased()) else { return nil }
    return platform == "youtube" ? s : s.lowercased()
  }

  // MARK: cost
  // What one collection would cost at most, per platform: Apify's quote, checked again against the actor's current
  // price list (prices per event and plan tier, start fees, the minimum cost limit an actor asks for, and pricing
  // that adds compute time, which a cost limit cannot bound).
  static func plan(only platform: String?) async throws -> J {
    guard Apify.connected else { throw APIError(422, "not_connected", "Connect Apify in Setup → Research first.") }
    if let platform, !platforms.contains(platform) { throw APIError(422, "bad_platform", "Choose Instagram, TikTok or YouTube.") }
    let list = roster()
    var rows: [J] = []
    for p in platforms where platform == nil || platform == p {
      let accounts = list.filter { $0["platform"] as? String == p }
      if !accounts.isEmpty { rows.append(try await quote(p, accounts)) }
    }
    guard !rows.isEmpty else { throw APIError(422, "no_accounts", "Add the accounts you want to watch first.") }
    let usable = rows.filter { $0["cappable"] as? Bool == true }
    let total = cents(usable.reduce(0) { $0 + ($1["maxUsd"] as? Double ?? 0) }), month = Apify.monthUsd(), cap = Apify.capUsd
    return ["platforms": rows, "maxUsd": total, "posts": usable.reduce(0) { $0 + ($1["items"] as? Int ?? 0) }, "monthUsd": cents(month), "capUsd": cap,
            "fitsCap": month + total <= cap + 0.000001, "ready": !usable.isEmpty, "perAccount": perAccount]
  }
  private static func quote(_ p: String, _ accounts: [J]) async throws -> J {
    var skipped: [String] = []
    for a in actors[p] ?? [] {
      let items = a.items(accounts.count)
      var q = try await Apify.quote(actor: a.id, input: a.input(accounts), items: items)
      let b = try await bound(a.id, items: items)
      if q["cappable"] as? Bool == true, b.reason == nil {
        q["maxUsd"] = max(q["maxUsd"] as? Double ?? 0, b.maxUsd); q["fitsCap"] = nil; q["monthUsd"] = nil; q["capUsd"] = nil
        q["platform"] = p; q["platformLabel"] = names[p] ?? p; q["accounts"] = accounts.count; q["skipped"] = skipped; q["reason"] = NSNull()
        return q
      }
      skipped.append((q["title"] as? String ?? a.id) + ": " + (b.reason ?? q["reason"] as? String ?? "its cost cannot be capped."))
    }
    return ["platform": p, "platformLabel": names[p] ?? p, "accounts": accounts.count, "items": 0, "cappable": false, "maxUsd": 0, "skipped": skipped,
            "reason": "No Apify tool for \(names[p] ?? p) can be capped right now, so \(names[p] ?? p) is left out of this collection."]
  }
  struct Bound { var maxUsd: Double; var reason: String? }
  static func bound(_ actor: String, items: Int) async throws -> Bound {
    guard let k = Apify.key else { return Bound(maxUsd: 0, reason: "Connect Apify in Setup first.") }
    let a = (try await Net.json("GET", Apify.base + "/acts/" + Apify.actorPath(actor), headers: Apify.headers(k)) as? J)?["data"] as? J ?? [:]
    let now = isoNow(), all = a["pricingInfos"] as? [J] ?? []
    let current = all.filter { ($0["startedAt"] as? String ?? "") <= now }.sorted { ($0["startedAt"] as? String ?? "") < ($1["startedAt"] as? String ?? "") }.last ?? all.last
    guard let p = current else { return Bound(maxUsd: 0, reason: "it has no price list, so its cost cannot be capped.") }
    let model = p["pricingModel"] as? String ?? ""
    var perItem = 0.0, start = 0.0
    switch model {
    case "PRICE_PER_DATASET_ITEM": perItem = num(p["pricePerUnitUsd"]) ?? 0
    case "PAY_PER_EVENT":
      if [p["isPayPerEventWithPlatformUsage"], p["isPayPerEventWithUsage"], p["chargePlatformUsage"]].contains(where: { $0 as? Bool == true }) { return Bound(maxUsd: 0, reason: "it also bills compute time, which a cost limit cannot bound.") }
      var primary: Double? = nil, other = 0.0
      for (name, v) in ((p["pricingPerEvent"] as? J)?["actorChargeEvents"] as? J) ?? [:] {
        let e = v as? J ?? [:]
        let tiers = ((e["eventTieredPricingUsd"] as? J) ?? [:]).values.compactMap { num(($0 as? J)?["tieredEventPriceUsd"]) }
        let price = num(e["eventPriceUsd"]) ?? tiers.max() ?? 0
        if name.lowercased().contains("start") { start += price } else if e["isPrimaryEvent"] as? Bool == true { primary = max(primary ?? 0, price) } else { other = max(other, price) }
      }
      perItem = primary ?? other
    default: return Bound(maxUsd: 0, reason: "it is billed by compute time, so its cost cannot be capped.")
    }
    let minimum = num(p["minimalMaxTotalChargeUsd"]) ?? 0
    if minimum > 1 { return Bound(maxUsd: 0, reason: String(format: "it asks for a cost limit of at least $%.2f per run.", minimum)) }
    return Bound(maxUsd: max(0.05, cents((start + perItem * Double(max(1, items))) * 1.2), cents(minimum)), reason: nil)
  }
  static func cents(_ v: Double) -> Double { (v * 100 - 0.000001).rounded(.up) / 100 }

  // MARK: collection
  private static let lock = NSLock()
  private static var running = false
  private static func claim() -> Bool { lock.lock(); defer { lock.unlock() }; if running { return false }; running = true; return true }
  private static func release() { lock.lock(); running = false; lock.unlock() }
  static func isRunning() -> Bool { lock.lock(); defer { lock.unlock() }; return running }
  static func collection() -> J {
    var c = store.value("collection") as? J ?? ["status": "idle"]
    if c["status"] as? String == "running" && !isRunning() { c["status"] = "failed"; c["error"] = "The app closed while this collection ran. Start it again." }
    return c
  }
  // Starts a collection the student confirmed (or the weekly one they switched on, with the limit they confirmed then).
  static func startCollection(confirmed: Double, platform: String?, reason: String) async throws -> J {
    guard claim() else { throw APIError(409, "busy", "A collection is already running. Wait for it to finish.") }
    var started = false
    defer { if !started { release() } }
    let p = try await plan(only: platform)
    let rows = (p["platforms"] as? [J] ?? []).filter { $0["cappable"] as? Bool == true }
    guard !rows.isEmpty else { throw APIError(422, "not_cappable", "None of these platforms can be collected with a capped cost right now. Nothing was collected.") }
    let total = p["maxUsd"] as? Double ?? 0
    guard total <= confirmed + 0.005 else { throw APIError(409, "price_changed", String(format: "The maximum cost is now $%.2f, more than the $%.2f you confirmed. Check the cost again. Nothing was collected.", total, confirmed)) }
    guard Apify.monthUsd() + total <= Apify.capUsd + 0.000001 else { throw APIError(422, "over_cap", String(format: "This would go over your monthly Apify limit ($%.2f). Raise it in Setup → Research. Nothing was collected.", Apify.capUsd)) }
    store.setValue("collection", ["id": newID("collect"), "status": "running", "reason": reason, "startedAt": isoNow(), "maxUsd": total,
                                  "runs": rows.map { ["platform": $0["platform"] ?? "", "label": $0["platformLabel"] ?? "", "actor": $0["actor"] ?? "", "title": $0["title"] ?? "", "maxUsd": $0["maxUsd"] ?? 0, "status": "waiting"] as J }])
    started = true
    let list = roster()
    Task.detached(priority: .userInitiated) {
      await withTaskGroup(of: Void.self) { g in for row in rows { g.addTask { await runOne(row, list) } } }
      let runs = (store.value("collection") as? J)?["runs"] as? [J] ?? []
      store.write { d in
        guard var c = d["collection"] as? J else { return }
        c["status"] = runs.contains { $0["status"] as? String == "done" } ? "done" : "failed"; c["finishedAt"] = isoNow()
        c["usd"] = cents(runs.reduce(0) { $0 + (num($1["usd"]) ?? 0) })
        if c["status"] as? String == "failed" { c["error"] = runs.compactMap { $0["error"] as? String }.first ?? "The collection did not finish." }
        d["collection"] = c
      }
      let thumbs = setThumbing(true)
      release()
      Store.shared.emit("research.competitors", ["status": "collected"])
      if thumbs { await fetchThumbs(); _ = setThumbing(false) }
      Store.shared.emit("research.competitors", ["status": "thumbnails"])
    }
    return ["started": true, "collection": collection()]
  }
  private static func setRun(_ platform: String, _ change: J) {
    store.write { d in
      guard var c = d["collection"] as? J, var runs = c["runs"] as? [J], let i = runs.firstIndex(where: { $0["platform"] as? String == platform }) else { return }
      runs[i].merge(change) { $1 }; c["runs"] = runs; d["collection"] = c
    }
    Store.shared.emit("research.competitors", ["platform": platform, "status": change["status"] ?? ""])
  }
  private static func runOne(_ row: J, _ list: [J]) async {
    let p = row["platform"] as? String ?? "", id = row["actor"] as? String ?? ""
    let accounts = list.filter { $0["platform"] as? String == p }
    guard let actor = actors[p]?.first(where: { $0.id == id }), !accounts.isEmpty else { setRun(p, ["status": "failed", "error": "This platform has no accounts any more."]); return }
    setRun(p, ["status": "running"])
    do {
      let res = try await Apify.run(actor: id, input: actor.input(accounts), maxUsd: num(row["maxUsd"]) ?? 0, items: actor.items(accounts.count), purpose: "Competitors · " + (names[p] ?? p)) { s in
        setRun(p, ["apifyStatus": s.lowercased()])
      }
      let n = ingest(p, res["items"] as? [J] ?? [], accounts)
      setRun(p, ["status": "done", "items": n, "usd": res["usd"] ?? 0, "runId": res["runId"] ?? ""])
      health(p, ["at": isoNow(), "count": n, "error": NSNull(), "actor": id])
    } catch {
      let m = (error as? APIError)?.message ?? (error as? NetError)?.message ?? "The collection did not finish."
      setRun(p, ["status": "failed", "error": m])
      health(p, ["error": m, "triedAt": isoNow()])
    }
  }
  private static func health(_ p: String, _ change: J) {
    store.write { d in var h = d["health"] as? J ?? [:]; var x = h[p] as? J ?? [:]; x.merge(change) { $1 }; h[p] = x; d["health"] = h }
  }

  // MARK: posts
  static func posts() -> [J] { store.list("posts") }
  // Adds one observation per post (views, likes, comments at this moment); returns how many posts were seen.
  static func ingest(_ platform: String, _ items: [J], _ accounts: [J]) -> Int {
    let at = isoNow()
    let fresh = items.compactMap { row -> J? in guard let a = account(platform, row, accounts) else { return nil }; return normalize(platform, row, a) }
    store.write { d in
      var list = d["posts"] as? [J] ?? []
      var index = [String: Int](); for (i, p) in list.enumerated() { if let id = p["id"] as? String { index[id] = i } }
      for f in fresh {
        let id = f["id"] as? String ?? ""
        var p = index[id].map { list[$0] } ?? ["firstSeen": at]
        for (k, v) in f { p[k] = v }
        p["lastSeen"] = at
        var obs = p["obs"] as? [J] ?? []
        let o: J = ["at": at, "views": f["views"] ?? NSNull(), "likes": f["likes"] ?? NSNull(), "comments": f["comments"] ?? NSNull()]
        if let last = obs.last, let t = Research.date(last["at"]), Date().timeIntervalSince(t) < 300 { obs[obs.count - 1] = o } else { obs.append(o) }
        p["obs"] = Array(obs.suffix(30))
        if let i = index[id] { list[i] = p } else { index[id] = list.count; list.append(p) }
      }
      d["posts"] = Array(list.sorted(by: newest).prefix(3000))
    }
    return fresh.count
  }
  private static func account(_ platform: String, _ row: J, _ accounts: [J]) -> J? {
    let author = row["authorMeta"] as? J ?? [:]
    let seen = [row["ownerUsername"], row["inputUrl"], author["name"], author["uniqueId"], row["webVideoUrl"], row["channelUsername"], row["channelUrl"], row["fromYTUrl"], row["input"], row["channelName"], row["url"]]
      .compactMap { $0 as? String }.map { $0.lowercased() }
    return accounts.first { a in
      let h = (a["handle"] as? String ?? "").lowercased()
      return !h.isEmpty && seen.contains { $0 == h || $0 == "@" + h || $0.contains("/@" + h + "/") || $0.hasSuffix("/@" + h) || $0.contains(".com/" + h + "/") || $0.hasSuffix(".com/" + h) || $0.contains("/channel/" + h) }
    } ?? (accounts.count == 1 ? accounts[0] : nil)
  }
  static func num(_ v: Any?) -> Double? {
    guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return (v as? String).flatMap { Double($0) } }
    let d = n.doubleValue; return d.isFinite ? d : nil
  }
  private static func text(_ row: J, _ keys: [String]) -> String? { keys.lazy.compactMap { (row[$0] as? String).flatMap { $0.isEmpty ? nil : $0 } }.first }
  // One post in the app's shape, from Instagram, TikTok or YouTube scraper output.
  static func normalize(_ platform: String, _ row: J, _ account: J) -> J? {
    var url = text(row, ["url", "webVideoUrl", "postUrl", "link"]) ?? ""
    var pid: String? = nil
    switch platform {
    case "instagram": pid = text(row, ["shortCode", "shortcode", "code"]) ?? match(url, "/(?:p|reel|tv)/([\\w-]+)")
    case "tiktok": pid = (row["id"] as? String) ?? num(row["id"]).map { String(format: "%.0f", $0) } ?? match(url, "/video/(\\d+)")
    default: pid = (row["id"] as? String) ?? match(url, "(?:v=|youtu\\.be/|shorts/)([\\w-]{6,20})")
    }
    guard let pid, !pid.isEmpty, pid.range(of: "^[\\w-]{3,40}$", options: .regularExpression) != nil else { return nil }
    if url.isEmpty || !url.hasPrefix("https://") {
      url = platform == "instagram" ? "https://www.instagram.com/p/" + pid + "/" : platform == "tiktok" ? "https://www.tiktok.com/@" + (account["handle"] as? String ?? "") + "/video/" + pid : "https://www.youtube.com/watch?v=" + pid
    }
    let stats = (row["stats"] as? J) ?? (row["statistics"] as? J) ?? [:]
    func first(_ keys: [String]) -> Double? { for k in keys { if let v = num(row[k]) ?? num(stats[k]), v >= 0 { return v } }; return nil }
    let meta = row["videoMeta"] as? J ?? [:]
    let images = (row["images"] as? [Any])?.compactMap { $0 as? String } ?? []
    let thumb: String? = platform == "instagram" ? text(row, ["displayUrl", "thumbnailUrl", "imageUrl"]) ?? images.first
      : platform == "tiktok" ? text(meta, ["coverUrl", "originalCoverUrl", "dynamicCoverUrl"]) ?? text(row, ["coverUrl"])
      : text(row, ["thumbnailUrl"]) ?? "https://i.ytimg.com/vi/" + pid + "/hqdefault.jpg"
    let type = (row["type"] as? String ?? "").lowercased()
    let kind = platform != "instagram" ? "video" : type == "sidecar" ? "carousel" : type == "image" && row["videoUrl"] == nil ? "image" : "video"
    let published = Research.date(row["timestamp"] ?? row["createTimeISO"] ?? row["createTime"] ?? row["date"] ?? row["uploadDate"] ?? row["publishedAt"])
    var out: J = ["id": platform + ":" + pid, "platform": platform, "postId": pid, "accountId": account["id"] ?? "", "account": account["handle"] ?? "", "label": account["label"] ?? "",
                  "url": url, "caption": caption(platform == "youtube" ? text(row, ["title", "text", "description"]) : text(row, ["caption", "text", "title", "description"])), "kind": kind, "publishedAt": Research.iso(published)]
    if let v = first(["videoViewCount", "videoPlayCount", "playCount", "viewCount", "views"]) { out["views"] = v }
    if let v = first(["likesCount", "diggCount", "likes", "likeCount"]) { out["likes"] = v }
    if let v = first(["commentsCount", "commentCount", "comments"]) { out["comments"] = v }
    if let thumb, thumb.hasPrefix("http") { out["thumbUrl"] = thumb }
    if let v = row["videoUrl"] as? String, v.hasPrefix("https://") { out["videoUrl"] = v }
    return out
  }
  // A caption keeps its line breaks (the first line is the hook); at most 2,000 characters.
  private static func caption(_ s: String?) -> String {
    let t = (s ?? "").replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "[ \t]+", with: " ", options: .regularExpression)
      .replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    return t.count > 2000 ? String(t.prefix(1999)) + "…" : t
  }
  private static func match(_ s: String, _ pattern: String) -> String? {
    guard let re = try? NSRegularExpression(pattern: pattern), let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)), m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: s) else { return nil }
    return String(s[r])
  }
  private static let newest: (J, J) -> Bool = { ($0["publishedAt"] as? String ?? "") > ($1["publishedAt"] as? String ?? "") }
  private static func display(_ p: J) -> String { "@" + (p["account"] as? String ?? "") + " · " + (names[p["platform"] as? String ?? ""] ?? "") }
  // Views, or likes for photo posts without a view count.
  private static func metric(_ p: J) -> Double { num(p["views"]).flatMap { $0 > 0 ? $0 : nil } ?? num(p["likes"]) ?? 0 }

  // Growth: views gained per hour between the last two observations; with one observation, views per hour since the
  // post went up. vsMedian: the post's views against the account's median post.
  static func growth(_ p: J) -> Double {
    let obs = (p["obs"] as? [J] ?? []).filter { Research.date($0["at"]) != nil }
    let m = { (o: J) in num(o["views"]).flatMap { $0 > 0 ? $0 : nil } ?? num(o["likes"]) ?? 0 }
    if obs.count >= 2, let a = Research.date(obs[obs.count - 2]["at"]), let b = Research.date(obs[obs.count - 1]["at"]), b.timeIntervalSince(a) >= 900 {
      return max(0, m(obs[obs.count - 1]) - m(obs[obs.count - 2])) / (b.timeIntervalSince(a) / 3600)
    }
    let hours = max(1, Date().timeIntervalSince(Research.date(p["publishedAt"]) ?? Research.date(p["firstSeen"]) ?? Date()) / 3600)
    return metric(p) / hours
  }
  private static func medians(_ all: [J]) -> [String: Double] {
    Dictionary(grouping: all) { $0["accountId"] as? String ?? "" }.mapValues { list in
      let v = list.map(metric).sorted(); guard !v.isEmpty else { return 0 }
      return v.count % 2 == 1 ? v[v.count / 2] : (v[v.count / 2 - 1] + v[v.count / 2]) / 2
    }
  }
  static func thumbPath(_ p: J) -> String {
    guard p["thumbFile"] is String, let id = p["id"] as? String else { return "" }
    var ok = CharacterSet.alphanumerics; ok.insert(charactersIn: "-._~:")
    return "/api/hq/v1/marketing/media?id=" + (id.addingPercentEncoding(withAllowedCharacters: ok) ?? "")
  }
  static func shaped(_ p: J, medians m: [String: Double]) -> J {
    let med = m[p["accountId"] as? String ?? ""]
    var x: J = ["id": p["id"] ?? "", "platform": p["platform"] ?? "", "platformLabel": names[p["platform"] as? String ?? ""] ?? "", "account": p["account"] ?? "", "label": p["label"] ?? "",
                "caption": p["caption"] ?? "", "url": p["url"] ?? "", "thumb": thumbPath(p), "kind": p["kind"] ?? "video", "views": p["views"] ?? NSNull(), "likes": p["likes"] ?? NSNull(),
                "comments": p["comments"] ?? NSNull(), "publishedAt": p["publishedAt"] ?? "", "observedAt": p["lastSeen"] ?? "", "growth": (growth(p) * 10).rounded() / 10,
                "growthUnit": num(p["views"]).map { $0 > 0 } == true ? "views" : "likes", "ideaId": p["ideaId"] ?? NSNull()]
    if let med, med > 0 { x["vsMedian"] = (metric(p) / med * 10).rounded() / 10 }
    if let v = p["videoUrl"] { x["videoUrl"] = v }
    return x
  }
  // Posts still seen in the last 30 days (the current collections), fastest-growing first.
  static func rising(limit: Int) -> [J] {
    let all = posts(), m = medians(all), since = Date(timeIntervalSinceNow: -30 * 86400)
    return Array(all.filter { (Research.date($0["lastSeen"]) ?? .distantPast) >= since && metric($0) > 0 }
      .map { shaped($0, medians: m) }.sorted { (num($0["growth"]) ?? 0) > (num($1["growth"]) ?? 0) }.prefix(max(0, limit)))
  }
  // An item for the video wall (video-wall.mjs).
  static func wallItem(_ p: J) -> J {
    let obs = p["obs"] as? [J] ?? []
    let change = obs.count >= 2 ? max(0, (num(obs[obs.count - 1]["views"]) ?? 0) - (num(obs[obs.count - 2]["views"]) ?? 0)) : 0
    return ["id": p["id"] ?? "", "platform": p["platform"] ?? "", "url": p["url"] ?? "", "text": p["caption"] ?? "", "creator": "@" + (p["account"] as? String ?? ""), "kind": p["kind"] ?? "video",
            "metrics": ["views": p["views"] ?? NSNull(), "likes": p["likes"] ?? NSNull(), "comments": p["comments"] ?? NSNull()], "changes": ["views": change],
            "publishedAt": p["publishedAt"] ?? "", "observedAt": p["lastSeen"] ?? "", "thumbUrl": thumbPath(p)]
  }
  static func addIdea(_ id: String) throws -> J {
    guard let p = posts().first(where: { $0["id"] as? String == id }) else { throw APIError(404, "not_found", "This post is no longer in your collection. Refresh the page.") }
    let caption = p["caption"] as? String ?? "", who = "@" + (p["account"] as? String ?? "") + " on " + (names[p["platform"] as? String ?? ""] ?? "")
    let firstLine = caption.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty } ?? ""
    let title = firstLine.isEmpty ? "Post by " + who : Signals.plain(firstLine, 90)
    let stats = [num(p["views"]).map { Signals.compact($0) + " views" }, num(p["likes"]).map { Signals.compact($0) + " likes" }].compactMap { $0 }.joined(separator: " · ")
    let notes = ["Competitor post by " + who + (stats.isEmpty ? "" : " (" + stats + ")"), caption, p["url"] as? String ?? ""].filter { !$0.isEmpty }.joined(separator: "\n")
    let item = Content.addIdea(title: title, hook: Signals.plain(firstLine, 200), notes: notes, source: ["kind": "competitor", "url": p["url"] ?? "", "title": who])
    store.update("posts", id: id) { $0["ideaId"] = item["id"] ?? "" }
    return ["ok": true, "item": item]
  }

  // MARK: thumbnails
  // Image servers per platform; a thumbnail is only downloaded from these (and from the stand-ins in test builds).
  static let imageHosts: [String: [String]] = [
    "instagram": ["cdninstagram.com", "fbcdn.net"],
    "tiktok": ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ibyteimg.com", "byteimg.com", "muscdn.com"],
    "youtube": ["ytimg.com", "ggpht.com", "googleusercontent.com"],
  ]
  static func imageAllowed(_ u: URL, _ platform: String) -> Bool {
    guard let host = u.host?.lowercased(), u.user == nil else { return false }
    if Research.testBuild && host == "127.0.0.1" { return u.scheme == "http" || u.scheme == "https" }
    return u.scheme == "https" && (imageHosts[platform] ?? []).contains { host == $0 || host.hasSuffix("." + $0) }
  }
  private static let types = ["image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic"]
  private static let mime = ["jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif", "avif": "image/avif", "heic": "image/heic"]
  private static var thumbing = false
  static func isThumbing() -> Bool { lock.lock(); defer { lock.unlock() }; return thumbing }
  private static func setThumbing(_ v: Bool) -> Bool { lock.lock(); defer { lock.unlock() }; if v && thumbing { return false }; thumbing = v; return true }
  static func cacheThumbs() async {
    guard setThumbing(true) else { return }
    await fetchThumbs()
    _ = setThumbing(false)
  }
  // The caller holds the thumbnail flag (so a page that checks sees the work as pending until it is done).
  private static func fetchThumbs() async {
    let todo = posts().filter { $0["thumbFile"] == nil && $0["thumbUrl"] is String && (num($0["thumbTries"]) ?? 0) < 3 }.prefix(300)
    let folder = DocStore.folder("research")
    for chunk in stride(from: 0, to: todo.count, by: 6).map({ Array(todo.dropFirst($0).prefix(6)) }) {
      await withTaskGroup(of: Void.self) { g in
        for p in chunk {
          g.addTask {
            let id = p["id"] as? String ?? "", platform = p["platform"] as? String ?? ""
            var file: String? = nil
            if let u = URL(string: p["thumbUrl"] as? String ?? ""), let got = try? await Research.download(u, maxBytes: 5_000_000, accept: "image/*", allow: { imageAllowed($0, platform) }),
               let ext = types[String(got.1.split(separator: ";").first ?? "").trimmingCharacters(in: .whitespaces)], !got.0.isEmpty {
              let name = "thumb-" + Research.hash(id) + "." + ext
              if (try? got.0.write(to: folder.appendingPathComponent(name), options: .atomic)) != nil { file = name }
            }
            store.update("posts", id: id) { x in if let file { x["thumbFile"] = file } else { x["thumbTries"] = (num(x["thumbTries"]) ?? 0) + 1 } }
          }
        }
      }
    }
  }
  static func media(_ id: String) throws -> HTTPResponse {
    guard let p = posts().first(where: { $0["id"] as? String == id }), let f = p["thumbFile"] as? String, f.range(of: "^thumb-[a-f0-9]{16}\\.(jpg|png|webp|gif|avif|heic)$", options: .regularExpression) != nil,
          let data = try? Data(contentsOf: DocStore.folder("research").appendingPathComponent(f)) else { throw APIError(404, "not_found", "There is no thumbnail for this post.") }
    return .data(data, type: mime[(f as NSString).pathExtension] ?? "application/octet-stream", cache: "private, max-age=86400")
  }
  // Posts not seen for 90 days go, with their thumbnails; so do thumbnail files nothing points to any more.
  static func prune() {
    let cutoff = Date(timeIntervalSinceNow: -90 * 86400)
    var keep: Set<String> = []
    store.write { d in
      let list = (d["posts"] as? [J] ?? []).filter { (Research.date($0["lastSeen"]) ?? Date()) >= cutoff }
      keep = Set(list.compactMap { $0["thumbFile"] as? String }); d["posts"] = list; d["prunedAt"] = isoNow()
    }
    let folder = DocStore.folder("research"), fm = FileManager.default
    for f in (try? fm.contentsOfDirectory(atPath: folder.path)) ?? [] where f.hasPrefix("thumb-") && !keep.contains(f) { try? fm.removeItem(at: folder.appendingPathComponent(f)) }
  }

  // MARK: weekly collection
  // On only after the student confirmed a maximum cost per collection; each run must stay within it and the monthly limit.
  static func setAuto(_ body: J) async throws -> J {
    guard body["enabled"] as? Bool == true else { store.setValue("auto", ["enabled": false, "changedAt": isoNow()]); return page() }
    guard body["confirm"] as? Bool == true, let maxUsd = ResearchAPI.number(body["maxUsd"]), maxUsd > 0 else { throw APIError(422, "confirm_required", "Check the cost and confirm a maximum per collection first.") }
    let p = try await plan(only: nil)
    guard (p["maxUsd"] as? Double ?? 0) <= maxUsd + 0.005 else { throw APIError(409, "price_changed", "The maximum cost changed. Check the cost again.") }
    store.setValue("auto", ["enabled": true, "maxUsd": maxUsd, "changedAt": isoNow()])
    return page()
  }
  static func tick() {
    if Research.date(store.value("prunedAt")).map({ Date().timeIntervalSince($0) > 86400 }) ?? true { DispatchQueue.global(qos: .utility).async { prune() } }
    guard var auto = store.value("auto") as? J, auto["enabled"] as? Bool == true, Apify.connected, !isRunning(), !roster().isEmpty else { return }
    let last = [Research.date(auto["lastAt"]), Research.date((store.value("collection") as? J)?["startedAt"]), Research.date(auto["changedAt"])].compactMap { $0 }.max()
    if let last, Date().timeIntervalSince(last) < 7 * 86400 { return }
    if let next = Research.date(auto["nextTry"]), next > Date() { return }
    auto["nextTry"] = isoNow(6 * 3600); store.setValue("auto", auto)
    let maxUsd = num(auto["maxUsd"]) ?? 0
    Task.detached(priority: .utility) {
      var a = store.value("auto") as? J ?? auto
      do { _ = try await startCollection(confirmed: maxUsd, platform: nil, reason: "weekly"); a["lastAt"] = isoNow(); a["lastResult"] = "Started the weekly collection." }
      catch { a["lastResult"] = (error as? APIError)?.message ?? (error as? NetError)?.message ?? "The weekly collection did not start."; a["nextTry"] = isoNow(86400) }
      store.setValue("auto", a)
    }
  }
}
