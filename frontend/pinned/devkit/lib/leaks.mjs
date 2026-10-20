// Leak scan for the developer kit: owner names, handles, businesses, clients, products that stay private, local
// paths, addresses and credentials. Any hit fails the export. This file lives outside the kit and is never copied.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative, extname} from 'node:path';

export const DENY = [
  // the owner and accounts
  /\bLeon\b/i, /ghatas/i, /\bLio\b/, /\bliogpt\b/i, /@lio\b/i, /novusordos/i, /\blio187\b/i, /\bLeon[- ]?OS\b/i,
  // businesses, brands and clients (as data)
  /187n\.(ai|io)/i, /\b187n-(delivery|site|group|growth|ops)\b/i, /AI Operator/i, /theaioperator/i, /\btao\b/, /Voltera/i, /Wealth Kings/i,
  /Winners? Center/i, /\bTWC\b/, /Remeha/i, /Cheat ?Daze/i, /Marina Yachts/i, /Bram Konings/i, /Honey World/i, /Amado/i, /\bMiio\b/i, /Opzeg/i,
  /MANILAI/i, /H[äa]rman/i, /Kosso/i, /Leugendetector/i, /Meroda/i, /Sprints/i, /Oetker/i, /\bMiele\b/i, /Winvent/i, /Veltman/i, /GetFloors/i,
  /Cellsius/i, /\bHears\b/i, /Dore ?& ?Rose/i, /Gr[üu]ns/i, /\bRhode\b/i, /Nuam[oō]re/i, /ICON Amsterdam/i, /\bAVJ\b/, /FL[ÂA]NEUR/i, /Vida Loca/i,
  /Grand Voyage/i, /Kitchen Royal/i, /Frisse Kliko/i, /Paw ?Parent/i, /Forge ?Waters/i, /Credom/i, /ZZP ?Centrale/i, /Leendert/i, /Robert Nass/i,
  /Makassar/i, /\bJev\b/i, /Rasiya/i, /Hermon/i, /\bHex\b/,
  // private products (the creative engine and owner tools)
  /Creative (Engine|Machine)/i, /Content ?OS/i, /Creator ?Lab/i, /Brand ?Factory/i, /Setter ?Studio/i, /Team ?Hub/i, /Content Engine/i,
  /Story ?factory/i, /Carousel ?factory/i, /Higgsfield/i, /Seedance/i, /Zernio/i, /Leadinfo/i,
  // machine and network details, credentials
  /\/Users\//, /(?<!~\/)\.hermes\b/, /\bts\.net\b/i, /tailnet/i, /\b[\w.+-]+@(?!example\.(com|org)\b)[\w-]+\.[\w.]{2,}\b/, /\+\d{1,3}[ -]\d[\d -]{6,12}\d\b/, /\b06[ -]?\d{8}\b/,
  /\bsk-[A-Za-z0-9]{16,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bxox[bp]-/, /\bAIza[0-9A-Za-z_-]{20,}/, /\bpat[A-Za-z0-9]{14}\.[a-f0-9]{20,}/,
];
const TEXT = new Set(['.js', '.mjs', '.cjs', '.json', '.css', '.html', '.md', '.txt', '.swift', '.plist', '.sh', '.svg', '']);
// Generated or third-party files that are checked for credentials only.
const VENDOR = /(^|\/)(vendor\/three\.|node_modules\/)/;

export function scan(root, {allow = [], deny = DENY} = {}) {
  const hits = [];
  const visit = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name), rel = relative(root, path);
      if (statSync(path).isDirectory()) { visit(path); continue }
      // file names count too
      for (const re of deny) if (re.test(name)) hits.push({file: rel, line: 0, match: name, rule: String(re)});
      if (!TEXT.has(extname(name))) continue;
      const text = readFileSync(path, 'utf8'), rules = VENDOR.test(rel) ? DENY.slice(-5) : deny;
      text.split('\n').forEach((line, i) => {
        for (const re of rules) {
          const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
          for (const m of line.matchAll(g)) {
            if (allow.some(a => a.file.test(rel) && a.match.test(m[0]))) continue;
            hits.push({file: rel, line: i + 1, match: m[0], rule: String(re), context: line.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)});
          }
        }
      });
    }
  };
  visit(root);
  return hits;
}
