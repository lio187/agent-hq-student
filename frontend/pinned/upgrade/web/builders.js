
import * as THREE from 'three';
import { OFFICE } from './palette.mjs';

export const PLINTH_H = 2.6;
const WHITE = OFFICE.plinth;

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.02,
      ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.ei ?? 1 } : {}),
    }));
  }
  return matCache.get(key);
}


const geoCache = new Map();
export function rboxGeo(w, d, h, r = 0.35) {
  const key = [w, d, h, r].join('|');
  if (geoCache.has(key)) return geoCache.get(key);
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); 
  geoCache.set(key, g);
  return g;
}

export function rbox(w, d, h, color, r) {
  const m = new THREE.Mesh(rboxGeo(w, d, h, r), typeof color === 'string' ? mat(color) : color);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}


export function makePlinth(w, d, floorColor, edgeColor = OFFICE.edge) {
  const g = new THREE.Group();
  const body = rbox(w, d, PLINTH_H, WHITE, 0.9);
  body.position.y = -PLINTH_H;
  g.add(body);
  
  const floor = rbox(w - 0.7, d - 0.7, 0.12, floorColor, 0.7);
  floor.position.y = 0;
  floor.castShadow = false;
  g.add(floor);
  // Hairline perimeter instead of shadows: the Linear edge.
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(floor.geometry, 40), new THREE.LineBasicMaterial({ color: edgeColor }));
  edge.position.copy(floor.position);
  g.add(edge);
  return g;
}


export function makeFloorTitle(text, inkColor, width) {
  const c = document.createElement('canvas');
  const W = 1024, H = 192; c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.font = '700 92px Georgia, "Times New Roman", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const sp = 14; 
  let total = 0;
  for (const ch of text) total += x.measureText(ch).width + sp;
  let cx0 = (W - total + sp) / 2;
  x.fillStyle = inkColor;
  for (const ch of text) {
    const cw = x.measureText(ch).width;
    x.fillText(ch, cx0 + cw / 2, H / 2 + 6);
    cx0 += cw + sp;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const h = width * (H / W);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.14;
  return m;
}


export function makeDeskScreenTexture(chip) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  const draw = (lines) => {
    
    x.fillStyle = '#121316'; x.fillRect(0, 0, 256, 160);
    x.fillStyle = chip; x.fillRect(0, 0, 256, 26);
    x.fillStyle = '#d0d6e0'; x.font = '500 15px "JetBrains Mono", Menlo, monospace'; x.fillText('● working', 10, 18);
    x.font = '13px Menlo, monospace';
    lines.forEach((l, i) => {
      x.fillStyle = i === lines.length - 1 ? '#27a644' : 'rgba(208,214,224,.72)';
      x.fillText(l, 10, 48 + i * 22);
    });
  };
  draw(['▸ …', '▸ …', '▸ …']);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, canvas: c, ctx: x, draw };
}

export function makeDesk(chip) {
  const g = new THREE.Group();
  const top = rbox(5.2, 2.6, 0.22, OFFICE.desk, 0.18); top.position.y = 2.1; g.add(top);
  const ped1 = rbox(0.9, 2.2, 1.9, OFFICE.deskPed, 0.12); ped1.position.set(-2.0, 0.1, 0); g.add(ped1);
  const ped2 = rbox(0.9, 2.2, 1.9, OFFICE.deskPed, 0.12); ped2.position.set(2.0, 0.1, 0); g.add(ped2);
  
  const screenSet = makeDeskScreenTexture(chip);
  
  const monBack = rbox(2.3, 0.14, 1.5, OFFICE.monitor, 0.08); monBack.position.set(0, 2.75, -0.85); g.add(monBack);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.3),
    new THREE.MeshBasicMaterial({ map: screenSet.tex })
  );
  screen.position.set(0, 3.5, -0.77); g.add(screen);
  const stand = rbox(0.16, 0.16, 0.45, OFFICE.stand, 0.05); stand.position.set(0, 2.32, -0.9); g.add(stand);
  
  const kb = rbox(1.5, 0.5, 0.07, OFFICE.keyboard, 0.06); kb.position.set(0, 2.22, 0.35); g.add(kb);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.3, 12), mat(chip));
  mug.position.set(1.9, 2.36, 0.4); mug.castShadow = true; g.add(mug);
  return { group: g, screenSet };
}

export function makeChair() {
  const g = new THREE.Group();
  const seat = rbox(1.3, 1.2, 0.22, OFFICE.chairSeat, 0.35); seat.position.y = 1.25; g.add(seat);
  const back = rbox(1.25, 0.2, 1.35, OFFICE.chairBack, 0.3); back.position.set(0, 1.5, 0.62); g.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8), mat(OFFICE.metal));
  pole.position.y = 0.82; g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.1, 10), mat(OFFICE.metal));
  base.position.y = 0.4; base.castShadow = true; g.add(base);
  return g;
}


export function makePerson({ hair, skin, chip, lead }) {
  const g = new THREE.Group();
  const S = lead ? 1.12 : 1;
  const shirtCol = lead ? OFFICE.leadShirt : chip;
  const shirt = mat(shirtCol, { rough: 0.9 });
  const skinM = mat(skin, { rough: 0.7 });
  const hairM = mat(hair, { rough: 0.95 });
  const pantsM = mat(OFFICE.pants, { rough: 0.95 });

  const legs = new THREE.Group();
  const legGeo = new THREE.CapsuleGeometry(0.16 * S, 0.75 * S, 3, 8);
  const legL = new THREE.Mesh(legGeo, pantsM); legL.position.set(-0.2 * S, 0.6 * S, 0);
  const legR = new THREE.Mesh(legGeo, pantsM); legR.position.set(0.2 * S, 0.6 * S, 0);
  legL.castShadow = legR.castShadow = true;
  legs.add(legL, legR); g.add(legs);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42 * S, 0.85 * S, 4, 12), shirt);
  torso.position.y = 1.75 * S; torso.castShadow = true; g.add(torso);

  if (lead) { 
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.11 * S, 0.55 * S, 4), mat(chip));
    tie.rotation.x = Math.PI; tie.position.set(0, 1.85 * S, 0.4 * S); g.add(tie);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.06 * S, 8, 8),
      mat(OFFICE.pin, { metal: 0.6, rough: 0.35 }));
    pin.position.set(0.26 * S, 2.05 * S, 0.38 * S); g.add(pin);
  }

  const armGeo = new THREE.CapsuleGeometry(0.155 * S, 0.62 * S, 3, 8);
  const armL = new THREE.Mesh(armGeo, shirt); armL.castShadow = true;
  const armR = new THREE.Mesh(armGeo, shirt); armR.castShadow = true;
  const shL = new THREE.Group(); shL.position.set(-0.5 * S, 2.1 * S, 0); armL.position.y = -0.42 * S; shL.add(armL);
  const shR = new THREE.Group(); shR.position.set(0.5 * S, 2.1 * S, 0); armR.position.y = -0.42 * S; shR.add(armR);
  g.add(shL, shR);

  
  const headG = new THREE.Group();
  headG.position.y = 2.75 * S;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5 * S, 18, 16), skinM);
  head.position.y = 0.25 * S; head.castShadow = true; headG.add(head);
  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.54 * S, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
  hairMesh.position.y = 0.31 * S; headG.add(hairMesh);
  g.add(headG);

  g.userData = { legs, legL, legR, shL, shR, torso, headG, S };
  return g;
}


export function poseWork(g, mode, t, dt) {
  const u = g.userData;
  u.legs.visible = false;
  
  
  
  const tg = { shLx: -1.05, shLz: 0.25, shRx: -1.05, shRz: -0.25, headRx: 0.04, headRy: 0, torsoRx: 0, posY: 0.55, standK: 0 };
  switch (mode) {
    case 'type':
      tg.shLx = -1.05 + Math.sin(t / 170) * 0.12;
      tg.shRx = -1.05 + Math.sin(t / 140 + 1.3) * 0.14;
      tg.headRx = 0.07 + Math.sin(t / 380) * 0.05;
      break;
    case 'read': 
      tg.shLx = -0.3; tg.shLz = -0.35; tg.shRx = -0.3; tg.shRz = 0.35;
      tg.torsoRx = -0.12;
      tg.headRx = 0.18 + Math.sin(t / 650) * 0.05;
      break;
    case 'phone': 
      tg.shRx = -2.3; tg.shRz = 0.55; tg.shLx = -0.4; tg.shLz = -0.2;
      tg.headRy = -0.18; tg.headRx = 0.05 + (Math.sin(t / 330) > 0.55 ? 0.09 : 0);
      break;
    case 'glance': 
      tg.shLx = -0.9; tg.shRx = -0.9;
      tg.headRy = u.glanceDir || 0.55;
      break;
    case 'sip': 
      tg.shRx = -2.0; tg.shRz = 0.5; tg.shLx = -0.6; tg.headRx = -0.12;
      break;
    case 'spin': 
      tg.shLx = -0.7; tg.shLz = -0.55; tg.shRx = -0.7; tg.shRz = 0.55;
      tg.headRx = -0.05;
      break;
    case 'stretch': 
      tg.standK = 1; tg.posY = 0.12;
      tg.shLx = -2.6; tg.shLz = -0.75; tg.shRx = -2.6; tg.shRz = 0.75;
      tg.headRx = -0.15; tg.torsoRx = -0.05;
      break;
    case 'wave': 
      tg.standK = 1; tg.posY = 0.12;
      tg.shRx = -2.6; tg.shRz = 0.55 + Math.sin(t / 150) * 0.4;
      tg.shLx = -0.3; tg.shLz = -0.25;
      tg.headRx = -0.05;
      break;
    case 'cheer': 
      tg.standK = 1;
      tg.posY = 0.12 + Math.abs(Math.sin(t / 150)) * 0.16;
      tg.shLx = -2.7; tg.shLz = -0.85 + Math.sin(t / 190) * 0.12;
      tg.shRx = -2.7; tg.shRz = 0.85 - Math.sin(t / 190) * 0.12;
      tg.headRx = -0.2;
      break;
    case 'slump': 
      tg.shLx = -0.2; tg.shLz = -0.3; tg.shRx = -0.2; tg.shRz = 0.3;
      tg.headRx = 0.45; tg.posY = 0.5;
      break;
  }
  if (!u.cur) u.cur = { ...tg };
  const k = 1 - Math.exp(-(dt || 0.016) * 7);
  for (const key in tg) u.cur[key] += (tg[key] - u.cur[key]) * k;
  u.shL.rotation.x = u.cur.shLx; u.shL.rotation.z = u.cur.shLz;
  u.shR.rotation.x = u.cur.shRx; u.shR.rotation.z = u.cur.shRz;
  u.headG.rotation.x = u.cur.headRx; u.headG.rotation.y = u.cur.headRy;
  u.torso.rotation.x = u.cur.torsoRx;
  u.legs.visible = u.cur.standK > 0.4;
  g.position.y = u.cur.posY + Math.sin(t / 460) * 0.02;
}

export function posePerson(g, pose, t = 0) {
  const u = g.userData;
  u.cur = null; 
  u.headG.rotation.x = 0; u.headG.rotation.y = 0;
  if (pose === 'walk') {
    u.legs.visible = true;
    const sw = Math.sin(t / 110);
    g.position.y = Math.abs(Math.cos(t / 110)) * 0.08;
    u.legL.rotation.x = sw * 0.55; u.legR.rotation.x = -sw * 0.55;
    u.shL.rotation.x = -sw * 0.45; u.shR.rotation.x = sw * 0.45;
    u.shL.rotation.z = 0.08; u.shR.rotation.z = -0.08;
  } else { 
    u.legs.visible = true;
    g.position.y = 0;
    u.legL.rotation.x = u.legR.rotation.x = 0;
    u.shL.rotation.x = -0.15 + Math.sin(t / 500) * 0.05; u.shR.rotation.x = -0.15 - Math.sin(t / 500) * 0.05;
    u.shL.rotation.z = 0.15; u.shR.rotation.z = -0.15;
    u.headG.rotation.y = Math.sin(t / 900) * 0.12; 
  }
}


export function makeHolo(agentName, chip, lines) {
  const c = document.createElement('canvas');
  const W = 512, H = 320; c.width = W; c.height = H;
  const x = c.getContext('2d');
  const draw = (ls) => {
    x.clearRect(0, 0, W, H);
    
    x.fillStyle = 'rgba(253,255,248,0.93)';
    roundRect(x, 6, 6, W - 12, H - 12, 26); x.fill();
    x.strokeStyle = chip; x.lineWidth = 5;
    roundRect(x, 6, 6, W - 12, H - 12, 26); x.stroke();
    
    x.fillStyle = chip;
    x.beginPath(); x.arc(40, 44, 11, 0, 7); x.fill();
    x.fillStyle = '#151414'; x.font = '700 27px Georgia, serif';
    x.fillText(agentName, 62, 54);
    x.strokeStyle = 'rgba(21,20,20,0.12)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(28, 76); x.lineTo(W - 28, 76); x.stroke();
    
    x.font = '20px Menlo, monospace';
    ls.forEach((l, i) => {
      x.fillStyle = i === ls.length - 1 ? '#1E9070' : 'rgba(21,20,20,0.72)';
      x.fillText(l.length > 40 ? l.slice(0, 40) + '…' : l, 30, 116 + i * 36);
    });
    
    x.fillStyle = '#151414';
    x.fillRect(30, 116 + ls.length * 36 - 16, 12, 20);
  };
  draw(lines);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 3.0),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide })
  );
  m.userData.draw = draw;
  m.userData.tex = tex;
  return m;
}

function roundRect(x, a, b, w, h, r) {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}


export function makePlant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.8, 10), mat(OFFICE.pot));
  pot.position.y = 0.4; pot.castShadow = true; g.add(pot);
  const foliage = mat(OFFICE.foliage, { rough: 1 });
  const foliage2 = mat(OFFICE.foliage2, { rough: 1 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.42 + Math.sin(i * 7) * 0.12, 10, 8), i % 2 ? foliage : foliage2);
    s.position.set(Math.sin(i * 2.4) * 0.35, 1.15 + i * 0.28, Math.cos(i * 2.4) * 0.35);
    s.castShadow = true; g.add(s);
  }
  return g;
}

export function makeServerRack(chip) {
  const g = new THREE.Group();
  const body = rbox(1.6, 1.2, 3.4, OFFICE.server, 0.14); g.add(body);
  for (let r = 0; r < 5; r++) {
    const slot = rbox(1.3, 0.06, 0.3, OFFICE.serverSlot, 0.04);
    slot.position.set(0, 0.5 + r * 0.6, 0.62); g.add(slot);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
      mat(r % 2 ? OFFICE.graphDot : OFFICE.graph, { emissive: r % 2 ? OFFICE.graphDot : OFFICE.graph, ei: 1.2 }));
    led.position.set(0.45, 0.65 + r * 0.6, 0.64); g.add(led);
  }
  return g;
}

export function makeMeetingTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 28), mat(OFFICE.table));
  top.position.y = 1.9; top.castShadow = true; top.receiveShadow = true; g.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.9, 12), mat(OFFICE.tableLeg));
  leg.position.y = 0.95; g.add(leg);
  return g;
}


export function makeWalkway(from, to) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const g = rbox(len, 3.2, 0.35, OFFICE.walkway, 0.16);
  g.position.set((from[0] + to[0]) / 2, -0.35, (from[1] + to[1]) / 2);
  g.rotation.y = -Math.atan2(dz, dx);
  return g;
}
