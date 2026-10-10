// Measures each item's real impact: same squad, same stages, with vs without the item.
// Usage: node scrapbound/tools/items.mjs [battlesPerItem]
import '../js/data.js';
import '../js/sim.js';
import '../js/progress.js';
const SB = globalThis.SB;
const N = +(process.argv[2] || 30);
function trial(itemId, tactic = 'swarm') {
  let wins = 0, time = 0, hpLeft = 0;
  for (let i = 0; i < N; i++) {
    const save = SB.newSave();
    save.gs = 7 + (i % 3);
    for (const id of ['pit', 'chimp', 'boar']) save.fighters[id] = { level: 5, xp: 0 };
    save.fighters.knight.level = 5; save.fighters.goblin.level = 5;
    save.squad = [['knight', 'goblin', 'pit'], ['boar', 'goblin', 'chimp'], ['knight', 'chimp', 'pit']][i % 3];
    if (itemId) { save.items[itemId] = 0; save.equipped[SB.ITEMS[itemId].slot] = itemId; }
    save.consumables.tape = 0; save.pocket = null;
    const b = SB.createBattle(SB.battleConfig(save, 500 + i));
    b.tactic = tactic;
    SB.runBattle(b, 200, SB.autoPilot);
    if (b.result === 'win') { wins++; time += b.t; }
    const f = b.units.filter((u) => u.team === 0 && !u.companion);
    hpLeft += f.reduce((a, u) => a + Math.max(0, u.hp), 0) / f.reduce((a, u) => a + u.maxHp, 0);
  }
  return { win: wins / N, time: wins ? time / wins : 0, hp: hpLeft / N };
}
const base = trial(null);
const fmt = (r) => `win ${(r.win * 100).toFixed(0).padStart(3)}%  time ${r.time.toFixed(1).padStart(5)}s  hp left ${(r.hp * 100).toFixed(0).padStart(3)}%`;
console.log('(no item)'.padEnd(34), fmt(base));
const rows = Object.keys(SB.ITEMS).map((id) => [id, trial(id)]);
rows.sort((a, b) => (b[1].win - a[1].win) || (b[1].hp - a[1].hp));
for (const [id, r] of rows) {
  const it = SB.ITEMS[id];
  const score = (r.win - base.win) * 100 + (r.hp - base.hp) * 50 + (base.time - r.time) * 0.5;
  console.log(`${SB.RARITIES[it.rarity][0]} ${it.name}`.padEnd(34), fmt(r), `  impact ${score.toFixed(1)}`);
}
if (process.argv[3] === 'tactics') for (const t of SB.TACTICS) console.log('tactic', t, fmt(trial(null, t)));
