// The app's small sounds, made here with Web Audio so there are no files to fetch, and square waves so they sound like
// the pixels look. Nothing here may get in the way of a tick: anything a browser refuses just stays silent.

const VOLUME = 0.04;
const NOTE_SECONDS = 0.06;

export type SoundName = "tick" | "press" | "untick" | "lightning" | "fanfare";

// The notes of each sound, in Hz, one after the other.
const NOTES: Record<"tick" | "press" | "untick", number[]> = {
  tick: [660, 880],
  press: [523, 659, 784],
  untick: [330],
};

let context: AudioContext | null = null;

/** Made on the first sound, which comes from a click: browsers don't let a page start sound by itself. */
function audio() {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function playNote(ctx: AudioContext, frequency: number, from: number, seconds: number, volume: number) {
  const start = ctx.currentTime + from;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.linearRampToValueAtTime(0, start + seconds);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + seconds);
}

/** A burst of noise through a filter, `start` seconds from now; its gain is the caller's to shape. */
function noiseBurst(ctx: AudioContext, start: number, seconds: number, filterType: BiquadFilterType, frequency: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  const gain = ctx.createGain();
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(ctx.currentTime + start);
  return { gain: gain.gain, at: ctx.currentTime + start };
}

// The crack lands with the big bolt (.big-moment-bolt in index.css).
const STRIKE = 0.12;

/** A sharp crack, right into a rumble that rolls away. */
function playLightning(ctx: AudioContext) {
  const crack = noiseBurst(ctx, STRIKE, 0.1, "highpass", 1800);
  crack.gain.setValueAtTime(VOLUME * 7, crack.at);
  crack.gain.exponentialRampToValueAtTime(0.001, crack.at + 0.1);
  const rumble = noiseBurst(ctx, STRIKE + 0.03, 1.4, "lowpass", 260);
  rumble.gain.setValueAtTime(VOLUME * 2, rumble.at);
  rumble.gain.linearRampToValueAtTime(VOLUME * 12, rumble.at + 0.08);
  rumble.gain.linearRampToValueAtTime(VOLUME * 6, rumble.at + 0.4);
  rumble.gain.linearRampToValueAtTime(VOLUME * 8, rumble.at + 0.6);
  rumble.gain.exponentialRampToValueAtTime(0.001, rumble.at + 1.4);
}

/** A pop, a run up, and a chord to land on. */
function playFanfare(ctx: AudioContext) {
  const pop = noiseBurst(ctx, 0, 0.05, "bandpass", 1200);
  pop.gain.setValueAtTime(VOLUME * 5, pop.at);
  pop.gain.exponentialRampToValueAtTime(0.001, pop.at + 0.05);
  const run = 0.09;
  [523, 659, 784, 1047].forEach((frequency, i) => playNote(ctx, frequency, 0.05 + i * run, run, VOLUME * 1.5));
  for (const frequency of [1047, 1319, 1568]) playNote(ctx, frequency, 0.05 + 4 * run, 0.45, VOLUME);
}

export function playSound(name: SoundName) {
  try {
    const ctx = audio();
    if (name === "lightning") playLightning(ctx);
    else if (name === "fanfare") playFanfare(ctx);
    else NOTES[name].forEach((frequency, i) => playNote(ctx, frequency, i * NOTE_SECONDS, NOTE_SECONDS, VOLUME));
  } catch {
    // No sound, then.
  }
}
