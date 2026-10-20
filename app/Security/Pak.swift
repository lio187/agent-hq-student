// The dashboard's files ship as one sealed archive (Resources/app.pak): AES-GCM encrypted, and checked against
// the SHA-256 recorded in the app at build time. A changed archive is refused, so the app's pages, logo and text
// cannot be swapped.
import Foundation
import CryptoKit

enum Pak {
  struct Failure: Error { let reason: String }
  // path → (content type, bytes)
  static func load() throws -> [String: (String, Data)] {
    guard let url = Bundle.main.url(forResource: "app", withExtension: "pak"), let sealed = try? Data(contentsOf: url) else { throw Failure(reason: "missing") }
    let digest = SHA256.hash(data: sealed).map { String(format: "%02x", $0) }.joined()
    guard digest == BuildInfo.pakSHA256 else { throw Failure(reason: "modified") }
    let box = try AES.GCM.SealedBox(combined: sealed)
    let plain = try AES.GCM.open(box, using: SymmetricKey(data: BuildInfo.pakKey()))
    // Layout: 4-byte big-endian index length, index JSON {path: [offset, length, type]}, then the files.
    guard plain.count > 4 else { throw Failure(reason: "empty") }
    let n = plain.prefix(4).reduce(0) { $0 << 8 | Int($1) }
    guard let index = (try? JSONSerialization.jsonObject(with: plain.subdata(in: 4..<(4 + n)))) as? [String: [Any]] else { throw Failure(reason: "index") }
    var files: [String: (String, Data)] = [:]
    let base = 4 + n
    for (path, entry) in index {
      guard entry.count == 3, let off = entry[0] as? Int, let len = entry[1] as? Int, let type = entry[2] as? String else { continue }
      files[path] = (type, plain.subdata(in: (base + off)..<(base + off + len)))
    }
    return files
  }
}
