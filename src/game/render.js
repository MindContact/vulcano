// Draws a World on the 320x180 canvas. Static tiles are baked once per level
// into one big canvas; lava, crumbling rock, entities and particles are drawn
// every frame on top.
//
// Layer order per frame: parallax background, baked rock, animated tiles
// (lava, crumbles) with their additive glow, entities, player, rising lava,
// particles. The shell then draws the HUD and any overlay on top.
//
// Glow is drawn with `globalCompositeOperation = 'lighter'` (additive), which
// is what makes lava light up the rock around it without any lighting pass.

import { VIEW_W, VIEW_H, drawSprite } from '../../lib/motorino/src/index.js';
import { TILE, T } from './levels.js';

// A small deterministic hash, so baked textures look the same every run.
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class Renderer {
  constructor(ctx, sprites) {
    this.ctx = ctx;
    this.sprites = sprites;
    // Which skin drawPlayer uses; the shell sets it from the settings.
    this.character = 'explorer';
    this.glow = this.makeGlow(48, 32, 'rgba(255,110,30,0.55)');
    this.smallGlow = this.makeGlow(24, 24, 'rgba(255,160,60,0.6)');
    this.bgSky = this.makeSky();
    this.bgCave = this.makeCave();
  }

  makeGlow(w, h, color) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.scale(1, h / w);
    g.fillRect(0, 0, w, w);
    return c;
  }

  // --- backgrounds --------------------------------------------------------------

  makeSky() {
    const far = canvas(640, VIEW_H);
    let g = far.getContext('2d');
    // Two volcanoes per 640 px, the big one erupting.
    const cone = (cx, base, top, half, crater, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(cx - half, base);
      for (let x = -half; x <= half; x += 4) {
        const t = Math.abs(x) / half;
        const y = top + (base - top) * Math.pow(t, 0.8) + (hash(cx + x, 1) - 0.5) * 4;
        g.lineTo(cx + x, Math.abs(x) < crater ? top + 3 : y);
      }
      g.lineTo(cx + half, base);
      g.fill();
    };
    cone(180, VIEW_H, 52, 190, 14, '#2a0c0a');
    cone(500, VIEW_H, 96, 140, 8, '#220a09');
    // Lava streaks down the big cone.
    g.strokeStyle = 'rgba(255,90,20,0.55)';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = 172 + i * 4;
      g.moveTo(x, 56);
      for (let y = 56; y < 120 + i * 10; y += 3) {
        x += (hash(i, y) - 0.5) * 3 + (i - 2) * 0.5;
        g.lineTo(x, y);
      }
      g.stroke();
    }

    const mid = canvas(480, VIEW_H);
    g = mid.getContext('2d');
    g.fillStyle = '#150605';
    g.beginPath();
    g.moveTo(0, VIEW_H);
    for (let x = 0; x <= 480; x += 2) {
      const y = 128 + Math.sin(x * 0.013) * 14 + Math.sin(x * 0.041 + 1) * 6 + (hash(x, 7) - 0.5) * 2;
      g.lineTo(x, y);
    }
    g.lineTo(480, VIEW_H);
    g.fill();
    return { far, mid };
  }

  makeCave() {
    const tex = canvas(256, 256);
    const g = tex.getContext('2d');
    g.fillStyle = '#140b0a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = Math.floor(hash(i, 1) * 256);
      const y = Math.floor(hash(i, 2) * 256);
      const r = 2 + Math.floor(hash(i, 3) * 10);
      g.fillStyle = hash(i, 4) < 0.5 ? '#1a0f0d' : '#100807';
      g.fillRect(x, y, r, Math.ceil(r * 0.6));
    }
    // Distant lavafalls, drawn dim; they flicker at draw time.
    const falls = canvas(400, VIEW_H);
    const f = falls.getContext('2d');
    for (const [x, w] of [[60, 6], [230, 4], [330, 8]]) {
      const grad = f.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, 'rgba(255,120,30,0.0)');
      grad.addColorStop(0.3, 'rgba(255,110,30,0.35)');
      grad.addColorStop(1, 'rgba(255,70,20,0.5)');
      f.fillStyle = grad;
      f.fillRect(x, 0, w, VIEW_H);
      f.fillStyle = 'rgba(255,90,30,0.12)';
      f.fillRect(x - 8, 0, w + 16, VIEW_H);
    }
    return { tex, falls };
  }

  drawBackground(kind, camX, camY, time) {
    const ctx = this.ctx;
    if (kind === 'cave') {
      const { tex, falls } = this.bgCave;
      const ox = -Math.floor(camX * 0.3) % 256;
      const oy = -Math.floor(camY * 0.3) % 256;
      for (let x = ox - 256; x < VIEW_W; x += 256) {
        for (let y = oy - 256; y < VIEW_H; y += 256) ctx.drawImage(tex, x, y);
      }
      ctx.globalAlpha = 0.75 + Math.sin(time * 0.05) * 0.15;
      const fx = -Math.floor(camX * 0.15) % 400;
      ctx.drawImage(falls, fx, 0);
      ctx.drawImage(falls, fx + 400, 0);
      ctx.globalAlpha = 1;
      const shade = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      shade.addColorStop(0, 'rgba(0,0,0,0.4)');
      shade.addColorStop(1, 'rgba(60,10,0,0.25)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#0b0306');
    sky.addColorStop(0.55, '#3a0b0a');
    sky.addColorStop(1, '#8a2a0c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const { far, mid } = this.bgSky;
    const fy = Math.round(-camY * 0.05);
    const fx = -Math.floor(camX * 0.08) % 640;
    // Eruption glow behind the big crater, pulsing.
    const pulse = 0.6 + Math.sin(time * 0.03) * 0.2;
    for (const base of [fx, fx + 640]) {
      ctx.globalAlpha = pulse;
      ctx.drawImage(this.glow, base + 180 - 60, fy + 20, 120, 70);
      ctx.globalAlpha = 1;
      // Smoke plume.
      for (let i = 0; i < 8; i++) {
        const t = (time * 0.15 + i * 18) % 144;
        const r = 6 + t * 0.25;
        ctx.fillStyle = `rgba(40,20,20,${0.5 * (1 - t / 144)})`;
        ctx.beginPath();
        ctx.arc(base + 180 + Math.sin(i + t * 0.03) * 6 + t * 0.4, fy + 50 - t * 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.drawImage(far, base, fy);
    }
    const mx = -Math.floor(camX * 0.25) % 480;
    const my = Math.round(-camY * 0.12);
    ctx.drawImage(mid, mx, my);
    ctx.drawImage(mid, mx + 480, my);
    ctx.fillStyle = '#150605';
    if (my < 0) ctx.fillRect(0, VIEW_H + my, VIEW_W, -my);
    // Falling ash.
    ctx.fillStyle = 'rgba(180,160,150,0.35)';
    for (let i = 0; i < 40; i++) {
      const x = (hash(i, 9) * 400 + time * (0.2 + hash(i, 3) * 0.3) - camX * 0.4) % 400;
      const y = (hash(i, 5) * 220 + time * (0.3 + hash(i, 4) * 0.3)) % 220;
      ctx.fillRect(Math.floor((x + 400) % 400) - 40, Math.floor(y) - 20, 1, 1);
    }
  }

  // --- static tiles ----------------------------------------------------------------

  // Rock edges depend on neighbours (lit top, dark underside, side shadows),
  // so baking them once is far cheaper than per-frame autotiling. Crumbling
  // rock and lava are left out: they change.
  bakeLevel(world) {
    const { w, h } = world;
    const c = canvas(w * TILE, h * TILE);
    const g = c.getContext('2d');
    // Beyond the side edges is rock; above and below is open.
    const t = (x, y) => (y < 0 || y >= h ? T.EMPTY : x < 0 || x >= w ? T.ROCK : world.level.tiles[y * w + x]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tile = world.level.tiles[y * w + x];
        const px = x * TILE;
        const py = y * TILE;
        if (tile === T.ROCK || tile === T.VENT) this.drawRock(g, px, py, x, y, t, tile === T.VENT);
        else if (tile === T.CRUST) this.drawCrust(g, px, py, x, y);
        else if (tile === T.SPIKES) this.drawSpikes(g, px, py);
      }
    }
    this.levelLayer = c;
  }

  drawRock(g, px, py, x, y, t, vent) {
    const open = (tt) => tt !== T.ROCK && tt !== T.VENT && tt !== T.CRUMBLE;
    const up = open(t(x, y - 1));
    const down = open(t(x, y + 1));
    const left = open(t(x - 1, y));
    const right = open(t(x + 1, y));
    const deep = !up && !down && !left && !right;
    g.fillStyle = deep ? '#1f1211' : '#2c1b17';
    g.fillRect(px, py, TILE, TILE);
    for (let i = 0; i < 10; i++) {
      const sx = Math.floor(hash(x, y, i) * 15);
      const sy = Math.floor(hash(y, x, i + 50) * 15);
      g.fillStyle = hash(x + i, y) < 0.5 ? '#21130f' : '#3a2620';
      g.fillRect(px + sx, py + sy, 2, 1);
    }
    if (left) { g.fillStyle = '#1a0e0c'; g.fillRect(px, py, 1, TILE); }
    if (right) { g.fillStyle = '#1a0e0c'; g.fillRect(px + 15, py, 1, TILE); }
    if (down) {
      g.fillStyle = '#160b09';
      g.fillRect(px, py + 14, TILE, 2);
      for (let i = 0; i < 3; i++) {
        const sx = Math.floor(hash(x, y, 90 + i) * 14);
        g.fillRect(px + sx, py + 16, 2, 1 + Math.floor(hash(x, y, 95 + i) * 3));
      }
    }
    if (up) {
      g.fillStyle = '#4c2f26';
      g.fillRect(px, py, TILE, 3);
      g.fillStyle = '#6e4535';
      g.fillRect(px, py, TILE, 1);
      for (let i = 0; i < 4; i++) {
        const sx = Math.floor(hash(x, y, 20 + i) * 16);
        g.fillStyle = '#2c1b17';
        g.fillRect(px + sx, py + 3, 2, 1 + Math.floor(hash(x, y, 30 + i) * 2));
      }
      // A rare glowing seam on exposed rock.
      if (hash(x, y, 7) < 0.15) {
        g.fillStyle = '#ff6a1f';
        const sx = Math.floor(hash(x, y, 8) * 12);
        g.fillRect(px + sx, py + 5, 3, 1);
        g.fillRect(px + sx + 2, py + 6, 2, 1);
      }
    }
    if (vent) {
      g.fillStyle = '#140807';
      g.fillRect(px + 3, py, 10, 4);
      g.fillStyle = '#7a1e08';
      g.fillRect(px + 5, py + 1, 6, 2);
      g.fillStyle = '#4c2f26';
      g.fillRect(px + 1, py, 2, 2);
      g.fillRect(px + 13, py, 2, 2);
    }
  }

  drawCrust(g, px, py, x, y) {
    g.fillStyle = '#5a3a2c';
    g.fillRect(px, py, TILE, 5);
    g.fillStyle = '#80543f';
    g.fillRect(px, py, TILE, 1);
    g.fillStyle = '#3a241c';
    for (let i = 0; i < 16; i += 2) {
      g.fillRect(px + i, py + 5, 2, 1 + Math.floor(hash(x * 16 + i, y) * 3));
    }
    g.fillStyle = '#ff7a1f';
    if (hash(x, y, 3) < 0.4) g.fillRect(px + Math.floor(hash(x, y, 4) * 12), py + 3, 3, 1);
  }

  drawSpikes(g, px, py) {
    for (let i = 0; i < 3; i++) {
      const bx = px + 1 + i * 5;
      for (let r = 0; r < 9; r++) {
        const half = Math.floor((r + 1) / 4);
        g.fillStyle = '#2b1f3a';
        g.fillRect(bx + 2 - half, py + 7 + r, half * 2 + 1, 1);
        g.fillStyle = '#7d68ad';
        g.fillRect(bx + 2 - half, py + 7 + r, 1, 1);
      }
    }
  }

  // --- the frame ---------------------------------------------------------------------

  // Screen shake is a random offset of the whole camera; the baked layer is
  // blitted only for the visible window.
  drawWorld(world) {
    const ctx = this.ctx;
    const shakeX = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    const shakeY = world.shake ? (Math.random() - 0.5) * world.shake : 0;
    const cx = Math.round(world.camera.x + shakeX);
    const cy = Math.round(world.camera.y + shakeY);
    this.drawBackground(world.def.bg, cx, cy, world.time);

    ctx.save();
    ctx.translate(-cx, -cy);
    ctx.drawImage(this.levelLayer, cx, cy, VIEW_W, VIEW_H, cx, cy, VIEW_W, VIEW_H);
    this.drawDynamicTiles(world, cx, cy);
    this.drawEntities(world);
    this.drawCurtain(world, cy);
    this.drawPlayer(world);
    this.drawRisingLava(world, cx, cy);
    this.drawChasingLava(world, cx, cy);
    this.drawParticles(world);
    ctx.restore();
  }

  drawDynamicTiles(world, cx, cy) {
    const ctx = this.ctx;
    const t = world.time;
    const x0 = Math.max(0, Math.floor(cx / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE));
    const x1 = Math.min(world.w - 1, x0 + 21);
    const y1 = Math.min(world.h - 1, y0 + 12);
    const glows = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const tile = world.tiles[y * world.w + x];
        const px = x * TILE;
        const py = y * TILE;
        if (tile === T.LAVA) {
          const surface = world.tile(x, y - 1) !== T.LAVA;
          this.drawLavaTile(px, py, surface, t);
          if (surface) glows.push(px);
          if (surface) glows.push(py);
        } else if (tile === T.CRUMBLE) {
          const s = world.crumbleShake(x, y);
          const jx = s > 0 ? Math.round((Math.random() - 0.5) * 2 * (0.5 + s)) : 0;
          ctx.fillStyle = '#4b3427';
          ctx.fillRect(px + jx, py, TILE, TILE);
          ctx.fillStyle = '#6b4a37';
          ctx.fillRect(px + jx, py, TILE, 2);
          ctx.fillStyle = '#231510';
          ctx.fillRect(px + jx + 4, py + 2, 1, 6);
          ctx.fillRect(px + jx + 5, py + 7, 4, 1);
          ctx.fillRect(px + jx + 9, py + 7, 1, 7);
          ctx.fillRect(px + jx + 12, py + 3, 1, 4);
          ctx.fillRect(px + jx + 1, py + 11, 5, 1);
          ctx.fillRect(px + jx, py + 15, TILE, 1);
        }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + Math.sin(t * 0.06) * 0.1;
    for (let i = 0; i < glows.length; i += 2) ctx.drawImage(this.glow, glows[i] - 16, glows[i + 1] - 20);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawLavaTile(px, py, surface, t) {
    const ctx = this.ctx;
    // A surface tile leaves its top few pixels for the wave.
    const top = surface ? 4 : 0;
    ctx.fillStyle = '#c4300f';
    ctx.fillRect(px, py + top, TILE, TILE - top);
    // Slow bright blobs drifting through the body.
    for (let i = 0; i < 2; i++) {
      const bx = ((px * 0.37 + i * 7 + t * (0.15 + i * 0.1)) % 20) - 2;
      const by = top + ((py * 0.5 + i * 9 + Math.sin(t * 0.03 + px) * 3 + 14) % (14 - top));
      ctx.fillStyle = i ? '#ff6a1f' : '#e44a14';
      ctx.fillRect(px + Math.max(0, Math.floor(bx)), py + Math.floor(by), 5, 2);
    }
    if (!surface) return;
    for (let i = 0; i < TILE; i++) {
      const wx = px + i;
      const wave = 3 + Math.round(Math.sin(wx * 0.3 + t * 0.08) * 1.2 + Math.sin(wx * 0.11 - t * 0.05));
      ctx.fillStyle = '#ffd34a';
      ctx.fillRect(wx, py + wave, 1, 1);
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(wx, py + wave + 1, 1, Math.max(1, 6 - wave));
    }
  }

  // The flow of a chase level: a wall of lava from the left edge of the view
  // to `lavaX`, its front rippling and glowing ahead of it.
  drawChasingLava(world, cx, cy) {
    if (world.lavaX === null) return;
    const ctx = this.ctx;
    const front = world.lavaX;
    if (front < cx - 8) return;
    const t = world.time;
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createLinearGradient(front, 0, front + 40, 0);
    glow.addColorStop(0, 'rgba(255,90,20,0.45)');
    glow.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(front, cy, 40, VIEW_H);
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createLinearGradient(front - 60, 0, front, 0);
    body.addColorStop(0, '#7a1406');
    body.addColorStop(0.8, '#d8380f');
    body.addColorStop(1, '#ff6a1f');
    ctx.fillStyle = body;
    ctx.fillRect(cx, cy, Math.max(0, front - 2 - cx), VIEW_H);
    for (let y = cy; y < cy + VIEW_H; y++) {
      const w = Math.round(Math.sin(y * 0.12 + t * 0.1) * 2 + Math.sin(y * 0.05 - t * 0.04) * 2);
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(front + w - 4, y, 3, 1);
      ctx.fillStyle = '#ffd34a';
      ctx.fillRect(front + w - 1, y, 2, 1);
    }
  }

  drawRisingLava(world, cx, cy) {
    if (world.lavaY === null) return;
    const ctx = this.ctx;
    const top = world.lavaY;
    if (top > cy + VIEW_H + 8) return;
    const t = world.time;
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createLinearGradient(0, top - 40, 0, top);
    glow.addColorStop(0, 'rgba(255,80,20,0)');
    glow.addColorStop(1, 'rgba(255,90,20,0.45)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx, top - 40, VIEW_W, 40);
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createLinearGradient(0, top, 0, top + 60);
    body.addColorStop(0, '#ff6a1f');
    body.addColorStop(0.2, '#d8380f');
    body.addColorStop(1, '#7a1406');
    ctx.fillStyle = body;
    ctx.fillRect(cx, top + 2, VIEW_W, Math.max(0, cy + VIEW_H - top));
    for (let x = cx; x < cx + VIEW_W; x++) {
      const h = Math.round(Math.sin(x * 0.12 + t * 0.1) * 2 + Math.sin(x * 0.05 - t * 0.04) * 2);
      ctx.fillStyle = '#ffd34a';
      ctx.fillRect(x, top + h - 1, 1, 2);
      ctx.fillStyle = '#ff8a2a';
      ctx.fillRect(x, top + h + 1, 1, 3);
    }
  }

  drawEntities(world) {
    const ctx = this.ctx;
    const t = world.time;
    for (const e of world.entities) {
      if (!world.onScreen(e.x ?? e.tx * TILE, e.y ?? e.ty * TILE)) continue;
      switch (e.kind) {
        case 'gem': {
          if (e.taken) break;
          const by = e.y + Math.round(Math.sin(t * 0.08 + e.x) * 1.5);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35;
          ctx.drawImage(this.smallGlow, e.x - 12, by - 12);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#1d6d84';
          ctx.fillRect(e.x - 1, by - 5, 3, 11);
          ctx.fillRect(e.x - 3, by - 3, 7, 7);
          ctx.fillRect(e.x - 4, by - 1, 9, 3);
          ctx.fillStyle = '#47d6ff';
          ctx.fillRect(e.x - 2, by - 3, 5, 6);
          ctx.fillRect(e.x - 3, by - 1, 7, 2);
          ctx.fillStyle = '#d8fbff';
          ctx.fillRect(e.x - 1, by - 3, 1, 2);
          if ((t + e.x) % 90 < 6) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(e.x + 2, by - 6, 1, 3);
            ctx.fillRect(e.x + 1, by - 5, 3, 1);
          }
          break;
        }
        case 'checkpoint': this.drawCheckpoint(e, t); break;
        case 'exit': this.drawExit(e, t); break;
        case 'slug': {
          if (!e.alive && e.dying <= 0) break;
          const img = this.sprites.slug[Math.floor(t / 12) % 2];
          if (!e.alive) {
            ctx.globalAlpha = e.dying / 30;
            ctx.drawImage(img, Math.round(e.x - 1), Math.round(e.y + e.h - 4), 16, 4);
            ctx.globalAlpha = 1;
          } else {
            drawSprite(ctx, img, e.x + e.w / 2, e.y + e.h, { flip: e.vx < 0 });
          }
          break;
        }
        case 'bat': {
          if (!e.alive && e.dying <= 0) break;
          const img = this.sprites.bat[Math.floor(t / 6) % 2];
          if (!e.alive) ctx.globalAlpha = e.dying / 30;
          drawSprite(ctx, img, e.x + e.w / 2, e.y + e.h, { flip: e.flip });
          ctx.globalAlpha = 1;
          break;
        }
        case 'bubble': {
          if (!e.up) break;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(this.smallGlow, Math.round(e.x - 12), Math.round(e.y - 12));
          ctx.globalCompositeOperation = 'source-over';
          const x = Math.round(e.x);
          const y = Math.round(e.y);
          ctx.fillStyle = '#c4300f';
          ctx.fillRect(x - 4, y - 3, 8, 6);
          ctx.fillRect(x - 3, y - 4, 6, 8);
          ctx.fillStyle = '#ff8a2a';
          ctx.fillRect(x - 3, y - 2, 6, 4);
          ctx.fillStyle = '#ffe27a';
          ctx.fillRect(x - 1, y - (e.vy < 0 ? 3 : 1), 2, 2);
          ctx.fillStyle = '#1b0b0b';
          ctx.fillRect(x - 2, y + (e.vy < 0 ? 0 : -1), 1, 1);
          ctx.fillRect(x + 1, y + (e.vy < 0 ? 0 : -1), 1, 1);
          break;
        }
        case 'geyser': this.drawGeyser(world, e); break;
        case 'boss': this.drawBoss(e, t); break;
        case 'wave': {
          // A tongue of fire, taller at its leading edge.
          const x = Math.round(e.x);
          const y = Math.round(e.y);
          const d = Math.sign(e.vx);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(this.smallGlow, x - 12, y - 8);
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < 4; i++) {
            const h = e.h - i * 2 - ((t + i) % 4 < 2 ? 1 : 0);
            ctx.fillStyle = i === 0 ? '#ffe27a' : i === 1 ? '#ffb347' : '#ff6a1f';
            ctx.fillRect(x - d * i * 2 - 1, y + e.h - h, 2, h);
          }
          break;
        }
        case 'platform': {
          const x = Math.round(e.x);
          const y = Math.round(e.y);
          ctx.fillStyle = '#3a241c';
          ctx.fillRect(x, y, e.w, e.h);
          ctx.fillStyle = '#6e4535';
          ctx.fillRect(x, y, e.w, 2);
          ctx.fillStyle = '#1b0b0b';
          ctx.fillRect(x, y + e.h - 1, e.w, 1);
          for (let i = 4; i < e.w; i += 12) ctx.fillRect(x + i, y + 3, 2, 2);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25 + Math.sin(t * 0.1) * 0.1;
          ctx.fillStyle = '#ff6a1f';
          ctx.fillRect(x + 2, y + e.h, e.w - 4, 2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        default: break;
      }
    }
  }

  drawCheckpoint(e, t) {
    const ctx = this.ctx;
    const x = e.x;
    const y = e.y;
    ctx.fillStyle = '#3a2620';
    ctx.fillRect(x + 5, y + 4, 6, 12);
    ctx.fillStyle = '#5a3a2c';
    ctx.fillRect(x + 4, y + 2, 8, 3);
    ctx.fillStyle = '#1b0b0b';
    ctx.fillRect(x + 6, y + 8, 4, 1);
    ctx.fillRect(x + 6, y + 11, 4, 1);
    const fl = Math.sin(t * 0.3) * 1.5;
    const [outer, inner] = e.active ? ['#ff6a1f', '#ffe27a'] : ['#2a6aa0', '#8fd6ff'];
    ctx.fillStyle = outer;
    ctx.fillRect(x + 5, y - 3 + fl * 0.3, 6, 5);
    ctx.fillRect(x + 6, y - 6 + fl, 4, 4);
    ctx.fillStyle = inner;
    ctx.fillRect(x + 7, y - 2, 2, 3);
    if (e.active) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.smallGlow, x - 4, y - 14);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // The lava curtain at the arena's left edge, falling from the top of the
  // view to the floor while the fight is on.
  drawCurtain(world, cy) {
    if (!world.bossFight) return;
    const ctx = this.ctx;
    const b = world.boss;
    const x = b.x0;
    const t = world.time;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    for (let y = cy; y < b.floor; y += 24) ctx.drawImage(this.smallGlow, x - 9, y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (let y = cy; y < b.floor; y += 2) {
      const k = (y + t * 3) % 12;
      ctx.fillStyle = k < 4 ? '#ffe27a' : k < 8 ? '#ff8a2a' : '#e8400f';
      ctx.fillRect(x + ((y >> 1) + (t >> 2)) % 2, y, 5, 2);
    }
  }

  // Asleep, the golem is a cold boulder; it heats up while it wakes, sinks
  // a little in the crouch, flickers when hit and while it crumbles.
  drawBoss(b, t) {
    if (b.state === 'dead') return;
    const ctx = this.ctx;
    const cool = b.state === 'sleep' || b.state === 'stunned' || b.state === 'hurt'
      || (b.state === 'wake' && b.timer < 40 && (b.timer >> 2) % 2);
    if (b.state === 'hurt' && (t >> 2) % 2) return;
    if (b.state === 'dying' && (t >> 1) % 2) return;
    const img = cool ? this.sprites.golemCool : this.sprites.golem;
    let x = b.x + b.w / 2;
    if (b.state === 'wake' || b.state === 'dying') x += (t % 4 < 2 ? -1 : 1);
    const squash = b.state === 'crouch' ? 3 : 0;
    if (!cool) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + Math.sin(t * 0.15) * 0.1;
      ctx.drawImage(this.glow, Math.round(x - 24), Math.round(b.y - 6));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const bottom = b.y + b.h;
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(bottom - img.height + squash), img.width, img.height - squash);
  }

  drawExit(e, t) {
    const ctx = this.ctx;
    const x = e.x;
    const y = e.y - 16;
    if (e.locked) {
      // Sealed by a slab of rock until the golem falls.
      ctx.fillStyle = '#3a2620';
      ctx.fillRect(x - 2, y - 2, 20, 34);
      ctx.fillStyle = '#24110d';
      ctx.fillRect(x + 1, y + 1, 14, 31);
      ctx.fillStyle = '#4b3427';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + ((i * 7) % 11), y + 4 + i * 7, 4, 2);
      return;
    }
    ctx.fillStyle = '#3a2620';
    ctx.fillRect(x - 2, y - 2, 20, 34);
    ctx.fillStyle = '#5a3a2c';
    ctx.fillRect(x - 2, y - 2, 20, 3);
    ctx.fillRect(x - 2, y - 2, 3, 34);
    ctx.fillRect(x + 15, y - 2, 3, 34);
    const grad = ctx.createLinearGradient(0, y + 1, 0, y + 32);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.5, '#ffb347');
    grad.addColorStop(1, '#ff6a1f');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y + 1, 14, 31);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 4; i++) {
      const py = y + 31 - ((t * 0.5 + i * 8) % 30);
      ctx.fillRect(x + 3 + ((i * 5) % 10), Math.round(py), 1, 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + Math.sin(t * 0.08) * 0.15;
    ctx.drawImage(this.glow, x - 16, y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawGeyser(world, e) {
    const ctx = this.ctx;
    const vx = e.tx * TILE;
    const vy = e.ty * TILE;
    const { state, t } = world.geyserState(e);
    if (state === 'warn') {
      ctx.fillStyle = t % 8 < 4 ? '#ff6a1f' : '#ffb347';
      ctx.fillRect(vx + 5, vy, 6, 2);
    }
    if (e.height <= 0) return;
    const h = e.height;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glow, vx - 16, vy - h - 8, 48, h + 16);
    ctx.globalCompositeOperation = 'source-over';
    for (let y = 0; y < h; y += 2) {
      const wob = Math.round(Math.sin((y + world.time * 3) * 0.4) * 1.5);
      const k = y / h;
      const w = 6 + Math.round((1 - k) * 4);
      ctx.fillStyle = k > 0.8 ? '#ffd34a' : '#ff6a1f';
      ctx.fillRect(vx + 8 - w / 2 + wob, vy - y - 2, w, 2);
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(vx + 7 + wob, vy - y - 2, 2, 2);
    }
  }

  drawPlayer(world) {
    const p = world.player;
    const ctx = this.ctx;
    const s = this.sprites.players[this.character];
    let img;
    if (p.dead) img = s.jump;
    else if (!p.ground) img = p.vy < 0 ? s.jump : s.run1;
    else if (Math.abs(p.vx) > 0.2) img = [s.run1, s.run2, s.run3, s.run2][Math.floor(p.anim) % 4];
    else img = s.idle;
    if (p.dead) {
      if (p.deadTimer < 40) return;
      ctx.globalAlpha = (world.time >> 2) % 2 ? 1 : 0.3;
    } else if (p.invuln > 0 && (world.time >> 2) % 2) {
      ctx.globalAlpha = 0.5;
    }
    drawSprite(ctx, img, p.x + p.w / 2, p.y + p.h, { flip: p.facing < 0 });
    ctx.globalAlpha = 1;
  }

  // Already inside the camera translation, so the offset is zero.
  drawParticles(world) {
    world.particles.draw(this.ctx, { x: 0, y: 0 });
  }
}
