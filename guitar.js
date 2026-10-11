import * as THREE from 'three';

// Guitare folk sur son support, construite en primitives (taille réelle, en mètres).
// Repère local : y vers le haut, table d'harmonie face à +z, origine au sol.
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

// Contour de la caisse : deux lobes (bas et haut) reliés par une taille.
function bodyShape() {
  const lower = { y: 0.19, r: 0.19 };
  const upper = { y: 0.45, r: 0.145 };
  const L = upper.y + upper.r;
  const half = (y) => {
    const c = (b) => (Math.abs(y - b.y) < b.r ? Math.sqrt(b.r * b.r - (y - b.y) ** 2) : 0);
    const waist = y > lower.y && y < upper.y ? 0.115 : 0;
    return Math.max(c(lower), c(upper), waist);
  };
  const N = 80;
  const right = [];
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * L;
    right.push(new THREE.Vector2(half(y), y));
  }
  // Lissage léger pour adoucir la taille
  const smooth = right.map((p, i) => {
    const a = right[Math.max(0, i - 3)], b = right[Math.min(N, i + 3)];
    return new THREE.Vector2(Math.max(p.x, (a.x + b.x) / 2), p.y);
  });
  const pts = [...smooth, ...smooth.slice(1, -1).reverse().map((p) => new THREE.Vector2(-p.x, p.y))];
  return { shape: new THREE.Shape(pts), length: L };
}

export function buildGuitar() {
  const g = new THREE.Group();
  const guitar = new THREE.Group();

  const top = mat('#d9973f');
  const side = mat('#6b3a1e');
  const dark = mat('#2a1a12');
  const metal = mat('#d8d8d8', { metalness: 0.9, roughness: 0.25 });

  // Caisse
  const { shape, length } = bodyShape();
  const D = 0.1;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 12 }),
    [top, side]
  );
  body.position.z = -D / 2;
  guitar.add(body);
  const front = D / 2 + 0.0065;

  // Rosace, trou, chevalet, plaque de protection
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.047, 0.056, 40), mat('#3b2414'));
  ring.position.set(0, 0.37, front + 0.0005);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.045, 40), new THREE.MeshBasicMaterial({ color: '#120a05' }));
  hole.position.set(0, 0.37, front + 0.0005);
  const guard = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24, Math.PI * 1.1, Math.PI * 0.9), mat('#1c1410'));
  guard.position.set(0.035, 0.33, front + 0.0004);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.01), dark);
  bridge.position.set(0, 0.13, front + 0.005);
  guitar.add(ring, hole, guard, bridge);

  // Manche, touche, frettes, tête et mécaniques
  const neckLen = 0.46;
  const neckY = length - 0.02 + neckLen / 2;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.048, neckLen, 0.03), side);
  neck.position.set(0, neckY, D / 2 - 0.015);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, neckLen + 0.08, 0.006), dark);
  board.position.set(0, neckY - 0.04, front - 0.002);
  guitar.add(neck, board);
  for (let i = 1; i <= 14; i++) {
    const y = length - 0.02 + neckLen - i * (neckLen / 15);
    const fret = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.002), metal);
    fret.position.set(0, y, front + 0.002);
    guitar.add(fret);
  }
  const headY = length - 0.02 + neckLen + 0.085;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.018), dark);
  head.position.set(0, headY, D / 2 - 0.012);
  head.rotation.x = -0.25;
  guitar.add(head);
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), metal);
      peg.rotation.z = Math.PI / 2;
      peg.position.set(s * 0.05, headY - 0.05 + i * 0.045, D / 2 - 0.012 - (i * 0.045 - 0.05) * Math.sin(0.25));
      guitar.add(peg);
    }
  }

  // Cordes
  const strMat = new THREE.LineBasicMaterial({ color: '#f2f2f2' });
  for (let i = 0; i < 6; i++) {
    const x = -0.02 + i * 0.008;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x * 1.4, 0.13, front + 0.011),
      new THREE.Vector3(x, length - 0.02 + neckLen, front + 0.003),
    ]);
    guitar.add(new THREE.Line(geo, strMat));
  }

  guitar.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // La guitare repose sur le support, légèrement inclinée vers l'arrière
  guitar.position.set(0, 0.11, 0.06);
  guitar.rotation.x = -0.2;
  g.add(guitar);

  // Support en A (noir)
  const standMat = mat('#1b1b1f', { metalness: 0.4, roughness: 0.4 });
  const tube = (a, b, r = 0.008) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 10), standMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    g.add(m);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  tube(V(-0.16, 0.005, 0.2), V(-0.12, 0.11, 0.1));
  tube(V(0.16, 0.005, 0.2), V(0.12, 0.11, 0.1));
  tube(V(-0.12, 0.11, 0.1), V(0.12, 0.11, 0.1));       // berceau
  tube(V(0, 0.005, -0.25), V(0, 0.75, -0.06));           // montant arrière
  tube(V(-0.16, 0.005, 0.2), V(0, 0.005, -0.25));
  tube(V(0.16, 0.005, 0.2), V(0, 0.005, -0.25));
  tube(V(-0.03, 0.75, -0.06), V(0.03, 0.75, -0.06), 0.01); // fourche du manche

  return g;
}
