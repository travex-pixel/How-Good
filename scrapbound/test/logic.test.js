import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/data.js';
import '../js/sim.js';
import '../js/progress.js';

const SB = globalThis.SB;

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function battle(save, seed = 1) { return SB.createBattle(SB.battleConfig(save, seed)); }
function fighters(b) { return b.units.filter((u) => u.team === 0 && !u.companion); }
function enemies(b) { return b.units.filter((u) => u.team === 1); }

// ---------------------------------------------------------------- content sanity
test('content: 8 distinct fighters, each with a working special', () => {
  assert.equal(SB.FIGHTER_ORDER.length, 8);
  const sigs = new Set();
  for (const id of SB.FIGHTER_ORDER) {
    const f = SB.FIGHTERS[id];
    assert.ok(SB.SPECIALS[f.special], `${id} special exists`);
    sigs.add(`${f.ai}|${f.hp}|${f.range}|${f.special}`);
  }
  assert.equal(sigs.size, 8, 'no two fighters share stats + ai + special');
});

test('content: every item has a slot, rarity and real effect', () => {
  for (const [id, it] of Object.entries(SB.ITEMS)) {
    assert.ok(SB.SLOTS.includes(it.slot), id);
    assert.ok(it.rarity >= 0 && it.rarity <= 5, id);
    assert.ok(Object.keys(it.fx).length > 0, id);
  }
  for (let r = 0; r < 6; r++) assert.ok(Object.values(SB.ITEMS).some((i) => i.rarity === r), `rarity ${r} has items`);
});

// ---------------------------------------------------------------- starting & combat
test('new game: starts at stage 1-1 with two fighters', () => {
  const s = SB.newSave();
  const b = battle(s);
  assert.equal(SB.stageFor(s).label, 'Rustbucket Yard 1-1');
  assert.equal(fighters(b).length, 2);
  assert.ok(enemies(b).length >= 5);
  assert.equal(b.result, null);
});

test('combat: a battle can be won with decent play', () => {
  const b = battle(SB.newSave(), 3);
  assert.equal(SB.runBattle(b, 200, SB.autoPilot), 'win');
  assert.ok(enemies(b).every((u) => !u.alive));
  assert.ok(b.t > 5 && b.t < 90, `battle lasted ${b.t}s`);
});

test('combat: a hopeless battle is lost and ends', () => {
  const s = SB.newSave();
  s.gs = 14; // level-1 squad vs final boss
  const b = battle(s, 4);
  assert.equal(SB.runBattle(b, 300), 'lose');
  assert.ok(fighters(b).every((u) => !u.alive));
});

test('combat: damage reduces health and kills at zero', () => {
  const b = battle(SB.newSave());
  const k = fighters(b)[0], e = enemies(b)[0];
  const hp = e.hp;
  SB.damage(b, k, e, 10, { noCrit: true });
  assert.equal(e.hp, hp - 10);
  SB.damage(b, k, e, 99999, { noCrit: true });
  assert.equal(e.alive, false);
  assert.equal(b.stats.kills, 1);
  assert.equal(SB.damage(b, k, e, 50), 0, 'dead units take no damage');
});

test('combat: units actually attack based on range and cooldown', () => {
  const b = battle(SB.newSave(), 9);
  for (let i = 0; i < 60 * 6; i++) SB.step(b);
  assert.ok(b.stats.dmg > 0, 'squad dealt damage');
  assert.ok(fighters(b).some((u) => u.hp < u.maxHp), 'enemies dealt damage');
});

test('specials: blocked until charged, then fire and reset charge', () => {
  const b = battle(SB.newSave());
  const k = fighters(b).find((u) => u.id === 'goblin');
  k.charge = 0.5;
  assert.equal(SB.useSpecial(b, k.uid), false);
  k.charge = 1;
  assert.equal(SB.useSpecial(b, k.uid), true);
  assert.equal(k.charge, 0);
  assert.equal(SB.useSpecial(b, k.uid), false, 'cooldown resets');
  assert.ok(b.projectiles.some((p) => p.kind === 'barrel'));
});

test('specials: every fighter special works in a real battle', () => {
  for (const id of SB.FIGHTER_ORDER) {
    const s = SB.newSave();
    s.fighters[id] = { level: 3, xp: 0 };
    s.squad = [id];
    const b = battle(s, 7);
    for (let i = 0; i < 30; i++) SB.step(b);
    const u = fighters(b)[0];
    u.charge = 1;
    assert.equal(SB.useSpecial(b, u.uid), true, `${id} special fired`);
    const before = enemies(b).reduce((a, e) => a + e.hp, 0);
    for (let i = 0; i < 90; i++) SB.step(b);
    const after = enemies(b).reduce((a, e) => a + (e.alive ? e.hp : 0), 0);
    if (id === 'pit') assert.ok(enemies(b).every((e) => !e.alive || e.tauntBy === u.uid), 'iron hug taunts everyone');
    else if (id !== 'hound') assert.ok(after < before, `${id} special hurt enemies`);
  }
});

test('storm: needs full meter, pulls props and enemies, then blasts', () => {
  const b = battle(SB.newSave(), 5);
  assert.equal(SB.triggerStorm(b), false);
  b.storm.meter = 1;
  const hpBefore = enemies(b).reduce((a, e) => a + e.hp, 0);
  assert.equal(SB.triggerStorm(b), true);
  assert.equal(b.storm.state, 'pull');
  assert.equal(SB.triggerStorm(b), false, 'cannot double-trigger');
  for (let i = 0; i < 60 * 3; i++) SB.step(b);
  assert.equal(b.storm.state, 'idle');
  const hpAfter = enemies(b).reduce((a, e) => a + (e.alive ? e.hp : 0), 0);
  assert.ok(hpAfter < hpBefore * 0.85, 'storm did serious damage');
});

test('tactic cycles through three modes', () => {
  const b = battle(SB.newSave());
  assert.deepEqual([SB.cycleTactic(b), SB.cycleTactic(b), SB.cycleTactic(b)], ['snipe', 'big', 'swarm']);
});

test('consumables: duct tape heals, count decreases, cooldown blocks spam', () => {
  const s = SB.newSave();
  const b = battle(s);
  const k = fighters(b)[0];
  k.hp = 10;
  assert.equal(SB.useConsumable(b), true);
  assert.ok(k.hp > 10);
  assert.equal(SB.useConsumable(b), false, 'out of stock (started with 1)');
  assert.equal(b.consumable.used, 1);
});

test('hazards: crusher slams units standing under it', () => {
  const b = battle(SB.newSave());
  const h = b.hazards.find((x) => x.kind === 'crusher');
  const e = enemies(b)[0];
  h.t = 0;
  SB.step(b); // -> warn
  e.x = h.x; e.y = h.y; e.st.root = 9; // pin the rat under the crusher
  const hp = e.hp;
  for (let i = 0; i < 120 && h.state !== 'slam'; i++) { e.x = h.x; e.y = h.y; SB.step(b); }
  assert.ok(!e.alive || e.hp < hp);
});

test('cliff arena: knocking a hurt enemy off the edge kills it', () => {
  const s = SB.newSave(); s.gs = 10;
  const b = battle(s);
  const e = enemies(b).find((u) => !u.boss);
  e.x = 20; e.vx = -600;
  SB.step(b);
  assert.equal(e.alive, false);
  assert.equal(b.stats.yeets, 1);
});

test('items change combat behaviour, not just numbers', () => {
  const s = SB.newSave();
  s.items.fork = 0; s.equipped.weapon = 'fork';
  const b = battle(s, 2);
  const k = fighters(b)[0];
  const [e1, e2] = enemies(b);
  e2.x = e1.x + 40; e2.y = e1.y;
  const hp2 = e2.hp;
  b.events.length = 0;
  k.x = e1.x - 50; k.y = e1.y; k.atkT = 0;
  for (let i = 0; i < 120 && e2.hp === hp2; i++) SB.step(b);
  assert.ok(e2.hp < hp2, 'fork ricochet hit the second enemy');
});

test('plot armour saves a fighter once', () => {
  const s = SB.newSave(); s.items.plotArmor = 0; s.equipped.armor = 'plotArmor';
  const b = battle(s);
  const k = fighters(b)[0];
  SB.damage(b, null, k, 99999, { noCrit: true });
  assert.equal(k.alive, true); assert.equal(k.hp, 1);
  k.st.invuln = 0;
  SB.damage(b, null, k, 99999, { noCrit: true });
  assert.equal(k.alive, false);
});

test('synergies activate from the right combos', () => {
  const syn = SB.activeSynergies(['fork', 'ratFoot'], ['boar', 'goblin']).map((x) => x.id).sort();
  assert.deepEqual(syn, ['boarbq', 'forkLightning']);
  assert.equal(SB.activeSynergies(['fork'], ['knight']).length, 0);
});

test('simultaneous events: many deaths in one explosion resolve cleanly', () => {
  const s = SB.newSave(); s.gs = 3;
  const b = battle(s);
  for (const e of enemies(b)) { e.x = 400; e.y = 300; e.hp = 1; }
  b.storm.meter = 1;
  SB.triggerStorm(b);
  for (let i = 0; i < 60 * 4 && !b.wave.sent; i++) SB.step(b);
  assert.ok(b.wave.sent, 'reinforcement wave arrives once the first wave falls');
  const reinforcements = enemies(b).filter((e) => e.alive);
  assert.ok(reinforcements.length >= 3);
  for (const e of reinforcements) SB.damage(b, null, e, 1e9, { noCrit: true });
  for (let i = 0; i < 60 * 3 && !b.result; i++) SB.step(b);
  assert.equal(b.result, 'win');
  assert.equal(b.stats.kills, enemies(b).length);
});

test('elites get a modifier, and golden elites pay out scrap', () => {
  const s = SB.newSave(); s.gs = 12;
  const b = battle(s, 3);
  const elites = enemies(b).filter((e) => e.elite);
  assert.equal(elites.length, 2);
  for (const e of elites) assert.match(e.name, /^(HUGE|SPEEDY|EXPLOSIVE|SHIELDED|GOLDEN) /);
  const g = elites[0]; g.elite = 'golden';
  SB.damage(b, null, g, 1e9, { noCrit: true });
  assert.equal(b.bonusScrap, 40);
});

test('tactics give real bonuses: Weakest executes, Biggest hits bosses harder', () => {
  const s = SB.newSave(); s.gs = 4;
  const b = battle(s, 3);
  const k = fighters(b)[0], boss = enemies(b).find((e) => e.boss);
  b.tactic = 'swarm'; const h0 = boss.hp; SB.damage(b, k, boss, 100, { noCrit: true }); const plain = h0 - boss.hp;
  b.tactic = 'big'; const h1 = boss.hp; SB.damage(b, k, boss, 100, { noCrit: true });
  assert.ok(h1 - boss.hp > plain, 'biggest bonus');
  const rat = enemies(b).find((e) => !e.boss); rat.hp = rat.maxHp * 0.2;
  b.tactic = 'snipe'; const h2 = rat.hp; SB.damage(b, k, rat, 5, { noCrit: true });
  assert.ok(h2 - rat.hp > 5, 'execute bonus');
});

test('kaboomerang cutlass crits explode', () => {
  const s = SB.newSave(); s.items.cutlass = 0; s.equipped.weapon = 'cutlass';
  const b = battle(s, 3);
  b.mods.crit = 1; // force crits
  const k = fighters(b)[0], e = enemies(b)[0];
  k.x = e.x; k.y = e.y + 50; k.atkT = 0; k.target = e;
  b.events.length = 0;
  for (let i = 0; i < 90 && !b.events.some((x) => x.type === 'explode'); i++) SB.step(b);
  assert.ok(b.events.some((x) => x.type === 'explode'), 'crit caused an explosion');
});

test('repeated battles are stable and deterministic per seed', () => {
  const s = SB.newSave();
  const r1 = battle(s, 42); SB.runBattle(r1, 200, SB.autoPilot);
  const r2 = battle(s, 42); SB.runBattle(r2, 200, SB.autoPilot);
  assert.equal(r1.t, r2.t);
  assert.equal(r1.stats.dmg, r2.stats.dmg);
  for (let i = 0; i < 25; i++) {
    const b = battle(s, 100 + i);
    const res = SB.runBattle(b, 200, SB.autoPilot);
    assert.ok(res === 'win' || res === 'lose');
    for (const u of b.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp), 'no NaN state');
  }
});

// ---------------------------------------------------------------- progression
test('victory: grants scrap, xp, advances stage, unlocks Grunthilda', () => {
  const s = SB.newSave();
  const b = battle(s, 3); SB.runBattle(b, 200, SB.autoPilot);
  const rep = SB.applyResult(s, SB.summarize(b), SB.makeRng(1));
  assert.equal(rep.result, 'win');
  assert.ok(rep.scrap > 0 && s.scrap === rep.scrap);
  assert.equal(s.gs, 1);
  assert.deepEqual(rep.unlocks, ['pit']);
  assert.deepEqual(s.squad, ['knight', 'goblin', 'pit']);
  assert.equal(rep.choices.length, 3);
});

test('defeat: small consolation, stage does not advance', () => {
  const s = SB.newSave(); s.gs = 2;
  const rep = SB.applyResult(s, { result: 'lose', kills: 2, consumableUsed: 0 }, SB.makeRng(1));
  assert.equal(s.gs, 2);
  assert.ok(rep.scrap > 0);
  assert.equal(rep.choices.length, 0);
  assert.equal(s.losses, 1);
});

test('rewards: choosing an item equips it and auto-sells the rest', () => {
  const s = SB.newSave();
  s.pendingReward = { choices: [{ type: 'item', id: 'fork' }, { type: 'item', id: 'saucepan' }, { type: 'scrap', amount: 50 }] };
  const r = SB.chooseReward(s, 0);
  assert.ok(r.ok);
  assert.equal(s.equipped.weapon, 'fork');
  assert.equal(s.sold, 1);
  assert.ok(s.scrap > 0);
  assert.equal(s.pendingReward, null);
  assert.equal(SB.chooseReward(s, 0).ok, false, 'cannot claim twice');
});

test('rewards: duplicate item adds a star', () => {
  const s = SB.newSave(); s.items.fork = 0;
  s.pendingReward = { choices: [{ type: 'item', id: 'fork' }] };
  SB.chooseReward(s, 0);
  assert.equal(s.items.fork, 1);
});

test('legendary loot unlocks Morgana', () => {
  const s = SB.newSave();
  s.pendingReward = { choices: [{ type: 'item', id: 'plotArmor' }] };
  const r = SB.chooseReward(s, 0);
  assert.deepEqual(r.unlocks, ['cursed']);
  assert.ok(s.fighters.cursed);
});

test('equip / unequip / invalid equip', () => {
  const s = SB.newSave();
  assert.equal(SB.equip(s, 'fork').ok, false, 'not owned');
  assert.equal(SB.equip(s, 'nonsense').ok, false);
  s.items.fork = 0;
  assert.equal(SB.equip(s, 'fork').ok, true);
  assert.equal(s.equipped.weapon, 'fork');
  assert.equal(SB.unequip(s, 'weapon').ok, true);
  assert.equal(s.equipped.weapon, null);
  assert.equal(SB.unequip(s, 'weapon').ok, false);
  assert.equal(SB.unequip(s, 'hat').ok, false);
});

test('equipment affects the next battle', () => {
  const s = SB.newSave();
  const base = fighters(battle(s))[0].maxHp;
  s.items.saucepan = 0; SB.equip(s, 'saucepan');
  assert.ok(fighters(battle(s))[0].maxHp > base);
});

test('selling: gives scrap, removes item, unequips it', () => {
  const s = SB.newSave(); s.items.fork = 0; SB.equip(s, 'fork');
  const r = SB.sellItem(s, 'fork');
  assert.ok(r.ok && r.value > 0);
  assert.equal(s.items.fork, undefined);
  assert.equal(s.equipped.weapon, null);
  assert.equal(SB.sellItem(s, 'fork').ok, false);
});

test('squad: toggle, full squad and minimum one', () => {
  const s = SB.newSave();
  assert.equal(SB.toggleSquad(s, 'boar').ok, false, 'locked fighter');
  assert.equal(SB.toggleSquad(s, 'goblin').ok, true);
  assert.equal(SB.toggleSquad(s, 'knight').ok, false, 'need one');
  SB.unlockFighter(s, 'pit'); SB.unlockFighter(s, 'chimp'); // unlocks auto-join when there's room
  assert.deepEqual(s.squad, ['knight', 'pit', 'chimp']);
  const full = SB.toggleSquad(s, 'goblin');
  assert.equal(full.ok, false); assert.match(full.msg, /full/);
  assert.equal(SB.toggleSquad(s, 'chimp').ok, true);
  assert.equal(SB.toggleSquad(s, 'goblin').ok, true);
  assert.deepEqual(s.squad, ['knight', 'pit', 'goblin']);
});

test('heap: invalid purchase rejected, valid purchase upgrades', () => {
  const s = SB.newSave();
  const r = SB.buyHeap(s);
  assert.equal(r.ok, false);
  assert.match(r.msg, /more scrap/);
  s.scrap = 100;
  assert.equal(SB.buyHeap(s).ok, true);
  assert.equal(s.heap, 1); assert.equal(s.scrap, 20);
  s.heap = 5; s.scrap = 1e6;
  assert.equal(SB.buyHeap(s).ok, false);
});

test('level ups from xp', () => {
  const s = SB.newSave();
  const rep = SB.applyResult(s, { result: 'win', kills: 5 }, SB.makeRng(2));
  assert.ok(rep.levelUps.length >= 1);
  assert.equal(s.fighters.knight.level, 2);
});

test('secret Larry encounter appears after clearing 1-3 and pays out', () => {
  const s = SB.newSave(); s.gs = 2; s.wins = 3;
  SB.applyResult(s, { result: 'win', kills: 5 }, SB.makeRng(2));
  assert.equal(s.pendingSecret, true);
  assert.equal(SB.stageFor(s).secret, true);
  s.pendingReward = null;
  const rep = SB.applyResult(s, { result: 'win', kills: 4, larryCaught: true }, SB.makeRng(3));
  assert.equal(s.gs, 3, 'secret stage does not advance the campaign');
  assert.ok(rep.choices.every((c) => SB.ITEMS[c.id].rarity >= 3));
});

test('riot mode after the campaign', () => {
  const s = SB.newSave(); s.gs = 15;
  const st = SB.stageFor(s);
  assert.equal(st.riot, 1);
  const b = battle(s);
  assert.ok(enemies(b).length >= 7);
});

// ---------------------------------------------------------------- saving
test('save + load round trip (simulates browser refresh)', () => {
  const st = memStorage();
  const s = SB.newSave();
  s.scrap = 123; s.gs = 4; s.items.fork = 2; s.equipped.weapon = 'fork'; SB.unlockFighter(s, 'pit');
  SB.writeSave(st, s);
  const l = SB.loadSave(st);
  assert.equal(l.scrap, 123); assert.equal(l.gs, 4); assert.equal(l.items.fork, 2);
  assert.equal(l.equipped.weapon, 'fork'); assert.ok(l.fighters.pit);
});

test('corrupt or tampered saves load safely', () => {
  const st = memStorage();
  st.setItem(SB.SAVE_KEY, '{not json');
  assert.equal(SB.loadSave(st).gs, 0);
  st.setItem(SB.SAVE_KEY, JSON.stringify({ gs: -5, scrap: 'lots', squad: ['dragon', 'knight', 'knight'], items: { fake: 1, fork: 99 }, equipped: { weapon: 'saucepan', armor: 'fake' }, fighters: { knight: { level: 500 } } }));
  const s = SB.loadSave(st);
  assert.equal(s.gs, 0); assert.equal(s.scrap, 0);
  assert.deepEqual(s.squad, ['knight']);
  assert.equal(s.items.fork, 5); assert.equal(s.items.fake, undefined);
  assert.equal(s.equipped.weapon, null, 'saucepan is not a weapon');
  assert.equal(s.fighters.knight.level, SB.MAX_LEVEL);
  assert.equal(SB.loadSave({ getItem() { throw new Error('blocked'); } }).gs, 0, 'storage throwing');
});

test('reset wipes progress but keeps settings', () => {
  const st = memStorage();
  const s = SB.newSave(); s.scrap = 999; s.settings.mute = true;
  SB.writeSave(st, s);
  const r = SB.resetSave(st);
  assert.equal(r.scrap, 0);
  assert.equal(r.settings.mute, true);
  assert.equal(SB.loadSave(st).scrap, 0);
});

test('pending reward survives a refresh', () => {
  const st = memStorage();
  const s = SB.newSave();
  SB.applyResult(s, { result: 'win', kills: 5 }, SB.makeRng(1));
  SB.writeSave(st, s);
  const l = SB.loadSave(st);
  assert.equal(l.pendingReward.choices.length, 3);
  assert.ok(SB.chooseReward(l, 1).ok);
});

// ---------------------------------------------------------------- tanks & "one more fight" hooks
test('tanks: armour reduces damage, and they guard nearby allies', () => {
  const b = battle(SB.newSave(), 3);
  const knight = fighters(b).find((u) => u.id === 'knight'), gob = fighters(b).find((u) => u.id === 'goblin');
  gob.x = knight.x + 40; gob.y = knight.y;
  const kh = knight.hp, gh = gob.hp;
  SB.damage(b, null, gob, 100, { noCrit: true });
  assert.equal(gh - gob.hp, 50, 'goblin only takes half');
  assert.ok(kh - knight.hp > 0 && kh - knight.hp < 50, 'knight soaks the rest, reduced by armour');
  gob.x = knight.x + 400;
  const gh2 = gob.hp;
  SB.damage(b, null, gob, 40, { noCrit: true });
  assert.equal(gh2 - gob.hp, 40, 'no guard when the tank is far away');
});

test('tanks: enemies near a tank get locked onto it', () => {
  const b = battle(SB.newSave(), 3);
  const knight = fighters(b).find((u) => u.id === 'knight'), gob = fighters(b).find((u) => u.id === 'goblin');
  const rat = enemies(b).find((e) => e.id === 'rat');
  rat.x = gob.x; rat.y = gob.y - 30; // right next to the goblin...
  knight.x = rat.x + 60; knight.y = rat.y; // ...but the knight is in its face
  rat.retarget = 0; rat.target = null;
  SB.step(b);
  assert.equal(rat.target.id, 'knight');
});

test('tanks take most of the damage in early fights', () => {
  let tankDmg = 0, all = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = SB.newSave(); s.gs = 3; s.wins = 3; SB.unlockFighter(s, 'pit');
    const b = battle(s, seed);
    for (let i = 0; i < 60 * 40 && !b.result; i++) {
      SB.step(b);
      for (const e of b.events) if (e.type === 'hit' && e.team === 0) { const u = b.units.find((q) => q.uid === e.uid); all += e.amount; if (u && u.def.armor) tankDmg += e.amount; }
      b.events.length = 0;
    }
  }
  assert.ok(tankDmg / all > 0.7, `tanks took ${Math.round((tankDmg / all) * 100)}%`);
});

test('first fight is a power fantasy: storm and specials come fast', () => {
  const b = battle(SB.newSave(), 1);
  let special = null, storm = null;
  for (let i = 0; i < 60 * 12; i++) {
    if (special == null && fighters(b).some((u) => u.charge >= 1)) special = b.t;
    if (storm == null && b.storm.meter >= 1) storm = b.t;
    SB.step(b);
  }
  assert.ok(special < 3, `first special at ${special}s`);
  assert.ok(storm < 8, `first storm at ${storm}s`);
});

test('first loot offer is exciting (rares)', () => {
  const s = SB.newSave();
  const rep = SB.applyResult(s, { result: 'win', kills: 5 }, SB.makeRng(1));
  assert.deepEqual(rep.choices.map((c) => c.id), ['fork', 'hammer', 'beeBag']);
});

test('win streak grows scrap and resets on defeat', () => {
  const s = SB.newSave(); s.wins = 5; s.gs = 6;
  const r1 = SB.applyResult(s, { result: 'win', kills: 0 }, SB.makeRng(1)); s.pendingReward = null;
  const r2 = SB.applyResult(s, { result: 'win', kills: 0 }, SB.makeRng(1)); s.pendingReward = null;
  assert.equal(s.streak, 2);
  assert.equal(r2.streakBonus, 10);
  assert.ok(r2.scrap > r1.scrap);
  const r3 = SB.applyResult(s, { result: 'lose', kills: 0, enemyHpLeft: 0.12 }, SB.makeRng(1));
  assert.equal(r3.streakLost, 2);
  assert.equal(s.streak, 0);
  assert.equal(r3.soClose, 0.12, 'near-miss reported');
});

test('jackpot: fills per win, pays Epic+ loot at 5, keeps progress on defeat', () => {
  const s = SB.newSave(); s.wins = 5; s.gs = 10; // no boss stages until the last win
  for (let i = 0; i < 3; i++) { SB.applyResult(s, { result: 'win', kills: 0 }, SB.makeRng(i)); s.pendingReward = null; }
  assert.equal(s.jackpot, 3);
  SB.applyResult(s, { result: 'lose', kills: 0 }, SB.makeRng(1));
  assert.equal(s.jackpot, 3, 'defeat does not reset the jackpot');
  SB.applyResult(s, { result: 'win', kills: 0 }, SB.makeRng(1)); s.pendingReward = null;
  const r = SB.applyResult(s, { result: 'win', kills: 0 }, SB.makeRng(2));
  assert.equal(r.jackpot, true);
  assert.equal(s.jackpot, 0);
  assert.ok(r.choices.length === 3 && r.choices.every((c) => SB.ITEMS[c.id].rarity >= 3));
});

test('next goals always show something to chase', () => {
  const s = SB.newSave();
  const g = SB.nextGoals(s);
  assert.ok(g.find((x) => x.kind === 'jackpot'));
  assert.equal(g.find((x) => x.kind === 'fighter').wins, 1, 'Grunthilda in 1 win');
  assert.equal(g.find((x) => x.kind === 'boss').wins, 4);
});

test('streak and jackpot survive save/load and bad values are clamped', () => {
  const st = memStorage();
  const s = SB.newSave(); s.streak = 4; s.jackpot = 3; s.bestStreak = 9;
  SB.writeSave(st, s);
  const l = SB.loadSave(st);
  assert.equal(l.streak, 4); assert.equal(l.jackpot, 3); assert.equal(l.bestStreak, 9);
  assert.equal(SB.sanitize({ jackpot: 99 }).jackpot, SB.JACKPOT_SIZE - 1);
});
