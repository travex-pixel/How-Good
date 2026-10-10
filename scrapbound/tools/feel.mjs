// "Feel" metrics: how punchy the opening is and whether tanks actually tank.
// Usage: node scrapbound/tools/feel.mjs [runs]
import '../js/data.js';
import '../js/sim.js';
import '../js/progress.js';
const SB = globalThis.SB;
const runs = +(process.argv[2] || 20);
const mode = process.argv[3] || 'human';
// A human-speed player: notices a ready button 2-4 seconds late.
function humanPilot(b) {
  b._seen = b._seen || {};
  for (const u of b.units) if (u.team === 0 && u.alive && u.special && u.charge >= 1) {
    b._seen[u.uid] ??= b.t + 2 + (u.uid % 3);
    if (b.t >= b._seen[u.uid]) { SB.useSpecial(b, u.uid); delete b._seen[u.uid]; }
  }
  if (SB.canStorm(b)) { b._storm ??= b.t + 3; if (b.t >= b._storm) { SB.triggerStorm(b); b._storm = null; } }
}
const pilot = mode === 'auto' ? SB.autoPilot : mode === 'idle' ? null : humanPilot;
const TANKS = new Set(['knight', 'pit', 'boar']);
const agg = {};
const row = (k) => (agg[k] ||= { n: 0, win: 0, idleWin: 0, len: 0, firstSpecial: 0, firstStorm: 0, kills20: 0, tankShare: 0, dpsDiedFirst: 0, deaths: 0 });
for (let r = 0; r < runs; r++) {
  const save = SB.newSave();
  const rng = SB.makeRng(77 + r);
  for (let k = 0; k < 8; k++) {
    const label = `${k + 1}. ${SB.stageFor(save).label}`;
    const x = row(label);
    // idle player (presses nothing) on the same fight
    const idle = SB.createBattle(SB.battleConfig(save, r * 100 + k));
    SB.runBattle(idle, 200);
    if (idle.result === 'win') x.idleWin++;
    // active player
    const b = SB.createBattle(SB.battleConfig(save, r * 100 + k));
    let firstSpecial = null, firstStorm = null, firstDeath = null, tankDmg = 0, allDmg = 0;
    for (let i = 0; i < 200 * 60 && !b.result; i++) {
      if (firstSpecial == null && b.units.some((u) => u.team === 0 && u.special && u.charge >= 1)) firstSpecial = b.t;
      if (firstStorm == null && b.storm.meter >= 1) firstStorm = b.t;
      if (pilot) pilot(b); SB.step(b);
      for (const e of b.events) {
        if (e.type === 'hit' && e.team === 0) { const u = b.units.find((q) => q.uid === e.uid); if (u && !u.companion) { allDmg += e.amount; if (TANKS.has(u.id)) tankDmg += e.amount; } }
        if (e.type === 'death' && e.team === 0 && firstDeath == null && SB.FIGHTERS[e.id]) firstDeath = e.id;
        if (e.type === 'death' && e.team === 1 && b.t <= 20) x.kills20++;
      }
      b.events.length = 0;
    }
    x.n++; if (b.result === 'win') x.win++;
    x.len += b.t; x.firstSpecial += firstSpecial ?? b.t; x.firstStorm += firstStorm ?? b.t;
    if (allDmg) x.tankShare += tankDmg / allDmg;
    if (firstDeath) { x.deaths++; if (!TANKS.has(firstDeath)) x.dpsDiedFirst++; }
    const sum = SB.summarize(b);
    SB.applyResult(save, sum, rng);
    if (save.pendingReward) SB.chooseReward(save, 0);
  }
}
console.log('fight'.padEnd(34), 'win  idleWin  length  1stSpecial 1stStorm kills<20s  tankDmg%  dpsDiedFirst');
for (const [k, x] of Object.entries(agg)) {
  const p = (v) => `${Math.round((v / x.n) * 100)}%`.padStart(4);
  console.log(k.padEnd(34), p(x.win), '  ', p(x.idleWin), '  ', `${(x.len / x.n).toFixed(0)}s`.padStart(4), '    ', `${(x.firstSpecial / x.n).toFixed(1)}s`.padStart(5), '   ',
    `${(x.firstStorm / x.n).toFixed(1)}s`.padStart(5), '   ', (x.kills20 / x.n).toFixed(1).padStart(4), '    ', p(x.tankShare), '     ', x.deaths ? `${x.dpsDiedFirst}/${x.deaths}` : '-');
}
