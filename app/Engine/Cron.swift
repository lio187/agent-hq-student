// Five-field cron schedules (minute hour day month weekday) for routines: numbers, *, */n, a-b, a-b/n and lists.
import Foundation

struct Cron {
  let fields: [Set<Int>]   // minute, hour, day, month, weekday (0 = Sunday)
  let dayAny: Bool, weekdayAny: Bool
  init?(_ expr: String) {
    let parts = expr.split(separator: " ").map(String.init)
    guard parts.count == 5 else { return nil }
    let ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
    var out: [Set<Int>] = []
    for (i, p) in parts.enumerated() {
      var set = Set<Int>()
      for item in p.split(separator: ",") {
        let stepParts = item.split(separator: "/"); let step = stepParts.count == 2 ? Int(stepParts[1]) ?? 1 : 1
        var lo = ranges[i].0, hi = ranges[i].1
        let base = String(stepParts[0])
        if base != "*" {
          let r = base.split(separator: "-").compactMap { Int($0) }
          guard !r.isEmpty else { return nil }
          lo = r[0]; hi = r.count == 2 ? r[1] : (stepParts.count == 2 ? ranges[i].1 : r[0])
        }
        guard lo >= ranges[i].0, hi <= ranges[i].1, lo <= hi, step > 0 else { return nil }
        for v in stride(from: lo, through: hi, by: step) { set.insert(i == 4 && v == 7 ? 0 : v) }
      }
      out.append(set)
    }
    fields = out; dayAny = parts[2] == "*"; weekdayAny = parts[4] == "*"
  }
  func matches(_ d: Date, _ cal: Calendar = .current) -> Bool {
    let c = cal.dateComponents([.minute, .hour, .day, .month, .weekday], from: d)
    guard fields[0].contains(c.minute!), fields[1].contains(c.hour!), fields[3].contains(c.month!) else { return false }
    let day = fields[2].contains(c.day!), wd = fields[4].contains(c.weekday! - 1)
    if dayAny || weekdayAny { return day && wd }
    return day || wd
  }
  // The next matching minute after `after` (within a year).
  func next(after: Date) -> Date? {
    let cal = Calendar.current
    // The start of the minute after `after` (date(bySetting:) searches forward and skipped a minute, so routines never came due).
    let b = after.addingTimeInterval(60)
    var d = cal.dateInterval(of: .minute, for: b)?.start ?? b
    if d <= after { d = d.addingTimeInterval(60) }
    for _ in 0..<(366 * 24 * 60) { if matches(d, cal) { return d }; d = d.addingTimeInterval(60) }
    return nil
  }
  // Plain-English summary for the common cases.
  static func describe(_ expr: String) -> String {
    let p = expr.split(separator: " ").map(String.init); guard p.count == 5 else { return expr }
    let time = (Int(p[1]).map { String(format: "%02d", $0) } ?? p[1]) + ":" + (Int(p[0]).map { String(format: "%02d", $0) } ?? p[0])
    if p[0].hasPrefix("*/"), p[1] == "*", p[2] == "*", p[4] == "*" { return "Every \(p[0].dropFirst(2)) minutes" }
    if Int(p[0]) != nil, p[1].hasPrefix("*/") { return "Every \(p[1].dropFirst(2)) hours" }
    if Int(p[0]) != nil, p[1] == "*" { return "Every hour at :" + String(format: "%02d", Int(p[0])!) }
    if Int(p[0]) != nil, Int(p[1]) != nil, p[2] == "*", p[3] == "*" {
      if p[4] == "*" { return "Every day at \(time)" }
      if p[4] == "1-5" { return "Weekdays at \(time)" }
      let names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]
      if let w = Int(p[4]) { return "\(names[w]) at \(time)" }
    }
    return expr
  }
}
