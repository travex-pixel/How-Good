// SCRAPBOUND UI glue: screens, input, game loop. Logic lives in sim.js / progress.js.
(function () {
  const SB = globalThis.SB;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Storage that never throws (private mode, blocked cookies, etc.)
  const store = (() => {
    try { const k = '__sb_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) {
      const m = new Map();
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    }
  })();
  const params = new URLSearchParams(location.search);
  const DEBUG_SPEED = Math.max(0.25, Math.min(20, +params.get('speed') || 1));
  const FIXED_SEED = params.has('seed') ? +params.get('seed') : null;

  let save = SB.loadSave(store);
  const A = SB.Audio;
  A.muted = save.settings.mute;
  A.musicOn = save.settings.music;
  const renderer = new SB.Renderer($('game'));
  const prefersReduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const G = {
    screen: 'camp', battle: null, paused: false, acc: 0, hitstop: 0, ended: false, scene: null,
    hint: null, openSlot: null, newFighters: new Set(), lastScrap: -1, resetArmed: 0, lastFrame: performance.now(),
    usedSpecial: false, usedStorm: false,
  };
  const persist = () => SB.writeSave(store, save);

  function applySettings() {
    renderer.reducedMotion = save.settings.reducedMotion || prefersReduced;
    document.body.classList.toggle('reduced-motion', !!save.settings.reducedMotion);
    A.setMuted(save.settings.mute);
    A.setMusic(save.settings.music);
    $('btnMute').innerHTML = save.settings.mute
      ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5c1.5 2 1.5 5 0 7M19 6c3 3.5 3 8.5 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    $('btnMute').setAttribute('aria-label', save.settings.mute ? 'Unmute sound' : 'Mute sound');
    for (const [a, b, key] of [['optMusic', 'optMusic2', 'music'], ['optMotion', 'optMotion2', 'reducedMotion'], ['optFast', 'optFast2', 'fast']]) {
      $(a).checked = $(b).checked = !!save.settings[key];
    }
  }

  // ------------------------------------------------------------ small UI helpers
  let toastT = 0;
  function toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  let bannerT = 0;
  function banner(text, sub, ms = 1400) {
    const b = $('banner');
    b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
    b.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), ms);
  }
  function showHint(text, target) {
    const h = $('hint');
    if (G.hint === text) return;
    G.hint = text;
    h.textContent = text; h.hidden = false;
    const ar = $('arena').getBoundingClientRect(), tr = target.getBoundingClientRect();
    const cx = tr.left + tr.width / 2 - ar.left;
    const w = Math.min(h.offsetWidth, ar.width - 16);
    const left = Math.max(w / 2 + 8, Math.min(ar.width - w / 2 - 8, cx));
    h.style.left = left + 'px';
    h.style.setProperty('--arrow', `${50 + ((cx - left) / w) * 100}%`);
  }
  function hideHint() { G.hint = null; $('hint').hidden = true; }
  function portrait(id, size = 128) { const c = el('canvas'); c.width = c.height = size; SB.drawPortrait(c, id); return c; }
  function icon(key, rarity, size = 128) { const c = el('canvas'); c.width = c.height = size; SB.drawIcon(c, key, rarity); return c; }
  function show(id, on) { $(id).hidden = !on; }

  // ------------------------------------------------------------ camp scene (idle arena behind menus)
  function makeScene() {
    const cfg = SB.battleConfig(save, 7);
    cfg.stage = { ...cfg.stage, comp: {} };
    cfg.consumable = null;
    const b = SB.createBattle(cfg);
    b.idle = true; b.events.length = 0; b.pending = [];
    const sq = b.units.filter((u) => u.team === 0);
    sq.forEach((u, i) => { u.x = SB.WORLD.W / 2 + (i - (sq.length - 1) / 2) * 110; u.y = SB.WORLD.H * 0.62; u.facing = 1; });
    return b;
  }

  // ------------------------------------------------------------ camp
  function openCamp() {
    G.screen = 'camp'; G.battle = null; G.paused = false;
    renderer.reset();
    G.scene = makeScene();
    show('controls', false); show('btnTactic', false); show('bossbar', false); hideHint();
    show('reward', false); show('pause', false); show('camp', true);
    $('btnPause').hidden = true;
    renderCamp();
    $('camp').scrollTop = 0;
  }

  function renderCamp() {
    const st = SB.stageFor(save);
    const first = save.battles === 0;
    $('stageLabel').textContent = 'Camp';
    $('campTagline').textContent = first ? 'Your squad fights on its own. You make the big calls.' :
      `${save.wins} wins · ${Object.keys(save.fighters).length}/8 fighters · ${save.found.length}/${Object.keys(SB.ITEMS).length} loot found`;
    const fb = $('btnFight');
    fb.textContent = save.pendingReward ? 'CLAIM YOUR LOOT!' : st.riot ? 'RIOT!' : st.secret ? 'CHASE LARRY!' : 'FIGHT!';
    $('campNext').textContent = save.pendingReward ? 'You left loot on the table.' : `Next: ${st.label}${st.boss ? ' · BOSS!' : ''}`;

    // Squad
    show('secSquad', !first);
    const grid = $('squadGrid'); grid.innerHTML = '';
    for (const id of SB.FIGHTER_ORDER) {
      const f = save.fighters[id], def = SB.FIGHTERS[id];
      const card = el('button', 'f-card');
      card.appendChild(portrait(id));
      if (f) {
        card.appendChild(el('div', 'nm', esc(def.short)));
        card.appendChild(el('div', 'lv', `Lv ${f.level} · ${def.role}`));
        if (save.squad.includes(id)) card.classList.add('in');
        if (G.newFighters.has(id)) card.classList.add('new');
        card.setAttribute('aria-label', `${def.name}, level ${f.level}. ${save.squad.includes(id) ? 'In squad' : 'Benched'}`);
        card.onclick = () => {
          const r = SB.toggleSquad(save, id);
          A.play(r.ok ? 'click' : 'deny');
          if (!r.ok) toast(r.msg); else { persist(); G.newFighters.delete(id); toast(`${def.short}: ${def.blurb}`); }
          G.scene = makeScene(); renderCamp();
        };
      } else {
        card.classList.add('locked');
        card.appendChild(el('div', 'nm', '???'));
        card.appendChild(el('div', 'lv', 'Locked'));
        card.onclick = () => {
          const stage = Object.entries(SB.UNLOCKS).find(([, v]) => v === id);
          const n = stage ? +stage[0] : null;
          const where = n != null ? `Clear stage ${Math.floor(n / 5) + 1}-${(n % 5) + 1}` : '';
          toast(id === 'cursed' ? 'Find Legendary loot... or clear the final boss.' : `${where} to unlock.`);
        };
      }
      grid.appendChild(card);
    }

    // Loadout
    const ownsAny = Object.keys(save.items).length > 0 || Object.values(save.consumables).some((n) => n > 0);
    show('secLoadout', !first && ownsAny);
    const row = $('slotRow'); row.innerHTML = '';
    for (const slot of [...SB.SLOTS, 'pocket']) {
      const id = slot === 'pocket' ? save.pocket : save.equipped[slot];
      const btn = el('button', 'slot' + (G.openSlot === slot ? ' open' : ''));
      const label = slot === 'pocket' ? 'Item' : SB.SLOT_LABELS[slot];
      if (id) {
        const it = slot === 'pocket' ? SB.CONSUMABLES[id] : SB.ITEMS[id];
        btn.appendChild(icon(it.icon, slot === 'pocket' ? null : it.rarity, 104));
        const stars = slot !== 'pocket' && save.items[id] ? ' ' + '★'.repeat(save.items[id]) : '';
        btn.appendChild(el('div', 'nm', esc(it.name) + (slot === 'pocket' ? ` x${save.consumables[id] || 0}` : stars)));
      } else {
        btn.classList.add('empty');
        btn.appendChild(icon(slot === 'weapon' ? 'knife' : slot === 'armor' ? 'pan' : slot === 'trinket' ? 'foot' : 'tape', null, 104));
        btn.appendChild(el('div', 'nm', 'Empty'));
      }
      btn.appendChild(el('div', 'sl', label));
      btn.onclick = () => { G.openSlot = G.openSlot === slot ? null : slot; A.play('click'); renderCamp(); };
      row.appendChild(btn);
    }
    renderPicker();
    const syn = SB.activeSynergies([save.equipped.weapon, save.equipped.armor, save.equipped.trinket], save.squad);
    $('synergyList').innerHTML = syn.map((s) => `<div class="syn"><b>${esc(s.name)}</b> ${esc(s.text)}</div>`).join('') +
      (syn.length < SB.SYNERGIES.length ? `<div class="syn" style="opacity:.6;border-color:#4a3f55;background:#0003">${SB.SYNERGIES.length - syn.length} secret combos left to discover</div>` : '');

    // Heap
    show('secHeap', !first && (save.scrap > 0 || save.heap > 0));
    $('heapName').textContent = SB.HEAP_NAMES[save.heap];
    $('heapPerk').textContent = save.heap ? `+${save.heap * 6}% health, +${save.heap * 4}% damage, better loot` : 'Upgrade for more health, damage and rarer loot.';
    const cost = SB.heapCost(save);
    $('btnHeap').textContent = cost == null ? 'Fully upgraded!' : `Upgrade · ${cost} scrap`;
    $('btnHeap').disabled = cost == null;
    drawHeap($('heapCanvas'), save.heap);

    // Collection
    show('secCollection', save.found.length > 0);
    $('foundCount').textContent = `${save.found.length}/${Object.keys(SB.ITEMS).length}`;
    const col = $('collection'); col.innerHTML = '';
    const ids = Object.keys(SB.ITEMS).sort((a, b) => SB.ITEMS[a].rarity - SB.ITEMS[b].rarity);
    for (const id of ids) {
      const it = SB.ITEMS[id];
      const b = el('button');
      if (save.found.includes(id)) {
        b.appendChild(icon(it.icon, it.rarity, 88));
        b.style.borderColor = SB.RARITY_COLORS[it.rarity];
        b.setAttribute('aria-label', it.name);
        b.onclick = () => toast(`${it.name} (${SB.RARITIES[it.rarity]}): ${it.text}`, 3200);
      } else {
        b.textContent = '?';
        b.setAttribute('aria-label', 'Undiscovered item');
        b.onclick = () => toast(`Undiscovered ${SB.RARITIES[it.rarity]} ${SB.SLOT_LABELS[it.slot].toLowerCase()}.`);
      }
      col.appendChild(b);
    }
    $('btnReset').textContent = G.resetArmed > performance.now() ? 'Tap again to wipe EVERYTHING' : 'Reset progress';
    $('btnReset').classList.toggle('armed', G.resetArmed > performance.now());
    updateScrap();
  }

  function renderPicker() {
    const pk = $('slotPicker');
    const slot = G.openSlot;
    pk.hidden = !slot; pk.innerHTML = '';
    if (!slot) return;
    if (slot === 'pocket') {
      const ids = Object.keys(SB.CONSUMABLES).filter((id) => save.consumables[id] > 0);
      if (!ids.length) pk.appendChild(el('div', 'empty-msg', 'No items yet. Win fights to find some.'));
      for (const id of ids) {
        const c = SB.CONSUMABLES[id];
        const row = el('div', 'pick-row' + (save.pocket === id ? ' on' : ''));
        row.appendChild(icon(c.icon, null, 88));
        row.appendChild(el('div', 'info', `<div class="nm">${esc(c.name)} x${save.consumables[id]}</div><div class="tx">${esc(c.text)}</div>`));
        const b = el('button', '', save.pocket === id ? 'Packed' : 'Pack');
        b.onclick = () => { const r = SB.setPocket(save, id); A.play(r.ok ? 'click' : 'deny'); persist(); renderCamp(); };
        row.appendChild(b); pk.appendChild(row);
      }
      return;
    }
    const ids = Object.keys(save.items).filter((id) => SB.ITEMS[id].slot === slot).sort((a, b) => SB.ITEMS[b].rarity - SB.ITEMS[a].rarity);
    if (!ids.length) pk.appendChild(el('div', 'empty-msg', `No ${SB.SLOT_LABELS[slot].toLowerCase()}s yet. Win fights to find some.`));
    for (const id of ids) {
      const it = SB.ITEMS[id], on = save.equipped[slot] === id;
      const row = el('div', 'pick-row' + (on ? ' on' : ''));
      row.appendChild(icon(it.icon, it.rarity, 88));
      row.appendChild(el('div', 'info', `<div class="nm" style="color:${SB.RARITY_COLORS[it.rarity]}">${esc(it.name)} ${'★'.repeat(save.items[id])}</div><div class="tx">${esc(it.text)}</div>`));
      const b = el('button', '', on ? 'Remove' : 'Equip');
      b.onclick = () => {
        const r = on ? SB.unequip(save, slot) : SB.equip(save, id);
        A.play(r.ok ? 'click' : 'deny'); if (!r.ok) toast(r.msg);
        persist(); renderCamp();
      };
      const s = el('button', 'sell', `Sell ${Math.round(SB.sellValue(id, save.items[id]))}`);
      s.onclick = () => { const r = SB.sellItem(save, id); if (r.ok) { A.play('coin'); toast(`Sold ${it.name} for ${r.value} scrap.`); persist(); renderCamp(); } };
      row.appendChild(b); row.appendChild(s); pk.appendChild(row);
    }
  }

  function drawHeap(c, lvl) {
    const ctx = c.getContext('2d'), w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    const rng = SB.makeRng(42);
    const cols = ['#7d7d86', '#a86a3b', '#5f6a75', '#8a7360', '#c7ccd4', '#d9534f'];
    const size = 0.45 + lvl * 0.11;
    for (let i = 0; i < 26 + lvl * 14; i++) {
      const a = rng() * Math.PI, r = rng() * w * 0.4 * size;
      const x = w / 2 + Math.cos(a) * r * 1.4, y = h - 8 - Math.sin(a) * r * 0.9;
      ctx.fillStyle = cols[i % cols.length]; ctx.strokeStyle = '#1d1a24'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5 + rng() * 6, 0, 6.3); ctx.fill(); ctx.stroke();
    }
    const top = h - 10 - w * 0.4 * size * 0.9;
    if (lvl >= 1) { ctx.strokeStyle = '#1d1a24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w / 2, top); ctx.lineTo(w / 2, top - 34); ctx.stroke(); ctx.fillStyle = '#ff9a3a'; ctx.fillRect(w / 2, top - 34, 22, 14); }
    if (lvl >= 2) { ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.arc(w * 0.25, h - 18, 14, 0, 6.3); ctx.fill(); }
    if (lvl >= 3) { ctx.fillStyle = '#8796a3'; ctx.fillRect(w * 0.72, top - 4, 18, 50); ctx.fillStyle = '#ffd84a'; ctx.fillRect(w * 0.74, top + 4, 6, 6); }
    if (lvl >= 4) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w * 0.12, h - 8); ctx.lineTo(w * 0.12, 14); ctx.lineTo(w * 0.42, 14); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.4, 14); ctx.lineTo(w * 0.4, 34); ctx.stroke(); }
    if (lvl >= 5) { ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff4fa3'; ctx.shadowColor = '#ff4fa3'; ctx.shadowBlur = 10; ctx.fillText('PALACE', w * 0.62, 22); ctx.shadowBlur = 0; }
  }

  function updateScrap() {
    if (save.scrap !== G.lastScrap) {
      const pill = $('scrapCount').parentElement;
      if (G.lastScrap >= 0 && save.scrap > G.lastScrap) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
      G.lastScrap = save.scrap;
      $('scrapCount').textContent = save.scrap;
    }
  }

  // ------------------------------------------------------------ battle
  function startBattle() {
    A.init();
    if (save.pendingReward) { showReward(null); return; }
    const seed = FIXED_SEED != null ? FIXED_SEED + save.battles : Math.floor(Math.random() * 1e9);
    const b = SB.createBattle(SB.battleConfig(save, seed));
    G.battle = b; G.ended = false; G.acc = 0; G.hitstop = 0; G.paused = false;
    G.usedSpecial = false; G.usedStorm = false;
    renderer.reset();
    G.screen = 'battle';
    show('camp', false); show('reward', false); show('pause', false);
    show('controls', true); show('btnTactic', true);
    $('btnPause').hidden = false;
    $('stageLabel').textContent = b.stage.label;
    buildSpecialButtons(b);
    updateTactic();
    const boss = b.units.find((u) => u.boss);
    show('bossbar', !!boss);
    if (boss) $('bossbar').querySelector('.boss-name').textContent = SB.ENEMIES[boss.id].name;
    const larry = b.units.find((u) => u.id === 'larry');
    banner(boss ? 'BOSS FIGHT!' : larry ? 'CATCH LARRY!' : 'FIGHT!', larry ? 'Knock him out before he escapes with the loot!' : b.arena.intro, 1700);
    A.play('fight');
    hideHint();
    renderer.resize();
  }

  function buildSpecialButtons(b) {
    const box = $('specials'); box.innerHTML = '';
    let i = 0;
    for (const u of b.units) {
      if (u.team !== 0 || u.companion) continue;
      i++;
      const btn = el('button', 'sp-btn');
      btn.dataset.uid = u.uid;
      btn.dataset.special = u.def.specialName;
      btn.setAttribute('aria-label', `${u.def.short} special: ${u.def.specialName}. ${u.def.specialText} (key ${i})`);
      btn.title = `${u.def.specialName}: ${u.def.specialText} (${i})`;
      btn.appendChild(el('span', 'sp-fill'));
      btn.appendChild(portrait(u.id));
      btn.appendChild(el('span', 'sp-name', esc(u.def.short)));
      const hp = el('span', 'sp-hp'); hp.appendChild(el('i')); btn.appendChild(hp);
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); fireSpecial(u.uid, btn); });
      btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fireSpecial(u.uid, btn); } });
      box.appendChild(btn);
    }
    const item = $('btnItem');
    if (b.consumable) {
      item.hidden = false;
      SB.drawIcon(item.querySelector('canvas'), SB.CONSUMABLES[b.consumable.id].icon, null);
      item.setAttribute('aria-label', `Use ${SB.CONSUMABLES[b.consumable.id].name}: ${SB.CONSUMABLES[b.consumable.id].text}`);
      item.title = `${SB.CONSUMABLES[b.consumable.id].name}: ${SB.CONSUMABLES[b.consumable.id].text} (Q)`;
    } else item.hidden = true;
  }

  function fireSpecial(uid, btn) {
    const b = G.battle;
    if (!b || G.paused || G.screen !== 'battle') return;
    A.init();
    if (SB.useSpecial(b, uid)) { G.usedSpecial = true; hideHint(); }
    else {
      A.play('deny');
      const u = b.units.find((q) => q.uid === uid);
      if (u && u.alive && btn) toast(`${u.def.specialName} is charging...`, 900);
    }
  }
  function fireStorm() {
    const b = G.battle;
    if (!b || G.paused || G.screen !== 'battle') return;
    A.init();
    if (SB.triggerStorm(b)) { G.usedStorm = true; hideHint(); banner('SCRAP STORM!', 'Junk incoming...', 1100); }
    else { A.play('deny'); if (b.storm.state === 'idle') toast(`Storm charging: ${Math.floor(b.storm.meter * 100)}%`, 900); }
  }
  function useItem() {
    const b = G.battle;
    if (!b || G.paused || G.screen !== 'battle') return;
    if (SB.useConsumable(b)) { A.play('loot'); toast(`${SB.CONSUMABLES[b.consumable.id].name}!`, 1000); }
    else A.play('deny');
  }
  function cycleTactic() {
    const b = G.battle;
    if (!b || G.paused) return;
    SB.cycleTactic(b); A.play('click'); updateTactic();
    const t = $('btnTactic'); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
    toast({ swarm: 'Squad attacks whoever is NEAREST.', snipe: 'Squad finishes off the WEAKEST enemies.', big: 'Squad gangs up on the BIGGEST enemy.' }[b.tactic], 1500);
  }
  function updateTactic() { if (G.battle) $('btnTactic').querySelector('b').textContent = SB.TACTIC_LABELS[G.battle.tactic]; }

  function updateBattleHUD() {
    const b = G.battle;
    for (const btn of $('specials').children) {
      const u = b.units.find((q) => q.uid === +btn.dataset.uid);
      if (!u) continue;
      const dead = !u.alive;
      btn.classList.toggle('dead', dead);
      btn.classList.toggle('ready', !dead && u.charge >= 1 && !b.ending);
      btn.querySelector('.sp-fill').style.height = dead ? '0%' : `${Math.round(u.charge * 100)}%`;
      btn.querySelector('.sp-hp i').style.width = `${Math.max(0, (u.hp / u.maxHp) * 100)}%`;
    }
    const sb = $('btnStorm');
    sb.querySelector('.storm-fill').style.height = `${Math.round(b.storm.meter * 100)}%`;
    sb.classList.toggle('ready', SB.canStorm(b));
    sb.classList.toggle('active', b.storm.state !== 'idle');
    if (b.consumable) {
      const it = $('btnItem');
      it.querySelector('.item-count').textContent = b.consumable.count;
      it.classList.toggle('cooling', !SB.canConsume(b));
    }
    const boss = b.units.find((u) => u.boss);
    if (boss) $('bossbar').querySelector('.boss-fill').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;

    // Contextual hints for the first few battles: never more than one at a time.
    if (b.ending) { hideHint(); return; }
    if (save.battles < 2 && !G.usedSpecial) {
      const ready = [...$('specials').children].find((x) => x.classList.contains('ready'));
      if (ready) { const u = b.units.find((q) => q.uid === +ready.dataset.uid); showHint(`Tap ${u.def.short.toUpperCase()}: ${u.def.specialName}!`, ready); return; }
    }
    if (save.battles < 4 && !G.usedStorm && SB.canStorm(b)) { showHint('SCRAP STORM ready! Tap it!', sb); return; }
    if (G.hint) hideHint();
  }

  function onBattleEnd() {
    const b = G.battle;
    const summary = SB.summarize(b);
    const report = SB.applyResult(save, summary);
    report.summary = summary;
    for (const id of report.unlocks) G.newFighters.add(id);
    persist();
    hideHint();
    showReward(report);
  }

  // ------------------------------------------------------------ reward screen
  function showReward(report) {
    G.screen = 'reward';
    show('controls', false); show('btnTactic', false); show('bossbar', false); show('pause', false); show('camp', false);
    $('btnPause').hidden = true;
    show('reward', true);
    $('reward').scrollTop = 0;
    const title = $('rewardTitle');
    const win = !report || report.result === 'win';
    title.className = 'result-title' + (win ? '' : ' lose');
    title.textContent = !report ? 'LOOT TIME!' : win ? (report.stage.boss ? 'BOSS DOWN!' : report.stage.secret ? (report.summary.larryCaught ? 'LARRY BAGGED!' : 'CLOSE ONE!') : 'VICTORY!') : 'DEFEATED';
    // re-trigger the pop animation
    title.style.animation = 'none'; void title.offsetWidth; title.style.animation = '';
    const stats = $('rewardStats'); stats.innerHTML = '';
    const unlock = $('rewardUnlock'); unlock.hidden = true; unlock.innerHTML = '';
    const notes = $('rewardNotes'); notes.innerHTML = '';
    if (report) {
      const chips = [`+<b>${report.scrap}</b> scrap`, `+<b>${report.xp}</b> XP`];
      for (const l of report.levelUps) chips.push(`<span>${esc(SB.FIGHTERS[l.id].short)}</span> <b>Lv ${l.level}!</b>`);
      const s = report.summary;
      if (s && s.mvp && win) chips.push(`MVP: <b>${esc(s.mvp.name)}</b>`);
      if (s && s.stats.stormKills) chips.push(`Storm kills: <b>${s.stats.stormKills}</b>`);
      if (s && s.stats.yeets) chips.push(`Yeeted: <b>${s.stats.yeets}</b>`);
      if (s && s.stats.elites) chips.push(`Elites beaten: <b>${s.stats.elites}</b>`);
      if (s && s.stats.hazardKills) chips.push(`Hazard kills: <b>${s.stats.hazardKills}</b>`);
      if (s && s.stats.maxHit > 0 && win) chips.push(`Biggest hit: <b>${s.stats.maxHit}</b>`);
      chips.forEach((c, i) => { const ch = el('span', 'chip' + (c.includes('Lv ') ? ' lvl' : ''), c); ch.style.animationDelay = `${0.15 + i * 0.08}s`; stats.appendChild(ch); });
      for (const id of report.unlocks) addUnlock(id);
      for (const n of report.notes) notes.appendChild(el('div', '', esc(n)));
      if (!win) notes.appendChild(el('div', '', esc('Tip: ' + SB.TIPS[save.losses % SB.TIPS.length])));
      if (report.levelUps.length) setTimeout(() => A.play('levelup'), 500);
      A.play(win ? 'victory' : 'defeat');
      setTimeout(() => A.play('coin'), 300);
    }
    renderCards();
    const next = $('btnNext');
    next.textContent = save.pendingReward ? 'PICK YOUR LOOT FIRST' : win ? 'NEXT FIGHT ▶' : 'TRY AGAIN ▶';
    updateScrap();
  }

  function addUnlock(id) {
    const unlock = $('rewardUnlock');
    unlock.hidden = false;
    const d = SB.FIGHTERS[id];
    const row = el('div', 'unlock');
    row.style.margin = '0'; row.style.border = '0'; row.style.padding = '0'; row.style.background = 'none';
    row.appendChild(portrait(id));
    row.appendChild(el('div', '', `<b>NEW FIGHTER: ${esc(d.name)}</b>${esc(d.blurb)}<br><small>"${esc(d.quips[0])}"</small>`));
    unlock.appendChild(row);
  }

  function renderCards() {
    const cards = $('cards'); cards.innerHTML = ''; cards.classList.remove('chosen');
    $('rewardAfter').textContent = '';
    const pr = save.pendingReward;
    $('pickTitle').hidden = !pr;
    $('pickTitle').textContent = pr && pr.choices.length > 1 ? 'Pick one! (the rest get sold)' : 'Your loot';
    $('btnNext').disabled = !!pr;
    if (!pr) return;
    pr.choices.forEach((c, i) => {
      const card = el('button', 'card');
      card.style.animationDelay = `${0.15 + i * 0.12}s`;
      let rarity = null, name, text, flavour = '', key, tag = '';
      if (c.type === 'item') {
        const it = SB.ITEMS[c.id]; rarity = it.rarity; name = it.name; text = it.text; flavour = it.flavour; key = it.icon;
        if (c.id === 'mortgage') text += ` (Right now: +${15 + Math.min(75, 3 * save.sold)}%)`;
        tag = save.items[c.id] != null ? '<span class="tag up">★ UPGRADE</span>' : '<span class="tag">NEW</span>';
        card.classList.add(SB.RARITIES[rarity].toLowerCase());
        card.style.setProperty('--rc', SB.RARITY_COLORS[rarity]);
      } else if (c.type === 'consumable') {
        const it = SB.CONSUMABLES[c.id]; name = `${it.name} x${c.count}`; text = it.text; flavour = it.flavour; key = it.icon;
        card.style.setProperty('--rc', '#4ff0ff');
      } else if (c.type === 'train') {
        name = 'Training Montage'; text = 'Every fighter in your squad gains +1 level.'; flavour = 'Cue the music.'; key = 'stick';
        card.style.setProperty('--rc', '#5fd068');
      } else {
        name = `${c.amount} Scrap`; text = 'Spend it on your Heap.'; flavour = 'Shiny. Mostly.'; key = 'crown';
        card.style.setProperty('--rc', '#ffd84a');
      }
      card.appendChild(icon(key, rarity, 144));
      card.insertAdjacentHTML('beforeend', `${tag}<div class="rar">${rarity != null ? SB.RARITIES[rarity] + ' ' + SB.SLOT_LABELS[SB.ITEMS[c.id].slot] : c.type === 'consumable' ? 'Battle item' : 'Bonus'}</div>
        <div class="nm">${esc(name)}</div><div class="tx">${esc(text)}</div><div class="fl">${esc(flavour)}</div><span class="take">${c.type === 'item' ? 'TAKE & EQUIP' : 'TAKE'}</span>`);
      card.setAttribute('aria-label', `${name}. ${text}`);
      card.onclick = () => pickCard(i, card);
      cards.appendChild(card);
      if (rarity != null && rarity >= 3) setTimeout(() => A.play('rare'), 450 + i * 150);
    });
  }

  function pickCard(i, cardEl) {
    const r = SB.chooseReward(save, i);
    if (!r.ok) return;
    persist();
    $('cards').classList.add('chosen');
    cardEl.classList.add('picked');
    const c = r.card;
    let msg = '';
    if (c.type === 'item') { msg = `Equipped ${SB.ITEMS[c.id].name}!`; A.play(SB.ITEMS[c.id].rarity >= 3 ? 'rare' : 'loot'); }
    else if (c.type === 'consumable') { msg = `Packed ${c.count}x ${SB.CONSUMABLES[c.id].name}. Use it mid-battle.`; A.play('loot'); }
    else if (c.type === 'train') { msg = 'Squad trained: +1 level each!'; A.play('levelup'); }
    else { msg = `+${c.amount} scrap!`; A.play('coin'); }
    if (r.soldFor) msg += ` Sold the rest for ${r.soldFor} scrap.`;
    const syn = SB.activeSynergies([save.equipped.weapon, save.equipped.armor, save.equipped.trinket], save.squad);
    const fresh = syn.find((s) => c.type === 'item' && (s.needs.items || []).includes(c.id));
    if (fresh) msg += ` COMBO FOUND: ${fresh.name}!`;
    $('rewardAfter').textContent = msg;
    for (const id of r.unlocks) { G.newFighters.add(id); addUnlock(id); toast(`${SB.FIGHTERS[id].name} smelled the loot and joined you!`, 3000); }
    $('btnNext').disabled = false;
    $('btnNext').textContent = 'NEXT FIGHT ▶';
    $('btnNext').focus({ preventScroll: true });
    setTimeout(() => $('btnNext').scrollIntoView({ behavior: save.settings.reducedMotion ? 'auto' : 'smooth', block: 'center' }), 250);
    updateScrap();
  }

  // ------------------------------------------------------------ pause
  function pause() {
    if (G.screen !== 'battle' || !G.battle || G.battle.result) return;
    G.paused = true; show('pause', true); A.play('click');
    $('btnResume').focus({ preventScroll: true });
  }
  function resume() { G.paused = false; show('pause', false); G.lastFrame = performance.now(); }

  // ------------------------------------------------------------ wiring
  $('btnFight').onclick = () => { A.init(); A.play('click'); startBattle(); };
  $('btnNext').onclick = () => { A.play('click'); startBattle(); };
  $('btnToCamp').onclick = () => { if (save.pendingReward) { const n = SB.skipReward(save); persist(); if (n) toast(`Loot sold for ${n} scrap.`); } A.play('click'); openCamp(); };
  $('btnPause').onclick = pause;
  $('btnResume').onclick = resume;
  $('btnRestart').onclick = () => { show('pause', false); startBattle(); };
  $('btnQuit').onclick = () => { show('pause', false); openCamp(); };
  $('btnStorm').addEventListener('pointerdown', (e) => { e.preventDefault(); fireStorm(); });
  $('btnStorm').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fireStorm(); } });
  $('btnItem').addEventListener('pointerdown', (e) => { e.preventDefault(); useItem(); });
  $('btnTactic').onclick = cycleTactic;
  $('btnMute').onclick = () => { A.init(); save.settings.mute = !save.settings.mute; persist(); applySettings(); };
  $('btnHeap').onclick = () => {
    const r = SB.buyHeap(save);
    if (r.ok) { A.play('levelup'); toast(`The Heap grows: ${SB.HEAP_NAMES[save.heap]}!`); persist(); }
    else { A.play('deny'); toast(r.msg); }
    renderCamp();
  };
  $('btnReset').onclick = () => {
    if (G.resetArmed > performance.now()) {
      save = SB.resetSave(store); G.resetArmed = 0; G.newFighters.clear(); G.openSlot = null; G.lastScrap = -1;
      applySettings(); toast('Progress wiped. Fresh junk awaits.'); openCamp();
    } else { G.resetArmed = performance.now() + 3000; renderCamp(); setTimeout(renderCamp, 3100); }
  };
  for (const [a, b, key] of [['optMusic', 'optMusic2', 'music'], ['optMotion', 'optMotion2', 'reducedMotion'], ['optFast', 'optFast2', 'fast']]) {
    for (const id of [a, b]) $(id).onchange = (e) => { A.init(); save.settings[key] = e.target.checked; persist(); applySettings(); };
  }

  // Tap anywhere on the arena during the first moments = friendly nudge, not an error.
  $('game').addEventListener('pointerdown', () => { A.init(); });

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'm') { $('btnMute').click(); return; }
    if (G.screen === 'battle') {
      if (k === 'p' || k === 'escape') { e.preventDefault(); G.paused ? resume() : pause(); return; }
      if (G.paused) return;
      if (k >= '1' && k <= '3') { const btn = $('specials').children[+k - 1]; if (btn) fireSpecial(+btn.dataset.uid, btn); }
      else if (k === ' ' || k === 'e') { e.preventDefault(); fireStorm(); }
      else if (k === 'q') useItem();
      else if (k === 't' || k === 'tab') { e.preventDefault(); cycleTactic(); }
    } else if (k === 'enter' && document.activeElement === document.body) {
      if (G.screen === 'camp') $('btnFight').click();
      else if (G.screen === 'reward' && !$('btnNext').disabled) $('btnNext').click();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.screen === 'battle' && !G.paused) pause(); });
  window.addEventListener('resize', () => renderer.resize());
  if (window.ResizeObserver) new ResizeObserver(() => renderer.resize()).observe($('arena'));

  // ------------------------------------------------------------ main loop
  function frame(now) {
    let dt = Math.min(0.1, (now - G.lastFrame) / 1000);
    G.lastFrame = now;
    if (!document.hidden) renderer.trackPerf(dt);
    try {
      if (G.screen === 'battle' && G.battle) {
        const b = G.battle;
        if (!G.paused) {
          let mul = (save.settings.fast ? 2 : 1) * DEBUG_SPEED;
          if (b.slowmo > 0) { b.slowmo -= dt; mul *= 0.3; }
          if (G.hitstop > 0) { G.hitstop -= dt; mul = 0; }
          G.acc += dt * mul;
          let steps = 0;
          while (G.acc >= SB.DT && steps < 60 * Math.max(1, DEBUG_SPEED)) {
            SB.step(b); G.acc -= SB.DT; steps++;
            if (b.events.length) handleSimEvents(b);
            if (b.result) break;
          }
          if (b.result && !G.ended) { G.ended = true; setTimeout(onBattleEnd, 250); }
          renderer.update(dt * (b.slowmo > 0 ? 0.4 : 1));
        }
        renderer.draw(b);
        if (!G.ended) updateBattleHUD();
      } else {
        const scene = G.scene || (G.scene = makeScene());
        for (const u of scene.units) u.anim.walk += dt * 2;
        renderer.update(dt);
        renderer.draw(G.battle && G.screen === 'reward' ? G.battle : scene);
      }
      updateScrap();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(frame);
  }

  function handleSimEvents(b) {
    const ev = b.events.splice(0);
    renderer.handleEvents(b, ev);
    A.handleEvents(ev);
    for (const e of ev) {
      if (e.type === 'special' && e.team === 0) G.hitstop = 0.06;
      else if (e.type === 'stormBlast') G.hitstop = 0.08;
      else if (e.type === 'banner') banner(e.text, null, 1600);
      else if (e.type === 'synergy') setTimeout(() => toast(`Combo active: ${e.list.join(', ')}`, 2200), 1800);
      else if (e.type === 'death' && e.team === 0 && !e.yeet) { const d = SB.FIGHTERS[e.id] || SB.ENEMIES[e.id]; toast(`${d.short || d.name} is down!`, 1200); }
    }
  }

  // Test & debug hooks (harmless in production)
  window.SBG = {
    get save() { return save; }, get battle() { return G.battle; }, get screen() { return G.screen; }, G,
    winNow() { if (G.battle) for (const u of G.battle.units) if (u.team === 1 && u.alive) SB.damage(G.battle, null, u, 1e9, { noCrit: true }); },
    loseNow() { if (G.battle) for (const u of G.battle.units) if (u.team === 0 && u.alive) { u.reviveT = 0; SB.damage(G.battle, null, u, 1e9, { noCrit: true }); u.alive = false; } },
  };

  // ------------------------------------------------------------ boot
  applySettings();
  openCamp();
  requestAnimationFrame(frame);
})();
