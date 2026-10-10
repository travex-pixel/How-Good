// SCRAPBOUND audio: every sound is synthesized live with Web Audio (no files).
(function () {
  const SB = (globalThis.SB = globalThis.SB || {});
  const A = {
    ctx: null, master: null, sfx: null, music: null, noise: null,
    muted: false, musicOn: true, last: {}, musicTimer: null, step: 0, nextT: 0,
  };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
      A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
      A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.55; A.sfx.connect(A.master);
      A.music = A.ctx.createGain(); A.music.gain.value = 0.16; A.music.connect(A.master);
      const len = A.ctx.sampleRate;
      A.noise = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = A.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.applyVolume();
      if (A.musicOn) A.startMusic();
    } catch (e) { A.ctx = null; }
  };

  A.applyVolume = function () {
    if (!A.ctx) return;
    A.master.gain.setTargetAtTime(A.muted ? 0 : 1, A.ctx.currentTime, 0.02);
    A.music.gain.setTargetAtTime(A.musicOn ? 0.16 : 0, A.ctx.currentTime, 0.05);
  };
  A.setMuted = function (m) { A.muted = m; A.applyVolume(); };
  A.setMusic = function (on) { A.musicOn = on; if (on && A.ctx) A.startMusic(); A.applyVolume(); };

  function tone(type, f1, f2, dur, vol, when = 0, dest) {
    const t = A.ctx.currentTime + when;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t);
    if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || A.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, q = 1, when = 0, type = 'lowpass', sweepTo) {
    const t = A.ctx.currentTime + when;
    const s = A.ctx.createBufferSource(); s.buffer = A.noise;
    const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    hit() { noise(0.07, 0.35, 1800, 1.5, 0, 'bandpass'); tone('square', 220 + Math.random() * 60, 90, 0.06, 0.08); },
    crit() { noise(0.1, 0.5, 2600, 2, 0, 'bandpass'); tone('square', 520, 140, 0.12, 0.12); },
    hurt() { tone('sawtooth', 180, 80, 0.1, 0.07); },
    clang() { tone('triangle', 900 + Math.random() * 400, 700, 0.18, 0.12); tone('sine', 1500 + Math.random() * 500, 1400, 0.12, 0.05); },
    explode() { noise(0.45, 0.7, 900, 0.7, 0, 'lowpass', 80); tone('sine', 120, 40, 0.35, 0.35); },
    boom() { noise(0.8, 0.9, 1200, 0.7, 0, 'lowpass', 50); tone('sine', 90, 30, 0.7, 0.5); },
    special() { tone('square', 300, 900, 0.18, 0.12); tone('square', 450, 1350, 0.18, 0.08, 0.06); noise(0.2, 0.2, 3000, 1, 0, 'highpass'); },
    storm() { tone('sawtooth', 80, 400, 2.0, 0.09); tone('sine', 160, 800, 2.0, 0.08); noise(2.0, 0.18, 400, 3, 0, 'bandpass', 2400); },
    stormBlast() { noise(0.9, 1, 1500, 0.6, 0, 'lowpass', 60); tone('sine', 100, 30, 0.8, 0.5); tone('square', 900, 200, 0.3, 0.08); },
    coin() { tone('square', 988, 988, 0.07, 0.08); tone('square', 1319, 1319, 0.16, 0.08, 0.07); },
    heal() { tone('sine', 600, 900, 0.18, 0.08); },
    trap() { tone('square', 1200, 300, 0.06, 0.1); noise(0.05, 0.3, 3000, 2, 0, 'bandpass'); },
    yeet() { tone('sine', 1400, 200, 0.6, 0.14); },
    crush() { noise(0.4, 0.9, 500, 1, 0, 'lowpass', 60); tone('square', 70, 40, 0.3, 0.2); },
    click() { tone('square', 660, 660, 0.04, 0.06); },
    deny() { tone('square', 200, 150, 0.12, 0.08); },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.08, i * 0.08)); },
    victory() { [392, 523, 659, 784, 659, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.09, i * 0.11)); },
    defeat() { [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.12, i * 0.22)); },
    loot() { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.2, 0.08, i * 0.06)); },
    rare() { [523, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone('square', f, f, 0.22, 0.07, i * 0.07)); noise(0.6, 0.15, 6000, 1, 0.3, 'highpass'); },
    bees() { tone('sawtooth', 220, 240, 0.4, 0.05); tone('sawtooth', 233, 210, 0.4, 0.04); },
    warn() { tone('square', 880, 880, 0.08, 0.06); tone('square', 880, 880, 0.08, 0.06, 0.15); },
    fight() { tone('square', 392, 392, 0.1, 0.1); tone('square', 784, 784, 0.25, 0.1, 0.1); noise(0.3, 0.2, 2000, 1, 0.1, 'highpass'); },
  };

  A.play = function (name, throttleMs = 40) {
    if (!A.ctx || A.muted || !SOUNDS[name]) return;
    const now = performance.now();
    if (A.last[name] && now - A.last[name] < throttleMs) return;
    A.last[name] = now;
    try { SOUNDS[name](); } catch (e) { /* audio is optional */ }
  };

  // Turn sim events into sounds.
  A.handleEvents = function (events) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': if (e.kind === 'curse' || e.kind === 'hazard') break; A.play(e.crit ? 'crit' : e.team === 0 ? 'hurt' : 'hit', 45); break;
        case 'explode': A.play(e.big ? 'boom' : 'explode', 80); break;
        case 'stormBlast': A.play('stormBlast', 200); break;
        case 'storm': A.play('storm', 500); break;
        case 'special': A.play('special', 100); break;
        case 'clang': A.play('clang', 70); break;
        case 'heal': A.play('heal', 150); break;
        case 'trap': A.play('trap'); break;
        case 'crush': A.play('crush'); break;
        case 'geyser': A.play('explode'); break;
        case 'thud': A.play(e.kind === 'anvil' ? 'clang' : 'hit', 80); break;
        case 'warn': A.play('warn', 300); break;
        case 'wave': A.play('fight', 500); break;
        case 'bees': A.play('bees', 300); break;
        case 'pickup': A.play('coin', 80); break;
        case 'death': if (e.yeet) A.play('yeet'); else if (e.boss) A.play('boom'); break;
        case 'text': if (e.text === 'YEET!') A.play('yeet', 200); break;
      }
    }
  };

  // Tiny procedural "tavern punk" loop: bass + plucky lead in D minor-ish.
  const BASS = [38, 38, 45, 45, 41, 41, 43, 45];
  const LEAD = [62, 65, 69, 67, 65, 62, 60, 62, 62, 65, 69, 72, 70, 69, 67, 65];
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  A.startMusic = function () {
    if (!A.ctx || A.musicTimer) return;
    A.nextT = A.ctx.currentTime + 0.1;
    const beat = 60 / 140 / 2;
    A.musicTimer = setInterval(() => {
      if (!A.ctx || !A.musicOn) return;
      while (A.nextT < A.ctx.currentTime + 0.25) {
        const s = A.step++;
        const when = A.nextT - A.ctx.currentTime;
        if (s % 2 === 0) tone('triangle', midi(BASS[(s >> 3) % 8]), midi(BASS[(s >> 3) % 8]), beat * 1.8, 0.5, when, A.music);
        if (s % 4 === 2) { const t0 = A.ctx.currentTime + when; const src = A.ctx.createBufferSource(); src.buffer = A.noise; const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000; const g = A.ctx.createGain(); g.gain.setValueAtTime(0.15, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05); src.connect(f); f.connect(g); g.connect(A.music); src.start(t0); src.stop(t0 + 0.06); }
        if ((s >> 4) % 2 === 1 || s % 3 !== 1) { const n = LEAD[s % 16]; if (s % 2 === 0) tone('square', midi(n), midi(n), beat * 0.9, 0.12, when, A.music); }
        A.nextT += beat;
      }
    }, 80);
  };

  SB.Audio = A;
})();
