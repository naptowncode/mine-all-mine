'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadScripts } = require('./helpers/load-scripts');
const { serializeRun } = require('./helpers/run-state');

const scripts = ['constants.js', 'rng.js', 'map.js', 'player.js', 'game.js'];

const loaded = loadScripts(scripts, [
  'createRng',
  'RunCore',
  'Player',
  'GameMap',
  'TILE',
  'documentType: typeof document',
  'windowType: typeof window',
  'localStorageType: typeof localStorage',
  'requestAnimationFrameType: typeof requestAnimationFrame',
  'offscreenCanvasType: typeof OffscreenCanvas'
]);

const { createRng, RunCore, Player, GameMap, TILE } = loaded;

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

function findNonLadderWalk(map, startX, startY) {
  for (const [dx, dy] of CARDINALS) {
    if (isWalkableNonLadder(map.getTile(startX + dx, startY + dy))) {
      return { path: [[dx, dy]], x: startX + dx, y: startY + dy };
    }
  }

  const startKey = tileKey(startX, startY);
  const queue = [[startX, startY]];
  const parents = new Map([[startKey, null]]);
  const stepDirs = new Map();
  const maxVisits = map.width * map.height;

  for (let index = 0; index < queue.length && index < maxVisits; index++) {
    const [x, y] = queue[index];

    if (index > 0) {
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

function chooseProgressDirection(map, x, y) {
  for (const [dx, dy] of CARDINALS) {
    if (isWalkableNonLadder(map.getTile(x + dx, y + dy))) {
      return [dx, dy];
    }
  }

  for (const [dx, dy] of CARDINALS) {
    if (map.getTile(x + dx, y + dy) === TILE.ROCK) {
      return [dx, dy];
    }
  }

  for (const [dx, dy] of CARDINALS) {
    const tile = map.getTile(x + dx, y + dy);
    if (tile !== null && tile !== TILE.LADDER_DOWN) {
      return [dx, dy];
    }
  }

  return null;
}

test('game.js exposes RunCore and the VM context has no DOM globals', () => {
  assert.equal(typeof RunCore, 'function');
  assert.equal(loaded.documentType, 'undefined');
  assert.equal(loaded.windowType, 'undefined');
  assert.equal(loaded.localStorageType, 'undefined');
  assert.equal(loaded.requestAnimationFrameType, 'undefined');
  assert.equal(loaded.offscreenCanvasType, 'undefined');
});

test('model constructors require a seeded rng', () => {
  assert.throws(() => new Player(), /seeded rng/);
  assert.throws(() => new GameMap(1), /seeded rng/);
});

test('RunCore starts, moves, and serializes in a no-DOM VM', () => {
  const core = new RunCore(createRng(42));

  core.start();

  assert.equal(typeof core.phase, 'string');
  assert.equal(core.phase, 'playing');

  assert.ok(core.map instanceof GameMap, 'expected core.map to be a GameMap');
  assert.ok(core.player instanceof Player, 'expected core.player to be a Player');
  assert.equal(core.map.width, 60);
  assert.equal(core.map.height, 40);

  for (const grid of [core.map.tiles, core.map.mineralMap, core.map.visited]) {
    assert.ok(Array.isArray(grid));
    assert.equal(grid.length, 40);
    for (const row of grid) {
      assert.ok(Array.isArray(row));
      assert.equal(row.length, 60);
    }
  }

  const walk = findNonLadderWalk(core.map, core.player.x, core.player.y);
  assert.ok(
    walk,
    'expected a walkable non-ladder cell reachable from the start ladder'
  );

  for (const [dx, dy] of walk.path) {
    const walkOutcome = core.move(dx, dy);
    assert.equal(
      walkOutcome,
      'moved',
      `expected deterministic walk step (${dx}, ${dy}) to move, got ${JSON.stringify(walkOutcome)}`
    );
  }

  const before = {
    x: core.player.x,
    y: core.player.y,
    stepsTaken: core.player.stepsTaken
  };
  const direction = chooseProgressDirection(core.map, core.player.x, core.player.y);
  assert.ok(direction, 'expected an in-bounds direction for the extra move');

  const outcome = core.move(direction[0], direction[1]);
  assert.notEqual(outcome, 'blocked', 'extra move must not be blocked');
  assert.ok(
    core.player.stepsTaken > before.stepsTaken ||
      core.player.x !== before.x ||
      core.player.y !== before.y,
    `extra move (${direction[0]}, ${direction[1]}) made no progress: ${JSON.stringify(outcome)}`
  );

  const serialized = serializeRun(core);
  assert.equal(typeof serialized, 'string');

  const parsed = JSON.parse(serialized);
  assert.deepEqual(Object.keys(parsed), [
    'phase',
    'plays',
    'bestHaul',
    'player',
    'map',
    'levelCache'
  ]);
  assert.equal(parsed.phase, core.phase);
  assert.equal(parsed.player.depth, core.player.depth);
  assert.equal(parsed.map.depth, 1);
  assert.ok(parsed.levelCache[1]);
});
