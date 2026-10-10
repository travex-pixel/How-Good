// SCRAPBOUND progression: save data, rewards, loot, equipment, unlocks.
// Pure functions over a plain save object. Storage is injected for testing.
(function () {
  const SB = (globalThis.SB = globalThis.SB || {});
  const SAVE_KEY = 'scrapbound.save.v1';
  SB.SAVE_KEY = SAVE_KEY;
  const SLOTS = ['weapon', 'armor', 'trinket'];
  SB.SLOTS = SLOTS;
  SB.SLOT_LABELS = { weapon: 'Weapon', armor: 'Armour', trinket: 'Trinket' };

  SB.newSave = function () {
    return {
      v: 1, gs: 0, cleared: 0, scrap: 0,
      fighters: { knight: { level: 1, xp: 0 }, goblin: { level: 1, xp: 0 } },
      squad: ['knight', 'goblin'],
      items: {}, equipped: { weapon: null, armor: null, trinket: null },
      consumables: { tape: 1, beeJar: 0, pie: 0 }, pocket: 'tape',
      heap: 0, sold: 0, found: [], larrySeen: false, larryCaught: 0, pendingSecret: false,
      pendingReward: null, battles: 0, wins: 0, losses: 0, bestRiot: 0, streak: 0, bestStreak: 0, jackpot: 0,
      settings: { mute: false, music: true, reducedMotion: false, fast: false },
    };
  };

  const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);

  // Turns anything (corrupt JSON, old versions, tampered data) into a valid save.
  SB.sanitize = function (raw) {
    const s = SB.newSave();
    if (!raw || typeof raw !== 'object') return s;
    s.gs = num(raw.gs, 0, 0, 9999);
    s.cleared = num(raw.cleared, 0, 0, 9999);
    s.scrap = num(raw.scrap, 0, 0, 1e9);
    s.heap = num(raw.heap, 0, 0, SB.HEAP_COSTS.length);
    s.sold = num(raw.sold, 0, 0, 1e6);
    s.battles = num(raw.battles, 0, 0, 1e7);
    s.wins = num(raw.wins, 0, 0, 1e7);
    s.losses = num(raw.losses, 0, 0, 1e7);
    s.bestRiot = num(raw.bestRiot, 0, 0, 1e6);
    s.streak = num(raw.streak, 0, 0, 1e6);
    s.bestStreak = num(raw.bestStreak, 0, 0, 1e6);
    s.jackpot = num(raw.jackpot, 0, 0, SB.JACKPOT_SIZE - 1);
    s.larryCaught = num(raw.larryCaught, 0, 0, 1e6);
    s.larrySeen = !!raw.larrySeen;
    s.pendingSecret = !!raw.pendingSecret;
    if (raw.fighters && typeof raw.fighters === 'object') {
      for (const id of Object.keys(raw.fighters)) {
        if (!SB.FIGHTERS[id]) continue;
        const f = raw.fighters[id] || {};
        s.fighters[id] = { level: num(f.level, 1, 1, SB.MAX_LEVEL), xp: num(f.xp, 0, 0, 1e6) };
      }
    }
    if (Array.isArray(raw.squad)) {
      const sq = [...new Set(raw.squad.filter((id) => s.fighters[id]))].slice(0, SB.MAX_SQUAD);
      if (sq.length) s.squad = sq;
    }
    if (raw.items && typeof raw.items === 'object') {
      for (const id of Object.keys(raw.items)) if (SB.ITEMS[id]) s.items[id] = num(raw.items[id], 0, 0, 5);
    }
    if (raw.equipped && typeof raw.equipped === 'object') {
      for (const slot of SLOTS) {
        const id = raw.equipped[slot];
        if (id && s.items[id] != null && SB.ITEMS[id].slot === slot) s.equipped[slot] = id;
      }
    }
    if (raw.consumables && typeof raw.consumables === 'object') {
      for (const id of Object.keys(SB.CONSUMABLES)) s.consumables[id] = num(raw.consumables[id], 0, 0, 99);
    }
    s.pocket = SB.CONSUMABLES[raw.pocket] ? raw.pocket : null;
    if (Array.isArray(raw.found)) s.found = [...new Set(raw.found.filter((id) => SB.ITEMS[id]))];
    for (const id of Object.keys(s.items)) if (!s.found.includes(id)) s.found.push(id);
    if (raw.pendingReward && Array.isArray(raw.pendingReward.choices)) {
      const choices = raw.pendingReward.choices.filter(validCard);
      if (choices.length) s.pendingReward = { choices };
    }
    if (raw.settings && typeof raw.settings === 'object') {
      for (const k of Object.keys(s.settings)) if (typeof raw.settings[k] === 'boolean') s.settings[k] = raw.settings[k];
    }
    return s;
  };

  function validCard(c) {
    if (!c || typeof c !== 'object') return false;
    if (c.type === 'item') return !!SB.ITEMS[c.id];
    if (c.type === 'consumable') return !!SB.CONSUMABLES[c.id] && c.count > 0 && c.count < 10;
    if (c.type === 'scrap') return c.amount > 0 && c.amount < 1e5;
    if (c.type === 'train') return true;
    return false;
  }

  SB.loadSave = function (storage) {
    try {
      const txt = storage && storage.getItem(SAVE_KEY);
      if (!txt) return SB.newSave();
      return SB.sanitize(JSON.parse(txt));
    } catch (e) {
      return SB.newSave();
    }
  };
  SB.writeSave = function (storage, save) {
    try { storage && storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
  };
  SB.resetSave = function (storage) {
    const settings = SB.loadSave(storage).settings;
    try { storage && storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    const s = SB.newSave();
    s.settings = settings; // keep sound/motion preferences
    SB.writeSave(storage, s);
    return s;
  };

  // ------------------------------------------------------------ stages
  SB.stageFor = function (save) {
    const gs = save.gs;
    if (save.pendingSecret) {
      const a = Math.min(2, Math.floor(Math.min(gs, 14) / 5));
      return { gs: Math.min(gs, 14), arena: a, comp: { larry: 1, rat: 3 }, label: 'SECRET: Lootgoblin Larry!', secret: true, boss: false };
    }
    if (gs < SB.STAGE_COUNT) {
      const a = Math.floor(gs / 5), i = gs % 5;
      const ex = SB.STAGE_EXTRAS[gs] || {};
      return { gs, arena: a, comp: SB.STAGES[a][i], wave: ex.wave, elites: ex.elites || 0, label: `${SB.ARENAS[a].name} ${a + 1}-${i + 1}`, boss: i === 4, idx: i };
    }
    // Riot Mode: endless remixes after the campaign.
    const n = gs - SB.STAGE_COUNT;
    const rng = SB.makeRng(1000 + n * 7919);
    const a = n % 3;
    const comp = {};
    const pool = ['rat', 'gremlin', 'golem', 'beetle', 'shaman', 'squire'];
    const size = 7 + Math.min(8, Math.floor(n / 2));
    for (let i = 0; i < size; i++) { const id = pool[Math.floor(rng() * pool.length)]; comp[id] = (comp[id] || 0) + 1; }
    const boss = n % 5 === 4;
    if (boss) comp[['kingRust', 'wyrm', 'archmagnet'][Math.floor(n / 5) % 3]] = 1;
    const wave = { [pool[Math.floor(rng() * pool.length)]]: 2 + Math.min(4, Math.floor(n / 3)) };
    return { gs: 14, arena: a, comp, wave, elites: 1 + Math.min(3, Math.floor(n / 4)), label: `RIOT MODE #${n + 1}`, riot: n + 1, boss, hpMul: 1 + 0.1 * n, dmgMul: 1 + 0.05 * n };
  };

  SB.battleConfig = function (save, seed) {
    let stage = SB.stageFor(save);
    // The very first fight is forgiving: a new player should win it even before they find the buttons.
    if (save.wins === 0 && stage.gs === 0 && !stage.secret) stage = { ...stage, comp: { rat: 7, gremlin: 2 }, dmgMul: 0.5 };
    const pocket = save.pocket && save.consumables[save.pocket] > 0 ? { id: save.pocket, count: save.consumables[save.pocket] } : null;
    return {
      squad: save.squad.map((id) => ({ id, level: save.fighters[id].level })),
      items: { ...save.equipped }, stars: { ...save.items }, sold: save.sold, heap: save.heap,
      consumable: pocket, stage, seed, tutorial: save.wins === 0,
    };
  };

  // ------------------------------------------------------------ loot
  SB.xpToNext = (level) => 50 + 35 * (level - 1);
  SB.sellValue = (id, stars = 0) => [12, 25, 45, 90, 160, 300][SB.ITEMS[id].rarity] * (1 + stars * 0.5);

  SB.JACKPOT_SIZE = 5;
  SB.streakLuck = (streak) => Math.min(10, Math.max(0, streak - 1)) * 0.8;
  SB.rarityWeights = function (gs, heap, minRarity = 0, luck = 0) {
    const g = Math.min(gs, 20) + heap * 1.5 + luck;
    const w = [60 - g * 2.5, 30, 12 + g * 1.2, 4 + g * 0.8, 0.8 + g * 0.35, 0.15 + g * 0.12].map((x) => Math.max(0, x));
    for (let i = 0; i < minRarity; i++) w[i] = 0;
    return w;
  };

  SB.rollItems = function (save, rng, count, minRarity = 0) {
    const w = SB.rarityWeights(save.gs, save.heap, minRarity, SB.streakLuck(save.streak));
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 200) {
      const total = w.reduce((a, x) => a + x, 0);
      let r = rng() * total, rar = 0;
      for (; rar < w.length; rar++) { r -= w[rar]; if (r <= 0) break; }
      rar = Math.min(rar, 5);
      const pool = Object.keys(SB.ITEMS).filter((id) => SB.ITEMS[id].rarity === rar && !out.includes(id) && (save.items[id] || 0) < 5);
      if (!pool.length) continue;
      // Prefer things you don't own yet: discovery is the fun part.
      const fresh = pool.filter((id) => save.items[id] == null);
      const src = fresh.length && rng() < 0.75 ? fresh : pool;
      out.push(src[Math.floor(rng() * src.length)]);
    }
    return out;
  };

  function itemCard(save, id) { return { type: 'item', id, dup: save.items[id] != null }; }

  // Apply a finished battle to the save. Returns a report for the reward screen.
  SB.applyResult = function (save, summary, rng = Math.random) {
    const stage = SB.stageFor(save);
    const report = { result: summary.result, stage, scrap: 0, xp: 0, levelUps: [], unlocks: [], choices: [], notes: [] };
    save.battles++;
    if (summary.consumableId && summary.consumableUsed) {
      save.consumables[summary.consumableId] = Math.max(0, (save.consumables[summary.consumableId] || 0) - summary.consumableUsed);
    }
    const win = summary.result === 'win';
    const g = stage.riot ? 15 + stage.riot : stage.gs;
    if (win) {
      save.wins++;
      save.streak++;
      save.bestStreak = Math.max(save.bestStreak, save.streak);
      report.streak = save.streak;
      report.streakBonus = Math.min(10, save.streak - 1) * 10; // % extra scrap
      report.scrap = Math.round((25 + 6 * g + 2 * summary.kills + (summary.bonusScrap || 0)) * (1 + report.streakBonus / 100));
      save.jackpot += stage.boss ? 2 : 1;
      if (save.jackpot >= SB.JACKPOT_SIZE) { save.jackpot = 0; report.jackpot = true; report.scrap += 80; }
      report.xp = Math.round((50 + 10 * g) * (stage.boss ? 1.5 : 1));
    } else {
      save.losses++;
      if (save.streak >= 2) report.streakLost = save.streak;
      save.streak = 0;
      if (summary.enemyHpLeft != null && summary.enemyHpLeft < 0.3) report.soClose = summary.enemyHpLeft;
      report.scrap = 8 + 2 * summary.kills;
      report.xp = Math.round((50 + 10 * g) * 0.4);
    }
    save.scrap += report.scrap;

    for (const id of save.squad) {
      const f = save.fighters[id];
      if (!f) continue;
      f.xp += report.xp;
      while (f.level < SB.MAX_LEVEL && f.xp >= SB.xpToNext(f.level)) {
        f.xp -= SB.xpToNext(f.level); f.level++;
        report.levelUps.push({ id, level: f.level });
      }
      if (f.level >= SB.MAX_LEVEL) f.xp = 0;
    }

    if (!win) {
      if (stage.secret) { save.pendingSecret = false; report.notes.push('Larry got away. He will be back. Probably.'); }
      return report;
    }

    if (stage.secret) {
      save.pendingSecret = false;
      if (summary.larryCaught) {
        save.larryCaught++;
        report.scrap += 100; save.scrap += 100;
        report.choices = SB.rollItems(save, rng, 3, 3).map((id) => itemCard(save, id));
        report.notes.push('You caught Larry! His loot sack is ALL epic or better.');
      } else {
        report.notes.push('Larry escaped... but dropped some scrap.');
        report.choices = SB.rollItems(save, rng, 2, 1).map((id) => itemCard(save, id));
      }
    } else {
      const clearedIdx = save.gs;
      save.gs++;
      save.cleared = Math.max(save.cleared, save.gs);
      if (stage.riot) save.bestRiot = Math.max(save.bestRiot, stage.riot);
      const unlock = SB.UNLOCKS[clearedIdx];
      if (unlock && !save.fighters[unlock]) unlockFighter(save, unlock, report);

      if (save.wins === 1) {
        // First win: hand out something exciting straight away.
        report.choices = ['fork', 'hammer', 'beeBag'].map((id) => itemCard(save, id));
      } else if (report.jackpot) {
        report.choices = SB.rollItems(save, rng, 3, 3).map((id) => itemCard(save, id));
        report.notes.push('JACKPOT! Every item in this chest is Epic or better.');
      } else {
        const ids = SB.rollItems(save, rng, stage.boss ? 3 : 2, stage.boss ? 2 : 0);
        report.choices = ids.map((id) => itemCard(save, id));
        if (!stage.boss) {
          const cons = Object.keys(SB.CONSUMABLES);
          const roll = rng();
          if (roll < 0.45) report.choices.push({ type: 'consumable', id: cons[Math.floor(rng() * cons.length)], count: 2 });
          else if (roll < 0.75) report.choices.push({ type: 'train' });
          else report.choices.push({ type: 'scrap', amount: 60 + 10 * g });
        }
      }
      // Secret encounter: guaranteed once early, then occasionally.
      if (!stage.boss && ((clearedIdx === 2 && !save.larrySeen) || (save.larrySeen && rng() < 0.1))) {
        save.pendingSecret = true; save.larrySeen = true;
        report.notes.push('A suspicious goblin with a big sack was spotted nearby...');
      }
      if (clearedIdx === SB.STAGE_COUNT - 1) report.notes.push('CAMPAIGN COMPLETE! Riot Mode unlocked: endless chaos.');
    }
    save.pendingReward = report.choices.length ? { choices: report.choices } : null;
    return report;
  };

  // What's coming next: shown on the reward screen and in camp so there's always a reason for one more fight.
  SB.nextGoals = function (save) {
    const goals = [{ kind: 'jackpot', label: 'Jackpot chest', cur: save.jackpot, max: SB.JACKPOT_SIZE }];
    const next = Object.keys(SB.UNLOCKS).map(Number).sort((a, b) => a - b).find((k) => k >= save.gs && !save.fighters[SB.UNLOCKS[k]]);
    if (next != null) goals.push({ kind: 'fighter', id: SB.UNLOCKS[next], label: 'New fighter', wins: next - save.gs + 1 });
    if (save.gs < SB.STAGE_COUNT) {
      const toBoss = 4 - (save.gs % 5);
      goals.push({ kind: 'boss', label: toBoss === 0 ? 'BOSS FIGHT NEXT!' : 'Boss fight', wins: toBoss });
    } else goals.push({ kind: 'riot', label: `Best riot #${save.bestRiot}`, wins: 0 });
    if (save.streak >= 1) goals.push({ kind: 'streak', label: `Win streak x${save.streak}`, bonus: Math.min(10, save.streak) * 10 });
    return goals;
  };

  function unlockFighter(save, id, report) {
    if (save.fighters[id]) return;
    const avg = Math.max(1, Math.floor(Object.values(save.fighters).reduce((a, f) => a + f.level, 0) / Object.keys(save.fighters).length));
    save.fighters[id] = { level: Math.max(1, avg - 1), xp: 0 };
    if (save.squad.length < SB.MAX_SQUAD) save.squad.push(id);
    if (report) report.unlocks.push(id);
  }
  SB.unlockFighter = unlockFighter;

  SB.chooseReward = function (save, index) {
    const pr = save.pendingReward;
    if (!pr || !pr.choices[index]) return { ok: false, msg: 'Nothing to choose.' };
    const card = pr.choices[index];
    const out = { ok: true, card, soldFor: 0, unlocks: [] };
    if (card.type === 'item') {
      const owned = save.items[card.id];
      save.items[card.id] = owned == null ? 0 : Math.min(5, owned + 1);
      if (!save.found.includes(card.id)) save.found.push(card.id);
      save.equipped[SB.ITEMS[card.id].slot] = card.id;
      // A cursed champion can smell legendary loot.
      if (SB.ITEMS[card.id].rarity >= 4 && !save.fighters.cursed) { unlockFighter(save, 'cursed', null); out.unlocks.push('cursed'); }
    } else if (card.type === 'consumable') {
      save.consumables[card.id] = (save.consumables[card.id] || 0) + card.count;
      if (!save.pocket || !save.consumables[save.pocket]) save.pocket = card.id;
    } else if (card.type === 'scrap') {
      save.scrap += card.amount;
    } else if (card.type === 'train') {
      for (const id of save.squad) { const f = save.fighters[id]; if (f.level < SB.MAX_LEVEL) f.level++; }
    }
    // Unpicked loot gets sold automatically (Goblin Mortgage loves this).
    pr.choices.forEach((c, i) => {
      if (i !== index && c.type === 'item') { out.soldFor += Math.round(SB.sellValue(c.id) * 0.5); save.sold++; }
    });
    save.scrap += out.soldFor;
    save.pendingReward = null;
    return out;
  };

  SB.skipReward = function (save) {
    const pr = save.pendingReward;
    if (!pr) return 0;
    let total = 0;
    for (const c of pr.choices) if (c.type === 'item') { total += Math.round(SB.sellValue(c.id) * 0.5); save.sold++; }
    save.scrap += total;
    save.pendingReward = null;
    return total;
  };

  // ------------------------------------------------------------ camp actions
  SB.equip = function (save, id) {
    if (!SB.ITEMS[id]) return { ok: false, msg: 'No such item.' };
    if (save.items[id] == null) return { ok: false, msg: "You don't own that." };
    save.equipped[SB.ITEMS[id].slot] = id;
    return { ok: true };
  };
  SB.unequip = function (save, slot) {
    if (!SLOTS.includes(slot)) return { ok: false, msg: 'No such slot.' };
    if (!save.equipped[slot]) return { ok: false, msg: 'Nothing equipped.' };
    save.equipped[slot] = null;
    return { ok: true };
  };
  SB.sellItem = function (save, id) {
    if (save.items[id] == null) return { ok: false, msg: "You don't own that." };
    const value = Math.round(SB.sellValue(id, save.items[id]));
    delete save.items[id];
    for (const slot of SLOTS) if (save.equipped[slot] === id) save.equipped[slot] = null;
    save.scrap += value; save.sold++;
    return { ok: true, value };
  };
  SB.toggleSquad = function (save, id) {
    if (!save.fighters[id]) return { ok: false, msg: 'Not unlocked yet.' };
    const i = save.squad.indexOf(id);
    if (i >= 0) {
      if (save.squad.length <= 1) return { ok: false, msg: 'You need at least one fighter.' };
      save.squad.splice(i, 1);
      return { ok: true, inSquad: false };
    }
    if (save.squad.length >= SB.MAX_SQUAD) return { ok: false, msg: 'Squad is full (3). Tap someone to bench them.' };
    save.squad.push(id);
    return { ok: true, inSquad: true };
  };
  SB.heapCost = (save) => (save.heap < SB.HEAP_COSTS.length ? SB.HEAP_COSTS[save.heap] : null);
  SB.buyHeap = function (save) {
    const cost = SB.heapCost(save);
    if (cost == null) return { ok: false, msg: 'The Heap is already magnificent.' };
    if (save.scrap < cost) return { ok: false, msg: `Need ${cost - save.scrap} more scrap.` };
    save.scrap -= cost; save.heap++;
    return { ok: true };
  };
  SB.setPocket = function (save, id) {
    if (!SB.CONSUMABLES[id]) return { ok: false, msg: 'No such consumable.' };
    if (!(save.consumables[id] > 0)) return { ok: false, msg: 'You have none of those.' };
    save.pocket = id;
    return { ok: true };
  };
})();
