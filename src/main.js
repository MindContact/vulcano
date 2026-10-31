// The game shell: screens (title, options, credits, level card, play, pause,
// tally, game over, victory), score and lives, settings. The fixed-step loop,
// the screen, input, sound and saving come from motorino.
//
// A motorino StateMachine drives everything (`STATES` below):
//
//   options <──> title ──GIOCA──> intro ──> play <──> paused ──> title
//   credits <──────┘
//                                ^        │
//                                │        ├─ exit ──> clear ──> intro (next level)
//                                │        │                └──> win ──> title
//                                │        └─ last life ──> gameover ──> intro (retry)
//
// The World knows nothing of this: it calls back through hooks and the shell
// decides what a death or an exit means.
//
// The game pauses when the window loses the focus; F toggles full screen.
// It installs as a PWA (manifest.webmanifest, sw.js) and plays offline.

import {
  Audio, Input, DEFAULT_PAD, StateMachine, VIEW_W, VIEW_H, createStore, drawSprite, drawText, setupScreen, startLoop, wrapText,
  watchFocus, canFullscreen, isFullscreen, toggleFullscreen, registerServiceWorker,
} from '../lib/motorino/src/index.js';
import { createSidicioNode } from '../lib/sidicio/src/node.js';
import { compileSongs } from './audio/songs.js';
import { SFX } from './audio/sfx.js';
import { LANGUAGES, defaultLanguage, strings } from './i18n.js';
import { LEVELS } from './game/levels.js';
import { World } from './game/world.js';
import { Renderer } from './game/render.js';
import { buildSprites, CHARACTER_IDS } from './game/sprites.js';
import { DIFFICULTIES, DIFFICULTY_IDS } from './game/difficulty.js';

const BOSS_BONUS = 5000;

// Vulcano has no action button nor inventory: only motorino's movement,
// jump and menu keys.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
  Enter: 'start',
  Escape: 'pause', KeyP: 'pause',
  KeyM: 'mute',
  KeyF: 'fullscreen',
};
const PAD = { ...DEFAULT_PAD, 2: [], 3: [] };

const params = new URLSearchParams(location.search);
const store = createStore('vulcano.v1');

class Game {
  constructor() {
    this.ctx = setupScreen(document.getElementById('screen'));

    const saved = store.load();
    this.settings = { music: 7, sfx: 8, model: 6581, lang: defaultLanguage(), character: 'explorer', difficulty: 'normal', muted: false, ...saved.settings };
    if (!LANGUAGES.includes(this.settings.lang)) this.settings.lang = 'it';
    if (!CHARACTER_IDS.includes(this.settings.character)) this.settings.character = 'explorer';
    if (!DIFFICULTY_IDS.includes(this.settings.difficulty)) this.settings.difficulty = 'normal';
    this.progress = { unlocked: 1, best: 0, ...saved.progress };
    this.god = params.has('god');

    this.audio = new Audio(this.settings, { createNode: createSidicioNode, songs: compileSongs(), sfx: SFX });
    this.input = new Input({ keys: KEYS, pad: PAD });
    this.input.onFirstGesture = () => this.audio.start();
    // Full screen must start inside the key or tap event: F anywhere, or
    // confirm and left/right on its row of the options.
    this.input.onPress = (a) => {
      const onRow = this.states.name === 'options' && this.optionItems()[this.menu][0] === this.t.fullscreen;
      if (a === 'fullscreen' || (onRow && ['start', 'jump', 'left', 'right'].includes(a))) toggleFullscreen();
    };
    this.audio.start();
    this.audio.onSongEnd = () => {
      if (this.states.name === 'win') this.audio.replay('title');
    };
    this.renderer = new Renderer(this.ctx, buildSprites());
    this.applyLook();

    this.time = 0;
    this.menu = 0;
    this.menuLevel = Math.min(this.progress.unlocked, LEVELS.length);
    this.states = new StateMachine(this, STATES);
    const direct = parseInt(params.get('level'), 10);
    if (direct >= 1 && direct <= LEVELS.length) {
      this.newGame(direct - 1);
    } else {
      this.toTitle();
    }

    watchFocus({
      lost: () => { if (this.states.name === 'play') this.setPaused(true); },
      hidden: () => this.audio.suspend(),
      shown: () => this.audio.resume(),
    });

    startLoop({
      update: () => {
        this.input.update();
        this.update();
      },
      draw: () => this.draw(),
    });
  }

  // Mute is a session toggle, not a preference: it is not saved.
  save() {
    const { muted, ...settings } = this.settings;
    store.save({ settings, progress: this.progress });
  }

  get diff() { return DIFFICULTIES[this.settings.difficulty]; }

  // The current language's strings.
  get t() {
    return strings(this.settings.lang);
  }

  applyLook() {
    this.renderer.character = this.settings.character;
    document.documentElement.lang = this.settings.lang;
  }

  // --- flow ---------------------------------------------------------------------

  toTitle() {
    this.menu = 0;
    this.world = null;
    this.audio.play('title');
    this.states.go('title');
  }

  newGame(levelIndex) {
    this.score = 0;
    this.lives = this.diff.lives;
    this.gemsTotal = 0;
    this.startLevel(levelIndex);
  }

  startLevel(index) {
    this.levelIndex = index;
    this.levelStartScore = this.score;
    this.world = new World(index, LEVELS[index], {
      sfx: (name) => this.audio.sfx(name),
      onGem: () => this.onGem(),
      onStomp: () => { this.score += 200; },
      onDeath: () => this.onDeath(),
      onExit: () => this.onExit(),
      onBoss: () => {
        this.score += BOSS_BONUS;
        this.banner = { text: this.t.bossDown(BOSS_BONUS), time: 150 };
      },
    }, { god: this.god, diff: this.diff });
    this.renderer.bakeLevel(this.world);
    this.audio.replay(LEVELS[index].music);
    this.states.go('intro');
  }

  onGem() {
    this.score += 100;
    this.gemsTotal++;
    if (this.gemsTotal % this.diff.gemsPerLife === 0) {
      this.lives++;
      this.audio.sfx('life');
      this.banner = { text: this.t.extraLife, time: 90 };
    } else {
      this.audio.sfx('gem');
    }
  }

  // Called when the death animation ends.
  onDeath() {
    this.lives--;
    if (this.lives <= 0) {
      this.audio.replay('gameOver');
      this.states.go('gameover');
      return;
    }
    this.world.respawn();
  }

  // The tally: time bonus is 20 points for every second under the level's
  // par, plus 1000 for taking every crystal of the level.
  onExit() {
    if (this.states.name !== 'play') return;
    const w = this.world;
    const seconds = Math.floor(w.time / 60);
    const all = w.gemsTaken === w.level.gemCount;
    this.tally = {
      seconds,
      gems: w.gemsTaken,
      gemTotal: w.level.gemCount,
      timeBonus: Math.max(0, w.def.par - seconds) * 20,
      allBonus: all ? 1000 : 0,
      shown: 0,
    };
    this.tally.total = this.tally.timeBonus + this.tally.allBonus;
    this.states.go('clear');
    this.audio.sfx('door');
    this.audio.replay('clear');
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(LEVELS.length, this.levelIndex + 2));
    this.save();
  }

  setPaused(paused) {
    this.states.go(paused ? 'paused' : 'play');
    this.menu = 0;
    this.audio.pause(paused);
    this.audio.sfx('pause');
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.applySettings();
  }

  // --- update -------------------------------------------------------------------

  update() {
    this.time++;
    if (this.input.pressed('mute')) this.toggleMute();
    if (this.banner && --this.banner.time <= 0) this.banner = null;
    this.states.update();
  }

  // The level is on: the world steps and the music follows the fight. A
  // death puts the golem back to sleep and the level's song back on.
  updatePlay() {
    if (this.input.pressed('pause')) { this.setPaused(true); return; }
    this.world.update(this.input);
    this.audio.play(this.world.bossFight ? 'golem' : LEVELS[this.levelIndex].music);
  }

  menuItems() {
    const t = this.t;
    return [t.play, `${t.level}  < ${this.menuLevel} >`, t.options, t.credits];
  }

  // Up and down move the cursor over `n` items; returns the left/right step.
  moveCursor(n) {
    const input = this.input;
    if (input.pressed('down')) { this.menu = (this.menu + 1) % n; this.audio.sfx('move'); }
    if (input.pressed('up')) { this.menu = (this.menu + n - 1) % n; this.audio.sfx('move'); }
    return (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
  }

  updateTitle() {
    const input = this.input;
    const d = this.moveCursor(this.menuItems().length);
    const unlocked = this.progress.unlocked;
    const changeLevel = (dir) => {
      this.menuLevel = ((this.menuLevel - 1 + dir + unlocked) % unlocked) + 1;
      this.audio.sfx('move');
    };
    if (d && this.menu === 1) changeLevel(d);
    if (!input.confirm()) return;
    if (this.menu === 0) {
      this.audio.sfx('select');
      this.newGame(this.menuLevel - 1);
    } else if (this.menu === 1) {
      changeLevel(1);
    } else if (this.menu === 3) {
      this.audio.sfx('select');
      this.states.go('credits');
    } else {
      this.audio.sfx('select');
      this.menu = 0;
      this.states.go('options');
    }
  }

  // [label, value] rows of the options screen; a null value is a plain item.
  // Full screen only where the browser has it (not on iPhone).
  optionItems() {
    const t = this.t;
    const s = this.settings;
    return [
      [t.language, t.languageName],
      [t.difficulty, t.difficulties[s.difficulty].name],
      [t.character, t.characters[s.character]],
      [t.chip, `${s.model}`],
      [t.music, `${s.music}`],
      [t.sfx, `${s.sfx}`],
      ...(canFullscreen() ? [[t.fullscreen, isFullscreen() ? t.on : t.off]] : []),
      [t.back, null],
    ];
  }

  updateOptions() {
    const input = this.input;
    const items = this.optionItems();
    const d = this.moveCursor(items.length);
    const leave = () => {
      this.audio.sfx('select');
      this.states.go('title');
      this.menu = 2;
    };
    if (input.pressed('pause')) { leave(); return; }
    const s = this.settings;
    const cycle = (list, value, dir) => list[(list.indexOf(value) + dir + list.length) % list.length];
    const change = (dir) => {
      switch (this.menu) {
        case 0: s.lang = cycle(LANGUAGES, s.lang, dir); break;
        case 1: s.difficulty = cycle(DIFFICULTY_IDS, s.difficulty, dir); break;
        case 2: s.character = cycle(CHARACTER_IDS, s.character, dir); break;
        case 3: s.model = s.model === 6581 ? 8580 : 6581; break;
        case 4: s.music = Math.max(0, Math.min(10, s.music + dir)); break;
        case 5: s.sfx = Math.max(0, Math.min(10, s.sfx + dir)); break;
        // Full screen (row 6, when there is one) is toggled by Input.onPress.
        default: return;
      }
      this.applyLook();
      this.audio.applySettings();
      this.audio.sfx('move');
      this.save();
    };
    if (d) change(d);
    if (input.confirm()) {
      if (this.menu === items.length - 1) leave();
      else change(1);
    }
  }

  updatePause() {
    const input = this.input;
    if (input.pressed('up') || input.pressed('down')) { this.menu = 1 - this.menu; this.audio.sfx('move'); }
    if (input.pressed('pause')) { this.setPaused(false); return; }
    if (input.confirm()) {
      if (this.menu === 0) this.setPaused(false);
      else { this.audio.pause(false); this.toTitle(); }
    }
  }

  updateClear(time) {
    const t = this.tally;
    if (time > 60 && t.shown < t.total) {
      const step = Math.min(t.total - t.shown, 50);
      t.shown += step;
      this.score += step;
      if (time % 3 === 0) this.audio.sfx('tally');
    }
    if (time > 90 && this.input.confirm()) {
      this.score += t.total - t.shown;
      t.shown = t.total;
      if (this.levelIndex + 1 < LEVELS.length) {
        this.startLevel(this.levelIndex + 1);
      } else {
        this.audio.replay('victory');
        this.progress.best = Math.max(this.progress.best, this.score);
        this.save();
        this.states.go('win');
      }
    }
  }

  // --- draw -----------------------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.states.draw(ctx);
    if (this.world && this.banner) {
      drawText(ctx, this.banner.text, VIEW_W / 2, 40, { color: '#7ef6ff', align: 'center', scale: 2 });
    }
  }

  // Title and options: the volcano sky scrolling behind, dimmed.
  drawMenuBackground() {
    this.renderer.drawBackground('sky', this.time * 0.6, 0, this.time);
    this.dim(0.25);
  }

  drawPlay() {
    this.renderer.drawWorld(this.world);
    this.drawHud();
  }

  dim(alpha = 0.6) {
    this.ctx.fillStyle = `rgba(10,2,2,${alpha})`;
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  fireGradient(y, h) {
    const g = this.ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.45, '#ffb347');
    g.addColorStop(1, '#e8400f');
    return g;
  }

  drawHud() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,2,2,0.55)';
    ctx.fillRect(0, 0, VIEW_W, 11);
    drawText(ctx, '$', 4, 2, { color: '#47d6ff' });
    drawText(ctx, `${this.world.gemsTaken}/${this.world.level.gemCount}`, 12, 2, { color: '#d8fbff' });
    drawText(ctx, '*', 62, 2, { color: '#ff4a2a' });
    drawText(ctx, `${this.lives}`, 70, 2);
    drawText(ctx, `${this.levelIndex + 1}-${this.levelName().toUpperCase()}`, VIEW_W / 2 + 14, 2, { color: '#ffb347', align: 'center' });
    const secs = Math.floor(this.world.time / 60);
    drawText(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, VIEW_W - 64, 2, { color: '#ccc', align: 'right' });
    drawText(ctx, String(this.score).padStart(6, '0'), VIEW_W - 4, 2, { align: 'right' });
    this.drawBossBar();
    if (this.settings.muted) drawText(ctx, this.t.muted, 4, VIEW_H - 10, { color: '#888' });
    if (this.god) drawText(ctx, 'GOD', VIEW_W - 4, VIEW_H - 10, { color: '#888', align: 'right' });
  }

  // The golem's name and one segment per hit left, while the fight is on.
  drawBossBar() {
    const b = this.world.boss;
    if (!b || b.state === 'sleep' || b.hp <= 0) return;
    const ctx = this.ctx;
    const y = VIEW_H - 14;
    drawText(ctx, this.t.bossName, VIEW_W / 2, y - 10, { align: 'center', color: '#ffb347' });
    const seg = 30;
    const x0 = VIEW_W / 2 - (seg * b.hp + 2 * (b.hp - 1)) / 2;
    for (let i = 0; i < b.hp; i++) {
      ctx.fillStyle = '#1b0b0b';
      ctx.fillRect(x0 + i * (seg + 2) - 1, y - 1, seg + 2, 6);
      ctx.fillStyle = (this.time >> 3) % 2 && b.state === 'stunned' ? '#ffe27a' : '#ff4a2a';
      ctx.fillRect(x0 + i * (seg + 2), y, seg, 4);
    }
  }

  levelName() {
    return LEVELS[this.levelIndex].name[this.settings.lang];
  }

  drawTitle() {
    const ctx = this.ctx;
    const t = this.t;
    const bob = Math.round(Math.sin(this.time * 0.04) * 2);
    drawText(ctx, 'VULCANO', VIEW_W / 2, 22 + bob, { scale: 5, align: 'center', color: this.fireGradient(22 + bob, 35), shadow: '#2a0505' });
    drawText(ctx, t.tagline, VIEW_W / 2, 64, { align: 'center', color: '#ffb347' });

    this.menuItems().forEach((item, i) => {
      const sel = i === this.menu;
      const y = 90 + i * 14;
      drawText(ctx, item, VIEW_W / 2, y, { align: 'center', color: sel ? '#fff3b0' : '#a07060' });
      if (sel && (this.time >> 4) % 2) drawText(ctx, '>', VIEW_W / 2 - 64, y, { color: '#ff6a1f' });
    });
    if (this.progress.best) drawText(ctx, t.record(this.progress.best), VIEW_W / 2, 148, { align: 'center', color: '#c08070' });
    const hint = this.audio.started ? t.keysHint : t.startHint;
    drawText(ctx, hint, VIEW_W / 2, 166, { align: 'center', color: this.audio.started ? '#806050' : ((this.time >> 5) % 2 ? '#fff3b0' : '#ff6a1f') });
  }

  // Labels on the left, values between arrows in a second column, and the
  // chosen character running on the spot at three times its size. On the
  // difficulty row, what it changes is spelled out at the bottom, as in
  // Stazione Zero.
  drawOptions() {
    const ctx = this.ctx;
    drawText(ctx, this.t.options, VIEW_W / 2, 16, { scale: 3, align: 'center', color: this.fireGradient(16, 21) });
    this.optionItems().forEach(([label, value], i) => {
      const sel = i === this.menu;
      const y = 46 + i * 14;
      const color = sel ? '#fff3b0' : '#a07060';
      drawText(ctx, label, 34, y, { color });
      if (value !== null) drawText(ctx, `< ${value} >`, 172, y, { align: 'center', color });
      if (sel && (this.time >> 4) % 2) drawText(ctx, '>', 24, y, { color: '#ff6a1f' });
    });
    const s = this.renderer.sprites.players[this.settings.character];
    const img = [s.run1, s.run2, s.run3, s.run2][(this.time >> 3) % 4];
    ctx.save();
    ctx.translate(272, 120);
    ctx.scale(3, 3);
    drawSprite(ctx, img, 0, 0);
    ctx.restore();
    ctx.fillStyle = '#ff6a1f';
    ctx.fillRect(248, 121, 48, 2);
    if (this.menu === 1) {
      wrapText(this.t.difficulties[this.settings.difficulty].desc, VIEW_W - 12).forEach((line, i) => {
        drawText(ctx, line, VIEW_W / 2, VIEW_H - 26 + i * 9, { align: 'center', color: '#c08070' });
      });
    }
  }

  // [role, name] pairs, centred one under the other; the cursor stays on
  // CREDITI so leaving lands back on it.
  updateCredits() {
    if (this.input.confirm() || this.input.pressed('pause')) {
      this.audio.sfx('select');
      this.states.go('title');
    }
  }

  drawCredits() {
    const ctx = this.ctx;
    const t = this.t;
    drawText(ctx, t.credits, VIEW_W / 2, 16, { scale: 3, align: 'center', color: this.fireGradient(16, 21) });
    t.creditRows.forEach(([role, name], i) => {
      const y = 50 + i * 24;
      drawText(ctx, role, VIEW_W / 2, y, { align: 'center', color: '#a07060' });
      drawText(ctx, name, VIEW_W / 2, y + 10, { align: 'center', color: '#fff3b0' });
    });
    drawText(ctx, t.creditsThanks, VIEW_W / 2, 148, { align: 'center', color: '#ffb347' });
    drawText(ctx, t.backHint, VIEW_W / 2, 166, { align: 'center', color: (this.time >> 5) % 2 ? '#ffb347' : '#806050' });
  }

  drawIntro() {
    const ctx = this.ctx;
    const t = this.t;
    this.dim(0.7);
    drawText(ctx, t.levelCard(this.levelIndex + 1), VIEW_W / 2, 60, { align: 'center', color: '#ffb347', scale: 2 });
    drawText(ctx, this.levelName().toUpperCase(), VIEW_W / 2, 82, { align: 'center', color: this.fireGradient(82, 21), scale: 3 });
    const warning = LEVELS[this.levelIndex].rise ? t.lavaRises : LEVELS[this.levelIndex].chase ? t.lavaChases : null;
    if (warning) {
      drawText(ctx, warning, VIEW_W / 2, 118, { align: 'center', color: (this.time >> 3) % 2 ? '#ff4a2a' : '#ffd34a' });
    }
    drawText(ctx, t.lives(this.lives), VIEW_W / 2, 136, { align: 'center', color: '#ccc' });
  }

  drawPause() {
    const ctx = this.ctx;
    const t = this.t;
    this.dim(0.6);
    drawText(ctx, t.pause, VIEW_W / 2, 60, { align: 'center', scale: 3, color: '#ffb347' });
    [t.resume, t.toMenu].forEach((item, i) => {
      drawText(ctx, item, VIEW_W / 2, 98 + i * 14, { align: 'center', color: i === this.menu ? '#fff3b0' : '#a07060' });
    });
  }

  drawClear() {
    const ctx = this.ctx;
    const t = this.t;
    const tally = this.tally;
    this.dim(0.65);
    drawText(ctx, t.levelClear, VIEW_W / 2, 36, { align: 'center', scale: 2, color: this.fireGradient(36, 14) });
    const rows = [
      [t.crystals, `${tally.gems}/${tally.gemTotal}`],
      [t.time, `${Math.floor(tally.seconds / 60)}:${String(tally.seconds % 60).padStart(2, '0')}`],
      [t.timeBonus, `${tally.timeBonus}`],
      [t.allCrystals, `${tally.allBonus}`],
    ];
    rows.forEach(([k, v], i) => {
      if (this.states.time < 20 + i * 10) return;
      drawText(ctx, k, 70, 70 + i * 12, { color: '#c08070' });
      drawText(ctx, v, 250, 70 + i * 12, { align: 'right', color: '#fff3b0' });
    });
    drawText(ctx, t.points(this.score), VIEW_W / 2, 128, { align: 'center', scale: 2 });
    if (this.states.time > 90 && (this.time >> 4) % 2) drawText(ctx, t.continueHint, VIEW_W / 2, 160, { align: 'center', color: '#ffb347' });
  }

  drawGameOver() {
    const ctx = this.ctx;
    this.dim(0.75);
    drawText(ctx, 'GAME OVER', VIEW_W / 2, 60, { align: 'center', scale: 4, color: this.fireGradient(60, 28) });
    if (this.states.time > 60) {
      drawText(ctx, this.t.retryHint, VIEW_W / 2, 114, { align: 'center', color: '#fff3b0' });
      drawText(ctx, this.t.menuHint, VIEW_W / 2, 128, { align: 'center', color: '#a07060' });
    }
  }

  drawWin() {
    const ctx = this.ctx;
    const t = this.t;
    this.dim(0.6);
    drawText(ctx, t.win1, VIEW_W / 2, 40, { align: 'center', scale: 3, color: this.fireGradient(40, 21) });
    drawText(ctx, t.win2, VIEW_W / 2, 66, { align: 'center', scale: 3, color: this.fireGradient(66, 21) });
    drawText(ctx, t.points(this.score), VIEW_W / 2, 104, { align: 'center', scale: 2 });
    drawText(ctx, t.record(this.progress.best), VIEW_W / 2, 124, { align: 'center', color: '#c08070' });
    if (this.states.time > 120) drawText(ctx, t.winHint, VIEW_W / 2, 156, { align: 'center', color: '#ffb347' });
  }

}

// The screens. `m.game` is the Game, `m.time` the updates since the screen
// came up.
const STATES = {
  title: {
    update: (m) => m.game.updateTitle(),
    draw: (m) => { m.game.drawMenuBackground(); m.game.drawTitle(); },
  },
  options: {
    update: (m) => m.game.updateOptions(),
    draw: (m) => { m.game.drawMenuBackground(); m.game.drawOptions(); },
  },
  credits: {
    update: (m) => m.game.updateCredits(),
    draw: (m) => { m.game.drawMenuBackground(); m.game.drawCredits(); },
  },
  intro: {
    update(m) {
      if (m.time > 140 || (m.time > 20 && m.game.input.confirm())) m.go('play');
    },
    draw: (m) => { m.game.drawPlay(); m.game.drawIntro(); },
  },
  play: {
    update: (m) => m.game.updatePlay(),
    draw: (m) => m.game.drawPlay(),
  },
  paused: {
    update: (m) => m.game.updatePause(),
    draw: (m) => { m.game.drawPlay(); m.game.drawPause(); },
  },
  clear: {
    update: (m) => m.game.updateClear(m.time),
    draw: (m) => { m.game.drawPlay(); m.game.drawClear(); },
  },
  gameover: {
    update(m) {
      const g = m.game;
      if (m.time > 60 && g.input.confirm()) {
        g.score = g.levelStartScore;
        g.lives = g.diff.lives;
        g.startLevel(g.levelIndex);
      } else if (m.time > 60 && g.input.pressed('pause')) {
        g.toTitle();
      }
    },
    draw: (m) => { m.game.drawPlay(); m.game.drawGameOver(); },
  },
  win: {
    update(m) {
      if (m.time > 120 && m.game.input.confirm()) m.game.toTitle();
    },
    draw: (m) => { m.game.drawPlay(); m.game.drawWin(); },
  },
};

window.game = new Game();
registerServiceWorker();
