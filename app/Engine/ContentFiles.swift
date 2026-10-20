// Rendered slides and clips for the content pages (GET marketing/file?path=…): PNG, JPG and MP4 only, and only from the
// workspace's Marketing folder or the app's own media folders (renders, thumbnails). Symlinks are resolved before the
// check, so a link inside those folders cannot point the page at any other file on this Mac.
import Foundation

enum ContentFiles {
  static let types = ["png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "mp4": "video/mp4"]
  static func roots(_ router: Router) -> [URL] {
    let marketing = URL(fileURLWithPath: router.workspace).appendingPathComponent("Marketing", isDirectory: true)
    let media = DocStore.folder("content").deletingLastPathComponent()  // <data folder>/media, every area's files
    return [marketing, media].map { $0.standardizedFileURL.resolvingSymlinksInPath() }
  }
  // The file for a path (absolute, or relative to the Marketing folder) when it is an allowed type inside a root.
  static func allowed(_ path: String, _ router: Router) -> URL? {
    guard !path.isEmpty, !path.contains("\0") else { return nil }
    let all = roots(router)
    let raw = path.hasPrefix("/") ? URL(fileURLWithPath: path) : all[0].appendingPathComponent(path)
    let target = raw.standardizedFileURL.resolvingSymlinksInPath()
    var isDir: ObjCBool = false
    guard types[target.pathExtension.lowercased()] != nil, all.contains(where: { target.path.hasPrefix($0.path + "/") }),
          FileManager.default.fileExists(atPath: target.path, isDirectory: &isDir), !isDir.boolValue else { return nil }
    return target
  }
  // The images and clips in the workspace's Marketing folder (created when missing, so the student can find it), newest
  // first; campaigns can attach them as carousel slides or stories.
  static func listing(_ router: Router) -> J {
    let base = URL(fileURLWithPath: router.workspace).appendingPathComponent("Marketing", isDirectory: true)
    try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    var files: [J] = []
    if let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey], options: [.skipsHiddenFiles, .skipsPackageDescendants]) {
      for case let url as URL in walker {
        if walker.level > 3 { walker.skipDescendants(); continue }
        guard files.count < 500, types[url.pathExtension.lowercased()] != nil, let real = allowed(url.path, router) else { continue }
        let v = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        files.append(["path": real.path, "name": url.lastPathComponent, "rel": String(url.standardizedFileURL.path.dropFirst(base.standardizedFileURL.path.count + 1)),
                      "ext": url.pathExtension.lowercased(), "bytes": v?.fileSize ?? 0, "modified": ISO8601DateFormatter().string(from: v?.contentModificationDate ?? Date())])
      }
    }
    return ["folder": base.path, "files": files.sorted { ($0["modified"] as? String ?? "") > ($1["modified"] as? String ?? "") }]
  }
  // Byte ranges for video (WebKit asks for them before it plays); a missing or unusable range sends the whole file.
  static func serve(_ path: String, range: String?, _ router: Router) -> HTTPResponse {
    guard let url = allowed(path, router), let type = types[url.pathExtension.lowercased()], let h = try? FileHandle(forReadingFrom: url) else {
      return .error(404, "not_found", "This file is not in your Marketing folder or the app's media folder.")
    }
    defer { try? h.close() }
    let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
    if let range, size > 0, let r = parse(range, size: size) {
      let from = r.0
      try? h.seek(toOffset: UInt64(from))
      let data = (try? h.read(upToCount: r.1 - from + 1)) ?? Data()
      return HTTPResponse(status: 206, headers: ["Content-Type": type, "Content-Range": "bytes \(from)-\(from + data.count - 1)/\(size)", "Accept-Ranges": "bytes", "Cache-Control": "no-store"], body: data)
    }
    var res = HTTPResponse.data((try? h.readToEnd()) ?? Data(), type: type, cache: "no-store")
    res.headers["Accept-Ranges"] = "bytes"
    return res
  }
  // "bytes=a-b", "bytes=a-" or "bytes=-n"; an open range is served 4 MB at a time.
  static func parse(_ header: String, size: Int) -> (Int, Int)? {
    guard header.hasPrefix("bytes="), !header.contains(",") else { return nil }
    let parts = header.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false).map { Int($0.trimmingCharacters(in: .whitespaces)) }
    guard parts.count == 2 else { return nil }
    switch (parts[0], parts[1]) {
    case let (a?, b?) where a <= b && a < size: return (a, min(b, size - 1))
    case let (a?, nil) where a < size: return (a, min(size - 1, a + (4 << 20) - 1))
    case let (nil, n?) where n > 0: return (max(0, size - n), size - 1)
    default: return nil
    }
  }
}
