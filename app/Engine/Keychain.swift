// API keys (Composio, Zernio, ElevenLabs, Apify, Groq, TypeSafe, the student's own named keys) live in the macOS Keychain, never in files: all of them in one Keychain item, read
// once at launch and then kept in memory. After an app update macOS may ask once to let the new version read it.
import Foundation
import Security

enum Keychain {
  private static let service = Paths.keychainService ?? AppInfo.bundleID + ".keys"
  private static let account = "keys"
  private static let lock = NSLock()
  private static var cache: [String: String]?

  private static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] }
  private static func load() -> [String: String] {
    var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data,
          let values = try? JSONSerialization.jsonObject(with: d) as? [String: String] else { return [:] }
    return values
  }
  private static func save(_ values: [String: String]) -> Bool {
    SecItemDelete(query as CFDictionary)
    if values.isEmpty { return true }
    guard let data = try? JSONSerialization.data(withJSONObject: values) else { return false }
    var add = query; add[kSecValueData as String] = data; add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }
  // Reads the Keychain once (called at launch, so a one-time macOS prompt appears right away, not mid-task).
  static func warmUp() { lock.lock(); if cache == nil { cache = load() }; lock.unlock() }
  static func get(_ name: String) -> String? {
    lock.lock(); defer { lock.unlock() }
    if cache == nil { cache = load() }
    return cache?[name]
  }
  @discardableResult static func set(_ name: String, _ value: String?) -> Bool {
    lock.lock(); defer { lock.unlock() }
    var values = cache ?? load()
    if let value, !value.isEmpty { values[name] = value } else { values[name] = nil }
    let ok = save(values); cache = values; return ok
  }
  // The names of the stored keys (never their values).
  static func names() -> [String] { lock.lock(); defer { lock.unlock() }; if cache == nil { cache = load() }; return (cache ?? [:]).keys.sorted() }
}

// Every key name the app stores, in one place. Named keys from the student's key vault use "vault:<NAME>",
// API keys for an AI tool (instead of its subscription) use "apikey:<runtime>".
enum KeyName {
  static let composio = "composio", composioUser = "composio-user", zernio = "zernio"
  static let elevenlabs = "elevenlabs", apify = "apify", groq = "groq", typesafe = "typesafe"
  static func apiKey(_ runtime: String) -> String { "apikey:" + runtime }
  static func vault(_ name: String) -> String { "vault:" + name }
}
