'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadScripts } = require('./helpers/load-scripts');

const { createRng } = loadScripts(['rng.js'], ['createRng']);

function sequence(rng, count) {
  return Array.from({ length: count }, () => rng.next());
}

test('identical seeds produce identical sequences', () => {
  assert.deepEqual(sequence(createRng(12345), 64), sequence(createRng(12345), 64));
});

test('string seeds are normalized deterministically', () => {
  assert.deepEqual(sequence(createRng('depth-1'), 64), sequence(createRng('depth-1'), 64));
});

test('different seeds produce different sequences', () => {
  assert.notDeepEqual(sequence(createRng(12345), 64), sequence(createRng(54321), 64));
  assert.notDeepEqual(sequence(createRng('depth-1'), 64), sequence(createRng('depth-2'), 64));
});

test('next() values are in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const value = rng.next();
    assert.equal(typeof value, 'number');
    assert.ok(value >= 0, `value ${value} is below 0`);
    assert.ok(value < 1, `value ${value} is not below 1`);
  }
});

test('int(min, max) stays in bounds and hits both endpoints', () => {
  const rng = createRng(2026);
  const min = -3;
  const max = 6;
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const value = rng.int(min, max);
    assert.equal(Number.isInteger(value), true);
    assert.ok(value >= min && value <= max, `value ${value} out of [${min}, ${max}]`);
    seen.add(value);
  }
  assert.ok(seen.has(min), 'minimum endpoint was never produced');
  assert.ok(seen.has(max), 'maximum endpoint was never produced');
});

test('shuffle returns a deterministic in-place permutation', () => {
  const original = Array.from({ length: 20 }, (_, i) => i);
  const arrayA = original.slice();
  const arrayB = original.slice();

  const resultA = createRng(99).shuffle(arrayA);
  const resultB = createRng(99).shuffle(arrayB);

  assert.equal(resultA, arrayA);
  assert.deepEqual(resultA, resultB);
  assert.deepEqual(resultA.slice().sort((a, b) => a - b), original);
  assert.notDeepEqual(resultA, original);
});
