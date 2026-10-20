// Apify, with the student's own key. Every paid run has a hard cost limit (maxTotalChargeUsd), only actors whose
// cost can be capped are run, a monthly cap is kept, and every run is in a ledger. Endpoints that start a run must
// have the student's explicit confirmation first; this client never starts one by itself.
import Foundation

enum Apify {
  static var key: String? { Keychain.get(KeyName.apify) }
  static var connected: Bool { key != nil }
  static var base: String { Net.base("APIFY", "https://api.apify.com/v2") }
  private static let store = DocStore.named("apify")
  static func headers(_ k: String) -> [String: String] { ["Authorization": "Bearer " + k] }
  static func validateKey(_ key: String) async throws {
    let me = try await Net.json("GET", base + "/users/me", headers: headers(key)) as? J
    guard (me?["data"] as? J)?["id"] != nil else { throw NetError(status: 422, message: "Apify did not accept this key.", code: "invalid_key") }
  }
  static func actorPath(_ actor: String) -> String { actor.replacingOccurrences(of: "/", with: "~") }

  // The monthly cap the student set (USD, default 5) and what this month's runs cost.
  static var capUsd: Double { store.value("capUsd") as? Double ?? 5 }
  static func setCap(_ usd: Double) { store.setValue("capUsd", max(0, min(500, usd))) }
  static func monthUsd() -> Double {
    let month = String(isoNow().prefix(7))
    return store.list("runs").filter { ($0["at"] as? String ?? "").hasPrefix(month) }.reduce(0) { $0 + (($1["usd"] as? Double) ?? ($1["maxUsd"] as? Double) ?? 0) }
  }
  static func ledger() -> J { ["monthUsd": (monthUsd() * 100).rounded() / 100, "capUsd": capUsd, "runs": Array(store.list("runs").prefix(50))] }

  // What a run of `items` results would cost at most: only pay-per-result and pay-per-event actors can be capped.
  static func quote(actor: String, input: J, items: Int) async throws -> J {
    guard let k = key else { return ["actor": actor, "cappable": false, "maxUsd": 0, "reason": "Connect Apify in Setup first."] }
    let a = (try await Net.json("GET", base + "/acts/" + actorPath(actor), headers: headers(k)) as? J)?["data"] as? J ?? [:]
    // The price list in force now (a future price change can already be listed after it).
    let infos = a["pricingInfos"] as? [J] ?? [], now = isoNow()
    let pricing = infos.filter { ($0["startedAt"] as? String ?? "") <= now }.sorted { ($0["startedAt"] as? String ?? "") < ($1["startedAt"] as? String ?? "") }.last ?? infos.last ?? [:]
    let model = pricing["pricingModel"] as? String ?? "PLATFORM_USAGE"
    // Pay per event plus compute time is not bounded by maxTotalChargeUsd.
    let usage = [pricing["isPayPerEventWithPlatformUsage"], pricing["isPayPerEventWithUsage"], pricing["chargePlatformUsage"]].contains { $0 as? Bool == true }
    var perItem = 0.0, start = 0.0
    switch model {
    case "PRICE_PER_DATASET_ITEM": perItem = pricing["pricePerUnitUsd"] as? Double ?? 0
    case "PAY_PER_EVENT":
      // Store actors list event prices per plan tier (eventTieredPricingUsd); the highest tier price is the safe one.
      let events = ((pricing["pricingPerEvent"] as? J)?["actorChargeEvents"] as? J) ?? [:]
      var primary: Double? = nil
      for (name, v) in events {
        let e = v as? J ?? [:]
        let tiers = ((e["eventTieredPricingUsd"] as? J) ?? [:]).values.compactMap { ($0 as? J)?["tieredEventPriceUsd"] as? Double }
        let price = e["eventPriceUsd"] as? Double ?? tiers.max() ?? 0
        if name.lowercased().contains("start") { start += price } else if e["isPrimaryEvent"] as? Bool == true { primary = max(primary ?? 0, price) } else { perItem = max(perItem, price) }
      }
      perItem = primary ?? perItem
    default: break
    }
    let minimum = pricing["minimalMaxTotalChargeUsd"] as? Double ?? 0
    let cappable = (model == "PRICE_PER_DATASET_ITEM" || model == "PAY_PER_EVENT") && !usage && minimum <= 1
    let estimate = start + perItem * Double(max(1, items))
    let maxUsd = cappable ? max(0.05, (estimate * 1.2 * 100).rounded(.up) / 100, (minimum * 100).rounded(.up) / 100) : 0
    return ["actor": actor, "title": a["title"] ?? actor, "pricing": model, "perItemUsd": perItem, "startUsd": start, "items": items, "maxUsd": maxUsd, "cappable": cappable,
            "monthUsd": monthUsd(), "capUsd": capUsd, "fitsCap": monthUsd() + maxUsd <= capUsd + 0.000001,
            "reason": cappable ? NSNull() : minimum > 1 ? String(format: "This Apify tool asks for a cost limit of at least $%.2f per run. It is not used.", minimum) : "This Apify tool is billed by compute time, so its cost cannot be capped. It is not used."]
  }

  // Runs an actor with a hard cost limit and returns {runId, status, items: [J], usd}. The caller has the student's confirmation.
  static func run(actor: String, input: J, maxUsd: Double, items: Int, purpose: String, onProgress: ((String) -> Void)? = nil) async throws -> J {
    guard let k = key else { throw APIError(422, "not_connected", "Connect Apify in Setup first.") }
    guard maxUsd > 0 else { throw APIError(422, "no_cap", "A cost limit is required.") }
    guard monthUsd() + maxUsd <= capUsd + 0.000001 else { throw APIError(422, "over_cap", String(format: "This would go over your monthly Apify limit ($%.2f). Raise it in Setup → Research.", capUsd)) }
    let q = "?maxTotalChargeUsd=\(String(format: "%.2f", maxUsd))&maxItems=\(max(1, items))&timeout=600"
    let started = (try await Net.json("POST", base + "/acts/" + actorPath(actor) + "/runs" + q, headers: headers(k), body: input) as? J)?["data"] as? J ?? [:]
    guard let runID = started["id"] as? String else { throw APIError(502, "apify", "Apify did not start the run.") }
    let entry: J = ["id": runID, "actor": actor, "purpose": purpose, "maxUsd": maxUsd, "usd": maxUsd, "status": "RUNNING", "at": isoNow()]
    store.upsert("runs", entry, limit: 500)
    var run = started
    let deadline = Date().addingTimeInterval(660)
    while ["READY", "RUNNING", "TIMING-OUT", "ABORTING"].contains(run["status"] as? String ?? ""), Date() < deadline {
      try await Task.sleep(nanoseconds: 3_000_000_000)
      run = (try await Net.json("GET", base + "/actor-runs/" + runID, headers: headers(k)) as? J)?["data"] as? J ?? run
      onProgress?(run["status"] as? String ?? "")
    }
    let status = run["status"] as? String ?? "UNKNOWN"
    let usd = run["usageTotalUsd"] as? Double ?? maxUsd
    store.update("runs", id: runID) { $0["status"] = status; $0["usd"] = min(usd, maxUsd) }
    guard status == "SUCCEEDED", let dataset = run["defaultDatasetId"] as? String else { throw APIError(502, "apify_run", "The Apify run ended with status \(status.lowercased()).") }
    let list = try await Net.json("GET", base + "/datasets/" + dataset + "/items?clean=true&format=json&limit=\(max(1, items))", headers: headers(k)) as? [J] ?? []
    return ["runId": runID, "status": status, "items": list, "usd": min(usd, maxUsd)]
  }
  static func abort(_ runID: String) async {
    guard let k = key else { return }
    _ = try? await Net.json("POST", base + "/actor-runs/" + runID + "/abort", headers: headers(k))
  }
}
