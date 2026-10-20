// A small HTTP/1.1 + WebSocket server on 127.0.0.1 (Network.framework), used only by the app's own window.
import Foundation
import Network
import CryptoKit

typealias J = [String: Any]

struct HTTPRequest {
  let method: String
  let path: String            // decoded path, no query
  let query: [String: String]
  let headers: [String: String]   // lower-cased names
  let body: Data
  var json: J { (try? JSONSerialization.jsonObject(with: body)) as? J ?? [:] }
  func cookie(_ name: String) -> String? {
    for part in (headers["cookie"] ?? "").split(separator: ";") {
      let kv = part.split(separator: "=", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
      if kv.count == 2 && kv[0] == name { return kv[1] }
    }
    return nil
  }
}

struct HTTPResponse {
  var status: Int
  var headers: [String: String] = [:]
  var body: Data = Data()
  // A streamed body (chunked): the closure writes pieces as they come (for example speech audio).
  var stream: ((_ write: @escaping (Data) async -> Void) async -> Void)? = nil
  static func streamed(type: String, _ body: @escaping (_ write: @escaping (Data) async -> Void) async -> Void) -> HTTPResponse {
    HTTPResponse(status: 200, headers: ["Content-Type": type, "Cache-Control": "no-store"], stream: body)
  }
  static func json(_ value: Any, status: Int = 200) -> HTTPResponse {
    let data = (try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])) ?? Data("null".utf8)
    return HTTPResponse(status: status, headers: ["Content-Type": "application/json", "Cache-Control": "no-store"], body: data)
  }
  static func error(_ status: Int, _ code: String, _ message: String) -> HTTPResponse { .json(["error": ["code": code, "message": message]], status: status) }
  static func data(_ data: Data, type: String, cache: String = "no-cache") -> HTTPResponse { HTTPResponse(status: 200, headers: ["Content-Type": type, "Cache-Control": cache], body: data) }
  static func redirect(_ location: String, headers extra: [String: String] = [:]) -> HTTPResponse {
    var h = extra; h["Location"] = location; h["Cache-Control"] = "no-store"; return HTTPResponse(status: 302, headers: h)
  }
}

// A connected WebSocket client: the server sends text or binary frames; messages from the page (text, binary,
// fragmented) go to onMessage; pings are answered; a message over 1 MB closes the socket.
final class WSClient {
  let connection: NWConnection
  var onClose: (() -> Void)?
  var onMessage: ((_ opcode: UInt8, _ data: Data) -> Void)?
  private var closed = false
  private let closeLock = NSLock()
  init(_ c: NWConnection) { connection = c }
  func send(text: String) { send(opcode: 0x1, Data(text.utf8)) }
  func send(binary: Data) { send(opcode: 0x2, binary) }
  private func send(opcode: UInt8, _ data: Data) {
    let n = data.count
    var head = Data([0x80 | opcode])
    if n < 126 { head.append(UInt8(n)) }
    else if n < 65536 { head.append(126); head.append(UInt8(n >> 8)); head.append(UInt8(n & 0xff)) }
    else { head.append(127); for i in (0..<8).reversed() { head.append(UInt8((UInt64(n) >> (UInt64(i) * 8)) & 0xff)) } }
    connection.send(content: head + data, completion: .contentProcessed { _ in })
  }
  func close(code: UInt16 = 1000) {
    connection.send(content: Data([0x88, 2, UInt8(code >> 8), UInt8(code & 0xff)]), completion: .contentProcessed { [weak self] _ in self?.connection.cancel() })
    finish()
  }
  private func finish() {
    closeLock.lock(); let first = !closed; closed = true; closeLock.unlock()
    if first { onClose?() }
  }
  func readLoop(_ buffer: Data = Data(), _ partial: (opcode: UInt8, data: Data)? = nil) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, error in
      guard let self else { return }
      var buf = buffer, pending = partial
      if let data { buf.append(data) }
      while let frame = WSClient.frame(buf) {
        buf.removeFirst(frame.size)
        switch frame.opcode {
        case 0x8: self.connection.send(content: Data([0x88, 0]), completion: .contentProcessed { _ in self.connection.cancel() }); self.finish(); return
        case 0x9: self.connection.send(content: Data([0x8a, UInt8(min(frame.payload.count, 125))]) + frame.payload.prefix(125), completion: .contentProcessed { _ in })
        case 0xA: break
        case 0x1, 0x2:
          if frame.fin { self.onMessage?(frame.opcode, frame.payload) } else { pending = (frame.opcode, frame.payload) }
        case 0x0:
          guard var p = pending else { break }
          p.data.append(frame.payload); pending = p
          if p.data.count > 1 << 20 { self.close(code: 1009); return }
          if frame.fin { self.onMessage?(p.opcode, p.data); pending = nil }
        default: self.close(code: 1002); return
        }
      }
      if buf.count > 1 << 20 { self.close(code: 1009); return }
      if done || error != nil { self.connection.cancel(); self.finish(); return }
      self.readLoop(buf, pending)
    }
  }
  static func frame(_ b: Data) -> (opcode: UInt8, fin: Bool, payload: Data, size: Int)? {
    let bytes = [UInt8](b); guard bytes.count >= 2 else { return nil }
    let opcode = bytes[0] & 0x0f, fin = bytes[0] & 0x80 != 0, masked = bytes[1] & 0x80 != 0
    var len = Int(bytes[1] & 0x7f), offset = 2
    if len == 126 { guard bytes.count >= 4 else { return nil }; len = Int(bytes[2]) << 8 | Int(bytes[3]); offset = 4 }
    else if len == 127 { guard bytes.count >= 10 else { return nil }; len = 0; for i in 2..<10 { len = len << 8 | Int(bytes[i]) }; offset = 10 }
    let maskAt = offset; if masked { offset += 4 }
    guard bytes.count >= offset + len else { return nil }
    var payload = Array(bytes[offset..<(offset + len)])
    if masked { for i in 0..<len { payload[i] ^= bytes[maskAt + (i % 4)] } }
    return (opcode, fin, Data(payload), offset + len)
  }
}

final class HTTPServer {
  private var listener: NWListener?
  private let queue = DispatchQueue(label: "hq.http", attributes: .concurrent)
  private(set) var port: UInt16 = 0
  var handle: ((HTTPRequest) async -> HTTPResponse)!
  var upgrade: ((HTTPRequest, WSClient) -> (() -> Void)?)!   // accept a WebSocket: returns what to run once it is open

  // Listens on 127.0.0.1 (a fixed port when given, otherwise any free port); calls ready with the port.
  func start(port fixed: UInt16 = 0, ready: @escaping (UInt16) -> Void, failed: @escaping (Error) -> Void) {
    do {
      let params = NWParameters.tcp
      params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: fixed) ?? .any)
      params.allowLocalEndpointReuse = true
      let l = try NWListener(using: params)
      l.newConnectionHandler = { [weak self] c in self?.accept(c) }
      l.stateUpdateHandler = { [weak self] state in
        switch state {
        case .ready: self?.port = l.port?.rawValue ?? 0; ready(self?.port ?? 0)
        case .failed(let e): failed(e)
        default: break
        }
      }
      listener = l; l.start(queue: queue)
    } catch { failed(error) }
  }

  private func accept(_ c: NWConnection) {
    // Loopback peers only.
    if case let .hostPort(host, _) = c.endpoint, "\(host)" != "127.0.0.1" && "\(host)" != "::1" { c.cancel(); return }
    c.start(queue: DispatchQueue(label: "hq.conn"))
    read(c, Data())
  }

  private func read(_ c: NWConnection, _ buffer: Data) {
    c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, done, error in
      guard let self else { return }
      var buf = buffer; if let data { buf.append(data) }
      if buf.count > 8 << 20 { c.cancel(); return }  // 8 MB per request at most
      if let (req, used) = HTTPServer.parse(buf) {
        buf.removeFirst(used)
        if (req.headers["upgrade"] ?? "").lowercased() == "websocket", let key = req.headers["sec-websocket-key"] {
          let client = WSClient(c)
          guard let opened = self.upgrade(req, client) else { self.send(c, .error(403, "forbidden", "Forbidden."), keepAlive: false); return }
          let accept = Data(Insecure.SHA1.hash(data: Data((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8))).base64EncodedString()
          c.send(content: Data("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n".utf8), completion: .contentProcessed { _ in opened(); client.readLoop() })
          return
        }
        Task {
          let res = await self.handle(req)
          if res.stream != nil { await self.sendStream(c, res) } else { self.send(c, res, keepAlive: true) }
          self.read(c, buf)
        }
        return
      }
      if done || error != nil { c.cancel(); return }
      self.read(c, buf)
    }
  }

  private func send(_ c: NWConnection, _ r: HTTPResponse, keepAlive: Bool) {
    var head = "HTTP/1.1 \(r.status) \(HTTPServer.reason(r.status))\r\n"
    var headers = r.headers
    headers["Content-Length"] = String(r.body.count)
    headers["Connection"] = keepAlive ? "keep-alive" : "close"
    headers["X-Content-Type-Options"] = "nosniff"
    headers["Referrer-Policy"] = "no-referrer"
    for (k, v) in headers { head += "\(k): \(v)\r\n" }
    head += "\r\n"
    c.send(content: Data(head.utf8) + r.body, completion: .contentProcessed { _ in if !keepAlive { c.cancel() } })
  }

  // Chunked transfer: headers first, then each piece as it is written, then the end marker.
  private func sendStream(_ c: NWConnection, _ r: HTTPResponse) async {
    var head = "HTTP/1.1 \(r.status) \(HTTPServer.reason(r.status))\r\n"
    var headers = r.headers
    headers["Transfer-Encoding"] = "chunked"; headers["Connection"] = "keep-alive"; headers["X-Content-Type-Options"] = "nosniff"; headers["Referrer-Policy"] = "no-referrer"
    for (k, v) in headers { head += "\(k): \(v)\r\n" }
    head += "\r\n"
    func put(_ d: Data) async { await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in c.send(content: d, completion: .contentProcessed { _ in cont.resume() }) } }
    await put(Data(head.utf8))
    await r.stream?({ piece in guard !piece.isEmpty else { return }; await put(Data(String(piece.count, radix: 16).utf8) + Data("\r\n".utf8) + piece + Data("\r\n".utf8)) })
    await put(Data("0\r\n\r\n".utf8))
  }

  static func parse(_ buf: Data) -> (HTTPRequest, Int)? {
    guard let end = buf.range(of: Data("\r\n\r\n".utf8)) else { return nil }
    guard let head = String(data: buf[buf.startIndex..<end.lowerBound], encoding: .utf8) else { return nil }
    var lines = head.components(separatedBy: "\r\n")
    let first = lines.removeFirst().split(separator: " ")
    guard first.count >= 2 else { return nil }
    var headers: [String: String] = [:]
    for l in lines { if let i = l.firstIndex(of: ":") { headers[l[..<i].lowercased()] = l[l.index(after: i)...].trimmingCharacters(in: .whitespaces) } }
    let length = Int(headers["content-length"] ?? "0") ?? 0
    let bodyStart = end.upperBound - buf.startIndex
    guard buf.count >= bodyStart + length else { return nil }
    let body = buf.subdata(in: (buf.startIndex + bodyStart)..<(buf.startIndex + bodyStart + length))
    let target = String(first[1])
    let comps = URLComponents(string: target)
    var query: [String: String] = [:]
    for item in comps?.queryItems ?? [] { query[item.name] = item.value ?? "" }
    let path = comps?.percentEncodedPath.removingPercentEncoding ?? target
    return (HTTPRequest(method: String(first[0]), path: path, query: query, headers: headers, body: body), bodyStart + length)
  }

  static func reason(_ s: Int) -> String {
    [200: "OK", 204: "No Content", 206: "Partial Content", 302: "Found", 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found",
     405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable"][s] ?? "OK"
  }
}
