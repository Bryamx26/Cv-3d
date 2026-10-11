import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OWNER, PROJECTS, HOMELAB } from './projects.js';
import { buildHomelab } from './homelab.js';

// Les modèles Kenney sont petits : on les agrandit pour une chambre à l'échelle (1 unité = 1 m).
const S = 2;
const ROOM = 5;           // pièce de 5 m x 5 m
const HALF = ROOM / 2;
const WALL_H = 2.8;

// ---------- Rendu, scène, caméra ----------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d1b26');

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.2, 0.9, -0.2);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minAzimuthAngle = 0.05;            // la pièce n'a que deux murs :
controls.maxAzimuthAngle = Math.PI / 2 - 0.05; // on reste du côté ouvert
function fitCamera() {
  // Plus l'écran est étroit (mobile), plus la caméra recule pour garder toute la pièce.
  const d = Math.max(8, 11 / (innerWidth / innerHeight));
  controls.maxDistance = Math.max(12, d + 3);
  camera.position.set(d * 0.68, d * 0.55, d * 0.68);
}
fitCamera();

// ---------- Lumières ----------
scene.add(new THREE.HemisphereLight('#fff4e6', '#3a3550', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------- Textures générées ----------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const floorTex = canvasTexture(512, 512, (g, w, h) => {
  const tones = ['#b98a5e', '#b3845a', '#c09265', '#ad7f55'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * 64, w, 64);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(0, i * 64, w, 2);
    g.fillRect(((i * 197) % w), i * 64, 2, 64);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(2, 2);

function wrapText(g, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); line = word; y += lineH; }
    else line = test;
  }
  g.fillText(line, x, y);
}

function posterTexture(p, i) {
  return canvasTexture(512, 704, (g, w, h) => {
    g.fillStyle = p.color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath(); g.arc(w * 0.75, h * 0.3, 170, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = '#fff';
    g.font = 'bold 34px system-ui, sans-serif';
    g.fillText(String(i + 1).padStart(2, '0'), 40, 70);
    g.font = 'bold 66px system-ui, sans-serif';
    wrapText(g, p.title, 40, h * 0.62 + 90, w - 80, 72);
    g.font = '30px system-ui, sans-serif';
    g.globalAlpha = 0.85;
    g.fillText(p.subtitle || '', 40, h - 50);
  });
}

function screenTexture() {
  return canvasTexture(768, 468, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#14213d'); grad.addColorStop(1, '#3a0ca3');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = 'bold 64px system-ui, sans-serif';
    g.fillText(OWNER.name, 48, 110);
    g.font = '34px system-ui, sans-serif';
    g.fillStyle = '#a5b4fc';
    g.fillText(OWNER.role, 48, 160);
    g.fillStyle = '#e0e7ff';
    g.font = '28px ui-monospace, monospace';
    PROJECTS.slice(0, 5).forEach((p, i) => g.fillText('> ' + p.title, 48, 230 + i * 40));
  });
}

// ---------- Interaction ----------
const clickables = [];
function makeClickable(obj, label, action) {
  obj.userData.label = label;
  obj.userData.action = action;
  clickables.push(obj);
}

// ---------- Chargement des modèles ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_, loaded, total) => {
  document.getElementById('progress').textContent = Math.round((loaded / total) * 100) + '%';
};
const loader = new GLTFLoader(manager);

function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    // Les matériaux Kenney sont "unlit" : on les passe en matériau standard pour avoir lumière et ombres.
    if (o.material.isMeshBasicMaterial) {
      o.material = new THREE.MeshStandardMaterial({ color: o.material.color, map: o.material.map, roughness: 0.8 });
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

// Pose un modèle : centré en (x, z), posé à la hauteur y, tourné de rot (radians). Face avant = +z avant rotation.
async function place(name, { x = 0, z = 0, y = 0, rot = 0, scale = S, setup } = {}) {
  const gltf = await loader.loadAsync(`models/${name}.glb`);
  const model = gltf.scene;
  prepare(model);
  if (setup) setup(model);
  model.scale.setScalar(scale);
  const obj = new THREE.Group();
  obj.add(model);
  obj.rotation.y = rot;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  obj.position.set(x - (box.min.x + box.max.x) / 2, y - box.min.y, z - (box.min.z + box.max.z) / 2);
  obj.userData.top = y + (box.max.y - box.min.y);
  scene.add(obj);
  return obj;
}

// ---------- La pièce ----------
function buildRoom() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM + 0.1, 0.1, ROOM + 0.1),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 })
  );
  floor.position.set(-0.05, -0.05, -0.05);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM + 0.1, WALL_H, 0.1), wallMat('#f1e6d6'));
  back.position.set(-0.05, WALL_H / 2, -HALF - 0.05);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.1, WALL_H, ROOM + 0.1), wallMat('#e6d6c2'));
  left.position.set(-HALF - 0.05, WALL_H / 2, -0.05);
  for (const w of [back, left]) { w.receiveShadow = true; scene.add(w); }

  // Plinthes
  const trim = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(ROOM, 0.1, 0.02), trim);
  b1.position.set(0, 0.05, -HALF + 0.01);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, ROOM), trim);
  b2.position.set(-HALF + 0.01, 0.05, 0);
  scene.add(b1, b2);
}

// Poster : un cadre + une affiche cliquable. wall = 'back' (mur du fond) ou 'left' (mur de gauche).
function addPoster(p, i, { wall, u, y }) {
  const W = 0.62, H = 0.85;
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, H + 0.06, 0.03), new THREE.MeshStandardMaterial({ color: '#2b2733', roughness: 0.5 }));
  frame.castShadow = true;
  const mat = new THREE.MeshStandardMaterial({ map: posterTexture(p, i), roughness: 0.6 });
  if (p.image) new THREE.TextureLoader().load(p.image, (t) => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  art.position.z = 0.016;
  group.add(frame, art);
  if (wall === 'back') group.position.set(u, y, -HALF + 0.02);
  else { group.position.set(-HALF + 0.02, y, u); group.rotation.y = Math.PI / 2; }
  group.userData.hoverable = true;
  scene.add(group);
  makeClickable(group, p.title, () => showProject(p));
}

// Tour de PC (le kit Kenney n'en contient pas) : construite en primitives, LED comprise.
const ledMat = new THREE.MeshBasicMaterial({ color: '#4cc9f0' });
function addPcTower(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.22), new THREE.MeshStandardMaterial({ color: '#2f3640', roughness: 0.5, metalness: 0.3 }));
  body.position.y = 0.23;
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.42, 0.18), new THREE.MeshStandardMaterial({ color: '#3d4652', roughness: 0.4 }));
  front.position.set(0.235, 0.23, 0);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.36, 0.012), ledMat);
  led.position.set(0.242, 0.23, 0.07);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 16), ledMat);
  btn.rotation.z = Math.PI / 2;
  btn.position.set(0.242, 0.4, -0.04);
  for (const m of [body, front]) { m.castShadow = m.receiveShadow = true; }
  g.add(body, front, led, btn);
  g.position.set(x, 0, z);
  scene.add(g);
  makeClickable(g, "L'ordinateur : à propos de moi", showAbout);
}

async function buildFurniture() {
  const R = Math.PI / 2;
  // Lit contre le mur du fond, table de chevet et lampe
  await place('bedDouble', { x: 1.2, z: -HALF + 1.13 });
  const night = await place('cabinetBedDrawerTable', { x: -0.05, z: -HALF + 0.24 });
  await place('lampSquareTable', { x: -0.05, z: -HALF + 0.22, y: night.userData.top });
  const lampLight = new THREE.PointLight('#ffb36b', 2.5, 4, 1.5);
  lampLight.position.set(-0.05, night.userData.top + 0.45, -HALF + 0.4);
  scene.add(lampLight);

  // Bureau (la table) contre le mur de gauche, face vers +x
  const deskZ = 0.35;
  const desk = await place('desk', { x: -HALF + 0.41, z: deskZ, rot: R });
  const top = desk.userData.top;
  const screen = await place('computerScreen', {
    x: -HALF + 0.3, z: deskZ, y: top, rot: R,
    setup: (m) => {
      // Affichage sur la dalle du moniteur (coordonnées de la dalle dans le modèle Kenney)
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.379, 0.231), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
      disp.position.set(0.1965, 0.1715, -0.0355);
      m.add(disp);
    },
  });
  makeClickable(screen, 'Écran : à propos de moi', showAbout);
  const glow = new THREE.PointLight('#7b8cff', 1.2, 2.5, 2);
  glow.position.set(-HALF + 0.8, top + 0.4, deskZ);
  scene.add(glow);
  await place('computerKeyboard', { x: -HALF + 0.72, z: deskZ, y: top, rot: R });
  await place('computerMouse', { x: -HALF + 0.72, z: deskZ + 0.45, y: top, rot: R });
  await place('speakerSmall', { x: -HALF + 0.25, z: deskZ - 0.55, y: top, rot: R });
  await place('plantSmall1', { x: -HALF + 0.22, z: deskZ + 0.6, y: top });
  await place('chairDesk', { x: -HALF + 1.15, z: deskZ, rot: -R });
  addPcTower(-HALF + 0.3, deskZ + 1.05);

  // Déco
  await place('bookcaseOpen', { x: -1.55, z: -HALF + 0.27 });
  await place('books', { x: -1.55, z: -HALF + 0.3, y: 1.76 });
  await place('lampRoundFloor', { x: -HALF + 0.3, z: -HALF + 0.3 });
  await place('rugRectangle', { x: 0.5, z: 0.7, rot: R });
  await place('pottedPlant', { x: 2.1, z: -HALF + 0.35 });
  await place('trashcan', { x: -HALF + 0.3, z: deskZ - 1.0 });
}

// Homelab sur une étagère murale entre la bibliothèque et la table de chevet
let homelab;
function addHomelab() {
  homelab = buildHomelab({ wallZ: -HALF, x: -0.73, shelfY: 0.95, outletY: 0.32 });
  scene.add(homelab.group);
  makeClickable(homelab.group, 'Mon homelab', () => {
    focusOn(homelab.focus, new THREE.Vector3(0.4, 0.75, 1.2));
    showHomelab();
  });
}

// Animation de caméra vers un point (annulée dès que l'utilisateur bouge la vue)
let camTween = null;
function focusOn(target, offset) {
  camTween = { target: target.clone(), pos: target.clone().add(offset) };
}
controls.addEventListener('start', () => { camTween = null; });

function buildPosters() {
  const spots = [
    { wall: 'left', u: 0.75, y: 1.95 },
    { wall: 'left', u: -0.05, y: 1.95 },
    { wall: 'back', u: 0.5, y: 1.8 },
    { wall: 'back', u: 1.25, y: 1.8 },
    { wall: 'back', u: 2.0, y: 1.8 },
  ];
  PROJECTS.slice(0, spots.length).forEach((p, i) => addPoster(p, i, spots[i]));
}

// ---------- Panneau d'infos ----------
const panel = document.getElementById('panel');
const body = document.getElementById('panel-body');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showProject(p) {
  body.innerHTML = `
    <div class="bar" style="background:${esc(p.color)}"></div>
    <h2>${esc(p.title)}</h2>
    <p class="sub">${esc(p.subtitle || '')}</p>
    ${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}
    <p>${esc(p.description)}</p>
    <div class="tags">${(p.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    ${p.url ? `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">Voir le projet</a>` : ''}`;
  panel.style.setProperty('--accent', p.color);
  panel.classList.add('open');
}

function showHomelab() {
  const h = HOMELAB;
  panel.style.setProperty('--accent', h.color);
  body.innerHTML = `
    <div class="bar"></div>
    <h2>${esc(h.title)}</h2>
    <p class="sub">${esc(h.subtitle)}</p>
    <p>${esc(h.description)}</p>
    <h3>Matériel</h3>
    <ul class="plain">${h.hardware.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="tags">${h.services.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    ${h.url ? `<a class="btn" href="${esc(h.url)}" target="_blank" rel="noopener">En savoir plus</a>` : ''}`;
  panel.classList.add('open');
}

function showAbout() {
  panel.style.removeProperty('--accent');
  body.innerHTML = `
    <div class="bar"></div>
    <h2>${esc(OWNER.name)}</h2>
    <p class="sub">${esc(OWNER.role)}</p>
    <p>${esc(OWNER.about)}</p>
    <div>${OWNER.links.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>
    <h3>Mes projets</h3>
    <ul>${PROJECTS.map((p, i) => `<li data-i="${i}">${esc(p.title)}</li>`).join('')}</ul>`;
  body.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => showProject(PROJECTS[+li.dataset.i])));
  panel.classList.add('open');
}
document.getElementById('close').addEventListener('click', () => panel.classList.remove('open'));
addEventListener('keydown', (e) => { if (e.key === 'Escape') panel.classList.remove('open'); });

// ---------- Survol et clic ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let hovered = null;
let downAt = null;

function pick(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickables, true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.action) o = o.parent;
  return o;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  hovered = pick(e);
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
  if (hovered && e.pointerType === 'mouse') {
    tooltip.textContent = hovered.userData.label;
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
});
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; // c'était un glisser
  const o = pick(e);
  if (o) o.userData.action();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Boucle ----------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (homelab) homelab.update(t);
  if (camTween) {
    const k = 1 - Math.exp(-dt * 4);
    controls.target.lerp(camTween.target, k);
    camera.position.lerp(camTween.pos, k);
    if (camera.position.distanceTo(camTween.pos) < 0.01) camTween = null;
  }
  ledMat.color.setHSL(0.53, 0.85, 0.5 + Math.sin(t * 2) * 0.12);
  for (const o of clickables) {
    if (!o.userData.hoverable) continue;
    const s = o === hovered ? 1.06 : 1;
    o.scale.lerp(new THREE.Vector3(s, s, s), 0.15);
  }
  controls.update();
  renderer.render(scene, camera);
}

buildRoom();
buildPosters();
addHomelab();
buildFurniture()
  .then(() => {
    document.getElementById('loader').classList.add('hidden');
    renderer.setAnimationLoop(animate);
    window.done = true;
  })
  .catch((err) => {
    document.getElementById('loader').textContent = 'Erreur de chargement : ' + err.message;
    console.error(err);
  });
