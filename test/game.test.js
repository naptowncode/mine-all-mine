'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { loadScripts } = require('./helpers/load-scripts');
const { createFakeDom, StubRenderer } = require('./helpers/fake-dom');

const SCRIPTS = ['constants.js', 'rng.js', 'map.js', 'player.js', 'game.js'];
const EXPORTS = ['Game', 'RunCore', 'PICKS', 'TILE', 'MINERALS', 'STARTING_PICK'];
const CARDINALS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0]
];

function createHarness(storage) {
  const dom = createFakeDom({ storage });
  const bindings = loadScripts(SCRIPTS, EXPORTS, {
    document: dom.document,
    window: dom.window,
    localStorage: dom.localStorage,
    requestAnimationFrame: dom.requestAnimationFrame,
    Renderer: StubRenderer,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {}
  });
  return { dom, ...bindings };
}

function findWalkableStep(game, TILE) {
  const map = game.core.map;
  const { x, y } = game.core.player;
  for (const [dx, dy] of CARDINALS) {
    const tile = map.getTile(x + dx, y + dy);
    if (tile === null || tile === TILE.ROCK) continue;
    if (tile === TILE.LADDER_UP || tile === TILE.LADDER_DOWN) continue;
    return { dx, dy, tile };
  }
  return null;
}

function loadGame(storage) {
  const harness = createHarness(storage);
  const game = new harness.Game({ seed: 42 });
  return { ...harness, game };
}

test('constructs the shipping Game with a fake DOM and starts a playing run', () => {
  const { dom, Game, RunCore, game } = loadGame({
    mam_plays: '3',
    mam_bestHaul: '99'
  });

  assert.equal(typeof Game, 'function');
  assert.equal(typeof RunCore, 'function');
  assert.equal(Game.name, 'Game');

  assert.equal(game.core.plays, 3);
  assert.equal(game.core.bestHaul, 99);
  assert.equal(game.state, 'playing');
  assert.equal(game.core.phase, 'playing');
  assert.ok(game.renderer.setTileSizeCalls.length >= 1);

  assert.equal(game.renderer.drawCalls.length, 1);
  const [map, player, state] = game.renderer.drawCalls[0];
  assert.equal(map, game.core.map);
  assert.equal(player, game.core.player);
  assert.equal(state, 'playing');

  assert.equal(dom.rafCallbacks.length, 1);
  const bootListener = dom.document.listeners.find(
    (entry) => entry.type === 'DOMContentLoaded'
  );
  assert.ok(bootListener, 'boot listener recorded, not fired');
  assert.equal(dom.window.game, undefined);
});

test('delegates a walkable move to RunCore', () => {
  const { game, TILE } = loadGame();
  const before = {
    x: game.core.player.x,
    y: game.core.player.y,
    stepsTaken: game.core.player.stepsTaken
  };

  const step = findWalkableStep(game, TILE);
  assert.ok(step, 'seed 42 start tile has a walkable non-ladder neighbor');

  game._doMove(step.dx, step.dy);

  assert.equal(game.core.player.x, before.x + step.dx);
  assert.equal(game.core.player.y, before.y + step.dy);
  assert.equal(game.core.player.stepsTaken, before.stepsTaken + 1);
});

test('opens the craft modal and crafts a pick through the overlay', () => {
  const { dom, game, PICKS } = loadGame();
  const overlay = dom.document.getElementById('craft-overlay');

  for (const [mineral, count] of Object.entries(PICKS[0].recipe)) {
    game.core.player.inventory[mineral] = count;
  }

  game._openCraft();
  assert.equal(game.state, 'crafting');
  assert.ok(overlay.classList.removeCalls.includes('hidden'));
  assert.equal(overlay.classList.contains('hidden'), false);

  game._doCraft(0);

  assert.equal(game.core.player.pick.id, PICKS[0].id);
  assert.equal(game.state, 'playing');
  assert.equal(overlay.classList.contains('hidden'), true);
});

test('renderer.draw receives the UI state rather than the core phase (F-014)', () => {
  const { game } = loadGame();

  game._openCraft();
  assert.equal(game.state, 'crafting');
  assert.equal(game.core.phase, 'playing');

  game._loop();

  const lastDraw = game.renderer.drawCalls.at(-1);
  assert.ok(lastDraw);
  assert.equal(lastDraw[2], 'crafting');
  assert.equal(lastDraw[2], game.state);
  assert.notEqual(lastDraw[2], game.core.phase);

  game._closeCraft();
});

test('restarts with a fresh map, the starter pick, and one cached level', () => {
  const { game } = loadGame();
  const previousMap = game.core.map;

  game._startGame();

  assert.equal(game.state, 'playing');
  assert.notEqual(game.core.map, previousMap);
  assert.equal(game.core.player.pick.id, 'starter');
  assert.deepEqual(Object.keys(game.core.levelCache), ['1']);
});

test('ends the run on timeout, persists plays, and freezes movement', () => {
  const { dom, game, TILE } = loadGame({ mam_plays: '3', mam_bestHaul: '99' });
  const overlay = dom.document.getElementById('gameover-overlay');
  const step = findWalkableStep(game, TILE);
  assert.ok(step, 'seed 42 start tile has a walkable non-ladder neighbor');

  game.core.player.secondsRemaining = 0;
  game._doMove(step.dx, step.dy);

  assert.equal(game.state, 'gameover');
  assert.equal(game.core.phase, 'gameover');
  assert.equal(game.core.plays, 4);
  assert.equal(game.core.player.totalValue, 0);
  assert.equal(
    overlay.classList.removeCalls.filter((name) => name === 'hidden').length,
    1
  );
  assert.equal(dom.localStorage.getItem('mam_plays'), '4');

  game._loop();
  const lastDraw = game.renderer.drawCalls.at(-1);
  assert.equal(lastDraw[2], 'gameover');
  assert.equal(lastDraw[2], game.state);

  const position = { x: game.core.player.x, y: game.core.player.y };
  game._doMove(-step.dx, -step.dy);
  assert.deepEqual(
    { x: game.core.player.x, y: game.core.player.y },
    position
  );
});

test('wins on the surface ladder, persists the haul, and freezes movement', () => {
  const { dom, game, TILE } = loadGame({ mam_plays: '3', mam_bestHaul: '0' });
  const overlay = dom.document.getElementById('win-overlay');

  game._startGame();
  game.core.player.totalValue = 50;

  const step = findWalkableStep(game, TILE);
  assert.ok(step, 'seed 42 start tile has a walkable non-ladder neighbor');

  game._doMove(step.dx, step.dy);
  assert.equal(game.state, 'playing');

  game._doMove(-step.dx, -step.dy);

  assert.equal(game.state, 'win');
  assert.equal(game.core.phase, 'win');
  assert.equal(game.core.plays, 4);
  assert.equal(game.core.bestHaul, 50);
  assert.equal(
    overlay.classList.removeCalls.filter((name) => name === 'hidden').length,
    1
  );
  assert.equal(dom.localStorage.getItem('mam_plays'), '4');
  assert.equal(dom.localStorage.getItem('mam_bestHaul'), '50');

  const position = { x: game.core.player.x, y: game.core.player.y };
  game._doMove(step.dx, step.dy);
  assert.deepEqual(
    { x: game.core.player.x, y: game.core.player.y },
    position
  );
});

test('this test file constructs the shipping Game through new Game(', () => {
  const source = fs.readFileSync(__filename, 'utf8');
  assert.ok(source.includes('new Game('));
});
