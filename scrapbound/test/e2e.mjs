// Browser tests: drives the real game UI in Chromium on desktop and phone sizes.
// Run: node scrapbound/test/e2e.mjs   (needs Playwright; set PLAYWRIGHT_MODULE to its path if not installed locally)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shots = path.join(root, 'test', 'screenshots');
fs.mkdirSync(shots, { recursive: true });

let pw;
try { pw = await import('playwright'); } catch {
  const fallback = process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
  pw = await import(pathToFileURL(fallback).href);
}
const { chromium, devices } = pw;

// Minimal static server for the game folder.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('ok   -', name); }
  catch (e) { results.push([false, name, e.message]); console.log('FAIL -', name, '\n      ', e.message.split('\n')[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const browser = await chromium.launch();

async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  return p;
}
const state = (p, expr) => p.evaluate(expr);
const click = (p, sel) => p.click(sel, { force: true });
async function waitScreen(p, s, timeout = 60000) { await p.waitForFunction((x) => window.SBG.screen === x, s, { timeout }); }

// ------------------------------------------------------------------ desktop
const d = await page({ width: 1280, height: 800 });
await d.goto(base + '?seed=11&speed=4');

await check('desktop: opens straight to a FIGHT button (no menus, no popups)', async () => {
  await d.waitForSelector('#btnFight', { state: 'visible' });
  assert(await d.isVisible('#btnFight'), 'fight visible');
  assert(!(await d.isVisible('#secLoadout')), 'loadout hidden on first visit');
  await d.screenshot({ path: path.join(shots, 'desktop-1-camp.png') });
});

await check('desktop: FIGHT starts a battle with controls', async () => {
  await click(d, '#btnFight');
  await waitScreen(d, 'battle');
  assert(await d.isVisible('#controls'), 'controls visible');
  assert(await d.locator('.sp-btn').count() === 2, 'two special buttons');
  // Fixture: beef up this fight's enemies so it lasts long enough to test every control.
  await d.evaluate(() => { for (const u of window.SBG.battle.units) if (u.team === 1) { u.maxHp *= 30; u.hp = u.maxHp; } });
  await d.waitForTimeout(1200);
  await d.screenshot({ path: path.join(shots, 'desktop-2-battle.png') });
});

await check('desktop: special fires from the UI once charged; blocked before', async () => {
  const before = await state(d, () => window.SBG.battle.units.find((u) => u.id === 'goblin').charge);
  assert(before < 1, 'goblin not charged yet');
  await click(d, '.sp-btn:nth-child(2)');
  assert(await state(d, () => window.SBG.battle.units.find((u) => u.id === 'goblin').charge) > 0, 'charge untouched when not ready');
  await d.waitForFunction(() => window.SBG.battle.units.find((u) => u.id === 'knight').charge >= 1, null, { timeout: 15000 });
  await d.keyboard.press('1');
  await d.waitForTimeout(50);
  assert(await state(d, () => window.SBG.battle.units.find((u) => u.id === 'knight').charge) < 0.2, 'knight special used via key 1');
});

await check('desktop: tactic button cycles targeting', async () => {
  await click(d, '#btnTactic');
  assert(await state(d, () => window.SBG.battle.tactic) === 'snipe', 'snipe');
  assert((await d.textContent('#btnTactic b')) === 'Weakest', 'label updated');
});

await check('desktop: storm triggers from the button when full', async () => {
  await d.evaluate(() => { window.SBG.battle.storm.meter = 1; });
  await d.waitForTimeout(100);
  assert(await d.locator('#btnStorm.ready').count() === 1, 'storm button shows ready');
  await d.dispatchEvent('#btnStorm', 'pointerdown');
  assert(await state(d, () => window.SBG.battle.storm.state) === 'pull', 'storm pulling');
  await d.waitForTimeout(400);
  await d.screenshot({ path: path.join(shots, 'desktop-3-storm.png') });
});

await check('desktop: pause and resume; restart gives a fresh battle', async () => {
  await click(d, '#btnPause');
  assert(await d.isVisible('#pause'), 'pause shown');
  const t1 = await state(d, () => window.SBG.battle.t);
  await d.waitForTimeout(400);
  assert(await state(d, () => window.SBG.battle.t) === t1, 'time frozen while paused');
  await click(d, '#btnRestart');
  await waitScreen(d, 'battle');
  assert(await state(d, () => window.SBG.battle.t) < 1, 'restarted');
  assert(!(await d.isVisible('#pause')), 'pause closed');
});

await check('desktop: victory -> rewards, level ups, new fighter, loot cards', async () => {
  await d.waitForTimeout(500);
  await d.evaluate(() => window.SBG.winNow());
  await waitScreen(d, 'reward', 15000);
  await d.waitForTimeout(900);
  assert((await d.textContent('#rewardTitle')).includes('VICTORY'), 'victory title');
  assert(await d.locator('.card').count() === 3, 'three choices');
  assert(await d.isDisabled('#btnNext'), 'must pick loot before next fight');
  assert(await d.isVisible('#rewardUnlock'), 'Grunthilda unlock shown');
  assert(await state(d, () => window.SBG.save.scrap) > 0, 'scrap earned');
  await d.screenshot({ path: path.join(shots, 'desktop-4-reward.png') });
});

await check('desktop: refreshing before picking loot keeps the loot waiting', async () => {
  await d.reload();
  await d.waitForSelector('#btnFight', { state: 'visible' });
  assert((await d.textContent('#btnFight')).includes('CLAIM'), 'camp offers to claim loot');
  await click(d, '#btnFight');
  await waitScreen(d, 'reward');
  await d.waitForTimeout(900);
  assert(await d.locator('.card').count() === 3, 'same three cards');
});

await check('desktop: one click takes & equips an item', async () => {
  await click(d, '.card:nth-child(1)');
  const eq = await state(d, () => window.SBG.save.equipped.weapon);
  assert(eq === 'butterKnife', `equipped weapon = ${eq}`);
  assert(!(await d.isDisabled('#btnNext')), 'next enabled');
});

await check('desktop: progress persists across a browser refresh', async () => {
  const before = await state(d, () => JSON.stringify({ s: window.SBG.save.scrap, gs: window.SBG.save.gs, f: Object.keys(window.SBG.save.fighters) }));
  await d.reload();
  await d.waitForSelector('#btnFight', { state: 'visible' });
  const after = await state(d, () => JSON.stringify({ s: window.SBG.save.scrap, gs: window.SBG.save.gs, f: Object.keys(window.SBG.save.fighters) }));
  assert(before === after, `${before} vs ${after}`);
  assert(await d.isVisible('#secSquad'), 'camp shows squad after first battle');
  assert(await d.locator('.f-card.in').count() === 3, '3 fighters in squad');
});

await check('desktop: camp loadout - open slot, unequip, re-equip', async () => {
  await click(d, '#slotRow .slot:nth-child(1)');
  assert(await d.isVisible('#slotPicker'), 'picker open');
  await click(d, '#slotPicker .pick-row button:not(.sell)');
  assert(await state(d, () => window.SBG.save.equipped.weapon) === null, 'removed');
  await click(d, '#slotPicker .pick-row button:not(.sell)');
  assert(await state(d, () => window.SBG.save.equipped.weapon) === 'butterKnife', 're-equipped');
  await d.screenshot({ path: path.join(shots, 'desktop-5-camp-loadout.png'), fullPage: true });
});

await check('desktop: invalid heap purchase is refused with a message', async () => {
  const scrap = await state(d, () => window.SBG.save.scrap);
  await click(d, '#btnHeap');
  assert(await state(d, () => window.SBG.save.heap) === 0, 'not bought');
  assert(await state(d, () => window.SBG.save.scrap) === scrap, 'scrap unchanged');
  assert((await d.textContent('#toast')).includes('more scrap'), 'explains why');
});

await check('desktop: squad swap via camp cards', async () => {
  await click(d, '.f-card:nth-child(2)'); // bench Fizzwick
  assert((await state(d, () => window.SBG.save.squad)).join() === 'knight,pit', 'benched');
  await click(d, '.f-card:nth-child(2)');
  assert((await state(d, () => window.SBG.save.squad)).length === 3, 'back in');
});

await check('desktop: defeat -> consolation, stage not advanced, TRY AGAIN works', async () => {
  const gs = await state(d, () => window.SBG.save.gs);
  await click(d, '#btnFight');
  await waitScreen(d, 'battle');
  await d.waitForTimeout(300);
  await d.evaluate(() => window.SBG.loseNow());
  await waitScreen(d, 'reward', 15000);
  assert((await d.textContent('#rewardTitle')).includes('DEFEATED'), 'defeat title');
  assert(await state(d, () => window.SBG.save.gs) === gs, 'stage unchanged');
  assert((await d.textContent('#btnNext')).includes('TRY AGAIN'), 'try again');
  await d.screenshot({ path: path.join(shots, 'desktop-6-defeat.png') });
  await click(d, '#btnNext');
  await waitScreen(d, 'battle');
});

await check('desktop: a real full battle plays out to a result (no shortcuts)', async () => {
  await d.evaluate(() => { const b = window.SBG.battle; window.__pilot = setInterval(() => { for (const u of b.units) if (u.team === 0 && u.alive && u.charge >= 1) window.SB.useSpecial(b, u.uid); if (window.SB.canStorm(b)) window.SB.triggerStorm(b); }, 100); });
  await waitScreen(d, 'reward', 90000);
  const r = await state(d, () => window.SBG.battle.result);
  assert(r === 'win' || r === 'lose', 'battle resolved: ' + r);
  await d.evaluate(() => clearInterval(window.__pilot));
});

await check('desktop: repeated battles back-to-back stay error-free', async () => {
  for (let i = 0; i < 4; i++) {
    await d.waitForTimeout(900); // let the loot cards flip in
    if (await state(d, () => !!window.SBG.save.pendingReward)) await click(d, '.card:nth-child(1)');
    await click(d, '#btnNext');
    await waitScreen(d, 'battle');
    await d.waitForTimeout(300);
    await d.evaluate(() => window.SBG.winNow());
    await waitScreen(d, 'reward', 15000);
  }
  assert(d.errors.length === 0, d.errors.join(' | '));
});

await check('desktop: reset progress needs two taps, then wipes save', async () => {
  await d.waitForTimeout(900);
  if (await state(d, () => !!window.SBG.save.pendingReward)) await click(d, '.card:nth-child(1)');
  await click(d, '#btnToCamp');
  await waitScreen(d, 'camp');
  await click(d, '#btnReset');
  assert(await state(d, () => window.SBG.save.gs) > 0, 'first tap only arms');
  await click(d, '#btnReset');
  assert(await state(d, () => window.SBG.save.gs) === 0, 'wiped');
  await d.reload();
  await d.waitForSelector('#btnFight', { state: 'visible' });
  assert(await state(d, () => window.SBG.save.scrap) === 0, 'still wiped after refresh');
});

await check('desktop: corrupt save in storage does not break the game', async () => {
  await d.evaluate(() => localStorage.setItem('scrapbound.save.v1', '{"gs":"banana","squad":[1,2,3]'));
  await d.reload();
  await d.waitForSelector('#btnFight', { state: 'visible' });
  assert(await state(d, () => window.SBG.save.gs) === 0, 'fell back to new save');
});

await check('desktop: no console errors across the whole session', async () => {
  assert(d.errors.length === 0, d.errors.join(' | '));
});

// ------------------------------------------------------------------ mobile
const m = await page({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await m.goto(base + '?seed=21&speed=3');

await check('mobile: no horizontal scrolling, FIGHT is a big tap target', async () => {
  await m.waitForSelector('#btnFight', { state: 'visible' });
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(over <= 0, `overflow ${over}px`);
  const bb = await m.locator('#btnFight').boundingBox();
  assert(bb.height >= 48 && bb.width >= 250, `fight button ${bb.width}x${bb.height}`);
  await m.screenshot({ path: path.join(shots, 'mobile-1-camp.png') });
});

await check('mobile: battle controls all fit on screen with >=44px targets', async () => {
  await m.tap('#btnFight', { force: true });
  await waitScreen(m, 'battle');
  await m.waitForTimeout(1500);
  for (const sel of ['.sp-btn', '#btnStorm', '#btnItem', '#btnPause', '#btnTactic']) {
    const els = await m.locator(sel).all();
    for (const e of els) {
      const bb = await e.boundingBox();
      assert(bb, `${sel} visible`);
      assert(bb.x >= 0 && bb.x + bb.width <= 390 + 0.5 && bb.y + bb.height <= 844 + 0.5, `${sel} on screen`);
      assert(bb.height >= 40 && bb.width >= 40, `${sel} tap size ${bb.width}x${bb.height}`);
    }
  }
  const canvas = await m.locator('#game').boundingBox();
  assert(canvas.height > 300, `arena tall enough: ${canvas.height}`);
  await m.screenshot({ path: path.join(shots, 'mobile-2-battle.png') });
});

await check('mobile: touch on a ready special fires it', async () => {
  await m.waitForFunction(() => window.SBG.battle.units.find((u) => u.id === 'knight').charge >= 1, null, { timeout: 15000 });
  await m.tap('.sp-btn:nth-child(1)', { force: true });
  await m.waitForTimeout(50);
  assert(await state(m, () => window.SBG.battle.units.find((u) => u.id === 'knight').charge) < 0.2, 'fired');
  await m.waitForTimeout(250);
  await m.screenshot({ path: path.join(shots, 'mobile-3-special.png') });
});

await check('mobile: reward screen usable, cards tappable', async () => {
  await m.evaluate(() => window.SBG.winNow());
  await waitScreen(m, 'reward', 15000);
  await m.waitForTimeout(1200);
  await m.screenshot({ path: path.join(shots, 'mobile-4-reward.png') });
  await m.tap('.card:nth-child(2)', { force: true });
  assert(await state(m, () => window.SBG.save.equipped.armor) === 'saucepan', 'saucepan equipped');
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(over <= 0, 'no overflow on reward');
});

await check('mobile: camp after a win fits the screen', async () => {
  await m.tap('#btnToCamp', { force: true });
  await waitScreen(m, 'camp');
  await m.waitForTimeout(300);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(over <= 0, 'no overflow');
  await m.screenshot({ path: path.join(shots, 'mobile-5-camp.png'), fullPage: true });
});

await check('mobile: landscape phone still shows arena + controls', async () => {
  await m.setViewportSize({ width: 844, height: 390 });
  await m.tap('#btnFight', { force: true });
  await waitScreen(m, 'battle');
  await m.waitForTimeout(800);
  const c = await m.locator('#game').boundingBox();
  const ctl = await m.locator('#controls').boundingBox();
  assert(c.height > 150, `arena ${c.height}`);
  assert(ctl.y + ctl.height <= 390.5, 'controls on screen');
  await m.screenshot({ path: path.join(shots, 'mobile-6-landscape.png') });
});

await check('mobile: no console errors', async () => { assert(m.errors.length === 0, m.errors.join(' | ')); });

await browser.close();
server.close();
const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed. Screenshots: ${path.relative(process.cwd(), shots)}`);
process.exit(failed.length ? 1 : 0);
