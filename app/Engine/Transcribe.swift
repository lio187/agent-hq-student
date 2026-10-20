// Creator Lab: the words of each Reel. The video (or its audio) is downloaded from Instagram's own servers only
// (an allow-list, at most 80 MB), the sound is taken out with AVFoundation, and the audio goes to the student's own
// ElevenLabs (Scribe) or Groq (Whisper) account. None of this runs before the student confirmed an analysis.
import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

struct TranscribeError: Error, LocalizedError {
  let code: String, message: String
  init(_ code: String, _ message: String) { self.code = code; self.message = message }
  var errorDescription: String? { message }
}

enum Transcriber: String, CaseIterable {
  case elevenlabs, groq
  var name: String { self == .groq ? "Groq" : "ElevenLabs" }
  var key: String? { Keychain.get(self == .groq ? KeyName.groq : KeyName.elevenlabs) }
  var model: String { self == .groq ? "whisper-large-v3-turbo" : "scribe_v2" }
  var whereToAdd: String { self == .groq ? "Add your Groq key on the Creator Lab page." : "Add your ElevenLabs key in Setup → Voice." }
}

enum Media {
  static let maxBytes = 80 * 1024 * 1024
  // Instagram's CDNs only; the test build also accepts the local stand-in.
  static func allowed(_ url: URL?) -> Bool {
    guard let url, let host = url.host?.lowercased(), url.user == nil, url.password == nil else { return false }
    if url.scheme == "https", ["cdninstagram.com", "fbcdn.net"].contains(where: { host == $0 || host.hasSuffix("." + $0) }) { return true }
    return Paths.standIns && url.scheme == "http" && host == "127.0.0.1"
  }

  // Downloads to `dest`; every redirect must stay on an allowed host, and the download stops past `maxBytes`.
  static func download(_ raw: String, to dest: URL, maxBytes: Int = maxBytes) async throws {
    guard let url = URL(string: raw), allowed(url) else { throw TranscribeError("not_allowed", "This media address is not on Instagram's servers, so it was not downloaded.") }
    FileManager.default.createFile(atPath: dest.path, contents: nil)
    guard let handle = try? FileHandle(forWritingTo: dest) else { throw TranscribeError("download", "The media could not be saved on this Mac.") }
    defer { try? handle.close() }
    let fetch = Fetch(handle: handle, maxBytes: maxBytes)
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 300
    config.httpAdditionalHeaders = ["User-Agent": "187N-Agent-HQ/" + AppInfo.version]
    let session = URLSession(configuration: config, delegate: fetch, delegateQueue: nil)
    defer { session.invalidateAndCancel() }
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in fetch.start(c, session.dataTask(with: url)) }
    } onCancel: { session.invalidateAndCancel() }
  }

  // The sound as an .m4a file (AVFoundation, no ffmpeg). Returns the duration in seconds when known.
  static func audio(from media: URL, to out: URL) async throws -> Double? {
    let asset = AVURLAsset(url: media)
    let tracks: [AVAssetTrack]
    do { tracks = try await asset.loadTracks(withMediaType: .audio) } catch { throw TranscribeError("media", "This file could not be read as a video.") }
    guard !tracks.isEmpty else { throw TranscribeError("no_audio", "This Reel has no sound, so there is no script to analyse.") }
    guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { throw TranscribeError("audio", "The sound could not be taken out of this Reel.") }
    try? FileManager.default.removeItem(at: out)
    export.outputURL = out; export.outputFileType = .m4a
    let box = ExportBox(export)
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in box.session.exportAsynchronously { c.resume() } }
    guard box.session.status == .completed else { throw TranscribeError("audio", "The sound could not be taken out of this Reel" + (box.session.error.map { ": " + $0.localizedDescription } ?? ".")) }
    guard let duration = try? await asset.load(.duration) else { return nil }
    let seconds = CMTimeGetSeconds(duration)
    return seconds.isFinite && seconds > 0 ? seconds : nil
  }

  // A small JPEG copy of the cover image (so the page never loads Instagram's servers and works after links expire).
  static func thumbnail(_ raw: String, to dest: URL) async -> Bool {
    let part = dest.appendingPathExtension("part")
    defer { try? FileManager.default.removeItem(at: part) }
    do { try await download(raw, to: part, maxBytes: 8 * 1024 * 1024) } catch { return false }
    let options = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 360, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary
    guard let source = CGImageSourceCreateWithURL(part as CFURL, nil), let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options),
          let out = CGImageDestinationCreateWithURL(dest as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return false }
    CGImageDestinationAddImage(out, image, [kCGImageDestinationLossyCompressionQuality: 0.72] as CFDictionary)
    return CGImageDestinationFinalize(out)
  }
}

private final class ExportBox { let session: AVAssetExportSession; init(_ s: AVAssetExportSession) { session = s } }

// One download: writes the body to a file as it arrives, checks redirects against the allow-list, stops at the cap.
private final class Fetch: NSObject, URLSessionDataDelegate {
  private let handle: FileHandle, maxBytes: Int
  private var total = 0, redirects = 0
  private var failure: Error?
  private var continuation: CheckedContinuation<Void, Error>?
  init(handle: FileHandle, maxBytes: Int) { self.handle = handle; self.maxBytes = maxBytes }
  func start(_ c: CheckedContinuation<Void, Error>, _ task: URLSessionDataTask) { continuation = c; task.resume() }
  private var tooLarge: TranscribeError { TranscribeError("too_large", "This Reel is larger than \(maxBytes / 1024 / 1024) MB, so it was not downloaded.") }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    if redirects < 4, Media.allowed(request.url) { redirects += 1; completionHandler(request); return }
    failure = TranscribeError("not_allowed", "The media link pointed away from Instagram's servers, so it was not downloaded.")
    completionHandler(nil)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    if failure != nil { completionHandler(.cancel); return }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if !(200..<300).contains(status) { failure = TranscribeError("download", "The media could not be downloaded (status \(status)). Instagram's links expire after a while; run a new analysis."); completionHandler(.cancel); return }
    if response.expectedContentLength > Int64(maxBytes) { failure = tooLarge; completionHandler(.cancel); return }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    total += data.count
    if total > maxBytes { failure = tooLarge; dataTask.cancel(); return }
    do { try handle.write(contentsOf: data) } catch { failure = TranscribeError("download", "The media could not be saved on this Mac."); dataTask.cancel() }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let c = continuation; continuation = nil
    if let failure { c?.resume(throwing: failure) }
    else if let error { c?.resume(throwing: TranscribeError("download", "The media could not be downloaded: " + error.localizedDescription)) }
    else { c?.resume() }
  }
}

enum Transcribe {
  private static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral; c.timeoutIntervalForRequest = 120; c.timeoutIntervalForResource = 300
    c.httpAdditionalHeaders = ["User-Agent": "187N-Agent-HQ/" + AppInfo.version]
    return URLSession(configuration: c)
  }()

  // {text, segments: [{start, end, text}], language, duration, source, model}
  static func run(audio: URL, filename: String, with t: Transcriber, key: String) async throws -> J {
    let data: Data
    do { data = try Data(contentsOf: audio) } catch { throw TranscribeError("audio", "The sound file could not be read.") }
    guard data.count <= 25 * 1024 * 1024 else { throw TranscribeError("too_large", "This Reel's sound is over the 25 MB upload limit.") }
    switch t {
    case .groq:
      // POST {base}/audio/transcriptions (OpenAI-compatible), verbose_json gives timed segments.
      let (body, type) = multipart([("model", t.model), ("response_format", "verbose_json"), ("timestamp_granularities[]", "segment"), ("temperature", "0")],
                                   file: ("file", filename, "audio/m4a", data))
      var r = URLRequest(url: URL(string: Net.base("GROQ", "https://api.groq.com/openai/v1") + "/audio/transcriptions")!)
      r.httpMethod = "POST"; r.setValue("Bearer " + key, forHTTPHeaderField: "Authorization"); r.setValue(type, forHTTPHeaderField: "Content-Type"); r.httpBody = body
      let j = try await send(r, service: t.name)
      let segments: [J] = (j["segments"] as? [J] ?? []).compactMap { s in
        let text = (s["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : ["start": orNull(Classify.number(s["start"])), "end": orNull(Classify.number(s["end"])), "text": text]
      }
      return ["text": (j["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines), "segments": segments, "language": orNull(j["language"] as? String),
              "duration": orNull(Classify.number(j["duration"])), "source": t.rawValue, "model": t.model]
    case .elevenlabs:
      // POST {base}/v1/speech-to-text (Scribe), word timestamps; words are grouped into sentences here.
      let (body, type) = multipart([("model_id", t.model), ("timestamps_granularity", "word"), ("tag_audio_events", "false")], file: ("file", filename, "audio/m4a", data))
      var r = URLRequest(url: URL(string: Net.base("ELEVENLABS", "https://api.elevenlabs.io") + "/v1/speech-to-text")!)
      r.httpMethod = "POST"; r.setValue(key, forHTTPHeaderField: "xi-api-key"); r.setValue(type, forHTTPHeaderField: "Content-Type"); r.httpBody = body
      let j = try await send(r, service: t.name)
      let words = j["words"] as? [J] ?? []
      return ["text": (j["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines), "segments": sentences(words), "language": orNull(j["language_code"] as? String),
              "duration": orNull(words.compactMap { Classify.number($0["end"]) }.max()), "source": t.rawValue, "model": t.model]
    }
  }

  // Scribe words → sentences {start, end, text}: a new one after . ! ? , after a pause over 0.8 s or after 30 words.
  static func sentences(_ words: [J]) -> [J] {
    var out: [J] = [], text = "", start: Double?, end: Double?, count = 0
    func flush() { let t = text.trimmingCharacters(in: .whitespacesAndNewlines); if !t.isEmpty { out.append(["start": orNull(start), "end": orNull(end), "text": t]) }; text = ""; start = nil; end = nil; count = 0 }
    for w in words {
      let type = w["type"] as? String ?? "word", t = w["text"] as? String ?? ""
      if type == "audio_event" { continue }
      if type == "spacing" { if !text.isEmpty { text += t.isEmpty ? " " : t }; continue }
      let s = Classify.number(w["start"])
      if let s, let end, s - end > 0.8, count > 0 { flush() }
      if start == nil { start = s }
      text += t; end = Classify.number(w["end"]) ?? end; count += 1
      if let last = t.last, ".!?".contains(last) || count >= 30 { flush() }
    }
    flush()
    return out
  }

  static func multipart(_ fields: [(String, String)], file: (name: String, filename: String, type: String, data: Data)) -> (Data, String) {
    let boundary = "----hq" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
    var body = Data()
    for (k, v) in fields { body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n".utf8)) }
    body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.filename)\"\r\nContent-Type: \(file.type)\r\n\r\n".utf8))
    body.append(file.data)
    body.append(Data("\r\n--\(boundary)--\r\n".utf8))
    return (body, "multipart/form-data; boundary=" + boundary)
  }

  // One request with short retries for rate limits and server errors; readable errors without the key.
  static func send(_ r: URLRequest, service: String) async throws -> J {
    var attempt = 0
    while true {
      let data: Data, response: URLResponse
      do { (data, response) = try await session.data(for: r) }
      catch {
        if Task.isCancelled { throw CancellationError() }
        if attempt < 2 { attempt += 1; try await Task.sleep(nanoseconds: UInt64(attempt) * 1_000_000_000); continue }
        throw TranscribeError("offline", "No connection to \(service). Check your internet connection.")
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let parsed = (try? JSONSerialization.jsonObject(with: data)) as? J
      if (200..<300).contains(status) {
        guard let parsed else { throw TranscribeError("service", "\(service) sent an answer this app could not read.") }
        return parsed
      }
      if status == 401 || status == 403 { throw TranscribeError("key", "\(service) did not accept your key. " + (service == "Groq" ? Transcriber.groq.whereToAdd : Transcriber.elevenlabs.whereToAdd)) }
      if status == 429 || status >= 500, attempt < 3 {
        let wait = Double((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "retry-after") ?? "") ?? pow(2, Double(attempt))
        if wait <= 30 { attempt += 1; try await Task.sleep(nanoseconds: UInt64(max(1, wait) * 1_000_000_000)); continue }
      }
      let e = parsed?["error"], d = parsed?["detail"]
      let detail = (e as? J)?["message"] as? String ?? (d as? J)?["message"] as? String ?? (d as? String) ?? (e as? String) ?? ""
      if status == 429 { throw TranscribeError("rate", "\(service) is limiting requests on your account right now. Try again later.") }
      throw TranscribeError("service", "\(service) could not transcribe this Reel (status \(status))" + (detail.isEmpty ? "." : ": " + String(detail.prefix(200))))
    }
  }
}
