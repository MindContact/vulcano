import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeInput } from '../lib/motorino/src/index.js';
import { World } from '../src/game/world.js';
import { LEVELS, parseLevel } from '../src/game/levels.js';
import { DIFFICULTIES } from '../src/game/difficulty.js';
import { makeWorld, snapshot, restore } from '../tools/sim.mjs';

// Hooks that record every call: [name, ...args].
const hooks = () => {
  const log = [];
  const h = new Proxy({}, { get: (_, name) => (...args) => log.push([name, ...args]) });
  return { h, log };
};

function steps(world, n, acts = []) {
  const input = new FakeInput();
  for (let i = 0; i < n; i++) {
    input.set(typeof acts === 'function' ? acts(i) : acts);
    world.update(input);
  }
}

const run = () => (n) => (n % 50 < 30 ? ['right', 'jump'] : ['right']);

test('every level parses', () => {
  for (const def of LEVELS) assert.ok(parseLevel(def));
});

test('the world is deterministic: same inputs, same state, every level', () => {
  LEVELS.forEach((def, i) => {
    const play = () => {
      const w = makeWorld(i, 'normal');
      steps(w, 600, run());
      return snapshot(w);
    };
    assert.deepEqual(play(), play(), `level ${i + 1}`);
  });
});

test('restore brings a world back exactly', () => {
  const w = makeWorld(1, 'normal');
  steps(w, 120, ['right']);
  const snap = snapshot(w);
  steps(w, 120, ['left', 'jump']);
  restore(w, snap);
  assert.deepEqual(snapshot(w), snap);
});

test('a jump plays its sound', () => {
  const { h, log } = hooks();
  const w = new World(0, LEVELS[0], h, { diff: DIFFICULTIES.normal });
  steps(w, 30);
  steps(w, 10, ['jump']);
  assert.ok(log.some(([n, s]) => n === 'sfx' && s === 'jump'));
});
