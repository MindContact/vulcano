// Proves each level can be finished: a best-first search over input chunks,
// run on the real World physics, enemies and hazards included. Not a speed
// run, just a witness that a path exists with the jump the game ships. Every
// difficulty is tried: hard has faster lava and a tougher golem, and easy,
// with slower enemies, changes the timings the levels were proven on.
//
// Each route found is written to test/replays/level<N>.<difficulty>.json,
// which `npm test` replays: the tests stay fast, the search runs only after
// a change to levels, physics, difficulties or motorino.
//
//   node tools/solve.mjs [levelNumber] [easy|normal|hard]

import { writeFileSync, mkdirSync } from 'node:fs';
import { LEVELS } from '../src/game/levels.js';
import { DIFFICULTY_IDS } from '../src/game/difficulty.js';
import { CHUNK, ACTIONS, ChunkInput, makeWorld, snapshot, restore, actionName } from './sim.mjs';

const MAX_NODES = 250000;

function solve(index, diff, bucket) {
  const def = LEVELS[index];
  const w = makeWorld(index, diff);
  const input = new ChunkInput();
  const vertical = w.h > w.w;
  const exit = w.entities.find((e) => e.kind === 'exit');
  // Progress: distance to the exit, horizontal or vertical by level shape.
  // With a golem, the fight comes first. Outside the arena: get there. In
  // it, a hit left weighs more than anything; between hits, surviving longer
  // is progress (the stun windows come to those who wait), and while it lies
  // stunned, being close to its head is. Once it falls: the exit.
  const toExit = (p) => (vertical ? Math.abs(p.y - exit.y) + Math.abs(p.x - exit.x) * 0.3 : Math.abs(p.x - exit.x) + Math.abs(p.y - exit.y) * 0.3);
  const score = (p) => {
    const b = w.boss;
    if (!b) return toExit(p);
    if (b.hp <= 0) return toExit(p) - 10000;
    const dx = Math.abs(p.x + p.w / 2 - (b.x + b.w / 2));
    if (b.state === 'sleep') return 4000 + dx;
    return b.hp * 1000 + (b.state === 'stunned' ? dx + Math.abs(p.y + p.h - b.y) : 200) - w.time / 6;
  };

  const seen = new Set();
  const open = [{ snap: snapshot(w), path: [], h: score(w.player) }];
  // A hit on the golem is never undone, so once a branch lands one, the
  // branches that have not are dropped: the search goes on from there.
  const bossHp = () => (w.boss ? w.boss.hp : 0);
  let minHp = bossHp();
  let nodes = 0;
  let best = Infinity;
  let bestAt = null;
  while (open.length && nodes < MAX_NODES) {
    // Pop the most promising node (small heap would be faster; this is fine).
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].h < open[bi].h) bi = i;
    const node = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();

    for (const action of ACTIONS) {
      restore(w, node.snap);
      let ok = true;
      for (let f = 0; f < CHUNK; f++) {
        input.hold(action, f === 0);
        w.update(input);
        if (w.player.dead) { ok = false; break; }
        if (w.events.exit) {
          return { ok: true, frames: (node.path.length + 1) * CHUNK, nodes, path: [...node.path, action] };
        }
      }
      nodes++;
      if (!ok) continue;
      const p = w.player;
      // Moving hazards make the time matter, but only coarsely.
      const key = `${Math.round(p.x / 3)},${Math.round(p.y / 3)},${Math.round(p.vx)},${Math.round(p.vy)},${p.ground ? 1 : 0},${Math.floor(w.time / bucket)}`;
      if (bossHp() > minHp) continue;
      if (bossHp() < minHp) {
        minHp = bossHp();
        open.length = 0;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const h = score(p) + (node.path.length + 1) * 0.5;
      if (score(p) < best) { best = score(p); bestAt = { x: Math.round(p.x), y: Math.round(p.y) }; }
      open.push({ snap: snapshot(w), path: [...node.path, action], h });
    }
  }
  return { ok: false, nodes, best: Math.round(best), bestAt, def };
}

const level = parseInt(process.argv[2], 10);
const only = level ? [level - 1] : LEVELS.map((_, i) => i);
const diffs = process.argv[3] ? [process.argv[3]] : DIFFICULTY_IDS;
mkdirSync(new URL('../test/replays/', import.meta.url), { recursive: true });
let failed = 0;
for (const diff of diffs) for (const i of only) {
  const t0 = Date.now();
  // A fine time bucket follows moving platforms; a coarse one keeps the
  // search small on tall levels. Either finding a path is proof enough.
  let r = solve(i, diff, 60);
  if (!r.ok) r = solve(i, diff, 180);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.ok) {
    writeFileSync(new URL(`../test/replays/level${i + 1}.${diff}.json`, import.meta.url), `${JSON.stringify(r.path.map(actionName))}\n`);
    console.log(`${diff} level ${i + 1} ${LEVELS[i].name.it}: solved in ${(r.frames / 60).toFixed(1)}s of play (${r.nodes} nodes, ${secs}s)`);
  } else {
    failed++;
    console.log(`${diff} level ${i + 1} ${LEVELS[i].name.it}: NOT solved, closest ${r.best}px from the exit at ${r.bestAt.x},${r.bestAt.y} (${r.nodes} nodes, ${secs}s)`);
    if (process.env.MAP) {
      const tx = Math.floor(r.bestAt.x / 16);
      const ty = Math.floor(r.bestAt.y / 16);
      r.def.rows.forEach((row, y) => {
        if (Math.abs(y - ty) > 8) return;
        const cut = row.slice(Math.max(0, tx - 6), tx + 26);
        console.log(String(y).padStart(3), y === ty ? '>' : ' ', cut);
      });
    }
  }
}
process.exit(failed ? 1 : 0);
