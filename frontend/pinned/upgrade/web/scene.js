import { batchFurniture } from "./scene-batching.mjs";
import { paintDeskScreen } from "./desk-screen.mjs";
import { placeLabels } from "./label-layout.mjs";
import { officeRoute, pathLength, samplePath } from "./office-paths.mjs";
import * as THREE from "three";
import { makePlinth, makeDesk, makeChair, makePerson, posePerson, poseWork, makePlant, makeWalkway, makeMeetingTable } from "./builders.js";
import { agentWork, counts, departmentLead } from "./work-state.mjs";
import { OFFICE } from "./palette.mjs";
const LAYOUT = { "ecom": [-60, 0, 22, 30], "outreach": [60, 0, 22, 26], growth: [-30, 23, 22, 30], content: [-30, -23, 22, 30], revenue: [30, -23, 22, 30], operations: [0, 49, 22, 30], build: [0, -49, 22, 32], finance: [30, 23, 22, 26], command: [-35, -51, 22, 15] };
const FLOOR = OFFICE.floor;
const CLAY = OFFICE.active, INK = "#08090a", PAPER = "#d0d6e0";
const short = { "ecom": "ECOM", "outreach": "Outreach", growth: "Growth & Marketing", content: "Content & The AI Operator", revenue: "Revenue & Client Care", operations: "Operations & Knowledge", build: "Build & Quality", finance: "Finance", command: "Chief of Staff" };
export function createOffice(profiles, onSelect, onDepartment) {
  const canvas = document.querySelector("#scene"), holder = canvas.parentElement, labels = document.querySelector("#labels");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    holder.dataset.renderer = "unavailable";
    const notice = document.createElement("p");
    notice.className = "renderer-notice";
    notice.textContent = "3D rendering is unavailable. Use Departments, Team and Work to operate the office.";
    holder.append(notice);
    return { update() {
    }, focus(dept) {
      onDepartment(dept);
    }, select(p) {
      onSelect(p);
    }, home() {
      onDepartment(null);
    }, rotate() {
    }, zoom() {
    }, pixel() {
    }, theme() {
    }, brain() {
    }, pulse() {
    }, meeting() {
    }, snapshot: () => ({ renderer: false, agents: profiles.length }) };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-90, 90, 65, -65, 0.1, 800), target = new THREE.Vector3(-6.5, 0, -6.5);
  const hemi = new THREE.HemisphereLight(OFFICE.hemiSky, OFFICE.hemiGround, OFFICE.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(OFFICE.sun, OFFICE.sunIntensity);
  sun.position.set(-60, 110, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, far: 400 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: OFFICE.shadow }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  ground.receiveShadow = true;
  scene.add(ground);
  let zoom = 0.78, angle = Math.PI / 4, focused = null, selectedAgent = null, pixel = false, drag = null, moved = false, tween = null, dark = true, stale = false, meetingStarted = 0, themeRevision = 0, cardFlight = null;
  const agents = [], anchors = [], targets = [], pods = /* @__PURE__ */ new Map(), pulses = [];
  let demoMode = false;
  const batching = { batched: 0, batches: 0 };
  let viewWidth = holder.clientWidth, viewHeight = holder.clientHeight, renderWidth = 0, renderHeight = 0;
  const anchorByElement = /* @__PURE__ */ new Map();
  const labelSizer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const a = anchorByElement.get(entry.target);
      if (!a) continue;
      const box = entry.borderBoxSize?.[0];
      a.w = box?.inlineSize ?? entry.target.offsetWidth;
      a.h = box?.blockSize ?? entry.target.offsetHeight;
    }
  });
  const labelLines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  labelLines.classList.add("label-lines");
  labelLines.setAttribute("aria-hidden", "true");
  labels.append(labelLines);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function label(text, pos, kind, fn) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = kind;
    el.textContent = text;
    el.onclick = fn;
    labels.append(el);
    const anchor = { el, pos, kind, w: 0, h: 0 };
    anchors.push(anchor);
    anchorByElement.set(el, anchor);
    labelSizer.observe(el);
    return el;
  }
  function ownMaterials(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.userData.base = o.material.color?.clone();
      }
    });
  }
  function dim(group, amount) {
    if (group.userData.dim === amount && group.userData.themeRevision === themeRevision) return;
    group.userData.dim = amount;
    group.userData.themeRevision = themeRevision;
    const tint = new THREE.Color(OFFICE.dimTint);
    group.traverse((o) => {
      if (o.isMesh && o.userData.base) {
        o.material.color.copy(o.userData.base).lerp(tint, amount);
      }
    });
  }
  const brain = makePlinth(16, 16, OFFICE.brain);
  ownMaterials(brain);
  scene.add(brain);
  const brainLabel = label("THE BRAIN", new THREE.Vector3(0, 4, 0), "brain-label", () => onDepartment("brain"));
  const graphGroup = new THREE.Group();
  graphGroup.position.y = 0.2;
  brain.add(graphGroup);
  let graphNodes = [];
  function brainGraph(graph) {
    for (const obj of [...graphGroup.children]) {
      graphGroup.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    const nodes = graph.nodes || [], edges = graph.edges || [];
    const positions = /* @__PURE__ */ new Map();
    graphNodes = [];
    const sample = nodes.slice(0, 150), dotGeometry = new THREE.SphereGeometry(0.14, 6, 6), dotMaterial = new THREE.MeshBasicMaterial({ color: OFFICE.graphDot }), dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, sample.length), matrix = new THREE.Matrix4();
    sample.forEach((n, i) => {
      const r = 1 + Math.sqrt(i / Math.max(1, sample.length)) * 5.7, a = i * 2.39996, pos = new THREE.Vector3(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      positions.set(n.id, pos);
      matrix.makeTranslation(pos.x, pos.y, pos.z);
      dots.setMatrixAt(i, matrix);
      graphNodes.push(n.id);
    });
    dots.instanceMatrix.needsUpdate = true;
    graphGroup.add(dots);
    const linePoints = [];
    for (const e of edges) {
      const a = positions.get(e.source), b = positions.get(e.target);
      if (a && b) linePoints.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    if (linePoints.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(linePoints, 3));
      graphGroup.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: OFFICE.graph, transparent: true, opacity: 0.5 })));
    }
    const files = Number.isFinite(graph.files) ? graph.files : nodes.filter((n) => n.path).length;
    // Vault files, not notes: the Brain itself counts curated notes, so the plinth names its number (10 Oct 2026).
    brainLabel.textContent = files ? "THE BRAIN · " + files.toLocaleString("en-GB") + " VAULT FILES" : "THE BRAIN";
    brainLabel.title = graph.vault ? graph.vault.name + " · complete visible Obsidian vault" : "Connected office sources";
  }
  brainGraph({ nodes: [], edges: [] });
  brain.traverse((o) => {
    if (o.isMesh) {
      o.userData.department = "brain";
      targets.push(o);
    }
  });
  for (const [dept, [x, z, w, d]] of Object.entries(LAYOUT)) {
    const lead = departmentLead(profiles, dept), people = profiles.filter((p) => p.department === dept).sort((a, b) => Number(b.id === lead?.id) - Number(a.id === lead?.id));
    // A department without agents gets no plateau, walkway or label (the Chief's deck always stays).
    if (!people.length && dept !== "command") continue;
    const height = dept === "command" ? 5 : 0, group = new THREE.Group();
    group.position.set(x, height, z);
    const floor = makePlinth(w, d, FLOOR[dept], dept === "command" ? OFFICE.edgeCommand : OFFICE.edge);
    floor.children[0].material = floor.children[0].material.clone();
    floor.children[0].material.color.set(OFFICE.floorBody);
    group.add(floor);
    scene.add(group);
    const badge = label("", new THREE.Vector3(x, height + 8, z - d / 2), "dept-label", () => focus(dept));
    badge.dataset.department = dept;
    badge.setAttribute("aria-label", short[dept] + ", " + people.length + " agents");
    badge.innerHTML = '<span class="pod-title"><i></i>' + short[dept] + '</span><span class="pod-count">' + people.length + '<small>AGENTS</small></span><span class="pod-stats" title="Hermes · all enrolled projects · all retained dates"><span>DOING <b data-count="running">0</b></span><span>NEXT <b data-count="backlog">0</b></span><span>DONE <b data-count="done">0</b></span></span><span class="pod-alert" hidden></span>';
    if (dept !== "command") {
      const path = makeWalkway([x, z + (z > 0 ? -d / 2 : d / 2)], [x === 0 ? 0 : Math.sign(x) * 5, Math.sign(z) * 5]);
      ownMaterials(path);
      scene.add(path);
    }
    floor.traverse((o) => {
      if (o.isMesh) {
        o.userData.department = dept;
        targets.push(o);
      }
    });
    const plant = makePlant();
    plant.position.set(w / 2 - 2, 0, -d / 2 + 3);
    group.add(plant);
    if (dept === "command") {
      const table = makeMeetingTable();
      table.position.set(-6, 0, 1);
      table.scale.setScalar(0.7);
      group.add(table);
    }
    people.forEach((p, i) => {
      const compact = dept === "ecom", scale = compact ? 0.68 : 1;
      const row = compact ? Math.floor(i / 3) : i === 0 ? 0 : 1 + Math.floor((i - 1) / 2);
      const px = compact ? (i % 3 - 1) * 6 : dept === "command" ? 2 : i === 0 ? 0 : (i - 1) % 2 ? 5.4 : -5.4, pz = compact ? -11 + row * 5 : dept === "command" ? 1 : -d / 2 + 4 + row * 7.2;
      const desk = makeDesk(OFFICE.shirts[dept] || OFFICE.stand);
      desk.group.scale.setScalar(scale);
      desk.group.position.set(px, 0, pz);
      desk.group.rotation.y = Math.PI / 4;
      group.add(desk.group);
      desk.group.traverse((o) => {
        if (o.isMesh) {
          o.userData.agent = p.id;
          targets.push(o);
        }
      });
      const chair = makeChair();
      chair.scale.setScalar(scale);
      chair.position.set(px + 1.13 * scale, 0, pz + 1.13 * scale);
      chair.rotation.y = Math.PI / 4;
      group.add(chair);
      const person = makePerson({ hair: ["#25211d", "#584032", "#af9674"][i % 3], skin: ["#c99069", "#e4b591", "#94644b"][i % 3], chip: OFFICE.shirts[dept] || OFFICE.shirts.growth, lead: i === 0 });
      person.scale.setScalar(scale);
      person.position.set(px + 1.42 * scale, 0.12, pz + 1.42 * scale);
      person.rotation.y = Math.PI * 1.25;
      group.add(person);
      person.traverse((o) => {
        if (o.isMesh) {
          o.userData.agent = p.id;
          targets.push(o);
        }
      });
      const pos = new THREE.Vector3(x + px, height + 5.8 * scale, z + pz + 2 * scale);
      const pill = label((i === 0 ? "★ " : "") + p.name, pos, "agent-label", () => select(p));
      pill.dataset.agent = p.id;
      pill.setAttribute("aria-label", p.name);
      pill.dataset.lead = String(i === 0);
      const labelLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      labelLines.append(labelLine);
      const signal = label("", pos.clone().add(new THREE.Vector3(0, 2, 0)), "agent-signal", () => select(p));
      signal.hidden = true;
      agents.push({ p, person, desk, chair, pill, labelLine, signal, dept, base: new THREE.Vector3(px + 1.42 * scale, 0.12, pz + 1.42 * scale), height, status: "available", task: null, signature: "", anchor: anchors[anchors.length - 2], signalAnchor: anchors.at(-1), index: agents.length });
    });
    ownMaterials(group);
    pods.set(dept, { group, badge, people, lead, height, w, d });
  }
  for (const pod of pods.values()) {
    const b = batchFurniture(pod.group, agents.filter((a) => a.person.parent === pod.group).map((a) => a.person));
    batching.batched += b.batched;
    batching.batches += b.batches;
  }
  const bridgeStart = new THREE.Vector3(-35, 4.8, -43.5), bridgeEnd = new THREE.Vector3(-30, -0.2, -38), bridgeVector = bridgeEnd.clone().sub(bridgeStart);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, bridgeVector.length()), new THREE.MeshStandardMaterial({ color: OFFICE.bridge }));
  bridge.position.copy(bridgeStart).add(bridgeEnd).multiplyScalar(0.5);
  bridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), bridgeVector.normalize());
  bridge.castShadow = true;
  bridge.receiveShadow = true;
  scene.add(bridge);
  const textureLoader = new THREE.TextureLoader();
  const logoTexture = textureLoader.load("/static/logo.png");
  logoTexture.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Sprite(new THREE.SpriteMaterial({ map: logoTexture, transparent: true, depthTest: true }));
  logo.scale.set(6.5, 3.25, 1);
  logo.position.set(-35, 17, -54);
  scene.add(logo);
  const chiefSign = label("187N / COMMAND DECK", new THREE.Vector3(-35, 13, -51), "command-sign", () => focus("command"));
  let nextWalk = performance.now() + 2200, walkCursor = 0, lifeEnabled = true, nextMeet = performance.now() + 24e3;
  function ambientWalk(now) {
    if (!lifeEnabled || reduced.matches || stale || now < nextWalk) return;
    nextWalk = now + 7500;
    if (now >= nextMeet && agents.filter((r) => r.route).length <= 1) {
      const free = agents.filter((r) => r.dept !== "command" && !r.route && !["running", "waiting", "stale"].includes(r.status) && r.p.id !== selectedAgent && r.pill.dataset.lead !== "true");
      const first = free[walkCursor % Math.max(1, free.length)], second = free.find((r) => r.dept !== first?.dept);
      if (first && second) {
        [first, second].forEach((r, i) => {
          const points = officeRoute(r.base, LAYOUT[r.dept], { x: i ? 2 : -2, z: 2 });
          r.route = { points, length: pathLength(points), at: now, ambient: true, meeting: true };
        });
        nextMeet = now + 5e4;
        return;
      }
    }
    if (agents.filter((r) => r.route).length >= 3) return;
    for (let k = 0; k < agents.length; k++) {
      const r = agents[(walkCursor + k) % agents.length];
      if (r.dept === "command" || r.route || ["running", "waiting", "stale"].includes(r.status) || r.p.id === selectedAgent) continue;
      const pod = pods.get(r.dept), exitZ = LAYOUT[r.dept][1] > 0 ? -pod.d / 2 + 8.5 : pod.d / 2 - 1.5;
      const points = [{ x: r.base.x, z: r.base.z }, { x: r.base.x, z: r.base.z + 2.2 }, { x: 0, z: r.base.z + 2.2 }, { x: 0, z: exitZ }];
      if (r.pill.dataset.lead === "true") continue;
      r.route = { points, length: pathLength(points), at: now, ambient: true };
      walkCursor = (r.index + 1) % agents.length;
      break;
    }
  }
  function overviewZoom() {
    return Math.min(1.05, Math.max(0.46, viewWidth / viewHeight * 0.85));
  }
  function cameraUpdate() {
    const w = viewWidth, h = viewHeight;
    if (!w || !h) return;
    const aspect = w / h;
    camera.left = -64 * aspect;
    camera.right = 64 * aspect;
    camera.top = 64;
    camera.bottom = -64;
    camera.zoom = zoom;
    camera.position.set(target.x + Math.cos(angle) * 180, 160, target.z + Math.sin(angle) * 180);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (renderWidth !== w || renderHeight !== h) {
      renderer.setSize(w, h, false);
      renderWidth = w;
      renderHeight = h;
    }
  }
  function fly(pos, toZoom, duration = 420) {
    tween = { at: performance.now(), from: target.clone(), to: pos.clone(), fromZoom: zoom, toZoom, duration: reduced.matches ? 0 : duration };
    if (reduced.matches) {
      target.copy(pos);
      zoom = toZoom;
      tween = null;
      cameraUpdate();
    }
  }
  function dockCard(pod) {
    if (reduced.matches || demoMode) return;
    cardFlight?.remove();
    const from = pod.badge.getBoundingClientRect();
    if (!from.width || !from.height) return;
    const ghost = pod.badge.cloneNode(true);
    ghost.classList.remove("selected", "receded");
    ghost.removeAttribute("data-department");
    ghost.removeAttribute("aria-label");
    ghost.setAttribute("aria-hidden", "true");
    ghost.tabIndex = -1;
    Object.assign(ghost.style, { position: "fixed", left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px", margin: "0", transform: "none", display: "block", pointerEvents: "none", zIndex: "90", transformOrigin: "top left" });
    document.body.append(ghost);
    cardFlight = ghost;
    requestAnimationFrame(() => {
      const header = document.querySelector("#rail-header"), to = header.getBoundingClientRect();
      if (!to.width || !to.height) {
        ghost.remove();
        return;
      }
      const transform = `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width},${to.height / from.height})`;
      const motion = ghost.animate([{ transform: "none", opacity: 1 }, { transform, opacity: 0.9, offset: 0.85 }, { transform, opacity: 0 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
      motion.onfinish = () => ghost.remove();
    });
  }
  function focus(dept, notify = true) {
    if (!LAYOUT[dept] || !pods.has(dept)) return;
    if (focused !== dept) dockCard(pods.get(dept));
    focused = dept;
    for (const caption of labels.querySelectorAll(".console-label")) caption.classList.toggle("in-focus", caption.dataset.consoleDepartment === dept);
    selectedAgent = departmentLead(profiles, dept)?.id;
    holder.dataset.focus = dept;
    for (const [key, pod] of pods) {
      pod.badge.classList.toggle("selected", key === dept);
      pod.badge.classList.toggle("receded", key !== dept);
    }
    document.body.classList.add("office-focused");
    const [x, z] = LAYOUT[dept];
    fly(new THREE.Vector3(x, pods.get(dept).height, z), viewWidth < 600 ? 1.75 : 2.3, 420);
    if (notify) onDepartment(dept);
  }
  function select(p) {
    if (focused !== p.department) focus(p.department, false);
    selectedAgent = p.id;
    const r = agents.find((r2) => r2.p.id === p.id);
    r.reaction = "wave";
    r.reactionUntil = performance.now() + 2200;
    const world = r.person.getWorldPosition(new THREE.Vector3());
    fly(world, viewWidth < 600 ? 2.1 : 2.75, 300);
    onSelect(p);
  }
  function home(notify = true) {
    cardFlight?.remove();
    focused = null;
    for (const caption of labels.querySelectorAll(".console-label")) caption.classList.remove("in-focus");
    selectedAgent = null;
    delete holder.dataset.focus;
    document.body.classList.remove("office-focused");
    for (const pod of pods.values()) pod.badge.classList.remove("selected", "receded");
    fly(new THREE.Vector3(-6.5, 0, -6.5), overviewZoom(), 360);
    if (notify) onDepartment(null);
  }
  function worldAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect(), ray2 = new THREE.Raycaster();
    ray2.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    return ray2.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  }
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  canvas.addEventListener("pointerdown", (e) => {
    if (drag) return;
    drag = { x: e.clientX, y: e.clientY, angle, rotate: e.shiftKey || e.button === 2 };
    moved = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !moved) return;
    moved = true;
    tween = null;
    if (drag.rotate) angle += dx * 6e-3;
    else {
      const a = worldAt(drag.x, drag.y), b = worldAt(e.clientX, e.clientY);
      if (a && b) target.add(a.sub(b));
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    cameraUpdate();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (drag && !moved && !drag.rotate && e.button === 0) {
      const r = canvas.getBoundingClientRect();
      pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(targets);
      const agent = hits.find((h) => h.object.userData.agent);
      if (agent) select(profiles.find((p) => p.id === agent.object.userData.agent));
      else {
        const dept = hits[0]?.object.userData.department;
        if (dept === "brain") onDepartment("brain");
        else if (dept) focus(dept);
        else if (focused) home();
      }
    }
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => drag = null);
  canvas.addEventListener("dblclick", () => home());
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    tween = null;
    const before = worldAt(e.clientX, e.clientY);
    zoom = Math.max(0.45, Math.min(4.5, zoom * Math.exp(-e.deltaY * 18e-4)));
    cameraUpdate();
    const after = worldAt(e.clientX, e.clientY);
    if (before && after) target.add(before.sub(after));
    cameraUpdate();
  }, { passive: false });
  let narrow = viewWidth < 600;
  new ResizeObserver((entries) => {
    viewWidth = entries[0].contentRect.width;
    viewHeight = entries[0].contentRect.height;
    const next = viewWidth < 600;
    if (!focused && !tween) zoom = overviewZoom();
    narrow = next;
    cameraUpdate();
  }).observe(holder);
  function theme() {
    dark = true;
    themeRevision++;
    hemi.intensity = OFFICE.hemi;
    sun.intensity = OFFICE.sunIntensity;
    ground.material.opacity = OFFICE.shadow;
    for (const pod of pods.values()) pod.group.traverse((o) => {
      if (o.isMesh && o.userData.base) {
        if (!o.userData.lightBase) o.userData.lightBase = o.userData.base.clone();
        o.userData.base.copy(o.userData.lightBase);
      }
    });
  }
  function pulse(profile, kind = "work", options = {}) {
    if (demoMode && !options.demo) return;
    const r = agents.find((a) => a.p.id === profile);
    if (!r) return;
    r.reaction = kind === "done" ? "cheer" : kind === "failed" ? "slump" : kind === "cancelled" ? "glance" : null;
    r.reactionUntil = performance.now() + 2200;
    r.signal.textContent = kind === "approval" ? "!" : kind === "done" ? "✓" : kind === "failed" ? "!" : kind === "cancelled" ? "−" : "↗";
    r.eventSignal = r.signal.textContent;
    r.signal.hidden = false;
    r.signalUntil = performance.now() + 2200;
    if (reduced.matches) return;
    const pos = r.person.getWorldPosition(new THREE.Vector3());
    const chief = agents.find((a) => a.p.id === "chief"), origin = chief ? chief.person.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 4, 0)) : new THREE.Vector3(0, 1, 0);
    const points = [origin, origin.clone().lerp(pos, 0.5).add(new THREE.Vector3(0, 12, 0)), pos.clone().add(new THREE.Vector3(0, 4, 0))];
    const path = new THREE.CatmullRomCurve3(points), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(30)), new THREE.LineBasicMaterial({ color: CLAY, transparent: true, opacity: 0.8 }));
    scene.add(line);
    pulses.push({ line, at: performance.now() });
  }
  function update(items, options = {}) {
    if (demoMode && !options.demo) return;
    stale = !!options.stale;
    for (const [dept, pod] of pods) {
      const c = counts(items.filter((t) => t.department === dept));
      for (const k of ["running", "backlog", "done"]) pod.badge.querySelector("[data-count=" + k + "]").textContent = stale ? "—" : c[k] || 0;
      const alert = pod.badge.querySelector(".pod-alert");
      alert.hidden = !c.waiting && !c.blocked && !stale;
      alert.textContent = stale ? "Data unavailable" : c.waiting ? c.waiting + " needs approval" : c.blocked + " blocked";
    }
    for (const r of agents) {
      const resolved = agentWork(items, r.p.id, { stale });
      const signature = JSON.stringify([resolved.status, resolved.task?.id, resolved.task?.title]);
      if (signature !== r.signature) {
        if (r.signature && r.status !== resolved.status && resolved.status === "waiting") pulse(r.p.id, "approval");
        r.signature = signature;
        r.status = resolved.status;
        r.task = resolved.task;
        r.pill.dataset.status = r.status;
        r.pill.title = (r.task?.title || "No active work") + " · " + r.status;
        paintDeskScreen(r);
      }
      r.pill.classList.toggle("has-routine", items.some((t) => t.kind === "routine" && t.profile === r.p.id && t.stage === "scheduled"));
    }
  }
  function fitLabels() {
    const width = viewWidth, height = viewHeight, compact = width < 860 || height < 720, cinema = document.body.classList.contains("cinematic"), obstacles = [];
    if (!focused && !cinema) {
      if (titleBounds) obstacles.push(titleBounds);
    }
    {
      const a = anchors.find((a2) => a2.el === brainLabel), box = { ...a.screen, w: a.w, h: a.h }, inside = box.x - box.w / 2 >= 8 && box.x + box.w / 2 <= width - 8 && box.y - box.h / 2 >= 8 && box.y + box.h / 2 <= height - 75;
      brainLabel.style.visibility = inside ? "visible" : "hidden";
      if (inside) obstacles.push(box);
    }
    if (!focused && !cinema) {
      const floors = [...pods.values()].map((p) => p.screenBounds).filter(Boolean);
      const cards = anchors.filter((a) => a.kind === "dept-label" && a.el.dataset.department !== "command").map((a) => ({ id: a.el.dataset.department, ...a.screen, w: a.w, h: a.h, priority: a.el.dataset.department === "command" ? 0 : 1 }));
      const positions2 = placeLabels(cards, { width, height, obstacles: [...obstacles, ...floors], radius: 312, dense: true });
      for (const a of anchors.filter((a2) => a2.kind === "dept-label" && a2.el.dataset.department !== "command")) {
        const pos = positions2.get(a.el.dataset.department);
        a.el.style.visibility = pos ? "visible" : "hidden";
        if (pos) {
          a.el.style.left = pos.x + "px";
          a.el.style.top = pos.y + "px";
          obstacles.push(pos);
        }
      }
    } else for (const pod of pods.values()) pod.badge.style.visibility = "";
    const scale = Math.min(1, 0.68 + zoom * 0.12), candidates = agents.filter((r) => focused ? r.dept === focused : !compact || r.pill.dataset.lead === "true").map((r) => ({ id: r.p.id, ...r.anchor.screen, w: r.anchor.w * scale, h: r.anchor.h * scale, priority: r.p.id === selectedAgent ? 30 : r.status === "waiting" ? 20 : r.pill.dataset.lead === "true" ? 10 : 0 }));
    const positions = placeLabels(candidates, { width, height, obstacles, radius: focused ? 96 : 144 });
    for (const r of agents) {
      const pos = positions.get(r.p.id);
      r.pill.style.visibility = pos ? "visible" : "hidden";
      r.labelLine.style.display = pos && Math.hypot(pos.x - r.anchor.screen.x, pos.y - r.anchor.screen.y) > 8 ? "" : "none";
      if (!pos) continue;
      r.pill.style.left = pos.x + "px";
      r.pill.style.top = pos.y + "px";
      for (const [key, value] of Object.entries({ x1: r.anchor.screen.x, y1: r.anchor.screen.y, x2: pos.x, y2: pos.y })) r.labelLine.setAttribute(key, value);
    }
  }
  const v = new THREE.Vector3();
  let last = performance.now(), titleBounds = null, lastLabels = 0, lastRender = 0;
  // The scene loop stops completely while the office is not on screen (7 Oct 2026) and wakes when it returns,
  // instead of scheduling an empty frame on every display refresh behind workspace pages.
  let running = false;
  const offscreen = () => document.hidden || document.querySelector("#brain-view")?.open || document.body.classList.contains("workspace-open");
  function wake() {
    if (running || offscreen()) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(animate);
  }
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", wake);
  document.querySelector("#brain-view")?.addEventListener("close", wake);
  function animate(now) {
    if (offscreen()) {
      running = false;
      return;
    }
    // Frame budget: 60 fps while anything moves, 24 fps when the floor is still. High-refresh
    // displays otherwise redraw an unchanged scene up to 120 times a second.
    const moving = tween || drag || pulses.length || cardFlight?.isConnected || lifeEnabled;
    if (now - lastRender < (moving ? 1000 / 60 : 1000 / 24) - 2) {
      requestAnimationFrame(animate);
      return;
    }
    lastRender = now;
    const dt = Math.min(0.1, (now - last) / 1e3);
    last = now;
    if (tween) {
      const t = tween.duration ? Math.min(1, (now - tween.at) / tween.duration) : 1, ease = 1 - Math.pow(1 - t, 3);
      target.lerpVectors(tween.from, tween.to, ease);
      zoom = tween.fromZoom + (tween.toZoom - tween.fromZoom) * ease;
      if (t === 1) tween = null;
      cameraUpdate();
    }
    const layoutFrame = now - lastLabels > 40 || !!tween || !!drag;
    if (layoutFrame && !focused) {
      const box = holder.querySelector(".scene-title").getBoundingClientRect(), host = holder.getBoundingClientRect();
      titleBounds = { x: box.left - host.left + box.width / 2, y: box.top - host.top + box.height / 2, w: box.width, h: box.height };
    }
    ambientWalk(now);
    for (const [key, pod] of pods) dim(pod.group, focused && focused !== key ? 0.58 : 0);
    agents.forEach((r) => {
      let mode = r.status === "running" ? ["type", "read", "glance"][Math.floor(now / 6500 + r.index) % 3] : ["read", "sip", "glance", "phone", "stretch", "spin"][Math.floor(now / 4800 + r.index) % 6];
      if (r.status === "waiting") mode = "wave";
      if (r.reaction && now < r.reactionUntil && r.status !== "waiting") mode = r.reaction;
      if (!reduced.matches && (lifeEnabled || ["running", "waiting"].includes(r.status) || now < r.reactionUntil)) {
        poseWork(r.person, mode, now + r.index * 711, dt);
        if (r.route && !["running", "waiting", "stale"].includes(r.status)) {
          const phase = (now - r.route.at) / 1e3, travel = r.route.length / 7, returning = phase > travel + 5;
          const distance = phase < travel ? phase * 7 : phase < travel + 5 ? r.route.length : Math.max(0, r.route.length - (phase - travel - 5) * 7), point = samplePath(r.route.points, distance);
          r.routeTalking = r.route.meeting && phase >= travel && !returning;
          r.person.position.x = point.x;
          r.person.position.z = point.z;
          r.person.rotation.y = point.angle + (returning ? Math.PI : 0);
          posePerson(r.person, phase < travel || returning ? "walk" : "stand", now);
          if (phase > travel * 2 + 5) r.route = null;
        } else {
          r.route = null;
          r.person.position.x = r.base.x;
          r.person.position.z = r.base.z;
          r.person.rotation.y = mode === "spin" ? Math.PI * 1.25 + now % 4800 / 4800 * Math.PI * 2 : ["wave", "cheer", "stretch"].includes(mode) ? Math.PI / 4 : Math.PI * 1.25;
          const stand = r.person.userData.cur?.standK || 0;
          r.person.position.x += stand * 0.7;
          r.person.position.z += stand * 0.7;
        }
      } else r.person.position.copy(r.base);
      const world = r.person.getWorldPosition(v);
      r.anchor.pos.copy(world).y += 5.6;
      r.signalAnchor.pos.copy(world).y += 10.5;
      r.pill.classList.toggle("muted-label", !!focused && focused !== r.dept);
      r.pill.style.setProperty("--label-scale", String(Math.min(1, 0.68 + zoom * 0.12)));
      const waiting = r.status === "waiting";
      r.signal.hidden = !(waiting || now < (r.signalUntil || 0));
      if (waiting) {
        r.signal.textContent = "!";
        r.signal.title = "Needs your response";
        if (r.signal.dataset.kind !== "waiting") { r.signal.dataset.kind = "waiting"; r.signal.tabIndex = 0; r.signal.removeAttribute("aria-hidden") }
      } else if (now >= (r.signalUntil || 0)) {
        const ambient = lifeEnabled && !reduced.matches && !stale && (!focused || focused === r.dept) && ((now / 1e3 + r.index * 3.7) % 23 < 4.5 || r.route);
        const icon = r.route ? r.routeTalking ? "💬" : "↟" : { sip: "☕", phone: "☎", stretch: "↟", spin: "…", read: "…", glance: "…", type: "⌨" }[mode] || "…";
        if (r.signal.hidden === ambient) r.signal.hidden = !ambient;
        if (r.signal.textContent !== icon) r.signal.textContent = icon;
        // Office life is decoration, not status (10 Oct 2026): muted, not focusable, not announced.
        if (r.signal.dataset.kind !== "ambient") { r.signal.dataset.kind = "ambient"; r.signal.tabIndex = -1; r.signal.setAttribute("aria-hidden", "true") }
        r.signal.title = "Office life · " + (r.route ? r.routeTalking ? "conversation at the Brain" : "walking" : mode);
      } else {
        if (r.signal.textContent !== (r.eventSignal || "↗")) r.signal.textContent = r.eventSignal || "↗";
        if (r.signal.dataset.kind !== "event") { r.signal.dataset.kind = "event"; r.signal.tabIndex = 0; r.signal.removeAttribute("aria-hidden") }
        r.signal.title = "Observed work event";
      }
      if (r.route && !reduced.matches && r.route.ambient) {
        r.pill.title = r.p.name + " · office life · walking";
      }
      if (!reduced.matches && lifeEnabled && (!focused || focused === r.dept) && now - (r.lastScreenAt || 0) > 1300) {
        paintDeskScreen(r, now, true);
        r.lastScreenAt = now + r.index * 83 % 600;
      }
      r.motion = mode;
      if (!reduced.matches && lifeEnabled) r.chair.rotation.y = mode === "spin" && !r.route ? r.person.rotation.y - Math.PI : Math.PI / 4;
    });
    if (layoutFrame) {
      lastLabels = now;
      const placed = [];
      for (const a of anchors) {
        v.copy(a.pos).project(camera);
        let x = (v.x * 0.5 + 0.5) * viewWidth, y = (-v.y * 0.5 + 0.5) * viewHeight;
        if (a.kind === "dept-label") {
          const w = a.w, h = a.h, dept = a.el.dataset.department, pod = pods.get(dept);
          if (!focused) {
            const corners = [[-pod.w / 2, -pod.d / 2], [pod.w / 2, -pod.d / 2], [-pod.w / 2, pod.d / 2], [pod.w / 2, pod.d / 2]].map(([cx, cz]) => {
              const q = new THREE.Vector3(pod.group.position.x + cx, pod.height, pod.group.position.z + cz).project(camera);
              return { x: (q.x * 0.5 + 0.5) * viewWidth, y: (-q.y * 0.5 + 0.5) * viewHeight };
            });
            const left = Math.min(...corners.map((p) => p.x)), right = Math.max(...corners.map((p) => p.x)), top = Math.min(...corners.map((p) => p.y)), bottom = Math.max(...corners.map((p) => p.y));
            pod.screenBounds = { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top };
            if (dept === "content" || dept === "build") {
              x = (left + right) / 2;
              y = top - h / 2 - 30;
            } else if (dept === "growth" || dept === "operations") {
              x = left - w / 2 - 10;
              y = (top + bottom) / 2 - 35;
            } else if (dept === "revenue" || dept === "finance") {
              x = right + w / 2 + 10;
              y = (top + bottom) / 2 - 35;
            } else {
              x = (left + right) / 2;
              y = top - 72;
            }
            x = Math.max(w / 2 + 10, Math.min(viewWidth - w / 2 - 10, x));
            y = Math.max(h / 2 + 16, Math.min(viewHeight - h / 2 - 100, y));
            placed.push({ x, y, w, h });
          }
        }
        a.screen = { x, y };
        a.el.style.left = x + "px";
        a.el.style.top = y + "px";
      }
      fitLabels();
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], age = (now - p.at) / 1500;
      p.line.material.opacity = Math.max(0, 1 - age);
      if (age > 1) {
        scene.remove(p.line);
        p.line.geometry.dispose();
        p.line.material.dispose();
        pulses.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  cameraUpdate();
  zoom = overviewZoom();
  cameraUpdate();
  wake();
  holder.dataset.renderer = "ready";
  return { focus, home, select, theme, life() {
    lifeEnabled = !lifeEnabled;
    if (!lifeEnabled) for (const r of agents) {
      r.route = null;
      r.person.position.copy(r.base);
      r.person.rotation.y = Math.PI * 1.25;
      posePerson(r.person, "stand", 0);
    }
    return lifeEnabled;
  }, agentSocket(id) {
    const agent = agents.find((a) => a.p.id === id);
    if (!agent) return null;
    const p = agent.person.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 4, 0)).project(camera);
    return { x: (p.x * 0.5 + 0.5) * viewWidth, y: (-p.y * 0.5 + 0.5) * viewHeight };
  }, socket(dept) {
    if (dept === "brain") {
      const p2 = new THREE.Vector3(0, 4, 0).project(camera);
      return { x: (p2.x * 0.5 + 0.5) * viewWidth, y: (-p2.y * 0.5 + 0.5) * viewHeight };
    }
    const pod = pods.get(dept);
    if (!pod) return null;
    const p = pod.group.position.clone().add(new THREE.Vector3(0, 4, 0)).project(camera);
    return { x: (p.x * 0.5 + 0.5) * viewWidth, y: (-p.y * 0.5 + 0.5) * viewHeight };
  }, brain: brainGraph, pulse, update, setDemo(value) {
    demoMode = !!value;
  }, delegate(from, to, options = {}) {
    if (to && to !== from) pulse(to, "delegated", options);
  }, meeting() {
    if (reduced.matches) return;
    for (const [dept, pod] of pods) {
      if (dept === "command") continue;
      const r = agents.find((a) => a.dept === dept && a.status === "available");
      if (!r) continue;
      const [x, z] = LAYOUT[dept], seat = { x: x === 0 ? 0 : Math.sign(x) * 5, z: Math.sign(z) * 5 };
      const points = officeRoute(r.base, LAYOUT[dept], seat);
      r.route = { points, length: pathLength(points), at: performance.now() };
    }
  }, rotate() {
    angle += Math.PI / 8;
    cameraUpdate();
  }, zoom(delta) {
    tween = null;
    zoom = Math.max(0.45, Math.min(4.5, zoom + delta));
    cameraUpdate();
  }, pixel() {
    pixel = !pixel;
    renderer.setPixelRatio(pixel ? 0.65 : Math.min(devicePixelRatio, 1.7));
    cameraUpdate();
    return pixel;
  }, snapshot: () => ({ renderer: true, batching, demo: demoMode, drawCalls: renderer.info.render.calls, brainDrawCalls: graphGroup.children.length, floors: [...pods].map(([department, p]) => ({ department, ...p.screenBounds })), agents: agents.map((r) => ({ id: r.p.id, department: r.dept, status: r.status, height: r.height, x: r.person.position.x, z: r.person.position.z, task: r.task?.id, motion: r.motion, walking: !!r.route, signal: r.signal.hidden ? null : r.signal.textContent, monitorFrame: r.screenFrame, monitor: (() => {
    const p = r.desk.group.localToWorld(new THREE.Vector3(0, 3.5, -0.77)).project(camera);
    return { x: (p.x * 0.5 + 0.5) * viewWidth, y: (-p.y * 0.5 + 0.5) * viewHeight };
  })(), pose: { left: r.person.userData.shL.rotation.x, right: r.person.userData.shR.rotation.x, head: r.person.userData.headG.rotation.x }, desk: { x: r.desk.group.position.x, z: r.desk.group.position.z }, world: { x: r.person.parent.position.x + r.person.position.x, z: r.person.parent.position.z + r.person.position.z } })), departments: Object.keys(LAYOUT), focused, reducedMotion: reduced.matches, zoom, angle, dark, stale, graphNodes: graphNodes.length, lifeEnabled, monitorScreens: agents.length, floatingWorkCards: 0, moving: agents.filter((r) => r.route).length }) };
}
