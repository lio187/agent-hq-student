// Proposals and Playbooks: the documents in folders the student chose in Setup. Only files inside those folders
// can be listed, read or opened.
import Foundation
import AppKit

enum Documents {
  static let folders = ["proposals": "proposalsFolder", "handbook": "handbookFolder"]
  static let types: [String: String] = ["pdf": "application/pdf", "md": "text/plain; charset=utf-8", "markdown": "text/plain; charset=utf-8", "txt": "text/plain; charset=utf-8",
                                        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"]
  static func folder(_ kind: String) -> String? { folders[kind].flatMap { Store.shared.setting($0) as? String }.flatMap { $0.isEmpty ? nil : $0 } }

  static func list(_ kind: String) throws -> J {
    guard folders[kind] != nil else { throw APIError(404, "not_found", "Unknown document list.") }
    guard let root = folder(kind) else { return ["folder": NSNull(), "files": [J]()] }
    let fm = FileManager.default, base = URL(fileURLWithPath: root).standardizedFileURL
    var files: [J] = []
    if let walker = fm.enumerator(at: base, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]) {
      for case let url as URL in walker {
        if walker.level > 4 { walker.skipDescendants(); continue }
        guard files.count < 2000, (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
        let v = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        let rel = String(url.standardizedFileURL.path.dropFirst(base.path.count + 1))
        files.append(["name": url.lastPathComponent, "rel": rel, "folder": (rel as NSString).deletingLastPathComponent, "ext": url.pathExtension.lowercased(), "bytes": v?.fileSize ?? 0,
                      "modified": ISO8601DateFormatter().string(from: v?.contentModificationDate ?? Date())])
      }
    }
    return ["folder": root, "folderName": base.lastPathComponent, "files": files]
  }
  // The file for a relative path, only when it stays inside the chosen folder.
  static func file(_ kind: String, _ rel: String) -> URL? {
    guard let root = folder(kind) else { return nil }
    let base = URL(fileURLWithPath: root).standardizedFileURL.resolvingSymlinksInPath()
    let target = base.appendingPathComponent(rel).standardizedFileURL.resolvingSymlinksInPath()
    guard target.path.hasPrefix(base.path + "/"), FileManager.default.fileExists(atPath: target.path) else { return nil }
    return target
  }
  static func serve(_ q: [String: String]) -> HTTPResponse {
    guard let url = file(q["kind"] ?? "", q["path"] ?? ""), let data = try? Data(contentsOf: url) else { return .error(404, "not_found", "This document is no longer in the folder.") }
    return .data(data, type: types[url.pathExtension.lowercased()] ?? "application/octet-stream", cache: "no-store")
  }
  static func open(_ body: J) throws -> J {
    guard let url = file(body["kind"] as? String ?? "", body["path"] as? String ?? "") else { throw APIError(404, "not_found", "This document is no longer in the folder.") }
    DispatchQueue.main.async { NSWorkspace.shared.open(url) }
    return ["ok": true]
  }
}
