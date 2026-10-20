// Research: Signals (a free news radar, Signals.swift) and Competitors (the student's watchlist through their own
// Apify key, Competitors.swift). This file routes their API paths and holds the helpers both use.
import Foundation
import CryptoKit

enum ResearchAPI {
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    if path == "marketing/signals" || path.hasPrefix("marketing/signals/") { return try await Signals.hq(method, path, r, router) }
    if path == "marketing/competitors" || path.hasPrefix("marketing/competitors/") || path == "marketing/media" { return try await Competitors.hq(method, path, r, router) }
    return nil
  }
  // Setup → Research: the monthly Apify limit and the Signals topics (the keys go through POST /api/student/keys).
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    switch (method, path) {
    case ("GET", "research/setup"): return setup()
    case ("POST", "research/cap"):
      guard let usd = number(r.json["usd"]), usd >= 0, usd <= 500 else { throw APIError(422, "bad_cap", "Enter a monthly limit between $0 and $500.") }
      Apify.setCap(usd); return setup()
    case ("POST", "research/topics"):
      try Signals.saveSettings(topics: r.json["topics"], feeds: nil); return setup()
    default: return nil
    }
  }
  static func launch(_ router: Router) { Signals.recover(); DispatchQueue.global(qos: .utility).async { Competitors.prune() } }
  // Every 30 s: Signals refreshes each source at most once an hour; Competitors runs the weekly collection only
  // when the student switched it on (and confirmed its cost limit).
  static func tick(_ router: Router) { Signals.tick(); Competitors.tick() }

  static func setup() -> J {
    let l = Apify.ledger()
    return ["apify": Apify.connected, "groq": Keychain.get(KeyName.groq) != nil, "capUsd": l["capUsd"] ?? 5, "monthUsd": l["monthUsd"] ?? 0, "topics": Signals.settings().topics]
  }
  static func number(_ v: Any?) -> Double? {
    if let d = v as? Double { return d.isFinite ? d : nil }
    if let i = v as? Int { return Double(i) }
    if let s = v as? String { return Double(s.trimmingCharacters(in: .whitespaces)) }
    return nil
  }
}

enum Research {
  // The fastest-rising competitor posts (for Studio's "What is working").
  static func risingPosts(limit: Int) -> [J] { Competitors.rising(limit: limit) }

  static let store = DocStore.named("research")
  // Test builds may download from the local stand-ins (127.0.0.1); release builds never do.
  static var testBuild: Bool { Paths.standIns }
  static func hash(_ s: String, _ n: Int = 16) -> String { String(SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined().prefix(n)) }
  static func date(_ v: Any?) -> Date? {
    if let n = v as? Double { return Date(timeIntervalSince1970: n > 1e12 ? n / 1000 : n) }
    if let n = v as? Int { return Date(timeIntervalSince1970: Double(n > 1_000_000_000_000 ? n / 1000 : n)) }
    guard var s = (v as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
    if s.count == 8, Int(s) != nil { s = String(s.prefix(4)) + "-" + String(s.dropFirst(4).prefix(2)) + "-" + String(s.suffix(2)) }   // YYYYMMDD
    for f in isoParsers { if let d = f.date(from: s) { return d } }
    for f in feedParsers { if let d = f.date(from: s) { return d } }
    return nil
  }
  static func iso(_ d: Date?) -> String { d.map { isoParsers[1].string(from: $0) } ?? "" }
  // Made once and never changed afterwards (safe to share between threads).
  private static let isoParsers: [ISO8601DateFormatter] = [[.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime], [.withFullDate]].map { (o: ISO8601DateFormatter.Options) in
    let f = ISO8601DateFormatter(); f.formatOptions = o; return f
  }
  private static let feedParsers: [DateFormatter] = ["EEE, dd MMM yyyy HH:mm:ss zzz", "EEE, dd MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm:ss zzz", "EEE, d MMM yyyy HH:mm:ss Z",
                                                     "EEE, dd MMM yyyy HH:mm zzz", "dd MMM yyyy HH:mm:ss zzz", "yyyy-MM-dd HH:mm:ss"].map { fmt in
    let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "UTC"); f.dateFormat = fmt; return f
  }

  // Downloads at most `maxBytes` from a public address. `allow` checks the address and every redirect, so a
  // redirect can never leave the allowed hosts. Returns the bytes and the response's content type.
  static func download(_ url: URL, maxBytes: Int, accept: String, allow: @escaping (URL) -> Bool) async throws -> (Data, String) {
    guard allow(url) else { throw APIError(422, "not_allowed", "This address is not allowed.") }
    var req = URLRequest(url: url, timeoutInterval: 25); req.setValue(accept, forHTTPHeaderField: "Accept")
    let guardian = RedirectGuard(allow)
    let (bytes, response) = try await Net.session.bytes(for: req, delegate: guardian)
    let http = response as? HTTPURLResponse
    guard let http, (200..<300).contains(http.statusCode) else { bytes.task.cancel(); throw APIError(502, "download", "The source answered \(http?.statusCode ?? 0).") }
    if http.expectedContentLength > Int64(maxBytes) { bytes.task.cancel(); throw APIError(413, "too_large", "The file is too large.") }
    var data = Data(); data.reserveCapacity(Int(min(max(http.expectedContentLength, 0), Int64(maxBytes))))
    for try await b in bytes {
      data.append(b)
      if data.count > maxBytes { bytes.task.cancel(); throw APIError(413, "too_large", "The file is too large.") }
    }
    return (data, (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased())
  }
}

// Refuses a redirect to an address that is not allowed.
final class RedirectGuard: NSObject, URLSessionTaskDelegate {
  private let allow: (URL) -> Bool
  init(_ allow: @escaping (URL) -> Bool) { self.allow = allow }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(request.url.map(allow) == true ? request : nil)
  }
}
