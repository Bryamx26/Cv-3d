import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadRcCar } from './rccar.js';

// Circuit RC de nuit : terrain à collines, piste néon, sauts, bosses et chrono.
// Unités en mètres. La voiture est un buggy 1/10 (~50 cm).

const SIZE = 170;           // côté du terrain
const GRID = 171;           // sommets par côté (1 m de résolution)
const HALF_W = 1.25;        // demi-largeur de piste (2,5 m)
const COLORS = { neonL: '#00e5ff', neonR: '#ff2bd6', ramp: '#ff8a00', gate: '#9d4edd' };

// ---------- Rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#24184a', 30, 130);
const sky = document.createElement('canvas');
sky.width = 2; sky.height = 256;
{
  const g = sky.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05030d'); grad.addColorStop(0.6, '#1a1036'); grad.addColorStop(1, '#3a1d5c');
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
}
scene.background = new THREE.CanvasTexture(sky);
scene.background.colorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 600);

scene.add(new THREE.HemisphereLight('#a79fff', '#2a2050', 1.9));
const moon = new THREE.DirectionalLight('#c9c2ff', 1.6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 });
moon.shadow.bias = -0.0008;
scene.add(moon, moon.target);

// Étoiles
{
  const n = 1500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * 0.45 * Math.PI + 0.05;
    pos.set([Math.cos(a) * Math.cos(e) * 450, Math.sin(e) * 450, Math.sin(a) * Math.cos(e) * 450], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, fog: false })));
}

// ---------- Tracé de la piste ----------
const ctrl = [
  [0, -55], [35, -52], [58, -30], [52, 2], [30, 14], [44, 42], [18, 60],
  [-14, 50], [-24, 24], [-52, 30], [-62, -2], [-45, -32], [-22, -40],
].map(([x, z]) => new THREE.Vector3(x, 0, z));
const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
const M = 900;                                     // échantillons le long de la piste
const samples = curve.getSpacedPoints(M).slice(0, M);
const tangents = samples.map((_, i) => curve.getTangentAt(i / M).setY(0).normalize());
const trackLength = curve.getLength();

// ---------- Terrain : collines + piste aplanie ----------
const gauss = (x, z, cx, cz, a, r) => a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
function baseHeight(x, z) {
  return 2.2 * Math.sin(x * 0.05) * Math.cos(z * 0.045)
    + 1.2 * Math.sin(x * 0.11 + 1) * Math.sin(z * 0.09)
    + gauss(x, z, 5, 5, 9, 16)        // grande colline au centre
    + gauss(x, z, 72, -70, 12, 18)
    + gauss(x, z, -72, 68, 14, 20)
    + gauss(x, z, 75, 70, 10, 16)
    + gauss(x, z, -75, -72, 11, 18)
    + gauss(x, z, 25, 35, 3.5, 7)     // bosse que la piste longe
    + gauss(x, z, -40, 5, 4, 9);
}
// Altitude de la piste : terrain lissé le long du tracé (montées et descentes douces)
const rawY = samples.map((p) => baseHeight(p.x, p.z));
const trackY = rawY.map((_, i) => {
  let s = 0;
  for (let k = -30; k <= 30; k++) s += rawY[(i + k + M) % M];
  return s / 61;
});
samples.forEach((p, i) => { p.y = trackY[i]; });

// Plus proche échantillon de piste (recherche complète, ou locale si on connaît l'index précédent)
function nearest(x, z, hint = -1, window = 40) {
  let best = 0, bd = Infinity;
  const from = hint < 0 ? 0 : hint - window, to = hint < 0 ? M : hint + window;
  for (let j = from; j < to; j++) {
    const i = (j + M) % M, p = samples[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}

const heights = new Float32Array(GRID * GRID);
const step = SIZE / (GRID - 1);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let r = 0; r < GRID; r++) {
  for (let c = 0; c < GRID; c++) {
    const x = -SIZE / 2 + c * step, z = -SIZE / 2 + r * step;
    const { i, d } = nearest(x, z);
    const w = smooth(HALF_W + 0.8, HALF_W + 7, d);
    heights[r * GRID + c] = trackY[i] * (1 - w) + baseHeight(x, z) * w;
  }
}
function terrainHeight(x, z) {
  const fx = (x + SIZE / 2) / step, fz = (z + SIZE / 2) / step;
  const c = Math.min(GRID - 2, Math.max(0, Math.floor(fx))), r = Math.min(GRID - 2, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - c)), tz = Math.min(1, Math.max(0, fz - r));
  const h = (rr, cc) => heights[rr * GRID + cc];
  return (h(r, c) * (1 - tx) + h(r, c + 1) * tx) * (1 - tz) + (h(r + 1, c) * (1 - tx) + h(r + 1, c + 1) * tx) * tz;
}

{
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, GRID - 1, GRID - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const low = new THREE.Color('#1d3a30'), high = new THREE.Color('#3b2a63'), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const y = terrainHeight(x, z);
    pos.setY(k, y);
    c.copy(low).lerp(high, Math.min(1, Math.max(0, y / 9))).multiplyScalar(0.85 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- Piste (ruban) + bordures néon ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const asphalt = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#1b1a24'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(w / 2 - 2, 0, 4, h / 2);
});
function ribbon(offsetA, offsetB, lift, material, vRepeat = 1) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= M; i++) {
    const p = samples[i % M], t = tangents[i % M];
    const nx = -t.z, nz = t.x; // normale à gauche
    for (const [o, u] of [[offsetA, 0], [offsetB, 1]]) {
      const x = p.x + nx * o, z = p.z + nz * o;
      pos.push(x, terrainHeight(x, z) + lift(o), z);
      uv.push(u, (i / M) * trackLength / vRepeat);
    }
    if (i < M) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
ribbon(HALF_W, -HALF_W, () => 0.03, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, side: THREE.DoubleSide }), 4);
// Bordures lumineuses (gauche cyan, droite magenta) + vibreurs
const neon = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, side: THREE.DoubleSide });
ribbon(HALF_W + 0.07, HALF_W, () => 0.05, neon(COLORS.neonL));
ribbon(-HALF_W, -HALF_W - 0.07, () => 0.05, neon(COLORS.neonR));

// ---------- Sauts et bosses ----------
// Chaque obstacle a un repère local : s le long de la piste, l en travers.
const obstacles = [];
function frameAt(t) {
  const i = Math.floor(t * M) % M;
  return { p: samples[i], dir: tangents[i], i };
}
function addRamp(t, { L = 2.6, H = 0.55, W = 1.3 } = {}) {
  const { p, dir } = frameAt(t);
  const o = { type: 'ramp', p: p.clone(), dir: dir.clone(), L, H, W };
  obstacles.push(o);
  // Coin (wedge) : profil triangulaire extrudé sur la largeur
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L, H)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2 * W, bevelEnabled: false });
  geo.translate(0, 0, -W);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORS.ramp, roughness: 0.6 }));
  // x local du profil = s (le long de la piste)
  mesh.position.set(p.x, terrainHeight(p.x, p.z) + 0.03, p.z);
  mesh.rotation.y = Math.atan2(-dir.z, dir.x);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  // Liseré néon en haut du tremplin
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 2 * W), neon('#ffd166'));
  lip.position.set(L, H, 0);
  mesh.add(lip);
}
function addWhoops(t, { n = 6, gap = 2.6, H = 0.22, W = HALF_W } = {}) {
  const { p, dir } = frameAt(t);
  const o = { type: 'whoops', p: p.clone(), dir: dir.clone(), n, gap, H, W };
  obstacles.push(o);
  const r = gap / 2;
  // Demi-cylindre couché en travers de la piste, aplati à la hauteur H
  const geo = new THREE.CylinderGeometry(r, r, 2 * W, 24, 1, false, -Math.PI / 2, Math.PI);
  geo.rotateX(-Math.PI / 2);
  geo.scale(1, H / r, 1);
  const material = new THREE.MeshStandardMaterial({ color: '#6a2bb0', roughness: 0.7 });
  for (let k = 0; k < n; k++) {
    const s = r + k * gap;
    const x = p.x + dir.x * s, z = p.z + dir.z * s;
    const bump = new THREE.Mesh(geo, material);
    bump.position.set(x, terrainHeight(x, z) + 0.03, z);
    bump.rotation.y = Math.atan2(-dir.z, dir.x);
    bump.receiveShadow = bump.castShadow = true;
    scene.add(bump);
  }
}
addRamp(0.08);
addRamp(0.37, { H: 0.7, L: 3, W: HALF_W });
addWhoops(0.55);
addRamp(0.72, { H: 0.45, L: 2.2 });
addWhoops(0.9, { n: 4, gap: 3, H: 0.3 });

// Hauteur ajoutée par les obstacles au point (x, z)
function obstacleHeight(x, z) {
  let h = 0;
  for (const o of obstacles) {
    const dx = x - o.p.x, dz = z - o.p.z;
    const s = dx * o.dir.x + dz * o.dir.z;
    const l = -dx * o.dir.z + dz * o.dir.x;
    if (Math.abs(l) > o.W) continue;
    if (o.type === 'ramp' && s >= 0 && s <= o.L) h = Math.max(h, (o.H * s) / o.L);
    if (o.type === 'whoops' && s >= 0 && s <= o.n * o.gap) {
      const r = o.gap / 2, u = (s % o.gap) - r;
      h = Math.max(h, (o.H / r) * Math.sqrt(Math.max(0, r * r - u * u)));
    }
  }
  return h;
}
const groundHeight = (x, z) => terrainHeight(x, z) + 0.03 + obstacleHeight(x, z);

// ---------- Portique départ / arrivée ----------
{
  const { p, dir } = frameAt(0);
  const nx = -dir.z, nz = dir.x;
  const y = terrainHeight(p.x, p.z);
  const postMat = new THREE.MeshStandardMaterial({ color: '#1b1830' });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), postMat);
    post.position.set(p.x + nx * s * (HALF_W + 0.4), y + 1.2, p.z + nz * s * (HALF_W + 0.4));
    post.castShadow = true;
    scene.add(post);
  }
  const bannerTex = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#0d0b18'; g.fillRect(0, 0, w, h);
    g.strokeStyle = COLORS.gate; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('START · FINISH', w / 2, 66);
  });
  bannerTex.wrapS = bannerTex.wrapT = THREE.ClampToEdgeWrapping;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF_W + 0.95, 0.5, 0.06), [postMat, postMat, postMat, postMat, new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }), new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false })]);
  banner.position.set(p.x, y + 2.3, p.z);
  banner.rotation.y = Math.atan2(-nz, nx);
  scene.add(banner);
  // Ligne en damier
  const checker = canvasTex(256, 32, (g, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 16, j * 16, 16, 16); }
  });
  checker.wrapS = checker.wrapT = THREE.ClampToEdgeWrapping;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_W, 0.4), new THREE.MeshStandardMaterial({ map: checker }));
  line.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.position.set(p.x, y + 0.045, p.z);
  holder.rotation.y = Math.atan2(-nz, nx);
  holder.add(line);
  scene.add(holder);
}

// ---------- Décor : arbres, rochers (avec collisions) ----------
const colliders = [];
{
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6);
  const crownGeo = new THREE.ConeGeometry(1.2, 3.2, 7);
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#2a1d1a' }), 220);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#173a35', flatShading: true }), 220);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#3a3550', flatShading: true }), 90);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  let nt = 0, nr = 0, guard = 0;
  while ((nt < 220 || nr < 90) && guard++ < 20000) {
    const x = (Math.random() - 0.5) * (SIZE - 8), z = (Math.random() - 0.5) * (SIZE - 8);
    if (nearest(x, z).d < HALF_W + 5) continue;
    const y = terrainHeight(x, z);
    const s = 0.7 + Math.random() * 0.8;
    q.setFromAxisAngle(v.set(0, 1, 0), Math.random() * Math.PI);
    if (nt < 220) {
      m.compose(v.set(x, y + 0.7 * s, z), q, sc.set(s, s, s)); trunks.setMatrixAt(nt, m);
      m.compose(v.set(x, y + (1.4 + 1.5) * s, z), q, sc.set(s, s, s)); crowns.setMatrixAt(nt, m);
      colliders.push({ x, z, r: 0.35 * s });
      nt++;
    } else if (nr < 90) {
      m.compose(v.set(x, y + 0.2 * s, z), q, sc.set(s, s * 0.7, s)); rocks.setMatrixAt(nr, m);
      colliders.push({ x, z, r: 0.75 * s });
      nr++;
    }
  }
  for (const im of [trunks, crowns, rocks]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
}

// ---------- Voiture ----------
const car = await loadRcCar(renderer);
scene.add(car.group);
car.group.rotation.order = 'YXZ';
car.chassis.rotation.order = 'YXZ';

const state = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, speed: 0, vy: 0,
  grounded: true, lastGround: 0, idx: 0, pitch: 0, roll: 0, steer: 0, airTime: 0,
};
function placeOnTrack(i) {
  const p = samples[i], t = tangents[i];
  state.pos.set(p.x, groundHeight(p.x, p.z) + 0.05, p.z);
  state.yaw = Math.atan2(-t.x, -t.z);
  state.vel.set(0, 0, 0);
  state.speed = 0; state.vy = 0; state.idx = i;
  state.lastGround = groundHeight(p.x, p.z);
}
const START = M - 12;   // juste avant la ligne
placeOnTrack(START);

// ---------- Commandes ----------
const keys = new Set();
const touch = { x: 0, y: 0, brake: false };
addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'Escape') location.href = 'index.html';
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);
const pad = document.getElementById('joystick'), nub = pad.querySelector('span');
let padId = null;
const padMove = (e) => {
  const r = pad.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  touch.x = x; touch.y = y;
  nub.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
};
pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; pad.setPointerCapture(padId); padMove(e); });
pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, () => { padId = null; touch.x = touch.y = 0; nub.style.transform = ''; });
const hb = document.getElementById('btn-brake');
hb.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.brake = true; });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hb.addEventListener(ev, () => { touch.brake = false; });
document.getElementById('btn-reset').addEventListener('click', () => resetCar());

function resetCar() {
  placeOnTrack(state.idx);
}

// ---------- Chrono ----------
const lap = { start: null, current: 0, best: null, count: 0, checkpoints: new Set() };
try { const b = parseFloat(localStorage.getItem('rc-best-lap')); if (b > 0) lap.best = b; } catch {}
const fmt = (t) => (t == null ? '--:--.--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
const hud = {
  speed: document.getElementById('speed'), time: document.getElementById('lap-time'),
  best: document.getElementById('best'), laps: document.getElementById('laps'), msg: document.getElementById('msg'),
};
let msgTimer = 0;
function flash(text) { hud.msg.textContent = text; hud.msg.classList.add('show'); msgTimer = 1.8; }
function updateLap(prevIdx, idx, now) {
  // Points de contrôle à 25 %, 50 %, 75 % du tour
  for (const cp of [0.25, 0.5, 0.75]) {
    const c = Math.floor(cp * M);
    if (prevIdx < c && idx >= c && idx - prevIdx < 50) lap.checkpoints.add(cp);
  }
  // Passage de la ligne (index qui repasse par 0 en avançant)
  if (prevIdx > M - 50 && idx < 50) {
    if (lap.start === null) { lap.start = now; flash('C\'est parti !'); }
    else if (lap.checkpoints.size === 3) {
      const t = (now - lap.start) / 1000;
      lap.count++;
      if (lap.best === null || t < lap.best) {
        lap.best = t;
        try { localStorage.setItem('rc-best-lap', String(t)); } catch {}
        flash(`Record ! ${fmt(t)}`);
      } else flash(`Tour ${lap.count} : ${fmt(t)}`);
      lap.start = now;
    } else {
      lap.start = now;
    }
    lap.checkpoints.clear();
  }
}

// ---------- Mini-carte ----------
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const MAP = 130;
mini.width = mini.height = MAP * devicePixelRatio;
mctx.scale(devicePixelRatio, devicePixelRatio);
const toMap = (x, z) => [((x + SIZE / 2) / SIZE) * MAP, ((z + SIZE / 2) / SIZE) * MAP];
function drawMinimap() {
  mctx.clearRect(0, 0, MAP, MAP);
  mctx.fillStyle = 'rgba(10,8,20,.7)'; mctx.fillRect(0, 0, MAP, MAP);
  mctx.strokeStyle = COLORS.neonL; mctx.lineWidth = 3; mctx.beginPath();
  samples.forEach((p, i) => { const [x, y] = toMap(p.x, p.z); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
  mctx.closePath(); mctx.stroke();
  for (const o of obstacles) { const [x, y] = toMap(o.p.x, o.p.z); mctx.fillStyle = COLORS.ramp; mctx.fillRect(x - 2, y - 2, 4, 4); }
  const [cx, cy] = toMap(state.pos.x, state.pos.z);
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(cx, cy, 4, 0, Math.PI * 2); mctx.fill();
}

// ---------- Physique ----------
const G = 13;
const fwd = new THREE.Vector3();
function physics(dt) {
  const k = (c) => keys.has(c);
  let throttle = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - touch.y;
  let steerIn = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0) - touch.x;
  throttle = THREE.MathUtils.clamp(throttle, -1, 1);
  steerIn = THREE.MathUtils.clamp(steerIn, -1, 1);
  const handbrake = k('Space') || touch.brake;

  state.steer += (steerIn - state.steer) * (1 - Math.exp(-dt * 10));
  fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));

  const near = nearest(state.pos.x, state.pos.z, state.idx);
  const prevIdx = state.idx;
  state.idx = near.i;
  const offTrack = near.d > HALF_W + 0.2;

  if (state.grounded) {
    const s = state.speed;
    let a = 0;
    if (throttle > 0) a = s < 0 ? throttle * 30 : throttle * 16 * (1 - Math.max(0, s) / 26);
    else if (throttle < 0) a = s > 0.5 ? throttle * 30 : throttle * 9;
    state.speed += a * dt;
    // frottements : air + roulement, plus forts hors piste
    const roll = offTrack ? 2.2 : 0.35;
    state.speed -= state.speed * (offTrack ? 1.1 : 0.25) * dt;
    if (!throttle) state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), roll * dt * 3);
    if (handbrake) state.speed *= 1 - 1.6 * dt;
    // pente : la gravité freine en montée et accélère en descente
    state.speed -= G * Math.sin(state.pitch) * dt * 0.6;
    state.speed = THREE.MathUtils.clamp(state.speed, -7, 26);

    // direction
    const grip = Math.min(1, Math.abs(state.speed) / 3);
    const turn = state.steer * 2.6 * grip * Math.sign(state.speed || 1) * (1 - 0.4 * Math.min(1, Math.abs(state.speed) / 24));
    state.yaw += turn * (handbrake ? 1.7 : 1) * dt;
    // adhérence : la vitesse s'aligne sur l'avant de la voiture (glisse au frein à main)
    const target = fwd.clone().multiplyScalar(state.speed);
    const g = handbrake ? 2 : offTrack ? 6 : 9;
    state.vel.x += (target.x - state.vel.x) * (1 - Math.exp(-dt * g));
    state.vel.z += (target.z - state.vel.z) * (1 - Math.exp(-dt * g));
  } else {
    state.yaw += state.steer * 0.6 * dt;   // un peu de contrôle en l'air
  }

  // déplacement horizontal + collisions décor
  state.pos.x += state.vel.x * dt;
  state.pos.z += state.vel.z * dt;
  for (const c of colliders) {
    const dx = state.pos.x - c.x, dz = state.pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.25;
    if (d < min && d > 0) {
      state.pos.x = c.x + (dx / d) * min; state.pos.z = c.z + (dz / d) * min;
      state.speed *= -0.3; state.vel.multiplyScalar(-0.3);
    }
  }
  const lim = SIZE / 2 - 2;
  if (Math.abs(state.pos.x) > lim || Math.abs(state.pos.z) > lim) {
    state.pos.x = THREE.MathUtils.clamp(state.pos.x, -lim, lim);
    state.pos.z = THREE.MathUtils.clamp(state.pos.z, -lim, lim);
    state.speed *= -0.3; state.vel.multiplyScalar(-0.3);
  }

  // vertical : collé au sol, ou en vol quand le sol se dérobe (sauts)
  // La vitesse verticale au sol vient de la pente : si le sol se dérobe (haut d'un tremplin), la voiture décolle.
  const gy = groundHeight(state.pos.x, state.pos.z);
  state.vy -= G * dt;
  const ny = state.pos.y + state.vy * dt;
  if (ny <= gy) {
    if (!state.grounded && state.airTime > 0.35) flash(state.airTime > 0.9 ? 'Énorme saut !' : 'Saut !');
    state.pos.y = gy; state.grounded = true; state.airTime = 0;
    state.vy = THREE.MathUtils.clamp((gy - state.lastGround) / Math.max(dt, 1e-3), -30, 30);
  } else {
    state.pos.y = ny; state.grounded = false; state.airTime += dt;
  }
  state.lastGround = gy;

  // assiette : suit le sol au contact, suit la trajectoire en l'air
  let tp, tr;
  if (state.grounded) {
    const a = 0.2, b = 0.15;
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);   // droite de la voiture
    const hf = groundHeight(state.pos.x + fwd.x * a, state.pos.z + fwd.z * a);
    const hk = groundHeight(state.pos.x - fwd.x * a, state.pos.z - fwd.z * a);
    const hr = groundHeight(state.pos.x + rx * b, state.pos.z + rz * b);
    const hl = groundHeight(state.pos.x - rx * b, state.pos.z - rz * b);
    tp = Math.atan2(hf - hk, 2 * a);
    tr = Math.atan2(hr - hl, 2 * b);
  } else {
    tp = THREE.MathUtils.clamp(Math.atan2(state.vy, Math.max(2, state.vel.length())) * 0.7, -0.6, 0.6);
    tr = state.roll * 0.98;
  }
  const kk = 1 - Math.exp(-dt * (state.grounded ? 14 : 3));
  state.pitch += (tp - state.pitch) * kk;
  state.roll += (tr - state.roll) * kk;

  return { prevIdx };
}

// ---------- Caméra ----------
let camMode = 0;   // 0 = poursuite, 1 = proche
const camLook = new THREE.Vector3();
let camYaw = 0, camY = 0;
function updateCamera(dt, snap = false) {
  // La caméra reste à distance fixe derrière la voiture ; seul son cap et sa hauteur sont lissés.
  const portrait = innerWidth < innerHeight ? 1.6 : 1;   // sur mobile en portrait, on recule
  const dist = (camMode === 0 ? 1.4 : 0.8) * portrait, h = (camMode === 0 ? 0.5 : 0.3) * portrait;
  let d = state.yaw - camYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  camYaw = snap ? state.yaw : camYaw + d * (1 - Math.exp(-dt * 6));
  const x = state.pos.x + Math.sin(camYaw) * dist, z = state.pos.z + Math.cos(camYaw) * dist;
  const wantY = Math.max(state.pos.y + h, terrainHeight(x, z) + 0.25);
  camY = snap ? wantY : camY + (wantY - camY) * (1 - Math.exp(-dt * 6));
  camera.position.set(x, camY, z);
  const look = state.pos.clone().add(new THREE.Vector3(0, 0.15, 0)).addScaledVector(fwd, 1);
  camLook.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 15));
  camera.lookAt(camLook);
  camera.fov = 62 + Math.min(14, Math.abs(state.speed) * 0.5);
  camera.updateProjectionMatrix();
  moon.position.set(state.pos.x + 15, state.pos.y + 30, state.pos.z + 10);
  moon.target.position.copy(state.pos);
}

// ---------- Rendu + boucle ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.4, 0.8));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
updateCamera(0, true);
const clock = new THREE.Clock();
let wheelSpin = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const { prevIdx } = physics(dt);
  updateLap(prevIdx, state.idx, performance.now());

  car.group.position.copy(state.pos);
  car.group.rotation.y = state.yaw;
  car.chassis.rotation.x = state.pitch;
  car.chassis.rotation.z = state.roll;
  car.chassis.position.y = state.grounded ? Math.sin(performance.now() * 0.05) * 0.002 * Math.min(1, Math.abs(state.speed) / 5) : 0.01;
  for (const p of car.steerers) p.rotation.y = state.steer * 0.45;
  wheelSpin -= (state.speed / car.wheelRadius) * dt;
  for (const w of car.wheels) w.rotation.x = wheelSpin;

  updateCamera(dt);
  hud.speed.textContent = Math.round(Math.abs(state.speed) * 3.6);
  hud.time.textContent = lap.start === null ? fmt(null) : fmt((performance.now() - lap.start) / 1000);
  hud.best.textContent = fmt(lap.best);
  hud.laps.textContent = lap.count;
  if (msgTimer > 0 && (msgTimer -= dt) <= 0) hud.msg.classList.remove('show');
  drawMinimap();
  composer.render();
  window.done = true;
});
document.getElementById('loader').classList.add('hidden');

// Accès de débogage (console) : window.__rc.state
window.__rc = { state, samples, lap };
