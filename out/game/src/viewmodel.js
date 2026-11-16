// Viewmodel weapon: a low-poly rifle/pistol built from boxes parented to the camera, with sway,
// recoil kick, reload dip, muzzle flash light and shell ejection. Rendering only — no game state.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './config.js';

const gunMaterials = {
  body: new THREE.MeshStandardMaterial({ color: 0x2f343b, roughness: 0.55, metalness: 0.6 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.9 }),
  accent: new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5, emissive: PALETTE.accent, emissiveIntensity: 0.25 }),
  mag: new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.6, metalness: 0.5 }),
};

function box(w, h, d, material, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  return m;
}

// Builds one viewmodel group per weapon id; the active one is shown.
export function createViewModel(camera) {
  const root = new THREE.Group();
  root.position.set(0.26, -0.24, -0.55);
  camera.add(root);

  const flashLight = new THREE.PointLight(PALETTE.muzzle, 0, 9, 2);
  flashLight.position.set(0.26, -0.1, -1.2);
  camera.add(flashLight);

  const models = new Map();

  function buildRifleLike(def, withScope) {
    const g = new THREE.Group();
    const L = def.viewLength;
    g.add(box(0.075, 0.09, L, gunMaterials.body, 0, 0, -L / 2 + 0.05));
    g.add(box(0.05, 0.05, L * 0.55, gunMaterials.grip, 0, 0.012, -L * 0.82));      // barrel shroud
    g.add(box(0.028, 0.028, L * 0.28, gunMaterials.body, 0, 0.012, -L * 1.02));    // barrel
    g.add(box(0.06, 0.14, 0.07, gunMaterials.grip, 0, -0.1, -0.1, 0.35));          // pistol grip
    g.add(box(0.055, 0.16, 0.09, gunMaterials.mag, 0, -0.12, -L * 0.42, -0.18));   // magazine
    g.add(box(0.06, 0.07, 0.16, gunMaterials.body, 0, 0.005, 0.1));                // stock
    g.add(box(0.014, 0.03, 0.03, gunMaterials.accent, 0, 0.058, -L * 0.75));       // front sight
    if (withScope) {
      g.add(box(0.05, 0.05, 0.26, gunMaterials.body, 0, 0.085, -L * 0.45));
      g.add(box(0.056, 0.056, 0.02, gunMaterials.accent, 0, 0.085, -L * 0.45 - 0.13));
    }
    return g;
  }

  function buildPistol() {
    const g = new THREE.Group();
    g.add(box(0.06, 0.075, 0.3, gunMaterials.body, 0, 0, -0.12));
    g.add(box(0.05, 0.12, 0.06, gunMaterials.grip, 0, -0.08, 0.02, 0.3));
    g.add(box(0.012, 0.02, 0.02, gunMaterials.accent, 0, 0.045, -0.24));
    return g;
  }

  models.set('pistol', buildPistol());
  models.set('smg', buildRifleLike(WEAPONS.smg, false));
  models.set('rifle', buildRifleLike(WEAPONS.rifle, false));
  models.set('sniper', buildRifleLike(WEAPONS.sniper, true));
  for (const model of models.values()) {
    model.visible = false;
    root.add(model);
  }

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.02, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.4, metalness: 0.8 }),
  );
  shell.visible = false;
  root.add(shell);
  let shellLife = 0;

  return {
    root,
    models,
    flashLight,
    shell,
    setShellLife(v) { shellLife = v; },
    getShellLife() { return shellLife; },
  };
}

// Per-frame viewmodel motion: idle sway, move bob, fire kick, reload dip.
export function animateViewModel(vm, weaponState, playerState, dt, lookDx, lookDy) {
  const { root, models, flashLight, shell } = vm;
  for (const model of models.values()) model.visible = false;
  const model = models.get(weaponState.weapon.id);
  if (model) model.visible = true;

  const reloading = weaponState.reloadTimer > 0;
  const kick = weaponState.kick;

  // Position: base + sway from look delta + bob from movement + reload dip.
  const bob = playerState.bobAmount;
  const bobX = Math.sin(playerState.bobPhase) * 0.012 * bob;
  const bobY = Math.abs(Math.cos(playerState.bobPhase)) * 0.014 * bob;
  const reloadDip = reloading ? Math.sin(Math.min(1, 1 - weaponState.reloadTimer / weaponState.reloadTotal) * Math.PI) * 0.16 : 0;
  const swayX = THREE.MathUtils.clamp(-lookDx * 0.00035, -0.05, 0.05);
  const swayY = THREE.MathUtils.clamp(lookDy * 0.0003, -0.04, 0.04);

  root.position.x = 0.26 + swayX + bobX;
  root.position.y = -0.24 + swayY + bobY - reloadDip - kick * 0.03;
  root.position.z = -0.55 + kick * 0.09;

  root.rotation.x = kick * 0.22 + (reloading ? 0.5 : 0) + swayY * 0.6;
  root.rotation.z = swayX * 1.2 - bobX * 0.8;
  root.rotation.y = swayX * 0.8;

  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);

  // Shell ejects on each shot, tumbles and fades.
  if (shellLife > 0) {
    shellLife -= dt;
    shell.visible = true;
    shellLife > 0.12 ? shell.position.set(shell.position.x + dt * 1.6, shell.position.y + dt * 0.9 - 0.03, shell.position.z + dt * 0.4)
      : shell.visible = false;
    shell.rotation.x += dt * 14;
    shell.rotation.z += dt * 9;
    if (shellLife <= 0) shell.visible = false;
  }
}
