// The student's own business records, kept in the app (no code, no external CRM needed): leads, client projects,
// income and expenses, and the team. They feed Pipeline, Clients, Performance, Finance, Team and the revenue band.
import Foundation

enum Records {
  static let kinds: [String: String] = ["lead": "leads", "project": "projects", "entry": "entries", "person": "people"]
  static let leadStages = ["research", "contacted", "replied", "won", "excluded"]
  static var currency: String { Store.shared.setting("currency") as? String ?? "EUR" }
  private static let day: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f }()
  static func ymd(_ d: Date = Date()) -> String { day.string(from: d) }
  static func date(_ s: Any?) -> Date? { (s as? String).flatMap { day.date(from: String($0.prefix(10))) } }
  static func num(_ v: Any?) -> Double { (v as? Double) ?? (v as? Int).map(Double.init) ?? Double((v as? String ?? "").replacingOccurrences(of: ",", with: ".")) ?? 0 }
  static func list(_ kind: String) -> [J] { Store.shared.list(kinds[kind] ?? kind) }

  // Add, change or remove one record; returns the record (or ok for a delete).
  static func write(_ kind: String, _ body: J) throws -> Any {
    guard let key = kinds[kind] else { throw APIError(404, "not_found", "Unknown record type.") }
    let action = body["action"] as? String ?? (body["id"] == nil ? "add" : "update")
    let fields = body["fields"] as? J ?? body
    if action == "delete" {
      guard let id = body["id"] as? String else { throw APIError(422, "bad_request", "Choose a record.") }
      Store.shared.setList(key, Store.shared.list(key).filter { ($0["id"] as? String) != id })
      Store.shared.emit("records.updated", ["title": kind]); return ["ok": true]
    }
    var clean = try validate(kind, fields)
    if action == "update", let id = body["id"] as? String {
      var found: J?
      Store.shared.update(key, id: id) { r in
        let stageBefore = r["stage"] as? String
        for (k, v) in clean { r[k] = v }
        r["updatedAt"] = isoNow()
        if kind == "lead", let s = clean["stage"] as? String, s != stageBefore {
          var h = r["history"] as? [J] ?? []; h.append(["at": isoNow(), "id": newID("h"), "type": "stage." + s, "actor": "You", "verified": true]); r["history"] = h
        }
        found = r
      }
      guard let found else { throw APIError(404, "not_found", "This record no longer exists.") }
      Store.shared.emit("records.updated", ["title": kind]); return found
    }
    clean["id"] = newID(String(kind.prefix(1))); clean["createdAt"] = isoNow(); clean["updatedAt"] = isoNow()
    if kind == "lead" { clean["history"] = [["at": isoNow(), "id": newID("h"), "type": "record.created", "actor": "You", "verified": true]] }
    Store.shared.prepend(key, clean, limit: 5000)
    Store.shared.emit("records.updated", ["title": kind])
    return clean
  }

  private static func text(_ f: J, _ k: String, max: Int = 400) -> String { String((f[k] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(max)) }
  static func validate(_ kind: String, _ f: J) throws -> J {
    func need(_ v: String, _ label: String) throws -> String { if v.isEmpty { throw APIError(422, "missing", label + " is required.") }; return v }
    switch kind {
    case "lead":
      let stage = text(f, "stage");
      return ["company": try need(text(f, "company", max: 160), "Company"), "contact": text(f, "contact", max: 120), "email": text(f, "email", max: 160),
              "stage": leadStages.contains(stage) ? stage : "research", "source": text(f, "source", max: 60).isEmpty ? "other" : text(f, "source", max: 60), "owner": text(f, "owner", max: 120),
              "value": num(f["value"]), "nextAction": text(f, "nextAction", max: 240), "notes": text(f, "notes", max: 4000)]
    case "project":
      let status = text(f, "status")
      return ["project": try need(text(f, "project", max: 160), "Project"), "client": try need(text(f, "client", max: 160), "Client"),
              "status": ["green", "amber", "red", "frozen"].contains(status) ? status : "green", "priority": ["P0", "P1", "P2"].contains(text(f, "priority")) ? text(f, "priority") : "P1",
              "accountable_lead": text(f, "accountable_lead", max: 120), "next_milestone": text(f, "next_milestone", max: 200), "deadline": text(f, "deadline", max: 10), "notes": text(f, "notes", max: 4000)]
    case "entry":
      let amount = abs(num(f["amount"]))
      if amount <= 0 { throw APIError(422, "missing", "Enter an amount above zero.") }
      let d = text(f, "date", max: 10)
      return ["type": text(f, "type") == "expense" ? "expense" : "income", "date": date(d) == nil ? ymd() : d, "amount": amount,
              "currency": ["EUR", "USD", "GBP"].contains(text(f, "currency")) ? text(f, "currency") : currency, "status": text(f, "status") == "open" ? "open" : "paid",
              "counterparty": try need(text(f, "counterparty", max: 160), "Customer or supplier"), "client": text(f, "client", max: 160),
              "category": text(f, "category", max: 60).isEmpty ? "Other" : text(f, "category", max: 60), "description": text(f, "description", max: 240)]
    case "person":
      return ["person": try need(text(f, "person", max: 120), "Name"), "role": try need(text(f, "role", max: 120), "Role"), "manager": text(f, "manager", max: 120),
              "assignment": text(f, "assignment", max: 240), "status": text(f, "status", max: 40).isEmpty ? "Active" : text(f, "status", max: 40), "review_date": text(f, "review_date", max: 10)]
    default: throw APIError(404, "not_found", "Unknown record type.")
    }
  }

  // MARK: shapes the dashboard pages read
  static func outreach() -> J {
    let records: [J] = list("lead").map { l in
      var r = l; r["name"] = l["company"] ?? ""; r["accountId"] = "main"; r["drafts"] = [J](); r["visits"] = [J](); r["revision"] = 1
      r["blockers"] = (l["stage"] as? String) == "excluded" ? ["Not a fit right now"] : [String](); r["syncStatus"] = "local"; return r
    }
    return ["access": "owner", "accounts": [["id": "main", "canApprove": true]], "records": records, "campaigns": [J](), "jobs": [J](), "worker": ["mode": "local", "lastSeenAt": isoNow()],
            "stopped": false, "mode": "local", "source": ["status": "confirmed", "summary": ["leads": records.count, "source": "local", "readOnly": false, "checkedAt": isoNow()], "lastSuccessAt": isoNow()]]
  }
  static func delivery() -> J {
    let projects: [J] = list("project").map { p in
      var x = p; x["externalId"] = p["id"] ?? ""; x["builder"] = ""; x["client_blocker"] = ""; x["internal_blocker"] = ""; x["acceptance_evidence"] = ""; x["repository"] = ""
      x["source"] = "local"; x["version"] = "1"; x["syncState"] = "local"; x["providerUrl"] = NSNull(); x["evidenceStatus"] = ["repository": "", "acceptance": "", "execution": "", "note": ""]; return x
    }
    return ["projects": projects, "source": "Your projects", "scope": ["business": "all", "project": NSNull(), "sourceBusiness": "all", "note": ""], "observedAt": isoNow(), "stale": false, "via": "local", "proposed": ["present": false]]
  }
  // Income per period, from paid income entries.
  static func income(from: Date, to: Date, client: String? = nil) -> Double {
    list("entry").filter { e in
      guard (e["type"] as? String) == "income", (e["status"] as? String) == "paid", let d = date(e["date"]), d >= from, d < to else { return false }
      return client == nil || ((e["client"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? e["counterparty"] as? String) == client
    }.reduce(0) { $0 + num($1["amount"]) }
  }
  static func portfolio() -> J {
    let now = Date(), d30 = now.addingTimeInterval(-30 * 86400), d60 = now.addingTimeInterval(-60 * 86400)
    let clients = Array(Set(list("entry").filter { ($0["type"] as? String) == "income" }.compactMap { ($0["client"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? $0["counterparty"] as? String } + list("project").compactMap { $0["client"] as? String })).sorted()
    let performance: [J] = clients.map { c in
      let cur = income(from: d30, to: now.addingTimeInterval(86400), client: c), prev = income(from: d60, to: d30, client: c)
      let count = list("entry").filter { ($0["type"] as? String) == "income" && (($0["client"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? $0["counterparty"] as? String) == c && (date($0["date"]) ?? .distantPast) >= d30 }.count
      return ["owner": "You", "brand": c, "scope": "Direct clients", "source": "Your income entries", "currency": currency, "timezone": TimeZone.current.identifier, "current": cur, "previous": prev,
              "growth": prev > 0 ? (cur - prev) / prev : NSNull(), "count": count, "previous_count": 0, "complete": true, "definition": "Paid income in the last 30 days", "evidence_id": c]
    }
    return ["repositories": [J](), "client_groups": clients.map { ["client": $0, "repositories": [String](), "status": "Current", "finding": ""] as J }, "performance": performance, "stripe": [J](), "meta": [J](), "google": [J](),
            "brand_registry": [J](), "creatives": [J](), "managed_details": [J](), "period_current": ymd(d30) + " – " + ymd(now), "period_previous": ymd(d60) + " – " + ymd(d30), "generated_at": isoNow(),
            "agency_roster_count": clients.count, "evidence": [J](), "source": "local"]
  }
  static func crm() -> J {
    let leads = list("lead"), won = leads.filter { ($0["stage"] as? String) == "won" }
    let now = Date(), from = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: now)) ?? now
    return ["accounts": [["id": "main", "name": "Your pipeline", "organizationId": "local", "state": "connected", "observedAt": isoNow(),
      "counts": ["leads": leads.count, "appointments": leads.filter { ($0["stage"] as? String) == "replied" }.count, "payments": list("entry").filter { ($0["type"] as? String) == "income" && ($0["status"] as? String) == "paid" }.count, "contracts": won.count],
      "leads": leads.prefix(100).map { ["id": $0["id"] ?? "", "name": $0["company"] ?? "", "status": ["research": "New Lead", "contacted": "Contacted", "replied": "Appointment Booked", "won": "Won", "excluded": "Lost"][$0["stage"] as? String ?? ""] ?? "New Lead", "nextTouchAt": NSNull(), "updatedAt": $0["updatedAt"] ?? ""] as J },
      "leadSample": false, "from": ymd(from), "to": ymd(now), "currency": currency, "paidBeforeRefunds": income(from: from, to: now.addingTimeInterval(86400)), "signedContractValue": won.reduce(0) { $0 + num($1["value"]) }, "revenueNote": "From your entries"]]]
  }
  // This month's numbers for the revenue band and the dock meter.
  static func revenue() -> J {
    let entries = list("entry")
    guard !entries.isEmpty || !list("lead").isEmpty else {
      return ["source": "Finance", "state": "unavailable", "reason": "Add your income and expenses in Finance to see your revenue here.", "metrics": J(), "currency": currency, "period": "Month to date"]
    }
    let now = Date(), from = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: now)) ?? now, to = now.addingTimeInterval(86400)
    let month = entries.filter { (date($0["date"]) ?? .distantPast) >= from && (date($0["date"]) ?? .distantFuture) < to && ($0["status"] as? String) == "paid" }
    let rev = month.filter { ($0["type"] as? String) == "income" }.reduce(0) { $0 + num($1["amount"]) }
    let cost = month.filter { ($0["type"] as? String) == "expense" }.reduce(0) { $0 + num($1["amount"]) }
    let ads = month.filter { ($0["type"] as? String) == "expense" && ($0["category"] as? String) == "Advertising" }.reduce(0) { $0 + num($1["amount"]) }
    let leads = list("lead"), newLeads = leads.filter { (date($0["createdAt"]) ?? .distantPast) >= from }
    let won = leads.filter { ($0["stage"] as? String) == "won" && (date($0["updatedAt"]) ?? .distantPast) >= from }
    let wonValue = won.reduce(0) { $0 + num($1["value"]) }
    let metrics: J = ["revenue": rev, "revenue_mtd": rev, "ad_spend": ads, "ad_spend_mtd": ads, "roas": ads > 0 ? rev / ads : NSNull(), "deals_closed": won.count,
                      "avg_deal_value": won.isEmpty ? NSNull() : wonValue / Double(won.count), "leads_total": newLeads.count, "appointments_set": leads.filter { ($0["stage"] as? String) == "replied" }.count,
                      "conversion_rate": newLeads.isEmpty ? NSNull() : Double(won.count) / Double(newLeads.count) * 100, "profit": rev - cost]
    return ["source": "Your finance entries", "entity": "", "state": "connected", "snapshotDate": ymd(), "fetchedAt": now.timeIntervalSince1970 * 1000, "currency": currency, "period": "Month to date", "metrics": metrics, "ageDays": 0]
  }
  static func periodRevenue(_ q: [String: String]) -> J {
    let now = Date(), from = date(q["from"]) ?? Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: now)) ?? now, to = (date(q["to"]) ?? now).addingTimeInterval(86400)
    let paid = income(from: from, to: to)
    return ["source": "Your finance entries", "from": ymd(from), "to": ymd(to.addingTimeInterval(-86400)), "currency": currency, "account": "main", "scopeNote": "", "collectedNet": paid, "paid": paid, "refunds": 0,
            "signedContractValue": list("lead").filter { ($0["stage"] as? String) == "won" }.reduce(0) { $0 + num($1["value"]) }, "sync": ["status": "connected", "message": "Your entries", "lastSuccessAt": isoNow(), "historyComplete": true], "observedAt": isoNow(), "contractNote": ""]
  }
  // Finance register (open items and the balance), ledger (paid items) and the summary the Finance page charts.
  static func financeRegister() -> J {
    let entries = list("entry")
    var rows: [J] = entries.filter { ($0["status"] as? String) == "open" }.map { e in
      ["record_type": (e["type"] as? String) == "income" ? "receivable" : "payable", "counterparty": e["counterparty"] ?? "", "description": e["description"] ?? "", "currency": e["currency"] ?? currency,
       "amount": String(format: "%.2f", num(e["amount"])), "evidence_date": e["date"] ?? "", "due_or_payout_date": e["date"] ?? NSNull(), "confidence": "high", "status": (e["type"] as? String) == "income" ? "confirmed" : "open",
       "owner": "You", "cash_unlock": "", "recordId": e["id"] ?? ""]
    }
    let balance = entries.filter { ($0["status"] as? String) == "paid" }.reduce(0) { $0 + (($1["type"] as? String) == "income" ? 1 : -1) * num($1["amount"]) }
    if !entries.isEmpty { rows.insert(["record_type": "cash", "counterparty": "Your balance", "description": "Paid income minus paid expenses", "currency": currency, "amount": String(format: "%.2f", balance), "evidence_date": ymd(), "due_or_payout_date": NSNull(), "confidence": "high", "status": "confirmed", "owner": "You", "cash_unlock": "", "recordId": "balance"], at: 0) }
    return ["records": rows, "source": ["id": "local", "project": "finance", "observedAt": isoNow(), "scope": "local", "reference": "Your entries", "modifiedAt": isoNow(), "state": "current", "note": "Your own entries"]]
  }
  static func ledgerRows() -> [J] {
    list("entry").filter { ($0["status"] as? String) == "paid" }.sorted { ($0["date"] as? String ?? "") > ($1["date"] as? String ?? "") }.enumerated().map { i, e in
      let d = e["date"] as? String ?? ymd(), sign = (e["type"] as? String) == "income" ? 1.0 : -1.0
      return ["id": e["id"] ?? "", "date": d, "month": String(d.prefix(7)), "period": String(d.prefix(7)), "category": (e["type"] as? String) == "income" ? "Income · " + (e["category"] as? String ?? "") : (e["category"] as? String ?? "Other"),
              "subcategory": "", "description": [e["counterparty"] as? String, e["description"] as? String].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "), "amount": String(format: "%.2f", sign * num(e["amount"])),
              "account": "Business account", "cashCredit": "", "type": "entry", "status": "settled", "inPL": "yes", "sourceFile": "", "recordId": e["id"] ?? "", "dataRow": i + 1, "currency": e["currency"] ?? currency]
    }
  }
  static func ledger() -> J {
    let rows = ledgerRows()
    return ["records": rows, "source": ["id": "local", "project": "finance", "observedAt": isoNow(), "scope": "local", "reference": "Your entries", "modifiedAt": isoNow(), "state": "current", "note": "Your own entries"],
            "statusCounts": ["settled": rows.count, "declined": 0, "returned": 0, "reversed": 0]]
  }
  static func financeSummary() -> J {
    let reg = financeRegister()["records"] as? [J] ?? [], rows = ledgerRows()
    var byType: J = [:], counts: J = [:], countsByCurrency: J = [:]
    for r in reg {
      let t = r["record_type"] as? String ?? "", c = r["currency"] as? String ?? currency, s = r["status"] as? String ?? "", a = num(r["amount"])
      var bt = byType[t] as? J ?? [:]; var bc = bt[c] as? J ?? [:]; bc[s] = num(bc[s]) + a; bt[c] = bc; byType[t] = bt
      var ct = counts[t] as? J ?? [:]; ct[s] = (ct[s] as? Int ?? 0) + 1; counts[t] = ct
      var cc = countsByCurrency[t] as? J ?? [:]; var ccc = cc[c] as? J ?? [:]; ccc[s] = (ccc[s] as? Int ?? 0) + 1; cc[c] = ccc; countsByCurrency[t] = cc
    }
    let months = Array(Set(rows.compactMap { $0["month"] as? String })).sorted().map { m -> J in
      let r = rows.filter { ($0["month"] as? String) == m }
      return ["month": m, "inflow": r.filter { num($0["amount"]) > 0 }.reduce(0) { $0 + num($1["amount"]) }, "outflow": -r.filter { num($0["amount"]) < 0 }.reduce(0) { $0 + num($1["amount"]) }, "settled": r.count, "declined": 0, "reversed": 0, "returned": 0]
    }
    let categories = Array(Set(rows.compactMap { $0["category"] as? String })).sorted().map { c -> J in
      let r = rows.filter { ($0["category"] as? String) == c }
      return ["category": c, "inflow": r.filter { num($0["amount"]) > 0 }.reduce(0) { $0 + num($1["amount"]) }, "outflow": -r.filter { num($0["amount"]) < 0 }.reduce(0) { $0 + num($1["amount"]) }, "count": r.count]
    }
    let cash = reg.filter { ($0["record_type"] as? String) == "cash" }.map { ["counterparty": $0["counterparty"] ?? "", "description": $0["description"] ?? "", "currency": $0["currency"] ?? currency, "amount": num($0["amount"]), "status": "confirmed", "evidenceDate": ymd(), "provider": "Your entries"] as J }
    return ["asOf": ymd(), "register": ["byType": byType, "counts": counts, "countsByCurrency": countsByCurrency, "missingAmounts": J(), "cash": cash, "rows": reg.count],
            "ledger": ["months": months, "categories": categories, "excluded": [String](), "currency": currency, "rows": rows.count, "statusCounts": ["settled": rows.count, "declined": 0, "returned": 0, "reversed": 0],
                       "first": orNull(rows.last?["date"]), "last": orNull(rows.first?["date"])],
            "source": ["register": ["reference": "Your entries", "observedAt": isoNow()], "ledger": ["reference": "Your entries", "observedAt": isoNow()], "exports": [J](), "note": "Your own entries"]]
  }
  static func people() -> J {
    ["records": list("person").map { p in ["person": p["person"] ?? "", "role": p["role"] ?? "", "temporary_status": p["status"] ?? "Active", "manager": p["manager"] ?? "", "approved_assignment": p["assignment"] ?? "",
                                            "cost_basis": "", "monthly_cap_usd": "", "review_date": p["review_date"] ?? "", "continuation_condition": "", "recordId": p["id"] ?? ""] as J },
     "source": ["id": "local", "project": "people", "observedAt": isoNow(), "scope": "local", "reference": "Your team", "modifiedAt": isoNow(), "state": "current", "note": "Your own team list"]]
  }
}
