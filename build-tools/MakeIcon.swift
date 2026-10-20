// Renders the app icon: the 187N infinity mark on a dark macOS-style rounded square (1024 px master).
import Cocoa
let args = CommandLine.arguments, logoPath = args[1], out = args[2]
let size: CGFloat = 1024, inset: CGFloat = 100, box = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let shape = NSBezierPath(roundedRect: box, xRadius: 185, yRadius: 185)
NSGraphicsContext.current?.saveGraphicsState()
let shadow = NSShadow(); shadow.shadowColor = NSColor(white: 0, alpha: 0.45); shadow.shadowBlurRadius = 28; shadow.shadowOffset = NSSize(width: 0, height: -10); shadow.set()
NSColor(srgbRed: 0.03, green: 0.035, blue: 0.04, alpha: 1).setFill(); shape.fill()
NSGraphicsContext.current?.restoreGraphicsState()
NSGradient(colors: [NSColor(srgbRed: 0.17, green: 0.175, blue: 0.195, alpha: 1), NSColor(srgbRed: 0.05, green: 0.055, blue: 0.062, alpha: 1)])!.draw(in: shape, angle: -90)
// A soft light behind the mark lifts the dark chrome (brand rule: the infinity stays visible, never a silhouette).
NSGraphicsContext.current?.saveGraphicsState(); shape.addClip()
NSGradient(colors: [NSColor(white: 1, alpha: 0.30), NSColor(white: 1, alpha: 0.0)])!.draw(fromCenter: NSPoint(x: size / 2, y: size / 2 + 10), radius: 0, toCenter: NSPoint(x: size / 2, y: size / 2 + 10), radius: 360, options: [])
NSGraphicsContext.current?.restoreGraphicsState()
NSColor(white: 1, alpha: 0.10).setStroke(); shape.lineWidth = 3; shape.stroke()
if let logo = NSImage(contentsOfFile: logoPath) {
  let w = box.width * 0.72, h = w * logo.size.height / logo.size.width
  logo.draw(in: NSRect(x: (size - w) / 2, y: (size - h) / 2, width: w, height: h), from: .zero, operation: .sourceOver, fraction: 1)
}
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
