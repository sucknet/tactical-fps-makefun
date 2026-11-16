// BREACHPOINT palette: a cold dawn industrial dock. One accent (signal orange) carries the UI
// and objective markers; everything else is desaturated slate, concrete and rust.
export const PALETTE = {
  sky: 0x0e1420,          // pre-dawn sky
  fog: 0x121a28,
  ground: 0x22262c,       // asphalt
  concrete: 0x8b8f96,     // light concrete walls
  concreteDark: 0x565b63,
  metal: 0x3c434c,        // containers / machinery
  metalRust: 0x7a4a32,
  accent: 0xff7a1a,       // signal orange (bombsite, UI, hitmarker)
  danger: 0xd93636,       // enemy team
  friendly: 0x36c98f,     // friendly team
  crate: 0x6e5b3c,        // wooden crate
  lampWarm: 0xffc07a,     // sodium lamp light
  muzzle: 0xffd27a,
  blood: 0x8a1f1f,
  uiInk: '#e9e6df',
  uiMuted: '#98a0a8',
  uiAccent: '#ff7a1a',
  uiPanel: '#161b22',
  uiHairline: '#2c323a',
  uiCanvas: '#0e1420',
};

// Reusable materials (module-level singletons so hot loops never allocate).
export function makeMaterials() {
  const mat = (color, rough = 0.9, metal = 0.0) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  return {
    ground: mat(PALETTE.ground, 0.96),
    concrete: mat(PALETTE.concrete, 0.94),
    concreteDark: mat(PALETTE.concreteDark, 0.95),
    metal: mat(PALETTE.metal, 0.55, 0.55),
    rust: mat(PALETTE.metalRust, 0.85, 0.25),
    crate: mat(PALETTE.crate, 0.92),
    accent: new THREE.MeshStandardMaterial({
      color: PALETTE.accent, roughness: 0.6, emissive: PALETTE.accent, emissiveIntensity: 0.45,
    }),
    danger: new THREE.MeshStandardMaterial({
      color: PALETTE.danger, roughness: 0.7, emissive: PALETTE.danger, emissiveIntensity: 0.12,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fc4d8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.28,
    }),
  };
}
import * as THREE from 'three';
