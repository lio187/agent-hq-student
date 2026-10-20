// Extension points: each area of the app (content, research, Creator Lab, makers, voice, brain, tools, AI-tool
// sign-in) answers its own API paths from its own file. The router asks each area in turn; nil means "not mine".
import Foundation

typealias ExtHandler = (_ method: String, _ path: String, _ r: HTTPRequest, _ router: Router) async throws -> Any?

enum Ext {
  // /api/hq/v1/… (the office pages)
  static let hq: [ExtHandler] = [ContentAPI.hq, ResearchAPI.hq, AnalysisAPI.hq, MakersAPI.hq, VoiceAPI.hq, BrainAPI.hq, ToolsAPI.hq, RuntimesAPI.hq, UpdatesAPI.hq]
  // /api/student/… (Setup), after the licence check
  static let student: [ExtHandler] = [RuntimesAPI.student, VoiceAPI.student, BrainAPI.student, ToolsAPI.student, ResearchAPI.student, AnalysisAPI.student, MakersAPI.student, ContentAPI.student, UpdatesAPI.student]
  // Checks a key before it is stored (POST /api/student/keys {name, key}).
  static let validators: [String: (String) async throws -> Void] = [KeyName.elevenlabs: VoiceAPI.validateKey, KeyName.apify: Apify.validateKey, KeyName.groq: AnalysisAPI.validateGroq, KeyName.typesafe: Jev.validateKey]
  // Once the engine is listening (background work such as a file watcher).
  static func launch(_ router: Router) { BrainAPI.launch(router); ResearchAPI.launch(router); UpdatesAPI.launch(router) }
  // Every 30 s while the app is open (the scheduler tick).
  static func tick(_ router: Router) { ResearchAPI.tick(router); ContentAPI.tick(router); UpdatesAPI.tick(router) }
}

// Added to every agent run the app starts.
enum RunHooks {
  static func addDirs() -> [String] { BrainAPI.addDirs() }
  static func env(runtime: String) -> [String: String] { ToolsAPI.runEnv().merging(RuntimesAPI.runEnv(runtime: runtime)) { $1 } }
}
