import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadRcCar } from './rccar.js';

// Piste de course RC de nuit : course de 3 tours contre 3 voitures pilotées par l'ordinateur,
// avec volant, accélérateur et frein à l'écran. Unités en mètres, voitures au 1/10 (~45 cm).

const SIZE = 170;           // côté du terrain
const GRID = 171;           // sommets par côté (1 m de résolution)
const HALF_W = 2.0;         // demi-largeur de piste (4 m)
const WALL = HALF_W + 1.3;  // murets de part et d'autre (zone de dégagement de 1,3 m)
const LAPS = 3;
const COLORS = { neonL: '#00e5ff', neonR: '#ff2bd6', gate: '#9d4edd' };

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
    const w = smooth(WALL + 1, WALL + 8, d);
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

// ---------- Piste : asphalte, lignes blanches, vibreurs, murets ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const asphalt = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#22212b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillRect(4, 0, 5, h); g.fillRect(w - 9, 0, 5, h);           // lignes de bord
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(w / 2 - 2, 0, 4, h / 2);   // axe pointillé
});
const curbTex = canvasTex(8, 64, (g, w, h) => {
  g.fillStyle = '#e8213a'; g.fillRect(0, 0, w, h / 2);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, h / 2, w, h / 2);
});

// Ruban le long du tracé entre deux décalages latéraux (gauche > 0)
function ribbon(offsetA, offsetB, lift, material, vRepeat = 1, vertical = 0) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= M; i++) {
    const p = samples[i % M], t = tangents[i % M];
    const nx = -t.z, nz = t.x;
    for (const [o, u] of [[offsetA, 0], [offsetB, 1]]) {
      // ruban vertical (muret) : même décalage, deux hauteurs
      const off = vertical ? offsetA : o;
      const x = p.x + nx * off, z = p.z + nz * off;
      pos.push(x, terrainHeight(x, z) + (vertical ? (u ? vertical : -0.3) : lift(o)), z);
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
const neon = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, side: THREE.DoubleSide });
ribbon(HALF_W, -HALF_W, () => 0.03, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85, side: THREE.DoubleSide }), 6);
for (const s of [1, -1]) {
  ribbon(s * HALF_W, s * (HALF_W + 0.45), () => 0.035, new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6, side: THREE.DoubleSide }), 1.6);
  ribbon(s * (HALF_W + 0.45), s * WALL, () => 0.025, new THREE.MeshStandardMaterial({ color: '#2d4a3c', roughness: 1, side: THREE.DoubleSide }), 4);
  // muret + liseré néon
  ribbon(s * WALL, 0, null, new THREE.MeshStandardMaterial({ color: '#16141f', roughness: 0.7, side: THREE.DoubleSide }), 1, 0.32);
  ribbon(s * (WALL - 0.04), s * (WALL + 0.04), () => 0.33, neon(s > 0 ? COLORS.neonL : COLORS.neonR));
}
const groundHeight = (x, z) => terrainHeight(x, z) + 0.03;

// Courbure de la piste : vitesse maximale par endroit (pour les adversaires)
const ds = trackLength / M;
const nLeft = tangents.map((t) => new THREE.Vector2(-t.z, t.x));
const signedCurv = samples.map((_, i) => {
  const a = tangents[(i - 6 + M) % M], b = tangents[(i + 6) % M];
  return ((b.x - a.x) * nLeft[i].x + (b.z - a.z) * nLeft[i].y) / (12 * ds);
});
const VTOP = 18, ALAT = 15, DECEL = 11;
const vProfile = signedCurv.map((k) => Math.min(VTOP, Math.sqrt(ALAT / Math.max(1e-4, Math.abs(k)))));
for (let pass = 0; pass < 2; pass++) {
  for (let j = M - 1; j >= 0; j--) {
    const nxt = vProfile[(j + 1) % M];
    vProfile[j] = Math.min(vProfile[j], Math.sqrt(nxt * nxt + 2 * DECEL * ds));
  }
}
// Trajectoire idéale : on coupe vers l'intérieur des virages
const racingLine = signedCurv.map((_, i) => {
  let k = 0;
  for (let j = 5; j <= 35; j += 5) k += signedCurv[(i + j) % M];
  return THREE.MathUtils.clamp((k / 7) * 30, -(HALF_W - 0.4), HALF_W - 0.4);
});

// ---------- Ligne de départ, tribune, projecteurs ----------
function frameAt(i) { i = ((i % M) + M) % M; return { p: samples[i], dir: tangents[i], i }; }
{
  const { p, dir } = frameAt(0);
  const nx = -dir.z, nz = dir.x;
  const y = terrainHeight(p.x, p.z);
  const postMat = new THREE.MeshStandardMaterial({ color: '#1b1830' });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), postMat);
    post.position.set(p.x + nx * s * (WALL + 0.2), y + 1.5, p.z + nz * s * (WALL + 0.2));
    post.castShadow = true;
    scene.add(post);
  }
  const bannerTex = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#0d0b18'; g.fillRect(0, 0, w, h);
    g.strokeStyle = COLORS.gate; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('START · FINISH', w / 2, 66);
  });
  bannerTex.wrapS = bannerTex.wrapT = THREE.ClampToEdgeWrapping;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * WALL + 0.6, 0.6, 0.08), [postMat, postMat, postMat, postMat, new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }), new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false })]);
  banner.position.set(p.x, y + 2.9, p.z);
  banner.rotation.y = Math.atan2(-nz, nx);
  scene.add(banner);
  const checker = canvasTex(256, 32, (g) => {
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
// Cases de la grille de départ
const GRID_SLOTS = [0, 1, 2, 3].map((k) => ({ idx: M - 6 - k * 5, off: k % 2 ? -0.9 : 0.9 }));
{
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 });
  for (const sl of GRID_SLOTS) {
    const { p, dir } = frameAt(sl.idx - 1);
    const x = p.x - dir.z * sl.off, z = p.z + dir.x * sl.off;
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), mat);
    mark.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.position.set(x, terrainHeight(x, z) + 0.04, z);
    g.rotation.y = Math.atan2(-dir.x, -dir.z);   // la marque est perpendiculaire à la piste
    g.add(mark);
    scene.add(g);
  }
}
// Tribune avec public, côté extérieur de la ligne droite
const standCenter = new THREE.Vector3();
{
  const { p, dir } = frameAt(-25);
  const n = new THREE.Vector3(-dir.z, 0, dir.x);
  const side = p.clone().addScaledVector(n, 8).length() > p.length() ? 1 : -1;
  const g = new THREE.Group();
  g.position.copy(p).addScaledVector(n, side * (WALL + 1.5));
  g.position.y = terrainHeight(g.position.x, g.position.z);
  g.rotation.y = Math.atan2(-dir.z, dir.x);
  standCenter.copy(g.position);
  const L = 22, tierMat = new THREE.MeshStandardMaterial({ color: '#3a3352', roughness: 0.8 });
  const people = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.5, 0.25), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 200);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  const palette = ['#ff2bd6', '#00e5ff', '#ffd166', '#ffffff', '#ff6b35', '#7bff5c', '#9d4edd', '#e8213a'];
  let np = 0;
  for (let k = 0; k < 5; k++) {
    const top = 0.45 * (k + 1);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(L, top + 2, 1), tierMat);
    tier.position.set(0, top / 2 - 1, side * (k + 0.5));
    tier.castShadow = tier.receiveShadow = true;
    g.add(tier);
    for (let j = 0; j < 40 && np < 200; j++) {
      if (Math.random() < 0.15) continue;
      m4.makeTranslation(-L / 2 + 0.4 + j * (L - 0.8) / 39, top + 0.25, side * (k + 0.5));
      people.setMatrixAt(np, m4);
      people.setColorAt(np, c.set(palette[Math.floor(Math.random() * palette.length)]));
      np++;
    }
  }
  people.count = np;
  g.add(people);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.12, 5.6), new THREE.MeshStandardMaterial({ color: '#1b1830' }));
  roof.position.set(0, 4.2, side * 2.6);
  g.add(roof);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.08, 0.08), neon(COLORS.neonR));
  strip.position.set(0, 4.12, side * -0.15);
  g.add(strip);
  for (const x of [-L / 2, 0, L / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4.2, 0.15), roof.material);
    post.position.set(x, 2.1, side * 5.2);
    g.add(post);
  }
  scene.add(g);
}
// Projecteurs autour de la piste
{
  const poleMat = new THREE.MeshStandardMaterial({ color: '#2a2640' });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false });
  for (let i = 40, k = 0; i < M; i += 75, k++) {
    const { p, dir } = frameAt(i);
    const s = k % 2 ? 1 : -1, off = s * (WALL + 0.8);
    const x = p.x - dir.z * off, z = p.z + dir.x * off, y = terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5, 6), poleMat);
    pole.position.set(x, y + 2.5, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.3), lampMat);
    lamp.position.set(x, y + 5, z);
    lamp.lookAt(p.x, y, p.z);
    scene.add(pole, lamp);
  }
}

// ---------- Décor : arbres et rochers ----------
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
    if (nearest(x, z).d < WALL + 4) continue;
    if (Math.hypot(x - standCenter.x, z - standCenter.z) < 16) continue;
    const y = terrainHeight(x, z);
    const s = 0.7 + Math.random() * 0.8;
    q.setFromAxisAngle(v.set(0, 1, 0), Math.random() * Math.PI);
    if (nt < 220) {
      m.compose(v.set(x, y + 0.7 * s, z), q, sc.set(s, s, s)); trunks.setMatrixAt(nt, m);
      m.compose(v.set(x, y + (1.4 + 1.5) * s, z), q, sc.set(s, s, s)); crowns.setMatrixAt(nt, m);
      nt++;
    } else {
      m.compose(v.set(x, y + 0.2 * s, z), q, sc.set(s, s * 0.7, s)); rocks.setMatrixAt(nr, m);
      nr++;
    }
  }
  for (const im of [trunks, crowns, rocks]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
}

// ---------- Voitures ----------
const DRIVERS = [
  { name: 'Toi', body: '#ff1a1a', player: true, slot: 2 },
  { name: 'Bleu', body: '#1e6bff', skill: 1.0, slot: 0 },
  { name: 'Jaune', body: '#ffc400', skill: 0.95, slot: 1 },
  { name: 'Vert', body: '#00c853', skill: 0.9, slot: 3 },
];
const cars = await Promise.all(DRIVERS.map((d) => loadRcCar(renderer, { body: d.body })));
for (const c of cars) {
  scene.add(c.group);
  c.group.rotation.order = 'YXZ';
  c.chassis.rotation.order = 'YXZ';
  c.spin = 0;
}
const car = cars[0];
const rivals = DRIVERS.slice(1).map((d, k) => ({ ...d, car: cars[k + 1], s: 0, v: 0, off: 0, passSide: 0, passTimer: 0, pos: new THREE.Vector3(), yaw: 0, pitch: 0 }));

const state = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, speed: 0, vy: 0,
  grounded: true, lastGround: 0, idx: 0, pitch: 0, roll: 0, steer: 0, prog: 0,
};
// Décalage latéral (gauche > 0) d'un point par rapport à l'échantillon i
const lateral = (x, z, i) => (x - samples[i].x) * nLeft[i].x + (z - samples[i].z) * nLeft[i].y;

function placePlayer(i, off) {
  const p = samples[i], t = tangents[i];
  const x = p.x + nLeft[i].x * off, z = p.z + nLeft[i].y * off;
  state.pos.set(x, groundHeight(x, z), z);
  state.yaw = Math.atan2(-t.x, -t.z);
  state.vel.set(0, 0, 0);
  state.speed = 0; state.vy = 0; state.idx = i;
  state.lastGround = groundHeight(x, z);
}

// ---------- Commandes : clavier + volant et pédales à l'écran ----------
const keys = new Set();
const input = { wheel: 0, gas: 0, brake: 0, wheelHeld: false };
addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'Escape') location.href = 'index.html';
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);

const WHEEL_MAX = 135;   // degrés de rotation du volant à fond
const wheelEl = document.getElementById('wheel');
let wheelId = null, grabAngle = 0, grabWheel = 0;
const pointerAngle = (e) => {
  const r = wheelEl.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
};
wheelEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  wheelId = e.pointerId; wheelEl.setPointerCapture(wheelId);
  input.wheelHeld = true; grabAngle = pointerAngle(e); grabWheel = input.wheel * WHEEL_MAX;
});
wheelEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== wheelId) return;
  let d = pointerAngle(e) - grabAngle;
  d = ((d + 540) % 360) - 180;
  const a = THREE.MathUtils.clamp(grabWheel + d, -WHEEL_MAX, WHEEL_MAX);
  input.wheel = a / WHEEL_MAX;
  // on suit la main sans dépasser la butée
  if (Math.abs(grabWheel + d) > WHEEL_MAX) { grabWheel = a; grabAngle = pointerAngle(e); }
});
for (const ev of ['pointerup', 'pointercancel']) wheelEl.addEventListener(ev, () => { wheelId = null; input.wheelHeld = false; });

for (const [id, key] of [['pedal-gas', 'gas'], ['pedal-brake', 'brake']]) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); input[key] = 1; });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { input[key] = 0; });
}
document.getElementById('btn-reset').addEventListener('click', () => resetCar());
addEventListener('contextmenu', (e) => { if (e.target.closest('#controls')) e.preventDefault(); });

function resetCar() {
  placePlayer(state.idx, THREE.MathUtils.clamp(lateral(state.pos.x, state.pos.z, state.idx), -1.2, 1.2));
}

// ---------- Course : départ, tours, classement ----------
const race = { phase: 'grid', t: 0, start: 0, lapStart: 0, laps: 0, lapTimes: [], best: null, finishTime: null, place: 0, finishOrder: [] };
try { const b = parseFloat(localStorage.getItem('rc-best-lap-course')); if (b > 0) race.best = b; } catch {}
const fmt = (t) => (t == null ? '--:--.--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
const hud = {
  speed: document.getElementById('speed'), time: document.getElementById('lap-time'), best: document.getElementById('best'),
  lap: document.getElementById('lap'), place: document.getElementById('place'), msg: document.getElementById('msg'),
  result: document.getElementById('result'), lights: document.querySelectorAll('#lights i'),
};
let msgTimer = 0;
function flash(text, time = 1.8) { hud.msg.textContent = text; hud.msg.classList.add('show'); msgTimer = time; }

function startRace() {
  const slot = GRID_SLOTS[DRIVERS[0].slot];
  placePlayer(slot.idx, slot.off);
  state.prog = slot.idx - M;
  for (const r of rivals) {
    const sl = GRID_SLOTS[r.slot];
    r.s = sl.idx - M; r.v = 0; r.off = sl.off; r.passTimer = 0; r.finished = null;
  }
  Object.assign(race, { phase: 'countdown', t: 0, laps: 0, lapTimes: [], finishTime: null, finishOrder: [] });
  hud.result.classList.remove('show');
  document.getElementById('lights').classList.add('show');
  hud.lights.forEach((l) => l.classList.remove('on', 'go'));
}

// Classement : arrivés d'abord, puis progression (en échantillons, tours compris)
function standings() {
  const all = [{ ...DRIVERS[0], prog: state.prog, finished: race.finishTime }, ...rivals.map((r) => ({ name: r.name, body: r.body, prog: r.s, finished: r.finished }))];
  return all.sort((a, b) => {
    if (a.finished != null && b.finished != null) return a.finished - b.finished;
    if (a.finished != null) return -1;
    if (b.finished != null) return 1;
    return b.prog - a.prog;
  });
}

function updateRace(dt, now) {
  if (race.phase === 'countdown') {
    race.t += dt;
    const lit = Math.min(5, Math.floor(race.t / 0.7));
    hud.lights.forEach((l, k) => l.classList.toggle('on', k < lit));
    if (race.t >= 0.7 * 5 + 0.6) {
      race.phase = 'race'; race.start = race.lapStart = now;
      hud.lights.forEach((l) => { l.classList.remove('on'); l.classList.add('go'); });
      flash('GO !', 1);
      setTimeout(() => document.getElementById('lights').classList.remove('show'), 1200);
    }
    return;
  }
  if (race.phase === 'grid') return;
  for (const r of rivals) {
    if (r.finished == null && r.s >= LAPS * M) r.finished = (now - race.start) / 1000;
  }
  if (race.phase !== 'race') return;
  // Tours du joueur
  const done = Math.floor(state.prog / M);
  if (done > race.laps) {
    race.laps = done;
    const t = (now - race.lapStart) / 1000;
    race.lapStart = now;
    race.lapTimes.push(t);
    let record = false;
    if (race.best === null || t < race.best) {
      race.best = t; record = true;
      try { localStorage.setItem('rc-best-lap-course', String(t)); } catch {}
    }
    if (race.laps >= LAPS) {
      race.finishTime = (now - race.start) / 1000;
      race.phase = 'done';
      const place = standings().findIndex((d) => d.player) + 1;
      flash(place === 1 ? 'Victoire !' : `Arrivée : ${place}e`, 2.5);
      setTimeout(() => showResult(place), 1800);
    } else if (race.laps === LAPS - 1) flash(record ? `Record ${fmt(t)} · Dernier tour !` : 'Dernier tour !');
    else flash(record ? `Record ! ${fmt(t)}` : `Tour ${race.laps + 1}/${LAPS}`);
  }
}

function showResult(place) {
  const list = standings();
  const rows = list.map((d, k) => {
    const time = d.finished != null ? fmt(d.finished) : 'en course';
    return `<li class="${d.player ? 'me' : ''}"><span class="dot" style="background:${d.body}"></span>${k + 1}. ${d.name}<b>${time}</b></li>`;
  }).join('');
  const bestRace = Math.min(...race.lapTimes);
  hud.result.querySelector('h2').textContent = place === 1 ? 'Victoire ! 🏆' : `Tu finis ${place}e sur ${list.length}`;
  hud.result.querySelector('ol').innerHTML = rows;
  hud.result.querySelector('p').textContent = `Meilleur tour de la course : ${fmt(bestRace)} · Record : ${fmt(race.best)}`;
  hud.result.classList.add('show');
  hud.msg.classList.remove('show');
}
document.getElementById('btn-again').addEventListener('click', startRace);

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
  mctx.strokeStyle = '#8f88b0'; mctx.lineWidth = 4; mctx.beginPath();
  samples.forEach((p, i) => { const [x, y] = toMap(p.x, p.z); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
  mctx.closePath(); mctx.stroke();
  for (const r of rivals) {
    const [x, y] = toMap(r.pos.x, r.pos.z);
    mctx.fillStyle = r.body; mctx.beginPath(); mctx.arc(x, y, 3.5, 0, Math.PI * 2); mctx.fill();
  }
  const [cx, cy] = toMap(state.pos.x, state.pos.z);
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(cx, cy, 4.5, 0, Math.PI * 2); mctx.fill();
  mctx.fillStyle = DRIVERS[0].body; mctx.beginPath(); mctx.arc(cx, cy, 2.8, 0, Math.PI * 2); mctx.fill();
}

// ---------- Physique du joueur ----------
const G = 13;
const CAR_R = 0.2;   // rayon de collision d'une voiture
const fwd = new THREE.Vector3();
function physics(dt) {
  const k = (c) => keys.has(c);
  let throttle = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + input.gas - input.brake;
  let steerIn = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0) - input.wheel;
  throttle = THREE.MathUtils.clamp(throttle, -1, 1);
  steerIn = THREE.MathUtils.clamp(steerIn, -1, 1);
  const handbrake = k('Space');
  if (race.phase === 'countdown' || race.phase === 'grid') throttle = 0;

  state.steer += (steerIn - state.steer) * (1 - Math.exp(-dt * 10));
  fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));

  const near = nearest(state.pos.x, state.pos.z, state.idx);
  const prevIdx = state.idx;
  state.idx = near.i;
  let di = state.idx - prevIdx;
  if (di > M / 2) di -= M; else if (di < -M / 2) di += M;
  state.prog += di;
  const offTrack = near.d > HALF_W + 0.45;

  const s = state.speed;
  let a = 0;
  if (throttle > 0) a = s < 0 ? throttle * 30 : throttle * 16 * (1 - Math.max(0, s) / 26);
  else if (throttle < 0) a = s > 0.5 ? throttle * 30 : throttle * 9;
  state.speed += a * dt;
  const roll = offTrack ? 2.2 : 0.35;
  state.speed -= state.speed * (offTrack ? 1.1 : 0.25) * dt;
  if (!throttle) state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), roll * dt * 3);
  if (handbrake) state.speed *= 1 - 1.6 * dt;
  state.speed -= G * Math.sin(state.pitch) * dt * 0.6;
  state.speed = THREE.MathUtils.clamp(state.speed, -7, 26);

  const grip = Math.min(1, Math.abs(state.speed) / 3);
  const turn = state.steer * 2.6 * grip * Math.sign(state.speed || 1) * (1 - 0.4 * Math.min(1, Math.abs(state.speed) / 24));
  state.yaw += turn * (handbrake ? 1.7 : 1) * dt;
  const target = fwd.clone().multiplyScalar(state.speed);
  const g = handbrake ? 2 : offTrack ? 6 : 9;
  state.vel.x += (target.x - state.vel.x) * (1 - Math.exp(-dt * g));
  state.vel.z += (target.z - state.vel.z) * (1 - Math.exp(-dt * g));

  state.pos.x += state.vel.x * dt;
  state.pos.z += state.vel.z * dt;

  // Murets : on repousse la voiture sur la piste
  const lat = lateral(state.pos.x, state.pos.z, state.idx), lim = WALL - CAR_R;
  if (Math.abs(lat) > lim) {
    const push = Math.sign(lat) * lim - lat;
    state.pos.x += nLeft[state.idx].x * push; state.pos.z += nLeft[state.idx].y * push;
    const vn = state.vel.x * nLeft[state.idx].x + state.vel.z * nLeft[state.idx].y;
    if (vn * lat > 0) { state.vel.x -= nLeft[state.idx].x * vn * 1.4; state.vel.z -= nLeft[state.idx].y * vn * 1.4; }
    state.speed *= 1 - 2 * dt;
  }
  // Contacts avec les adversaires
  for (const r of rivals) {
    const dx = state.pos.x - r.pos.x, dz = state.pos.z - r.pos.z, d = Math.hypot(dx, dz), min = 2 * CAR_R;
    if (d < min && d > 1e-4) {
      state.pos.x = r.pos.x + (dx / d) * min; state.pos.z = r.pos.z + (dz / d) * min;
      const behind = dx * fwd.x + dz * fwd.z < 0;   // le joueur est derrière
      if (behind) { state.speed = Math.min(state.speed, r.v * 0.9); r.v *= 0.97; }
      else r.v *= 0.85;
    }
  }

  const gy = groundHeight(state.pos.x, state.pos.z);
  state.pos.y = gy;
  const fa = 0.2, sb = 0.15;
  const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
  const hf = groundHeight(state.pos.x + fwd.x * fa, state.pos.z + fwd.z * fa);
  const hk = groundHeight(state.pos.x - fwd.x * fa, state.pos.z - fwd.z * fa);
  const hr = groundHeight(state.pos.x + rx * sb, state.pos.z + rz * sb);
  const hl = groundHeight(state.pos.x - rx * sb, state.pos.z - rz * sb);
  const kk = 1 - Math.exp(-dt * 14);
  state.pitch += (Math.atan2(hf - hk, 2 * fa) - state.pitch) * kk;
  state.roll += (Math.atan2(hr - hl, 2 * sb) - state.roll) * kk;
}

// ---------- Pilotes de l'ordinateur ----------
const others = (self) => [{ prog: state.prog, off: lateral(state.pos.x, state.pos.z, state.idx), v: state.speed }, ...rivals.filter((r) => r !== self).map((r) => ({ prog: r.s, off: r.off, v: r.v }))];
function updateRivals(dt) {
  const racing = race.phase === 'race' || race.phase === 'done';
  for (const r of rivals) {
    const i = ((Math.floor(r.s) % M) + M) % M;
    // Vitesse visée : profil de la piste × niveau du pilote, petit élastique vers le joueur
    const gap = (r.s - state.prog) * ds;
    let skill = r.skill * (gap > 25 ? 0.94 : gap < -25 ? 1.05 : 1);
    if (r.finished != null) skill = 0.6;
    let want = racing ? vProfile[(i + 4) % M] * skill : 0;
    // Trafic : on ralentit derrière une voiture et on tente de la dépasser
    let wantOff = racingLine[i];
    for (const o of others(r)) {
      const along = (o.prog - r.s) * ds;
      if (along > 0 && along < 2.2 && Math.abs(o.off - r.off) < 0.55) {
        if (r.passTimer <= 0) { r.passSide = o.off > 0 ? -1 : 1; r.passTimer = 2.5; }
        if (along < 0.9) want = Math.min(want, Math.max(0, o.v * 0.95));
      }
    }
    if (r.passTimer > 0) { r.passTimer -= dt; wantOff = r.passSide * (HALF_W - 0.6); }
    r.off += (wantOff - r.off) * (1 - Math.exp(-dt * 1.6));
    if (r.v < want) r.v = Math.min(want, r.v + 13 * (1 - r.v / 24) * dt);
    else r.v = Math.max(want, r.v - 14 * dt);
    r.s += (r.v * dt) / ds;

    // Position sur la piste
    const j = ((Math.floor(r.s) % M) + M) % M, f = r.s - Math.floor(r.s), j2 = (j + 1) % M;
    const p = samples[j], q = samples[j2];
    const nx = nLeft[j].x, nz = nLeft[j].y;
    r.pos.set(p.x + (q.x - p.x) * f + nx * r.off, 0, p.z + (q.z - p.z) * f + nz * r.off);
    r.pos.y = groundHeight(r.pos.x, r.pos.z);
    const t = tangents[j];
    const yaw = Math.atan2(-t.x, -t.z);
    let dy = yaw - r.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    r.yaw += dy * (1 - Math.exp(-dt * 12));
    const slope = Math.atan2(samples[(j + 3) % M].y - samples[(j - 3 + M) % M].y, 6 * ds);
    r.pitch += (slope - r.pitch) * (1 - Math.exp(-dt * 10));

    const c = r.car;
    c.group.position.copy(r.pos);
    c.group.rotation.y = r.yaw;
    c.chassis.rotation.x = r.pitch;
    for (const s of c.steerers) s.rotation.y = THREE.MathUtils.clamp(signedCurv[j] * 6, -0.45, 0.45);
    c.spin -= (r.v / c.wheelRadius) * dt;
    for (const w of c.wheels) w.rotation.x = c.spin;
  }
}

// ---------- Caméra ----------
let camMode = 0;   // 0 = poursuite, 1 = proche
const camLook = new THREE.Vector3();
let camYaw = 0, camY = 0;
function updateCamera(dt, snap = false) {
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
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.85));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const wheelIcon = wheelEl.querySelector('svg');
const pedalGas = document.getElementById('pedal-gas'), pedalBrake = document.getElementById('pedal-brake');
startRace();
updateRivals(0);
fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
updateCamera(0, true);
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const now = performance.now();
  // Volant relâché : il revient au centre
  if (!input.wheelHeld) input.wheel *= Math.exp(-dt * 8);
  physics(dt);
  updateRivals(dt);
  updateRace(dt, now);

  car.group.position.copy(state.pos);
  car.group.rotation.y = state.yaw;
  car.chassis.rotation.x = state.pitch;
  car.chassis.rotation.z = state.roll;
  for (const p of car.steerers) p.rotation.y = state.steer * 0.45;
  car.spin -= (state.speed / car.wheelRadius) * dt;
  for (const w of car.wheels) w.rotation.x = car.spin;

  // Retour visuel des commandes (aussi au clavier)
  wheelIcon.style.transform = `rotate(${-state.steer * WHEEL_MAX}deg)`;
  const kGas = keys.has('KeyW') || keys.has('ArrowUp'), kBrake = keys.has('KeyS') || keys.has('ArrowDown');
  pedalGas.classList.toggle('down', input.gas > 0 || kGas);
  pedalBrake.classList.toggle('down', input.brake > 0 || kBrake);

  updateCamera(dt);
  hud.speed.textContent = Math.round(Math.abs(state.speed) * 3.6);
  const running = race.phase === 'race';
  hud.time.textContent = running ? fmt((now - race.start) / 1000) : race.finishTime != null ? fmt(race.finishTime) : fmt(0);
  hud.best.textContent = fmt(race.best);
  hud.lap.textContent = `${Math.min(LAPS, Math.max(1, race.laps + 1))}/${LAPS}`;
  hud.place.textContent = `${standings().findIndex((d) => d.player) + 1}/${DRIVERS.length}`;
  if (msgTimer > 0 && (msgTimer -= dt) <= 0) hud.msg.classList.remove('show');
  drawMinimap();
  composer.render();
  window.done = true;
});
document.getElementById('loader').classList.add('hidden');

// Accès de débogage (console) : window.__rc.state
// sim(n, dt) fait avancer la course sans rendu (tests).
window.__rc = {
  state, samples, race, rivals, input,
  simClock: 0,
  sim(n, dt = 1 / 60, drive) {
    for (let k = 0; k < n; k++) { const now = performance.now() + (this.simClock += dt * 1000); drive?.(); physics(dt); updateRivals(dt); updateRace(dt, now); }
  },
};
