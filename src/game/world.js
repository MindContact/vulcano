// One level in play: the tile map, the player, everything that moves, and
// the particles. Knows nothing of drawing or sound; it reports what happened
// through `hooks` and the renderer reads its state.
//
// Units: positions in pixels (16 per tile), velocities in pixels per update,
// time in updates (60 a second). The world never reads a clock, so the same
// inputs always give the same run — which is what lets tools/solve.mjs replay
// and search it. What chance there is in the rules (a fire bubble's wait)
// comes from `rand()`, seeded by the level and kept in the world's state;
// Math.random is for particles only, which change nothing.
//
// `hooks` is the whole contract with the shell:
//   sfx(name)   play an effect (names in src/audio/sfx.js)
//   onGem()     a crystal was taken          onStomp()  an enemy was stomped
//   onDeath()   the death animation ended    onExit()   the player reached the exit
//   onBoss()    the golem fell (each hit on it also calls onStomp)
//
// `diff` is one entry of DIFFICULTIES (src/game/difficulty.js).

import { Body, Camera, DEFAULT_TUNING, Particles, TileMap, screenMove } from '../../lib/motorino/src/index.js';
import { TILE, T, parseLevel } from './levels.js';
import { DIFFICULTIES } from './difficulty.js';

// The player is a motorino Body with its default tuning, which is Vulcano's:
// a full jump about 53 px high (3 1/3 tiles) and four tiles long at full
// run, so the levels keep gaps to three; a tapped jump is about 10 px.
const JUMP_SPEED = DEFAULT_TUNING.jumpSpeed;

// The hitbox, narrower than the 12 px sprite so a near miss reads as a miss.
const PLAYER_W = 10;
const PLAYER_H = 14;

// Crumbling rock: updates between first touch and the fall, then until it
// grows back.
const CRUMBLE_DELAY = 28;
const CRUMBLE_RESPAWN = 240;
// A geyser cycles idle 100, warning 40, firing 60 updates (see geyserState).
const GEYSER_PERIOD = 200;
const GEYSER_HEIGHT = 48;

// The magma golem. Its loop: walk at the player, crouch (the tell), leap to
// where the player stood and slam down, sending a shockwave each way along
// the floor; then it lies stunned and cools, and only then can its head be
// stomped. Hot, it burns whatever touches it, head included. Each hit makes
// it faster, the waves quicker and the stun shorter. Timings in updates.
const BOSS_W = 26;
const BOSS_H = 22;
const BOSS_ARENA_LEFT = 9; // tiles from the arena's left edge to the spawn
const BOSS_ARENA_W = 20;
const BOSS_WAKE = 90;
const BOSS_WALK = 80;
const BOSS_CROUCH = 24;
const BOSS_GRAVITY = 0.22;
const BOSS_LEAP = 5.5; // 50 updates in the air, about 69 px high
const BOSS_STUN = 120;
const BOSS_HURT = 50;
const BOSS_DYING = 120;
const WAVE_W = 8;
const WAVE_H = 10;

export class World {
  constructor(levelIndex, def, hooks, { god = false, diff = DIFFICULTIES.normal } = {}) {
    this.index = levelIndex;
    this.level = parseLevel(def);
    this.def = def;
    this.hooks = hooks;
    this.god = god;
    this.diff = diff;
    const { w, h } = this.level;
    this.w = w;
    this.h = h;
    // The TileMap copies the tiles: crumbling rock edits them, and the parsed
    // level must stay intact for the renderer's baked layer and for a
    // restart. Rock at the sides (no walking off the level), open above and
    // below (falling out of the bottom kills in checkHazards).
    this.map = new TileMap(this.level, {
      solid: [T.ROCK, T.VENT, T.CRUMBLE],
      oneWay: [T.CRUST],
      edges: { left: T.ROCK, right: T.ROCK },
    });
    this.crumbles = new Map(); // tile index -> { timer, gone }
    this.time = 0;
    this.seed = (levelIndex + 1) * 0x9e3779b9 >>> 0;
    this.particles = new Particles(400);
    this.shake = 0;
    this.gemsTaken = 0;

    this.entities = [];
    for (const s of this.level.spawns) this.spawn(s);
    if (this.boss) for (const e of this.entities) if (e.kind === 'exit') e.locked = true;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.tiles[y * w + x] === T.VENT) {
          this.entities.push({ kind: 'geyser', tx: x, ty: y, phase: (x * 37) % GEYSER_PERIOD, height: 0, wasOn: false });
        }
      }
    }

    // Vents are tiles, not spawn characters, so geysers are found by scanning.
    // The phase staggers neighbouring vents so they do not fire in unison.
    const s = this.level.start;
    this.respawnPoint = { x: s.x * TILE + (TILE - PLAYER_W) / 2, y: (s.y + 1) * TILE - PLAYER_H };
    this.rise = def.rise ? this.scaleLava(def.rise) : null;
    this.resetPlayer();
    this.lavaY = this.rise ? h * TILE + 8 : null;
    this.riseDelay = this.rise ? this.rise.delay : 0;
    // A lava flow from the left: `lavaX` is its front.
    this.chase = def.chase ? this.scaleLava(def.chase) : null;
    this.lavaX = this.chase ? -2 * TILE : null;
    this.chaseDelay = this.chase ? this.chase.delay : 0;
    this.camera = new Camera();
    this.snapCamera();
  }

  scaleLava({ delay, speed }) {
    return { delay: Math.round(delay * this.diff.lavaDelay), speed: speed * this.diff.lava };
  }

  // The live tiles. A setter too, so the solver can put a snapshot back.
  get tiles() { return this.map.tiles; }
  set tiles(tiles) { this.map.tiles = tiles; }

  // Turns a spawn character from the level text into an entity. Entities are
  // plain objects told apart by `kind`; each kind has its update and draw.
  spawn({ kind, x, y }) {
    const px = x * TILE;
    const py = y * TILE;
    switch (kind) {
      case 'gem': this.entities.push({ kind, x: px + 8, y: py + 8, taken: false }); break;
      case 'checkpoint': this.entities.push({ kind, x: px, y: py, active: false }); break;
      case 'exit': this.entities.push({ kind, x: px, y: py }); break;
      case 'slug': this.entities.push({ kind, x: px + 1, y: py + 7, w: 14, h: 9, vx: -0.4 * this.diff.enemies, vy: 0, alive: true, dying: 0 }); break;
      case 'bat': this.entities.push({ kind, x0: px + 8, y0: py + 4, x: px + 8, y: py + 4, w: 12, h: 7, t: x * 13, alive: true, dying: 0, flip: false }); break;
      case 'bubble': this.entities.push({ kind, x: px + 8, base: py + 4, y: py + 12, vy: 0, wait: 30 + ((x * 29) % 90), up: false }); break;
      case 'mover': this.entities.push({ kind: 'platform', x: px, y: py, w: 48, h: 8, vx: 0.6, vy: 0, dx: 0, dy: 0 }); break;
      case 'lift': this.entities.push({ kind: 'platform', x: px, y: py, w: 48, h: 8, vx: 0, vy: -0.6, dx: 0, dy: 0 }); break;
      case 'boss': {
        const home = px + TILE / 2 - BOSS_W / 2;
        const x0 = (x - BOSS_ARENA_LEFT) * TILE;
        this.entities.push({
          kind, home, x: home, y: py + TILE - BOSS_H, w: BOSS_W, h: BOSS_H, floor: py + TILE,
          x0, x1: x0 + BOSS_ARENA_W * TILE, vx: 0, vy: 0, hp: this.diff.bossHp, maxHp: this.diff.bossHp, state: 'sleep', timer: 0,
        });
        break;
      }
      default: break;
    }
  }

  // `invuln` gives a second of grace after a respawn, so an enemy standing on
  // the checkpoint does not kill twice.
  // Gravity always points down here, so the Body's vt and vn are plain vx
  // and vy; vx and vy are read-only views of them.
  resetPlayer() {
    const p = new Body(this.respawnPoint.x, this.respawnPoint.y, PLAYER_W, PLAYER_H, this.diff.tuning);
    Object.assign(p, { platform: null, anim: 0, dead: false, deadTimer: 0, invuln: 60 });
    this.player = p;
  }

  // --- tiles -------------------------------------------------------------------

  tile(tx, ty) {
    return this.map.get(tx, ty);
  }

  solid(tx, ty) {
    return this.map.solid(tx, ty);
  }

  // --- update ------------------------------------------------------------------

  // One fixed step. Order matters: platforms move before the player so a
  // rider is carried first and then collides; hazards are tested after the
  // move that may have caused them.
  update(input) {
    this.time++;
    if (this.shake > 0) this.shake *= 0.85;
    if (this.shake < 0.3) this.shake = 0;
    this.updateCrumbles();
    this.updatePlatforms();
    this.updatePlayer(input);
    this.updateEntities();
    this.updateLava();
    this.updateChase();
    this.updateParticles();
    this.updateCamera();
  }

  // A touched crumble counts down, falls (the tile becomes empty) and later
  // grows back — unless the player stands where it would reappear.
  updateCrumbles() {
    for (const [idx, c] of this.crumbles) {
      if (c.gone > 0) {
        c.gone--;
        if (c.gone === 0) {
          const tx = idx % this.w;
          const ty = Math.floor(idx / this.w);
          const p = this.player;
          const overlap = p.x < (tx + 1) * TILE && p.x + p.w > tx * TILE && p.y < (ty + 1) * TILE && p.y + p.h > ty * TILE;
          if (overlap) c.gone = 30;
          else {
            this.tiles[idx] = T.CRUMBLE;
            this.crumbles.delete(idx);
          }
        }
      } else if (--c.timer <= 0) {
        this.tiles[idx] = T.EMPTY;
        c.gone = CRUMBLE_RESPAWN;
        const tx = idx % this.w;
        const ty = Math.floor(idx / this.w);
        for (let i = 0; i < 6; i++) {
          this.particle(tx * TILE + Math.random() * 16, ty * TILE + Math.random() * 10, (Math.random() - 0.5) * 1, Math.random() * -1, 50, '#4b3427', 3, 0.2);
        }
        this.hooks.sfx('crumble');
      }
    }
  }

  touchCrumble(tx, ty) {
    const idx = ty * this.w + tx;
    if (this.tiles[idx] !== T.CRUMBLE || this.crumbles.has(idx)) return;
    this.crumbles.set(idx, { timer: CRUMBLE_DELAY, gone: 0 });
  }

  crumbleShake(tx, ty) {
    const c = this.crumbles.get(ty * this.w + tx);
    return c && c.gone === 0 ? 1 - c.timer / CRUMBLE_DELAY : 0;
  }

  // Platforms bounce between rock or `|` stop tiles. The player riding one
  // (`player.platform`) is moved by the same delta here, before their own
  // movement, which is how they stay on without sliding.
  updatePlatforms() {
    for (const e of this.entities) {
      if (e.kind !== 'platform') continue;
      const ox = e.x;
      const oy = e.y;
      e.x += e.vx;
      e.y += e.vy;
      if (e.vx) {
        const edge = e.vx > 0 ? e.x + e.w : e.x;
        const tx = Math.floor(edge / TILE);
        const ty = Math.floor((e.y + 4) / TILE);
        const t = this.tile(tx, ty);
        if (t === T.ROCK || t === T.STOP || t === T.VENT) {
          e.vx = -e.vx;
          e.x = ox;
        }
      } else {
        // Any column under the platform can carry the stop marker.
        const edge = e.vy > 0 ? e.y + e.h : e.y;
        const ty = Math.floor(edge / TILE);
        for (let tx = Math.floor(e.x / TILE); tx <= Math.floor((e.x + e.w - 1) / TILE); tx++) {
          const t = this.tile(tx, ty);
          if (t === T.ROCK || t === T.STOP) {
            e.vy = -e.vy;
            e.y = oy;
            break;
          }
        }
      }
      e.dx = e.x - ox;
      e.dy = e.y - oy;
      const p = this.player;
      if (p.platform === e && !p.dead) {
        p.x += e.dx;
        p.y = e.y - p.h;
      }
    }
  }

  updatePlayer(input) {
    const p = this.player;
    if (p.dead) {
      p.deadTimer--;
      p.vn += 0.25;
      p.y += p.vn;
      if (p.deadTimer <= 0) this.hooks.onDeath();
      return;
    }
    if (p.invuln > 0) p.invuln--;

    // Run and jump on the tiles: coyote time, a buffer that forgives early
    // presses, crust as a one-way floor that down + jump drops through.
    const prevBottom = p.y + p.h;
    const wasGround = p.ground;
    let fall = p.step(this.map, {
      move: screenMove(p, (d) => input.down(d)),
      jump: input.pressed('jump') || input.pressed('up'),
      jumpHeld: input.down('jump') || input.down('up'),
      drop: input.down('down') && !p.platform,
    });
    if (p.jumped) {
      this.hooks.sfx('jump');
      p.platform = null;
    }
    if (p.ground) {
      const ty = Math.floor((p.y + p.h) / TILE);
      for (let tx = Math.floor(p.x / TILE); tx <= Math.floor((p.x + p.w - 1) / TILE); tx++) {
        if (this.tile(tx, ty) === T.CRUMBLE) this.touchCrumble(tx, ty);
      }
    }
    if (!p.ground) fall = this.ridePlatforms(p, prevBottom) || fall;
    if (p.ground && !wasGround && fall > 3) {
      this.hooks.sfx('land');
      for (let i = 0; i < 4; i++) {
        this.particle(p.x + p.w / 2, p.y + p.h, (Math.random() - 0.5) * 1.5, -Math.random() * 0.6, 20, '#7a5a4a', 2, 0.02);
      }
    }

    if (p.ground) p.anim += Math.abs(p.vx) * 0.12;
    // Once the golem is up, a curtain of lava seals the arena behind the
    // player: no waiting the fight out where it cannot reach.
    if (this.bossFight && p.x < this.boss.x0 + 6) { p.x = this.boss.x0 + 6; p.vt = 0; }

    this.checkHazards();
  }

  // Platforms are not tiles, so the Body does not see them. Riding one, the
  // player stays on unless they walked off its ends or jumped; otherwise a
  // fall onto one lands, with the "was above" rule widened by the platform's
  // own movement, so a rising lift catches feet it moved into. Returns the
  // fall speed of a landing, else 0.
  ridePlatforms(p, prevBottom) {
    if (p.platform) {
      const e = p.platform;
      if (p.vn >= 0 && p.x + p.w > e.x && p.x < e.x + e.w) {
        p.y = e.y - p.h;
        p.vn = 0;
        p.ground = true;
        return 0;
      }
      p.platform = null;
    }
    if (p.vn < 0) return 0;
    for (const e of this.entities) {
      if (e.kind !== 'platform') continue;
      if (p.x + p.w <= e.x || p.x >= e.x + e.w) continue;
      const top = e.y;
      if (prevBottom <= top - e.dy + 2 && p.y + p.h >= top) {
        const fall = p.vn;
        p.y = top - p.h;
        p.vn = 0;
        p.ground = true;
        p.platform = e;
        return fall;
      }
    }
    return 0;
  }

  // Lava and spikes only count once the feet are a few pixels in: touching
  // the glowing surface with a toe is forgiven. God mode skips them but not
  // the fall out of the map: lava is not solid, so a god sinks through a
  // pit and would fall forever.
  checkHazards() {
    const p = this.player;
    if (p.y > this.h * TILE + 16) return this.kill('fall');
    if (this.god) return undefined;
    const x0 = Math.floor((p.x + 2) / TILE);
    const x1 = Math.floor((p.x + p.w - 3) / TILE);
    const y0 = Math.floor((p.y + 2) / TILE);
    const y1 = Math.floor((p.y + p.h - 1) / TILE);
    const bottom = p.y + p.h;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tile(tx, ty);
        if (t === T.LAVA && bottom > ty * TILE + 5) return this.kill('lava');
        if (t === T.SPIKES && bottom > ty * TILE + 8) return this.kill('spikes');
      }
    }
    if (this.lavaY !== null && bottom > this.lavaY + 4) return this.kill('lava');
    if (this.lavaX !== null && p.x + 3 < this.lavaX) return this.kill('lava');
    return undefined;
  }

  // Starts the death animation; the shell hears about it only when the
  // animation ends (onDeath), so it can decide between respawn and game over.
  kill(cause) {
    const p = this.player;
    if (p.dead || (this.god && cause !== 'fall')) return;
    p.dead = true;
    p.deadTimer = 80;
    p.vn = -4;
    p.platform = null;
    this.shake = 6;
    this.hooks.sfx(cause === 'lava' ? 'sizzle' : 'death');
    if (cause === 'lava') this.hooks.sfx('death');
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.5 + Math.random() * 2.5;
      this.particle(cx, cy, Math.cos(a) * s, Math.sin(a) * s - 1, 40 + Math.random() * 30,
        i % 3 ? '#ff8a2a' : '#ffe27a', 2, 0.06, true);
    }
  }

  // Back to the last checkpoint. Rising lava is pushed down to a fixed
  // distance below it and paused, or a death high up would respawn into lava.
  respawn() {
    this.resetPlayer();
    this.resetBoss();
    if (this.lavaY !== null) {
      this.lavaY = Math.min(this.h * TILE + 8, this.respawnPoint.y + PLAYER_H + 9 * TILE);
      this.riseDelay = Math.round(240 * this.diff.lavaDelay);
    }
    if (this.lavaX !== null) {
      this.lavaX = Math.max(-2 * TILE, this.respawnPoint.x - 8 * TILE);
      this.chaseDelay = Math.round(240 * this.diff.lavaDelay);
    }
    this.snapCamera();
  }

  // --- entities ------------------------------------------------------------------

  overlaps(a, x, y, w, h) {
    return a.x < x + w && a.x + a.w > x && a.y < y + h && a.y + a.h > y;
  }

  updateEntities() {
    const p = this.player;
    // Copied: the golem adds waves and spent waves drop out while we iterate.
    for (const e of this.entities.slice()) {
      switch (e.kind) {
        case 'gem':
          if (!e.taken && !p.dead && this.overlaps(p, e.x - 5, e.y - 5, 10, 10)) {
            e.taken = true;
            this.gemsTaken++;
            this.hooks.onGem();
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              this.particle(e.x, e.y, Math.cos(a) * 1.2, Math.sin(a) * 1.2, 20, '#7ef6ff', 2, 0, true);
            }
          }
          break;
        case 'checkpoint':
          if (!e.active && !p.dead && this.overlaps(p, e.x, e.y - 8, 16, 24)) {
            for (const o of this.entities) if (o.kind === 'checkpoint') o.active = false;
            e.active = true;
            this.respawnPoint = { x: e.x + (TILE - PLAYER_W) / 2, y: e.y + TILE - PLAYER_H };
            this.hooks.sfx('checkpoint');
            for (let i = 0; i < 16; i++) {
              this.particle(e.x + 8, e.y + 2, (Math.random() - 0.5) * 1.5, -Math.random() * 2, 40, '#ffb347', 2, -0.01, true);
            }
          }
          break;
        case 'exit':
          if (!e.locked && !p.dead && this.overlaps(p, e.x + 2, e.y - 12, 12, 28)) this.hooks.onExit();
          break;
        case 'boss': this.updateBoss(e); break;
        case 'wave': this.updateWave(e); break;
        case 'slug': this.updateSlug(e); break;
        case 'bat': this.updateBat(e); break;
        case 'bubble': this.updateBubble(e); break;
        case 'geyser': this.updateGeyser(e); break;
        default: break;
      }
    }
  }

  // Stomp if falling onto the enemy from above, otherwise the enemy wins.
  enemyContact(e) {
    const p = this.player;
    if (p.dead || !this.overlaps(p, e.x, e.y, e.w, e.h)) return;
    if (p.vy > 0 && p.y + p.h - p.vy <= e.y + 4) {
      e.alive = false;
      e.dying = 30;
      p.vn = p.jumpHeld || p.jumpBuffer ? -JUMP_SPEED : -4.2;
      p.jumpHeld = true;
      this.hooks.sfx('stomp');
      this.hooks.onStomp();
      this.shake = 2;
      for (let i = 0; i < 10; i++) {
        this.particle(e.x + e.w / 2, e.y + e.h / 2, (Math.random() - 0.5) * 3, -Math.random() * 2, 30,
          e.kind === 'slug' ? '#ff7a1f' : '#6a6070', 2, 0.1, e.kind === 'slug');
      }
    } else if (p.invuln === 0) {
      this.kill('enemy');
    }
  }

  // Slugs walk and turn at walls and ledges, so they never fall into lava.
  updateSlug(e) {
    if (!e.alive) { if (e.dying > 0) e.dying--; return; }
    e.vy = Math.min(e.vy + 0.3, 4);
    e.y += e.vy;
    const ty = Math.floor((e.y + e.h) / TILE);
    const onGround = this.solid(Math.floor((e.x + e.w / 2) / TILE), ty) || this.tile(Math.floor((e.x + e.w / 2) / TILE), ty) === T.CRUST;
    if (onGround) { e.y = ty * TILE - e.h; e.vy = 0; }
    if (onGround) {
      const ahead = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
      const atx = Math.floor(ahead / TILE);
      const wall = this.solid(atx, Math.floor((e.y + 4) / TILE));
      const below = this.tile(atx, ty);
      const floor = below === T.ROCK || below === T.CRUMBLE || below === T.VENT || below === T.CRUST;
      if (wall || !floor) e.vx = -e.vx;
      e.x += e.vx;
    }
    if (e.y > this.h * TILE) e.alive = false;
    this.enemyContact(e);
  }

  // Bats ignore the map: a figure of eight around their spawn point.
  updateBat(e) {
    if (!e.alive) { if (e.dying > 0) { e.dying--; e.y += 2; } return; }
    e.t += this.diff.enemies;
    const nx = e.x0 + Math.sin(e.t * 0.02) * 40 - e.w / 2;
    e.flip = nx < e.x;
    e.x = nx;
    e.y = e.y0 + Math.sin(e.t * 0.09) * 8 - e.h / 2;
    this.enemyContact(e);
  }

  // A fire bubble waits in the lava, then is thrown up to about 72 px and
  // falls back. Its launch speed comes from v = sqrt(2 g h).
  updateBubble(e) {
    const p = this.player;
    if (!e.up) {
      if (--e.wait <= 0) {
        e.up = true;
        e.vy = -Math.sqrt(2 * 0.2 * 72);
        e.y = e.base;
        if (this.onScreen(e.x, e.y)) this.hooks.sfx('bubble');
      }
      return;
    }
    e.vy += 0.2;
    e.y += e.vy;
    if (Math.random() < 0.5) this.particle(e.x + (Math.random() - 0.5) * 4, e.y + 2, 0, 0.3, 14, '#ff9a2a', 2, 0, true);
    if (e.vy > 0 && e.y > e.base + 6) {
      e.up = false;
      e.wait = 70 + Math.floor(this.rand() * 60);
      for (let i = 0; i < 5; i++) this.particle(e.x, e.base, (Math.random() - 0.5) * 2, -Math.random() * 2, 20, '#ffd34a', 2, 0.15, true);
    }
    if (!p.dead && !this.god && p.invuln === 0 && this.overlaps(p, e.x - 4, e.y - 4, 8, 8)) this.kill('fire');
  }

  // Looked up, not stored: the solver restores `entities` by copy, and a
  // stored reference would point at the old golem.
  get boss() {
    return this.entities.find((e) => e.kind === 'boss') || null;
  }

  // True while the arena is sealed: from the golem waking to its fall.
  get bossFight() {
    const b = this.boss;
    return !!b && b.state !== 'sleep' && b.hp > 0;
  }

  // After the player's death the golem goes back to sleep at home, keeping
  // the damage already done, and its waves vanish.
  resetBoss() {
    const b = this.boss;
    if (!b || b.hp <= 0) return;
    Object.assign(b, { x: b.home, y: b.floor - b.h, vx: 0, vy: 0, state: 'sleep', timer: 0 });
    this.entities = this.entities.filter((e) => e.kind !== 'wave');
  }

  updateBoss(b) {
    const p = this.player;
    const rage = b.maxHp - b.hp; // 0, 1, 2... as it takes hits
    const pace = this.diff.boss;
    b.timer++;
    switch (b.state) {
      case 'sleep':
        if (!p.dead && p.x > b.x0 + 24) {
          b.state = 'wake';
          b.timer = 0;
          this.hooks.sfx('rumble');
          this.shake = 5;
        }
        return;
      case 'wake':
        if (b.timer >= BOSS_WAKE) { b.state = 'walk'; b.timer = 0; }
        break;
      case 'walk': {
        const dir = Math.sign(p.x + p.w / 2 - (b.x + b.w / 2));
        b.vx = dir * (0.5 + rage * 0.3) * pace;
        b.x = Math.max(b.x0, Math.min(b.x1 - b.w, b.x + b.vx));
        if (b.timer >= BOSS_WALK) { b.state = 'crouch'; b.timer = 0; }
        break;
      }
      case 'crouch':
        if (b.timer >= BOSS_CROUCH) {
          // Aim at where the player is now; the flight time is fixed, so
          // the horizontal speed is distance over time.
          const air = (2 * BOSS_LEAP) / BOSS_GRAVITY;
          const target = Math.max(b.x0 + 8, Math.min(b.x1 - 8 - b.w, p.x + p.w / 2 - b.w / 2));
          b.vx = Math.max(-2.5, Math.min(2.5, (target - b.x) / air));
          b.vy = -BOSS_LEAP;
          b.state = 'leap';
          b.timer = 0;
          this.hooks.sfx('jump');
        }
        break;
      case 'leap':
        b.vy += BOSS_GRAVITY;
        b.x = Math.max(b.x0, Math.min(b.x1 - b.w, b.x + b.vx));
        b.y += b.vy;
        if (b.vy > 0 && b.y + b.h >= b.floor) {
          b.y = b.floor - b.h;
          b.vx = 0;
          b.vy = 0;
          b.state = 'stunned';
          b.timer = 0;
          this.shake = 7;
          this.hooks.sfx('slam');
          for (const dir of [-1, 1]) {
            this.entities.push({ kind: 'wave', x: b.x + b.w / 2 + dir * (b.w / 2), y: b.floor - WAVE_H, w: WAVE_W, h: WAVE_H, vx: dir * (1.8 + rage * 0.4) * pace, x0: b.x0, x1: b.x1 });
          }
          for (let i = 0; i < 16; i++) {
            this.particle(b.x + Math.random() * b.w, b.floor - 2, (Math.random() - 0.5) * 3, -Math.random() * 2.5, 40, i % 2 ? '#4b3427' : '#ff7a1f', 3, 0.12, i % 2 === 0);
          }
        }
        break;
      case 'stunned':
        if (b.timer >= (BOSS_STUN - rage * 20) / pace) { b.state = 'walk'; b.timer = 0; }
        break;
      case 'hurt':
        if (b.timer >= BOSS_HURT) { b.state = 'walk'; b.timer = 0; }
        break;
      case 'dying':
        if (b.timer % 8 === 0) {
          this.shake = 4;
          this.hooks.sfx('crumble');
          const cx = b.x + Math.random() * b.w;
          const cy = b.y + Math.random() * b.h;
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particle(cx, cy, Math.cos(a) * 2, Math.sin(a) * 2 - 1, 40, i % 2 ? '#ffd34a' : '#ff6a1f', 2, 0.08, true);
          }
        }
        if (b.timer >= BOSS_DYING) {
          b.state = 'dead';
          this.shake = 8;
          for (const e of this.entities) if (e.kind === 'exit') e.locked = false;
          this.hooks.sfx('door');
          this.hooks.onBoss();
        }
        return;
      default: return;
    }
    this.bossContact(b);
  }

  // Cool (stunned or just hit) it is plain rock: a stomp from above hurts
  // it and a touch from the side does nothing. Hot, any touch burns.
  bossContact(b) {
    const p = this.player;
    if (p.dead || !this.overlaps(p, b.x, b.y, b.w, b.h)) return;
    const cool = b.state === 'stunned' || b.state === 'hurt';
    if (!cool) {
      if (!this.god && p.invuln === 0) this.kill('fire');
      return;
    }
    if (b.state !== 'stunned' || !(p.vy > 0 && p.y + p.h - p.vy <= b.y + 6)) return;
    b.hp--;
    b.state = b.hp > 0 ? 'hurt' : 'dying';
    b.timer = 0;
    p.vn = -JUMP_SPEED;
    p.jumpHeld = true;
    this.shake = 4;
    this.hooks.sfx('stomp');
    this.hooks.onStomp();
    for (let i = 0; i < 12; i++) {
      this.particle(b.x + b.w / 2, b.y, (Math.random() - 0.5) * 3, -Math.random() * 2, 30, '#ff7a1f', 2, 0.1, true);
    }
  }

  // A shockwave runs along the floor to the arena wall; jump it.
  updateWave(e) {
    e.x += e.vx;
    if (e.x < e.x0 || e.x > e.x1) {
      this.entities.splice(this.entities.indexOf(e), 1);
      return;
    }
    if (Math.random() < 0.6) this.particle(e.x, e.y + e.h, -e.vx * 0.2, -Math.random() * 1.5, 16, '#ff9a2a', 2, 0.05, true);
    const p = this.player;
    if (!p.dead && !this.god && p.invuln === 0 && this.overlaps(p, e.x - e.w / 2, e.y, e.w, e.h)) this.kill('fire');
  }

  geyserState(e) {
    const t = (this.time + e.phase) % GEYSER_PERIOD;
    if (t < 100) return { state: 'idle', t };
    if (t < 140) return { state: 'warn', t: t - 100 };
    return { state: 'fire', t: t - 140 };
  }

  updateGeyser(e) {
    const { state, t } = this.geyserState(e);
    const vx = e.tx * TILE;
    const vy = e.ty * TILE;
    if (state === 'fire') {
      e.height = Math.min(GEYSER_HEIGHT, t * 6, (60 - t) * 6);
      if (!e.wasOn && this.onScreen(vx, vy)) this.hooks.sfx('geyser');
      e.wasOn = true;
      if (Math.random() < 0.8) {
        this.particle(vx + 4 + Math.random() * 8, vy - Math.random() * e.height, (Math.random() - 0.5) * 0.6, -1 - Math.random(), 18, Math.random() < 0.5 ? '#ffd34a' : '#ff6a1f', 3, 0, true);
      }
      const p = this.player;
      if (!p.dead && !this.god && e.height > 6 && this.overlaps(p, vx + 3, vy - e.height, 10, e.height)) this.kill('fire');
    } else {
      e.height = 0;
      e.wasOn = false;
      if (state === 'warn' && Math.random() < 0.3) {
        this.particle(vx + 4 + Math.random() * 8, vy, 0, -0.5 - Math.random() * 0.5, 25, '#888', 3, -0.005);
      }
    }
  }

  // Embers off any lava surface in view, and the rising lava of a vertical
  // level: idle for `rise.delay`, then up at `rise.speed`, faster the
  // further below the player it is — a rubber band, so lingering is punished
  // but a quick climber is never left with nothing behind them.
  updateLava() {
    // Embers off lava surfaces near the camera.
    const cx0 = Math.floor(this.camera.x / TILE);
    const cy0 = Math.floor(this.camera.y / TILE);
    for (let i = 0; i < 2; i++) {
      const tx = cx0 + Math.floor(Math.random() * 21);
      const ty = cy0 + Math.floor(Math.random() * 12);
      if (this.tile(tx, ty) === T.LAVA && this.tile(tx, ty - 1) !== T.LAVA) {
        this.particle(tx * TILE + Math.random() * 16, ty * TILE + 4, (Math.random() - 0.5) * 0.3, -0.3 - Math.random() * 0.6, 60 + Math.random() * 60, Math.random() < 0.3 ? '#ffd34a' : '#ff6a1f', 1, -0.004, true);
      }
    }

    if (this.lavaY === null || this.player.dead) return;
    if (this.riseDelay > 0) {
      this.riseDelay--;
      if (this.riseDelay === 0) {
        this.hooks.sfx('rumble');
        this.shake = 4;
      }
      return;
    }
    // Faster when the player is far ahead, so the pressure never lets up.
    const gap = this.lavaY - (this.player.y + this.player.h);
    const speed = this.rise.speed + Math.max(0, gap - 150) * 0.003;
    this.lavaY -= speed;
    if (Math.random() < 0.5) {
      this.particle(this.camera.x + Math.random() * 320, this.lavaY + 2, (Math.random() - 0.5) * 0.4, -0.5 - Math.random(), 50, '#ffb347', 1, -0.004, true);
    }
  }

  // The flow of a chase level: idle for `chase.delay`, then right at
  // `chase.speed`, plus a rubber band past 240 px so it never falls far out
  // of sight. Running (1.9 px/update) outpaces it almost four to one; it is
  // stopping for long that it punishes.
  updateChase() {
    if (this.lavaX === null || this.player.dead) return;
    if (this.chaseDelay > 0) {
      this.chaseDelay--;
      if (this.chaseDelay === 0) {
        this.hooks.sfx('rumble');
        this.shake = 4;
      }
      return;
    }
    const gap = this.player.x - this.lavaX;
    this.lavaX += this.chase.speed + Math.max(0, gap - 240) * 0.003;
    if (Math.random() < 0.5) {
      this.particle(this.lavaX + 2, this.camera.y + Math.random() * 180, 0.3 + Math.random() * 0.6, -0.5 - Math.random(), 50, '#ffb347', 1, -0.004, true);
    }
  }

  // --- particles & camera ---------------------------------------------------------

  // Particles are cosmetic and capped; the solver replaces this with a no-op.
  // A number in [0, 1) from the world's own generator (mulberry32): the
  // same level and the same inputs give the same draws, and the solver's
  // snapshot carries the seed, so a route found by search replays exactly.
  rand() {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  particle(x, y, vx, vy, life, color, size, grav = 0, glow = false) {
    this.particles.add(x, y, vx, vy, life, color, size, 0, grav, glow);
  }

  updateParticles() {
    this.particles.update();
  }

  onScreen(x, y) {
    return this.camera.visible(x, y);
  }

  // The camera looks a little ahead of where the player faces and a little
  // above centre, clamped to the map so the void beyond the edges never
  // shows. In a golem fight it is clamped to the arena, which is one screen
  // wide.
  aimCamera() {
    const p = this.player;
    const left = this.bossFight ? this.boss.x0 : 0;
    this.camera.bounds = { x: left, y: 0, w: this.w * TILE - left, h: this.h * TILE };
    return [p.x + p.w / 2 + p.facing * 24, p.y + p.h / 2 - 10];
  }

  snapCamera() {
    this.camera.snap(...this.aimCamera());
  }

  updateCamera() {
    if (this.player.dead) return;
    this.camera.follow(...this.aimCamera());
  }
}
