// Sound: every effect is synthesised with the WebAudio API at boot — no asset files, no network.
// Short buffers (noise bursts, sweeps) are generated once into AudioBuffers; playback voices with
// per-sound gain so the mix stays readable. Muzzle-distant shots use a lowpassed variant.
import { MASTER_VOLUME } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  const buffers = new Map();

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
    return true;
  }

  // One-third-octave pink-ish noise via the Paul Kellet filter.
  function noiseBuffer(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      const t = i / len;
      data[i] = pink * Math.exp(-decay * t * 10);
    }
    return buf;
  }

  function toneBuffer(seconds, from, to, shape) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * rate));
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      const f = from + (to - from) * t;
      const phase = 2 * Math.PI * f * t;
      let s = Math.sin(phase);
      if (shape === 'square') s = s > 0 ? 0.6 : -0.6;
      if (shape === 'noise') s += (Math.random() * 2 - 1) * 0.6;
      data[i] = s * Math.exp(-t * 8) * 0.8;
    }
    return buf;
  }

  function buildAll() {
    if (!ensure() || buffers.size) return;
    buffers.set('shotRifle', noiseBuffer(0.22, 3.2));
    buffers.set('shotPistol', noiseBuffer(0.16, 4.5));
    buffers.set('shotSmg', noiseBuffer(0.13, 4.0));
    buffers.set('shotSniper', noiseBuffer(0.5, 2.2));
    buffers.set('reload', toneBuffer(0.24, 900, 300, 'square'));
    buffers.set('reloadEnd', toneBuffer(0.18, 500, 1100, 'square'));
    buffers.set('hit', toneBuffer(0.07, 1400, 900, 'square'));
    buffers.set('hitKill', toneBuffer(0.16, 1900, 700, 'square'));
    buffers.set('hurt', noiseBuffer(0.2, 5));
    buffers.set('step', noiseBuffer(0.07, 7));
    buffers.set('bombBeep', toneBuffer(0.09, 2100, 2100, 'square'));
    buffers.set('bombPlanted', toneBuffer(0.5, 500, 180, 'square'));
    buffers.set('bombDefused', toneBuffer(0.4, 700, 1500, 'square'));
    buffers.set('explode', noiseBuffer(0.9, 1.6));
    buffers.set('flashPop', toneBuffer(0.3, 2600, 400, 'square'));
    buffers.set('smokePop', noiseBuffer(0.35, 3.4));
    buffers.set('bounce', toneBuffer(0.08, 320, 200, 'square'));
    buffers.set('roundWin', toneBuffer(0.55, 520, 1040, 'square'));
    buffers.set('roundLose', toneBuffer(0.55, 440, 190, 'square'));
    buffers.set('buy', toneBuffer(0.12, 1000, 1500, 'square'));
    buffers.set('deny', toneBuffer(0.14, 260, 180, 'square'));
    buffers.set('land', noiseBuffer(0.1, 6));
    buffers.set('switch', toneBuffer(0.09, 700, 500, 'square'));
    buffers.set('pin', toneBuffer(0.06, 1600, 1200, 'square'));
  }

  function play(name, gain = 1, rate = 1) {
    if (!ensure()) return;
    buildAll();
    const buf = buffers.get(name);
    if (!buf) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start();
  }

  // Positional one-shot for world events (enemy shots, grenades, bomb beeps).
  function playAt(name, gain, rate, x, z, px, pz) {
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    const atten = 1 / (1 + d * d * 0.012);
    // Pan by direction relative to the player's right vector; caller supplies player-relative pan.
    play(name, gain * atten, rate);
    return atten;
  }

  return { play, playAt, get ready() { return !!ctx; }, resume: ensure };
}
