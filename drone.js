import * as THREE from 'three';

// Drone quadricoptère + radiocommande, en primitives Three.js (mètres),
// et le contrôleur de vol (clavier + commandes tactiles).
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });
const shadow = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

export function buildDrone() {
  const root = new THREE.Group();   // position / cap (yaw)
  const body = new THREE.Group();   // inclinaison en vol
  root.add(body);

  const shell = mat('#e8e8ec');
  const dark = mat('#26282e');
  const accent = mat('#ff5a1f');

  const core = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.16), shell);
  core.position.y = 0.06;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.11), dark);
  lid.position.y = 0.09;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.008, 0.04), accent);
  stripe.position.set(0, 0.07, -0.03);
  // Caméra à l'avant (-z = avant du drone)
  const gimbal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.03), dark);
  gimbal.position.set(0, 0.04, -0.09);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), mat('#0b0d12', { metalness: 0.8, roughness: 0.1 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.04, -0.106);
  body.add(core, lid, stripe, gimbal, lens);

  const props = [];
  const ledFront = new THREE.MeshBasicMaterial({ color: '#30d158' });
  const ledBack = new THREE.MeshBasicMaterial({ color: '#ff3b30' });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const end = new THREE.Vector3(sx * 0.15, 0.065, sz * 0.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, end.length() * 0.95), dark);
    arm.position.set(end.x / 2, 0.065, end.z / 2);
    arm.rotation.y = Math.atan2(end.x, end.z);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 16), dark);
    motor.position.set(end.x, 0.075, end.z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.06, 8), dark);
    leg.position.set(end.x, 0.03, end.z);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), sz < 0 ? ledFront : ledBack);
    led.position.set(end.x, 0.06, end.z);
    // Hélice : 2 pales + disque flou visible quand elle tourne vite
    const prop = new THREE.Group();
    prop.position.set(end.x, 0.093, end.z);
    for (const a of [0, Math.PI]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.003, 0.014), mat('#3a3d45'));
      blade.position.x = Math.cos(a) * 0.055;
      blade.rotation.x = 0.15;
      prop.add(blade);
    }
    const blur = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), new THREE.MeshBasicMaterial({ color: '#9aa0aa', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    blur.rotation.x = -Math.PI / 2;
    prop.add(blur);
    prop.userData.blur = blur;
    prop.userData.dir = sx * sz;
    props.push(prop);
    body.add(arm, motor, leg, led, prop);
  }
  shadow(root);
  return { group: root, body, props, radius: 0.22 };
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
    wish.multiplyScalar(1.6);
    wish.y = iy * 1.1;

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
      p.children[0].visible = p.children[1].visible = spin < 0.6;
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
      tmp.copy(g.position).setY(g.position.y + 0.1).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 3));
      controls.target.add(tmp);
      camera.position.add(tmp);
      if (zoomIn) {
        const dist = camera.position.distanceTo(controls.target);
        const want = innerWidth < innerHeight ? 4.5 : 3.2;
        if (dist > want) camera.position.lerp(controls.target, (1 - Math.exp(-dt * 2)) * (1 - want / dist));
        else zoomIn = false;
      }
    }
  }

  return { start, stop, update, get active() { return active; } };
}
