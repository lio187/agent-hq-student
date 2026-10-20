// Updates (1.3.0): "Check for updates" and a daily check against the student update feed, the same on both editions
// (JavaScript: ../agent-hq-student-windows/engine/updates.mjs). The feed is a JSON file signed with a separate update key
// (Ed25519, detached .sig); the app trusts only the public keys compiled in (update/config.json), checks the signature,
// the product, the expiry and the version, and only then shows "Version X is available". Download fetches this Mac's
// installer from the address in the signed feed (https only), checks its size and SHA-256 against the feed and keeps
// it in Downloads; the student opens it. Nothing replaces the app silently: an ad-hoc signed app that replaced itself
// could not be trusted, so the student installs it (the next step after Developer ID signing: Sparkle).
//   GET  updates                     the state below
//   POST updates/check               check now (also the menu's Check for Updates…)
//   POST updates/download            download and verify the installer of the available version
//   POST updates/open {what}         "installer" opens it, "folder" shows it in Finder
//   POST updates/settings {auto}     the daily check on or off
//   POST updates/dismiss             "Later": no banner for this version
import Foundation
import CryptoKit
import AppKit

enum UpdatesAPI {
  static let docs = DocStore.named("updates")
  static let platform = "mac"
  static let schema = "agent-hq-student.feed/1", product = "agent-hq-student"
  static let maxFeed = 256 * 1024, maxInstaller = 1024 * 1024 * 1024
  static let day: Double = 86400, retry: Double = 6 * 3600
  private static let lock = NSLock()
  // The lock is only taken here, in plain (non-async) code: an async function may resume on another thread.
  private static func guarded<T>(_ body: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return body() }
  private static var checking = false
  private static var download: J = ["state": "idle"]
  static var current: String { AppInfo.version }

  // The feed address and the trusted keys: compiled in; the test build may point at a local feed (HQS_UPDATE_*).
  static var feedURL: String {
    #if DEBUG
    if let v = Paths.env("HQS_UPDATE_FEED_URL") { return v }
    #endif
    return BuildInfo.updateFeedURL
  }
  static var trustedKeys: [String] {
    #if DEBUG
    if let v = Paths.env("HQS_UPDATE_KEYS") { return v.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
    #endif
    return BuildInfo.updateKeys
  }
  static var configured: Bool { !feedURL.isEmpty && !trustedKeys.isEmpty }
  static var firstCheckDelay: Double {
    #if DEBUG
    if let v = Paths.env("HQS_UPDATE_FIRST_CHECK"), let n = Double(v), n > 0 { return n }
    #endif
    return 60
  }
  // https only; the test build also reaches its local stand-in on 127.0.0.1.
  static func safeURL(_ raw: String) -> Bool {
    guard let u = URLComponents(string: raw), u.user == nil, u.password == nil, let scheme = u.scheme?.lowercased() else { return false }
    #if DEBUG
    if scheme == "http" && u.host == "127.0.0.1" { return true }
    #endif
    return scheme == "https" && !(u.host ?? "").isEmpty
  }
  static func isVersion(_ v: String) -> Bool { v.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression) != nil }
  static func compare(_ a: String, _ b: String) -> Int {
    let x = a.split(separator: ".").map { Int($0) ?? 0 }, y = b.split(separator: ".").map { Int($0) ?? 0 }
    for i in 0..<3 where x[i] != y[i] { return x[i] - y[i] }
    return 0
  }
  static func keyID(_ raw: Data) -> String { String(SHA256.hash(data: raw).map { String(format: "%02x", $0) }.joined().prefix(16)) }
  struct Refused: Error { let reason: String }

  // The feed's checks, in order (the same as updates.mjs). Returns the newest release for this Mac that is newer than
  // the installed version (or nil) and the newest version in the feed.
  static func verify(_ bytes: Data, _ sigBytes: Data, keys: [String], at: Date = Date()) throws -> (release: J?, latest: String?) {
    guard let sig = (try? JSONSerialization.jsonObject(with: sigBytes)) as? J, sig["alg"] as? String == "ed25519", let kid = sig["key_id"] as? String,
          let sigText = sig["sig"] as? String, let signature = Data(base64Encoded: sigText) else { throw Refused(reason: "its signature could not be read") }
    guard let raw = keys.compactMap({ Data(base64Encoded: $0) }).first(where: { $0.count == 32 && keyID($0) == kid }),
          let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: raw) else { throw Refused(reason: "it is not signed by 187N") }
    guard pub.isValidSignature(signature, for: bytes) else { throw Refused(reason: "its signature does not match") }
    guard let feed = (try? JSONSerialization.jsonObject(with: bytes)) as? J, feed["schema"] as? String == schema, feed["product"] as? String == product,
          feed["channel"] as? String == "stable" else { throw Refused(reason: "it is not a 187N Agent HQ update") }
    guard let expires = parseDate(feed["expires_at"] as? String ?? ""), expires > at else { throw Refused(reason: "it has expired") }
    func usable(_ d: J?) -> Bool {
      guard let d, let url = d["url"] as? String, safeURL(url), let sha = d["sha256"] as? String, sha.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
            let size = d["size"] as? Int, size > 0, size <= maxInstaller else { return false }  // a whole number only (NSNumber bridging is exact)
      return true
    }
    let list = (feed["releases"] as? [J] ?? []).filter { r in isVersion(r["version"] as? String ?? "") && usable((r["downloads"] as? J)?[platform] as? J) }
      .sorted { compare($0["version"] as! String, $1["version"] as! String) > 0 }
    guard let top = list.first else { return (nil, nil) }
    let v = top["version"] as! String
    return (compare(v, current) > 0 ? top : nil, v)
  }
  // Strict ISO 8601 in UTC (seconds, optional fraction), as the JavaScript edition accepts.
  static func parseDate(_ s: String) -> Date? {
    guard s.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$"#, options: .regularExpression) != nil else { return nil }
    let f = ISO8601DateFormatter(); if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: s)
  }

  // MARK: state
  static var auto: Bool { docs.value("auto") as? Bool != false }
  static func state() -> J {
    lock.lock(); let busy = checking, dl = download; lock.unlock()
    var available: Any = NSNull()
    if let a = docs.value("available") as? J, let v = a["version"] as? String, compare(v, current) > 0, let d = a["download"] as? J {
      available = ["version": v, "date": a["date"] ?? NSNull(), "notes": a["notes"] as? String ?? "", "size": d["size"] ?? 0, "sha256": d["sha256"] ?? "",
                   "host": URL(string: d["url"] as? String ?? "")?.host ?? ""] as J
    }
    return ["current": current, "platform": platform, "configured": configured, "auto": auto, "checking": busy, "checkedAt": docs.value("checkedAt") ?? NSNull(),
            "error": docs.value("error") ?? NSNull(), "latest": docs.value("latest") ?? NSNull(), "dismissed": docs.value("dismissed") ?? NSNull(),
            "available": available, "download": dl]
  }

  private static func fetch(_ raw: String, max: Int) async throws -> Data {
    guard let url = URL(string: raw) else { throw Refused(reason: "its address is not valid") }
    var r = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20); r.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    let (data, response): (Data, URLResponse)
    do { (data, response) = try await Net.session.data(for: r) } catch { throw Refused(reason: "offline") }
    guard safeURL(response.url?.absoluteString ?? raw) else { throw Refused(reason: "it was sent from an address that is not https") }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else { throw Refused(reason: "the update server answered \(status)") }
    guard data.count <= max else { throw Refused(reason: "it is too large") }
    return data
  }
  // One check; never throws (the reason is kept in the state). manual: from the button or the menu.
  @discardableResult static func check(manual: Bool = false) async -> J {
    guard configured else { if manual { docs.setValue("error", nil) }; return state() }
    guard guarded({ () -> Bool in if checking { return false }; checking = true; return true }) else { return state() }
    defer { guarded { checking = false } }
    docs.setValue("lastAttempt", now())
    do {
      let bytes: Data, sig: Data
      do { async let a = fetch(feedURL, max: maxFeed); async let b = fetch(feedURL + ".sig", max: 4096); (bytes, sig) = try await (a, b) }
      catch let e as Refused { throw Refused(reason: e.reason == "offline" ? "No connection to the update server. Check your internet connection." : "The update information could not be read: " + e.reason + ".") }
      let r: (release: J?, latest: String?)
      do { r = try verify(bytes, sig, keys: trustedKeys) } catch let e as Refused { throw Refused(reason: "The update information was not accepted: " + e.reason + ". Nothing was downloaded.") }
      let before = (docs.value("available") as? J)?["version"] as? String
      docs.setValue("checkedAt", isoNow()); docs.setValue("error", nil); docs.setValue("latest", r.latest)
      if let rel = r.release, let v = rel["version"] as? String, let d = (rel["downloads"] as? J)?[platform] as? J {
        docs.setValue("available", ["version": v, "date": (rel["date"] as? String).map { String($0.prefix(40)) } ?? NSNull(), "notes": String((rel["notes"] as? String ?? "").prefix(4000)), "download": d] as J)
        if before != v {
          Store.shared.prepend("activity", ["ts": isoNow(), "kind": "update.available", "title": "Version \(v) is available · Setup › Updates", "profile": "", "severity": "info"], limit: 400)
          Store.shared.emit("update.available", ["title": "Version \(v)", "version": v])
          guarded { if let dv = download["version"] as? String, dv != v { download = ["state": "idle"] } }
        }
      } else { docs.setValue("available", nil) }
    } catch let e as Refused { docs.setValue("error", e.reason) } catch { docs.setValue("error", error.localizedDescription) }
    return state()
  }

  // MARK: download
  static var downloadsDir: URL {
    #if DEBUG
    if Paths.env("HQS_HOME_OVERRIDE") != nil { return URL(fileURLWithPath: Paths.inHome("Downloads"), isDirectory: true) }
    #endif
    return FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
  }
  // The installer's name from its address (a .dmg only), else a plain one.
  static func installerName(_ raw: String, _ version: String) -> String {
    let n = (URL(string: raw)?.lastPathComponent ?? "").components(separatedBy: CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)).joined().trimmingCharacters(in: .whitespaces)
    return n.lowercased().hasSuffix(".dmg") && n.count <= 120 && !n.hasPrefix(".") ? n : "187N Agent HQ \(version).dmg"
  }
  static func startDownload() throws -> J {
    guard let a = docs.value("available") as? J, let v = a["version"] as? String, compare(v, current) > 0, let d = a["download"] as? J,
          let raw = d["url"] as? String, let size = d["size"] as? Int, let sha = d["sha256"] as? String else {
      throw APIError(409, "no_update", "There is no new version to download. Check for updates first.")
    }
    lock.lock()
    let st = download["state"] as? String ?? "idle"
    if st == "downloading" || st == "verifying" || (st == "ready" && download["version"] as? String == v && FileManager.default.fileExists(atPath: download["file"] as? String ?? "")) { lock.unlock(); return state() }
    download = ["state": "downloading", "version": v, "received": 0, "total": size, "file": NSNull(), "error": NSNull()]
    lock.unlock()
    Task.detached { await fetchInstaller(raw: raw, version: v, size: size, sha: sha) }
    return state()
  }
  private static func set(_ change: (inout J) -> Void) { guarded { change(&download) } }
  private static func fetchInstaller(raw: String, version: String, size: Int, sha: String) async {
    let fm = FileManager.default, dir = downloadsDir
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    let name = installerName(raw, version), ext = (name as NSString).pathExtension, stem = (name as NSString).deletingPathExtension
    var target = dir.appendingPathComponent(name), n = 2
    while fm.fileExists(atPath: target.path) { target = dir.appendingPathComponent("\(stem) \(n).\(ext)"); n += 1 }
    let part = target.appendingPathExtension("part")
    func fail(_ m: String) { try? fm.removeItem(at: part); set { $0["state"] = "failed"; $0["error"] = m } }
    guard safeURL(raw), let url = URL(string: raw) else { return fail("The download address is not https, so it was not used.") }
    let (bytes, response): (URLSession.AsyncBytes, URLResponse)
    do { (bytes, response) = try await Net.session.bytes(for: URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)) }
    catch { return fail("No connection to the download server. Check your internet connection and try again.") }
    guard safeURL(response.url?.absoluteString ?? raw) else { return fail("The download was sent from an address that is not https, so it was stopped.") }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(status) else { return fail("The download server answered \(status). Try again later.") }
    guard fm.createFile(atPath: part.path, contents: nil), let out = try? FileHandle(forWritingTo: part) else { return fail("The download could not be saved in your Downloads folder.") }
    var hash = SHA256(), received = 0, buffer = Data(); buffer.reserveCapacity(1 << 20)
    do {
      for try await byte in bytes {
        buffer.append(byte)
        if buffer.count >= 1 << 20 {
          received += buffer.count
          if received > size { try? out.close(); return fail("The download is larger than the signed update says, so it was deleted. Nothing was installed.") }
          hash.update(data: buffer); try out.write(contentsOf: buffer); buffer.removeAll(keepingCapacity: true); let r = received; set { $0["received"] = r }
        }
      }
      received += buffer.count
      if received > size { try? out.close(); return fail("The download is larger than the signed update says, so it was deleted. Nothing was installed.") }
      hash.update(data: buffer); try out.write(contentsOf: buffer); try out.close()
    } catch { try? out.close(); return fail("The download stopped: \(error.localizedDescription).") }
    set { $0["state"] = "verifying"; $0["received"] = received }
    let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
    guard received == size, digest == sha else { return fail("The download did not match the signed update, so it was deleted. Nothing was installed.") }
    do { try fm.moveItem(at: part, to: target) } catch { return fail("The download could not be saved in your Downloads folder.") }
    set { $0["state"] = "ready"; $0["file"] = target.path; $0["received"] = received }
  }
  static func open(_ what: String) throws -> J {
    lock.lock(); let ready = download["state"] as? String == "ready", file = download["file"] as? String ?? ""; lock.unlock()
    guard ready, FileManager.default.fileExists(atPath: file) else { throw APIError(409, "not_ready", "Download the update first.") }
    var out = state()
    if Paths.noTerminal { out["opened"] = false; return out }
    let url = URL(fileURLWithPath: file)
    DispatchQueue.main.async { if what == "folder" { NSWorkspace.shared.activateFileViewerSelecting([url]) } else { NSWorkspace.shared.open(url) } }
    out["opened"] = true; return out
  }

  // MARK: API and schedule
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { try await handle(method, path, r) }
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { try await handle(method, path, r) }
  static func handle(_ method: String, _ path: String, _ r: HTTPRequest) async throws -> Any? {
    guard path == "updates" || path.hasPrefix("updates/") else { return nil }
    let b = r.json
    switch (method, path) {
    case ("GET", "updates"): return state()
    case ("POST", "updates/check"): return await check(manual: true)
    case ("POST", "updates/download"): return try startDownload()
    case ("POST", "updates/open"): return try open(b["what"] as? String == "folder" ? "folder" : "installer")
    case ("POST", "updates/settings"): if let a = b["auto"] as? Bool { docs.setValue("auto", a) }; return state()
    case ("POST", "updates/dismiss"): docs.setValue("dismissed", (docs.value("available") as? J)?["version"]); return state()
    default: throw APIError(404, "not_found", "Unknown request for updates.")
    }
  }
  // The first automatic check comes shortly after the app opens; then once a day (sooner again after a failed check).
  static func due(at t: Double = now()) -> Bool { t - (docs.value("lastAttempt") as? Double ?? 0) >= (docs.value("error") is String ? retry : day) }
  static func launch(_ router: Router) {
    DispatchQueue.global().asyncAfter(deadline: .now() + firstCheckDelay) { if configured && auto && due() { Task { await check() } } }
  }
  static func tick(_ router: Router) {
    lock.lock(); let busy = checking; lock.unlock()
    if configured && auto && !busy && due() { Task { await check() } }
  }
}
