// Zernio (social accounts): the student's own API key, accounts, connect links, posts and their results.
// Docs: docs.zernio.com (formerly Late). Analytics need Zernio's Analytics add-on; without it posts show without metrics.
import Foundation

enum Zernio {
  static var key: String? { Keychain.get("zernio") }
  static var connected: Bool { key != nil }
  static let platforms = ["instagram", "tiktok", "youtube", "linkedin", "twitter", "facebook", "threads", "pinterest", "bluesky"]
  private static func call(_ method: String, _ path: String, key override: String? = nil, body: Any? = nil, headers: [String: String] = [:]) async throws -> J {
    guard let k = override ?? key else { throw NetError(status: 401, message: "Connect Zernio in Setup first.", code: "not_connected") }
    let base = Net.base("ZERNIO", "https://zernio.com/api/v1")
    let r = try await Net.json(method, base + path, headers: headers.merging(["Authorization": "Bearer " + k]) { $1 }, body: body)
    return r as? J ?? ["items": r]
  }
  // A key is valid when the profiles list answers.
  static func validate(_ k: String) async throws { _ = try await call("GET", "/profiles", key: k) }
  // The profile new accounts go into: the default one, or a new "187N Agent HQ" profile.
  static func profileID() async throws -> String {
    if let saved = Store.shared.setting("zernioProfile") as? String, !saved.isEmpty { return saved }
    let profiles = (try await call("GET", "/profiles"))["profiles"] as? [J] ?? []
    if let p = profiles.first(where: { ($0["isDefault"] as? Bool) == true }) ?? profiles.first, let id = p["_id"] as? String { Store.shared.setSettings(["zernioProfile": id]); return id }
    let created = try await call("POST", "/profiles", body: ["name": "187N Agent HQ"])
    guard let id = (created["profile"] as? J)?["_id"] as? String else { throw NetError(status: 502, message: "Zernio did not create a profile.", code: "profile") }
    Store.shared.setSettings(["zernioProfile": id]); return id
  }
  static func accounts() async throws -> [J] {
    let r = try await call("GET", "/accounts")
    return (r["accounts"] as? [J] ?? []).map { a in
      let meta = (a["metadata"] as? J)?["profileData"] as? J ?? [:]
      let username = a["username"] as? String ?? meta["username"] as? String ?? ""
      return ["id": a["_id"] as? String ?? "", "platform": a["platform"] as? String ?? "", "handle": username.isEmpty ? "" : "@" + username,
              "name": a["displayName"] as? String ?? meta["displayName"] as? String ?? username, "avatar": a["profilePicture"] as? String ?? meta["profilePicture"] as? String ?? "",
              "url": a["profileUrl"] as? String ?? "", "followers": orNull(a["followersCount"] as? Int ?? meta["followersCount"] as? Int),
              "active": (a["isActive"] as? Bool) ?? true, "needsReconnect": (a["needsReconnection"] as? Bool) ?? false]
    }
  }
  static func connectURL(_ platform: String, redirect: String, reconnect: String? = nil) async throws -> String {
    let pid = try await profileID()
    var q = "profileId=" + pid + "&redirect_url=" + (redirect.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? redirect)
    if let reconnect { q += "&reconnectAccountId=" + reconnect }
    let r = try await call("GET", "/connect/" + platform + "?" + q)
    guard let url = r["authUrl"] as? String else { throw NetError(status: 502, message: "Zernio returned no login link for \(platform).", code: "no_url") }
    return url
  }
  static func disconnect(_ id: String) async throws { _ = try await call("DELETE", "/accounts/" + id) }
  // Posts with results for the last `days` days; falls back to the plain post list without the Analytics add-on.
  static func posts(days: Int) async throws -> (posts: [J], analytics: Bool, note: String) {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
    let from = f.string(from: Date(timeIntervalSinceNow: -Double(days) * 86400)), to = f.string(from: Date())
    do {
      let r = try await call("GET", "/analytics?source=all&fromDate=\(from)&toDate=\(to)&limit=100")
      let posts: [J] = (r["posts"] as? [J] ?? []).map { p in
        let a = p["analytics"] as? J ?? [:], firstPlatform = (p["platforms"] as? [J])?.first ?? [:]
        return ["id": p["_id"] as? String ?? "", "platform": p["platform"] as? String ?? firstPlatform["platform"] as? String ?? "", "accountId": firstPlatform["accountId"] as? String ?? "",
                "text": p["content"] as? String ?? "", "url": p["platformPostUrl"] as? String ?? firstPlatform["platformPostUrl"] as? String ?? "",
                "thumbnail": p["thumbnailUrl"] as? String ?? "", "mediaType": p["mediaType"] as? String ?? "", "publishedAt": p["publishedAt"] as? String ?? "",
                "metrics": ["views": a["views"] ?? 0, "impressions": a["impressions"] ?? 0, "reach": a["reach"] ?? 0, "likes": a["likes"] ?? 0, "comments": a["comments"] ?? 0,
                            "shares": a["shares"] ?? 0, "saves": a["saves"] ?? 0, "engagementRate": a["engagementRate"] ?? 0]]
      }
      return (posts, true, "")
    } catch let e as NetError where e.status == 402 || e.status == 403 {
      let r = try await call("GET", "/posts?status=published&fromDate=\(from)&toDate=\(to)&limit=100")
      let posts: [J] = (r["posts"] as? [J] ?? []).map { p in
        let first = (p["platforms"] as? [J])?.first ?? [:]
        return ["id": p["_id"] as? String ?? "", "platform": first["platform"] as? String ?? "", "accountId": first["accountId"] as? String ?? "", "text": p["content"] as? String ?? "",
                "url": first["platformPostUrl"] as? String ?? "", "thumbnail": "", "mediaType": "", "publishedAt": p["scheduledFor"] as? String ?? p["createdAt"] as? String ?? "", "metrics": J()]
      }
      return (posts, false, "Post results need Zernio's Analytics add-on. Posts are listed without numbers.")
    }
  }
  static func followerStats(days: Int) async -> J {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
    let from = f.string(from: Date(timeIntervalSinceNow: -Double(days) * 86400)), to = f.string(from: Date())
    return (try? await call("GET", "/accounts/follower-stats?fromDate=\(from)&toDate=\(to)&granularity=daily")) ?? [:]
  }

  // MARK: drafts (never published or scheduled from the app)
  // A draft post with media, per docs.zernio.com: each file goes up through POST /media/presign and a PUT to the
  // returned uploadUrl (storage, no API key); then POST /posts with isDraft and no scheduledFor, publishNow or queue,
  // so Zernio saves it and the student schedules it in Zernio. story: Instagram and Facebook entries become a Story.
  static let mediaTypes = ["png": ("image/png", "image"), "jpg": ("image/jpeg", "image"), "jpeg": ("image/jpeg", "image"), "mp4": ("video/mp4", "video")]
  static func createDraft(text: String, accountIds: [String], mediaFiles: [URL], story: Bool = false) async throws -> J {
    let all = try await accounts()
    let platforms: [J] = accountIds.compactMap { id in
      guard let a = all.first(where: { $0["id"] as? String == id }), let platform = a["platform"] as? String else { return nil }
      var p: J = ["platform": platform, "accountId": id]
      if story, ["instagram", "facebook"].contains(platform) { p["platformSpecificData"] = ["contentType": "story"] }
      return p
    }
    guard !platforms.isEmpty, platforms.count == accountIds.count else { throw NetError(status: 404, message: "One of the chosen accounts is no longer connected in Zernio. Refresh and choose again.", code: "account_gone") }
    var media: [J] = []
    for f in mediaFiles { media.append(try await upload(f)) }
    let body: J = ["content": text, "isDraft": true, "platforms": platforms, "mediaItems": media]
    let r = try await call("POST", "/posts", body: body, headers: ["Idempotency-Key": UUID().uuidString])
    let post = r["post"] as? J ?? r
    guard let id = post["_id"] as? String else { throw NetError(status: 502, message: "Zernio did not confirm the draft.", code: "no_draft") }
    return ["id": id, "status": post["status"] as? String ?? "draft", "media": media.count, "accounts": platforms.count]
  }
  private static let uploads: URLSession = {
    let c = URLSessionConfiguration.ephemeral; c.timeoutIntervalForRequest = 60; c.timeoutIntervalForResource = 900
    return URLSession(configuration: c)
  }()
  // One file to Zernio's storage; returns the media item for the post.
  static func upload(_ file: URL) async throws -> J {
    guard let t = mediaTypes[file.pathExtension.lowercased()] else { throw NetError(status: 422, message: "Only PNG, JPG and MP4 files can go into a draft.", code: "bad_type") }
    let (type, kind) = t
    let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
    let p = try await call("POST", "/media/presign", body: ["filename": file.lastPathComponent, "contentType": type, "size": size])
    // The upload goes only to an https address (or the local stand-in in test builds), never with the API key.
    guard let up = p["uploadUrl"] as? String, let url = URL(string: up), let pub = p["publicUrl"] as? String,
          url.scheme == "https" || (Paths.standIns && url.host == "127.0.0.1") else {
      throw NetError(status: 502, message: "Zernio did not return an upload link.", code: "no_upload_url")
    }
    var req = URLRequest(url: url); req.httpMethod = "PUT"; req.setValue(type, forHTTPHeaderField: "Content-Type")
    let response: URLResponse
    do { (_, response) = try await uploads.upload(for: req, fromFile: file) }
    catch { throw NetError(status: 0, message: "The upload to Zernio did not finish. Check your internet connection.", code: "offline") }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else { throw NetError(status: 502, message: "Zernio's storage refused \(file.lastPathComponent) (\(status)).", code: "upload_failed") }
    return ["type": kind, "url": pub]
  }
}
