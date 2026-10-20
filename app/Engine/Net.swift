// HTTPS JSON calls to the services the student connects (Composio, Zernio).
import Foundation

struct NetError: Error, LocalizedError {
  let status: Int, message: String, code: String
  var errorDescription: String? { message }
}

enum Net {
  static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral; c.timeoutIntervalForRequest = 25; c.timeoutIntervalForResource = 60
    c.httpAdditionalHeaders = ["User-Agent": "187N-Agent-HQ/" + AppInfo.version]
    return URLSession(configuration: c)
  }()
  // The test build may point a service at a local stand-in (HQS_<NAME>_BASE); release builds always use the real host.
  static func base(_ name: String, _ real: String) -> String {
    #if DEBUG
    if let v = ProcessInfo.processInfo.environment["HQS_\(name)_BASE"], !v.isEmpty { return v }
    #endif
    return real
  }
  static func json(_ method: String, _ url: String, headers: [String: String], body: Any? = nil) async throws -> Any {
    guard let u = URL(string: url) else { throw NetError(status: 0, message: "Bad address.", code: "bad_url") }
    var r = URLRequest(url: u); r.httpMethod = method
    for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
    if let body { r.httpBody = try JSONSerialization.data(withJSONObject: body); r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    r.setValue("application/json", forHTTPHeaderField: "Accept")
    let (data, response): (Data, URLResponse)
    do { (data, response) = try await session.data(for: r) }
    catch { throw NetError(status: 0, message: "No connection to \(u.host ?? "the service"). Check your internet connection.", code: "offline") }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let parsed = (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) ?? [:]
    guard (200..<300).contains(status) else {
      let j = parsed as? J ?? [:]
      let e = j["error"]
      let message = (e as? J)?["message"] as? String ?? (e as? String) ?? j["message"] as? String ?? "The service answered \(status)."
      let code = (e as? J)?["code"] as? String ?? j["code"] as? String ?? String(status)
      throw NetError(status: status, message: message, code: code)
    }
    return parsed
  }
}
