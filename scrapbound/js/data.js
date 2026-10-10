// SCRAPBOUND: LOOT RIOT - game content.
// Classic script (works from file://) that also loads in Node for tests.
(function () {
  const SB = (globalThis.SB = globalThis.SB || {});

  // Portrait arena: your squad starts at the bottom, enemies at the top. Fits phones held upright.
  SB.WORLD = { W: 600, H: 760 };

  // ---------------------------------------------------------------- fighters
  // ai: melee | lobber | charger | trapper | beam | ranged | bomber | healer | flee
  SB.FIGHTERS = {
    knight: {
      name: 'Sir Clanksalot', short: 'Clanksalot', kind: 'human', ai: 'melee',
      hp: 260, dmg: 26, atkCd: 1.15, range: 64, speed: 72, r: 24, mass: 1.5,
      special: 'bigSwing', specialRate: 1 / 10, color: '#a9c1e6', accent: '#e8c35a',
      role: 'Bruiser', blurb: 'Slow. Enormous sword. Hits everything around him.',
      specialName: 'BIG SWING', specialText: 'Leaps into the crowd and spins. Everyone goes flying.',
      quips: ['For honour! And loot!', 'My sword is compensating for nothing.', 'Clank clank, baby.', 'Is this bit of scrap mine? It is now.'],
    },
    goblin: {
      name: 'Fizzwick Boomgrin', short: 'Fizzwick', kind: 'creature', ai: 'lobber',
      hp: 140, dmg: 22, atkCd: 1.6, range: 270, speed: 82, r: 18, mass: 0.8, splash: 54,
      special: 'barrel', specialRate: 1 / 9, color: '#7fc45a', accent: '#d9534f',
      role: 'Demolition', blurb: 'Lobs bombs from the back. Very squishy.',
      specialName: 'BARREL OF REGRET', specialText: 'Lobs a giant barrel at the biggest crowd.',
      quips: ['Fire in the hole! Every hole!', 'I regret nothing. Except that.', 'Heh heh. Boom.', 'Was that load-bearing?'],
    },
    pit: {
      name: 'Grunthilda the Unmovable', short: 'Grunthilda', kind: 'human', ai: 'melee',
      hp: 430, dmg: 15, atkCd: 1.0, range: 56, speed: 62, r: 27, mass: 2.4,
      special: 'ironHug', specialRate: 1 / 11, color: '#b07a4f', accent: '#6d7a86',
      role: 'Tank', blurb: 'Huge health. Pulls every enemy onto herself.',
      specialName: 'IRON HUG', specialText: 'Taunts all enemies and shrugs off 70% damage.',
      quips: ['Come here, sweetie.', 'I have been hit harder by soup.', 'NOBODY moves Grunthilda.', 'Group hug. Mandatory.'],
    },
    chimp: {
      name: 'Bonko', short: 'Bonko', kind: 'creature', ai: 'melee',
      hp: 175, dmg: 12, atkCd: 0.42, range: 46, speed: 145, r: 18, mass: 0.8,
      special: 'monkeyBusiness', specialRate: 1 / 11, color: '#c98b4a', accent: '#f3d27a',
      role: 'Chaos', blurb: 'Fast slaps. Makes enemies fight each other.',
      specialName: 'MONKEY BUSINESS', specialText: 'Confuses nearby enemies. They hit each other.',
      quips: ['OOK!', 'Ook ook? OOK.', '*steals your hat*', 'Banana-based violence!'],
    },
    boar: {
      name: 'Tusker', short: 'Tusker', kind: 'creature', ai: 'charger',
      hp: 310, dmg: 24, atkCd: 1.2, range: 50, speed: 92, r: 24, mass: 1.9,
      special: 'stampede', specialRate: 1 / 10, color: '#8a5a44', accent: '#f2ead3',
      role: 'Charger', blurb: 'Charges through crowds. Huge knockback.',
      specialName: 'STAMPEDE', specialText: 'Charges in a line, bowling everyone over.',
      quips: ['SNORT.', 'HONK. (Boar for "move.")', 'Tusk tusk.', '*aggressive truffle noises*'],
    },
    hound: {
      name: 'Rustmutt', short: 'Rustmutt', kind: 'machine', ai: 'melee',
      hp: 205, dmg: 14, atkCd: 0.55, range: 46, speed: 155, r: 19, mass: 1.0,
      special: 'fetch', specialRate: 1 / 12, color: '#8c97a3', accent: '#e07b39',
      role: 'Support', blurb: 'Quick bites. Fetches scrap to heal the squad.',
      specialName: 'FETCH!', specialText: 'Drags all loose junk to him and heals the squad.',
      quips: ['WOOF.exe', 'Good boy protocol: ENGAGED.', '*eats a bolt*', 'Fetching... fetching...'],
    },
    trickster: {
      name: 'Wick Sneakwell', short: 'Wick', kind: 'human', ai: 'trapper',
      hp: 150, dmg: 15, atkCd: 0.9, range: 240, speed: 92, r: 18, mass: 0.9,
      special: 'trapParty', specialRate: 1 / 10, color: '#6f5aa8', accent: '#e8c35a',
      role: 'Trapper', blurb: 'Shoots from range and drops snap-traps.',
      specialName: 'TRAP PARTY', specialText: 'Scatters six snap-traps under the enemy.',
      quips: ['Watch your step. Please. It helps me.', 'Surprise!', 'That trap was ethically sourced.', 'Snap!'],
    },
    cursed: {
      name: 'Morgana Hexbottom', short: 'Morgana', kind: 'human', ai: 'beam',
      hp: 215, dmg: 24, atkCd: 0.25, range: 215, speed: 76, r: 21, mass: 1.1,
      special: 'hex', specialRate: 1 / 11, color: '#4a3a6b', accent: '#b56cff',
      role: 'Curse', blurb: 'Drains health with a beam. Curses everyone.',
      specialName: 'MILD CURSE', specialText: 'Curses every enemy: damage over time and slow.',
      quips: ['May your socks be forever damp.', 'Cursed. Mildly.', 'I can smell loot.', 'Hex appeal.'],
    },
  };
  SB.FIGHTER_ORDER = ['knight', 'goblin', 'pit', 'chimp', 'boar', 'hound', 'trickster', 'cursed'];

  // ---------------------------------------------------------------- enemies
  SB.ENEMIES = {
    rat: { name: 'Scrap Rat', ai: 'melee', hp: 55, dmg: 7, atkCd: 0.7, range: 34, speed: 118, r: 14, mass: 0.5, color: '#7d7d86' },
    gremlin: { name: 'Crossbow Gremlin', ai: 'ranged', target: 'weakest', hp: 70, dmg: 12, atkCd: 1.4, range: 250, speed: 84, r: 15, mass: 0.6, color: '#5e8f4d' },
    golem: { name: 'Junk Golem', ai: 'melee', hp: 380, dmg: 22, atkCd: 1.6, range: 58, speed: 48, r: 30, mass: 3.2, slam: true, color: '#8a7360' },
    beetle: { name: 'Bomb Beetle', ai: 'bomber', hp: 60, dmg: 60, atkCd: 1, range: 30, speed: 104, r: 16, mass: 0.7, color: '#2f2f3a' },
    shaman: { name: 'Rust Shaman', ai: 'healer', hp: 110, dmg: 8, atkCd: 2.0, range: 200, speed: 80, r: 17, mass: 0.8, heal: 34, color: '#b2593a' },
    squire: { name: 'Tin Can Squire', ai: 'melee', hp: 165, dmg: 14, atkCd: 1.0, range: 46, speed: 80, r: 19, mass: 1.2, block: 0.35, color: '#c7ccd4' },
    kingRust: { name: 'King Rustbucket', ai: 'melee', boss: true, hp: 1400, dmg: 32, atkCd: 1.5, range: 84, speed: 56, r: 44, mass: 7, slam: true, special: 'summonRats', specialRate: 1 / 9, color: '#a8603c' },
    wyrm: { name: 'Smeltwyrm the Mildly Hoarding', ai: 'ranged', boss: true, hp: 2200, dmg: 26, atkCd: 1.6, range: 320, speed: 50, r: 46, mass: 8, splash: 46, special: 'magmaRain', specialRate: 1 / 8, color: '#c2402c' },
    archmagnet: { name: 'The Archmagnet', ai: 'ranged', boss: true, hp: 2800, dmg: 24, atkCd: 1.5, range: 300, speed: 52, r: 44, mass: 9, special: 'reverseStorm', specialRate: 1 / 10, color: '#3c5aa8' },
    larry: { name: 'Lootgoblin Larry', ai: 'flee', hp: 420, dmg: 0, atkCd: 99, range: 0, speed: 112, r: 18, mass: 0.9, color: '#d8b13a' },
    intern: { name: 'The Unpaid Intern', ai: 'melee', hp: 120, dmg: 8, atkCd: 0.8, range: 40, speed: 110, r: 14, mass: 0.6, color: '#d9d2c0' },
  };

  SB.ENEMY_QUIPS = {
    rat: ['Squeak of war!', 'Mine! All mine!'],
    gremlin: ['Pew. Pew.', 'Aim for the squishy one!'],
    golem: ['GOLEM SMASH. GOLEM TIRED.', 'Rust in peace.'],
    shaman: ['Rub some rust on it!', 'Heal! HEAL!'],
    squire: ['For the King! He pays in bottlecaps!'],
    kingRust: ['WHO DARES LOOT MY HEAP?', 'Rats! To me!', 'I am the KING of BINS.'],
    wyrm: ['My hoard! My precious slightly-used hoard!', 'Have some lava. On the house.'],
    archmagnet: ['Everything is attracted to me.', 'Let me pull you closer... to the EDGE.'],
    larry: ['Not the loot! Anything but the loot!', 'Byeeee!'],
  };

  // ---------------------------------------------------------------- arenas
  // Hazard kinds: crusher (telegraphed slam), molten (burning pools), geyser, cliff (sides are drops).
  SB.ARENAS = [
    {
      id: 'yard', name: 'Rustbucket Yard', sky: ['#f6c177', '#e98a5b'], ground: '#a07d5a', ground2: '#8d6b4b',
      accent: '#5b4636', hazards: ['crusher'], props: 9,
      intro: 'Mind the crusher. Feed it enemies.',
    },
    {
      id: 'smeltery', name: 'Molten Muck Smeltery', sky: ['#5b2d4f', '#c1443a'], ground: '#4f4446', ground2: '#3f3638',
      accent: '#ff7b2e', hazards: ['molten', 'geyser'], props: 8,
      intro: 'The orange puddles are hot. Knock enemies into them.',
    },
    {
      id: 'tip', name: 'The Teetering Tip', sky: ['#7cc6e8', '#d8f1f7'], ground: '#7a8f5e', ground2: '#677b4e',
      accent: '#3e5a7a', hazards: ['cliff', 'anvils'], props: 10,
      intro: 'Cliffs on both sides. Knock enemies off the edge!',
    },
  ];

  // Five stages per arena; the last is a boss.
  SB.STAGES = [
    [{ rat: 4, gremlin: 1 }, { rat: 4, gremlin: 2 }, { rat: 3, golem: 1, gremlin: 1, beetle: 1 }, { rat: 4, beetle: 2, gremlin: 2, golem: 1 }, { kingRust: 1, rat: 3 }],
    [{ shaman: 1, golem: 1, rat: 4 }, { beetle: 3, gremlin: 3, rat: 2 }, { golem: 2, shaman: 1, gremlin: 2 }, { squire: 3, shaman: 1, beetle: 2, gremlin: 2 }, { wyrm: 1, gremlin: 2, shaman: 1 }],
    [{ squire: 4, gremlin: 3, rat: 3 }, { golem: 2, beetle: 3, shaman: 2 }, { squire: 3, golem: 1, gremlin: 3, beetle: 2 }, { golem: 3, shaman: 2, gremlin: 3 }, { archmagnet: 1, squire: 2, shaman: 1 }],
  ];
  SB.STAGE_COUNT = 15;

  // Fighter unlocks keyed by global stage index cleared.
  SB.UNLOCKS = { 0: 'pit', 4: 'chimp', 6: 'boar', 9: 'hound', 11: 'trickster', 14: 'cursed' };

  // ---------------------------------------------------------------- loot
  SB.RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
  SB.RARITY_COLORS = ['#c9ccd1', '#5fd068', '#4aa3ff', '#b56cff', '#ffad33', '#ff4fa3'];

  // Effects are read by the combat sim through SB.buildMods().
  SB.ITEMS = {
    // weapons
    butterKnife: { slot: 'weapon', rarity: 0, name: 'Rusty Butter Knife', icon: 'knife', fx: { dmg: 0.15 }, text: '+15% damage.', flavour: "It's seen things. Mostly butter." },
    pointyStick: { slot: 'weapon', rarity: 0, name: 'Pointy Stick of Ambition', icon: 'stick', fx: { atkSpeed: 0.2 }, text: '+20% attack speed.', flavour: 'Dreams of one day being a spear.' },
    baguette: { slot: 'weapon', rarity: 1, name: 'Boomerang Baguette', icon: 'baguette', fx: { echo: 0.45 }, text: 'Every hit comes back for a second bite (45%).', flavour: 'Stale enough to return.' },
    fork: { slot: 'weapon', rarity: 2, name: 'Fork of Destiny', icon: 'fork', fx: { ricochet: 1 }, text: 'Hits ricochet to a nearby enemy (60%).', flavour: 'Destiny has three prongs.' },
    hammer: { slot: 'weapon', rarity: 2, name: 'Hammer of Unreasonable Knockback', icon: 'hammer', fx: { kb: 1.4, splat: 1 }, text: 'Huge knockback. Wall splats hurt double.', flavour: 'Physics has filed a complaint.' },
    cursedAxe: { slot: 'weapon', rarity: 3, name: 'Definitely Not Cursed Axe', icon: 'axe', fx: { dmg: 0.65, cursed: 1 }, text: '+65% damage. Each hit, the curse grows and bites its wielder.', flavour: 'The whispering is normal.' },
    cutlass: { slot: 'weapon', rarity: 3, name: 'Kaboomerang Cutlass', icon: 'cutlass', fx: { crit: 0.12, critBoom: 1 }, text: '+12% crit. Critical hits explode.', flavour: 'Pirate-grade. Pirates refused it.' },
    rollingPin: { slot: 'weapon', rarity: 4, name: "Grandma's Rolling Pin", icon: 'pin', fx: { dmg: 0.25, stunEvery: 4 }, text: '+25% damage. Every 4th hit stuns.', flavour: 'She wants it back. She is coming.' },
    excalibin: { slot: 'weapon', rarity: 5, name: 'Excalibin', icon: 'sword', fx: { dmg: 0.35, crit: 0.2, shockwave: 1 }, text: '+35% dmg, +20% crit. Attacks fire scrap shockwaves.', flavour: 'Pulled from a wheelie bin by the rightful king.' },
    // armour
    saucepan: { slot: 'armor', rarity: 0, name: 'Saucepan Helmet', icon: 'pan', fx: { hp: 0.18 }, text: '+18% health.', flavour: 'Still smells of beans.' },
    bouncyPlate: { slot: 'armor', rarity: 1, name: 'Bouncy Castle Plate', icon: 'bouncy', fx: { hp: 0.1, kbTaken: 0.45, bounce: 1 }, text: 'Take half knockback. Melee attackers bounce off.', flavour: 'No shoes on the armour, please.' },
    barrelArmor: { slot: 'armor', rarity: 1, name: 'Barrel Armour', icon: 'barrel', fx: { hp: 0.32, speed: -0.1, deathBoom: 1 }, text: '+32% health. Fighters explode when they fall.', flavour: 'Fully flammable. Partially armour.' },
    cardigan: { slot: 'armor', rarity: 2, name: 'Thorny Cardigan', icon: 'cardigan', fx: { hp: 0.12, reflect: 0.4 }, text: '+12% health. Reflects 40% melee damage.', flavour: 'Knitted by an angry hedgehog.' },
    magMail: { slot: 'armor', rarity: 3, name: 'Magnetised Mail', icon: 'mail', fx: { hp: 0.15, stormRate: 0.8, stormDmg: 0.5 }, text: 'Scrap Storm charges 80% faster, hits 50% harder.', flavour: 'Fridge magnets stick to you now.' },
    plotArmor: { slot: 'armor', rarity: 4, name: 'Plot Armour', icon: 'scroll', fx: { hp: 0.15, plot: 1 }, text: 'Each fighter survives one fatal hit per battle.', flavour: 'The main characters cannot die. Yet.' },
    onesie: { slot: 'armor', rarity: 5, name: 'Dragon-Scale Onesie', icon: 'onesie', fx: { hp: 0.45, regen: 0.012, hazardProof: 1 }, text: '+45% health, regenerate, ignore arena hazards.', flavour: 'The dragon wants it back. The dragon is cold.' },
    // trinkets
    pocketSand: { slot: 'trinket', rarity: 0, name: 'Pocket Sand', icon: 'sand', fx: { specialRate: 0.3 }, text: 'Specials charge 30% faster.', flavour: 'Sha-sha-sha!' },
    ratFoot: { slot: 'trinket', rarity: 1, name: "Lucky Rat's Foot", icon: 'foot', fx: { crit: 0.18 }, text: '+18% critical hit chance.', flavour: 'The rat was not lucky.' },
    beeBag: { slot: 'trinket', rarity: 1, name: 'Bag of Angry Bees', icon: 'bees', fx: { bees: 1 }, text: 'Bees sting a random enemy every 3 seconds.', flavour: 'Do not open. They know.' },
    intern: { slot: 'trinket', rarity: 2, name: 'The Unpaid Intern', icon: 'intern', fx: { intern: 1 }, text: 'Brings a helper who gets stronger as the squad gets hurt.', flavour: 'Paid in exposure. And dodgeballs.' },
    coupon: { slot: 'trinket', rarity: 2, name: 'Coupon: One Free Revive', icon: 'coupon', fx: { revive: 1 }, text: 'The first fighter to fall gets back up at 50%.', flavour: 'Expires never. Terms: none.' },
    locket: { slot: 'trinket', rarity: 2, name: 'Lodestone Locket', icon: 'locket', fx: { stormPower: 0.5, stormDmg: 0.3 }, text: 'Scrap Storm pulls 50% wider and hits harder.', flavour: 'Contains a picture of a fridge.' },
    mortgage: { slot: 'trinket', rarity: 3, name: 'Goblin Mortgage', icon: 'mortgage', fx: { mortgage: 1 }, text: '+3% damage for every item you have ever sold (max +75%).', flavour: 'Interest rate: yes.' },
    crown: { slot: 'trinket', rarity: 5, name: 'Crown of the Scrap King', icon: 'crown', fx: { crown: 1, specialRate: 0.15 }, text: 'Enemies drop scrap that heals and charges specials.', flavour: 'Heavy is the head. Mostly rust.' },
  };

  SB.CONSUMABLES = {
    tape: { name: 'Duct Tape', icon: 'tape', text: 'Heals the whole squad 40%.', flavour: 'Fixes everything. Including people.' },
    beeJar: { name: 'Jar of Extremely Angry Bees', icon: 'jar', text: 'Releases a swarm that stings every enemy.', flavour: 'Angrier than the bag ones.' },
    pie: { name: 'Suspicious Pie', icon: 'pie', text: 'All specials ready instantly, storm +50%.', flavour: 'Smells fine. Probably.' },
  };

  // Combos discovered by equipping the right things together.
  SB.SYNERGIES = [
    { id: 'forkLightning', name: 'Fork Lightning', needs: { items: ['fork', 'ratFoot'] }, text: 'Ricochets chain 3 times and can crit.' },
    { id: 'stubborn', name: 'Too Stubborn To Die', needs: { items: ['cursedAxe', 'plotArmor'] }, text: 'The axe curse can no longer finish you off.' },
    { id: 'bounceHouse', name: 'Bounce House', needs: { items: ['hammer', 'bouncyPlate'] }, text: 'Wall splats explode.' },
    { id: 'humanMagnet', name: 'Human Magnet', needs: { items: ['magMail', 'locket'] }, text: 'Scrap Storm also heals the squad 25%.' },
    { id: 'takeover', name: 'Hostile Takeover', needs: { items: ['mortgage', 'crown'] }, text: 'Scrap pickups also add real scrap.' },
    { id: 'boarbq', name: 'Boar-B-Q', needs: { fighters: ['boar', 'goblin'] }, text: "Tusker's charges drop live bombs." },
    { id: 'hexHug', name: 'Hex Hug', needs: { fighters: ['pit', 'cursed'] }, text: 'Iron Hug also curses everyone taunted.' },
    { id: 'fetchQuest', name: 'Fetch Quest', needs: { fighters: ['chimp', 'hound'] }, text: 'Defeated enemies drop healing scrap.' },
    { id: 'realKing', name: 'The Real King', needs: { fighters: ['knight'], items: ['excalibin'] }, text: 'Big Swing fires a ring of shockwaves.' },
    { id: 'trapCard', name: 'Trap Card', needs: { fighters: ['trickster', 'chimp'] }, text: 'Traps also confuse.' },
  ];

  SB.HEAP_COSTS = [80, 180, 320, 520, 800];
  SB.HEAP_NAMES = ['A Sad Pile', 'A Respectable Pile', 'The Heap', 'Heap With A Flag', 'Heap Fortress', 'Scrap Palace'];
  SB.MAX_SQUAD = 3;
  SB.MAX_LEVEL = 10;

  SB.TIPS = [
    'Tap a fighter portrait when it glows to fire their special.',
    'The Scrap Storm drags junk into enemies, then blows it all up.',
    'Knock enemies into hazards for big damage.',
    'Low-health enemies fly further when hit. Very satisfying.',
    'Check camp: new loot changes how your squad fights.',
    'TACTIC switches who your squad focuses on.',
  ];
})();
