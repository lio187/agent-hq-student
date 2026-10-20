'use strict';
// Brain layout worker (7 October 2026). Plain script served from /static (CSP script-src 'self'), no imports.
// pack: deterministic 3D layout. Clusters (communities or folders) sit on a Fibonacci sphere, the notes of a
//       cluster fill a golden-angle ball around its centre (best-linked notes in the middle), and notes without
//       links form a dim outer shell.
// force: starts from pack and runs 300 iterations of springs (links), short-range repulsion (grid) and a pull
//       to the cluster centre; positions are posted every 100 ms as a transferable Float32Array. Above 2,500
//       linked-or-not notes the worker answers with pack only, so the whole workspace stays responsive.
var FORCE_LIMIT = 2500, ITERATIONS = 300, TICK_MS = 100, SPACING = 7;
var GOLDEN = Math.PI * (3 - Math.sqrt(5));

function rng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sunflower(j, count) {
  var r = count <= 1 ? 0 : Math.sqrt((j + 0.5) / count), a = j * GOLDEN;
  return [Math.cos(a) * r, Math.sin(a) * r, 0];
}

function fibonacci(j, count) {
  var y = 1 - 2 * (j + 0.5) / count, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = j * GOLDEN;
  return [Math.cos(phi) * r, y, Math.sin(phi) * r];
}

// dims 3: clusters on a sphere, balls inside, shell outside. dims 2 (simple view): clusters on a sunflower
// disk, discs inside, an annulus of unlinked notes outside; z stays 0.
function pack(n, groups, degree, seed, dims) {
  var flat = dims === 2, pos = new Float32Array(3 * n), centres = new Float32Array(3 * n), random = rng(seed || 1);
  var zj = flat ? 0 : 1;
  var members = new Map(), isolated = [], i, j;
  for (i = 0; i < n; i++) {
    var g = groups[i];
    if (g < 0) { isolated.push(i); continue; }
    if (!members.has(g)) members.set(g, []);
    members.get(g).push(i);
  }
  var list = Array.from(members.entries()).sort(function (a, b) { return b[1].length - a[1].length || a[0] - b[0]; });
  // Big clusters get looser balls (spacing grows slowly with size) so dense folders stay readable.
  var radii = list.map(function (entry) { var m = entry[1].length, loose = 1.1 + 0.25 * Math.log10(Math.max(1, m / 100)); return SPACING * Math.max(1.1, loose) * (flat ? Math.sqrt(m) : Math.cbrt(m)) + 3; });
  var maxR = radii.length ? radii[0] : 0, area = 0;
  for (i = 0; i < radii.length; i++) area += (radii[i] + SPACING * 2) * (radii[i] + SPACING * 2);
  var sphere = list.length <= 1 ? 0 : flat ? Math.max(maxR * 1.2, Math.sqrt(area / 0.55)) : Math.max(maxR * 1.6, Math.sqrt(area / 2.2));
  for (var k = 0; k < list.length; k++) {
    var centre = flat ? sunflower(k, list.length) : k === 0 && list.length > 1 && list[0][1].length > 3 * (list[1] ? list[1][1].length : 0) ? [0, 0, 0] : fibonacci(k, list.length);
    var cx = centre[0] * sphere, cy = centre[1] * sphere, cz = centre[2] * sphere;
    var nodes = list[k][1].slice().sort(function (a, b) { return degree[b] - degree[a] || a - b; }), m = nodes.length, r = radii[k];
    for (j = 0; j < m; j++) {
      var dir = flat ? [Math.cos(j * GOLDEN), Math.sin(j * GOLDEN), 0] : fibonacci(j, m), rad = r * (flat ? Math.sqrt((j + 0.5) / m) : Math.cbrt((j + 0.5) / m)), p = 3 * nodes[j];
      pos[p] = cx + dir[0] * rad + (random() - 0.5) * 0.6;
      pos[p + 1] = cy + dir[1] * rad + (random() - 0.5) * 0.6;
      pos[p + 2] = cz + dir[2] * rad + (random() - 0.5) * 0.6 * zj;
      centres[p] = cx; centres[p + 1] = cy; centres[p + 2] = cz;
    }
  }
  var shell = Math.max(sphere + maxR + SPACING * 4, flat ? 0 : SPACING * 0.35 * Math.sqrt(isolated.length), SPACING * 6);
  var outer = Math.sqrt(shell * shell + isolated.length * SPACING * SPACING * 0.5 / Math.PI);
  for (j = 0; j < isolated.length; j++) {
    var q = 3 * isolated[j];
    if (flat) {
      var ring = Math.sqrt(shell * shell + (outer * outer - shell * shell) * (j + 0.5) / isolated.length), angle = j * GOLDEN;
      pos[q] = Math.cos(angle) * ring; pos[q + 1] = Math.sin(angle) * ring; pos[q + 2] = 0;
    } else {
      var d = fibonacci(j, isolated.length), s = shell + (random() - 0.5) * SPACING * 1.6;
      pos[q] = d[0] * s; pos[q + 1] = d[1] * s; pos[q + 2] = d[2] * s;
    }
    centres[q] = pos[q]; centres[q + 1] = pos[q + 1]; centres[q + 2] = pos[q + 2];
  }
  pack.centres = centres;
  return pos;
}

// Force model in the spirit of d3-force: links pull with strength 1/min(degree) toward a rest length,
// every linked note repels every other (1/d, all pairs up to 1,200 linked notes, a coarse grid above),
// a weak pull keeps each community together, the cloud stays centred and the shell of unlinked notes is
// re-placed just outside it. Forces scale with a cooling alpha; velocity decays by 40% per iteration.
function createForce(n, src, dst, groups, degree, seed, dims) {
  var pos = pack(n, groups, degree, seed, dims), linked = [], isolated = [], dirs = new Float32Array(3 * n), i;
  for (i = 0; i < n; i++) {
    if (groups[i] < 0) {
      isolated.push(i);
      var len = Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]) || 1;
      dirs[3 * i] = pos[3 * i] / len; dirs[3 * i + 1] = pos[3 * i + 1] / len; dirs[3 * i + 2] = pos[3 * i + 2] / len;
    } else linked.push(i);
  }
  var count = new Float32Array(n);
  for (var k = 0; k < src.length; k++) { count[src[k]]++; count[dst[k]]++; }
  return { n: n, pos: pos, anchors: pack.centres, vel: new Float32Array(3 * n), force: new Float32Array(3 * n), src: src, dst: dst, groups: groups,
    linked: Int32Array.from(linked), isolated: Int32Array.from(isolated), dirs: dirs, count: count, flat: dims === 2, iteration: 0, total: ITERATIONS };
}

function stepForce(st, count) {
  var pos = st.pos, vel = st.vel, f = st.force, groups = st.groups, anchors = st.anchors, linked = st.linked, deg = st.count;
  var L = SPACING * 3, KR = 30, KA = 0.02, KG = 0.04, DECAY = 0.6, MIN2 = 1, CELL = SPACING * 8, VMAX = 24;
  for (var c = 0; c < count && st.iteration < st.total; c++, st.iteration++) {
    var alpha = Math.pow(0.001, st.iteration / st.total), i, j, k, a, b, t, m = linked.length;
    f.fill(0);
    for (k = 0; k < st.src.length; k++) {
      a = st.src[k]; b = st.dst[k];
      if (groups[a] < 0 || groups[b] < 0 || a === b) continue;
      var ax = 3 * a, bx = 3 * b, dx = pos[bx] - pos[ax], dy = pos[bx + 1] - pos[ax + 1], dz = pos[bx + 2] - pos[ax + 2];
      // The better-linked end moves less (d3 bias), so hubs do not overshoot.
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6, s = (dist - L) / dist * alpha / Math.min(deg[a], deg[b]), bias = deg[a] / (deg[a] + deg[b]);
      f[ax] += dx * s * (1 - bias); f[ax + 1] += dy * s * (1 - bias); f[ax + 2] += dz * s * (1 - bias);
      f[bx] -= dx * s * bias; f[bx + 1] -= dy * s * bias; f[bx + 2] -= dz * s * bias;
    }
    var repel = function (p, q) {
      var px = 3 * p, qx = 3 * q, ex = pos[px] - pos[qx], ey = pos[px + 1] - pos[qx + 1], ez = pos[px + 2] - pos[qx + 2], d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < MIN2) d2 = MIN2;
      var r = KR * alpha / d2;
      f[px] += ex * r; f[px + 1] += ey * r; f[px + 2] += ez * r;
      f[qx] -= ex * r; f[qx + 1] -= ey * r; f[qx + 2] -= ez * r;
    };
    if (m <= 1200) {
      for (i = 0; i < m; i++) for (j = i + 1; j < m; j++) repel(linked[i], linked[j]);
    } else {
      var grid = new Map();
      for (i = 0; i < m; i++) {
        a = linked[i];
        var key = Math.floor(pos[3 * a] / CELL) + ',' + Math.floor(pos[3 * a + 1] / CELL) + ',' + Math.floor(pos[3 * a + 2] / CELL), cell = grid.get(key);
        if (cell) cell.push(a); else grid.set(key, [a]);
      }
      for (i = 0; i < m; i++) {
        a = linked[i];
        var gx = Math.floor(pos[3 * a] / CELL), gy = Math.floor(pos[3 * a + 1] / CELL), gz = Math.floor(pos[3 * a + 2] / CELL);
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) for (var oz = -1; oz <= 1; oz++) {
          var near = grid.get((gx + ox) + ',' + (gy + oy) + ',' + (gz + oz));
          if (near) for (t = 0; t < near.length; t++) if (near[t] > a) repel(a, near[t]);
        }
      }
    }
    var cx = 0, cy = 0, cz = 0;
    for (i = 0; i < m; i++) {
      a = 3 * linked[i];
      // Community anchor plus a gentle gravity, so small separate components stay in view.
      f[a] += ((anchors[a] - pos[a]) * KA - pos[a] * KG) * alpha; f[a + 1] += ((anchors[a + 1] - pos[a + 1]) * KA - pos[a + 1] * KG) * alpha; f[a + 2] += ((anchors[a + 2] - pos[a + 2]) * KA - pos[a + 2] * KG) * alpha;
      for (var axis = 0; axis < 3; axis++) { var v = (vel[a + axis] + f[a + axis]) * DECAY; vel[a + axis] = v > VMAX ? VMAX : v < -VMAX ? -VMAX : v; pos[a + axis] += vel[a + axis]; }
      if (st.flat) pos[a + 2] = 0;
      cx += pos[a]; cy += pos[a + 1]; cz += pos[a + 2];
    }
    // Keep the cloud centred and the shell of unlinked notes just outside it.
    if (m) { cx /= m; cy /= m; cz /= m; }
    var radii = new Float32Array(m);
    for (i = 0; i < m; i++) {
      a = 3 * linked[i]; pos[a] -= cx; pos[a + 1] -= cy; pos[a + 2] -= cz;
      radii[i] = pos[a] * pos[a] + pos[a + 1] * pos[a + 1] + pos[a + 2] * pos[a + 2];
    }
    // The shell sits just outside 97% of the linked notes (a few stragglers may cross it).
    radii.sort();
    var shell = Math.sqrt(m ? radii[Math.min(m - 1, Math.floor(m * 0.97))] : 0) * 1.15 + SPACING * 3, iso = st.isolated;
    for (i = 0; i < iso.length; i++) {
      var q = 3 * iso[i], ring = st.flat ? shell + SPACING * 4 * Math.sqrt((i + 0.5) / iso.length) : shell + (((i * 7919) % 97) / 97 - 0.5) * SPACING * 1.6;
      pos[q] = st.dirs[q] * ring; pos[q + 1] = st.dirs[q + 1] * ring; pos[q + 2] = st.flat ? 0 : st.dirs[q + 2] * ring;
    }
  }
  return st.iteration >= st.total;
}

var current = null;
var now = function () { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); };

function post(job, positions, done, iteration, mode, total) {
  var copy = positions.slice();
  self.postMessage({ type: 'positions', id: job.id, positions: copy, done: done, iteration: iteration, total: total, mode: mode }, [copy.buffer]);
}

function layout(msg) {
  var job = { id: msg.id, cancelled: false };
  current = job;
  var n = msg.n | 0, groups = msg.groups, degree = msg.degree, seed = msg.seed || 1, dims = msg.dims === 2 ? 2 : 3;
  var mode = msg.mode === 'pack' || n > FORCE_LIMIT ? 'pack' : 'force';
  if (mode === 'pack') { post(job, pack(n, groups, degree, seed, dims), true, 0, 'pack', 0); return job; }
  var st = createForce(n, msg.src, msg.dst, groups, degree, seed, dims), last = now();
  post(job, st.pos, false, 0, 'force', st.total);
  var tick = function () {
    if (job.cancelled) return;
    var start = now(), done = false;
    while (!done && now() - start < 12) done = stepForce(st, 4);
    if (done || now() - last >= TICK_MS) { post(job, st.pos, done, st.iteration, 'force', st.total); last = now(); }
    if (!done) setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
  return job;
}

self.onmessage = function (event) {
  var data = event.data || {};
  if (current) current.cancelled = true;
  if (data.type === 'layout') layout(data);
};
