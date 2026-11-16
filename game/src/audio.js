// Synthesised sound: no audio files, no network. Every effect is built from
// oscillators and filtered noise through one WebAudio graph, created lazily on the
// first user gesture (browsers block audio before that) and silent until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise({ at = 0, dur = 0.1, gain = 0.5, freq = 1200, q = 0.8, type = 'lowpass' }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone({ at = 0, dur = 0.1, gain = 0.3, freq = 440, slideTo = null, type = 'sine' }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Distance-attenuated gain: 1 at the source, fading to ~0.06 at 60 m.
  function attenuate(distance) {
    return Math.max(0.05, 1 / (1 + distance * 0.09));
  }

  return {
    unlock() { ensure(); },
    setMuted(value) { muted = value; },
    get muted() { return muted; },

    shot(kind, distance = 0) {
      const g = attenuate(distance);
      if (kind === 'rifle') {
        noise({ dur: 0.14, gain: 0.9 * g, freq: 900, q: 0.5 });
        tone({ dur: 0.09, gain: 0.5 * g, freq: 160, slideTo: 55, type: 'square' });
      } else if (kind === 'smg') {
        noise({ dur: 0.09, gain: 0.7 * g, freq: 1400, q: 0.6 });
        tone({ dur: 0.06, gain: 0.35 * g, freq: 190, slideTo: 70, type: 'square' });
      } else if (kind === 'sniper') {
        noise({ dur: 0.32, gain: 1.0 * g, freq: 600, q: 0.4 });
        tone({ dur: 0.22, gain: 0.6 * g, freq: 110, slideTo: 38, type: 'square' });
      } else if (kind === 'shotgun') {
        noise({ dur: 0.2, gain: 1.0 * g, freq: 500, q: 0.4 });
        tone({ dur: 0.12, gain: 0.55 * g, freq: 130, slideTo: 45, type: 'square' });
      } else {
        noise({ dur: 0.08, gain: 0.6 * g, freq: 1600, q: 0.7 });
        tone({ dur: 0.05, gain: 0.3 * g, freq: 220, slideTo: 90, type: 'square' });
      }
    },
    dryFire() { tone({ dur: 0.04, gain: 0.25, freq: 900, type: 'square' }); },
    reload() {
      tone({ at: 0, dur: 0.05, gain: 0.3, freq: 700, type: 'square' });
      tone({ at: 0.18, dur: 0.05, gain: 0.3, freq: 500, type: 'square' });
      tone({ at: 0.42, dur: 0.06, gain: 0.35, freq: 950, type: 'square' });
    },
    hit(kill) {
      tone({ dur: 0.07, gain: 0.4, freq: kill ? 1400 : 1050, type: 'triangle' });
      if (kill) tone({ at: 0.07, dur: 0.09, gain: 0.35, freq: 1750, type: 'triangle' });
    },
    hurt() {
      noise({ dur: 0.12, gain: 0.4, freq: 300, q: 1 });
      tone({ dur: 0.14, gain: 0.3, freq: 120, slideTo: 70, type: 'sawtooth' });
    },
    step(distance = 0) { noise({ dur: 0.05, gain: 0.16 * attenuate(distance), freq: 420, q: 1 }); },
    beep(final = false) { tone({ dur: final ? 0.3 : 0.1, gain: 0.4, freq: final ? 1500 : 1150, type: 'square' }); },
    plantTick() { tone({ dur: 0.05, gain: 0.3, freq: 880, type: 'square' }); },
    explosion(distance = 0) {
      const g = attenuate(distance);
      noise({ dur: 1.1, gain: 1.0 * g, freq: 240, q: 0.4 });
      tone({ dur: 0.9, gain: 0.7 * g, freq: 70, slideTo: 28, type: 'sine' });
      noise({ at: 0.05, dur: 0.5, gain: 0.5 * g, freq: 3000, q: 0.5, type: 'highpass' });
    },
    grenadeBounce() { tone({ dur: 0.06, gain: 0.25, freq: 320, slideTo: 180, type: 'triangle' }); },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone({ at: i * 0.11, dur: 0.22, gain: 0.3, freq: f, type: 'triangle' }));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone({ at: i * 0.12, dur: 0.24, gain: 0.28, freq: f, type: 'triangle' }));
    },
    buy() { tone({ dur: 0.08, gain: 0.3, freq: 1250, type: 'triangle' }); },
    denied() { tone({ dur: 0.12, gain: 0.3, freq: 220, type: 'square' }); },
    flash() { noise({ dur: 0.4, gain: 0.4, freq: 5000, q: 0.4, type: 'highpass' }); },
  };
}
