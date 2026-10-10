// Plays the campaign headlessly with an auto-pilot and reports difficulty per stage.
// Usage: node scrapbound/tools/balance.mjs [runs] [pilot: auto|idle]
import '../js/data.js';
import '../js/sim.js';
import '../js/progress.js';
const SB = globalThis.SB;
const runs = +(process.argv[2] || 5);
const pilotMode = process.argv[3] || 'auto';
const rows = {};
let totalTime = 0, totalBattles = 0;
for (let r = 0; r < runs; r++) {
  const save = SB.newSave();
  const rng = SB.makeRng(r + 1);
  let guard = 0;
  while (save.gs < SB.STAGE_COUNT + 3 && guard++ < 80) {
    const cfg = SB.battleConfig(save, r * 1000 + guard);
    const label = cfg.stage.label;
    const b = SB.createBattle(cfg);
    SB.runBattle(b, 200, pilotMode === 'auto' ? SB.autoPilot : null);
    const sum = SB.summarize(b);
    const row = (rows[label] ||= { win: 0, lose: 0, time: 0, n: 0 });
    row[sum.result === 'win' ? 'win' : 'lose']++; row.time += b.t; row.n++;
    totalTime += b.t; totalBattles++;
    SB.applyResult(save, sum, rng);
    if (save.pendingReward) {
      // pick the highest-rarity item card, like a loot goblin would
      const ch = save.pendingReward.choices;
      let best = 0; ch.forEach((c, i) => { if (c.type === 'item' && (ch[best].type !== 'item' || SB.ITEMS[c.id].rarity > SB.ITEMS[ch[best].id].rarity)) best = i; });
      SB.chooseReward(save, best);
    }
    if (save.heap < 5 && SB.heapCost(save) <= save.scrap) SB.buyHeap(save);
  }
}
for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(40), `win ${v.win} lose ${v.lose}`.padEnd(16), `avg ${(v.time / v.n).toFixed(1)}s`);
console.log(`battles ${totalBattles}, total sim time ${(totalTime / runs / 60).toFixed(1)} min per run`);
