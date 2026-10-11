import * as THREE from 'three';

// Homelab : 2 Raspberry Pi 5 + switch 5 ports + CPL branché au mur.
// Tout est construit en primitives Three.js, en mètres, à l'échelle réelle,
// puis agrandi par K pour rester lisible dans la pièce.
const K = 1.6;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const M = {
  pcb: mat('#1d7a3c', { roughness: 0.5 }),
  silver: mat('#c9ced3', { metalness: 0.8, roughness: 0.3 }),
  dark: mat('#23272e', { roughness: 0.5 }),
  black: mat('#111316', { roughness: 0.7 }),
  gold: mat('#d4a640', { metalness: 0.8, roughness: 0.3 }),
  switch: mat('#2c3138', { metalness: 0.4, roughness: 0.45 }),
  white: mat('#f4f4f2', { roughness: 0.4 }),
  wood: mat('#c69c72', { roughness: 0.8 }),
  bracket: mat('#3a3a40', { metalness: 0.5 }),
};
const CABLE = { pi1: '#3a86ff', pi2: '#ffbe0b', cpl: '#e5e5e5' };

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function cyl(r, h, m, x = 0, y = 0, z = 0, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
function led(color, x, y, z, r = 0.0012) {
  const m = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), m);
  mesh.position.set(x, y, z);
  mesh.userData.baseColor = new THREE.Color(color);
  return mesh;
}

// Raspberry Pi 5 avec son ventilateur actif. Ports Ethernet/USB sur le petit côté +x.
function raspberryPi5() {
  const g = new THREE.Group();
  const lift = 0.004; // entretoises
  const pcbY = lift + 0.0008;
  for (const [x, z] of [[-0.039, -0.025], [0.019, -0.025], [-0.039, 0.025], [0.019, 0.025]]) g.add(cyl(0.002, lift, M.silver, x, lift / 2, z, 8));
  g.add(box(0.085, 0.0016, 0.056, M.pcb, 0, pcbY, 0));
  const top = pcbY + 0.0008;
  // Ventilateur actif (radiateur + hélice)
  g.add(box(0.034, 0.006, 0.034, M.silver, -0.012, top + 0.003, 0.002));
  g.add(box(0.036, 0.008, 0.036, M.dark, -0.012, top + 0.010, 0.002));
  g.add(cyl(0.014, 0.0012, M.black, -0.012, top + 0.0145, 0.002));
  g.add(cyl(0.004, 0.0016, M.dark, -0.012, top + 0.0150, 0.002, 12));
  // Connecteur GPIO 40 broches le long du bord arrière
  g.add(box(0.051, 0.0085, 0.005, M.black, -0.008, top + 0.00425, -0.0245));
  // Ethernet + 2 piles USB sur le bord +x
  g.add(box(0.021, 0.0135, 0.016, M.silver, 0.034, top + 0.00675, 0.018));
  g.add(box(0.017, 0.0155, 0.0135, M.silver, 0.036, top + 0.00775, 0.000));
  g.add(box(0.017, 0.0155, 0.0135, M.silver, 0.036, top + 0.00775, -0.017));
  // USB-C + 2 micro-HDMI sur le bord avant
  g.add(box(0.009, 0.0032, 0.007, M.silver, -0.031, top + 0.0016, 0.026));
  g.add(box(0.0065, 0.003, 0.007, M.silver, -0.016, top + 0.0015, 0.026));
  g.add(box(0.0065, 0.003, 0.007, M.silver, -0.003, top + 0.0015, 0.026));
  // Puces RP1 + RAM
  g.add(box(0.012, 0.0012, 0.012, M.black, 0.012, top + 0.0006, 0.010));
  g.add(box(0.012, 0.0012, 0.009, M.black, 0.012, top + 0.0006, -0.010));
  // LEDs d'alimentation et d'activité
  const pwr = led('#ff3b30', -0.040, top + 0.001, 0.020);
  const act = led('#34c759', -0.040, top + 0.001, 0.016);
  g.add(pwr, act);
  g.userData.act = act;
  g.userData.ethPort = new THREE.Vector3(0.0445, top + 0.0068, 0.018); // sortie du port Ethernet
  return g;
}

// Switch 5 ports Gigabit, ports en façade (+z).
function switch5() {
  const g = new THREE.Group();
  const W = 0.1, H = 0.026, D = 0.07;
  g.add(box(W, H, D, M.switch, 0, H / 2, 0));
  g.add(box(W - 0.004, 0.0015, D - 0.004, M.dark, 0, H + 0.0007, 0));
  const ports = [];
  const leds = [];
  for (let i = 0; i < 5; i++) {
    const x = -0.034 + i * 0.017;
    g.add(box(0.0135, 0.0105, 0.004, M.black, x, 0.0095, D / 2 - 0.0015));
    g.add(box(0.008, 0.002, 0.0042, M.gold, x, 0.0125, D / 2 - 0.0015));
    const l = led('#30d158', x, 0.0205, D / 2 + 0.0004);
    g.add(l);
    leds.push(l);
    ports.push(new THREE.Vector3(x, 0.0095, D / 2 + 0.001));
  }
  g.add(led('#30d158', 0.044, 0.0205, D / 2 + 0.0004)); // power
  g.userData.ports = ports;
  g.userData.leds = leds;
  return g;
}

// Prise murale + adaptateur CPL. Port RJ45 en dessous.
function cplOnOutlet() {
  const g = new THREE.Group();
  g.add(box(0.082, 0.082, 0.008, M.white, 0, 0, 0.004));
  const body = box(0.062, 0.11, 0.042, M.white, 0, -0.008, 0.008 + 0.021);
  g.add(body);
  g.add(box(0.058, 0.004, 0.038, mat('#dcdcd8'), 0, 0.045, 0.029)); // filet de séparation
  const leds = [];
  ['#30d158', '#30d158', '#30d158'].forEach((c, i) => {
    const l = led(c, -0.015 + i * 0.015, 0.032, 0.0505, 0.0016);
    g.add(l);
    leds.push(l);
  });
  g.add(box(0.016, 0.004, 0.014, M.black, 0, -0.064, 0.026)); // RJ45 dessous
  g.userData.leds = leds;
  g.userData.port = new THREE.Vector3(0, -0.066, 0.026);
  return g;
}

function cable(points, color) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.0025, 8, false), mat(color, { roughness: 0.5 }));
  mesh.castShadow = true;
  return mesh;
}

/**
 * Construit le homelab sur une étagère murale.
 * @param wallZ  position z de la face du mur du fond
 * @param x      centre de l'étagère
 * @param shelfY hauteur du dessus de l'étagère
 * @param outletY hauteur de la prise murale du CPL
 * @param shelfColor couleur de l'étagère (optionnelle)
 */
export function buildHomelab({ wallZ, x, shelfY, outletY, shelfColor }) {
  const root = new THREE.Group();

  // Étagère murale + équerres (taille réelle)
  const SD = 0.2;
  root.add(box(0.62, 0.025, SD, shelfColor ? mat(shelfColor, { roughness: 0.8 }) : M.wood, x, shelfY - 0.0125, wallZ + SD / 2));
  for (const dx of [-0.24, 0.24]) {
    root.add(box(0.02, 0.12, 0.012, M.bracket, x + dx, shelfY - 0.085, wallZ + 0.006));
    root.add(box(0.02, 0.012, 0.15, M.bracket, x + dx, shelfY - 0.031, wallZ + 0.075));
  }

  // Les appareils, agrandis par K. Origine : dessus de l'étagère, contre le mur.
  const dev = new THREE.Group();
  dev.position.set(x, shelfY, wallZ);
  dev.scale.setScalar(K);
  root.add(dev);
  const shelfFront = SD / K;

  const sw = switch5();
  sw.position.set(0, 0, 0.055);
  const pi1 = raspberryPi5();
  pi1.position.set(-0.115, 0, 0.055);
  const pi2 = raspberryPi5();
  pi2.position.set(0.115, 0, 0.055);
  pi2.rotation.y = Math.PI; // ports Ethernet tournés vers le switch
  dev.add(sw, pi1, pi2);

  const cpl = cplOnOutlet();
  cpl.position.set(0.09, (outletY - shelfY) / K, 0);
  dev.add(cpl);

  // Câbles Ethernet (coordonnées dans le repère des appareils)
  dev.updateMatrixWorld(true);
  const local = (obj, v) => dev.worldToLocal(obj.localToWorld(v.clone()));
  const port = (i) => local(sw, sw.userData.ports[i]);
  const e1 = local(pi1, pi1.userData.ethPort);
  const e2 = local(pi2, pi2.userData.ethPort);
  const p0 = port(0), p2 = port(2), p4 = port(4);
  const y = 0.0095;
  dev.add(cable([e1, e1.clone().add(new THREE.Vector3(0.012, 0, 0.004)), new THREE.Vector3(p0.x - 0.004, y, p0.z + 0.03), new THREE.Vector3(p0.x, y, p0.z + 0.012), p0], CABLE.pi1));
  dev.add(cable([e2, e2.clone().add(new THREE.Vector3(-0.012, 0, 0.004)), new THREE.Vector3(p2.x + 0.006, y, p2.z + 0.034), new THREE.Vector3(p2.x, y, p2.z + 0.012), p2], CABLE.pi2));
  const c = local(cpl, cpl.userData.port);
  const edge = shelfFront + 0.006;
  dev.add(cable([
    p4,
    new THREE.Vector3(p4.x, y, p4.z + 0.012),
    new THREE.Vector3(p4.x + 0.004, 0.006, edge - 0.004),
    new THREE.Vector3(p4.x + 0.008, -0.012, edge + 0.002),
    new THREE.Vector3(c.x + 0.05, -0.04, edge - 0.01),
    new THREE.Vector3(c.x + 0.055, c.y - 0.01, c.z + 0.012),
    new THREE.Vector3(c.x + 0.02, c.y - 0.03, c.z + 0.006),
    new THREE.Vector3(c.x, c.y - 0.018, c.z),
    c,
  ], CABLE.cpl));

  const blinkers = [pi1.userData.act, pi2.userData.act, ...sw.userData.leds.filter((_, i) => i === 0 || i === 2 || i === 4), ...cpl.userData.leds.slice(1)];
  const seeds = blinkers.map(() => Math.random() * 10);
  function update(t) {
    blinkers.forEach((l, i) => {
      const on = Math.sin(t * (6 + i * 1.7) + seeds[i]) + Math.sin(t * 13.3 + seeds[i] * 2) > -0.4;
      l.material.color.copy(l.userData.baseColor).multiplyScalar(on ? 1 : 0.15);
    });
  }

  // Point de vue pour le zoom au clic
  // décalé vers la droite pour que le panneau d'infos ne cache pas le homelab
  const focus = new THREE.Vector3(x + 0.25, (shelfY + outletY) / 2, wallZ + 0.1);
  return { group: root, update, focus };
}
