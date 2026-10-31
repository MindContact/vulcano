// Running a level without a browser: a World with silent hooks and no
// particles, driven by "actions" (a direction or none, jump or not) held
// for a chunk of updates. Shared by tools/solve.mjs, which searches with
// it, and by test/replays.test.mjs, which replays what it found.

import { FakeInput } from '../lib/motorino/src/index.js';
import { LEVELS } from '../src/game/levels.js';
import { World } from '../src/game/world.js';
import { DIFFICULTIES } from '../src/game/difficulty.js';

export const CHUNK = 6; // frames per decision

// Inputs a decision can hold for one chunk.
export const ACTIONS = [];
for (const dir of ['left', null, 'right']) {
  for (const jump of [false, true]) ACTIONS.push({ dir, jump });
}

export class ChunkInput extends FakeInput {
  hold(action, first) {
    this.set([action.dir, action.jump && 'jump'].filter(Boolean));
    // A fresh jump needs a released frame before it.
    if (first && action.jump) this.prev.delete('jump');
  }
}

export function makeWorld(index, diffId) {
  const events = { dead: false, exit: false };
  const hooks = {
    sfx() {}, onGem() {}, onStomp() {}, onBoss() {},
    onDeath() { events.dead = true; },
    onExit() { events.exit = true; },
  };
  const w = new World(index, LEVELS[index], hooks, { diff: DIFFICULTIES[diffId] });
  w.events = events;
  // No particles: they only cost time here.
  w.particle = () => {};
  return w;
}

// Copies the mutable part of a world. One structuredClone call keeps the
// player's reference to the platform it rides. The clone has lost the
// classes (Body, Camera), so the player and camera are copied back into
// live instances rather than replaced.
export function snapshot(w) {
  return structuredClone({
    player: w.player, entities: w.entities, tiles: w.tiles, crumbles: w.crumbles,
    time: w.time, seed: w.seed, lavaY: w.lavaY, riseDelay: w.riseDelay, lavaX: w.lavaX, chaseDelay: w.chaseDelay,
    respawnPoint: w.respawnPoint,
    camera: w.camera,
  });
}

export function restore(w, s) {
  const { player, camera, ...rest } = structuredClone(s);
  Object.assign(w, rest);
  Object.assign(w.player, player);
  Object.assign(w.camera, camera);
  w.events.dead = false;
  w.events.exit = false;
}

// Actions by name in the replay files: L, -, R, with +J for a jump.
export function actionName(a) {
  return `${a.dir ? a.dir[0].toUpperCase() : '-'}${a.jump ? '+J' : ''}`;
}

export function actionByName(name) {
  const a = ACTIONS.find((x) => actionName(x) === name);
  if (!a) throw new Error(`unknown action ${name}`);
  return a;
}

// Plays a route from the level start. Returns 'exit', 'dead' or 'short'
// (the route ran out before the exit).
export function replay(index, diffId, names) {
  const w = makeWorld(index, diffId);
  const input = new ChunkInput();
  for (const name of names) {
    const action = actionByName(name);
    for (let f = 0; f < CHUNK; f++) {
      input.hold(action, f === 0);
      w.update(input);
      if (w.events.dead) return 'dead';
      if (w.events.exit) return 'exit';
    }
  }
  return 'short';
}
