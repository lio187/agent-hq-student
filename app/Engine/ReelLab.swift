// Creator Lab: analyse a creator's Reels and find what makes posts outperform. The student's own Apify key collects
// the Reels (a hard cost limit, only after a confirm in the dialog that showed the quote), their own ElevenLabs or
// Groq key transcribes them, and Jev (their own TypeSafe key, see Jev.swift) or their own AI tool classifies hook
// and structure. The maths (median views, outlier
// score, findings per dimension) runs here. Adapted from an MIT-licensed project; see marketing/analysis/credits.
//
//   GET  marketing/analysis                    runs, what is connected, the dimension labels
//   POST marketing/analysis/quote              {handle, count 1–50} → the Apify quote (nothing is paid)
//   POST marketing/analysis/start              {handle, count, confirm: true, maxUsd, transcriber, classifier?: jev|agent, runtime?}
//   GET  marketing/analysis/<id>               the run with its posts, metrics and findings
//   GET  marketing/analysis/<id>/export        the same as a JSON download
//   POST marketing/analysis/<id>/cancel        stops the run (and aborts the Apify run if it is still running)
//   POST marketing/analysis/<id>/delete        removes a finished run
//   POST marketing/analysis/post/<postId>/idea a content idea from one post (Content.addIdea)
//   GET  marketing/analysis/credits            the licence notice
import Foundation

enum AnalysisAPI {
  static let actor = "apify/instagram-reel-scraper"
  static let store = DocStore.named("analysis")
  static let activeStates: Set<String> = ["queued", "scraping", "transcribing", "classifying"]

  static func hq(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? {
    guard path == "marketing/analysis" || path.hasPrefix("marketing/analysis/") else { return nil }
    recoverOnce()
    let parts = path.split(separator: "/").dropFirst(2).map(String.init)
    let body = r.json
    switch (method, parts.count) {
    case ("GET", 0): return home(router)
    case ("GET", 1) where parts[0] == "credits": return ["title": "Credits", "license": "MIT", "text": credits]
    case ("POST", 1) where parts[0] == "quote": return try await quote(body)
    case ("POST", 1) where parts[0] == "start": return try start(body, router)
    case ("POST", 3) where parts[0] == "post" && parts[2] == "idea": return try idea(parts[1], body)
    case ("GET", 1): return try detail(parts[0])
    case ("GET", 2) where parts[1] == "export": return try export(parts[0])
    case ("POST", 2) where parts[1] == "cancel": return try await cancel(parts[0], router)
    case ("POST", 2) where parts[1] == "delete": return try delete(parts[0])
    default: throw APIError(404, "not_found", "This Creator Lab request is not known.")
    }
  }
  static func student(_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any? { nil }

  // A free check of a Groq key (listing the models costs nothing).
  static func validateGroq(_ key: String) async throws {
    do { _ = try await Net.json("GET", Net.base("GROQ", "https://api.groq.com/openai/v1") + "/models", headers: ["Authorization": "Bearer " + key]) }
    catch let e as NetError where e.status == 401 || e.status == 403 { throw NetError(status: 422, message: "Groq did not accept this key.", code: "invalid_key") }
  }

  // MARK: reading
  static func home(_ router: Router) -> J {
    let runs = store.list("runs").map(summary)
    let transcribers = Transcriber.allCases.filter { $0.key != nil }.map { ["id": $0.rawValue, "name": $0.name, "model": $0.model] as J }
    return ["runs": runs, "dimensions": Classify.catalog,
            "setup": ["apify": Apify.connected, "elevenlabs": Transcriber.elevenlabs.key != nil, "groq": Transcriber.groq.key != nil, "transcribers": transcribers,
                      "typesafe": Keychain.get(KeyName.typesafe) != nil, "jev": ["name": Jev.name, "model": Jev.model] as J,
                      "runtimes": runtimeOptions(router), "capUsd": Apify.capUsd, "monthUsd": (Apify.monthUsd() * 100).rounded() / 100, "maxCount": 50] as J]
  }
  static func summary(_ run: J) -> J {
    var x = run; x["purpose"] = nil
    x["events"] = Array((run["events"] as? [J] ?? []).suffix(12))
    return x
  }
  static func detail(_ id: String) throws -> J {
    guard let run = store.get("runs", id: id) else { throw APIError(404, "not_found", "This analysis is no longer here.") }
    let (posts, median) = ReelMath.enrich(ReelFiles.shared.posts(id))
    let thumbs = DocStore.folder("analysis").appendingPathComponent("thumbs")
    let shown: [J] = posts.map { p in
      var x = clean(p)
      if let t = p["thumb"] as? String, let d = try? Data(contentsOf: thumbs.appendingPathComponent(t)) { x["thumb"] = "data:image/jpeg;base64," + d.base64EncodedString() } else { x["thumb"] = NSNull() }
      return x
    }
    return ["run": summary(run), "posts": shown, "medianViews": orNull(median), "findings": ReelMath.findings(posts), "dimensions": Classify.catalog]
  }
  static func export(_ id: String) throws -> J {
    guard let run = store.get("runs", id: id) else { throw APIError(404, "not_found", "This analysis is no longer here.") }
    let (posts, median) = ReelMath.enrich(ReelFiles.shared.posts(id))
    var r = summary(run); r["events"] = nil
    return ["format": "reel-analysis/1", "exportedAt": isoNow(), "run": r, "medianViews": orNull(median), "posts": posts.map { var x = clean($0); x["thumb"] = nil; return x },
            "findings": ReelMath.findings(posts), "dimensions": Classify.catalog,
            "note": (run["classifier"] as? String == "jev" ? "Classified by Jev (TypeSafe) with the student's own key." : "Classified by the student's own AI tool.") + " Patterns in one sample of Reels show what goes together, not what causes it."]
  }
  // Posts without the expiring media links.
  private static func clean(_ p: J) -> J { var x = p; for k in ["videoUrl", "audioUrl", "thumbnailUrl"] { x[k] = nil }; return x }

  // The AI tools an analysis can use: each ready runtime that one of the student's agents runs on (the Researcher first).
  static func runtimeOptions(_ router: Router) -> [J] {
    let agents = router.agents, researcher = agents.first { $0["id"] as? String == "researcher" }
    return Agents.detect().compactMap { rt in
      guard let id = rt["id"] as? String, rt["installed"] as? Bool == true else { return nil }
      guard let agent = (researcher?["runtime"] as? String == id ? researcher : nil) ?? agents.first(where: { $0["runtime"] as? String == id }) else { return nil }
      let state = rt["state"] as? String ?? ""
      return ["id": id, "name": rt["name"] ?? id, "ready": rt["ready"] as? Bool == true || state == "checking", "state": state, "agent": agent["id"] ?? "", "agentName": agent["name"] ?? "",
              "default": researcher?["runtime"] as? String == id]
    }
  }

  // MARK: quote and start
  static func cleanHandle(_ v: Any?) throws -> String {
    var h = (v as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if let r = h.range(of: "instagram.com/") { h = String(h[r.upperBound...]).split(separator: "/").first.map(String.init) ?? "" }
    h = h.hasPrefix("@") ? String(h.dropFirst()) : h
    guard h.range(of: "^[A-Za-z0-9._]{1,30}$", options: .regularExpression) != nil else { throw APIError(422, "bad_handle", "Enter an Instagram handle, for example natgeo.") }
    return h.lowercased()
  }
  static func cleanCount(_ v: Any?) throws -> Int {
    guard let n = (v as? NSNumber)?.intValue ?? Int(v as? String ?? ""), (1...50).contains(n) else { throw APIError(422, "bad_count", "Choose 1 to 50 Reels.") }
    return n
  }
  // The reel scraper: the creator's latest Reels, no paid add-ons (transcripts, video copies, share counts).
  static func scraperInput(_ handle: String, _ count: Int) -> J {
    ["username": [handle], "resultsLimit": count, "skipPinnedPosts": true, "skipTrialReels": true, "includeSharesCount": false, "includeTranscript": false, "includeDownloadedVideo": false]
  }
  static func quote(_ body: J) async throws -> J {
    let handle = try cleanHandle(body["handle"]), count = try cleanCount(body["count"])
    var q = try await Apify.quote(actor: actor, input: scraperInput(handle, count), items: count)
    q["handle"] = handle; q["count"] = count
    return q
  }
  static func start(_ body: J, _ router: Router) throws -> J {
    guard body["confirm"] as? Bool == true else { throw APIError(422, "confirm_required", "Check the cost and confirm it in the dialog first.") }
    guard let maxUsd = (body["maxUsd"] as? NSNumber)?.doubleValue, maxUsd > 0, maxUsd.isFinite else { throw APIError(422, "no_cap", "A cost limit is required. Check the cost first.") }
    let handle = try cleanHandle(body["handle"]), count = try cleanCount(body["count"])
    guard Apify.connected else { throw APIError(422, "no_apify", "Add your Apify key in Setup → Research first.") }
    guard Apify.monthUsd() + maxUsd <= Apify.capUsd else { throw APIError(422, "over_cap", String(format: "This would go over your monthly Apify limit ($%.2f). Raise it in Setup → Research.", Apify.capUsd)) }
    let ready = Transcriber.allCases.filter { $0.key != nil }
    guard !ready.isEmpty else { throw APIError(422, "no_transcriber", "Add a key to transcribe with: your Groq key on this page, or your ElevenLabs key in Setup → Voice.") }
    let transcriber = Transcriber(rawValue: body["transcriber"] as? String ?? "") ?? ready[0]
    guard transcriber.key != nil else { throw APIError(422, "no_transcriber", "\(transcriber.name) is not connected. " + transcriber.whereToAdd) }
    // Jev when the student has a TypeSafe key (and did not pick an AI tool), otherwise their own AI tool.
    let typesafe = Keychain.get(KeyName.typesafe) != nil
    let classifier = body["classifier"] as? String ?? (body["runtime"] is String || !typesafe ? "agent" : "jev")
    var by: J
    switch classifier {
    case "jev":
      guard typesafe else { throw APIError(422, "no_typesafe", "Add your TypeSafe key on the Creator Lab page first.") }
      by = ["classifier": "jev", "runtime": "jev", "runtimeName": Jev.name, "profile": "", "agentName": "", "tokens": ["input": 0, "output": 0] as J]
    case "agent":
      let options = runtimeOptions(router)
      guard let tool = options.first(where: { $0["id"] as? String == (body["runtime"] as? String) }) ?? options.first(where: { $0["default"] as? Bool == true }) ?? options.first else {
        throw APIError(422, "no_runtime", "None of your agents has a working AI tool yet. Set one up in Setup → AI tools" + (typesafe ? ", or classify with Jev." : "."))
      }
      guard tool["ready"] as? Bool == true else { throw APIError(422, "runtime_not_ready", "\(tool["name"] as? String ?? "This AI tool") needs sign-in first. Open Setup → AI tools.") }
      by = ["classifier": "agent", "runtime": tool["id"] ?? "", "runtimeName": tool["name"] ?? "", "profile": tool["agent"] ?? "researcher", "agentName": tool["agentName"] ?? ""]
    default: throw APIError(422, "bad_classifier", "Choose Jev or one of your AI tools to classify with.")
    }
    if store.list("runs").contains(where: { activeStates.contains($0["status"] as? String ?? "") }) { throw APIError(409, "busy", "Another analysis is still running. Wait for it to finish or cancel it.") }
    let id = newID("an")
    let run: J = (["id": id, "handle": handle, "count": count, "maxUsd": maxUsd, "usd": NSNull(), "transcriber": transcriber.rawValue, "transcriberName": transcriber.name,
                  "status": "queued", "step": "Starting", "createdAt": isoNow(), "finishedAt": NSNull(), "error": NSNull(), "purpose": "Creator Lab @\(handle) · \(id)",
                  "progress": ["total": 0, "transcribed": 0, "classified": 0, "skipped": 0, "failed": 0] as J, "events": [J](), "summary": NSNull()] as J).merging(by) { $1 }
    store.upsert("runs", run, limit: 40)
    prune()
    ReelFiles.shared.set(id, [])
    AnalysisJobs.shared.begin(id)
    Task.detached { await ReelPipeline.run(id, router: router) }
    return summary(run)
  }

  // Only the last 40 runs are kept: the posts and cover images of older ones are removed too.
  static func prune() {
    let keep = Set(store.list("runs").compactMap { $0["id"] as? String }), fm = FileManager.default
    let runs = DocStore.folder("analysis").appendingPathComponent("runs"), thumbs = DocStore.folder("analysis").appendingPathComponent("thumbs")
    for f in (try? fm.contentsOfDirectory(atPath: runs.path)) ?? [] where f.hasSuffix(".json") && !keep.contains(String(f.dropLast(5))) { ReelFiles.shared.remove(String(f.dropLast(5))) }
    for f in (try? fm.contentsOfDirectory(atPath: thumbs.path)) ?? [] where !keep.contains(String(f.prefix { $0 != "-" })) { try? fm.removeItem(at: thumbs.appendingPathComponent(f)) }
  }

  // MARK: cancel, delete, idea
  static func cancel(_ id: String, _ router: Router) async throws -> J {
    guard let run = store.get("runs", id: id) else { throw APIError(404, "not_found", "This analysis is no longer here.") }
    guard activeStates.contains(run["status"] as? String ?? "") else { return summary(run) }
    if let agentRun = AnalysisJobs.shared.cancel(id) { _ = router.stopRun(agentRun) }
    _ = await ReelPipeline.abortApify(run["purpose"] as? String ?? "")
    ReelPipeline.finish(id, status: "cancelled", step: "Cancelled", error: nil)
    return summary(store.get("runs", id: id) ?? run)
  }
  static func delete(_ id: String) throws -> J {
    guard let run = store.get("runs", id: id) else { throw APIError(404, "not_found", "This analysis is no longer here.") }
    guard !activeStates.contains(run["status"] as? String ?? "") else { throw APIError(409, "running", "Cancel this analysis before you delete it.") }
    let thumbs = DocStore.folder("analysis").appendingPathComponent("thumbs")
    for p in ReelFiles.shared.posts(id) { if let t = p["thumb"] as? String { try? FileManager.default.removeItem(at: thumbs.appendingPathComponent(t)) } }
    ReelFiles.shared.remove(id)
    store.remove("runs", id: id)
    return ["ok": true, "id": id]
  }
  static func idea(_ postID: String, _ body: J) throws -> J {
    guard let dot = postID.firstIndex(of: ".") else { throw APIError(404, "not_found", "This Reel is no longer here.") }
    let runID = String(postID[..<dot]), code = String(postID[postID.index(after: dot)...])
    guard let run = store.get("runs", id: runID), let post = ReelMath.enrich(ReelFiles.shared.posts(runID)).posts.first(where: { $0["code"] as? String == code }) else {
      throw APIError(404, "not_found", "This Reel is no longer here.")
    }
    let handle = run["handle"] as? String ?? "", analysis = post["analysis"] as? J ?? [:], dims = analysis["dimensions"] as? J ?? [:]
    let caption = (post["caption"] as? String ?? "").split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
    var hook = analysis["hook"] as? String ?? ""
    if hook.isEmpty { hook = Classify.opening((post["transcript"] as? J)?["text"] as? String ?? "") }
    if hook.isEmpty { hook = String(caption.prefix(120)) }
    let given = (body["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let title = given.isEmpty ? (hook.isEmpty ? "Idea from @\(handle)'s Reel" : String(hook.prefix(100))) : String(given.prefix(200))
    var notes = ["From @\(handle)'s Reel: " + (post["url"] as? String ?? "")]
    if let v = post["views"] as? Double { notes.append(String(format: "%.0f views", v) + ((post["outlier"] as? Double).map { String(format: " (%.1f× their median)", $0) } ?? "")) }
    let found = ["mechanism", "structure", "opening", "cta"].compactMap { k in (dims[k] as? String).flatMap { $0 == "unclear" ? nil : (Classify.dimensions.first { $0.key == k }?.title ?? k) + ": " + Classify.label(k, $0) } }
    if !found.isEmpty { notes.append(found.joined(separator: " · ")) }
    if let extra = body["notes"] as? String, !extra.isEmpty { notes.append(String(extra.prefix(2000))) }
    if let t = (post["transcript"] as? J)?["text"] as? String, !t.isEmpty { notes.append("Original transcript (for reference):\n" + String(t.prefix(1200))) }
    let item = Content.addIdea(title: title, hook: hook, notes: notes.joined(separator: "\n"),
                               source: ["kind": "reel", "url": post["url"] ?? "", "title": "@\(handle)" + (caption.isEmpty ? "" : " · " + String(caption.prefix(80)))])
    ReelFiles.shared.update(runID, code: code) { $0["idea"] = ["id": item["id"] ?? "", "at": isoNow()] as J }
    return ["item": item, "postId": postID]
  }

  // Runs that were busy when the app closed did not finish.
  private static let recovered: Void = {
    for r in store.list("runs") where activeStates.contains(r["status"] as? String ?? "") && !AnalysisJobs.shared.isRunning(r["id"] as? String ?? "") {
      store.update("runs", id: r["id"] as? String ?? "") { $0["status"] = "interrupted"; $0["step"] = "The app was closed during this analysis. Start a new one." }
    }
  }()
  static func recoverOnce() { _ = recovered }

  // MIT notice of the project the dimensions, segment roles and outlier maths are adapted from.
  static let credits = """
  Creator Lab's Reel analysis (the eight script dimensions, the segment roles, the outlier score and the findings maths) is adapted from an open-source project by Artem Novitckii, used under the MIT License:

  MIT License

  Copyright (c) 2026 Artem Novitckii

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  """
}

// MARK: - the work in the background
enum ReelPipeline {
  static var store: DocStore { AnalysisAPI.store }
  private static let parallel = 3

  static func run(_ id: String, router: Router) async {
    defer { AnalysisJobs.shared.end(id); ReelFiles.shared.flush() }
    guard let run = store.get("runs", id: id) else { return }
    let handle = run["handle"] as? String ?? "", count = run["count"] as? Int ?? 20, maxUsd = run["maxUsd"] as? Double ?? 0
    let transcriber = Transcriber(rawValue: run["transcriber"] as? String ?? "") ?? .groq, profile = run["profile"] as? String ?? "researcher"

    // 1. Collect the Reels (Apify, hard cost limit).
    setStatus(id, "scraping", "Collecting @\(handle)'s Reels with Apify")
    let items: [J]
    do {
      let result = try await scrape(id, handle: handle, count: count, maxUsd: maxUsd, purpose: run["purpose"] as? String ?? "")
      items = result["items"] as? [J] ?? []
      store.update("runs", id: id) { $0["usd"] = result["usd"] ?? NSNull(); $0["apifyRunId"] = result["runId"] ?? NSNull() }
    } catch {
      if AnalysisJobs.shared.isCancelled(id) { return finish(id, status: "cancelled", step: "Cancelled", error: nil) }
      return finish(id, status: "failed", step: "Collecting failed", error: (error as? APIError)?.message ?? error.localizedDescription)
    }
    let posts = normalize(items, runID: id)
    guard !posts.isEmpty else {
      let reason = items.compactMap { $0["errorDescription"] as? String ?? $0["error"] as? String }.first
      return finish(id, status: "failed", step: "No Reels found", error: "Apify found no Reels for @\(handle)." + (reason.map { " " + String($0.prefix(200)) } ?? " Check the handle; private accounts cannot be read."))
    }
    ReelFiles.shared.set(id, posts)
    log(id, "\(posts.count) Reels collected")
    guard let key = transcriber.key else { return finish(id, status: "failed", step: "No transcription key", error: "\(transcriber.name) is not connected. " + transcriber.whereToAdd) }

    // 2. Download, take out the sound, transcribe (a few at a time).
    setStatus(id, "transcribing", "Transcribing with \(transcriber.name)")
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("hq-analysis-" + id, isDirectory: true)
    try? FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tmp) }
    let codes = posts.compactMap { $0["code"] as? String }
    await withTaskGroup(of: Void.self) { group in
      var next = 0
      func add() {
        guard next < codes.count, !halted(id) else { return }
        let code = codes[next]; next += 1
        group.addTask { await transcribe(id, code: code, transcriber: transcriber, key: key, tmp: tmp) }
      }
      for _ in 0..<parallel { add() }
      while await group.next() != nil { add() }
    }
    if AnalysisJobs.shared.isCancelled(id) { return finish(id, status: "cancelled", step: "Cancelled", error: nil) }
    if let stop = AnalysisJobs.shared.stopMessage(id) { return finish(id, status: "failed", step: "Transcription stopped", error: stop) }

    // 3. Classify: with Jev (one request per Reel), or with the student's AI tool, five posts per run.
    let ready = ReelFiles.shared.posts(id).filter { $0["status"] as? String == "transcribed" }
    if !ready.isEmpty && run["classifier"] as? String == "jev" { return await classifyWithJev(id, ready) }
    if !ready.isEmpty {
      setStatus(id, "classifying", "Classifying with \(run["runtimeName"] as? String ?? "your AI tool")")
      let batches = stride(from: 0, to: ready.count, by: Classify.batchSize).map { Array(ready[$0..<min(ready.count, $0 + Classify.batchSize)]) }
      var agentError: String?
      for (i, batch) in batches.enumerated() {
        if AnalysisJobs.shared.isCancelled(id) { break }
        let codes = batch.compactMap { $0["code"] as? String }
        if let agentError { for c in codes { markUnclear(id, c, agentError) }; continue }
        for c in codes { ReelFiles.shared.update(id, code: c) { $0["status"] = "classifying" } }
        setStep(id, "Classifying batch \(i + 1) of \(batches.count)")
        let input: [J] = batch.map { p in ["code": p["code"] ?? "", "caption": p["caption"] ?? "", "segments": Classify.segments(p["transcript"] as? J ?? [:])] }
        let res = await Classify.run(batch: input, router: router, profile: profile, title: "Creator Lab · @\(handle) · batch \(i + 1) of \(batches.count)",
                                     cancelled: { AnalysisJobs.shared.isCancelled(id) }, onAgentRun: { AnalysisJobs.shared.setAgentRun(id, $0) })
        if AnalysisJobs.shared.isCancelled(id) { break }
        if let e = res.error { agentError = "Your AI tool could not classify: " + e; log(id, agentError ?? "") }
        for p in input {
          let code = p["code"] as? String ?? ""
          if var a = res.analyses[code] {
            if (a["hook"] as? String ?? "").isEmpty { a["hook"] = Classify.opening(((batch.first { $0["code"] as? String == code })?["transcript"] as? J)?["text"] as? String ?? "") }
            a["runtime"] = run["runtime"] ?? ""
            ReelFiles.shared.update(id, code: code) { $0["analysis"] = a; $0["status"] = "classified"; $0["error"] = NSNull() }
          } else {
            markUnclear(id, code, agentError ?? res.problems[code].map { "The AI tool's answer did not match the format twice (\($0))." } ?? "Not classified.")
          }
        }
        progress(id)
      }
      if AnalysisJobs.shared.isCancelled(id) { return finish(id, status: "cancelled", step: "Cancelled", error: nil) }
      return finish(id, status: "complete", step: "Done", error: agentError)
    }
    finish(id, status: "complete", step: "Done", error: "No Reel had enough speech to classify.")
  }

  // Apify with a watcher: a cancel aborts the Apify run as soon as it is known (also when it started a moment later).
  static func scrape(_ id: String, handle: String, count: Int, maxUsd: Double, purpose: String) async throws -> J {
    let watcher = Task.detached {
      while !Task.isCancelled {
        if AnalysisJobs.shared.isCancelled(id), await abortApify(purpose) { return }
        try? await Task.sleep(nanoseconds: 400_000_000)
      }
    }
    defer { watcher.cancel() }
    return try await Apify.run(actor: AnalysisAPI.actor, input: AnalysisAPI.scraperInput(handle, count), maxUsd: maxUsd, items: count, purpose: purpose) { status in
      if !status.isEmpty { setStep(id, "Apify: " + status.lowercased()) }
    }
  }
  // Aborts this analysis' Apify run while the ledger shows it running. True when one was aborted.
  static func abortApify(_ purpose: String) async -> Bool {
    guard !purpose.isEmpty, let entry = (Apify.ledger()["runs"] as? [J])?.first(where: { $0["purpose"] as? String == purpose && $0["status"] as? String == "RUNNING" }),
          let apifyID = entry["id"] as? String else { return false }
    await Apify.abort(apifyID)
    return true
  }

  // The Apify rows as posts (one per Reel; hidden like counts, -1 in Apify, become unknown).
  static func normalize(_ items: [J], runID: String) -> [J] {
    var seen = Set<String>(), out: [J] = []
    func count(_ v: Any?) -> Any { guard let d = Classify.number(v), d >= 0 else { return NSNull() }; return d }
    for row in items where row["error"] == nil {
      let code = (row["shortCode"] as? String) ?? (row["code"] as? String) ?? ""
      guard code.range(of: "^[A-Za-z0-9_-]{1,90}$", options: .regularExpression) != nil, seen.insert(code).inserted else { continue }
      var url = row["url"] as? String ?? ""
      if URL(string: url).map({ $0.scheme == "https" && ($0.host ?? "").hasSuffix("instagram.com") }) != true { url = "https://www.instagram.com/reel/\(code)/" }
      let plays = count(row["videoPlayCount"]), views = plays is NSNull ? count(row["videoViewCount"]) : plays
      out.append(["id": runID + "." + code, "code": code, "url": url, "creator": row["ownerUsername"] ?? NSNull(), "caption": String((row["caption"] as? String ?? "").prefix(2200)),
                  "publishedAt": row["timestamp"] ?? NSNull(), "views": views, "likes": count(row["likesCount"]), "comments": count(row["commentsCount"]), "duration": count(row["videoDuration"]),
                  "videoUrl": row["videoUrl"] as? String ?? "", "audioUrl": row["audioUrl"] as? String ?? "", "thumbnailUrl": row["displayUrl"] as? String ?? "",
                  "status": "queued", "error": NSNull(), "thumb": NSNull()])
    }
    return out
  }

  // One Reel: its cover image, then audio → transcript (the audio link first, then the video).
  static func transcribe(_ id: String, code: String, transcriber: Transcriber, key: String, tmp: URL) async {
    guard let post = ReelFiles.shared.posts(id).first(where: { $0["code"] as? String == code }) else { return }
    if let cover = post["thumbnailUrl"] as? String, !cover.isEmpty {
      let name = id + "-" + code + ".jpg", dest = DocStore.folder("analysis").appendingPathComponent("thumbs", isDirectory: true)
      try? FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true)
      if await Media.thumbnail(cover, to: dest.appendingPathComponent(name)) { ReelFiles.shared.update(id, code: code) { $0["thumb"] = name } }
    }
    ReelFiles.shared.update(id, code: code) { $0["status"] = "transcribing" }
    progress(id)
    var transcript: J?, problem: TranscribeError?
    let sources = [post["audioUrl"] as? String ?? "", post["videoUrl"] as? String ?? ""].filter { !$0.isEmpty }
    for (n, source) in Array(NSOrderedSet(array: sources)).compactMap({ $0 as? String }).enumerated() {
      if halted(id) { return }
      // AVFoundation reads a file by its extension: keep a known one (both are MPEG-4 containers).
      let ext = ["m4a", "mp4", "mov"].contains(URL(string: source)?.pathExtension.lowercased() ?? "") ? URL(string: source)!.pathExtension.lowercased() : "mp4"
      let media = tmp.appendingPathComponent("\(code)-\(n)-source.\(ext)"), audio = tmp.appendingPathComponent("\(code)-\(n).m4a")
      defer { try? FileManager.default.removeItem(at: media); try? FileManager.default.removeItem(at: audio) }
      do {
        try await Media.download(source, to: media)
        let seconds = try await Media.audio(from: media, to: audio)
        if halted(id) { return }
        var t = try await Transcribe.run(audio: audio, filename: code + ".m4a", with: transcriber, key: key)
        if t["duration"] is NSNull, let seconds { t["duration"] = seconds }
        transcript = t; break
      } catch let e as TranscribeError {
        problem = e
        if e.code == "key" { AnalysisJobs.shared.stop(id, e.message); break }
      } catch { problem = TranscribeError("failed", error.localizedDescription) }
    }
    if let transcript {
      let text = transcript["text"] as? String ?? ""
      let enough = text.split(whereSeparator: { $0.isWhitespace }).count >= 6
      ReelFiles.shared.update(id, code: code) {
        $0["transcript"] = transcript; $0["status"] = enough ? "transcribed" : "no_speech"
        $0["error"] = enough ? NSNull() : "Too little speech to analyse." as Any
      }
    } else {
      let none = sources.isEmpty ? TranscribeError("no_media", "Apify gave no video link for this Reel.") : problem
      ReelFiles.shared.update(id, code: code) { $0["status"] = none?.code == "no_audio" ? "no_audio" : "failed"; $0["error"] = none?.message ?? "Not transcribed." }
    }
    progress(id)
  }

  static func markUnclear(_ id: String, _ code: String, _ why: String) {
    let unclear = Dictionary(uniqueKeysWithValues: Classify.dimensions.map { ($0.key, "unclear" as Any) })
    ReelFiles.shared.update(id, code: code) { p in
      let segs = Classify.segments(p["transcript"] as? J ?? [:]).map { s -> J in var x = s; x["role"] = "other"; return x }
      p["analysis"] = ["hook": Classify.opening((p["transcript"] as? J)?["text"] as? String ?? ""), "dimensions": unclear, "segments": segs, "unclear": true] as J
      p["status"] = "unclear"; p["error"] = why
    }
  }

  // MARK: state and progress
  static func halted(_ id: String) -> Bool { AnalysisJobs.shared.isCancelled(id) || AnalysisJobs.shared.stopMessage(id) != nil }
  static func setStatus(_ id: String, _ status: String, _ step: String) {
    guard !AnalysisJobs.shared.isCancelled(id) else { return }
    store.update("runs", id: id) { $0["status"] = status; $0["step"] = step }
    log(id, step)
  }
  static func setStep(_ id: String, _ step: String) {
    guard !AnalysisJobs.shared.isCancelled(id) else { return }
    store.update("runs", id: id) { $0["step"] = step }
    progress(id)
  }
  static func log(_ id: String, _ message: String) {
    store.update("runs", id: id) { r in var e = r["events"] as? [J] ?? []; e.append(["at": isoNow(), "message": message]); r["events"] = Array(e.suffix(40)) }
    progress(id)
  }
  static func counts(_ posts: [J]) -> J {
    let s = posts.map { $0["status"] as? String ?? "" }
    return ["total": posts.count, "transcribed": posts.filter { $0["transcript"] != nil }.count, "classified": s.filter { $0 == "classified" || $0 == "unclear" }.count,
            "skipped": s.filter { $0 == "no_audio" || $0 == "no_speech" }.count, "failed": s.filter { $0 == "failed" }.count]
  }
  static func progress(_ id: String) {
    let p = counts(ReelFiles.shared.posts(id))
    guard let run = store.update("runs", id: id, { $0["progress"] = p }) else { return }
    Store.shared.emit("analysis.progress", ["run": id, "handle": run["handle"] ?? "", "status": run["status"] ?? "", "step": run["step"] ?? "", "progress": p])
  }
  static func finish(_ id: String, status: String, step: String, error: String?) {
    let cancelled = AnalysisJobs.shared.isCancelled(id)
    if let current = store.get("runs", id: id)?["status"] as? String, current == "cancelled", status != "cancelled" { return }
    let posts = ReelFiles.shared.posts(id)
    let (enriched, median) = ReelMath.enrich(posts)
    let findings = ReelMath.findings(posts)
    store.update("runs", id: id) { r in
      r["status"] = cancelled ? "cancelled" : status; r["step"] = cancelled ? "Cancelled" : step; r["finishedAt"] = isoNow(); r["error"] = orNull(error)
      r["progress"] = counts(posts)
      r["summary"] = ["posts": posts.count, "classified": posts.filter { $0["status"] as? String == "classified" }.count, "medianViews": orNull(median),
                      "outliers": enriched.filter { ($0["outlier"] as? Double ?? 0) >= 2 }.count, "top": orNull(ReelMath.top(findings))] as J
    }
    log(id, cancelled ? "Cancelled" : error.map { step + ": " + $0 } ?? step)
  }
}

// MARK: - the maths: median views, engagement, outlier score and what outperforms
enum ReelMath {
  static func median(_ values: [Double]) -> Double? {
    let a = values.filter { $0.isFinite }.sorted(); guard !a.isEmpty else { return nil }
    return (a[(a.count - 1) / 2] + a[a.count / 2]) / 2
  }
  static func value(_ v: Any?) -> Double? { Classify.number(v) }
  // Adds per post: engagement (likes and comments per view, in %), likes per 1,000 views and the outlier score
  // (views ÷ the creator's median views in this sample).
  static func enrich(_ posts: [J]) -> (posts: [J], median: Double?) {
    let med = median(posts.compactMap { value($0["views"]) }.filter { $0 > 0 })
    let out: [J] = posts.map { p in
      var x = p
      let views = value(p["views"]), likes = value(p["likes"]), comments = value(p["comments"])
      if let views, views > 0 {
        x["views"] = views
        x["engagement"] = likes.map { ($0 + (comments ?? 0)) / views * 100 } ?? NSNull()
        x["likesPer1k"] = likes.map { $0 / views * 1000 } ?? NSNull()
        x["outlier"] = med.map { views / $0 } ?? NSNull()
      } else { x["engagement"] = NSNull(); x["likesPer1k"] = NSNull(); x["outlier"] = NSNull() }
      return x
    }
    return (out, med)
  }
  // Per dimension: each value's Reels, median views, median outlier score and engagement, and the lift against the
  // median of all classified Reels. A value "outperforms" at 1.2× or more with at least two Reels (one Reel is not a
  // pattern); under three Reels is a small sample.
  static func findings(_ posts: [J]) -> [J] {
    let all = enrich(posts).posts.filter { $0["status"] as? String == "classified" && (value($0["views"]) ?? 0) > 0 }
    let base = median(all.compactMap { value($0["views"]) })
    return Classify.dimensions.map { d in
      var groups: [String: [J]] = [:]
      for p in all { let v = ((p["analysis"] as? J)?["dimensions"] as? J)?[d.key] as? String ?? "unclear"; groups[v, default: []].append(p) }
      let rows: [J] = groups.map { v, ps in
        let views = median(ps.compactMap { value($0["views"]) })
        let lift = (views != nil && (base ?? 0) > 0) ? views! / base! : nil
        return ["value": v, "label": Classify.label(d.key, v), "count": ps.count, "medianViews": orNull(views), "medianOutlier": orNull(median(ps.compactMap { value($0["outlier"]) })),
                "medianEngagement": orNull(median(ps.compactMap { value($0["engagement"]) })), "lift": orNull(lift),
                "outperforms": v != "unclear" && ps.count >= 2 && (lift ?? 0) >= 1.2, "smallSample": ps.count < 3, "posts": ps.compactMap { $0["id"] as? String }]
      }.sorted { (value($0["lift"]) ?? 0, $0["count"] as? Int ?? 0) > (value($1["lift"]) ?? 0, $1["count"] as? Int ?? 0) }
      return ["key": d.key, "title": d.title, "finding": d.finding, "medianViews": orNull(base), "classified": all.count, "rows": rows]
    }
  }
  // The strongest pattern (the highest lift, then the most Reels), for the runs list.
  static func top(_ findings: [J]) -> J? {
    let rows = findings.flatMap { f in (f["rows"] as? [J] ?? []).filter { $0["outperforms"] as? Bool == true }.map { r -> J in var x = r; x["dimension"] = f["key"]; x["title"] = f["title"]; x["posts"] = nil; return x } }
    return rows.max { a, b in (value(a["lift"]) ?? 0, a["count"] as? Int ?? 0) < (value(b["lift"]) ?? 0, b["count"] as? Int ?? 0) }
  }
}

// MARK: - storage of the posts (one file per run) and the work in progress
final class ReelFiles {
  static let shared = ReelFiles()
  private let lock = NSLock()
  private var cache: [String: [J]] = [:]
  private var dirty = Set<String>()
  private var scheduled = false
  private let dir: URL = { let d = DocStore.folder("analysis").appendingPathComponent("runs", isDirectory: true); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }()
  private func file(_ run: String) -> URL { dir.appendingPathComponent(run + ".json") }

  func posts(_ run: String) -> [J] {
    lock.lock(); defer { lock.unlock() }
    if let c = cache[run] { return c }
    let loaded = (try? Data(contentsOf: file(run))).flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [J] } ?? []
    cache[run] = loaded
    return loaded
  }
  func set(_ run: String, _ posts: [J]) { lock.lock(); cache[run] = posts; lock.unlock(); changed(run) }
  @discardableResult func update(_ run: String, code: String, _ change: (inout J) -> Void) -> J? {
    var list = posts(run)
    lock.lock()
    list = cache[run] ?? list
    var out: J?
    if let i = list.firstIndex(where: { $0["code"] as? String == code }) { change(&list[i]); out = list[i]; cache[run] = list }
    lock.unlock()
    if out != nil { changed(run) }
    return out
  }
  func remove(_ run: String) { lock.lock(); cache[run] = nil; dirty.remove(run); lock.unlock(); try? FileManager.default.removeItem(at: file(run)) }
  private func changed(_ run: String) {
    lock.lock(); dirty.insert(run); let schedule = !scheduled; scheduled = true; lock.unlock()
    if schedule { DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) { self.flush() } }
  }
  func flush() {
    lock.lock(); let runs = dirty; dirty = []; scheduled = false; let snapshot = runs.compactMap { r in cache[r].map { (r, $0) } }; lock.unlock()
    for (r, list) in snapshot { if let d = try? JSONSerialization.data(withJSONObject: list, options: [.sortedKeys]) { try? d.write(to: file(r), options: .atomic) } }
  }
}

final class AnalysisJobs {
  static let shared = AnalysisJobs()
  private let lock = NSLock()
  private var running = Set<String>(), cancelled = Set<String>()
  private var stops: [String: String] = [:], agentRuns: [String: String] = [:]
  func begin(_ id: String) { lock.lock(); running.insert(id); lock.unlock() }
  func end(_ id: String) { lock.lock(); running.remove(id); agentRuns[id] = nil; lock.unlock() }
  func isRunning(_ id: String) -> Bool { lock.lock(); defer { lock.unlock() }; return running.contains(id) }
  // Marks the run cancelled; returns the agent run to stop, if one is busy.
  func cancel(_ id: String) -> String? { lock.lock(); defer { lock.unlock() }; cancelled.insert(id); return agentRuns[id] }
  func isCancelled(_ id: String) -> Bool { lock.lock(); defer { lock.unlock() }; return cancelled.contains(id) }
  func stop(_ id: String, _ message: String) { lock.lock(); if stops[id] == nil { stops[id] = message }; lock.unlock() }
  func stopMessage(_ id: String) -> String? { lock.lock(); defer { lock.unlock() }; return stops[id] }
  func setAgentRun(_ id: String, _ run: String) { lock.lock(); agentRuns[id] = run; lock.unlock() }
}
