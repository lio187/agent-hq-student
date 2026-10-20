// Where the app reads and writes on this Mac. The test build can point every location at a stand-in (a fake home,
// its own data folder and Keychain entry), so tests never touch the real configuration of the AI tools. In a release
// build every switch below is off and none of their names is part of the app.
import Foundation

enum Paths {
  #if DEBUG
  static func env(_ name: String) -> String? {
    if let v = ProcessInfo.processInfo.environment[name], !v.isEmpty { return v }
    return nil
  }
  #endif
  // The student's home folder, as the AI tools see it (~/.claude, ~/.codex, ~/.hermes, skills folders).
  static var home: String {
    #if DEBUG
    if let v = env("HQS_HOME_OVERRIDE") { return v }
    #endif
    return NSHomeDirectory()
  }
  static func inHome(_ rel: String) -> String { home + "/" + rel }
  // Test-build switches.
  static var noTerminal: Bool {
    #if DEBUG
    return env("HQS_NO_TERMINAL") == "1"
    #else
    return false
    #endif
  }
  static var headless: Bool {
    #if DEBUG
    return env("HQS_HEADLESS") == "1"
    #else
    return false
    #endif
  }
  // Services point at local stand-ins (so downloads from 127.0.0.1 are allowed).
  static var standIns: Bool {
    #if DEBUG
    return env("HQS_COMPOSIO_BASE") != nil
    #else
    return false
    #endif
  }
  static var supportDirOverride: String? {
    #if DEBUG
    return env("HQS_SUPPORT_DIR")
    #else
    return nil
    #endif
  }
  static var keychainService: String? {
    #if DEBUG
    return env("HQS_KEYCHAIN_SERVICE")
    #else
    return nil
    #endif
  }
}
