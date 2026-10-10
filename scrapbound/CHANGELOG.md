# Changelog

## 0.3.0: Shareable and simple

- **Share preview:** a 1200×630 preview card (`preview.png`) and a home-screen icon (`icon.png`), drawn with the game's own art, wired into link-preview tags so links show a picture in chat apps. Regenerate with `node scrapbound/tools/make-preview.mjs`.
- **No scrolling on phones:** camp and every result screen (first win, loot pick, jackpot, defeat) fit on one screen at 390×844 and the small 375×667 iPhone size. A browser test now enforces this.
  - Camp uses tabs (Squad / Gear / Heap / Loot / Settings) with FIGHT pinned at the bottom.
  - The loot screen shows three compact cards side by side, a one-line summary, and a pinned NEXT button. Fun stats appear only on wider screens.
- **The first 30 seconds:** the first screen is a 3-step how-to and one FIGHT button. The first fight shows only the heroes and STORM. The item button appears from fight 2 and Target from fight 3. Measured: hint at 2s, storm at 4s, victory and loot at about 10s.


## 0.2.0: Tanks, a punchier start, and "one more fight" hooks

Measured with new tools that simulate a human-speed player (reacting 2–4s late) instead of a perfect one.

### Tanks that tank
- Clanksalot, Grunthilda and Tusker are tanks: they have armour (30%, 45% and 20%) and **guard** allies within ~150px, absorbing 50% of hits meant for them (Grunthilda: 65%).
- Enemies that get close to a tank lock onto it, and melee enemies prefer tanks.
- Back-line fighters hold formation behind the tank and retreat to it when rushed. On the Nearest tactic, tanks go for whatever is closest to their squishy friends.
- Bug fix during testing: damage absorbed while guarding skipped the tank's own armour.

### A punchier first minute
- Arena 1 enemies start at 62% health and ramp up across the arena. Specials charge 20–25% faster, and the storm fills in 30s instead of 40s.
- The first fight is a smash-fest: 9 enemies, first special ready at 2s, first storm at about 5s.
- The first loot offer is Fork of Destiny, Hammer of Unreasonable Knockback or Bag of Angry Bees.
- Stage 1-4 was a wall (6–27% wins at human speed). It's now winnable, and stages 1-3 and 3-4 were softened.
- Later arenas hit harder (enemy damage grows faster per stage) so the game still gets tense: the bosses at 2-5 and 3-5 take about 1–2 tries.

### "I need to play more"
- **Win streak:** +10% scrap per win in a row (up to +100%) and luckier loot. Losing breaks it, and the screen tells you.
- **Jackpot meter:** every win fills it (bosses count double). At 5 you get a JACKPOT chest of three Epic-or-better items, with confetti. Defeats don't reset it.
- **Next goals strip** in camp and on every result screen: jackpot pips, the next fighter (as a silhouette), and wins until the next boss.
- **"SO CLOSE!"** when you lose with enemies under 30% health.
- Streak flame badge in the top bar.


## 0.1.0: First playable prototype

### Built
- Auto-battler combat simulation (`js/sim.js`): real targeting, movement, cooldowns, projectiles, splash damage, knockback that grows as targets get hurt, wall splats, critical hits, status effects (stun, root, curse, confuse, taunt, shield).
- 8 distinct fighters with their own AI and specials: Sir Clanksalot, Fizzwick, Grunthilda, Bonko, Tusker, Rustmutt, Wick, Morgana.
- 6 enemy types, 3 bosses with telegraphed specials, and a secret encounter (Lootgoblin Larry).
- Signature chaos mechanic: the **Magnetic Scrap Storm**. It pulls loose junk and enemies into a pile-up, then blasts it all outward.
- 3 arenas with hazards: a crusher (Rustbucket Yard), molten pools and geysers (Smeltery), cliffs and falling anvils (Teetering Tip).
- Loot: 24 items across 6 rarities that change how combat works, plus 3 consumables and 10 discoverable synergies.
- Progression: XP and levels, fighter unlocks, the Heap home-base upgrade, a loot collection, and Riot Mode after the campaign.
- Saves to localStorage, with safe loading of corrupt or tampered data and a two-tap reset.
- Procedural cartoon art and synthesized sound effects and music. No asset files.
- Tests: 39 logic tests (Node), 26 browser checks (Playwright, desktop and phone), and headless balance and item-impact tools.

### Pass 1: Fun
- Fighters are drawn 40% larger than their hitboxes so they read on phones.
- Switched to a **portrait arena** (squad at the bottom, enemies at the top) after phone screenshots showed a thin strip with tiny fighters.
- Big Swing now leaps into the nearest crowd, because a test showed it could fire at nothing.
- Replaced the crusher's black-box telegraph with a falling 10-ton press.
- Grunthilda unlocks after the first win, fixing a difficulty spike on stage 1-2 and adding a new fighter within the first minute.
- Calmed the ground texture. "NEXT FIGHT" now looks disabled until you pick loot.

### Pass 2: Depth
- **Bug fix:** Kaboomerang Cutlass's "critical hits explode" was never wired up. The item-impact tool caught it.
- Buffed weak items (Fork of Destiny, Bag of Angry Bees, Baguette, Bouncy Castle Plate, Pointy Stick, Saucepan, Rat's Foot, Goblin Mortgage).
- Tactics now carry bonuses: Weakest executes low-health enemies, Biggest hits bosses and elites harder, Nearest shields your back line.
- Mid-battle **reinforcement waves** and **elite enemies** (Huge, Speedy, Explosive, Shielded, Golden).
- Rebalanced difficulty with the balance tool. Bosses got their own health growth after the dragon proved unbeatable.
- The first fight is forgiving: a player who presses nothing still wins it.

### Pass 3: Polish
- Removed all canvas `shadowBlur` glows (expensive on weak GPUs), cached the static backdrop, and added automatic resolution scaling on slow devices. Busy-battle frame rate went from 51 to 59 fps normally, and from 9 to 20 fps in a 4x-throttled no-GPU test.
- Rapid hits now merge into one growing damage number. Big units get a tint instead of a solid white flash.
- Phone layout: the space above and below the arena became junkyard floor and skyline, the reward screen is more compact, and NEXT scrolls into view after picking loot.
- The Tactic button grew to a 44px tap target (a browser test flagged it at 36px).
