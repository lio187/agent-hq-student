// Voice Mode with the student's own ElevenLabs key: speech to text (realtime, while the student talks), the Chief's
// answer on the student's own AI tool (a normal conversation turn), and text to speech for the answer.
// The key stays in the Keychain and is never logged or returned. Audio is relayed as it comes, never stored.
import Foundation

enum VoiceAPI {
  static let doc = DocStore.named("voice")
  // Fast speech for a live call; realtime transcription that ends a turn after a short pause.
  static let ttsModel = "eleven_flash_v2_5", sttModel = "scribe_v2_realtime", silenceSeconds = 1.0
  static let languages = ["nl", "en", "auto"]
  static var base: String { Net.base("ELEVENLABS", "https://api.elevenlabs.io") }
  static var wsBase: String { Net.base("ELEVENLABS_WS", "wss://api.elevenlabs.io") }
  // Its own session: a call can last long, and while the Chief speaks the microphone pauses (no traffic for a while).
  static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral; c.timeoutIntervalForRequest = 900; c.timeoutIntervalForResource = 4 * 3600
    c.httpAdditionalHeaders = ["User-Agent": "187N-Agent-HQ/" + AppInfo.version]
    return URLSession(configuration: c)
  }()

  // MARK: settings ({voiceId, voiceName, language, enabled})
  static var settings: J { doc.value("settings") as? J ?? [:] }
  static var key: String? { Keychain.get(KeyName.elevenlabs).flatMap { $0.isEmpty ? nil : $0 } }
  static var voiceID: String { settings["voiceId"] as? String ?? "" }
  static var voiceName: String { settings["voiceName"] as? String ?? "" }
  static var language: String { pick(settings["language"]) ?? "en" }
  static func pick(_ language: Any?) -> String? { (language as? String).flatMap { languages.contains($0) ? $0 : nil } }
  static var enabled: Bool { settings["enabled"] as? Bool ?? false }
  // A key, a chosen voice, and Voice Mode switched on.
  static var ready: Bool { key != nil && enabled && !voiceID.isEmpty }
  static var reason: String {
    if key == nil { return "Add your ElevenLabs key in Setup, then Voice." }
    if voiceID.isEmpty { return "Choose a voice in Setup, then Voice." }
    if !enabled { return "Voice Mode is off. Turn it on in Setup, then Voice." }
    return ""
  }
  // What Setup shows (also part of GET /api/student/state as "voice").
  static var summary: J {
    ["key": key != nil, "voiceId": voiceID, "voiceName": voiceName, "language": language, "enabled": enabled, "ready": ready, "reason": reason,
     "model": ttsModel, "transcription": sttModel]
  }
  static var firstName: String { License.current.flatMap { $0.name.split(separator: " ").first.map(String.init) } ?? "" }

  // MARK: key check (free: lists the voices)
  static func validateKey(_ key: String) async throws { _ = try await get("/v1/voices", key: key) }

  // MARK: /api/hq/v1/voice/… (the office)
  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    guard path.hasPrefix("voice/") else { return nil }
    switch (method, path) {
    case ("GET", "voice/status"):
      let chief = router.agent(r.query["profile"] ?? "chief")
      return ["ready": ready, "voice_id": voiceID, "name": voiceName.isEmpty ? "Voice" : voiceName, "model": ttsModel, "transcription": sttModel, "language": language,
              "silence_seconds": silenceSeconds, "runtime": router.runtimeName(chief?["runtime"] as? String ?? "claude"), "profile": chief?["id"] as? String ?? "chief",
              "reason": reason, "first_name": firstName, "observed_at": now()]
    case ("POST", "voice/speak"):
      guard ready else { throw APIError(409, "voice_not_ready", reason) }
      return try await speech(r.json["text"] as? String ?? "", voice: voiceID)
    default: return nil
    }
  }

  // MARK: /api/student/voice/… (Setup)
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    guard path.hasPrefix("voice/") else { return nil }
    let body = r.json
    switch (method, path) {
    case ("GET", "voice/settings"): return summary
    case ("GET", "voice/voices"): return try await voices()
    case ("POST", "voice/settings"): return try save(body)
    case ("POST", "voice/test"):
      // Speaks one short sentence: this uses ElevenLabs credits, so only a click on "Test my voice" calls it.
      let v = (body["voiceId"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? voiceID
      guard validVoice(v), !v.isEmpty else { throw APIError(422, "no_voice", "Choose a voice first.") }
      let lang = pick(body["language"]) ?? language
      let name = firstName
      let text = lang == "nl" ? "Hoi\(name.isEmpty ? "" : " " + name). Ik ben je Chief of Staff. Zo klink ik in 187N Agent HQ."
                              : "Hi\(name.isEmpty ? "" : " " + name). I am your Chief of Staff. This is how I sound in 187N Agent HQ."
      return try await speech(text, voice: v)
    default: return nil
    }
  }

  static func validVoice(_ id: String) -> Bool { id.range(of: "^[A-Za-z0-9_-]{0,64}$", options: .regularExpression) != nil }

  static func save(_ body: J) throws -> J {
    var s = settings
    if let v = body["voiceId"] as? String {
      guard validVoice(v) else { throw APIError(422, "bad_voice", "Choose a voice from the list.") }
      s["voiceId"] = v
      if v.isEmpty { s["voiceName"] = "" }
    }
    if let n = body["voiceName"] as? String { s["voiceName"] = String(n.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) }
    if let l = body["language"] as? String {
      guard languages.contains(l) else { throw APIError(422, "bad_language", "Choose Dutch, English or automatic.") }
      s["language"] = l
    }
    if let e = body["enabled"] as? Bool { s["enabled"] = e }
    doc.setValue("settings", s)
    return summary
  }

  static func voices() async throws -> [J] {
    guard let key else { throw APIError(409, "no_key", "Add your ElevenLabs key first.") }
    let j = try await get("/v1/voices", key: key)
    let own: Set<String> = ["cloned", "generated", "professional"]
    let list: [J] = (j["voices"] as? [J] ?? []).compactMap { v in
      guard let id = v["voice_id"] as? String, validVoice(id), !id.isEmpty else { return nil }
      let labels = v["labels"] as? J ?? [:]
      let about = ["accent", "gender", "age", "descriptive", "description", "use_case"].compactMap { labels[$0] as? String }.filter { !$0.isEmpty }.prefix(3).joined(separator: " · ")
      return ["id": id, "name": v["name"] as? String ?? "Voice", "category": v["category"] as? String ?? "", "preview_url": orNull(v["preview_url"] as? String), "about": about,
              "own": own.contains(v["category"] as? String ?? "")]
    }
    // The student's own voices first, then ElevenLabs' voices, each by name.
    return list.sorted { a, b in
      let ao = a["own"] as? Bool == true, bo = b["own"] as? Bool == true
      if ao != bo { return ao }
      return (a["name"] as? String ?? "").localizedCaseInsensitiveCompare(b["name"] as? String ?? "") == .orderedAscending
    }
  }

  // MARK: ElevenLabs over HTTPS
  static func get(_ path: String, key: String) async throws -> J {
    guard let url = URL(string: base + path) else { throw APIError(500, "bad_url", "Bad address.") }
    var req = URLRequest(url: url); req.timeoutInterval = 20
    req.setValue(key, forHTTPHeaderField: "xi-api-key"); req.setValue("application/json", forHTTPHeaderField: "Accept")
    let (data, response): (Data, URLResponse)
    do { (data, response) = try await session.data(for: req) } catch { throw offline }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else { throw problem(status, data) }
    return (try? JSONSerialization.jsonObject(with: data)) as? J ?? [:]
  }
  static var offline: APIError { APIError(502, "offline", "No connection to ElevenLabs. Check your internet connection.") }

  // Speech as it is made: 24 kHz 16-bit mono PCM, passed on piece by piece (the page plays it while it arrives).
  static func speech(_ text: String, voice: String) async throws -> HTTPResponse {
    guard let key else { throw APIError(409, "no_key", "Add your ElevenLabs key in Setup, then Voice.") }
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty else { throw APIError(422, "bad_request", "There is nothing to say.") }
    guard !voice.isEmpty, validVoice(voice), let url = URL(string: base + "/v1/text-to-speech/" + voice + "/stream?output_format=pcm_24000") else {
      throw APIError(422, "no_voice", "Choose a voice in Setup, then Voice.")
    }
    var req = URLRequest(url: url); req.httpMethod = "POST"; req.timeoutInterval = 30
    req.setValue(key, forHTTPHeaderField: "xi-api-key"); req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["text": String(t.prefix(4000)), "model_id": ttsModel])
    let (bytes, response): (URLSession.AsyncBytes, URLResponse)
    do { (bytes, response) = try await session.bytes(for: req) } catch { throw offline }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      var body = Data()
      do { for try await b in bytes { body.append(b); if body.count > 16384 { break } } } catch {}
      throw problem(status, body)
    }
    var res = HTTPResponse.streamed(type: "audio/pcm") { write in
      var piece = Data(); piece.reserveCapacity(4096)
      do {
        for try await b in bytes {
          piece.append(b)
          if piece.count >= 4096 { await write(piece); piece.removeAll(keepingCapacity: true) }
        }
      } catch {}
      if !piece.isEmpty { await write(piece) }
    }
    res.headers["X-Audio-Sample-Rate"] = "24000"
    return res
  }

  // ElevenLabs answers errors as {"detail": {"status": "<code>", "message": "…"}}; the student gets a sentence they can act on.
  static func problem(_ status: Int, _ body: Data) -> APIError {
    let j = (try? JSONSerialization.jsonObject(with: body)) as? J ?? [:]
    let detail = j["detail"] as? J ?? [:]
    let code = ((detail["status"] as? String) ?? (detail["code"] as? String) ?? "").lowercased()
    if code.contains("permission") {
      return APIError(422, "missing_permissions", "This ElevenLabs key is missing a permission. In ElevenLabs, give the key access to Text to Speech, Speech to Text and Voices (read).")
    }
    if code.contains("quota") || status == 402 {
      return APIError(402, "quota_exceeded", "Your ElevenLabs account has no credits left for this. Check your plan on elevenlabs.io.")
    }
    if status == 401 || status == 403 || code.contains("api_key") {
      return APIError(422, "invalid_key", "ElevenLabs did not accept this key. Check that you copied all of it, or create a new key.")
    }
    if status == 404 || code.contains("voice_not_found") {
      return APIError(422, "voice_not_found", "ElevenLabs cannot find this voice. Choose another one in Setup, then Voice.")
    }
    if status == 429 || code.contains("rate") || code.contains("concurrent") {
      return APIError(503, "busy", "ElevenLabs is busy. Try again in a moment.")
    }
    return APIError(502, "elevenlabs_error", "ElevenLabs could not do this right now (\(status)). Try again in a moment.")
  }

  // MARK: the microphone stream (WebSocket /api/hq/v1/voice/listen)
  private static let relayLock = NSLock()
  private static var relay: VoiceRelay?
  // One call at a time; refused (nil) when Voice Mode is not ready or a call is already open.
  static func attach(_ r: HTTPRequest, _ client: WSClient) -> (() -> Void)? {
    guard ready, let key else { return nil }
    var c = URLComponents(string: wsBase + "/v1/speech-to-text/realtime")
    var q = [URLQueryItem(name: "model_id", value: sttModel), URLQueryItem(name: "audio_format", value: "pcm_16000"), URLQueryItem(name: "commit_strategy", value: "vad"),
             URLQueryItem(name: "vad_silence_threshold_secs", value: String(silenceSeconds))]
    if language != "auto" { q.append(URLQueryItem(name: "language_code", value: language)) }
    c?.queryItems = q
    guard let url = c?.url else { return nil }
    var req = URLRequest(url: url); req.setValue(key, forHTTPHeaderField: "xi-api-key")
    relayLock.lock(); defer { relayLock.unlock() }
    guard relay == nil else { return nil }
    let s = VoiceRelay(client: client, request: req)
    relay = s
    return { s.open() }
  }
  static func ended(_ s: VoiceRelay) { relayLock.lock(); if relay === s { relay = nil }; relayLock.unlock() }

  // What a failed transcription means for the student.
  static func sttMessage(_ kind: String) -> String {
    switch kind {
    case "auth_error": return "ElevenLabs did not accept your key. Check it in Setup, then Voice."
    case "quota_exceeded": return "Your ElevenLabs account has no credits left for speech to text."
    case "unaccepted_terms": return "Accept the speech-to-text terms in your ElevenLabs account first."
    case "rate_limited", "queue_overflow", "resource_exhausted", "commit_throttled": return "ElevenLabs is busy. Start again in a moment."
    case "session_time_limit_exceeded": return "This call reached ElevenLabs' time limit. Start again to continue."
    case "insufficient_audio_activity": return "No speech was heard for a while, so the call stopped. Start again when you are ready."
    default: return "ElevenLabs could not transcribe this call. Start again or continue in text."
    }
  }
}

// One live call: the page's 16 kHz PCM frames go to ElevenLabs' realtime transcription as base64 audio chunks; its
// session, partial and committed transcripts come back to the page as {type, text}; a failure as {type: "error", message}.
final class VoiceRelay {
  private let client: WSClient
  private let task: URLSessionWebSocketTask
  private let lock = NSLock()
  private var closed = false, started = false
  init(client: WSClient, request: URLRequest) {
    self.client = client
    task = VoiceAPI.session.webSocketTask(with: request)
    task.maximumMessageSize = 1 << 20
  }
  private var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return closed }

  func open() {
    client.onClose = { [weak self] in self?.finish(pageGone: true) }
    client.onMessage = { [weak self] opcode, data in self?.fromPage(opcode, data) }
    task.resume()
    receive()
  }

  private func fromPage(_ opcode: UInt8, _ data: Data) {
    if opcode == 0x2 {
      // 16-bit samples only, at most about half a second per frame.
      guard !data.isEmpty, data.count <= 16384, data.count % 2 == 0 else { client.close(code: 1008); return }
      send(["message_type": "input_audio_chunk", "audio_base_64": data.base64EncodedString(), "commit": false, "sample_rate": 16000])
    } else if opcode == 0x1, let j = (try? JSONSerialization.jsonObject(with: data)) as? J, j["action"] as? String == "commit" {
      send(["message_type": "input_audio_chunk", "audio_base_64": "", "commit": true, "sample_rate": 16000])
    }
  }

  private func send(_ message: J) {
    guard !isClosed else { return }
    task.send(.string(jsonString(message))) { [weak self] error in
      if error != nil { self?.failed() }
    }
  }

  private func receive() {
    task.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure: self.failed()
      case .success(let message):
        switch message {
        case .string(let s): self.fromService(s)
        case .data(let d): if let s = String(data: d, encoding: .utf8) { self.fromService(s) }
        @unknown default: break
        }
        if !self.isClosed { self.receive() }
      }
    }
  }

  private func fromService(_ text: String) {
    guard let j = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? J else { return }
    let kind = j["message_type"] as? String ?? ""
    switch kind {
    case "session_started", "partial_transcript", "committed_transcript":
      if kind == "session_started" { lock.lock(); started = true; lock.unlock() }
      guard !isClosed else { return }
      client.send(text: jsonString(["type": kind, "text": j["text"] as? String ?? ""]))
    case "warning", "committed_transcript_with_timestamps", "committed_transcript_entities", "edited_transcript": break
    default: fail(VoiceAPI.sttMessage(kind))
    }
  }

  // The connection to ElevenLabs failed or closed without saying why.
  private func failed() {
    guard !isClosed else { return }
    let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    lock.lock(); let wasStarted = started; lock.unlock()
    fail(status == 401 || status == 403 ? VoiceAPI.sttMessage("auth_error")
         : wasStarted ? "The connection to ElevenLabs closed. Start again or continue in text." : "Could not reach ElevenLabs. Check your internet connection.")
  }

  private func fail(_ message: String) {
    guard !isClosed else { return }
    client.send(text: jsonString(["type": "error", "message": message]))
    finish(pageGone: false)
  }

  func finish(pageGone: Bool) {
    lock.lock(); if closed { lock.unlock(); return }; closed = true; lock.unlock()
    task.cancel(with: .normalClosure, reason: nil)
    if !pageGone { client.close() }
    VoiceAPI.ended(self)
  }
}
