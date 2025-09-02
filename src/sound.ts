import type { PetType } from './types';

let ctx: (AudioContext | null) = null;
let muted = false;
let currentPet: PetType = 'DOG';
let snoreTimer: number | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new AC();
  }
  const c = ctx as AudioContext; // not null here
  if (c.state === 'suspended') void c.resume();
  return c;
}

export function resume(): void {
  try { ensureCtx(); } catch {}
}

export function setMuted(m: boolean) { muted = m; }
export function getMuted() { return muted; }
export function setPetType(t: PetType) { currentPet = t; }

type ToneOpts = {
  freqStart: number;
  freqEnd?: number;
  duration: number; // ms
  type?: OscillatorType;
  volume?: number; // 0..1
  attack?: number; // ms
  release?: number; // ms
};

function playTone(opts: ToneOpts, when = 0) {
  if (muted) return;
  const c = ensureCtx();
  const now = c.currentTime + when;
  const osc = c.createOscillator();
  const gain = c.createGain();

  const type = opts.type ?? 'sine';
  const vol = (opts.volume ?? 0.15);
  const attack = (opts.attack ?? 5) / 1000;
  const release = (opts.release ?? 60) / 1000;
  const dur = opts.duration / 1000;

  osc.type = type;
  osc.frequency.setValueAtTime(opts.freqStart, now);
  if (opts.freqEnd && opts.freqEnd !== opts.freqStart) {
    osc.frequency.linearRampToValueAtTime(opts.freqEnd, now + dur);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.setTargetAtTime(0.0001, now + dur - release, release);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + dur + release * 2);
}

function seq(parts: Array<{ delay: number; tone: ToneOpts }>) {
  let acc = 0;
  for (const p of parts) {
    acc += p.delay / 1000;
    playTone(p.tone, acc);
  }
}

// Soft waveshaper to add bite without harsh clipping
function softClipCurve(amount = 0.5) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.max(0.0001, amount) * 10;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function dogBark(when = 0) {
  if (muted) return;
  const c = ensureCtx();

  const scheduleSyllable = (offsetS: number, baseFreq = 420, endFreq = 180, durMs = 160) => {
    const now = c.currentTime + when + offsetS;
    const outGain = c.createGain();
    const shaper = c.createWaveShaper();
    shaper.curve = softClipCurve(0.6);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);

    // Tonal component
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + durMs / 1000);

    // Air/noise component
    const noiseDur = Math.min(120, durMs);
    const sr = c.sampleRate;
    const buffer = c.createBuffer(1, Math.floor(sr * (noiseDur / 1000)), sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.8;
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(650, now);
    bp.Q.setValueAtTime(3.0, now);

    // Envelope
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.8, now + 0.008); // fast attack
    env.gain.exponentialRampToValueAtTime(0.25, now + 0.05); // quick drop
    env.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000); // tail

    // Wire graph
    osc.connect(env);
    noise.connect(bp).connect(env);
    env.connect(shaper).connect(lp).connect(outGain).connect(c.destination);

    // Slight overall level
    outGain.gain.setValueAtTime(0.18, now);

    // Start/stop
    osc.start(now);
    noise.start(now);
    const stopAt = now + durMs / 1000 + 0.05;
    osc.stop(stopAt);
    noise.stop(stopAt);
  };

  // Two quick syllables: "woof-woof"
  scheduleSyllable(0.0, 520, 200, 150);
  scheduleSyllable(0.14, 420, 170, 140);
}

// Simple noise burst helper (for brush/crunch/purr granules)
function playNoise(opts: { duration: number; volume?: number; filterType?: BiquadFilterType; frequency?: number; Q?: number }, when = 0) {
  if (muted) return;
  const c = ensureCtx();
  const sr = c.sampleRate;
  const dur = Math.max(10, opts.duration) / 1000;
  const buffer = c.createBuffer(1, Math.floor(sr * dur), sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = opts.filterType ?? 'bandpass';
  filter.frequency.value = opts.frequency ?? 1800;
  filter.Q.value = opts.Q ?? 1.0;

  const gain = c.createGain();
  const vol = opts.volume ?? 0.12;
  const now = c.currentTime + when;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filter).connect(gain).connect(c.destination);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function purr(totalMs = 1200) {
  // Approximate a purr with rapid soft noise granules
  const step = 60; // ms between grains
  let t = 0;
  while (t < totalMs) {
    playNoise({ duration: 45, volume: 0.08, filterType: 'lowpass', frequency: 500, Q: 0.5 }, t / 1000);
    t += step;
  }
}

function snoreOnce(when = 0) {
  if (muted) return;
  const c = ensureCtx();
  const now = c.currentTime + when;

  // Slight pet-based pitch for variety
  const base = currentPet === 'DOG' ? 90 : currentPet === 'CAT' ? 140 : currentPet === 'RABBIT' ? 180 : 200;

  // Tonal bed
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.setValueAtTime(base * 0.9, now + 0.5);

  // Breath noise
  const breathDur = 0.7;
  const sr = c.sampleRate;
  const buffer = c.createBuffer(1, Math.floor(sr * breathDur), sr);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 300;
  bp.Q.value = 0.8;

  // Shared envelope
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(0.14, now + 0.12); // inhale swell
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.8); // gentle fade

  osc.connect(env);
  noise.connect(bp).connect(env);
  env.connect(c.destination);

  osc.start(now);
  noise.start(now);
  const stopAt = now + 0.85;
  osc.stop(stopAt);
  noise.stop(stopAt);
}

export function startSnore() {
  // restart loop
  stopSnore();
  // start one immediately, then every ~1.2s
  snoreOnce(0);
  snoreTimer = window.setInterval(() => {
    if (!muted) snoreOnce(0);
  }, 1200);
}

export function stopSnore() {
  if (snoreTimer) {
    window.clearInterval(snoreTimer);
    snoreTimer = null;
  }
}

export function playFeed() {
  switch (currentPet) {
    case 'DOG': { // crunchy kibble
      playNoise({ duration: 90, volume: 0.16, filterType: 'lowpass', frequency: 1200, Q: 0.8 });
      playNoise({ duration: 80, volume: 0.14, filterType: 'lowpass', frequency: 1400, Q: 0.8 }, 0.08);
      break;
    }
    case 'CAT': { // softer crunch
      playNoise({ duration: 80, volume: 0.12, filterType: 'bandpass', frequency: 1600, Q: 1.2 });
      playNoise({ duration: 70, volume: 0.10, filterType: 'bandpass', frequency: 1400, Q: 1.0 }, 0.07);
      break;
    }
    case 'RABBIT':
    case 'HAMSTER': { // nibble ticks
      playNoise({ duration: 50, volume: 0.09, filterType: 'bandpass', frequency: 2200, Q: 1.6 });
      playNoise({ duration: 45, volume: 0.08, filterType: 'bandpass', frequency: 2400, Q: 1.4 }, 0.06);
      break;
    }
  }
}

export function playGroom() {
  // Brushy shimmer using band-passed noise; tune per pet
  const baseFreq = currentPet === 'DOG' ? 2500 : currentPet === 'CAT' ? 2800 : 3000;
  playNoise({ duration: 160, volume: 0.10, filterType: 'bandpass', frequency: baseFreq, Q: 2.0 });
  playNoise({ duration: 140, volume: 0.08, filterType: 'bandpass', frequency: baseFreq + 300, Q: 2.0 }, 0.10);
}

export function playCuddle() {
  switch (currentPet) {
    case 'CAT':
      purr(1200); // purr while cuddling
      break;
    case 'DOG': // soft happy woof heartbeat
      seq([
        { delay: 0, tone: { freqStart: 180, duration: 90, type: 'sine', volume: 0.16, attack: 1, release: 120 } },
        { delay: 110, tone: { freqStart: 150, duration: 110, type: 'sine', volume: 0.16, attack: 1, release: 140 } },
      ]);
      break;
    case 'RABBIT':
      playTone({ freqStart: 900, freqEnd: 700, duration: 140, type: 'sine', volume: 0.10 });
      break;
    case 'HAMSTER':
      seq([
        { delay: 0, tone: { freqStart: 1200, duration: 80, type: 'square', volume: 0.08 } },
        { delay: 90, tone: { freqStart: 1300, duration: 80, type: 'square', volume: 0.08 } },
      ]);
      break;
  }
}

export function playPlay() {
  switch (currentPet) {
    case 'DOG': {
      // Synthesize a two-syllable bark: airy burst + low formant
      dogBark(0);
      break;
    }
    case 'CAT': // playful mrrp up-then-down
      seq([
        { delay: 0, tone: { freqStart: 520, freqEnd: 820, duration: 110, type: 'triangle', volume: 0.11 } },
        { delay: 100, tone: { freqStart: 820, freqEnd: 600, duration: 110, type: 'triangle', volume: 0.11 } },
      ]);
      break;
    case 'RABBIT':
    case 'HAMSTER': // fast chirps
      seq([
        { delay: 0, tone: { freqStart: 900, duration: 70, type: 'square', volume: 0.08 } },
        { delay: 70, tone: { freqStart: 1100, duration: 90, type: 'square', volume: 0.08 } },
      ]);
      break;
  }
}

export function playSleep() {
  // Gentle down chime for all
  playTone({ freqStart: 520, freqEnd: 300, duration: 360, type: 'sine', volume: 0.10 });
}

export function playWake() {
  // Gentle up chime for all
  playTone({ freqStart: 320, freqEnd: 520, duration: 320, type: 'sine', volume: 0.11 });
}
