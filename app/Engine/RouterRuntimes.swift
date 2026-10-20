// Signing in to Claude Code, Codex and Hermes Agent with the student's own subscription (or an API key instead).
// Install and Sign in open the official command in Terminal; the app then checks every 3 s (for up to 10 minutes)
// and notices by itself when the tool is installed or signed in. The status pages read is cached (Agents), so a page
// never waits for the command-line tools.
//   /api/student/runtimes/status (GET), runtimes/login, runtimes/install, runtimes/terminal, runtimes/apikey (POST)
//   /api/hq/v1/runtimes/status (GET), integrations (GET, the runtime entries), integrations/runtime:<id>/reconnect (POST)
import Foundation

enum RuntimesAPI {
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    if method == "GET" && path == "runtimes/status" { return statusList() }
    // The Connections page: the runtime entries carry the account line and offer Reconnect (= sign in again).
    if method == "GET" && path == "integrations" {
      let base = await router.integrations().filter { !(($0["id"] as? String) ?? "").hasPrefix("runtime:") }
      return base + integrationEntries()
    }
    if method == "POST" && path.hasPrefix("integrations/") {
      let parts = path.split(separator: "/").map { String($0).removingPercentEncoding ?? String($0) }
      guard parts.count == 3, parts[1].hasPrefix("runtime:"), parts[2] == "reconnect" else { return nil }
      return try reconnect(String(parts[1].dropFirst(8)))
    }
    return nil
  }

  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    let body = r.json
    switch (method, path) {
    case ("GET", "runtimes/status"): return statusList()
    case ("POST", "runtimes/login"): return try start(runtime(body), step: "login")
    case ("POST", "runtimes/install"): return try start(runtime(body), step: "install")
    // The older Setup call: same flow, so it also finishes by itself.
    case ("POST", "runtimes/terminal"): return try start(runtime(body), step: body["step"] as? String == "install" ? "install" : "login")
    case ("POST", "runtimes/apikey"): return try setKey(runtime(body), key: body["key"] as? String, mode: body["mode"] as? String)
    default: return nil
    }
  }

  // MARK: run environment
  // Environment for a run on this runtime: the student's API key, only when they chose API-key mode for it.
  static func runEnv(runtime: String) -> [String: String] {
    guard mode(runtime) == "api-key", let key = Keychain.get(KeyName.apiKey(runtime)), !key.isEmpty else { return [:] }
    return [keyInfo(runtime).env: key]
  }
  // The final environment of a run (or a status check): in subscription mode, a key that would replace the student's
  // subscription is removed, wherever it came from (the app's own environment, the key vault, a caller).
  static func scrub(runtime: String, _ env: [String: String], keyMode: Bool? = nil) -> [String: String] {
    let usesKey = keyMode ?? (mode(runtime) == "api-key" && hasKey(runtime))
    guard !usesKey else { return env }
    var e = env
    switch runtime {
    case "claude": e["ANTHROPIC_API_KEY"] = nil; e["ANTHROPIC_AUTH_TOKEN"] = nil
    case "codex": e["CODEX_API_KEY"] = nil
    default: break
    }
    return e
  }
  // Extra arguments for a run in API-key mode (Hermes reads the OpenRouter key only for the OpenRouter provider).
  static func runArgs(runtime: String) -> [String] {
    runtime == "hermes" && !runEnv(runtime: runtime).isEmpty ? ["--provider", "openrouter"] : []
  }

  // MARK: API-key mode
  struct KeyInfo { let env: String, label: String, provider: String, prefix: String, link: String, pattern: String }
  // Claude Code reads ANTHROPIC_API_KEY. Codex reads CODEX_API_KEY for `codex exec` (it takes precedence over a
  // ChatGPT sign-in). Hermes reads OPENROUTER_API_KEY with --provider openrouter.
  static func keyInfo(_ runtime: String) -> KeyInfo {
    switch runtime {
    case "codex": return KeyInfo(env: "CODEX_API_KEY", label: "OpenAI API key", provider: "OpenAI", prefix: "sk-", link: "https://platform.openai.com/api-keys", pattern: "^sk-(?!ant-|or-)[A-Za-z0-9_-]{20,}$")
    case "hermes": return KeyInfo(env: "OPENROUTER_API_KEY", label: "OpenRouter API key", provider: "OpenRouter", prefix: "sk-or-", link: "https://openrouter.ai/settings/keys", pattern: "^sk-or-[A-Za-z0-9_-]{20,}$")
    default: return KeyInfo(env: "ANTHROPIC_API_KEY", label: "Anthropic API key", provider: "Anthropic", prefix: "sk-ant-", link: "https://console.anthropic.com/settings/keys", pattern: "^sk-ant-[A-Za-z0-9_-]{20,}$")
    }
  }
  private static var store: DocStore { DocStore.named("runtimes") }
  static func mode(_ runtime: String) -> String { ((store.value("modes") as? [String: String]) ?? [:])[runtime] ?? "subscription" }
  static func hasKey(_ runtime: String) -> Bool { !(Keychain.get(KeyName.apiKey(runtime)) ?? "").isEmpty }
  private static func setMode(_ runtime: String, _ m: String) {
    store.write { d in var modes = d["modes"] as? [String: String] ?? [:]; modes[runtime] = m; d["modes"] = modes }
  }
  // {runtime, key?, mode?}: a key is checked and saved (and switches to API-key mode unless mode says otherwise); an
  // empty key removes it (back to the subscription); mode alone switches between subscription and API key.
  static func setKey(_ rt: Runtime, key: String?, mode m: String?) throws -> J {
    if let m, !["subscription", "api-key"].contains(m) { throw APIError(422, "bad_mode", "Choose subscription or API key.") }
    let info = keyInfo(rt.id)
    if let key {
      let k = key.trimmingCharacters(in: .whitespacesAndNewlines)
      if k.isEmpty { Keychain.set(KeyName.apiKey(rt.id), nil); setMode(rt.id, "subscription") }
      else {
        guard k.range(of: info.pattern, options: .regularExpression) != nil else {
          let service = k.hasPrefix("sk-ant-") ? "Anthropic" : k.hasPrefix("sk-or-") ? "OpenRouter" : k.hasPrefix("sk-") ? "OpenAI" : ""
          if !service.isEmpty && service != info.provider {
            throw APIError(422, "wrong_key", "This is an \(service) key. \(rt.name) needs an \(info.label) (it starts with \(info.prefix)).")
          }
          throw APIError(422, "bad_key", "This is not a complete \(info.label). It starts with \(info.prefix) and has no spaces. Copy it again from your \(info.provider) account.")
        }
        guard Keychain.set(KeyName.apiKey(rt.id), k) else { throw APIError(500, "keychain", "The key could not be saved in your Keychain. Try again.") }
        setMode(rt.id, m ?? "api-key")
      }
    } else if let m {
      if m == "api-key" && !hasKey(rt.id) { throw APIError(422, "no_key", "Paste your \(info.label) first.") }
      setMode(rt.id, m)
    } else { throw APIError(422, "bad_request", "Paste a key or choose subscription or API key.") }
    let s = Agents.status(rt.id)
    Store.shared.emit("connector.updated", ["title": rt.name, "runtime": rt.id, "state": s["state"] ?? "", "ready": s["ready"] ?? false])
    return s
  }

  // MARK: sign in and install that finish by themselves
  private static let lock = NSLock()
  private struct Flow { var step: String; var deadline: Double }
  private static var flows: [String: Flow] = [:]
  private static func locked<T>(_ body: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return body() }
  static let pollEvery = 3.0, pollFor = 600.0
  static func pending(_ runtime: String) -> String? { locked { flows[runtime]?.step } }

  // Opens the official command in Terminal and checks every 3 s until the tool is installed (install) or signed in
  // (login), for up to 10 minutes; then the status updates and open pages hear "connector.updated".
  static func start(_ rt: Runtime, step: String) throws -> J {
    let opened = try TerminalStep.open(runtime: rt.id, step: step)
    let first = locked { () -> Bool in let isNew = flows[rt.id] == nil; flows[rt.id] = Flow(step: step, deadline: now() + pollFor); return isNew }
    if first { poll(rt) }
    return ["ok": true, "runtime": rt.id, "step": step, "command": opened["command"] ?? "", "status": Agents.status(rt.id)]
  }
  private static func poll(_ rt: Runtime) {
    DispatchQueue.global().asyncAfter(deadline: .now() + pollEvery) {
      guard let flow = locked({ flows[rt.id] }) else { return }
      let s = Agents.refresh(rt.id)
      let done = flow.step == "install" ? (s["installed"] as? Bool) == true : (s["signedIn"] as? Bool) == true
      if done || now() > flow.deadline {
        // A newer click may have changed the step meanwhile (install, then sign in): keep polling for that one.
        let finished = locked { () -> Bool in guard flows[rt.id]?.step == flow.step else { return false }; flows[rt.id] = nil; return true }
        if finished {
          let final = Agents.status(rt.id)
          Store.shared.emit("connector.updated", ["title": rt.name, "runtime": rt.id, "state": final["state"] ?? "", "ready": final["ready"] ?? false, "step": flow.step, "done": done])
          return
        }
      }
      poll(rt)
    }
  }

  // MARK: Connections page
  static func integrationEntries() -> [J] {
    Agents.detect().map { s in
      let id = s["id"] as? String ?? "", ready = (s["ready"] as? Bool) == true, installed = (s["installed"] as? Bool) == true, account = s["account"] as? String ?? ""
      let pending = s["pending"] as? String
      let reason = ready ? "" : pending == "login" ? "Signing in: finish the steps in Terminal." : pending == "install" ? "Installing: finish the steps in Terminal." : installed ? (s["note"] as? String ?? "") : "Not installed. Click Reconnect to install it, or open Setup."
      return ["id": "runtime:" + id, "name": id, "account": account.isEmpty ? (s["version"] as? String ?? "") : account, "state": ready ? "verified" : installed ? "configured" : "unavailable",
              "verified": ready, "adapter": "local-runtime", "check_available": true, "reconnect_available": !ready, "reason": reason,
              "recovery": ready ? "" : installed ? "Reconnect opens the sign-in in Terminal; this page updates by itself." : "Reconnect opens the official installer in Terminal.",
              "capability": (s["name"] as? String ?? id) + " agent runtime" + ((s["methodLabel"] as? String).flatMap { $0.isEmpty ? nil : " · " + $0 } ?? ""),
              "method": s["method"] ?? "none", "observed_at": now(), "agent_activity": [J](), "departments": [J](), "selected_departments": [J]()] as J
    }
  }
  static func reconnect(_ id: String) throws -> J {
    guard let rt = RUNTIMES.first(where: { $0.id == id }) else { throw APIError(404, "not_found", "Unknown AI tool.") }
    let installed = (Agents.status(id)["installed"] as? Bool) ?? (Shell.which(rt.binary) != nil)
    let step = installed ? "login" : "install"
    _ = try start(rt, step: step)
    let s = Agents.status(id)
    let reason = step == "install"
      ? "Terminal opened with the official installer for \(rt.name). Follow the steps there; 187N Agent HQ notices by itself when it is installed."
      : rt.id == "hermes" ? "Terminal opened with the Hermes setup. Choose your model provider there; 187N Agent HQ notices by itself when it is set up."
      : "Terminal opened with the \(rt.name) sign-in. Sign in with your own account there; 187N Agent HQ notices by itself when you are signed in."
    let account = s["subscriptionAccount"] as? String ?? ""
    return ["reason": reason, "account": account, "url": "", "runtime": id, "step": step, "pending": step, "title": step == "install" ? "Install \(rt.name)" : "Sign in to \(rt.name)"]
  }

  // MARK: helpers
  private static func statusList() -> J { ["runtimes": Agents.detect(), "observed_at": now()] }
  private static func runtime(_ body: J) throws -> Runtime {
    guard let id = body["runtime"] as? String, let rt = RUNTIMES.first(where: { $0.id == id }) else { throw APIError(404, "not_found", "Choose Claude Code, Codex or Hermes Agent.") }
    return rt
  }
}
