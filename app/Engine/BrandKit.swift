// The student's brand kit for the carousel and story maker: name, handle, four colours, a heading and a body font
// (a font installed on this Mac or an uploaded font file), a logo and a style. Stored in DocStore("makers"); uploaded
// files are copied into the makers media folder (fonts in its fonts/ folder), so the original can move or disappear.
import Foundation
import CoreText
import ImageIO

enum BrandKit {
  static var store: DocStore { DocStore.named("makers") }
  static var folder: URL { DocStore.folder("makers") }
  static var fontFolder: URL { let d = folder.appendingPathComponent("fonts", isDirectory: true); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }
  static let styles = ["clean", "bold", "editorial"]
  static let colourKeys = ["background", "text", "accent", "muted"]
  static let maxBytes = 5 * 1024 * 1024
  // "System" is the Mac's own interface font (San Francisco), which a page can only ask for by this alias.
  static let systemFont = "System"
  static let recommended = ["System", "Helvetica Neue", "Avenir Next", "Futura", "Gill Sans", "Optima", "Georgia", "Baskerville", "Didot", "Palatino", "Hoefler Text", "Rockwell", "American Typewriter", "Menlo"]
  static let defaults: J = ["name": "", "handle": "", "colours": ["background": "#FFFFFF", "text": "#111111", "accent": "#2F5BFF", "muted": "#6B7280"],
                            "fonts": ["heading": "Helvetica Neue", "body": "Helvetica Neue"], "fontFiles": J(), "logo": NSNull(), "style": "clean"]

  // MARK: reading
  // The saved kit merged over the defaults; `set` is false until the student saves it once.
  static func current() -> J {
    let saved = store.value("brand") as? J ?? [:]
    var b = defaults
    for (k, v) in saved { b[k] = v }
    b["colours"] = (defaults["colours"] as! J).merging(saved["colours"] as? J ?? [:]) { $1 }
    b["fonts"] = (defaults["fonts"] as! J).merging(saved["fonts"] as? J ?? [:]) { $1 }
    return b
  }
  static var isSet: Bool { (store.value("brand") as? J)?["savedAt"] != nil }
  static func colour(_ b: J, _ key: String) -> String { ((b["colours"] as? J)?[key] as? String) ?? ((defaults["colours"] as! J)[key] as! String) }
  static func handleOf(_ b: J) -> String { b["handle"] as? String ?? "" }

  // Font families on this Mac (hidden system families left out), for the font lists; read again after a minute.
  private static let familiesLock = NSLock()
  private static var families: (at: Double, list: [String])?
  static func installedFamilies() -> [String] {
    familiesLock.lock(); defer { familiesLock.unlock() }
    if let f = families, now() - f.at < 60 { return f.list }
    let names = (CTFontManagerCopyAvailableFontFamilyNames() as? [String] ?? []).filter { !$0.hasPrefix(".") && !$0.hasPrefix("#") }
    let list = Array(Set(names)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    families = (now(), list)
    return list
  }
  // What the page needs: the kit, whether it is set, and the font choices.
  static func payload() -> J {
    let installed = installedFamilies(), have = Set(installed)
    return ["brand": shaped(current()), "set": isSet, "styles": styles, "recommendedFonts": recommended.filter { $0 == systemFont || have.contains($0) }, "systemFonts": installed]
  }
  // The kit as the page sees it: uploaded files by their label, never a path on disk.
  static func shaped(_ b: J) -> J {
    var x = b
    var files: J = [:]
    for (slot, v) in b["fontFiles"] as? J ?? [:] { if let f = v as? J { files[slot] = ["family": f["family"] ?? "", "original": f["original"] ?? "", "bytes": f["bytes"] ?? 0, "format": f["format"] ?? ""] } }
    x["fontFiles"] = files
    if let l = b["logo"] as? J { x["logo"] = ["original": l["original"] ?? "", "type": l["type"] ?? "", "bytes": l["bytes"] ?? 0, "width": l["width"] ?? 0, "height": l["height"] ?? 0] }
    return x
  }

  // MARK: saving
  static func save(_ body: J) throws -> J {
    var b = current()
    let name = (body["name"] as? String ?? b["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard name.count <= 60 else { throw APIError(422, "bad_name", "Keep the brand name under 60 characters.") }
    var handle = (body["handle"] as? String ?? handleOf(b)).trimmingCharacters(in: .whitespacesAndNewlines)
    while handle.hasPrefix("@") { handle.removeFirst() }
    guard handle.count <= 40, !handle.contains(where: { $0.isWhitespace || $0 == "<" || $0 == ">" }) else { throw APIError(422, "bad_handle", "Write your handle without spaces, for example yourname.") }
    var colours = b["colours"] as? J ?? [:]
    let labels = ["background": "background", "text": "text", "accent": "accent", "muted": "muted text"]
    for (k, v) in body["colours"] as? J ?? [:] where colourKeys.contains(k) {
      guard let c = normalColour(v as? String ?? "") else { throw APIError(422, "bad_colour", "The \(labels[k] ?? k) colour code must look like #1A2B3C.") }
      colours[k] = c
    }
    let style = body["style"] as? String ?? b["style"] as? String ?? "clean"
    guard styles.contains(style) else { throw APIError(422, "bad_style", "Choose Clean, Bold or Editorial.") }
    var fonts = b["fonts"] as? J ?? [:], files = b["fontFiles"] as? J ?? [:]
    let have = Set(installedFamilies())
    for (slot, v) in body["fonts"] as? J ?? [:] where slot == "heading" || slot == "body" {
      let family = (v as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      if family == "@upload" { guard files[slot] != nil else { throw APIError(422, "no_font_file", "Upload a font file first, or pick a font from the list.") }; continue }
      guard family == systemFont || have.contains(family) else { throw APIError(422, "unknown_font", "“\(family)” is not installed on this Mac. Pick a font from the list or upload a font file.") }
      fonts[slot] = family
      if let old = files[slot] as? J { remove(old["file"] as? String, in: fontFolder); files[slot] = nil }
    }
    b["name"] = name; b["handle"] = handle; b["colours"] = colours; b["style"] = style; b["fonts"] = fonts; b["fontFiles"] = files; b["savedAt"] = now()
    store.setValue("brand", b)
    Store.shared.emit("makers.brand", ["title": name.isEmpty ? "Brand kit" : name])
    return payload()
  }

  // Copies a logo or a font file the student picked into the app's folder. Only a regular file, 5 MB at most, of the
  // right kind; links and folders are refused. An empty path removes the asset.
  static func addAsset(purpose: String, path: String) throws -> J {
    guard ["logo", "font-heading", "font-body"].contains(purpose) else { throw APIError(422, "bad_purpose", "Choose a logo or a font.") }
    var b = current()
    var files = b["fontFiles"] as? J ?? [:]
    let slot = purpose == "logo" ? "logo" : String(purpose.dropFirst(5))
    if path.isEmpty {
      if slot == "logo" { remove((b["logo"] as? J)?["file"] as? String, in: folder); b["logo"] = NSNull() }
      else { remove((files[slot] as? J)?["file"] as? String, in: fontFolder); files[slot] = nil; b["fontFiles"] = files }
      store.setValue("brand", b); return payload()
    }
    guard path.hasPrefix("/") else { throw APIError(422, "bad_path", "Choose the file with the Choose button.") }
    let data = try readRegularFile(path)
    let original = (path as NSString).lastPathComponent, ext = (original as NSString).pathExtension.lowercased()
    let stamp = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10).lowercased()
    if slot == "logo" {
      guard let kind = logoKind(data, ext: ext) else { throw APIError(422, "bad_logo", "Use a PNG, JPG or SVG file for your logo.") }
      var info: J = ["type": kind, "original": original, "bytes": data.count]
      if kind != "svg" {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil), let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? J,
              let w = props[kCGImagePropertyPixelWidth as String] as? Int, let h = props[kCGImagePropertyPixelHeight as String] as? Int, w > 0, h > 0,
              CGImageSourceCreateImageAtIndex(src, 0, nil) != nil else { throw APIError(422, "bad_logo", "This image could not be read. Export it again as PNG or JPG.") }
        info["width"] = w; info["height"] = h
      }
      let file = "logo-\(stamp).\(kind == "jpeg" ? "jpg" : kind)"
      try data.write(to: folder.appendingPathComponent(file), options: .atomic)
      remove((b["logo"] as? J)?["file"] as? String, in: folder)
      info["file"] = file; b["logo"] = info
    } else {
      guard let format = fontFormat(data, ext: ext) else { throw APIError(422, "bad_font", "Use a TTF, OTF or WOFF2 font file.") }
      let family = fontFamily(data) ?? (original as NSString).deletingPathExtension
      let file = "\(slot)-\(stamp).\(format.ext)"
      try data.write(to: fontFolder.appendingPathComponent(file), options: .atomic)
      remove((files[slot] as? J)?["file"] as? String, in: fontFolder)
      files[slot] = ["file": file, "family": family, "format": format.css, "mime": format.mime, "original": original, "bytes": data.count]
      var fonts = b["fonts"] as? J ?? [:]; fonts[slot] = family
      b["fontFiles"] = files; b["fonts"] = fonts
    }
    store.setValue("brand", b)
    Store.shared.emit("makers.brand", ["title": original])
    return payload()
  }

  // Reads a file only when it is a regular file (not a link, folder or device) of at most 5 MB.
  static func readRegularFile(_ path: String) throws -> Data {
    let fd = open(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
    if fd < 0 {
      if errno == ELOOP { throw APIError(422, "link_refused", "This is a link to another file. Choose the file itself.") }
      throw APIError(404, "not_found", "This file could not be opened. Choose it again.")
    }
    let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    var st = stat()
    guard fstat(fd, &st) == 0 else { throw APIError(404, "not_found", "This file could not be opened. Choose it again.") }
    guard (st.st_mode & S_IFMT) == S_IFREG else { throw APIError(422, "not_a_file", "Choose a single file, not a folder.") }
    guard st.st_size > 0 else { throw APIError(422, "empty_file", "This file is empty.") }
    guard st.st_size <= maxBytes else { throw APIError(413, "too_large", "This file is larger than 5 MB. Choose a smaller one.") }
    let data = try handle.readToEnd() ?? Data()
    guard data.count <= maxBytes else { throw APIError(413, "too_large", "This file is larger than 5 MB. Choose a smaller one.") }
    return data
  }
  static func logoKind(_ d: Data, ext: String) -> String? {
    if d.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) && ext == "png" { return "png" }
    if d.starts(with: [0xFF, 0xD8, 0xFF]) && (ext == "jpg" || ext == "jpeg") { return "jpeg" }
    if ext == "svg", let text = String(data: d.prefix(4096), encoding: .utf8)?.lowercased(), text.contains("<svg"),
       text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))).hasPrefix("<") { return "svg" }
    return nil
  }
  static func fontFormat(_ d: Data, ext: String) -> (ext: String, css: String, mime: String)? {
    let head = [UInt8](d.prefix(4))
    if head == [0x00, 0x01, 0x00, 0x00] || head == Array("true".utf8) { return ext == "otf" ? ("otf", "opentype", "font/otf") : ("ttf", "truetype", "font/ttf") }
    if head == Array("OTTO".utf8) { return ("otf", "opentype", "font/otf") }
    if head == Array("wOF2".utf8) { return ("woff2", "woff2", "font/woff2") }
    return nil
  }
  static func fontFamily(_ d: Data) -> String? {
    guard let list = CTFontManagerCreateFontDescriptorsFromData(d as CFData) as? [CTFontDescriptor], let first = list.first else { return nil }
    return CTFontDescriptorCopyAttribute(first, kCTFontFamilyNameAttribute) as? String
  }
  static func normalColour(_ v: String) -> String? {
    var s = v.trimmingCharacters(in: .whitespaces).uppercased()
    if !s.hasPrefix("#") { s = "#" + s }
    let digits = s.dropFirst()
    guard digits.allSatisfy({ $0.isHexDigit }) else { return nil }
    if digits.count == 3 { return "#" + digits.map { "\($0)\($0)" }.joined() }
    return digits.count == 6 ? s : nil
  }
  private static func remove(_ file: String?, in dir: URL) {
    guard let file, !file.isEmpty, !file.contains("/") else { return }
    try? FileManager.default.removeItem(at: dir.appendingPathComponent(file))
  }

  // MARK: for the slides
  static func logoDataURL(_ b: J) -> String? {
    guard let l = b["logo"] as? J, let file = l["file"] as? String, let data = try? Data(contentsOf: folder.appendingPathComponent(file)) else { return nil }
    let mime = ["png": "image/png", "jpeg": "image/jpeg", "svg": "image/svg+xml"][l["type"] as? String ?? ""] ?? "image/png"
    return "data:\(mime);base64," + data.base64EncodedString()
  }
  // The brand as CSS: uploaded fonts as data: URLs and the colours as custom properties (see templates/slides.css).
  static func css(_ b: J) -> String {
    var out = ""
    let files = b["fontFiles"] as? J ?? [:], fonts = b["fonts"] as? J ?? [:]
    var stacks: [String: String] = [:]
    for slot in ["heading", "body"] {
      let alias = slot == "heading" ? "Brand Heading" : "Brand Body"
      if let f = files[slot] as? J, let file = f["file"] as? String, let data = try? Data(contentsOf: fontFolder.appendingPathComponent(file)) {
        out += "@font-face{font-family:\"\(alias)\";src:url(\"data:\(f["mime"] as? String ?? "font/ttf");base64,\(data.base64EncodedString())\") format(\"\(f["format"] as? String ?? "truetype")\");font-weight:100 900;font-style:normal;font-display:block}"
        stacks[slot] = "\"\(alias)\"," + fallback
      } else {
        stacks[slot] = family(fonts[slot] as? String ?? "")
      }
    }
    let bg = colour(b, "background"), fg = colour(b, "text"), accent = colour(b, "accent"), muted = colour(b, "muted")
    let ink = inkOn(accent)
    let vars = ["--brand-bg": bg, "--brand-fg": fg, "--brand-accent": accent, "--brand-muted": muted,
                "--on-accent": ink, "--on-accent-soft": rgba(ink, 0.72), "--on-accent-line": rgba(ink, 0.28),
                "--bg": "var(--brand-bg)", "--fg": "var(--brand-fg)", "--accent": "var(--brand-accent)", "--muted": "var(--brand-muted)", "--accent-ink": "var(--on-accent)",
                "--line": rgba(fg, 0.14), "--soft": rgba(accent, 0.1), "--font-heading": stacks["heading"] ?? fallback, "--font-body": stacks["body"] ?? fallback]
    out += ":root{" + vars.keys.sorted().map { $0 + ":" + vars[$0]! }.joined(separator: ";") + "}"
    return out
  }
  static let fallback = "-apple-system,\"Helvetica Neue\",Helvetica,Arial,sans-serif"
  static func family(_ name: String) -> String {
    let safe = name.filter { $0.isLetter || $0.isNumber || " -._'&".contains($0) }.replacingOccurrences(of: "'", with: "\\'")
    if safe.isEmpty || safe == systemFont { return "-apple-system,system-ui,\"Helvetica Neue\",sans-serif" }
    return "'\(safe)'," + fallback
  }
  static func rgb(_ c: String) -> (Double, Double, Double) {
    let v = Int(c.dropFirst(), radix: 16) ?? 0
    return (Double((v >> 16) & 0xff) / 255, Double((v >> 8) & 0xff) / 255, Double(v & 0xff) / 255)
  }
  static func rgba(_ c: String, _ a: Double) -> String {
    let (r, g, b) = rgb(c)
    return "rgba(\(Int(r * 255)),\(Int(g * 255)),\(Int(b * 255)),\(a))"
  }
  // Black or white text on the accent colour, whichever reads better (WCAG contrast).
  static func inkOn(_ c: String) -> String {
    let (r, g, b) = rgb(c)
    func lin(_ x: Double) -> Double { x <= 0.03928 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
    let l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#111111" : "#FFFFFF"
  }
}
