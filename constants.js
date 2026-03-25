// constants.js — Game constants and data definitions

const TILE = {
  ROCK: 0,
  FLOOR: 1,
  TUNNEL: 2,
  LADDER_UP: 3,
  MINERAL: 4,
  LADDER_DOWN: 5
};

const MAP_WIDTH = 60;
const MAP_HEIGHT = 40;
const MAX_DEPTH = 7;
const VIEWPORT_TILES_W = 18;
const VIEWPORT_TILES_H = 15;
const COUNTDOWN_SECONDS = 86400;
const WALK_COST = 5;
const MINE_COST = 300;
const MAX_LOG = 8;

const MINERALS = {
  tin:      { name: 'Tin',      color: '#b0c878', value: 1,  minDepth: 1, weight: 45 },
  copper:   { name: 'Copper',   color: '#ff5500', value: 3,  minDepth: 1, weight: 40 },
  zinc:     { name: 'Zinc',     color: '#e05080', value: 5,  minDepth: 1, weight: 35 },
  iron:     { name: 'Iron',     color: '#cc44ff', value: 8,  minDepth: 2, weight: 30 },
  silver:   { name: 'Silver',   color: '#c8c0d8', value: 15, minDepth: 3, weight: 20 },
  gold:     { name: 'Gold',     color: '#ffdd00', value: 25, minDepth: 4, weight: 10 },
  platinum: { name: 'Platinum', color: '#50d0e8', value: 50, minDepth: 5, weight: 5  }
};

const MINERAL_KEYS = Object.keys(MINERALS);

const STARTING_PICK = {
  id: 'starter',
  name: 'Rusty Pick',
  durability: 20,
  color: '#888877',
  recipe: null
};

const PICKS = [
  {
    id: 'stinum',
    name: 'Stinum Pick',
    durability: 25,
    color: '#b0c878',
    recipe: { tin: 8, copper: 2 }
  },
  {
    id: 'brontix',
    name: 'Brontix Pick',
    durability: 30,
    color: '#ff5500',
    recipe: { tin: 2, copper: 6, zinc: 2 }
  },
  {
    id: 'zinkon',
    name: 'Zinkon Pick',
    durability: 40,
    color: '#e05080',
    recipe: { copper: 4, zinc: 6 }
  },
  {
    id: 'ferium',
    name: 'Ferium Pick',
    durability: 60,
    color: '#cc44ff',
    recipe: { zinc: 2, iron: 8 }
  },
  {
    id: 'electovar',
    name: 'Electovar Pick',
    durability: 90,
    color: '#c8c0d8',
    recipe: { iron: 6, silver: 2, gold: 2 }
  },
  {
    id: 'auripetal',
    name: 'Auripetal Pick',
    durability: 150,
    color: '#ffe066',
    recipe: { gold: 5, platinum: 5 },
    repairCost: { gold: 3, platinum: 2 }
  }
];

// Depth-based color palettes
const DEPTH_PALETTES = [
  null, // index 0 unused
  { rock: '#393326', rockEdge: '#2e2820', floor: '#69584c', floorAlt: '#605040', tunnel: '#79685c' },
  { rock: '#363022', rockEdge: '#2a241c', floor: '#645448', floorAlt: '#5a4a40', tunnel: '#746458' },
  { rock: '#32281c', rockEdge: '#262018', floor: '#5f5044', floorAlt: '#56483a', tunnel: '#6f6054' },
  { rock: '#2d261a', rockEdge: '#221c14', floor: '#5a4c40', floorAlt: '#524238', tunnel: '#6a5c50' },
  { rock: '#2c2216', rockEdge: '#1e1810', floor: '#554838', floorAlt: '#4e4030', tunnel: '#655848' },
  { rock: '#261a0e', rockEdge: '#1a120a', floor: '#504030', floorAlt: '#48382c', tunnel: '#605040' },
  { rock: '#221209', rockEdge: '#180c06', floor: '#4b3a2a', floorAlt: '#423222', tunnel: '#5a4530' }
];

// Utility
function rng(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  } else if (m > 0) {
    return `${m}m ${String(s).padStart(2,'0')}s`;
  } else {
    return `${s}s`;
  }
}

function timerColor(secondsRemaining) {
  const pct = secondsRemaining / COUNTDOWN_SECONDS;
  if (pct <= 0.05) return '#ff2222';
  if (pct <= 0.15) return '#ff8800';
  if (pct <= 0.30) return '#ffdd00';
  return null; // default
}

function getRepairCost(pick) {
  if (!pick || !pick.recipe) return null;
  if (pick.repairCost) return pick.repairCost;
  const cost = {};
  for (const [mineral, count] of Object.entries(pick.recipe)) {
    cost[mineral] = Math.ceil(count / 2);
  }
  return cost;
}
