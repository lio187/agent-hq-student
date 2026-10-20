// 187N Agent HQ (student edition): a native macOS app. The dashboard, the setup wizard and the engine all live
// inside the app; the student connects their own agents, apps and social accounts without writing code.
import Cocoa
import WebKit
import UniformTypeIdentifiers

enum AppInfo {
  static let name = "187N Agent HQ"
  static let bundleID = Bundle.main.bundleIdentifier ?? "ai.187n.agent-hq.student"
  // From the shared VERSION file, compiled in by build-tools/pack.mjs (the bundle's Info.plist gets the same value).
  static let version = BuildInfo.version
  #if DEBUG
  static let supportFolder = "187N Agent HQ (test build)"
  #else
  static let supportFolder = "187N Agent HQ"
  #endif
}
let canvas = NSColor(srgbRed: 0.031, green: 0.035, blue: 0.039, alpha: 1)

final class App: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  let server = HTTPServer()
  let router = Router()
  var base: URL { URL(string: "http://127.0.0.1:\(router.port)")! }

  func applicationDidFinishLaunching(_ notification: Notification) {
    // The sealed dashboard must be exactly the one this app was built with.
    do { router.files = try Pak.load() } catch {
      let a = NSAlert(); a.messageText = "\(AppInfo.name) cannot open"
      a.informativeText = "This copy of the app is damaged or was changed. Download \(AppInfo.name) again and replace it in Applications."
      a.alertStyle = .critical; a.runModal(); NSApp.terminate(nil); return
    }
    buildMenu()
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = AppInfo.name; window.minSize = NSSize(width: 980, height: 640)
    window.titlebarAppearsTransparent = true; window.backgroundColor = canvas; window.appearance = NSAppearance(named: .darkAqua)
    window.delegate = self; window.center(); window.setFrameAutosaveName("AgentHQStudentMain"); window.tabbingMode = .disallowed
    window.isRestorable = false  // no "reopen windows?" prompt after a crash or a forced quit

    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.applicationNameForUserAgent = "187N-Agent-HQ/" + AppInfo.version
    config.preferences.isElementFullscreenEnabled = true
    config.userContentController.add(self, name: "hq")
    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self; web.uiDelegate = self
    web.allowsMagnification = true; web.allowsBackForwardNavigationGestures = false
    web.underPageBackgroundColor = canvas
    #if DEBUG
    if #available(macOS 13.3, *) { web.isInspectable = true }
    #endif
    window.contentView = web
    if !Paths.headless { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }

    router.openExternal = { url in if let u = URL(string: url) { DispatchQueue.main.async { NSWorkspace.shared.open(u) } } }
    server.handle = { [router] req in await router.handle(req) }
    server.upgrade = { [router] req, client in
      guard req.cookie("hqs") == router.token, req.headers["origin"] == "http://127.0.0.1:\(router.port)", req.headers["host"] == "127.0.0.1:\(router.port)" else { return nil }
      switch req.path {
      case "/api/hq/v1/chat":
        let after = Int(req.query["after"] ?? "0") ?? 0
        return { Store.shared.attach(client, after: after) }
      case "/api/hq/v1/voice/listen":
        guard License.current.map({ !$0.isExpired }) == true else { return nil }
        return VoiceAPI.attach(req, client)
      default: return nil
      }
    }
    var fixedPort: UInt16 = 0
    #if DEBUG
    fixedPort = UInt16(ProcessInfo.processInfo.environment["HQS_TEST_PORT"] ?? "") ?? 0
    #endif
    server.start(port: fixedPort, ready: { [weak self] port in
      DispatchQueue.main.async {
        guard let self else { return }
        self.router.port = port
        #if DEBUG
        if let f = ProcessInfo.processInfo.environment["HQS_TEST_TOKEN_FILE"] { try? self.router.token.write(toFile: f, atomically: true, encoding: .utf8) }
        #endif
        self.router.startScheduler()
        DispatchQueue.global().async { Keychain.warmUp() }
        DispatchQueue.global().async { Shell.loadLoginPath(); _ = Agents.detect(force: true) }
        DispatchQueue.global().async { Knowledge.shared.index() }
        Ext.launch(self.router)
        self.web.load(URLRequest(url: URL(string: "\(self.base)/launch?t=\(self.router.token)")!))
      }
    }, failed: { error in
      DispatchQueue.main.async { let a = NSAlert(); a.messageText = "\(AppInfo.name) could not start"; a.informativeText = error.localizedDescription; a.runModal(); NSApp.terminate(nil) }
    })
  }

  // MARK: page ↔ app messages (folder picker, links)
  func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.request.url?.host == "127.0.0.1", let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "pickFolder", "pickFile":
      // A folder (workspace, notes, a skill) or a file (a logo or a font for the brand kit); the page gets the path back.
      let purpose = body["purpose"] as? String ?? "folder", file = type == "pickFile"
      let panel = NSOpenPanel(); panel.canChooseDirectories = !file; panel.canChooseFiles = file; panel.allowsMultipleSelection = false; panel.canCreateDirectories = !file
      if file, let types = body["types"] as? [String], !types.isEmpty { panel.allowedContentTypes = types.compactMap { UTType(filenameExtension: $0) } }
      panel.prompt = "Choose"
      panel.message = body["message"] as? String ?? (purpose == "notes" ? "Choose the folder with your notes (for example your Obsidian vault)." : file ? "Choose a file." : "Choose the folder your agents work in.")
      panel.beginSheetModal(for: window) { [weak self] r in
        let path = r == .OK ? (panel.url?.path ?? "") : ""
        self?.web.evaluateJavaScript("window.hqPicked && window.hqPicked(\(jsonString(purpose)), \(jsonString(path)))")
      }
    case "open": if let s = body["url"] as? String, let u = URL(string: s), ["https", "http", "obsidian"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
    case "openTerminal": NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"))
    default: break
    }
  }

  // MARK: navigation: the window stays on the app; other sites open in the browser
  func isApp(_ url: URL?) -> Bool { url?.host == "127.0.0.1" && url?.port == Int(router.port) }
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if action.shouldPerformDownload { decisionHandler(.download); return }
    let url = action.request.url
    if action.targetFrame?.isMainFrame == false || isApp(url) || ["about", "blob", "data"].contains(url?.scheme ?? "") { decisionHandler(.allow); return }
    if let url, ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
    decisionHandler(.cancel)
  }
  func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    decisionHandler(response.canShowMIMEType ? .allow : .download)
  }
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url { if isApp(url) { webView.load(URLRequest(url: url)) } else { NSWorkspace.shared.open(url) } }
    return nil
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    #if DEBUG
    guard let out = Paths.env("HQS_SELFTEST_FILE"), isApp(webView.url) else { return }
    let js = "return {url: location.pathname, secure: window.isSecureContext, media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), worklet: typeof AudioWorkletNode !== 'undefined', audio: typeof AudioContext !== 'undefined', ws: typeof WebSocket !== 'undefined', fonts: !!document.fonts}"
    webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
      if case let .success(v) = result, let d = v as? [String: Any] { try? jsonString(d).write(toFile: out, atomically: true, encoding: .utf8) }
    }
    #endif
  }
  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let a = NSAlert(); a.messageText = AppInfo.name; a.informativeText = message; a.runModal(); completionHandler()
  }
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let a = NSAlert(); a.messageText = AppInfo.name; a.informativeText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
    completionHandler(a.runModal() == .alertFirstButtonReturn)
  }
  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = parameters.allowsDirectories
    panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
  }
  @available(macOS 12.0, *)
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    // Voice Mode: the microphone only, and only for the app's own page (macOS asks the student once).
    decisionHandler(origin.protocol == "http" && origin.host == "127.0.0.1" && origin.port == Int(router.port) && type == .microphone ? .grant : .deny)
  }
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    let base = (suggestedFilename as NSString).deletingPathExtension, ext = (suggestedFilename as NSString).pathExtension
    var target = folder.appendingPathComponent(suggestedFilename), n = 1
    while FileManager.default.fileExists(atPath: target.path) { n += 1; target = folder.appendingPathComponent(base + " " + String(n) + (ext.isEmpty ? "" : "." + ext)) }
    completionHandler(target)
  }

  // MARK: window and menu
  func windowWillClose(_ note: Notification) { NSApp.terminate(nil) }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
  func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }
  func applicationWillTerminate(_ notification: Notification) { _ = try? await_stopAll(); Store.shared.save(); DocStore.flushAll() }
  func await_stopAll() throws { _ = router.hqStopAll() }
  @objc func reload() { web.reload() }
  @objc func openSetup() { web.load(URLRequest(url: base.appendingPathComponent("setup"))) }
  @objc func openOffice() { web.load(URLRequest(url: base)) }
  @objc func zoomIn() { web.pageZoom = min(2, web.pageZoom + 0.1) }
  @objc func zoomOut() { web.pageZoom = max(0.5, web.pageZoom - 0.1) }
  @objc func actualSize() { web.pageZoom = 1 }
  // The same as the Windows app's menu item: the Updates page, and a check right away.
  @objc func checkForUpdates() {
    if let u = URL(string: "\(base)/#workspace/updates") { web.load(URLRequest(url: u)) }
    Task { await UpdatesAPI.check(manual: true) }
  }
  @objc func showAbout() {
    let licence = License.current.map { "Licensed to \($0.name)" } ?? "Not activated"
    NSApp.orderFrontStandardAboutPanel(options: [.applicationName: AppInfo.name, .applicationVersion: AppInfo.version, .credits: NSAttributedString(string: licence + "\n© 187N. All rights reserved. 187N and the 187N logo are trademarks of 187N.")])
  }

  func buildMenu() {
    let bar = NSMenu()
    func menu(_ title: String, _ items: [NSMenuItem]) { let top = NSMenuItem(); let m = NSMenu(title: title); items.forEach { m.addItem($0) }; top.submenu = m; bar.addItem(top) }
    func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
      let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; i.target = target; return i
    }
    menu(AppInfo.name, [item("About \(AppInfo.name)", #selector(showAbout), target: self), item("Check for Updates…", #selector(checkForUpdates), target: self), .separator(), item("Setup…", #selector(openSetup), ",", target: self), .separator(),
                        item("Hide \(AppInfo.name)", #selector(NSApplication.hide(_:)), "h"), item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
                        item("Show All", #selector(NSApplication.unhideAllApplications(_:))), .separator(), item("Quit \(AppInfo.name)", #selector(NSApplication.terminate(_:)), "q")])
    menu("Edit", [item("Undo", Selector(("undo:")), "z"), item("Redo", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                  item("Cut", #selector(NSText.cut(_:)), "x"), item("Copy", #selector(NSText.copy(_:)), "c"), item("Paste", #selector(NSText.paste(_:)), "v"), item("Select All", #selector(NSText.selectAll(_:)), "a")])
    menu("View", [item("Office", #selector(openOffice), "o", [.command, .shift], target: self), item("Reload", #selector(reload), "r", target: self), .separator(),
                  item("Actual Size", #selector(actualSize), "0", target: self), item("Zoom In", #selector(zoomIn), "=", target: self), item("Zoom Out", #selector(zoomOut), "-", target: self), .separator(),
                  item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])])
    let windowMenu = NSMenu(title: "Window")
    [item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"), item("Zoom", #selector(NSWindow.performZoom(_:)))].forEach { windowMenu.addItem($0) }
    let windowTop = NSMenuItem(); windowTop.submenu = windowMenu; bar.addItem(windowTop); NSApp.windowsMenu = windowMenu
    NSApp.mainMenu = bar
  }
}

extension Router {
  func hqStopAll() -> Int { (try? stopEverything()) ?? 0 }
  private func stopEverything() throws -> Int { var n = 0; for run in store.list("runs") where (run["status"] as? String) == "running" { if stopRun(run["id"] as! String) { n += 1 } }; return n }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
