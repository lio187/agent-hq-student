// Licences: a key looks like HQ1-<payload>.<signature> (base64url). The payload is JSON
// {"n": name, "e": email, "ed": edition, "iat": issued, "exp": expiry or 0} signed with 187N's private Ed25519 key;
// only the public key is in the app, so keys cannot be made without 187N.
import Foundation
import CryptoKit

struct License {
  let name: String, email: String, edition: String, issued: Double, expires: Double, key: String
  var isExpired: Bool { expires > 0 && now() > expires }
  var summary: J { ["name": name, "email": email, "edition": edition, "issued": issued, "expires": expires > 0 ? expires : NSNull(), "expired": isExpired] }

  static func b64url(_ s: Substring) -> Data? {
    var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while t.count % 4 != 0 { t += "=" }
    return Data(base64Encoded: t)
  }
  // Checks the signature and the fields; returns nil for anything that is not a valid 187N licence.
  static func parse(_ raw: String) -> License? {
    let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard key.hasPrefix("HQ1-") else { return nil }
    let parts = key.dropFirst(4).split(separator: ".")
    guard parts.count == 2, let payload = b64url(parts[0]), let sig = b64url(parts[1]),
          let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: BuildInfo.licensePublicKey),
          pub.isValidSignature(sig, for: payload),
          let j = (try? JSONSerialization.jsonObject(with: payload)) as? J,
          let name = j["n"] as? String, !name.isEmpty else { return nil }
    return License(name: name, email: j["e"] as? String ?? "", edition: j["ed"] as? String ?? "student", issued: j["iat"] as? Double ?? 0, expires: j["exp"] as? Double ?? 0, key: key)
  }
  private static let file = supportDir.appendingPathComponent("license.key")
  static var current: License? { (try? String(contentsOf: file, encoding: .utf8)).flatMap(parse) }
  static func store(_ raw: String) -> License? {
    guard let l = parse(raw) else { return nil }
    try? l.key.write(to: file, atomically: true, encoding: .utf8)
    return l
  }
}
