'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadScripts } = require('./helpers/load-scripts');
const { serializeRun } = require('./helpers/run-state');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SAME_SEED = 42;
const OTHER_SEED = 987654321;
const TRANSITION_SEED = 42;
const FORBIDDEN_DRIVER_NAME = ['Headless', 'Run'].join('');

const loaded = loadScripts(
  ['constants.js', 'rng.js', 'map.js', 'player.js', 'game.js'],
  [
    'createRng',
    'RunCore',
    'PICKS',
    'TILE',
    'MINERALS',
    'MINERAL_KEYS',
    'STARTING_PICK',
    'COUNTDOWN_SECONDS',
    'WALK_COST',
    'getRepairCost',
    'documentType: typeof document',
    'windowType: typeof window',
    'localStorageType: typeof localStorage',
    'requestAnimationFrameType: typeof requestAnimationFrame',
    'offscreenCanvasType: typeof OffscreenCanvas'
  ]
);

const {
  createRng,
  RunCore,
  PICKS,
  TILE,
  MINERALS,
  MINERAL_KEYS,
  STARTING_PICK,
  COUNTDOWN_SECONDS,
  WALK_COST,
  getRepairCost
} = loaded;

const CARDINALS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

function tileKey(x, y) {
  return `${x},${y}`;
}

function isWalkableNonLadder(tile) {
  return tile === TILE.FLOOR || tile === TILE.TUNNEL;
}

function startCore(seed) {
  const core = new RunCore(createRng(seed));
  core.start();
  return core;
}

function bfsWalk(map, startX, startY, goal) {
  const startKey = tileKey(startX, startY);
  const queue = [[startX, startY]];
  const parents = new Map([[startKey, null]]);
  const stepDirs = new Map();
  const maxVisits = map.width * map.height;

  for (let index = 0; index < queue.length && index < maxVisits; index++) {
    const [x, y] = queue[index];

    if (index > 0 && goal(x, y)) {
      const path = [];
      let cursor = tileKey(x, y);
      while (parents.get(cursor) !== null) {
        path.push(stepDirs.get(cursor));
        cursor = parents.get(cursor);
      }
      path.reverse();
      return { path, x, y };
    }

    for (const [dx, dy] of CARDINALS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkableNonLadder(map.getTile(nx, ny))) continue;
      const key = tileKey(nx, ny);
      if (parents.has(key)) continue;
      parents.set(key, tileKey(x, y));
      stepDirs.set(key, [dx, dy]);
      queue.push([nx, ny]);
    }
  }

  return null;
}

function findMineralRockNeighbour(map, x, y, exclude) {
  for (const [dx, dy] of CARDINALS) {
    const rx = x + dx;
    const ry = y + dy;
    if (map.getTile(rx, ry) !== TILE.ROCK) continue;
    const mineralKey = map.getMineral(rx, ry);
    if (mineralKey === null) continue;
    if (exclude && rx === exclude.x && ry === exclude.y) continue;
    return { dx, dy, x: rx, y: ry, mineralKey };
  }
  return null;
}

function findMineralRockApproach(map, startX, startY, exclude) {
  const found = bfsWalk(map, startX, startY, (x, y) => {
    return findMineralRockNeighbour(map, x, y, exclude) !== null;
  });
  if (!found) return null;
  const rock = findMineralRockNeighbour(map, found.x, found.y, exclude);
  return { path: found.path, rock, x: found.x, y: found.y };
}

function findPathToAdjacent(map, startX, startY, target) {
  const direct = CARDINALS.find(
    ([dx, dy]) => startX + dx === target.x && startY + dy === target.y
  );
  if (direct) return { path: [], dir: direct };

  const found = bfsWalk(map, startX, startY, (x, y) => {
    return Math.abs(x - target.x) + Math.abs(y - target.y) === 1;
  });
  if (!found) return null;

  const dir = CARDINALS.find(
    ([dx, dy]) => found.x + dx === target.x && found.y + dy === target.y
  );
  return { path: found.path, dir };
}

function findWalkableNeighbour(map, x, y, exclude) {
  for (const [dx, dy] of CARDINALS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isWalkableNonLadder(map.getTile(nx, ny))) continue;
    if (exclude && exclude.x === nx && exclude.y === ny) continue;
    return { dx, dy, x: nx, y: ny };
  }
  return null;
}

function findWalkSteps(map, startX, startY, length) {
  const startKey = tileKey(startX, startY);
  const queue = [{ x: startX, y: startY, path: [] }];
  const seen = new Set([startKey]);
  const maxVisits = map.width * map.height;

  for (let index = 0; index < queue.length && index < maxVisits; index++) {
    const current = queue[index];
    if (current.path.length === length) {
      return current.path;
    }

    for (const [dx, dy] of CARDINALS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isWalkableNonLadder(map.getTile(nx, ny))) continue;
      const key = tileKey(nx, ny);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        x: nx,
        y: ny,
        path: current.path.concat([[dx, dy]])
      });
    }
  }

  return null;
}

function findMutableTile(map) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.getTile(x, y) === TILE.TUNNEL) {
        return { x, y, to: TILE.FLOOR };
      }
    }
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.getTile(x, y) === TILE.FLOOR) {
        return { x, y, to: TILE.TUNNEL };
      }
    }
  }
  return null;
}

function descendOneLevel(core) {
  const approach = findPathToAdjacent(
    core.map,
    core.player.x,
    core.player.y,
    core.map.downLadderPos
  );
  assert.ok(approach, 'expected a non-ladder path adjacent to the down ladder');

  for (const [dx, dy] of approach.path) {
    const outcome = core.move(dx, dy);
    assert.equal(
      outcome,
      'moved',
      `expected walk step (${dx}, ${dy}) to move, got ${JSON.stringify(outcome)}`
    );
  }

  const outcome = core.move(approach.dir[0], approach.dir[1]);
  assert.equal(outcome, 'descend');
  return outcome;
}

function moveOffLadderAndBack(core) {
  const step = findWalkableNeighbour(core.map, core.player.x, core.player.y);
  assert.ok(step, 'expected a walkable neighbour next to the ladder');
  assert.equal(core.move(step.dx, step.dy), 'moved');
  return core.move(-step.dx, -step.dy);
}

function deriveScript(seed) {
  const core = startCore(seed);
  const approach = findMineralRockApproach(core.map, core.player.x, core.player.y);
  assert.ok(approach, 'expected a reachable mineral-bearing rock');

  const pick = PICKS[0];
  assert.ok(pick && pick.recipe, 'expected the first pick to have a recipe');

  return {
    walk: approach.path,
    mine: [approach.rock.dx, approach.rock.dy],
    mineralKey: approach.rock.mineralKey,
    craftIndex: 0,
    inventory: { ...pick.recipe },
    restart: { plays: 7, bestHaul: 123 },
    postRestartMove: [0, 1]
  };
}

function applyScript(seed, script, { strict = false } = {}) {
  const core = startCore(seed);

  for (const [dx, dy] of script.walk) {
    const outcome = core.move(dx, dy);
    if (strict) {
      assert.equal(
        outcome,
        'moved',
        `expected walk step (${dx}, ${dy}) to move, got ${JSON.stringify(outcome)}`
      );
    }
  }

  const mining = core.move(script.mine[0], script.mine[1]);
  if (strict) {
    assert.ok(mining && typeof mining === 'object', 'expected a mining outcome object');
    assert.equal(mining.result, 'mined');
    assert.equal(typeof mining.success, 'boolean');
    assert.equal(mining.mineralKey, script.mineralKey);
  }

  for (const [mineral, count] of Object.entries(script.inventory)) {
    core.player.inventory[mineral] = count;
  }

  const crafted = core.craft(script.craftIndex);
  if (strict) {
    assert.equal(crafted, true, 'expected the scripted craft to succeed');
  }
  const craftedPickId = core.player.pick ? core.player.pick.id : null;
  if (strict) {
    assert.equal(craftedPickId, PICKS[script.craftIndex].id);
  }

  const mapBeforeRestart = core.map;
  core.plays = script.restart.plays;
  core.bestHaul = script.restart.bestHaul;
  core.restart();

  assert.equal(core.phase, 'playing');
  assert.notEqual(core.map, mapBeforeRestart, 'expected a fresh map object on restart');
  assert.equal(core.map.depth, 1);
  assert.deepEqual(Object.keys(core.levelCache), ['1']);
  assert.equal(core.player.depth, 1);
  assert.equal(core.player.deepestLevel, 1);
  assert.equal(core.player.totalValue, 0);
  assert.equal(core.player.secondsRemaining, COUNTDOWN_SECONDS);
  assert.equal(core.player.stepsTaken, 0);
  assert.equal(core.player.picksBroken, 0);
  assert.equal(core.player.pickDurability, 20);
  assert.equal(core.player.pickDurability, STARTING_PICK.durability);
  assert.equal(core.player.pick.id, 'starter');
  assert.equal(core.player.pick.id, STARTING_PICK.id);
  assert.equal(typeof core.player.x, 'number');
  assert.equal(typeof core.player.y, 'number');
  assert.equal(core.player.x, core.map.upLadderPos.x);
  assert.equal(core.player.y, core.map.upLadderPos.y);
  assert.equal(core.player.log.length, 2);
  assert.equal(core.player.log[0], 'You descend into the mine. Good luck!');
  assert.equal(
    core.player.log[1],
    `Pick: ${STARTING_PICK.name} (${STARTING_PICK.durability} strikes)`
  );
  assert.deepEqual(
    [...Object.keys(core.player.inventory)].sort(),
    Array.from(MINERAL_KEYS).sort()
  );
  for (const mineral of MINERAL_KEYS) {
    assert.equal(core.player.inventory[mineral], 0);
  }
  assert.equal(core.plays, script.restart.plays, 'expected plays to survive restart');
  assert.equal(core.bestHaul, script.restart.bestHaul, 'expected bestHaul to survive restart');

  const restartMove = core.move(script.postRestartMove[0], script.postRestartMove[1]);

  return {
    state: serializeRun(core),
    mining,
    craftedPickId,
    restart: {
      phase: core.phase,
      depth: core.player.depth,
      plays: core.plays,
      bestHaul: core.bestHaul
    },
    restartMove
  };
}

function listProjectJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.kilo') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProjectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

test('VM context has no DOM globals', () => {
  assert.equal(loaded.documentType, 'undefined');
  assert.equal(loaded.windowType, 'undefined');
  assert.equal(loaded.localStorageType, 'undefined');
  assert.equal(loaded.requestAnimationFrameType, 'undefined');
  assert.equal(loaded.offscreenCanvasType, 'undefined');
});

test('scripted run mines, crafts, and preserves stats across restart', (t) => {
  const script = deriveScript(SAME_SEED);
  const result = applyScript(SAME_SEED, script, { strict: true });

  assert.equal(result.mining.result, 'mined');
  assert.equal(result.craftedPickId, PICKS[0].id);
  assert.equal(result.restart.phase, 'playing');
  assert.equal(result.restart.depth, 1);
  assert.equal(result.restart.plays, 7);
  assert.equal(result.restart.bestHaul, 123);

  t.diagnostic(
    `mining outcome: result=${result.mining.result}, success=${result.mining.success}`
  );
  t.diagnostic(`crafted pick: ${result.craftedPickId}`);
  t.diagnostic(
    `restart preserved: phase=${result.restart.phase}, depth=${result.restart.depth}, plays=${result.restart.plays}, bestHaul=${result.restart.bestHaul}`
  );
  t.diagnostic(`post-restart move: ${JSON.stringify(result.restartMove)}`);
});

test('same seed and script replay byte-identical serialized state', (t) => {
  const script = deriveScript(SAME_SEED);
  const first = applyScript(SAME_SEED, script, { strict: true });
  const second = applyScript(SAME_SEED, script, { strict: true });

  assert.equal(first.state, second.state);
  t.diagnostic(
    `same-seed serialized state is byte-identical (${first.state.length} chars)`
  );
});

test('a different seed diverges under the same script', (t) => {
  const script = deriveScript(SAME_SEED);
  const baseline = applyScript(SAME_SEED, script, { strict: true });
  const other = applyScript(OTHER_SEED, script, { strict: false });

  assert.notEqual(other.state, baseline.state);
  t.diagnostic(
    `different-seed serialized state differs (${baseline.state.length} vs ${other.state.length} chars)`
  );
});

test('forced successful mining clears the rock and credits the mineral', () => {
  const core = startCore(SAME_SEED);
  const approach = findMineralRockApproach(core.map, core.player.x, core.player.y);
  assert.ok(approach, 'expected a reachable mineral-bearing rock');

  for (const [dx, dy] of approach.path) {
    assert.equal(core.move(dx, dy), 'moved');
  }

  const target = { x: approach.rock.x, y: approach.rock.y };
  const mineralKey = core.map.getMineral(target.x, target.y);
  assert.ok(mineralKey, 'expected the target rock to hold a mineral');
  assert.equal(core.map.getTile(target.x, target.y), TILE.ROCK);

  const before = {
    stepsTaken: core.player.stepsTaken,
    secondsRemaining: core.player.secondsRemaining,
    pickDurability: core.player.pickDurability,
    inventory: core.player.inventory[mineralKey] || 0,
    totalValue: core.player.totalValue
  };

  const originalRng = core.player.rng;
  let outcome;
  try {
    core.player.rng = { next: () => 0 };
    outcome = core.move(approach.rock.dx, approach.rock.dy);
  } finally {
    core.player.rng = originalRng;
  }

  assert.equal(outcome.result, 'mined');
  assert.equal(typeof outcome.success, 'boolean');
  assert.equal(outcome.success, true);
  assert.ok(core.player.stepsTaken > before.stepsTaken);
  assert.ok(core.player.secondsRemaining < before.secondsRemaining);
  assert.ok(core.player.pickDurability < before.pickDurability);
  assert.equal(core.map.getTile(target.x, target.y), TILE.FLOOR);
  assert.equal(core.map.getMineral(target.x, target.y), null);
  assert.equal(core.player.inventory[mineralKey], before.inventory + 1);
  assert.equal(core.player.totalValue, before.totalValue + MINERALS[mineralKey].value);
});

test('forced failed mining on a second rock leaves it intact and costs half durability', () => {
  const core = startCore(SAME_SEED);
  const first = findMineralRockApproach(core.map, core.player.x, core.player.y);
  assert.ok(first, 'expected a reachable mineral-bearing rock');

  for (const [dx, dy] of first.path) {
    assert.equal(core.move(dx, dy), 'moved');
  }

  const firstTarget = { x: first.rock.x, y: first.rock.y };
  const originalRng = core.player.rng;
  try {
    core.player.rng = { next: () => 0 };
    const firstOutcome = core.move(first.rock.dx, first.rock.dy);
    assert.equal(firstOutcome.success, true);
  } finally {
    core.player.rng = originalRng;
  }
  assert.equal(core.map.getTile(firstTarget.x, firstTarget.y), TILE.FLOOR);

  const second = findMineralRockApproach(
    core.map,
    core.player.x,
    core.player.y,
    firstTarget
  );
  assert.ok(second, 'expected a second reachable mineral-bearing rock');
  assert.notDeepEqual(
    { x: second.rock.x, y: second.rock.y },
    firstTarget,
    'expected a different rock target'
  );

  for (const [dx, dy] of second.path) {
    assert.equal(core.move(dx, dy), 'moved');
  }

  const target = { x: second.rock.x, y: second.rock.y };
  const mineralKey = core.map.getMineral(target.x, target.y);
  assert.ok(mineralKey, 'expected the target rock to hold a mineral');
  assert.equal(core.map.getTile(target.x, target.y), TILE.ROCK);

  const before = {
    stepsTaken: core.player.stepsTaken,
    secondsRemaining: core.player.secondsRemaining,
    pickDurability: core.player.pickDurability
  };

  let outcome;
  try {
    core.player.rng = { next: () => 0.99 };
    outcome = core.move(second.rock.dx, second.rock.dy);
  } finally {
    core.player.rng = originalRng;
  }

  assert.equal(outcome.result, 'mined');
  assert.equal(typeof outcome.success, 'boolean');
  assert.equal(outcome.success, false);
  assert.equal(core.map.getTile(target.x, target.y), TILE.ROCK);
  assert.equal(core.map.getMineral(target.x, target.y), mineralKey);
  assert.ok(core.player.stepsTaken > before.stepsTaken);
  assert.ok(core.player.secondsRemaining < before.secondsRemaining);
  assert.equal(core.player.pickDurability, before.pickDurability - 0.5);
});

test('timeout after a move ends the run and blocks further moves', () => {
  const core = startCore(TRANSITION_SEED);
  const neighbour = findWalkableNeighbour(core.map, core.player.x, core.player.y);
  assert.ok(neighbour, 'expected a walkable non-ladder neighbour of the start');

  core.player.secondsRemaining = 0;
  const outcome = core.move(neighbour.dx, neighbour.dy);
  assert.equal(outcome, 'moved');
  assert.equal(core.phase, 'gameover');
  assert.equal(core.plays, 1);
  assert.equal(core.player.totalValue, 0);

  const before = {
    x: core.player.x,
    y: core.player.y,
    stepsTaken: core.player.stepsTaken,
    plays: core.plays
  };
  const blocked = core.move(-neighbour.dx, -neighbour.dy);
  assert.equal(blocked, undefined);
  assert.equal(core.player.x, before.x);
  assert.equal(core.player.y, before.y);
  assert.equal(core.player.stepsTaken, before.stepsTaken);
  assert.equal(core.phase, 'gameover');
  assert.equal(core.plays, before.plays);
});

test('down ladder descends to level 2 and caches both levels', () => {
  const core = startCore(TRANSITION_SEED);
  descendOneLevel(core);

  assert.equal(core.player.depth, 2);
  assert.equal(core.map.depth, 2);
  assert.deepEqual(Object.keys(core.levelCache), ['1', '2']);
  assert.ok(
    core.player.log.some((entry) => entry.includes('Level 2')),
    'expected the log to mention Level 2'
  );
});

test('up ladder at level 2 ascends back to level 1', () => {
  const core = startCore(TRANSITION_SEED);
  descendOneLevel(core);

  assert.equal(core.player.depth, 2);
  assert.equal(core.player.x, core.map.upLadderPos.x);
  assert.equal(core.player.y, core.map.upLadderPos.y);

  const outcome = moveOffLadderAndBack(core);
  assert.equal(outcome, 'ascend');
  assert.equal(core.player.depth, 1);
  assert.equal(core.map.depth, 1);
  assert.ok(
    core.player.log.some((entry) => entry.includes('Level 1')),
    'expected the log to mention Level 1'
  );
});

test('returning to the level 1 up ladder wins the run', () => {
  const core = startCore(TRANSITION_SEED);
  core.player.totalValue = 50;
  core.bestHaul = 10;

  const outcome = moveOffLadderAndBack(core);
  assert.equal(outcome, 'ascend');
  assert.equal(core.phase, 'win');
  assert.equal(core.plays, 1);
  assert.equal(core.bestHaul, 50);
});

test('repair restores the crafted pick to full durability', () => {
  const core = startCore(TRANSITION_SEED);
  const pick = PICKS[0];
  assert.ok(pick && pick.recipe);

  for (const [mineral, count] of Object.entries(pick.recipe)) {
    core.player.inventory[mineral] = count;
  }

  assert.equal(core.craft(0), true);
  assert.equal(core.player.pick.id, pick.id);
  core.player.pickDurability = 5;

  const cost = getRepairCost(core.player.pick);
  assert.ok(cost);
  for (const [mineral, count] of Object.entries(cost)) {
    core.player.inventory[mineral] = count;
  }

  assert.equal(core.repair(), true);
  assert.equal(core.player.pickDurability, core.player.pick.durability);
  assert.equal(core.player.pick.durability, pick.durability);
});

test('visibility log dims to radius 4 then radius 3', () => {
  const core = startCore(TRANSITION_SEED);
  const walk = findWalkSteps(core.map, core.player.x, core.player.y, 3);
  assert.ok(walk, 'expected a three-step walk through floor and tunnel tiles');

  assert.equal(core.move(walk[0][0], walk[0][1]), 'moved');

  core.player.secondsRemaining = 3600 + WALK_COST;
  assert.equal(core.move(walk[1][0], walk[1][1]), 'moved');
  assert.equal(core.player.secondsRemaining, 3600);
  assert.ok(
    core.player.log.some((entry) => entry.includes('dimming… (radius 4)')),
    'expected the radius 4 dimming log'
  );

  core.player.secondsRemaining = 3599;
  assert.equal(core.move(walk[2][0], walk[2][1]), 'moved');
  assert.ok(
    core.player.log.some((entry) => entry.includes('nearly gone… (radius 3)')),
    'expected the radius 3 dimming log'
  );
  assert.equal(core._prevVisRadius, 3);
});

test('cached level 2 tile survives an ascend and re-descend', () => {
  const core = startCore(TRANSITION_SEED);
  descendOneLevel(core);
  assert.equal(core.player.depth, 2);

  const target = findMutableTile(core.map);
  assert.ok(target, 'expected a floor or tunnel tile on level 2');
  core.map.setTile(target.x, target.y, target.to);

  const ascend = moveOffLadderAndBack(core);
  assert.equal(ascend, 'ascend');
  assert.equal(core.player.depth, 1);
  assert.equal(core.map.depth, 1);

  const descend = moveOffLadderAndBack(core);
  assert.equal(descend, 'descend');
  assert.equal(core.player.depth, 2);
  assert.equal(core.map.depth, 2);
  assert.equal(core.map.getTile(target.x, target.y), target.to);
});

test('shipping game and tests use RunCore with no test-only driver', () => {
  const gameSource = fs.readFileSync(path.join(PROJECT_ROOT, 'game.js'), 'utf8');
  assert.match(gameSource, /class\s+RunCore\b/);
  assert.match(gameSource, /\bnew\s+RunCore\s*\(/);

  const testSource = fs.readFileSync(__filename, 'utf8');
  assert.match(testSource, /\bnew\s+RunCore\s*\(/);

  const offenders = listProjectJsFiles(PROJECT_ROOT).filter((file) => {
    return fs.readFileSync(file, 'utf8').includes(FORBIDDEN_DRIVER_NAME);
  });
  assert.deepEqual(
    offenders,
    [],
    `unexpected test-only driver name in: ${offenders.join(', ')}`
  );
});
