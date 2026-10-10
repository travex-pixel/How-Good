// SCRAPBOUND combat simulation. Pure logic: no DOM, no drawing.
// Everything that happens on screen is driven by this state.
(function () {
  const SB = (globalThis.SB = globalThis.SB || {});
  const { W, H } = SB.WORLD;
  const DT = 1 / 60;
  SB.DT = DT;

  // ------------------------------------------------------------ helpers
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SB.makeRng = mulberry32;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const dist = (a, b) => Math.sqrt(d2(a, b));
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  // Difficulty knobs, tuned with tools/balance.mjs.
  SB.TUNING = { enemyHp: 3.0, enemyDmg: 1.4, enemyHpGrowth: 0.11, enemyDmgGrowth: 0.17, bossHp: 1.2, bossDmg: 1.25, bossHpGrowth: 0.08 };
  if (globalThis.process && process.env && process.env.SB_TUNING) Object.assign(SB.TUNING, JSON.parse(process.env.SB_TUNING));
  const pick = (b, arr) => arr[Math.floor(b.rng() * arr.length)];

  // ------------------------------------------------------------ mods
  const BASE_MODS = {
    dmg: 0, atkSpeed: 0, hp: 0, speed: 0, crit: 0.06, kb: 0, kbTaken: 1, splat: 0, echo: 0,
    ricochet: 0, cursed: 0, critBoom: 0, stunEvery: 0, shockwave: 0, bounce: 0, deathBoom: 0,
    reflect: 0, stormRate: 0, stormDmg: 0, stormPower: 0, plot: 0, regen: 0, hazardProof: 0,
    specialRate: 0, bees: 0, intern: 0, revive: 0, mortgage: 0, crown: 0,
  };

  // items: {weapon, armor, trinket} -> item ids (or null); stars: {itemId: n}
  SB.activeSynergies = function (itemIds, fighterIds) {
    const items = new Set(itemIds.filter(Boolean));
    const fighters = new Set(fighterIds);
    return SB.SYNERGIES.filter((s) =>
      (s.needs.items || []).every((i) => items.has(i)) && (s.needs.fighters || []).every((f) => fighters.has(f)));
  };

  SB.buildMods = function (items, fighterIds, opts = {}) {
    const m = { ...BASE_MODS };
    const ids = [items.weapon, items.armor, items.trinket].filter((id) => id && SB.ITEMS[id]);
    let starBonus = 0;
    for (const id of ids) {
      const fx = SB.ITEMS[id].fx;
      for (const k in fx) {
        if (k === 'kbTaken') m.kbTaken *= fx[k];
        else m[k] = (m[k] || 0) + fx[k];
      }
      starBonus += 0.08 * ((opts.stars && opts.stars[id]) || 0);
    }
    m.dmg += starBonus;
    m.hp += starBonus;
    if (m.mortgage) m.dmg += Math.min(0.75, 0.03 * (opts.sold || 0));
    const heap = opts.heap || 0;
    m.hp += 0.06 * heap;
    m.dmg += 0.04 * heap;
    m.synergies = new Set(SB.activeSynergies(ids, fighterIds).map((s) => s.id));
    return m;
  };

  // ------------------------------------------------------------ units
  let UID = 1;
  function makeUnit(b, team, id, level, x, y, opts = {}) {
    const def = team === 0 && SB.FIGHTERS[id] ? SB.FIGHTERS[id] : SB.ENEMIES[id] || SB.FIGHTERS[id];
    let hpMul = 1, dmgMul = 1, spdMul = 1;
    if (team === 0) {
      const lv = 1 + 0.1 * (level - 1);
      hpMul = lv * (1 + b.mods.hp);
      dmgMul = lv * (1 + b.mods.dmg);
      spdMul = 1 + b.mods.speed;
    } else {
      const g = b.gs;
      const T = SB.TUNING;
      const early = g < 5 && !opts.riot ? 0.62 + 0.08 * g : 1; // arena 1: your squad feels strong
      hpMul = early * (1 + (def.boss ? T.bossHpGrowth : T.enemyHpGrowth) * g) * (opts.hpMul || 1) * (def.boss ? T.bossHp : T.enemyHp);
      dmgMul = (1 + T.enemyDmgGrowth * g) * (opts.dmgMul || 1) * (def.boss ? T.bossDmg : T.enemyDmg);
    }
    const hp = Math.round(def.hp * hpMul);
    const u = {
      uid: UID++, team, id, def, name: def.short || def.name, level,
      boss: !!def.boss, companion: !!opts.companion,
      x, y, vx: 0, vy: 0, r: def.r, mass: def.mass,
      hp, maxHp: hp, dmg: def.dmg * dmgMul, atkCd: def.atkCd, range: def.range,
      speed: def.speed * spdMul, ai: def.ai,
      atkT: 0.3 + b.rng() * 0.6, special: def.special || null,
      specialRate: def.specialRate || 0, charge: 0,
      st: { stun: 0, slow: 0, curse: 0, curseDps: 0, confuse: 0, shield: 0, burn: 0, invuln: 0, root: 0, haste: 0 },
      tauntBy: null, tauntT: 0, target: null, retarget: 0,
      hits: 0, atkCount: 0, curseStacks: 0, plotUsed: false,
      anim: { atk: 0, hit: 0, special: 0, walk: b.rng() * 6 },
      facing: team === 0 ? 1 : -1, alive: true, dash: null, beam: null,
      kills: 0, dmgDone: 0, lastHitBy: null, reviveT: 0, chargeCd: 0, escapeT: id === 'larry' ? 16 : 0,
    };
    b.units.push(u);
    return u;
  }

  // ------------------------------------------------------------ battle setup
  // cfg: { squad:[{id,level}], items:{weapon,armor,trinket}, stars, sold, heap,
  //        consumable:{id,count}, stage:{gs, arena, comp, label, boss, secret}, seed, tutorial }
  SB.createBattle = function (cfg) {
    const seed = cfg.seed == null ? Math.floor(Math.random() * 1e9) : cfg.seed;
    const squadIds = cfg.squad.map((s) => s.id);
    const b = {
      seed, rng: mulberry32(seed), t: 0, units: [], projectiles: [], props: [], traps: [],
      pending: [], pickups: [], delayed: [], events: [],
      hazards: [], arena: SB.ARENAS[cfg.stage.arena] || SB.ARENAS[0], gs: cfg.stage.gs || 0,
      stage: cfg.stage, items: { ...(cfg.items || {}) },
      mods: SB.buildMods(cfg.items || {}, squadIds, { stars: cfg.stars, sold: cfg.sold, heap: cfg.heap }),
      tactic: 'swarm',
      storm: { meter: 0, state: 'idle', t: 0, x: W / 2, y: H / 2, r: 0 },
      bossStorm: null,
      consumable: cfg.consumable && cfg.consumable.count > 0 ? { ...cfg.consumable, cd: 0, used: 0 } : null,
      result: null, ending: 0, slowmo: 0, overtime: false,
      junkT: 5, beesT: 3, reviveUsed: false, bonusScrap: 0, larryCaught: false, larryEscaped: false,
      quipT: 1.5,
      stats: { kills: 0, dmg: 0, stormKills: 0, yeets: 0, splats: 0, crits: 0, maxHit: 0, hazardKills: 0 },
    };
    if (cfg.tutorial) b.storm.meter = 0.55; // the first fight shows off the storm early
    b.mods.synergyList = SB.activeSynergies([b.items.weapon, b.items.armor, b.items.trinket], squadIds);

    // player squad on the left
    const n = cfg.squad.length;
    cfg.squad.forEach((s, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * 120;
      const u = makeUnit(b, 0, s.id, s.level || 1, x, H - 120 + (i % 2) * 24);
      if (cfg.tutorial) u.charge = s.id === 'knight' ? 0.75 : 0.45;
    });
    if (b.mods.intern) {
      const avgLv = cfg.squad.reduce((a, s) => a + (s.level || 1), 0) / n;
      const it = makeUnit(b, 0, 'intern', avgLv, W / 2, H - 60, { companion: true });
      const lv = 1 + 0.1 * (avgLv - 1);
      it.maxHp = it.hp = Math.round(SB.ENEMIES.intern.hp * lv);
      it.dmg = SB.ENEMIES.intern.dmg * lv;
      it.name = 'Intern';
    }

    // enemies on the right
    const list = [];
    for (const [id, count] of Object.entries(cfg.stage.comp)) for (let i = 0; i < count; i++) list.push(id);
    list.sort((a, c) => (SB.ENEMIES[c].boss ? 1 : 0) - (SB.ENEMIES[a].boss ? 1 : 0));
    list.forEach((id, i) => {
      const col = Math.floor(i / 5), row = i % 5;
      const boss = SB.ENEMIES[id].boss;
      const x = boss ? W / 2 : W / 2 + (row - 2) * 105 + (col % 2) * 30;
      const y = boss ? 130 : 110 + col * 65 + (row % 2) * 22;
      makeUnit(b, 1, id, 1, clamp(x, 40, W - 40), clamp(y, 50, H / 2), { hpMul: cfg.stage.hpMul, dmgMul: cfg.stage.dmgMul });
    });

    b.wave = cfg.stage.wave ? { comp: cfg.stage.wave, sent: false } : null;
    if (cfg.stage.elites) makeElites(b, cfg.stage.elites);
    setupHazards(b);
    spawnInitialProps(b);
    b.events.push({ type: 'start', text: b.arena.intro });
    if (b.mods.synergyList.length) b.events.push({ type: 'synergy', list: b.mods.synergyList.map((s) => s.name) });
    return b;
  };

  // Elite modifiers: a familiar enemy with one memorable twist.
  SB.ELITES = {
    huge: { name: 'HUGE', color: '#ff9a3a' }, speedy: { name: 'SPEEDY', color: '#7fe0ff' },
    explosive: { name: 'EXPLOSIVE', color: '#ff5a4f' }, shielded: { name: 'SHIELDED', color: '#9cc4ff' },
    golden: { name: 'GOLDEN', color: '#ffd84a' },
  };
  function makeElite(b, u, kind) {
    u.elite = kind;
    if (kind === 'huge') { u.maxHp = u.hp = Math.round(u.maxHp * 2); u.r *= 1.35; u.mass *= 2.5; u.dmg *= 1.3; }
    if (kind === 'speedy') { u.speed *= 1.6; u.atkCd *= 0.6; u.maxHp = u.hp = Math.round(u.maxHp * 1.3); }
    if (kind === 'explosive') { u.maxHp = u.hp = Math.round(u.maxHp * 1.4); }
    if (kind === 'shielded') { u.shieldHp = Math.round(u.maxHp * 0.8); u.maxHp = u.hp = Math.round(u.maxHp * 1.2); }
    if (kind === 'golden') { u.maxHp = u.hp = Math.round(u.maxHp * 1.5); }
    u.name = `${SB.ELITES[kind].name} ${u.def.name}`;
  }
  function makeElites(b, n) {
    const kinds = Object.keys(SB.ELITES);
    const pool = b.units.filter((u) => u.team === 1 && !u.boss && u.id !== 'larry');
    for (let i = 0; i < n && pool.length; i++) {
      const u = pool.splice(Math.floor(b.rng() * pool.length), 1)[0];
      makeElite(b, u, kinds[Math.floor(b.rng() * kinds.length)]);
    }
  }

  function sendWave(b) {
    b.wave.sent = true;
    let i = 0;
    for (const [id, count] of Object.entries(b.wave.comp)) for (let k = 0; k < count; k++, i++) {
      const u = makeUnit(b, 1, id, 1, clamp(80 + ((i * 97) % (W - 160)), 40, W - 40), -20 - (i % 3) * 30, { hpMul: b.stage.hpMul, dmgMul: b.stage.dmgMul });
      u.vy = 260; // they tumble in from the top edge
      u.st.stun = 0.6;
    }
    emit(b, { type: 'banner', text: 'REINFORCEMENTS!' });
    emit(b, { type: 'wave' });
  }

  function setupHazards(b) {
    const hz = b.arena.hazards;
    if (hz.includes('crusher')) {
      b.hazards.push({ kind: 'crusher', spots: [[W / 2, H / 2], [170, H / 2 - 110], [W - 170, H / 2 + 110]], spot: 0,
        x: W / 2, y: H / 2, r: 72, state: 'idle', t: 7 });
    }
    if (hz.includes('molten')) {
      for (const [x, y, r] of [[130, H / 2 - 90, 50], [W - 130, H / 2 + 90, 50], [W / 2, H / 2, 42]]) {
        b.hazards.push({ kind: 'molten', x, y, r });
      }
    }
    if (hz.includes('geyser')) b.hazards.push({ kind: 'geyser', state: 'idle', t: 6, x: 0, y: 0, r: 70 });
    if (hz.includes('cliff')) b.hazards.push({ kind: 'cliff' });
    if (hz.includes('anvils')) b.hazards.push({ kind: 'anvils', t: 5 });
  }

  const PROP_KINDS = [
    { kind: 'cog', r: 13, mass: 1 }, { kind: 'pan', r: 12, mass: 0.8 }, { kind: 'tire', r: 15, mass: 1.2 },
    { kind: 'anvil', r: 15, mass: 2.4 }, { kind: 'barrel', r: 16, mass: 1.4, explosive: true },
  ];
  function addProp(b, x, y, kindName) {
    const k = kindName ? PROP_KINDS.find((p) => p.kind === kindName) : pick(b, PROP_KINDS);
    const p = { id: UID++, x, y, vx: 0, vy: 0, r: k.r, mass: k.mass, kind: k.kind, explosive: !!k.explosive, owner: -1, spin: 0, rot: b.rng() * 6, dead: false };
    b.props.push(p);
    return p;
  }
  function spawnInitialProps(b) {
    const n = b.arena.props;
    for (let i = 0; i < n; i++) {
      // Junk sits in the middle and toward the enemy side, so storms have ammo.
      addProp(b, 60 + b.rng() * (W - 120), 190 + b.rng() * (H / 2 - 60), i % 4 === 0 ? 'barrel' : null);
    }
  }

  // ------------------------------------------------------------ queries
  const alive = (b, team) => b.units.filter((u) => u.alive && (team == null || u.team === team));
  const fighters = (b) => b.units.filter((u) => u.team === 0 && !u.companion);
  SB.alive = alive;

  function densest(units, radius) {
    let best = null, bestN = -1;
    for (const u of units) {
      let n = 0, sx = 0, sy = 0;
      for (const o of units) if (d2(u, o) < radius * radius) { n++; sx += o.x; sy += o.y; }
      if (n > bestN) { bestN = n; best = { x: sx / n, y: sy / n, n }; }
    }
    return best;
  }
  SB.densest = densest;

  // Tanks: armoured frontliners that guard allies and lock enemies onto themselves.
  const isTank = (u) => u.team === 0 && !!u.def.armor && u.alive;
  SB.isTank = isTank;
  function nearestTank(b, u, maxD = Infinity) {
    let best = null, bd = maxD * maxD;
    for (const o of b.units) if (o !== u && isTank(o) && d2(o, u) < bd) { bd = d2(o, u); best = o; }
    return best;
  }

  function chooseTarget(b, u) {
    if (u.ai === 'flee') return null;
    if (u.tauntBy) {
      const t = b.units.find((o) => o.uid === u.tauntBy && o.alive);
      if (t) return t;
      u.tauntBy = null;
    }
    // Engagement: an enemy that wanders close to a tank gets stuck fighting it.
    if (u.team === 1 && u.st.confuse <= 0 && !u.boss && u.ai !== 'healer') {
      const tank = nearestTank(b, u, 95 + u.r);
      if (tank) return tank;
    }
    let pool;
    if (u.st.confuse > 0) pool = b.units.filter((o) => o.alive && o !== u);
    else pool = alive(b, 1 - u.team);
    if (!pool.length) return null;
    let mode = 'nearest';
    if (u.team === 0 && u.st.confuse <= 0) mode = b.tactic === 'snipe' ? 'weakest' : b.tactic === 'big' ? 'biggest' : 'nearest';
    else if (u.def.target === 'weakest') mode = 'weakestRatio';
    else if (u.ai === 'bomber') mode = 'cluster';
    if (u.ai === 'healer') mode = 'nearest';
    let best = null, bestScore = Infinity;
    for (const o of pool) {
      let s;
      const dd = dist(u, o);
      if (mode === 'nearest') {
        s = dd;
        // Tanks peel: they go for whatever is closest to their squishy friends.
        if (isTank(u)) for (const f of b.units) if (f.team === 0 && f.alive && !isTank(f) && f !== u) s = Math.min(s, dist(o, f) * 0.8 + dd * 0.3);
        // Melee enemies are drawn to big, loud tanks.
        if (u.team === 1 && o.def.armor) s /= 1 + o.def.armor * 3;
      }
      else if (mode === 'weakest') s = o.hp + dd * 0.15;
      else if (mode === 'weakestRatio') s = (o.hp / o.maxHp) * 400 + dd * 0.4;
      else if (mode === 'biggest') s = -o.maxHp + dd * 0.3;
      else if (mode === 'cluster') {
        let n = 0; for (const q of pool) if (d2(o, q) < 100 * 100) n++;
        s = -n * 200 + dd;
      }
      if (s < bestScore) { bestScore = s; best = o; }
    }
    return best;
  }

  function inDanger(b, x, y, r, u) {
    // Returns a repulsion vector away from known-dangerous zones.
    let rx = 0, ry = 0;
    const proof = u.team === 0 && b.mods.hazardProof;
    const consider = (zx, zy, zr) => {
      const dx = x - zx, dy = y - zy, dd = Math.hypot(dx, dy);
      const reach = zr + r + 18;
      if (dd < reach) { const f = (reach - dd) / reach; rx += (dx / (dd || 1)) * f; ry += (dy / (dd || 1)) * f; }
    };
    if (!proof) {
      for (const h of b.hazards) {
        if (h.kind === 'molten') consider(h.x, h.y, h.r);
        if (h.kind === 'crusher' && h.state !== 'idle') consider(h.x, h.y, h.r);
        if (h.kind === 'geyser' && h.state === 'warn') consider(h.x, h.y, h.r);
      }
    }
    for (const p of b.pending) if (p.hurts === u.team || p.hurts === -1) consider(p.x, p.y, p.r);
    return [rx, ry];
  }

  // ------------------------------------------------------------ damage
  function emit(b, e) { b.events.push(e); }
  SB.emit = emit;

  function overtimeMul(b) { return b.overtime ? 1 + (b.t - 70) * 0.04 : 1; }

  function applyKb(b, u, dx, dy, force) {
    if (!u.alive || force <= 0) return;
    let f = force;
    if (u.boss) f *= 0.22;
    if (u.team === 0) f *= b.mods.kbTaken;
    if (u.st.shield > 0) f *= 0.3;
    const lowHp = 1 + (1 - u.hp / u.maxHp) * 1.3; // smash-style: hurt units fly further
    const v = (f * lowHp) / Math.sqrt(u.mass);
    u.vx += dx * v; u.vy += dy * v;
  }

  function damage(b, src, tgt, amount, o = {}) {
    if (!tgt.alive || tgt.st.invuln > 0 || amount <= 0) return 0;
    let crit = false;
    if (src && !o.noCrit) {
      const chance = src.team === 0 ? b.mods.crit : 0.05;
      if (b.rng() < chance) { crit = true; amount *= 1.8; b.stats.crits += src.team === 0 ? 1 : 0; }
    }
    if (o.crit) crit = true;
    b.lastCrit = crit;
    amount *= overtimeMul(b);
    // Tactics are more than targeting: each focus gives the squad a small edge.
    if (src && src.team === 0 && tgt.team === 1) {
      if (b.tactic === 'snipe' && tgt.hp < tgt.maxHp * 0.35) amount *= 1.3;
      else if (b.tactic === 'big' && (tgt.boss || tgt.elite || tgt.maxHp > 600)) amount *= 1.2;
    }
    if (tgt.team === 0 && b.tactic === 'swarm' && src && src.team === 1 && !tgt.companion && ['lobber', 'trapper', 'beam'].includes(tgt.ai)) amount *= 0.8;
    if (tgt.team === 0 && !o.curseSelf) {
      if (tgt.def.armor && !o.dot) amount *= 1 - tgt.def.armor;
      else if (!tgt.def.armor && !o.dot && !o.redirected) {
        // Guard: a nearby tank takes a big share of hits meant for its allies.
        const tank = nearestTank(b, tgt, tgt.companion ? 140 : 150);
        if (tank && tank.st.stun <= 0) {
          const share = tank.id === 'pit' ? 0.65 : 0.5;
          const moved = amount * share;
          amount -= moved;
          if (b.rng() < 0.25) emit(b, { type: 'guard', x1: tank.x, y1: tank.y, x2: tgt.x, y2: tgt.y });
          damage(b, src, tank, moved, { noCrit: true, redirected: true, kind: 'guard' });
        }
      }
    }
    if (tgt.shieldHp > 0) { const soak = Math.min(tgt.shieldHp, amount); tgt.shieldHp -= soak; amount -= soak; if (tgt.shieldHp <= 0) emit(b, { type: 'text', x: tgt.x, y: tgt.y - 40, text: 'SHIELD BROKEN!', color: '#9cc4ff' }); if (amount <= 0) { emit(b, { type: 'hit', x: tgt.x, y: tgt.y - tgt.r * 0.5, amount: 0, crit: false, team: tgt.team, blocked: true, kind: 'shield', uid: tgt.uid }); return 0; } }
    if (tgt.st.shield > 0) amount *= 0.3;
    let blocked = false;
    if (tgt.def.block && !o.noBlock && b.rng() < tgt.def.block) { amount *= 0.4; blocked = true; }
    if (tgt.st.curse > 0 && !o.dot) amount *= 1.1;
    amount = Math.max(1, Math.round(amount));

    if (tgt.hp - amount <= 0) {
      if (tgt.team === 0 && b.mods.plot && !tgt.plotUsed && !tgt.companion) {
        tgt.plotUsed = true; tgt.hp = 1; tgt.st.invuln = 1.5;
        emit(b, { type: 'text', x: tgt.x, y: tgt.y - 40, text: 'PLOT ARMOUR!', color: '#ffad33', big: true });
        return 0;
      }
      if (o.curseSelf && b.mods.synergies.has('stubborn')) { amount = Math.max(0, tgt.hp - 1); }
    }
    tgt.hp -= amount;
    tgt.anim.hit = 1;
    if (src) { tgt.lastHitBy = src.uid; src.dmgDone += amount; }
    if (src && src.team === 0 && tgt.team === 1) {
      b.stats.dmg += amount;
      b.stats.maxHit = Math.max(b.stats.maxHit, amount);
      b.storm.meter = Math.min(1, b.storm.meter + (amount / 1400) * (1 + b.mods.stormRate));
    }
    // Getting hurt charges your special a little: comeback mechanic.
    if (tgt.team === 0 && tgt.special) tgt.charge = Math.min(1, tgt.charge + (amount / tgt.maxHp) * 0.3);
    emit(b, { type: 'hit', x: tgt.x, y: tgt.y - tgt.r * 0.5, amount, crit, team: tgt.team, blocked, kind: o.kind || 'hit', uid: tgt.uid });
    if (o.kb && src) {
      const [dx, dy] = o.dir || norm(tgt.x - src.x, tgt.y - src.y);
      applyKb(b, tgt, dx, dy, o.kb * (src.team === 0 ? 1 + b.mods.kb : 1));
    } else if (o.kb && o.dir) applyKb(b, tgt, o.dir[0], o.dir[1], o.kb);

    if (o.melee && src && src.alive && tgt.team === 0 && src.team === 1) {
      if (b.mods.reflect) damage(b, tgt, src, amount * b.mods.reflect, { noCrit: true, kind: 'reflect' });
      if (b.mods.bounce) { const [dx, dy] = norm(src.x - tgt.x, src.y - tgt.y); applyKb(b, src, dx, dy, 300); }
    }
    if (tgt.hp <= 0) kill(b, tgt, src, o);
    return amount;
  }
  SB.damage = damage;

  function explode(b, x, y, r, dmg, team, src, o = {}) {
    // team: which team gets hurt (-1 for everyone)
    emit(b, { type: 'explode', x, y, r, big: r > 100 });
    for (const u of b.units) {
      if (!u.alive || (team !== -1 && u.team !== team)) continue;
      const dd = dist(u, { x, y });
      if (dd < r + u.r) {
        const fall = 1 - (dd / (r + u.r)) * 0.5;
        damage(b, src, u, dmg * fall, { kb: o.kb || 320, dir: norm(u.x - x, u.y - y), kind: 'explode', noCrit: true });
      }
    }
    for (const p of b.props) {
      if (p.dead) continue;
      const dd = dist(p, { x, y });
      if (dd < r + 40) {
        const [dx, dy] = norm(p.x - x, p.y - y);
        p.vx += dx * 520 / p.mass; p.vy += dy * 520 / p.mass; p.spin = 12;
        p.owner = team === 1 ? 0 : team === 0 ? 1 : -1;
        if (p.explosive && !p.fuse) p.fuse = 0.15;
      }
    }
  }

  function kill(b, u, src, o = {}) {
    if (!u.alive) return;
    u.alive = false;
    u.hp = 0;
    const killer = src || b.units.find((q) => q.uid === u.lastHitBy);
    if (killer) killer.kills++;
    if (u.team === 1) {
      b.stats.kills++;
      if (o.kind === 'storm' || o.kind === 'prop') b.stats.stormKills++;
      if (o.kind === 'hazard') b.stats.hazardKills++;
      if (u.id === 'larry') { b.larryCaught = true; emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'LARRY DROPPED THE LOOT!', color: '#ffd84a', big: true }); }
      if (b.mods.crown || b.mods.synergies.has('fetchQuest')) b.pickups.push({ x: u.x, y: u.y, t: 12 });
      if (u.elite) b.stats.elites = (b.stats.elites || 0) + 1;
      if (u.elite === 'golden') { b.bonusScrap += 40; emit(b, { type: 'text', x: u.x, y: u.y - 30, text: '+40 SCRAP!', color: '#ffd84a', big: true }); }
      if (u.elite === 'explosive') explode(b, u.x, u.y, 100, u.dmg * 1.8, -1, null, { kb: 420 });
    }
    emit(b, { type: 'death', x: u.x, y: u.y, team: u.team, id: u.id, boss: u.boss, yeet: o.kind === 'yeet', uid: u.uid });
    if (killer && killer.team === 0 && u.team === 1) maybeQuip(b, killer, 0.3);
    if (u.team === 0 && !u.companion) {
      if (b.mods.deathBoom) explode(b, u.x, u.y, 110, avgSquadDmg(b) * 2, 1, u, { kb: 420 });
      if (b.mods.revive && !b.reviveUsed) { b.reviveUsed = true; u.reviveT = 1.2; emit(b, { type: 'text', x: u.x, y: u.y - 40, text: 'COUPON REDEEMED...', color: '#4aa3ff' }); }
    }
    if (u.team === 1 && u.id === 'beetle' && !o.selfDestruct) {
      // A popped beetle still goes off, hurting whoever is near (including its friends).
      explode(b, u.x, u.y, 70, u.dmg * 0.6, -1, null, { kb: 300 });
    }
  }

  function avgSquadDmg(b) {
    const f = fighters(b);
    return f.reduce((a, u) => a + u.dmg, 0) / Math.max(1, f.length);
  }

  function maybeQuip(b, u, chance) {
    if (b.quipT > 0 || b.rng() > chance) return;
    const lines = u.team === 0 ? u.def.quips : SB.ENEMY_QUIPS[u.id];
    if (!lines || !lines.length) return;
    b.quipT = 3.5;
    emit(b, { type: 'quip', uid: u.uid, text: pick(b, lines), team: u.team });
  }

  // Basic attack hit from a unit: applies weapon effects for the player team.
  function strike(b, u, t, mult, o = {}) {
    const melee = !!o.melee;
    const dealt = damage(b, u, t, u.dmg * mult, { kb: o.kb || 0, melee, kind: o.kind });
    const wasCrit = b.lastCrit;
    if (u.team !== 0 || u.companion || o.secondary) return dealt;
    const m = b.mods;
    u.hits++;
    if (m.critBoom && wasCrit && dealt > 0) explode(b, t.x, t.y, 75, dealt * 0.8, 1, u, { kb: 300 });
    if (m.echo) b.delayed.push({ t: 0.3, kind: 'echo', src: u.uid, tgt: t.uid, amount: u.dmg * mult * m.echo });
    if (m.ricochet) {
      const chain = m.synergies.has('forkLightning') ? 3 : 1;
      let from = t; const seen = new Set([t.uid]);
      for (let i = 0; i < chain; i++) {
        let next = null, nd = 200 * 200;
        for (const e of alive(b, 1)) if (!seen.has(e.uid) && d2(from, e) < nd) { nd = d2(from, e); next = e; }
        if (!next) break;
        seen.add(next.uid);
        emit(b, { type: 'zap', x1: from.x, y1: from.y, x2: next.x, y2: next.y });
        damage(b, u, next, u.dmg * mult * 0.8, { noCrit: !m.synergies.has('forkLightning'), kind: 'zap' });
        from = next;
      }
    }
    if (m.stunEvery && u.hits % m.stunEvery === 0 && t.alive) {
      t.st.stun = Math.max(t.st.stun, t.boss ? 0.4 : 1.2);
      emit(b, { type: 'text', x: t.x, y: t.y - 36, text: 'BONK!', color: '#ffad33' });
    }
    if (m.cursed) {
      u.curseStacks++;
      if (u.curseStacks % 4 === 0) {
        const self = Math.min(u.maxHp * 0.1, u.maxHp * 0.012 * (u.curseStacks / 4));
        damage(b, null, u, self, { noCrit: true, curseSelf: true, kind: 'curse', noBlock: true });
        emit(b, { type: 'text', x: u.x, y: u.y - 40, text: 'the axe whispers...', color: '#b56cff' });
      }
    }
    return dealt;
  }

  // ------------------------------------------------------------ attacks
  function fireProjectile(b, u, t, o) {
    const [dx, dy] = norm(t.x - u.x, t.y - u.y);
    const sp = o.speed || 430;
    b.projectiles.push({
      x: u.x + dx * u.r, y: u.y + dy * u.r, vx: dx * sp, vy: dy * sp, team: u.team, owner: u.uid,
      mult: o.mult || 1, kind: o.kind || 'bolt', r: o.r || 6, life: o.life || 1.4, pierce: !!o.pierce,
      hitSet: new Set(), splash: o.splash || 0, kb: o.kb || 60, dmgAbs: o.dmgAbs,
    });
  }

  function lob(b, u, tx, ty, o) {
    const T = o.T || 0.75;
    b.projectiles.push({
      kind: o.kind || 'lob', team: u.team, owner: u.uid, sx: u.x, sy: u.y - u.r, tx, ty,
      x: u.x, y: u.y, t: 0, T, splash: o.splash || 54, mult: o.mult || 1, kb: o.kb || 200, lob: true, dmgAbs: o.dmgAbs,
    });
  }

  function attack(b, u, t) {
    u.atkT = u.atkCd / (1 + (u.team === 0 && !u.companion ? b.mods.atkSpeed : 0)) * (u.st.haste > 0 ? 0.6 : 1);
    u.anim.atk = 1;
    u.atkCount++;
    u.facing = t.x >= u.x ? 1 : -1;
    const ai = u.ai;
    if (u.team === 0 && !u.companion && b.mods.shockwave) fireProjectile(b, u, t, { kind: 'shock', mult: 0.55, pierce: true, speed: 520, life: 0.7, r: 12 });
    if (ai === 'melee' || ai === 'charger') {
      let mult = 1;
      if (u.id === 'intern') {
        const f = fighters(b); const ratio = f.reduce((a, q) => a + Math.max(0, q.hp), 0) / f.reduce((a, q) => a + q.maxHp, 0);
        mult = 1 + 2.5 * (1 - ratio);
      }
      const kb = u.def.slam ? 260 : u.id === 'knight' ? 160 : 90;
      strike(b, u, t, mult, { melee: true, kb });
      if (u.id === 'knight') {
        // Cleave: everyone else near the target takes a chunk.
        for (const e of alive(b, 1 - u.team)) if (e !== t && dist(e, t) < 60 + e.r) strike(b, u, e, 0.55, { melee: true, kb: 140, secondary: true });
      }
      if (u.def.slam) {
        emit(b, { type: 'slam', x: t.x, y: t.y });
        for (const e of alive(b, 1 - u.team)) if (e !== t && dist(e, t) < 55 + e.r) damage(b, u, e, u.dmg * 0.5, { kb: 220, melee: true });
      }
      emit(b, { type: 'swing', uid: u.uid, x: t.x, y: t.y });
    } else if (ai === 'ranged') {
      if (u.id === 'wyrm') lob(b, u, t.x, t.y, { kind: 'fireball', splash: 46, kb: 220, T: 0.9 });
      else if (u.id === 'archmagnet') fireProjectile(b, u, t, { kind: 'magbolt', speed: 380, r: 9 });
      else fireProjectile(b, u, t, { kind: 'bolt' });
      emit(b, { type: 'shoot', uid: u.uid });
    } else if (ai === 'lobber') {
      // Lead the target a little so bombs feel smart.
      lob(b, u, t.x + t.vx * 0.2, t.y + t.vy * 0.2, { kind: 'bomb', splash: u.def.splash || 54, kb: 240 });
      emit(b, { type: 'shoot', uid: u.uid });
    } else if (ai === 'trapper') {
      if (u.atkCount % 3 === 0) placeTrap(b, u, t.x, t.y);
      else fireProjectile(b, u, t, { kind: 'dart', speed: 520 });
      emit(b, { type: 'shoot', uid: u.uid });
    } else if (ai === 'beam') {
      u.beam = t.uid;
      const dealt = strike(b, u, t, u.atkCd, {});
      u.hp = Math.min(u.maxHp, u.hp + dealt * 0.35);
    }
  }

  function placeTrap(b, u, x, y) {
    b.traps.push({ x: clamp(x, 30, W - 30), y: clamp(y, 30, H - 30), r: 22, team: u.team, owner: u.uid, arm: 0.35, life: 14, dmg: u.dmg * 1.6 });
  }

  // ------------------------------------------------------------ specials
  SB.SPECIALS = {
    bigSwing(b, u) {
      // Leap into the nearest crowd first, so the swing never whiffs.
      const foes = alive(b, 1);
      if (!foes.length) return false;
      let near = foes[0];
      for (const e of foes) if (d2(u, e) < d2(u, near)) near = e;
      if (dist(u, near) > 90) {
        const crowd = densest(foes.filter((e) => dist(e, near) < 160), 110) || near;
        const [dx, dy] = norm(crowd.x - u.x, crowd.y - u.y);
        const jump = Math.min(320, Math.max(0, dist(u, crowd) - 40));
        emit(b, { type: 'leap', x1: u.x, y1: u.y });
        u.x = clamp(u.x + dx * jump, u.r, W - u.r); u.y = clamp(u.y + dy * jump, u.r, H - u.r);
      }
      emit(b, { type: 'ring', x: u.x, y: u.y, r: 130, color: '#e8c35a' });
      for (const e of alive(b, 1)) if (dist(e, u) < 130 + e.r) damage(b, u, e, u.dmg * 2.4, { kb: 560, melee: true, kind: 'special' });
      if (b.mods.synergies.has('realKing')) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.projectiles.push({ x: u.x, y: u.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, team: 0, owner: u.uid, mult: 1, kind: 'shock', r: 14, life: 0.8, pierce: true, hitSet: new Set(), splash: 0, kb: 200 });
        }
      }
    },
    barrel(b, u) {
      const c = densest(alive(b, 1), 120);
      if (!c) return false;
      lob(b, u, c.x, c.y, { kind: 'barrel', splash: 135, mult: 3.2, kb: 520, T: 0.95 });
    },
    ironHug(b, u) {
      u.st.shield = 4.5;
      const hex = b.mods.synergies.has('hexHug');
      for (const e of alive(b, 1)) {
        e.tauntBy = u.uid; e.tauntT = 4.5;
        if (hex) { e.st.curse = 4; e.st.curseDps = u.dmg * 0.8 + e.maxHp * (e.boss ? 0.004 : 0.02); }
      }
      emit(b, { type: 'ring', x: u.x, y: u.y, r: 100, color: '#6d7a86' });
      for (const e of alive(b, 1)) if (dist(e, u) < 100 + e.r) damage(b, u, e, u.dmg * 1.2, { kb: 260, melee: true, kind: 'special' });
    },
    monkeyBusiness(b, u) {
      const c = densest(alive(b, 1), 160);
      if (!c) return false;
      u.x = clamp(c.x - 30, u.r, W - u.r); u.y = clamp(c.y, u.r, H - u.r);
      emit(b, { type: 'ring', x: c.x, y: c.y, r: 190, color: '#f3d27a' });
      for (const e of alive(b, 1)) if (dist(e, c) < 190) {
        e.st.confuse = e.boss ? 1.2 : 4; e.target = null; e.retarget = 0;
        damage(b, u, e, u.dmg * 1.5, { kb: 160, melee: true, kind: 'special' });
      }
    },
    stampede(b, u) {
      const foes = alive(b, 1);
      if (!foes.length) return false;
      const c = densest(foes, 140);
      const [dx, dy] = norm(c.x - u.x, c.y - u.y);
      u.dash = { dx, dy, speed: 560, t: 1.0, hit: new Set(), mult: 2.2, kb: 620, special: true };
    },
    fetch(b, u) {
      for (const p of b.props) {
        if (p.dead) continue;
        const [dx, dy] = norm(u.x - p.x, u.y - p.y);
        p.vx = dx * 560; p.vy = dy * 560; p.owner = 0; p.spin = 14;
      }
      for (const pk of b.pickups) { pk.x = u.x; pk.y = u.y; }
      for (const f of alive(b, 0)) heal(b, f, f.maxHp * 0.22);
      u.st.haste = 5;
      emit(b, { type: 'ring', x: u.x, y: u.y, r: 160, color: '#e07b39' });
    },
    trapParty(b, u) {
      const foes = alive(b, 1);
      if (!foes.length) return false;
      for (let i = 0; i < 6; i++) {
        const e = foes[i % foes.length];
        placeTrap(b, u, e.x + (b.rng() - 0.5) * 50, e.y + (b.rng() - 0.5) * 50);
        b.traps[b.traps.length - 1].arm = 0.05 + i * 0.08;
      }
    },
    hex(b, u) {
      for (const e of alive(b, 1)) {
        e.st.curse = 5; e.st.slow = 5;
        e.st.curseDps = u.dmg * 0.9 + e.maxHp * (e.boss ? 0.005 : 0.025);
        e.curseOwner = u.uid;
      }
      emit(b, { type: 'ring', x: u.x, y: u.y, r: 400, color: '#b56cff' });
    },
    // enemy boss specials
    summonRats(b, u) {
      for (let i = 0; i < 3; i++) makeUnit(b, 1, 'rat', 1, clamp(u.x + (b.rng() - 0.5) * 120, 40, W - 40), clamp(u.y + (b.rng() - 0.5) * 160, 40, H - 40));
      b.pending.push({ x: u.x, y: u.y, r: 140, t: 1.0, T: 1.0, hurts: 0, dmg: u.dmg * 1.4, kb: 420, owner: u.uid, kind: 'pound' });
      emit(b, { type: 'text', x: u.x, y: u.y - 60, text: 'RATS! TO ME!', color: '#ff6b5a', big: true });
    },
    magmaRain(b, u) {
      for (const f of alive(b, 0)) b.pending.push({ x: f.x, y: f.y, r: 62, t: 1.3, T: 1.3, hurts: 0, dmg: u.dmg * 1.6, kb: 300, owner: u.uid, kind: 'magma' });
      emit(b, { type: 'text', x: u.x, y: u.y - 60, text: 'MAGMA RAIN!', color: '#ff7b2e', big: true });
    },
    reverseStorm(b, u) {
      b.bossStorm = { state: 'warn', t: 1.4, x: W / 2, y: H / 2, owner: u.uid };
      emit(b, { type: 'text', x: W / 2, y: H / 2 - 80, text: 'THE ARCHMAGNET PULLS!', color: '#6fa8ff', big: true });
    },
  };

  function heal(b, u, amount) {
    if (!u.alive || amount <= 0) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    if (u.hp - before >= 1) emit(b, { type: 'heal', x: u.x, y: u.y - u.r, amount: Math.round(u.hp - before) });
  }

  // Player-facing actions -------------------------------------------------
  SB.useSpecial = function (b, uid) {
    if (b.result || b.ending) return false;
    const u = b.units.find((q) => q.uid === uid);
    if (!u || !u.alive || u.team !== 0 || !u.special || u.charge < 1 || u.st.stun > 0) return false;
    const ok = SB.SPECIALS[u.special](b, u);
    if (ok === false) return false;
    u.charge = 0;
    u.anim.special = 1;
    emit(b, { type: 'special', uid: u.uid, name: u.def.specialName, team: 0 });
    return true;
  };

  SB.TACTICS = ['swarm', 'snipe', 'big'];
  SB.TACTIC_LABELS = { swarm: 'Nearest', snipe: 'Weakest', big: 'Biggest' };
  SB.cycleTactic = function (b) {
    const i = SB.TACTICS.indexOf(b.tactic);
    b.tactic = SB.TACTICS[(i + 1) % SB.TACTICS.length];
    for (const u of b.units) if (u.team === 0) u.retarget = 0;
    return b.tactic;
  };

  SB.canStorm = (b) => !b.result && !b.ending && b.storm.state === 'idle' && b.storm.meter >= 1 && alive(b, 1).length > 0;
  SB.triggerStorm = function (b) {
    if (!SB.canStorm(b)) return false;
    const c = densest(alive(b, 1), 150);
    const s = b.storm;
    s.state = 'pull'; s.t = 2.0 + (b.mods.stormPower ? 0.5 : 0);
    s.x = clamp(c.x, 120, W - 120); s.y = clamp(c.y, 100, H - 100);
    s.r = 330 * (1 + b.mods.stormPower);
    s.meter = 0;
    emit(b, { type: 'storm', x: s.x, y: s.y });
    return true;
  };

  SB.canConsume = (b) => !!(b.consumable && b.consumable.count > 0 && b.consumable.cd <= 0 && !b.result && !b.ending);
  SB.useConsumable = function (b) {
    if (!SB.canConsume(b)) return false;
    const c = b.consumable;
    c.count--; c.used++; c.cd = 4;
    if (c.id === 'tape') for (const f of alive(b, 0)) heal(b, f, f.maxHp * 0.4);
    else if (c.id === 'beeJar') {
      for (const e of alive(b, 1)) damage(b, null, e, avgSquadDmg(b) * 1.6 + e.maxHp * (e.boss ? 0.03 : 0.12), { noCrit: true, kind: 'bees' });
      emit(b, { type: 'bees', all: true });
    } else if (c.id === 'pie') {
      for (const f of alive(b, 0)) if (f.special) f.charge = 1;
      b.storm.meter = Math.min(1, b.storm.meter + 0.5);
    }
    emit(b, { type: 'consume', id: c.id });
    return true;
  };

  // ------------------------------------------------------------ update
  SB.step = function (b) {
    if (b.result) return;
    const dt = DT;
    b.t += dt;
    b.quipT -= dt;
    if (b.consumable && b.consumable.cd > 0) b.consumable.cd -= dt;
    if (!b.overtime && b.t > 70) { b.overtime = true; emit(b, { type: 'banner', text: 'OVERTIME! Everything hurts more.' }); }

    updateHazards(b, dt);
    updateStorm(b, dt);
    updateBossStorm(b, dt);
    updatePending(b, dt);
    updateDelayed(b, dt);

    if (b.mods.bees && !b.ending) {
      b.beesT -= dt;
      if (b.beesT <= 0) {
        b.beesT = 2;
        const foes = alive(b, 1);
        if (foes.length) {
          const e = pick(b, foes);
          emit(b, { type: 'bees', x: e.x, y: e.y });
          damage(b, null, e, avgSquadDmg(b) + e.maxHp * (e.boss ? 0.008 : 0.05), { noCrit: true, kind: 'bees' });
        }
      }
    }

    for (const u of b.units) updateUnit(b, u, dt);
    separate(b);
    updateProjectiles(b, dt);
    updateTraps(b, dt);
    updateProps(b, dt);
    updatePickups(b, dt);

    // Revives
    for (const u of b.units) {
      if (!u.alive && u.reviveT > 0) {
        u.reviveT -= dt;
        if (u.reviveT <= 0) {
          u.alive = true; u.hp = Math.round(u.maxHp * 0.5); u.st.invuln = 1.5; u.vx = u.vy = 0;
          u.x = clamp(u.x, 40, W - 40); u.y = clamp(u.y, 40, H - 40);
          emit(b, { type: 'text', x: u.x, y: u.y - 40, text: 'BACK FROM THE DEAD!', color: '#4aa3ff', big: true });
        }
      }
    }

    checkEnd(b, dt);
  };

  function checkEnd(b, dt) {
    if (b.wave && !b.wave.sent && !b.ending) {
      const foes = alive(b, 1).filter((u) => u.id !== 'larry');
      if (foes.length <= 2 || b.t > 40) sendWave(b);
      if (b.wave.sent) return;
    }
    if (b.ending > 0) {
      b.ending -= dt;
      if (b.ending <= 0) b.result = b.pendingResult;
      return;
    }
    const foes = alive(b, 1).filter((u) => u.id !== 'larry');
    const larry = b.units.find((u) => u.id === 'larry' && u.alive);
    const squadAlive = fighters(b).some((u) => u.alive || u.reviveT > 0);
    if (!squadAlive) {
      b.pendingResult = 'lose'; b.ending = 1.2;
      emit(b, { type: 'defeat' });
    } else if (foes.length === 0 && !larry) {
      b.pendingResult = 'win'; b.ending = 1.4; b.slowmo = 0.9;
      const last = b.units.filter((u) => u.team === 1).sort((a, c) => (a.alive ? 1 : 0) - (c.alive ? 1 : 0)).pop();
      emit(b, { type: 'finish', x: last ? last.x : W / 2, y: last ? last.y : H / 2 });
    }
  }

  function updateUnit(b, u, dt) {
    if (!u.alive) return;
    const st = u.st;
    for (const k of ['stun', 'slow', 'confuse', 'shield', 'invuln', 'root', 'haste']) if (st[k] > 0) st[k] -= dt;
    if (u.tauntT > 0) { u.tauntT -= dt; if (u.tauntT <= 0) u.tauntBy = null; }
    for (const k in u.anim) if (k !== 'walk' && u.anim[k] > 0) u.anim[k] = Math.max(0, u.anim[k] - dt * 3);
    if (st.curse > 0) {
      st.curse -= dt;
      const owner = b.units.find((q) => q.uid === u.curseOwner);
      damage(b, owner || null, u, st.curseDps * dt, { noCrit: true, dot: true, kind: 'curse', noBlock: true });
      if (!u.alive) return;
    }
    if (u.team === 0 && b.mods.regen && !u.companion && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * b.mods.regen * dt);

    // Hazard contact
    hazardContact(b, u, dt);
    if (!u.alive) return;

    // Knockback motion
    const kbSpeed = Math.hypot(u.vx, u.vy);
    if (kbSpeed > 1) {
      u.x += u.vx * dt; u.y += u.vy * dt;
      const fr = Math.exp(-4.5 * dt);
      u.vx *= fr; u.vy *= fr;
      if (kbSpeed < 8) { u.vx = 0; u.vy = 0; }
    }
    wallCheck(b, u, kbSpeed);
    if (!u.alive) return;

    // Specials: enemies fire their own; players get charge over time.
    if (u.special && !b.ending) {
      const rate = u.specialRate * (u.team === 0 ? 1 + b.mods.specialRate : 1);
      u.charge = Math.min(1, u.charge + rate * dt);
      if (u.team === 1 && u.charge >= 1 && st.stun <= 0) {
        u.charge = 0; u.anim.special = 1;
        SB.SPECIALS[u.special](b, u);
        maybeQuip(b, u, 1);
      }
    }

    if (u.dash) { updateDash(b, u, dt); return; }
    if (st.stun > 0 || kbSpeed > 90 || b.ending > 0) return;

    if (u.ai === 'flee') return updateFlee(b, u, dt);

    u.retarget -= dt;
    if (u.retarget <= 0 || !u.target || !u.target.alive || (u.target.team === u.team && st.confuse <= 0)) {
      u.target = chooseTarget(b, u);
      u.retarget = 0.6 + b.rng() * 0.3;
    }
    const t = u.target;
    u.atkT -= dt;
    u.beam = null;

    if (u.ai === 'healer') {
      const hurt = alive(b, u.team).filter((a) => a !== u && a.hp < a.maxHp * 0.85).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
      if (hurt) {
        moveToward(b, u, hurt, 140, dt, true);
        if (u.atkT <= 0 && dist(u, hurt) < u.range) {
          u.atkT = u.atkCd; u.anim.atk = 1;
          heal(b, hurt, u.def.heal * (1 + 0.15 * b.gs));
          emit(b, { type: 'healbeam', x1: u.x, y1: u.y, x2: hurt.x, y2: hurt.y });
        }
        return;
      }
    }
    if (!t) return;
    const dd = dist(u, t);
    const reach = u.range + t.r;
    u.facing = t.x >= u.x ? 1 : -1;

    if (u.ai === 'bomber') {
      moveToward(b, u, t, 0, dt, false);
      if (dd < reach + u.r) {
        emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'KABOOM', color: '#ff6b5a' });
        u.alive = false; u.hp = 0;
        emit(b, { type: 'death', x: u.x, y: u.y, team: u.team, id: u.id, uid: u.uid });
        explode(b, u.x, u.y, 85, u.dmg, 1 - u.team, u, { kb: 380 });
      }
      return;
    }

    if (u.ai === 'charger' && dd > 150 && u.chargeCd <= 0 && st.root <= 0) {
      const [dx, dy] = norm(t.x - u.x, t.y - u.y);
      u.dash = { dx, dy, speed: 430, t: 0.7, hit: new Set(), mult: 1.5, kb: 420 };
      u.chargeCd = 4;
      emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'CHARGE!', color: '#f2ead3' });
      return;
    }
    u.chargeCd -= dt;

    const ranged = ['ranged', 'lobber', 'trapper', 'beam', 'healer'].includes(u.ai);
    if (ranged) {
      // Kite away from melee threats, otherwise hold at ~85% range.
      const threat = alive(b, 1 - u.team).find((e) => !['ranged', 'lobber', 'trapper', 'beam', 'healer'].includes(e.ai) && dist(u, e) < 90 + e.r);
      const tank = u.team === 0 ? nearestTank(b, u) : null;
      if (threat && !u.boss && st.root <= 0) {
        // Squishies retreat behind their tank rather than running into a corner.
        if (tank) stepMove(b, u, tank.x + (u.x > tank.x ? 40 : -40), tank.y + 70, dt, 1.0);
        else { const [dx, dy] = norm(u.x - threat.x, u.y - threat.y); stepMove(b, u, u.x + dx * 100, u.y + dy * 100, dt, 0.9); }
      } else if (tank && u.y < tank.y + 30 && dd <= reach * 1.3) {
        stepMove(b, u, u.x, tank.y + 60, dt, 0.8); // drifted in front of the tank: fall back into formation
      } else if (dd > reach * 0.85 && !(tank && u.y < tank.y + 40)) moveToward(b, u, t, reach * 0.8, dt, false);
      else if (u.team === 1 && u.hp < u.maxHp * 0.3 && !u.boss) {
        // Wounded enemy shooters back off toward their friends.
        const friends = alive(b, 1).filter((a) => a !== u);
        if (friends.length) moveToward(b, u, densest(friends, 120), 40, dt, false);
      }
      if (dd <= reach && u.atkT <= 0) attack(b, u, t);
    } else {
      if (dd > reach) moveToward(b, u, t, reach * 0.9, dt, false);
      else if (u.atkT <= 0) attack(b, u, t);
    }
  }

  function updateFlee(b, u, dt) {
    u.escapeT -= dt;
    if (u.escapeT <= 0) {
      u.alive = false; b.larryEscaped = true;
      emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'Larry escaped with the loot!', color: '#d8b13a', big: true });
      emit(b, { type: 'poof', x: u.x, y: u.y });
      return;
    }
    const foes = alive(b, 0);
    let rx = 0, ry = 0;
    for (const f of foes) { const dd = Math.max(30, dist(u, f)); rx += (u.x - f.x) / (dd * dd); ry += (u.y - f.y) / (dd * dd); }
    const [dx, dy] = norm(rx + (b.rng() - 0.5) * 0.002, ry + (b.rng() - 0.5) * 0.002);
    stepMove(b, u, u.x + dx * 60, u.y + dy * 60, dt, 1);
    if (b.rng() < dt * 0.4) maybeQuip(b, u, 1);
  }

  function updateDash(b, u, dt) {
    const d = u.dash;
    d.t -= dt;
    u.x += d.dx * d.speed * dt; u.y += d.dy * d.speed * dt;
    u.facing = d.dx >= 0 ? 1 : -1;
    u.anim.atk = 1;
    if (b.mods.synergies.has('boarbq') && u.team === 0 && b.rng() < dt * 6) {
      lob(b, u, u.x, u.y, { kind: 'bomb', splash: 70, mult: 1.2, kb: 300, T: 0.5 });
    }
    for (const e of alive(b, 1 - u.team)) {
      if (d.hit.has(e.uid) || dist(e, u) > u.r + e.r + 6) continue;
      d.hit.add(e.uid);
      const side = norm(e.x - u.x, e.y - u.y);
      const dir = norm(d.dx + side[0] * 0.8, d.dy + side[1] * 0.8);
      damage(b, u, e, u.dmg * d.mult, { kb: d.kb, dir, melee: true, kind: d.special ? 'special' : 'hit' });
      emit(b, { type: 'slam', x: e.x, y: e.y });
      if (!d.special) { d.t = Math.min(d.t, 0.05); }
    }
    const hitWall = u.x < u.r || u.x > W - u.r || u.y < u.r || u.y > H - u.r;
    u.x = clamp(u.x, u.r, W - u.r); u.y = clamp(u.y, u.r, H - u.r);
    if (d.t <= 0 || hitWall) u.dash = null;
  }

  function stepMove(b, u, tx, ty, dt, mul) {
    if (u.st.root > 0) return;
    let [dx, dy] = norm(tx - u.x, ty - u.y);
    const [rx, ry] = inDanger(b, u.x + dx * 20, u.y + dy * 20, u.r, u);
    if (rx || ry) { [dx, dy] = norm(dx + rx * 3, dy + ry * 3); }
    let sp = u.speed * mul * (u.st.slow > 0 ? 0.6 : 1) * (u.st.haste > 0 ? 1.4 : 1);
    u.x += dx * sp * dt; u.y += dy * sp * dt;
    u.x = clamp(u.x, u.r, W - u.r); u.y = clamp(u.y, u.r, H - u.r);
    u.anim.walk += dt * 10;
  }

  function moveToward(b, u, t, stopAt, dt, behind) {
    const dd = dist(u, t);
    if (dd <= stopAt) return;
    stepMove(b, u, t.x, t.y, dt, 1);
  }

  function separate(b) {
    const us = b.units.filter((u) => u.alive);
    for (let i = 0; i < us.length; i++) {
      for (let j = i + 1; j < us.length; j++) {
        const a = us[i], c = us[j];
        const dx = c.x - a.x, dy = c.y - a.y, dd = Math.hypot(dx, dy) || 0.01, min = a.r + c.r;
        if (dd < min) {
          const push = (min - dd) / 2, nx = dx / dd, ny = dy / dd;
          const wa = c.mass / (a.mass + c.mass), wc = a.mass / (a.mass + c.mass);
          a.x -= nx * push * wa * 2; a.y -= ny * push * wa * 2;
          c.x += nx * push * wc * 2; c.y += ny * push * wc * 2;
        }
      }
    }
    for (const u of us) { u.x = clamp(u.x, u.r * 0.5, W - u.r * 0.5); u.y = clamp(u.y, u.r, H - u.r); }
  }

  function wallCheck(b, u, kbSpeed) {
    const cliff = b.hazards.some((h) => h.kind === 'cliff');
    // Cliff arena: sides are a drop. Hard hits send non-bosses over the edge.
    // Your own fighters only go over when already hurt (below 40%), so it never feels cheap.
    const fragile = u.team === 1 || u.hp < u.maxHp * 0.4;
    if (cliff && !u.boss && fragile && (u.x < u.r * 0.6 || u.x > W - u.r * 0.6) && kbSpeed > 170) {
      b.stats.yeets += u.team === 1 ? 1 : 0;
      emit(b, { type: 'text', x: clamp(u.x, 60, W - 60), y: u.y - 30, text: 'YEET!', color: '#ffffff', big: true });
      const src = b.units.find((q) => q.uid === u.lastHitBy);
      kill(b, u, src, { kind: 'yeet' });
      return;
    }
    let splat = 0;
    if (u.x < u.r) { u.x = u.r; if (Math.abs(u.vx) > 230) splat = Math.abs(u.vx); u.vx = Math.abs(u.vx) * 0.3; }
    if (u.x > W - u.r) { u.x = W - u.r; if (Math.abs(u.vx) > 230) splat = Math.abs(u.vx); u.vx = -Math.abs(u.vx) * 0.3; }
    if (u.y < u.r) { u.y = u.r; if (Math.abs(u.vy) > 230 && u.vy < 0) splat = Math.abs(u.vy); u.vy = Math.abs(u.vy) * 0.3; }
    if (u.y > H - u.r) { u.y = H - u.r; if (Math.abs(u.vy) > 230) splat = Math.abs(u.vy); u.vy = -Math.abs(u.vy) * 0.3; }
    if (splat) {
      const src = b.units.find((q) => q.uid === u.lastHitBy);
      const mul = src && src.team === 0 ? 1 + b.mods.splat : 1;
      if (u.team === 1) b.stats.splats++;
      emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'SPLAT!', color: '#ffe066' });
      damage(b, src || null, u, (8 + splat * 0.06) * mul * (1 + 0.1 * b.gs), { noCrit: true, kind: 'splat' });
      if (src && src.team === 0 && b.mods.synergies.has('bounceHouse')) explode(b, u.x, u.y, 80, src.dmg, 1, src, { kb: 260 });
    }
  }

  function hazardContact(b, u, dt) {
    if (u.team === 0 && b.mods.hazardProof) return;
    for (const h of b.hazards) {
      if (h.kind === 'molten' && dist(u, h) < h.r + u.r * 0.3) {
        const src = b.units.find((q) => q.uid === u.lastHitBy);
        damage(b, src && src.team !== u.team ? src : null, u, u.maxHp * (u.boss ? 0.012 : 0.11) * dt + 6 * dt, { noCrit: true, dot: true, kind: 'hazard', noBlock: true });
        if (b.rng() < dt * 8) emit(b, { type: 'sizzle', x: u.x, y: u.y });
      }
    }
  }

  function updateHazards(b, dt) {
    for (const h of b.hazards) {
      if (h.kind === 'crusher') {
        h.t -= dt;
        if (h.state === 'idle' && h.t <= 0) { h.state = 'warn'; h.t = 1.6; [h.x, h.y] = h.spots[h.spot++ % h.spots.length]; emit(b, { type: 'warn', kind: 'crusher' }); }
        else if (h.state === 'warn' && h.t <= 0) {
          h.state = 'slam'; h.t = 0.5;
          emit(b, { type: 'crush', x: h.x, y: h.y, r: h.r });
          for (const u of alive(b)) {
            if (u.team === 0 && b.mods.hazardProof) continue;
            if (dist(u, h) < h.r + u.r * 0.5) {
              const src = b.units.find((q) => q.uid === u.lastHitBy);
              damage(b, src && src.team !== u.team ? src : null, u, u.maxHp * (u.boss ? 0.06 : 0.45), { noCrit: true, kind: 'hazard', kb: 250, dir: norm(u.x - h.x + 0.1, u.y - h.y) });
              emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'CRUNCH!', color: '#ff6b5a' });
            }
          }
          for (const p of b.props) if (!p.dead && dist(p, h) < h.r + 20) { const [dx, dy] = norm(p.x - h.x + 0.1, p.y - h.y); p.vx = dx * 600; p.vy = dy * 600; p.owner = -1; p.spin = 15; if (p.explosive) p.fuse = 0.2; }
        } else if (h.state === 'slam' && h.t <= 0) { h.state = 'idle'; h.t = 6.5; }
      }
      if (h.kind === 'geyser') {
        h.t -= dt;
        const pools = b.hazards.filter((q) => q.kind === 'molten');
        if (h.state === 'idle' && h.t <= 0) { const p = pools[Math.floor(b.rng() * pools.length)]; h.x = p.x; h.y = p.y; h.state = 'warn'; h.t = 1.2; }
        else if (h.state === 'warn' && h.t <= 0) {
          h.state = 'idle'; h.t = 6.5;
          emit(b, { type: 'geyser', x: h.x, y: h.y });
          for (const u of alive(b)) if (dist(u, h) < h.r + 30 && !(u.team === 0 && b.mods.hazardProof)) {
            damage(b, null, u, u.maxHp * (u.boss ? 0.03 : 0.15), { noCrit: true, kind: 'hazard', kb: 480, dir: norm(u.x - h.x + 0.1, u.y - h.y) });
          }
        }
      }
      if (h.kind === 'anvils') {
        h.t -= dt;
        if (h.t <= 0) {
          h.t = 5.5;
          const all = alive(b);
          if (all.length) { const u = pick(b, all); b.pending.push({ x: u.x, y: u.y, r: 46, t: 1.3, T: 1.3, hurts: -1, dmgPct: 0.25, kb: 200, kind: 'anvil' }); }
        }
      }
    }
    // Junk keeps falling from the sky: more ammo for the storm.
    b.junkT -= dt;
    if (b.junkT <= 0) {
      b.junkT = 6;
      if (b.props.filter((p) => !p.dead).length < 16) {
        b.pending.push({ x: 80 + b.rng() * (W - 160), y: 160 + b.rng() * (H - 320), r: 26, t: 1.0, T: 1.0, hurts: -1, dmgPct: 0.06, kb: 120, kind: 'junk' });
      }
    }
  }

  function updatePending(b, dt) {
    for (const p of b.pending) {
      p.t -= dt;
      if (p.t > 0) continue;
      p.done = true;
      emit(b, { type: p.kind === 'magma' || p.kind === 'pound' ? 'explode' : 'thud', x: p.x, y: p.y, r: p.r, kind: p.kind });
      const owner = b.units.find((q) => q.uid === p.owner);
      for (const u of alive(b)) {
        if (p.hurts !== -1 && u.team !== p.hurts) continue;
        if (u.team === 0 && b.mods.hazardProof && p.hurts === -1) continue;
        if (dist(u, p) < p.r + u.r * 0.5) {
          const amt = p.dmg != null ? p.dmg : u.maxHp * (u.boss ? p.dmgPct * 0.25 : p.dmgPct);
          damage(b, owner || null, u, amt, { noCrit: true, kind: p.hurts === -1 ? 'hazard' : 'special', kb: p.kb, dir: norm(u.x - p.x + 0.01, u.y - p.y) });
          if (p.kind === 'anvil') emit(b, { type: 'text', x: u.x, y: u.y - 30, text: 'BONK!', color: '#ffffff' });
        }
      }
      if (p.kind === 'anvil' || p.kind === 'junk') addProp(b, p.x, p.y, p.kind === 'anvil' ? 'anvil' : null);
    }
    b.pending = b.pending.filter((p) => !p.done);
  }

  function updateDelayed(b, dt) {
    for (const d of b.delayed) {
      d.t -= dt;
      if (d.t > 0) continue;
      d.done = true;
      const src = b.units.find((q) => q.uid === d.src), tgt = b.units.find((q) => q.uid === d.tgt);
      if (tgt && tgt.alive) { damage(b, src || null, tgt, d.amount, { noCrit: true, kind: 'echo' }); emit(b, { type: 'echo', x: tgt.x, y: tgt.y }); }
    }
    b.delayed = b.delayed.filter((d) => !d.done);
  }

  function updateStorm(b, dt) {
    const s = b.storm;
    if (s.state === 'idle') {
      if (!b.ending) s.meter = Math.min(1, s.meter + dt / 30 * (1 + b.mods.stormRate));
      return;
    }
    s.t -= dt;
    if (s.state === 'pull') {
      for (const p of b.props) {
        if (p.dead) continue;
        const dx = s.x - p.x, dy = s.y - p.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < s.r) {
          const f = 1500 / p.mass;
          p.vx += (dx / dd) * f * dt; p.vy += (dy / dd) * f * dt;
          // a bit of swirl makes the pile-up chaotic but readable
          p.vx += (-dy / dd) * 500 * dt; p.vy += (dx / dd) * 500 * dt;
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 620) { p.vx *= 620 / sp; p.vy *= 620 / sp; }
          p.owner = 0; p.spin = 10;
        }
      }
      for (const u of alive(b, 1)) {
        const dx = s.x - u.x, dy = s.y - u.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < s.r && dd > 20) {
          const f = (u.boss ? 60 : 420) / Math.sqrt(u.mass);
          u.vx += (dx / dd) * f * dt; u.vy += (dy / dd) * f * dt;
          const sp = Math.hypot(u.vx, u.vy);
          if (sp > 200) { u.vx *= 200 / sp; u.vy *= 200 / sp; }
        }
      }
      if (s.t <= 0) {
        s.state = 'blast'; s.t = 0.6;
        emit(b, { type: 'stormBlast', x: s.x, y: s.y });
        const dmg = avgSquadDmg(b) * 2.2 * (1 + b.mods.stormDmg);
        for (const u of alive(b, 1)) {
          const dd = dist(u, s);
          if (dd < 240 + u.r) damage(b, null, u, dmg * (1 - dd / 480) + u.maxHp * (u.boss ? 0.02 : 0.08), { noCrit: true, kind: 'storm', kb: 700, dir: norm(u.x - s.x + 0.1, u.y - s.y) });
        }
        for (const p of b.props) {
          if (p.dead) continue;
          const dd = dist(p, s);
          if (dd < 280) {
            const [dx, dy] = norm(p.x - s.x + (b.rng() - 0.5), p.y - s.y + (b.rng() - 0.5));
            p.vx = dx * 700 / Math.sqrt(p.mass); p.vy = dy * 700 / Math.sqrt(p.mass); p.owner = 0; p.spin = 20;
            if (p.explosive) p.fuse = 0.1 + b.rng() * 0.3;
          }
        }
        if (b.mods.synergies.has('humanMagnet')) for (const f of alive(b, 0)) heal(b, f, f.maxHp * 0.25);
      }
    } else if (s.state === 'blast' && s.t <= 0) s.state = 'idle';
  }

  function updateBossStorm(b, dt) {
    const s = b.bossStorm;
    if (!s) return;
    s.t -= dt;
    if (s.state === 'warn' && s.t <= 0) { s.state = 'pull'; s.t = 1.6; }
    else if (s.state === 'pull') {
      for (const u of alive(b, 0)) {
        const dx = s.x - u.x, dy = s.y - u.y, dd = Math.hypot(dx, dy) || 1;
        if (dd > 30) { const f = 300 / Math.sqrt(u.mass) * (u.st.shield > 0 ? 0.2 : 1); u.vx += (dx / dd) * f * dt; u.vy += (dy / dd) * f * dt; }
      }
      if (s.t <= 0) {
        const owner = b.units.find((q) => q.uid === s.owner);
        emit(b, { type: 'stormBlast', x: s.x, y: s.y, enemy: true });
        for (const u of alive(b, 0)) {
          const dd = dist(u, s);
          if (dd < 220) {
            // Blast sideways toward the cliffs: dangerous, but telegraphed and avoidable with a shield.
            const dir = norm(u.x - s.x + (u.x < s.x ? -40 : 40), (u.y - s.y) * 0.4);
            damage(b, owner || null, u, (owner ? owner.dmg : 20) * 1.3, { noCrit: true, kind: 'special', kb: 380, dir });
          }
        }
        b.bossStorm = null;
      }
    }
  }

  function updateProjectiles(b, dt) {
    for (const p of b.projectiles) {
      const owner = b.units.find((q) => q.uid === p.owner);
      if (p.lob) {
        p.t += dt;
        const k = Math.min(1, p.t / p.T);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 90;
        p.k = k;
        if (k >= 1) {
          p.dead = true;
          const base = p.dmgAbs != null ? p.dmgAbs : (owner ? owner.dmg : 20) * p.mult;
          explode(b, p.tx, p.ty, p.splash, base, 1 - p.team, owner || null, { kb: p.kb });
          if (owner && owner.team === 0 && p.kind === 'bomb') {
            const hitT = alive(b, 1).find((e) => dist(e, { x: p.tx, y: p.ty }) < p.splash);
            if (hitT && b.mods.ricochet) strike(b, owner, hitT, 0.01, {}); // lets fork/echo/stun trigger off bombs
          }
        }
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0 || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.dead = true; continue; }
      for (const u of b.units) {
        if (!u.alive || u.team === p.team || p.hitSet.has(u.uid)) continue;
        if (d2(u, p) < (u.r + p.r) ** 2) {
          p.hitSet.add(u.uid);
          if (owner && owner.alive) {
            if (p.kind === 'shock') damage(b, owner, u, owner.dmg * p.mult, { kb: p.kb, dir: norm(p.vx, p.vy), kind: 'shock' });
            else strike(b, owner, u, p.mult, { kb: p.kb });
          } else damage(b, null, u, (p.dmgAbs || 10) * p.mult, { kb: p.kb, dir: norm(p.vx, p.vy) });
          emit(b, { type: 'impact', x: p.x, y: p.y, kind: p.kind });
          if (!p.pierce) { p.dead = true; break; }
        }
      }
      // shots knock props around and set off barrels
      for (const pr of b.props) {
        if (pr.dead || p.dead) continue;
        if (d2(pr, p) < (pr.r + p.r) ** 2) {
          pr.vx += p.vx * 0.3 / pr.mass; pr.vy += p.vy * 0.3 / pr.mass;
          if (pr.explosive) { pr.fuse = 0.05; pr.owner = p.team; }
          if (!p.pierce) p.dead = true;
        }
      }
    }
    b.projectiles = b.projectiles.filter((p) => !p.dead);
  }

  function updateTraps(b, dt) {
    for (const t of b.traps) {
      t.life -= dt; if (t.arm > 0) t.arm -= dt;
      if (t.life <= 0) { t.dead = true; continue; }
      if (t.arm > 0) continue;
      for (const u of alive(b, 1 - t.team)) {
        if (dist(u, t) < t.r + u.r * 0.6) {
          t.dead = true;
          const owner = b.units.find((q) => q.uid === t.owner);
          u.st.root = u.boss ? 0.5 : 1.6;
          if (b.mods.synergies.has('trapCard') && !u.boss) { u.st.confuse = 2.5; u.target = null; }
          damage(b, owner || null, u, t.dmg, { noCrit: false, kind: 'trap' });
          emit(b, { type: 'trap', x: t.x, y: t.y });
          break;
        }
      }
    }
    b.traps = b.traps.filter((t) => !t.dead);
  }

  function updateProps(b, dt) {
    const props = b.props.filter((p) => !p.dead);
    for (const p of props) {
      if (p.fuse != null) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          p.dead = true;
          const hurts = p.owner === 0 ? 1 : p.owner === 1 ? 0 : -1;
          explode(b, p.x, p.y, 95, 30 + 6 * b.gs + (p.owner === 0 ? avgSquadDmg(b) : 0), hurts, null, { kb: 450 });
          continue;
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const fr = Math.exp(-2.2 * dt);
      p.vx *= fr; p.vy *= fr; p.rot += p.spin * dt; p.spin *= fr;
      if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.6; }
      if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * 0.6; }
      if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * 0.6; }
      if (p.y > H - p.r) { p.y = H - p.r; p.vy = -Math.abs(p.vy) * 0.6; }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < 40) p.owner = -1;
      for (const u of b.units) {
        if (!u.alive) continue;
        const dx = u.x - p.x, dy = u.y - p.y, dd = Math.hypot(dx, dy) || 0.01, min = u.r + p.r;
        if (dd >= min) continue;
        const nx = dx / dd, ny = dy / dd;
        if (sp > 200 && p.owner !== u.team && !(p.hitCd > 0)) {
          // Flying junk: damage scales with speed and weight.
          const amount = (sp - 150) * 0.09 * p.mass * (1 + 0.12 * b.gs) * (p.owner === 0 ? 1 + b.mods.stormDmg : 0.6);
          damage(b, null, u, amount, { noCrit: true, kind: 'prop', kb: sp * 0.5 * p.mass, dir: norm(p.vx, p.vy) });
          emit(b, { type: 'clang', x: p.x, y: p.y, kind: p.kind });
          if (p.kind === 'anvil' || b.rng() < 0.15) emit(b, { type: 'text', x: u.x, y: u.y - 34, text: p.kind === 'anvil' ? 'ANVIL\'D!' : 'CLANG!', color: '#ffe066' });
          p.vx *= -0.35; p.vy *= -0.35; p.hitCd = 0.2;
          if (p.explosive) p.fuse = 0.05;
        }
        // push the prop out of the unit
        p.x = u.x - nx * min; p.y = u.y - ny * min;
        if (sp <= 200) { p.vx -= nx * 30; p.vy -= ny * 30; }
      }
      if (p.hitCd > 0) p.hitCd -= dt;
    }
    // prop vs prop pile-up
    for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) {
      const a = props[i], c = props[j];
      if (a.dead || c.dead) continue;
      const dx = c.x - a.x, dy = c.y - a.y, dd = Math.hypot(dx, dy) || 0.01, min = a.r + c.r;
      if (dd < min) {
        const nx = dx / dd, ny = dy / dd, push = (min - dd) / 2;
        a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -rel * 0.8;
          a.vx -= nx * imp * c.mass / (a.mass + c.mass); a.vy -= ny * imp * c.mass / (a.mass + c.mass);
          c.vx += nx * imp * a.mass / (a.mass + c.mass); c.vy += ny * imp * a.mass / (a.mass + c.mass);
          if (-rel > 300) { emit(b, { type: 'clang', x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }); if (a.explosive && -rel > 450) a.fuse = 0.1; if (c.explosive && -rel > 450) c.fuse = 0.1; }
        }
      }
    }
    b.props = b.props.filter((p) => !p.dead);
  }

  function updatePickups(b, dt) {
    for (const pk of b.pickups) {
      pk.t -= dt;
      if (pk.t <= 0) { pk.dead = true; continue; }
      for (const u of alive(b, 0)) {
        if (dist(u, pk) < u.r + 26) {
          pk.dead = true;
          heal(b, u, u.maxHp * 0.08);
          for (const f of alive(b, 0)) if (f.special) f.charge = Math.min(1, f.charge + (b.mods.crown ? 0.12 : 0.05));
          if (b.mods.synergies.has('takeover')) b.bonusScrap += 2;
          emit(b, { type: 'pickup', x: pk.x, y: pk.y });
          break;
        }
      }
    }
    b.pickups = b.pickups.filter((p) => !p.dead);
  }

  // Run until finished or max seconds. Used by tests and the balance checker.
  // pilot: optional fn(b) called each step to press buttons.
  SB.runBattle = function (b, maxSeconds = 200, pilot) {
    const steps = Math.ceil(maxSeconds / DT);
    for (let i = 0; i < steps && !b.result; i++) {
      if (pilot) pilot(b);
      SB.step(b);
      b.events.length = 0;
    }
    return b.result;
  };

  // A simple "decent player": fires specials and storm as soon as they're ready.
  SB.autoPilot = function (b) {
    for (const u of b.units) if (u.team === 0 && u.alive && u.special && u.charge >= 1) SB.useSpecial(b, u.uid);
    if (SB.canStorm(b)) SB.triggerStorm(b);
    if (SB.canConsume(b)) {
      const f = fighters(b).filter((u) => u.alive);
      const ratio = f.reduce((a, u) => a + u.hp, 0) / Math.max(1, f.reduce((a, u) => a + u.maxHp, 0));
      if (b.consumable.id !== 'tape' || ratio < 0.5) SB.useConsumable(b);
    }
  };

  SB.summarize = function (b) {
    const mvp = fighters(b).slice().sort((a, c) => c.dmgDone - a.dmgDone)[0];
    return {
      result: b.result, time: b.t, kills: b.stats.kills, stats: { ...b.stats },
      larryCaught: b.larryCaught, larryEscaped: b.larryEscaped, bonusScrap: b.bonusScrap,
      consumableUsed: b.consumable ? b.consumable.used : 0, consumableId: b.consumable ? b.consumable.id : null,
      mvp: mvp ? { id: mvp.id, name: mvp.name, dmg: Math.round(mvp.dmgDone) } : null,
      enemyHpLeft: (() => { const e = b.units.filter((u) => u.team === 1 && u.id !== 'larry'); const max = e.reduce((a, u) => a + u.maxHp, 0); return max ? e.reduce((a, u) => a + (u.alive ? Math.max(0, u.hp) : 0), 0) / max : 0; })(),
      survivors: fighters(b).filter((u) => u.alive).map((u) => u.id),
    };
  };
})();
