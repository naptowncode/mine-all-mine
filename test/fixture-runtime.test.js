'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fixturePath = path.join(__dirname, '..', 'view.html');
const html = fs.readFileSync(fixturePath, 'utf8');

const inlineScriptPattern =
  /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

function extractInlineScripts(source) {
  return Array.from(source.matchAll(inlineScriptPattern), (match) => ({
    tag: match[0].slice(0, match[0].indexOf('>') + 1),
    source: match[1]
  }));
}

function createContext2dStub() {
  const noop = () => {};
  const gradient = { addColorStop: noop };

  return {
    canvas: null,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: false,
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    drawImage: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    rect: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient
  };
}

function createCanvasStub(id) {
  const context2d = createContext2dStub();
  const canvas = { id, width: 0, height: 0, getContext: () => context2d };
  context2d.canvas = canvas;
  return canvas;
}

function executeFixture() {
  const blocks = extractInlineScripts(html);
  const canvases = new Map();
  const calls = {
    constructor: [],
    setTileSize: [],
    draw: [],
    drawMinimap: []
  };

  const documentStub = {
    getElementById(id) {
      if (!canvases.has(id)) canvases.set(id, createCanvasStub(id));
      return canvases.get(id);
    }
  };

  class Renderer {
    constructor(...args) {
      this.constructorArgs = args;
      calls.constructor.push({ instance: this, args });
    }

    setTileSize(...args) {
      calls.setTileSize.push({ instance: this, args });
    }

    draw(...args) {
      calls.draw.push({ instance: this, args });
    }

    drawMinimap(...args) {
      calls.drawMinimap.push({ instance: this, args });
    }
  }

  const context = vm.createContext({
    console,
    document: documentStub,
    Renderer
  });

  const combinedSource = blocks.map((block) => block.source).join('\n');
  const value = vm.runInContext(
    `${combinedSource}\n;({ map, player });`,
    context,
    { filename: 'view.html inline scripts' }
  );

  return {
    blocks,
    calls,
    canvases,
    combinedSource,
    map: value.map,
    player: value.player
  };
}

const fixture = executeFixture();

test('executes the inline fixture and builds the authored 20x15 map', () => {
  assert.equal(fixture.map.width, 20);
  assert.equal(fixture.map.height, 15);

  for (const field of ['tiles', 'mineralMap', 'visited']) {
    assert.ok(Array.isArray(fixture.map[field]), `${field} is an array`);
    assert.equal(fixture.map[field].length, 15, `${field} has 15 rows`);

    for (const row of fixture.map[field]) {
      assert.ok(Array.isArray(row), `${field} rows are arrays`);
      assert.equal(row.length, 20, `${field} rows have 20 cells`);
    }
  }
});

test('fixture map places the ladders at the authored positions', () => {
  assert.equal(fixture.map.upLadderPos.x, 6);
  assert.equal(fixture.map.upLadderPos.y, 3);
  assert.equal(fixture.map.downLadderPos.x, 8);
  assert.equal(fixture.map.downLadderPos.y, 10);

  assert.equal(fixture.map.getTile(6, 3), 3);
  assert.equal(fixture.map.getTile(8, 10), 5);
});

test('fixture map contains authored minerals and explored cells', () => {
  const mineralKeys = [];
  for (const row of fixture.map.mineralMap) {
    for (const key of row) {
      if (key !== null) mineralKeys.push(key);
    }
  }

  assert.ok(mineralKeys.length > 0, 'expected at least one mineral');
  for (const row of fixture.map.mineralMap) {
    for (const key of row) {
      assert.ok(
        key === null || ['tin', 'copper', 'zinc'].includes(key),
        `unexpected mineral key: ${key}`
      );
    }
  }

  let visitedCells = 0;
  for (const row of fixture.map.visited) {
    for (const cell of row) {
      if (cell === true) visitedCells++;
    }
  }

  assert.ok(visitedCells > 0, 'expected at least one visited cell');
});

test('stub Renderer receives both canvases and the authored draw calls', () => {
  assert.equal(fixture.calls.constructor.length, 1, 'Renderer constructed once');
  const construction = fixture.calls.constructor[0];
  const rendererInstance = construction.instance;

  assert.equal(construction.args.length, 2);
  assert.equal(construction.args[0], fixture.canvases.get('world'));
  assert.equal(construction.args[1], fixture.canvases.get('minimap'));
  assert.equal(construction.args[0].id, 'world');
  assert.equal(construction.args[1].id, 'minimap');
  assert.equal(rendererInstance.constructorArgs[0], fixture.canvases.get('world'));
  assert.equal(rendererInstance.constructorArgs[1], fixture.canvases.get('minimap'));

  assert.equal(fixture.calls.setTileSize.length, 1, 'setTileSize called once');
  assert.equal(fixture.calls.setTileSize[0].instance, rendererInstance);
  assert.deepEqual(fixture.calls.setTileSize[0].args, [24]);

  assert.equal(fixture.calls.draw.length, 1, 'draw called exactly once');
  const drawCall = fixture.calls.draw[0];
  assert.equal(drawCall.instance, rendererInstance);
  assert.equal(drawCall.args.length, 3);
  assert.equal(drawCall.args[0], fixture.map);
  assert.equal(drawCall.args[1], fixture.player);
  assert.equal(drawCall.args[2], 'playing');

  assert.equal(fixture.calls.drawMinimap.length, 1, 'drawMinimap called once');
  const minimapCall = fixture.calls.drawMinimap[0];
  assert.equal(minimapCall.instance, rendererInstance);
  assert.equal(minimapCall.args.length, 3);
  assert.equal(minimapCall.args[0], fixture.map);
  assert.equal(minimapCall.args[1], fixture.player);
  assert.equal(minimapCall.args[2], 4);
});

test('runtime extraction skips the external renderer.js script tag', () => {
  assert.equal(fixture.blocks.length, 2, 'two inline script blocks extracted');

  for (const block of fixture.blocks) {
    assert.doesNotMatch(block.tag, /\bsrc\s*=/i, 'inline block has no src');
    assert.doesNotMatch(block.source, /<script\b/i, 'body has no script tags');
  }

  assert.doesNotMatch(fixture.combinedSource, /\bsrc\s*=\s*["']renderer\.js["']/i);

  const scriptTagCount = (html.match(/<script\b/gi) || []).length;
  const externalTagCount = (html.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length;
  assert.equal(scriptTagCount, 3);
  assert.equal(externalTagCount, 1);
  assert.equal(scriptTagCount - externalTagCount, fixture.blocks.length);
});
