import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Voiture RC tout-terrain (buggy 1/10, ~50 cm), en primitives Three.js.
// Avant de la voiture = -z. Origine au sol, entre les roues.
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

export function buildRcCar({ body = '#7b2cbf', accent = '#00e5ff' } = {}) {
  const root = new THREE.Group();     // position + cap
  const chassis = new THREE.Group();  // tangage / roulis / suspension
  root.add(chassis);

  const shell = mat(body, { roughness: 0.3, metalness: 0.2 });
  const acc = mat(accent, { roughness: 0.3 });
  const dark = mat('#16161c');
  const alu = mat('#9aa3ad', { metalness: 0.8, roughness: 0.3 });

  const R = 0.065;            // rayon des roues
  const track = 0.15;         // demi-voie
  const axle = 0.16;          // demi-empattement
  const rideY = R;            // hauteur des axes

  // Plateau, carrosserie, cockpit, aileron
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.42), alu);
  plate.position.y = rideY - 0.005;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), shell);
  hull.position.set(0, rideY + 0.04, 0.01);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.12), shell);
  nose.position.set(0, rideY + 0.025, -0.17);
  nose.rotation.x = 0.25;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), mat('#0c0f18', { metalness: 0.6, roughness: 0.1 }));
  cabin.position.set(0, rideY + 0.09, 0.0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.062, 0.302), acc);
  stripe.position.set(0, rideY + 0.041, 0.01);
  const wingPost1 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.02), dark);
  wingPost1.position.set(-0.06, rideY + 0.1, 0.17);
  const wingPost2 = wingPost1.clone();
  wingPost2.position.x = 0.06;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.07), acc);
  wing.position.set(0, rideY + 0.14, 0.18);
  wing.rotation.x = -0.15;
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.03), dark);
  bumper.position.set(0, rideY - 0.01, -0.23);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.18, 6), dark);
  antenna.position.set(0.07, rideY + 0.15, 0.09);
  chassis.add(plate, hull, nose, cabin, stripe, wingPost1, wingPost2, wing, bumper, antenna);

  // Phares (avant) et feux (arrière)
  const head = new THREE.MeshBasicMaterial({ color: '#e8f6ff', toneMapped: false });
  const tail = new THREE.MeshBasicMaterial({ color: '#ff2b4a', toneMapped: false });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.006), head);
    h.position.set(s * 0.05, rideY + 0.035, -0.232);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.006), tail);
    t.position.set(s * 0.07, rideY + 0.045, 0.162);
    chassis.add(h, t);
  }

  // Roues : pneus à crampons + jantes. Les roues avant pivotent (steer).
  const wheels = [];
  const steerers = [];
  const tire = mat('#111114', { roughness: 0.9 });
  const rim = mat(accent, { metalness: 0.5, roughness: 0.3 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * track, R, sz * axle);
    const wheel = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.06, 20), tire);
    t.rotation.z = Math.PI / 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.062, 10), rim);
    r.rotation.z = Math.PI / 2;
    wheel.add(t, r);
    for (let i = 0; i < 10; i++) {
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.01, 0.012), tire);
      const a = (i / 10) * Math.PI * 2;
      lug.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
      lug.rotation.x = a;
      wheel.add(lug);
    }
    pivot.add(wheel);
    chassis.add(pivot);
    wheels.push(wheel);
    if (sz < 0) steerers.push(pivot);
    // bras de suspension
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.02), dark);
    arm.position.set(sx * (track - 0.05), R, sz * axle);
    chassis.add(arm);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: root, chassis, wheels, steerers, wheelRadius: R };
}

// Ferrari 458 Italia de l'exemple three.js « car materials » (modèle de vicent091036),
// réduite à l'échelle 1/10 d'une voiture RC (~45 cm), avec les matériaux de l'exemple.
// Même interface que buildRcCar ; en cas d'échec de chargement, on garde le buggy.
let envCache = null, gltfPromise = null, aoTex = null;
export async function loadRcCar(renderer, { body = '#ff0000', details = '#ffffff', glass = '#ffffff', scale = 0.1 } = {}) {
  try {
    if (!envCache) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envCache = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    // Le modèle n'est chargé qu'une fois ; chaque voiture en est une copie avec ses propres matériaux.
    if (!gltfPromise) {
      const draco = new DRACOLoader().setDecoderPath('lib/addons/libs/draco/gltf/');
      gltfPromise = new GLTFLoader().setDRACOLoader(draco).loadAsync('models/ferrari/ferrari.glb');
      aoTex = new THREE.TextureLoader().load('models/ferrari/ferrari_ao.png');
    }
    const gltf = await gltfPromise;
    const model = gltf.scene.children[0].clone(true);

    const bodyMat = new THREE.MeshPhysicalMaterial({ color: body, metalness: 1.0, roughness: 0.5, clearcoat: 1.0, clearcoatRoughness: 0.03, envMap: envCache, envMapIntensity: 0.6 });
    const detailsMat = new THREE.MeshStandardMaterial({ color: details, metalness: 1.0, roughness: 0.5, envMap: envCache, envMapIntensity: 0.6 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: glass, metalness: 0.25, roughness: 0, transmission: 1.0, envMap: envCache });
    model.getObjectByName('body').material = bodyMat;
    for (const n of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) model.getObjectByName(n).material = detailsMat;
    model.getObjectByName('glass').material = glassMat;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material.isMeshStandardMaterial && !o.material.envMap) o.material.envMap = envCache;
    });

    // Ombre de contact de l'exemple
    const ao = new THREE.Mesh(
      new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4),
      new THREE.MeshBasicMaterial({ map: aoTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true })
    );
    ao.rotation.x = -Math.PI / 2;
    ao.position.y = 0.01;
    ao.renderOrder = 2;
    model.add(ao);

    const root = new THREE.Group();
    const chassis = new THREE.Group();
    root.add(chassis);
    model.scale.setScalar(scale);
    chassis.add(model);

    // Roues : les avant sont placées dans un pivot pour braquer
    const wheels = [], steerers = [];
    for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      const w = model.getObjectByName(name);
      wheels.push(w);
      if (name.startsWith('wheel_f')) {
        const pivot = new THREE.Group();
        pivot.position.copy(w.position);
        w.parent.add(pivot);
        w.position.set(0, 0, 0);
        pivot.add(w);
        steerers.push(pivot);
      }
    }
    return { group: root, chassis, wheels, steerers, wheelRadius: 0.358 * scale };
  } catch (err) {
    console.warn('Ferrari indisponible, buggy de secours :', err);
    return buildRcCar();
  }
}
