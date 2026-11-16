// Tracers, muzzle flashes, impact sparks, damage numbers floating in 3D, blood puffs and the
// bomb plant/defuse sparkle. Pools everything: no allocation during play.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 48;
const SPARK_POOL = 96;
const PUFF_POOL = 48;

export function createEffects(scene) {
  // Tracers: stretched glowing boxes from muzzle toward hit point.
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: PALETTE.muzzle, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }

  // Sparks: tiny gravity dots.
  const sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcf8a });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, life: 0, velocity: new THREE.Vector3() });
  }

  // Blood puffs: dark red quads that expand and fade.
  const puffGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const puffMat = new THREE.MeshBasicMaterial({ color: PALETTE.blood, transparent: true, opacity: 0.85 });
  const puffs = [];
  for (let i = 0; i < PUFF_POOL; i += 1) {
    const m = new THREE.Mesh(puffGeo, puffMat.clone());
    m.visible = false;
    scene.add(m);
    puffs.push({ mesh: m, life: 0, velocity: new THREE.Vector3() });
  }

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const mid = new THREE.Vector3();

  function tracer(start, end, color) {
    const slot = tracers.find((t) => t.life <= 0) || tracers[0];
    from.copy(start);
    to.copy(end);
    mid.addVectors(from, to).multiplyScalar(0.5);
    slot.mesh.position.copy(mid);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, from.distanceTo(to));
    slot.mesh.material.color.set(color);
    slot.mesh.material.opacity = 0.9;
    slot.mesh.visible = true;
    slot.life = 0.06;
  }

  function impact(point, normalish) {
    for (let i = 0; i < 5; i += 1) {
      const s = sparks.find((sp) => sp.life <= 0);
      if (!s) break;
      s.mesh.position.copy(point);
      s.velocity.set(
        (Math.random() - 0.5) * 5 + normalish.x * 2.4,
        Math.random() * 3.4 + 0.8,
        (Math.random() - 0.5) * 5 + normalish.z * 2.4,
      );
      s.mesh.visible = true;
      s.life = 0.34;
    }
  }

  function blood(point) {
    for (let i = 0; i < 7; i += 1) {
      const p = puffs.find((pp) => pp.life <= 0);
      if (!p) break;
      p.mesh.position.copy(point);
      p.velocity.set((Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4);
      p.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      p.mesh.material.opacity = 0.85;
      p.mesh.visible = true;
      p.life = 0.42;
    }
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.06) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.velocity.y -= 14 * dt;
        s.mesh.position.addScaledVector(s.velocity, dt);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    for (const p of puffs) {
      if (p.life > 0) {
        p.life -= dt;
        p.velocity.y += 1.6 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.scale.multiplyScalar(1 + dt * 2.4);
        p.mesh.material.opacity = Math.max(0, p.life / 0.42) * 0.85;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }

  return { tracer, impact, blood, step };
}
