// Grenades: physics balls with fuse timers. Frag explodes (radial damage + camera shake),
// flash blinds the player and bots in LOS, smoke spawns billboard smoke puffs that block bot
// vision. Everything is code-generated: no textures.
import * as THREE from 'three';
import { GRENADES, GRAVITY } from './config.js';
import { PALETTE } from './palette.js';

const sphereGeo = new THREE.SphereGeometry(0.09, 10, 8);

export function createGrenades(scene, world) {
  const live = [];
  const smokes = [];
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);

  function throwGrenade(type, origin, dir, power, now) {
    const def = GRENADES[type];
    const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, metalness: 0.3 }));
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({
      type, def, mesh,
      velocity: dir.clone().multiplyScalar(power).add(new THREE.Vector3(0, 2.2, 0)),
      fuse: def.fuse,
      resting: false,
    });
  }

  function step(dt, hooks) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      if (!g.resting) {
        g.velocity.y -= GRAVITY * dt;
        const nx = g.mesh.position.x + g.velocity.x * dt;
        const ny = g.mesh.position.y + g.velocity.y * dt;
        const nz = g.mesh.position.z + g.velocity.z * dt;
        // Axis-separated bounce against colliders.
        if (hitsWorld(nx, g.mesh.position.y, g.mesh.position.z)) { g.velocity.x *= -0.45; g.velocity.z *= -0.45; hooks.onBounce && hooks.onBounce(g); }
        else g.mesh.position.x = nx;
        if (hitsWorld(g.mesh.position.x, ny, g.mesh.position.z)) {
          if (g.velocity.y < -2) hooks.onBounce && hooks.onBounce(g);
          g.velocity.y = Math.abs(g.velocity.y) * 0.4;
          if (Math.abs(g.velocity.y) < 1) { g.resting = true; g.velocity.set(0, 0, 0); }
        } else g.mesh.position.y = ny;
        if (hitsWorld(g.mesh.position.x, g.mesh.position.y, nz)) { g.velocity.x *= -0.45; g.velocity.z *= -0.45; hooks.onBounce && hooks.onBounce(g); }
        else g.mesh.position.z = nz;
        if (g.mesh.position.y < 0.09) {
          g.mesh.position.y = 0.09;
          if (g.velocity.y < -2) hooks.onBounce && hooks.onBounce(g);
          g.velocity.y = Math.abs(g.velocity.y) * 0.4;
          g.velocity.x *= 0.75;
          g.velocity.z *= 0.75;
          if (Math.abs(g.velocity.y) < 1) { g.resting = true; g.velocity.set(0, 0, 0); }
        }
      }
      if (g.fuse <= 0) {
        detonate(g, hooks);
        scene.remove(g.mesh);
        live.splice(i, 1);
      }
    }

    // smoke growth + expiry
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.age += dt;
      const grow = Math.min(1, s.age / 1.6);
      for (const puff of s.puffs) {
        puff.scale.setScalar(puff.userData.target * grow);
        puff.position.y = puff.userData.baseY + Math.sin(s.age * 0.8 + puff.userData.seed) * 0.2;
      }
      if (s.age > s.duration) {
        for (const puff of s.puffs) scene.remove(puff);
        smokes.splice(i, 1);
      }
    }
  }

  function detonate(g, hooks) {
    if (g.type === 'frag') hooks.onFrag(g.mesh.position, g.def);
    else if (g.type === 'flash') hooks.onFlash(g.mesh.position, g.def);
    else if (g.type === 'smoke') spawnSmoke(g.mesh.position, g.def);
  }

  function spawnSmoke(pos, def) {
    const puffs = [];
    const mat = new THREE.MeshStandardMaterial({
      color: 0xaeb6ba, roughness: 1, transparent: true, opacity: 0.86, depthWrite: false,
    });
    for (let i = 0; i < 7; i += 1) {
      const puff = new THREE.Mesh(smokeGeo, mat);
      const a = (i / 7) * Math.PI * 2;
      puff.position.set(pos.x + Math.cos(a) * 1.6, 1.1 + (i % 3) * 0.75, pos.z + Math.sin(a) * 1.6);
      puff.userData = { target: 2.2 + (i % 2) * 0.9, baseY: puff.position.y, seed: i * 1.7 };
      puff.scale.setScalar(0.01);
      scene.add(puff);
      puffs.push(puff);
    }
    smokes.push({ puffs, age: 0, duration: def.duration, pos: pos.clone() });
  }

  function hitsWorld(x, y, z) {
    for (const c of world.colliders) {
      if (x > c.min.x && x < c.max.x && y > c.min.y && y < c.max.y && z > c.min.z && z < c.max.z) return true;
    }
    return false;
  }

  const eyeVec = new THREE.Vector3();
  const losRay = new THREE.Raycaster();
  const losDir = new THREE.Vector3();

  // Is the line from pos to the player's eye clear of world geometry?
  function smokeBlocks(pos, playerEye) {
    for (const s of smokes) {
      if (s.age > s.duration) continue;
      // distance from the segment pos->playerEye to the smoke centre
      const ax = playerEye.x - pos.x;
      const ay = playerEye.y - pos.y;
      const az = playerEye.z - pos.z;
      const bx = s.pos.x - pos.x;
      const by = s.pos.y - pos.y;
      const bz = s.pos.z - pos.z;
      const ab2 = ax * ax + ay * ay + az * az;
      const t = Math.max(0, Math.min(1, (bx * ax + by * ay + bz * az) / (ab2 || 1)));
      const cx = pos.x + ax * t - s.pos.x;
      const cy = pos.y + ay * t - s.pos.y;
      const cz = pos.z + az * t - s.pos.z;
      if (cx * cx + cy * cy + cz * cz < 3.2 * 3.2) return true;
    }
    return false;
  }

  function clear() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
    for (const s of smokes) for (const p of s.puffs) scene.remove(p);
    smokes.length = 0;
  }

  return { throwGrenade, step, smokeBlocks, clear, liveCount: () => live.length };
}
