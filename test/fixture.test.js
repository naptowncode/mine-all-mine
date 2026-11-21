'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(__dirname, '..', 'view.html');
const html = fs.readFileSync(fixturePath, 'utf8');

const externalScriptPattern =
  /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const externalScripts = Array.from(
  html.matchAll(externalScriptPattern),
  (match) => match[1]
);

const rendererTagIndex = html.indexOf('src="renderer.js"');

test('view.html loads exactly one external script, and it is renderer.js', () => {
  assert.equal(externalScripts.length, 1);
  assert.deepEqual(externalScripts, ['renderer.js']);
});

test('view.html loads none of the game-rule scripts', () => {
  const forbidden = ['constants.js', 'map.js', 'player.js', 'game.js', 'rng.js'];

  for (const source of externalScripts) {
    const basename = path.posix.basename(source);
    assert.equal(
      forbidden.includes(basename),
      false,
      `forbidden script source: ${source}`
    );
  }
});

test('view.html defines both canvases', () => {
  assert.match(html, /<canvas\b[^>]*\bid\s*=\s*["']world["']/i);
  assert.match(html, /<canvas\b[^>]*\bid\s*=\s*["']minimap["']/i);
});

test('view.html defines the inline display theme before the renderer script', () => {
  const themeTokens = [
    'TILE',
    'VIEWPORT_TILES_W',
    'VIEWPORT_TILES_H',
    'DEPTH_PALETTES',
    'MINERALS',
    'clamp'
  ];

  assert.notEqual(rendererTagIndex, -1, 'missing renderer.js script tag');

  for (const token of themeTokens) {
    const tokenIndex = html.search(new RegExp(`\\b${token}\\b`));
    assert.notEqual(tokenIndex, -1, `missing inline theme token: ${token}`);
    assert.ok(
      tokenIndex < rendererTagIndex,
      `${token} must appear before the renderer script tag`
    );
  }
});

test('view.html defines the hand-authored map and player fixtures', () => {
  const fixtureTokens = [
    'const LAYOUT = [',
    'const EXPLORED = [',
    'tiles',
    'mineralMap',
    'visited',
    'upLadderPos',
    'downLadderPos',
    'getTile(x, y)',
    'getMineral(x, y)',
    'isVisible(px, py, tx, ty, radius)',
    'getVisibilityRadius()',
    'new Renderer(',
    'setTileSize('
  ];

  for (const token of fixtureTokens) {
    assert.ok(html.includes(token), `missing fixture data: ${token}`);
  }

  assert.match(html, /width:\s*LAYOUT\[0\]\.length/);
  assert.match(html, /height:\s*LAYOUT\.length/);
  assert.match(html, /depth:\s*1/);
  assert.match(html, /return 6;/);
});

test('view.html draws the world and the minimap', () => {
  assert.ok(html.includes("renderer.draw(map, player, 'playing')"));
  assert.ok(html.includes('renderer.drawMinimap(map, player, 4)'));
  assert.ok(html.indexOf('new Renderer(') > rendererTagIndex);
});

test('view.html has no fetch, XHR, or module loading', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(html, /<script\b[^>]*\btype\s*=\s*["']module["']/i);
});
