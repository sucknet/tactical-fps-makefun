// The bomb: a code-built device at site A on the pump plaza. The player (attacker) plants with a
// held E inside the site; bots defend it and a bot can defuse if it reaches the bomb while the
// player is dead... in this 1-vs-bots form the bots never defuse: the round pressure is the timer.
// The C4 itself, its beep cadence, its light and the arm progress bar live here.
import * as THREE from 'three';
import { BOMB_PLANT_PROGRESS, BOMB_DEFUSE_PROGRESS, BOMB_TIME } from './config.js';
import { PALETTE } from './palette.js';

export function createBomb(scene, world) {
  // The planted device: dark case + orange blinking lamp + planted light.
  const bomb = new THREE.Group();
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.6, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), caseMat);
  body.position.y = 0.08;
  body.castShadow = true;
  const lampMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 0.2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), lampMat);
  lamp.position.set(0.12, 0.19, 0);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), caseMat);
  antenna.position.set(-0.14, 0.3, 0);
  bomb.add(body, lamp, antenna);
  bomb.visible = false;
  scene.add(bomb);

  const bombLight = new THREE.PointLight(PALETTE.accent, 0, 10, 2);
  scene.add(bombLight);

  const state = {
    carried: true,
    planted: false,
    defused: false,
    exploded: false,
    timer: BOMB_TIME,
    plantProgress: 0,
    defuseProgress: 0,
    position: new THREE.Vector3(),
    beepTimer: 0,
  };

  function tryPlant(playerPos, holding, dt, onPlanted) {
    if (state.planted || !state.carried) return { inSite: false, progress: 0 };
    const inSite = Math.abs(playerPos.x - world.siteA.x) < 9 && Math.abs(playerPos.z - world.siteA.z) < 7.5;
    if (!inSite || !holding) {
      state.plantProgress = Math.max(0, state.plantProgress - dt * 1.4);
      return { inSite, progress: state.plantProgress / BOMB_PLANT_PROGRESS };
    }
    state.plantProgress += dt;
    if (state.plantProgress >= BOMB_PLANT_PROGRESS) {
      state.planted = true;
      state.carried = false;
      state.timer = BOMB_TIME;
      state.beepTimer = 0;
      state.position.set(playerPos.x, 0.02, playerPos.z);
      bomb.position.copy(state.position);
      bomb.visible = true;
      bombLight.position.set(state.position.x, 0.6, state.position.z);
      onPlanted && onPlanted();
    }
    return { inSite: true, progress: Math.min(1, state.plantProgress / BOMB_PLANT_PROGRESS) };
  }

  function tryDefuse(holding, dt) {
    if (!state.planted || state.defused || state.exploded) return 0;
    if (holding) state.defuseProgress += dt;
    else state.defuseProgress = Math.max(0, state.defuseProgress - dt * 1.6);
    if (state.defuseProgress >= BOMB_DEFUSE_PROGRESS) {
      state.defused = true;
      return 1;
    }
    return state.defuseProgress / BOMB_DEFUSE_PROGRESS;
  }

  function step(dt, onExplode) {
    if (!state.planted || state.defused || state.exploded) return;
    state.timer -= dt;
    // Beep cadence accelerates as the timer runs down.
    const urgency = 1 - state.timer / BOMB_TIME;
    state.beepTimer -= dt;
    if (state.beepTimer <= 0) {
      state.beepTimer = Math.max(0.09, 0.95 - urgency * 0.85);
      hooks.beep();
    }
    const blink = (Math.sin(state.timer * (4 + urgency * 14)) + 1) / 2;
    lampMat.emissiveIntensity = 0.15 + blink * 1.6;
    bombLight.intensity = blink * (2.2 + urgency * 3);
    if (state.timer <= 0) {
      state.exploded = true;
      bomb.visible = false;
      bombLight.intensity = 0;
      onExplode && onExplode(state.position);
    }
  }

  // hooks set by main after audio exists (avoids an import cycle).
  const hooks = { beep: () => {} };
  function setHooks(h) { Object.assign(hooks, h); }

  function reset() {
    state.carried = true;
    state.planted = false;
    state.defused = false;
    state.exploded = false;
    state.timer = BOMB_TIME;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    bomb.visible = false;
    bombLight.intensity = 0;
  }

  return { state, tryPlant, tryDefuse, step, reset, setHooks, mesh: bomb, light: bombLight };
}
