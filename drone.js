import * as THREE from 'three';

// Drone quadricoptère + radiocommande, en primitives Three.js (mètres),
// et le contrôleur de vol (clavier + commandes tactiles).
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });
const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// Tiny whoop FPV façon BETAFPV Meteor75 / Air65 : 4 hélices dans des conduits bleus,
// canopy blanche, caméra FPV inclinée, antenne, batterie dessous.
// Modélisé à la taille réelle (75 mm entre moteurs en diagonale). K permet de l'agrandir.
const K = 1;
export function buildDrone() {
  const root = new THREE.Group();   // position / cap (yaw)
  const body = new THREE.Group();   // inclinaison en vol
  root.add(body);
  const model = new THREE.Group();
  model.scale.setScalar(K);
  body.add(model);

  const blue = mat('#5fb8f5', { roughness: 0.35 });
  const blueDark = mat('#3d9be0', { roughness: 0.4 });
  const white = mat('#f4f6f8', { roughness: 0.3 });
  const black = mat('#15171b', { roughness: 0.5 });
  const silver = mat('#c7ccd2', { metalness: 0.85, roughness: 0.25 });
  const pcb = mat('#1c2b22', { roughness: 0.6 });
  const m = (geo, material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, material); o.position.set(x, y, z); model.add(o); return o; };

  const D = 0.0265;                 // demi-écart des moteurs
  const R = 0.022;                  // rayon intérieur des conduits
  const ductY = 0.004, ductH = 0.010;
  const props = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = sx * D, z = sz * D;
    // Conduit : paroi ouverte + lèvres haut et bas
    const wall = m(new THREE.CylinderGeometry(R, R, ductH, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#5fb8f5', roughness: 0.35, side: THREE.DoubleSide }), x, ductY + ductH / 2, z);
    wall.castShadow = true;
    for (const y of [ductY, ductY + ductH]) {
      const lip = m(new THREE.TorusGeometry(R, 0.0012, 8, 40), blueDark, x, y, z);
      lip.rotation.x = Math.PI / 2;
    }
    // Support moteur au fond du conduit + 3 rayons
    m(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0015, 20), blue, x, ductY + 0.001, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + (sx * sz > 0 ? 0.5 : -0.5);
      const spoke = m(new THREE.BoxGeometry(R, 0.0014, 0.0025), blue, x + Math.cos(a) * R / 2, ductY + 0.001, z + Math.sin(a) * R / 2);
      spoke.rotation.y = -a;
    }
    // Moteur brushless : stator argent + cloche bleue
    m(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 20), silver, x, ductY + 0.0035, z);
    m(new THREE.CylinderGeometry(0.0047, 0.0047, 0.003, 20), blueDark, x, ductY + 0.0068, z);
    // Hélice 4 pales (translucide) + disque flou à pleine vitesse
    const prop = new THREE.Group();
    prop.position.set(x, ductY + 0.0092, z);
    const blades = [];
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.3, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.0006, 0.0065), bladeMat);
      blade.position.x = 0.0105;
      blade.rotation.x = 0.3;
      pivot.add(blade);
      prop.add(pivot);
      blades.push(pivot);
    }
    prop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 12), silver));
    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.0205, 32), new THREE.MeshBasicMaterial({ color: '#c9d2dc', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    blur.rotation.x = -Math.PI / 2;
    prop.add(blur);
    prop.userData = { blur, blades, dir: sx * sz };
    model.add(prop);
    props.push(prop);
  }

  // Cadre central reliant les conduits
  m(new THREE.BoxGeometry(0.03, 0.002, 0.03), blue, 0, ductY + 0.001, 0);
  for (const r of [Math.PI / 4, -Math.PI / 4]) {
    const brace = m(new THREE.BoxGeometry(0.062, 0.002, 0.006), blue, 0, ductY + 0.001, 0);
    brace.rotation.y = r;
  }
  // Contrôleur de vol (carte) + composants
  m(new THREE.BoxGeometry(0.026, 0.0016, 0.026), pcb, 0, ductY + 0.004, 0);
  m(new THREE.BoxGeometry(0.006, 0.0012, 0.006), black, 0.005, ductY + 0.0054, -0.004);
  m(new THREE.BoxGeometry(0.004, 0.0012, 0.004), silver, -0.006, ductY + 0.0054, 0.006);
  // Canopy blanche
  const canopy = m(new THREE.BoxGeometry(0.018, 0.012, 0.024), white, 0, ductY + 0.011, 0.002);
  canopy.geometry.translate(0, 0, 0);
  m(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 20, 1, false, 0, Math.PI), white, 0, ductY + 0.017, 0.002).rotation.set(0, 0, Math.PI / 2);
  // Caméra FPV à l'avant (-z), inclinée vers le haut
  const cam = new THREE.Group();
  cam.position.set(0, ductY + 0.013, -0.012);
  cam.rotation.x = 0.35;
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.01), black);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.005, 0.006, 20), black);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.007;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 20), new THREE.MeshStandardMaterial({ color: '#1a2a5a', metalness: 0.9, roughness: 0.05 }));
  glass.position.z = -0.0101;
  glass.rotation.y = Math.PI;
  cam.add(camBody, lens, glass);
  model.add(cam);
  // Antenne VTX noire à l'arrière
  const ant = m(new THREE.CylinderGeometry(0.0012, 0.0012, 0.024, 8), black, 0, ductY + 0.027, 0.014);
  ant.rotation.x = 0.45;
  const tip = m(new THREE.CylinderGeometry(0.0022, 0.0022, 0.007, 10), black, 0, ductY + 0.037, 0.0185);
  tip.rotation.x = 0.45;
  // Batterie sous le cadre + LED de statut
  m(new THREE.BoxGeometry(0.012, 0.0035, 0.032), black, 0, ductY - 0.0018, 0);
  m(new THREE.BoxGeometry(0.0122, 0.0036, 0.008), mat('#ffbe0b'), 0, ductY - 0.0018, 0.008);
  const led = m(new THREE.SphereGeometry(0.0015, 8, 8), new THREE.MeshBasicMaterial({ color: '#4cc9f0' }), 0, ductY + 0.006, 0.012);

  // Le drone repose sur sa batterie : on le remonte pour qu'elle touche le sol
  model.position.y = (0.0036 - ductY) * K;
  shadow(root);
  return { group: root, body, props, radius: (D + R + 0.002) * K, led };
}

export function buildRemote() {
  const g = new THREE.Group();
  const shell = mat('#2d3038');
  const grip = mat('#1e2026');
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.1), shell);
  base.position.y = 0.025;
  g.add(base);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 16), grip);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(s * 0.085, 0.025, 0.01);
    const stickBase = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 20), grip);
    stickBase.position.set(s * 0.045, 0.043, 0.015);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 8), mat('#9aa0aa', { metalness: 0.7 }));
    stick.position.set(s * 0.045, 0.055, 0.015);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 16), grip);
    knob.position.set(s * 0.045, 0.068, 0.015);
    g.add(handle, stickBase, stick, knob);
  }
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.03), new THREE.MeshBasicMaterial({ color: '#3a86ff' }));
  screen.position.set(0, 0.041, -0.02);
  const power = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12), mat('#ff5a1f'));
  power.position.set(0, 0.042, 0.03);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 8), grip);
  antenna.position.set(0.06, 0.07, -0.045);
  antenna.rotation.x = -0.4;
  g.add(screen, power, antenna);
  return shadow(g);
}

/**
 * Contrôleur de vol.
 * Clavier : ZQSD / WASD / flèches pour avancer et se décaler (par rapport à la caméra),
 * Espace pour monter, Maj ou C pour descendre, A/E pour tourner le drone, Échap pour quitter.
 * Mobile : joystick à gauche, boutons monter/descendre à droite.
 */
export function createFlight({ drone, camera, controls, bounds, getObstacles }) {
  const keys = new Set();
  const touch = { x: 0, y: 0, up: 0 };
  const vel = new THREE.Vector3();
  let active = false;
  let obstacles = [];
  let spin = 0;          // vitesse des hélices (0..1)
  let yawVel = 0;
  let zoomIn = false;  // rapproche la caméra au décollage

  const hud = document.getElementById('flight-hud');
  const touchUi = document.getElementById('flight-touch');
  const isTouch = matchMedia('(pointer: coarse)').matches;

  const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyQ', 'KeyE'];
  addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Escape') { stop(); return; }
    if (MOVE.includes(e.code)) { keys.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // Joystick tactile
  const pad = document.getElementById('joystick');
  const nub = pad.querySelector('span');
  let padId = null;
  const padMove = (e) => {
    const r = pad.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    touch.x = x; touch.y = y;
    nub.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
  };
  pad.addEventListener('pointerdown', (e) => { padId = e.pointerId; pad.setPointerCapture(padId); padMove(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
  const padEnd = () => { padId = null; touch.x = touch.y = 0; nub.style.transform = ''; };
  pad.addEventListener('pointerup', padEnd);
  pad.addEventListener('pointercancel', padEnd);
  for (const [id, v] of [['btn-up', 1], ['btn-down', -1]]) {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.up = v; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (touch.up === v) touch.up = 0; });
  }
  document.getElementById('flight-exit').addEventListener('click', () => stop());

  function start() {
    active = true;
    obstacles = getObstacles();
    hud.hidden = false;
    touchUi.hidden = !isTouch;
    hud.classList.toggle('touch', isTouch);
    document.body.classList.add('flying');
    // décollage
    vel.set(0, 1.2, 0);
    zoomIn = true;
  }
  function stop() {
    active = false;
    keys.clear();
    touch.x = touch.y = touch.up = 0;
    hud.hidden = true;
    touchUi.hidden = true;
    document.body.classList.remove('flying');
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const box = new THREE.Box3();
  const half = new THREE.Vector3(drone.radius, 0.06, drone.radius);
  const hits = (p) => {
    box.min.set(p.x - half.x, p.y, p.z - half.z);
    box.max.set(p.x + half.x, p.y + 0.12, p.z + half.z);
    return obstacles.some((o) => o.intersectsBox(box));
  };

  function update(dt, t) {
    const g = drone.group;
    const k = (c) => keys.has(c);
    let ix = 0, iz = 0, iy = 0, iyaw = 0;
    if (active) {
      iz = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - touch.y;
      ix = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + touch.x;
      iy = (k('Space') ? 1 : 0) - (k('ShiftLeft') || k('ShiftRight') || k('KeyC') ? 1 : 0) + touch.up;
      iyaw = (k('KeyQ') ? 1 : 0) - (k('KeyE') ? 1 : 0);
    }

    // Directions relatives à la caméra, projetées au sol
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    wish.set(0, 0, 0).addScaledVector(fwd, iz).addScaledVector(right, ix);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(1.2);
    wish.y = iy * 0.9;

    const grounded = g.position.y <= bounds.floor + 0.001;
    if (!active) {
      // sans pilote : atterrissage en douceur
      wish.set(0, grounded ? 0 : -0.6, 0);
    }
    const accel = 1 - Math.exp(-dt * 3);
    vel.x += (wish.x - vel.x) * accel;
    vel.z += (wish.z - vel.z) * accel;
    vel.y += (wish.y - vel.y) * accel;

    // Hélices
    const target = active ? 1 : grounded ? 0 : 0.7;
    spin += (target - spin) * (1 - Math.exp(-dt * 2));
    for (const p of drone.props) {
      p.rotation.y += p.userData.dir * spin * 60 * dt;
      p.userData.blur.material.opacity = Math.max(0, spin - 0.4) * 0.5;
      for (const b of p.userData.blades) b.visible = spin < 0.6;
    }

    // Déplacement axe par axe avec collisions (murs + meubles)
    if (spin > 0.3 || !grounded) {
      for (const axis of ['x', 'z', 'y']) {
        tmp.copy(g.position);
        tmp[axis] += vel[axis] * dt;
        if (axis === 'x') tmp.x = THREE.MathUtils.clamp(tmp.x, bounds.minX + drone.radius, bounds.maxX - drone.radius);
        if (axis === 'z') tmp.z = THREE.MathUtils.clamp(tmp.z, bounds.minZ + drone.radius, bounds.maxZ - drone.radius);
        if (axis === 'y') tmp.y = THREE.MathUtils.clamp(tmp.y, bounds.floor, bounds.ceil);
        if (hits(tmp)) vel[axis] = 0;
        else g.position[axis] = tmp[axis];
      }
    }

    // Cap : en vol, le drone se tourne doucement vers sa direction de déplacement, Q/E pour forcer
    yawVel += (iyaw * 2.5 - yawVel) * accel;
    g.rotation.y += yawVel * dt;
    const hv = Math.hypot(vel.x, vel.z);
    if (active && hv > 0.3 && !iyaw) {
      const want = Math.atan2(-vel.x, -vel.z);
      let d = want - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * (1 - Math.exp(-dt * 2.5));
    }

    // Inclinaison dans le sens du mouvement + léger flottement
    tmp.set(vel.x, 0, vel.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y);
    drone.body.rotation.x += (tmp.z * 0.18 - drone.body.rotation.x) * accel;
    drone.body.rotation.z += (-tmp.x * 0.18 - drone.body.rotation.z) * accel;
    drone.body.position.y = active && !grounded ? Math.sin(t * 3) * 0.008 : 0;

    // La caméra suit le drone
    if (active) {
      tmp.copy(g.position).setY(g.position.y + 0.03).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
      controls.target.add(tmp);
      camera.position.add(tmp);
      if (zoomIn) {
        const dist = camera.position.distanceTo(controls.target);
        const want = innerWidth < innerHeight ? 1.3 : 0.9; // drone de 7,5 cm : caméra proche
        if (dist > want) camera.position.lerp(controls.target, (1 - Math.exp(-dt * 2)) * (1 - want / dist));
        else zoomIn = false;
      }
    }
  }

  return { start, stop, update, get active() { return active; } };
}
