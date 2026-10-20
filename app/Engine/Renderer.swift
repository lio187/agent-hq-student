// Slides to PNG on this Mac. A slide is one of the sealed HTML templates with the brand and the text filled in
// (Slides.document); WebKit lays it out in a window that is never on screen, the app takes a snapshot and redraws it
// into an exact sRGB bitmap of 1080×1350 (carousel) or 1080×1920 (story). No browser, no network, no AI images.
import Foundation
import AppKit
import WebKit
import ImageIO
import UniformTypeIdentifiers

enum Slides {
  static let templates: [String: [String]] = ["carousel": ["cover", "point", "list", "quote", "cta"], "story": ["hook", "step", "poll", "cta"]]
  static func size(_ format: String) -> (width: Int, height: Int) { format == "story" ? (1080, 1920) : (1080, 1350) }
  // The slide page may load nothing: only its own inline styles and data: images and fonts.
  static let csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"

  static func file(_ router: Router, _ name: String) -> String? { router.files["templates/" + name].flatMap { String(data: $0.1, encoding: .utf8) } }

  // What the page and the renderer share: the document head (policy, brand CSS, slide CSS), every template, and the
  // brand values the templates show.
  static func kit(router: Router, brand: J) throws -> J {
    guard let css = file(router, "slides.css") else { throw APIError(500, "templates_missing", "The slide templates are missing from this copy of the app. Download the app again.") }
    let head = "<meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"\(csp)\"><style>\(BrandKit.css(brand))</style><style>\(css)</style>"
    var all: J = [:]
    for (format, names) in templates {
      var m: J = [:]
      for n in names { m[n] = file(router, "\(format)-\(n).html") ?? "" }
      all[format] = m
    }
    return ["head": head, "templates": all, "logo": orNull(BrandKit.logoDataURL(brand)), "name": brand["name"] as? String ?? "", "handle": BrandKit.handleOf(brand),
            "style": brand["style"] as? String ?? "clean", "sizes": ["carousel": [1080, 1350], "story": [1080, 1920]]]
  }

  // One slide as a full HTML document. The page's live preview (compose() in mk-makers.mjs) builds the same string
  // from the same kit, character for character, so what the student sees is what gets rendered.
  static func document(kit: J, format: String, slide: J, index: Int, total: Int) -> String {
    var name = slide["template"] as? String ?? ""
    if !(templates[format] ?? []).contains(name) { name = format == "story" ? "step" : "point" }
    let tpl = ((kit["templates"] as? J)?[format] as? J)?[name] as? String ?? ""
    let logo = kit["logo"] as? String
    let items = (slide["items"] as? [String] ?? []).map(clean).filter { !$0.isEmpty }
    let handle = clean(kit["handle"] as? String ?? "")
    let heading = slide["heading"] as? String ?? "", body = slide["body"] as? String ?? ""
    let values: [String: String] = [
      "logo": logo.map { "<img class=\"logo\" src=\"\($0)\" alt=\"\">" } ?? "",
      "name": esc(clean(kit["name"] as? String ?? "")), "handle": handle.isEmpty ? "" : "@" + esc(handle),
      "number": pad(index + 1), "total": pad(total),
      "heading": rich(heading), "body": rich(body), "footer": esc(clean(slide["footer"] as? String ?? "")),
      "items": items.map { "<li>" + rich($0) + "</li>" }.joined(), "itemCount": String(items.count),
      "headingSize": headingSize(heading), "bodySize": bodySize(body),
    ]
    let classes = ["fmt-" + format, "style-" + (kit["style"] as? String ?? "clean"), "tpl-" + name, index == 0 ? "is-first" : "", index == total - 1 ? "is-last" : "", logo != nil ? "has-logo" : ""]
    return "<!doctype html><html><head>" + (kit["head"] as? String ?? "") + "</head><body class=\"" + classes.filter { !$0.isEmpty }.joined(separator: " ") + "\">" + fill(tpl, values) + "</body></html>"
  }

  // {{name}} placeholders, filled in one pass (filled-in text is never read as a placeholder).
  static func fill(_ tpl: String, _ values: [String: String]) -> String {
    var out = "", rest = Substring(tpl)
    while let open = rest.range(of: "{{") {
      out += rest[..<open.lowerBound]
      let after = rest[open.upperBound...]
      if let close = after.range(of: "}}"), case let key = after[..<close.lowerBound], !key.isEmpty, key.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }) {
        out += values[String(key)] ?? ""
        rest = after[close.upperBound...]
      } else {
        out += "{"
        rest = rest[rest.index(after: open.lowerBound)...]
      }
    }
    return out + rest
  }
  static let edge = CharacterSet(charactersIn: " \t\n\r\u{00A0}")
  static func clean(_ t: String) -> String { t.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: edge) }
  static func esc(_ t: String) -> String {
    var s = ""
    for c in t.unicodeScalars {
      switch c { case "&": s += "&amp;"; case "<": s += "&lt;"; case ">": s += "&gt;"; case "\"": s += "&quot;"; case "'": s += "&#39;"; default: s.unicodeScalars.append(c) }
    }
    return s
  }
  private static let strong = try! NSRegularExpression(pattern: "\\*\\*([^*\\n]+)\\*\\*"), single = try! NSRegularExpression(pattern: "\\*([^*\\n]+)\\*")
  // Escaped text; *word* or **word** becomes the highlight (<em>), a line break becomes <br>.
  static func rich(_ t: String) -> String {
    var s = esc(clean(t))
    s = strong.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: s.utf16.count), withTemplate: "<em>$1</em>")
    s = single.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: s.utf16.count), withTemplate: "<em>$1</em>")
    return s.replacingOccurrences(of: "\n", with: "<br>")
  }
  static func plainLength(_ t: String) -> Int { clean(t).replacingOccurrences(of: "*", with: "").trimmingCharacters(in: edge).utf16.count }
  static func headingSize(_ t: String) -> String { let n = plainLength(t); return n <= 16 ? "xl" : n <= 32 ? "l" : n <= 56 ? "m" : n <= 90 ? "s" : "xs" }
  static func bodySize(_ t: String) -> String { let n = plainLength(t); return n <= 80 ? "l" : n <= 160 ? "m" : n <= 260 ? "s" : "xs" }
  static func pad(_ n: Int) -> String { n < 10 ? "0" + String(n) : String(n) }
}

// The renderer: one web view in a borderless window placed far outside every screen (ordered in, so WebKit lays out
// and paints, but never visible), used by one slide at a time on the main thread.
@MainActor final class SlideRenderer: NSObject, WKNavigationDelegate {
  static let shared = SlideRenderer()
  struct Output { let png: Data; let method: String; let fonts: J }

  private var window: NSWindow?
  private var web: WKWebView?
  private var loaded: ((Result<Void, Error>) -> Void)?
  private var busy = false
  private var waiting: [CheckedContinuation<Void, Never>] = []
  private var generation = 0

  func render(html: String, width: Int, height: Int, pdfOnly: Bool = false) async throws -> Output {
    if busy { await withCheckedContinuation { waiting.append($0) } } else { busy = true }
    generation += 1
    defer {
      if waiting.isEmpty { busy = false; scheduleRelease() } else { waiting.removeFirst().resume() }
    }
    let web = prepare(width: width, height: height)
    try await until(15, "The slide took too long to load.") { done in
      self.loaded = done
      web.loadHTMLString(html, baseURL: nil)
    }
    // Fonts and images first, then two frames (a window off screen gets no frames, so a short wait stands in).
    let ready = """
      const wait = ms => new Promise(r => setTimeout(r, ms));
      await Promise.race([document.fonts.ready, wait(5000)]);
      await Promise.race([Promise.all([...document.images].map(i => i.decode().catch(() => null))), wait(5000)]);
      await Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), wait(160)]);
      const faces = [...document.fonts];
      return {status: document.fonts.status, loaded: faces.filter(f => f.status === 'loaded').length, failed: faces.filter(f => f.status === 'error').map(f => f.family).join(', '),
              images: document.images.length, broken: [...document.images].filter(i => !i.complete || !i.naturalWidth).length};
      """
    let fonts = (try? await web.callAsyncJavaScript(ready, arguments: [:], in: nil, contentWorld: .defaultClient)) as? J ?? [:]
    let snap = WKSnapshotConfiguration()
    snap.rect = CGRect(x: 0, y: 0, width: width, height: height)
    snap.snapshotWidth = NSNumber(value: width)
    snap.afterScreenUpdates = true
    if !pdfOnly, let image = try? await until(15, "The snapshot took too long.", { (done: @escaping (Result<NSImage, Error>) -> Void) in
         web.takeSnapshot(with: snap) { img, err in done(img.map { .success($0) } ?? .failure(err ?? APIError(500, "snapshot_failed", "The snapshot failed."))) } }),
       let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil), let frame = SlideRenderer.redraw(width: width, height: height, { $0.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height)) }),
       !SlideRenderer.isBlank(frame) {
      return Output(png: try SlideRenderer.png(frame), method: "snapshot", fonts: fonts)
    }
    // Fallback: the page as PDF, rasterised into the same bitmap.
    let pdf = WKPDFConfiguration()
    pdf.rect = CGRect(x: 0, y: 0, width: width, height: height)
    let data: Data = try await until(15, "The slide could not be drawn.") { done in
      web.createPDF(configuration: pdf) { done($0) }
    }
    guard let provider = CGDataProvider(data: data as CFData), let doc = CGPDFDocument(provider), let page = doc.page(at: 1),
          let frame = SlideRenderer.redraw(width: width, height: height, { ctx in
            let box = page.getBoxRect(.mediaBox)
            ctx.scaleBy(x: CGFloat(width) / max(box.width, 1), y: CGFloat(height) / max(box.height, 1))
            ctx.translateBy(x: -box.minX, y: -box.minY)
            ctx.drawPDFPage(page)
          }) else { throw APIError(500, "render_failed", "The slide could not be drawn.") }
    guard !SlideRenderer.isBlank(frame) else { throw APIError(422, "blank_slide", "The slide came out empty. Check that your text and background colours differ, then render again.") }
    return Output(png: try SlideRenderer.png(frame), method: "pdf", fonts: fonts)
  }

  private func prepare(width: Int, height: Int) -> WKWebView {
    // Far to the left of and below every screen.
    let screens = NSScreen.screens.reduce(NSRect.zero) { $0.union($1.frame) }
    let frame = NSRect(x: screens.minX - CGFloat(width) - 5000, y: screens.minY - CGFloat(height) - 5000, width: CGFloat(width), height: CGFloat(height))
    if let window, let web {
      if web.frame.size != frame.size { window.setFrame(frame, display: false); web.frame = NSRect(origin: .zero, size: frame.size) }
      window.orderBack(nil)
      return web
    }
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.suppressesIncrementalRendering = true
    config.defaultWebpagePreferences.allowsContentJavaScript = false
    if #available(macOS 14.0, *) { config.preferences.inactiveSchedulingPolicy = .none }
    let web = WKWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)
    web.navigationDelegate = self
    let window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false; window.ignoresMouseEvents = true; window.hasShadow = false; window.isExcludedFromWindowsMenu = true
    window.collectionBehavior = [.transient, .ignoresCycle]
    window.contentView = web
    window.setFrame(frame, display: false)
    window.orderBack(nil)
    self.window = window; self.web = web
    return web
  }
  // The window leaves the window list when nothing renders for a while (it is never closed: closing the app's only
  // ordered-in window would count as closing the last window).
  private func scheduleRelease() {
    generation += 1
    let current = generation
    Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: 20_000_000_000)
      guard let self, self.generation == current, !self.busy else { return }
      self.web?.navigationDelegate = nil
      self.window?.contentView = nil
      self.window?.orderOut(nil)
      self.window = nil; self.web = nil
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded?(.success(())); loaded = nil }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loaded?(.failure(error)); loaded = nil }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loaded?(.failure(error)); loaded = nil }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loaded?(.failure(APIError(500, "render_crashed", "The slide renderer stopped. Render again."))); loaded = nil }

  // Calls `body` with a completion that may be called once; after `seconds` the wait ends with an error instead.
  private func until<T>(_ seconds: Double, _ message: String, _ body: (@escaping (Result<T, Error>) -> Void) -> Void) async throws -> T {
    try await withCheckedThrowingContinuation { (c: CheckedContinuation<T, Error>) in
      var finished = false
      let done: (Result<T, Error>) -> Void = { r in
        guard !finished else { return }
        finished = true; c.resume(with: r)
      }
      body(done)
      DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { done(.failure(APIError(504, "render_timeout", message))) }
    }
  }

  // An exact width × height sRGB bitmap (opaque, white underneath).
  nonisolated static func redraw(width: Int, height: Int, _ draw: (CGContext) -> Void) -> CGImage? {
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
          let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return nil }
    ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.interpolationQuality = .high
    draw(ctx)
    return ctx.makeImage()
  }
  // Blank: every pixel (sampled on a small copy) has about the same brightness.
  nonisolated static func isBlank(_ image: CGImage) -> Bool {
    let w = 54, h = image.height * 54 / max(image.width, 1)
    guard h > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
          let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue),
          let data = ctx.data else { return true }
    ctx.interpolationQuality = .medium
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    let p = data.bindMemory(to: UInt8.self, capacity: w * h * 4)
    var lo = 255.0, hi = 0.0, sum = 0.0, sq = 0.0
    for i in 0..<(w * h) {
      let y = 0.2126 * Double(p[i * 4]) + 0.7152 * Double(p[i * 4 + 1]) + 0.0722 * Double(p[i * 4 + 2])
      lo = min(lo, y); hi = max(hi, y); sum += y; sq += y * y
    }
    let n = Double(w * h), variance = sq / n - (sum / n) * (sum / n)
    return hi - lo < 8 || variance < 2
  }
  nonisolated static func png(_ image: CGImage) throws -> Data {
    let out = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil) else { throw APIError(500, "png_failed", "The PNG could not be written.") }
    CGImageDestinationAddImage(dest, image, [kCGImagePropertyDPIWidth: 72, kCGImagePropertyDPIHeight: 72] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw APIError(500, "png_failed", "The PNG could not be written.") }
    return out as Data
  }
}
