// Replays the routes found by tools/solve.mjs from the level start: each
// level must still be finished at every difficulty. A failure after a change
// to a level, the physics, the difficulties or motorino means
// `node tools/solve.mjs` again; if that finds no route, the level can no
// longer be finished.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { replay } from '../tools/sim.mjs';
import { LEVELS } from '../src/game/levels.js';
import { DIFFICULTY_IDS } from '../src/game/difficulty.js';

LEVELS.forEach((def, i) => {
  for (const diff of DIFFICULTY_IDS) {
    test(`level ${i + 1} (${def.name.it}) can be finished on ${diff}`, () => {
      const file = new URL(`./replays/level${i + 1}.${diff}.json`, import.meta.url);
      assert.ok(existsSync(file), `no route recorded: node tools/solve.mjs ${i + 1} ${diff}`);
      assert.equal(replay(i, diff, JSON.parse(readFileSync(file, 'utf8'))), 'exit');
    });
  }
});
