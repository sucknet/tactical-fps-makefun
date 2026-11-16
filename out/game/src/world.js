// Geometry + collision for DOCKSIDE, an original two-lane map: attackers (player, site A) push
// from a freight yard through Yard and Warehouse lanes toward the pump plaza bombsite held by
// The copperline crew (bots). Every solid registers an axis-aligned collider box.
import * as THREE from 'three';
import { PALETTE, makeMaterials } from './palette.js';

// Half-extents of the map on the ground plane. Origin at map centre.
export const MAP_HALF = 46;

export function createWorld(scene) {
  const colliders = []; // {min:Vector3,max:Vector3} axis-aligned boxes
  const mats = makeMaterials();
  const shootables = []; // meshes bullets can hit

  const box = new THREE.Box3();
  const geoCache = new Map();
  function unitGeo() {
    if (!geoCache.has('unit')) geoCache.set('unit', new THREE.BoxGeometry(1, 1, 1));
    return geoCache.get('unit');
  }

  // Add a solid box: visual mesh + collider + shootable registration.
  function solid(x, y, z, sx, sy, sz, material, opts = {}) {
    const mesh = new THREE.Mesh(unitGeo(), material);
    mesh.position.set(x, y + sy / 2, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (opts.solid !== false) {
      box.min.set(x - sx / 2, y, z - sz / 2);
      box.max.set(x + sx / 2, y + sy, z + sz / 2);
      colliders.push(box.clone());
    }
    if (opts.shootable !== false) shootables.push(mesh);
    return mesh;
  }

  // Thin accent stripe, no collider.
  function stripe(x, z, sx, sz, y = 0.012) {
    const m = new THREE.Mesh(unitGeo(), mats.accent);
    m.position.set(x, y, z);
    m.scale.set(sx, 0.02, sz);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  function groundStripe(x, z, sx, sz, color, opacity = 0.55) {
    const m = new THREE.Mesh(
      unitGeo(),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    m.position.set(x, 0.014, z);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(sx, sz, 1);
    scene.add(m);
    return m;
  }

  // ---- Ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.BoxGeometry(MAP_HALF * 2, 0.5, MAP_HALF * 2), mats.ground);
  ground.position.y = -0.25;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  // Perimeter walls (visual + solid).
  const H = MAP_HALF;
  const wallH = 7;
  solid(0, 0, -H, H * 2, wallH, 1.2, mats.concreteDark);
  solid(0, 0, H, H * 2, wallH, 1.2, mats.concreteDark);
  solid(-H, 0, 0, 1.2, wallH, H * 2, mats.concreteDark);
  solid(H, 0, 0, 1.2, wallH, H * 2, mats.concreteDark);

  // ---- Attack spawn (freight yard, south) ------------------------------------
  solid(-14, 0, 38, 12, 3, 1, mats.metal);        // spawn office wall
  solid(14, 0, 38, 12, 3, 1, mats.metal);
  stripe(0, 36, 8, 1.2);

  // ---- Central warehouse (mid lane) ------------------------------------------
  // Big hall with two doorways north/south and windows to the west lane.
  solid(-9, 0, 6, 1.0, 5.5, 26, mats.concrete);      // west wall of hall
  solid(9, 0, 6, 1.0, 5.5, 26, mats.concrete);       // east wall of hall
  solid(0, 0, -7.5, 19, 5.5, 1.0, mats.concrete);    // north wall of hall
  // south wall with a wide door gap in the middle:
  solid(-11.5, 0, 19.5, 6, 5.5, 1.0, mats.concrete);
  solid(11.5, 0, 19.5, 6, 5.5, 1.0, mats.concrete);
  solid(0, 4.4, 19.5, 8, 2.2, 1.0, mats.concrete);   // lintel above the door gap
  // interior pillars
  solid(-4.5, 0, 2, 1.2, 5.5, 1.2, mats.concreteDark);
  solid(4.5, 0, 2, 1.2, 5.5, 1.2, mats.concreteDark);
  solid(-4.5, 0, 10, 1.2, 5.5, 1.2, mats.concreteDark);
  solid(4.5, 0, 10, 1.2, 5.5, 1.2, mats.concreteDark);
  // catwalk over the hall's west side with stairs up from the south door
  solid(-7.6, 3.2, 6, 2.2, 0.25, 22, mats.metal);    // catwalk slab
  solid(-8.7, 0, 17.2, 2.4, 3.2, 0.4, mats.metal);   // railing stub (visual cover)
  // stairs to catwalk: stepped boxes along the south wall inside the hall
  for (let i = 0; i < 8; i += 1) {
    solid(-7.6 + (7 - i) * 0, 0, 16.4 - i * 1.05, 2.2, 0.4 * (i + 1), 1.05, mats.metal, { shadow: false });
  }
  // crates inside the hall for mid fights
  crate(-2.5, 6.5, 1.4);
  crate(3.2, 12.5, 1.2);
  crate(5.4, 4.5, 1.0, true);

  // ---- West lane (yard side) --------------------------------------------------
  // Long sightline with container cover.
  solid(-20, 0, 14, 1.0, 5, 20, mats.concrete);      // yard office block
  solid(-24.5, 0, 22, 4, 2.6, 2.6, mats.rust);       // container stack A
  solid(-24.5, 2.6, 22, 4, 2.6, 2.6, mats.rust);
  solid(-18, 0, 0, 4, 2.6, 4, mats.rust);            // container B
  solid(-27, 0, -2, 4, 2.6, 8, mats.metal);          // container C
  solid(-22, 0, -14, 5, 2.6, 3, mats.rust);          // container D
  crate(-16, -6, 1.2);
  crate(-19, 24, 1.3);

  // ---- East lane ( loading dock ) ---------------------------------------------
  solid(20, 0, 12, 1.0, 5, 22, mats.concrete);       // dock building
  solid(24, 0, 18, 4, 2.6, 2.6, mats.rust);          // container E
  solid(25.5, 0, 2, 2.6, 2.6, 7, mats.rust);         // container F
  solid(18, 0, -6, 3, 2.6, 3, mats.metal);           // generator
  solid(26, 0, -12, 4, 2.6, 3, mats.rust);           // container G
  crate(15, 16, 1.2);
  crate(21, -2, 1.0, true);

  // ---- North pump plaza (bombsite) -------------------------------------------
  // Raised pad with pumps, held by the bots. Two entrances from the lanes.
  const pad = solid(0, 0, -30, 22, 0.4, 18, mats.concreteDark);
  stripe(0, -30, 10, 1.2, 0.43);
  // pump machinery
  solid(-6, 0.4, -32, 2.2, 2.0, 2.2, mats.metal);
  solid(6, 0.4, -32, 2.2, 2.0, 2.2, mats.metal);
  solid(0, 0.4, -35, 3, 2.6, 1.6, mats.rust);
  solid(-9, 0.4, -26, 1.6, 1.4, 1.6, mats.metal);
  solid(9, 0.4, -26, 1.6, 1.4, 1.6, mats.metal);
  // plaza low walls giving partial cover
  solid(-11, 0, -30, 1, 1.1, 18, mats.concrete);
  solid(11, 0, -30, 1, 1.1, 18, mats.concrete);
  // plaza south entrance walls (gap in the middle = chute from mid)
  solid(-4.5, 0, -20.5, 4, 3.4, 1, mats.concrete);
  solid(4.5, 0, -20.5, 4, 3.4, 1, mats.concrete);
  // west/east entrances into the plaza
  solid(-16, 0, -20, 6, 3.4, 1, mats.concrete);
  solid(16, 0, -20, 6, 3.4, 1, mats.concrete);

  // ---- Connector walls shaping lanes ------------------------------------------
  solid(-14.5, 0, 30, 1, 3.6, 12, mats.concrete);    // yard/hall divider south
  solid(14.5, 0, 30, 1, 3.6, 12, mats.concrete);
  solid(-14.5, 0, -14, 1, 3.6, 8, mats.concrete);    // yard/hall divider north
  solid(14.5, 0, -14, 1, 3.6, 8, mats.concrete);

  // ---- Skyline dressing (non-colliding, above walls) --------------------------
  for (let i = 0; i < 9; i += 1) {
    const x = -38 + i * 9.5;
    const h = 9 + ((i * 7) % 13);
    const w = 6 + ((i * 5) % 7);
    solid(x, wallH, -H - 3 + ((i % 3) * 2), w, h, 6, mats.concreteDark, { solid: false });
  }
  // cranes
  solid(-30, wallH, 10, 1.2, 16, 1.2, mats.accent, { solid: false });
  solid(-30, wallH + 16, 6, 1.2, 1.2, 12, mats.accent, { solid: false });
  solid(28, wallH, -26, 1.2, 14, 1.2, mats.accent, { solid: false });
  solid(28, wallH + 14, -32, 1.2, 1.2, 10, mats.accent, { solid: false });

  function crate(x, z, size, stacked = false) {
    solid(x, 0, z, size * 1.4, size, size * 1.4, mats.crate);
    if (stacked) solid(x + 0.2, size, z - 0.1, size, size * 0.7, size, mats.crate);
  }

  // ---- Bombsite marker ---------------------------------------------------------
  const siteA = new THREE.Vector3(0, 0.4, -30);

  // ---- Lamp posts with warm point lights ---------------------------------------
  const lamps = [];
  function lamp(x, z) {
    const post = new THREE.Mesh(unitGeo(), mats.metal);
    post.position.set(x, 2.6, z);
    post.scale.set(0.22, 5.2, 0.22);
    post.castShadow = true;
    scene.add(post);
    const head = new THREE.Mesh(unitGeo(), mats.accent);
    head.position.set(x, 5.3, z);
    head.scale.set(0.7, 0.24, 0.7);
    scene.add(head);
    const light = new THREE.PointLight(PALETTE.lampWarm, 42, 22, 1.8);
    light.position.set(x, 5.0, z);
    scene.add(light);
    lamps.push(light);
  }
  lamp(-19, 8);
  lamp(19, 6);
  lamp(-8, -24);
  lamp(12, -26);
  lamp(0, 22);

  return {
    colliders,
    shootables,
    siteA,
    padMesh: pad,
    lamps,
    mats,
  };
}
