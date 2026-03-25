// renderer.js — Canvas rendering

class Renderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');
    this.tileSize = 12;
    this._tick = 0;
    this.particles = []; // active mining animations
    this._cache = new Map(); // cache for expensive rendered stuff
  }

  setTileSize(ts) {
    this.tileSize = ts;
    this.canvas.width = ts * VIEWPORT_TILES_W;
    this.canvas.height = ts * VIEWPORT_TILES_H;
  }

  addParticle(tx, ty, mineralKey) {
    this.particles.push({
      tx, ty,
      mineralKey,
      frame: 0,
      maxFrames: 15,
      offsets: Array.from({ length: 8 }, (_, i) => ({
        angle: (i / 8) * Math.PI * 2,
        dist: 0.7 + Math.random() * 0.3
      }))
    });
  }

  draw(map, player, gameState) {
    this._tick++;
    const ctx = this.ctx;
    const ts = this.tileSize;
    const w = VIEWPORT_TILES_W;
    const h = VIEWPORT_TILES_H;

    // Camera
    const camX = clamp(player.x - Math.floor(w / 2), 0, map.width - w);
    const camY = clamp(player.y - Math.floor(h / 2), 0, map.height - h);

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const palette = DEPTH_PALETTES[player.depth] || DEPTH_PALETTES[1];
    const visRadius = player.getVisibilityRadius();

    // Draw tiles
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const mx = camX + col;
        const my = camY + row;

        if (mx < 0 || mx >= map.width || my < 0 || my >= map.height) continue;

        const visited = map.visited[my][mx];
        if (!visited) continue;

        const visible = map.isVisible(player.x, player.y, mx, my, visRadius);
        const tile = map.getTile(mx, my);
        const mineralKey = map.getMineral(mx, my);

        const px = col * ts;
        const py = row * ts;

        this._drawTile(ctx, px, py, ts, tile, mx, my, mineralKey, visible, palette, player, gameState);

        // Explored overlay
        if (!visible) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(px, py, ts, ts);
        }
      }
    }

    // Draw ladder glows
    if (gameState !== 'win' && gameState !== 'gameover') {
      this._drawLadderGlows(ctx, map, camX, camY, ts);
    }

    // Draw particles
    this._drawParticles(ctx, camX, camY, ts);

    // Draw player
    const playerScreenX = (player.x - camX) * ts;
    const playerScreenY = (player.y - camY) * ts;
    this._drawPlayer(ctx, playerScreenX, playerScreenY, ts);
  }

  _drawTile(ctx, px, py, ts, tile, mx, my, mineralKey, visible, palette, player, gameState) {
    switch (tile) {
      case TILE.ROCK:
        this._drawRock(ctx, px, py, ts, mx, my, mineralKey, visible, palette);
        break;
      case TILE.FLOOR:
        this._drawFloor(ctx, px, py, ts, mx, my, palette);
        break;
      case TILE.TUNNEL:
        ctx.fillStyle = palette.tunnel;
        ctx.fillRect(px, py, ts, ts);
        break;
      case TILE.LADDER_UP:
        this._drawLadder(ctx, px, py, ts, true, visible, player.depth);
        break;
      case TILE.LADDER_DOWN:
        this._drawLadder(ctx, px, py, ts, false, visible, player.depth);
        break;
    }
  }

  _cssColorToRGBa(cssColor) {
    const offscreen = new OffscreenCanvas(1, 1);
    const offctx = offscreen.getContext('2d');
    offctx.fillStyle = cssColor;
    offctx.fillRect(0, 0, 1, 1);
    const data = offctx.getImageData(0, 0, 1, 1).data;
    return {
      r: data[0] / 255,
      g: data[1] / 255,
      b: data[2] / 255,
      a: data[3] / 255
    };
  }

  _colorizeImg(canvas, color) {
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

    // Pass 1: Convert to grayscale, find min/max, accumulate sum of non-transparent pixels
    let max = 0, min = 255, sum = 0, count = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const [r, g, b, a] = imageData.data.slice(i, i + 4);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      max = gray > max ? gray : max;
      min = gray < min ? gray : min;
      if (a > 0) { sum += gray; count++; }
      imageData.data.fill(gray, i, i + 3);
    }

    // Precompute combined scale: linear normalization + mean luminance targeting
    const TARGET_MEAN = 180;
    const rawMean = count > 0 ? sum / count : 127;
    // After linear norm, mean = (rawMean - min) / range
    // We want that mean to equal TARGET_MEAN / 255, so scale = TARGET_MEAN / (rawMean - min)
    const k = TARGET_MEAN / (rawMean - min);

    // Pass 2: Apply combined normalization in one step
    for (let i = 0; i < imageData.data.length; i += 4) {
      const val = Math.min(255, Math.max(0, (imageData.data[i] - min) * k));
      imageData.data.fill(val, i, i + 3);
    }

    // Pass 3: Apply color tint
    const { r, g, b, a } = this._cssColorToRGBa(color);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i + 0] *= r;
      imageData.data[i + 1] *= g;
      imageData.data[i + 2] *= b;
      imageData.data[i + 3] *= a;
    }

    const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
    offscreen.getContext('2d').putImageData(imageData, 0, 0);
    return offscreen;
  }

  _getMineralImg(mineralKey, ts) {
    const key = `_getMineralImg_${mineralKey}_${ts}`;
    if (this._cache[key]) {
      return this._cache[key];
    }

    const baseImg = this._getTextImage('🪨', ts);
    this._cache[key] = this._colorizeImg(baseImg, MINERALS[mineralKey].color);
    return this._cache[key];
  }

  _getLadderImg(isUp, visible, ts) {
    const key = `_getLadderImg_${isUp}_${visible}_${ts}`;
    if (this._cache[key]) {
      return this._cache[key];
    }

    const baseImg = this._getTextImage(isUp ? '⬆️' : '⬇️', ts);
    const rgb = isUp ? '#66ff66' : '#ff3333';
    const a = visible ? 'ff' : '80';
    this._cache[key] = this._colorizeImg(baseImg, `${rgb}${a}`);
    return this._cache[key];
  }

  _getTextImage(text, ts) {
    const key = `_getTextImage_${text}_${ts}`;
    if (this._cache[key]) {
      return this._cache[key];
    }

    const offscreen = new OffscreenCanvas(ts, ts);
    const offctx = offscreen.getContext('2d');
    this._drawText(offctx, text, 0, 0, ts);
    this._cache[key] = offscreen;
    return this._cache[key];
  }

  _drawText(ctx, text, x, y, ts, size = 1.0) {
    ctx.save();
    ctx.font = '100px serif';
    const textMetrics = ctx.measureText(text);
    const width = textMetrics.actualBoundingBoxLeft + textMetrics.actualBoundingBoxRight;
    const height = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
    const scale = Math.min(ts / width, ts / height) * size;
    const drawX = x - (textMetrics.actualBoundingBoxLeft * scale) + (1.0 - size) * ts / 2;
    const drawY = y + (textMetrics.actualBoundingBoxAscent * scale) + (1.0 - size) * ts / 2;
    ctx.font = `${scale * 100}px serif`;
    ctx.fillStyle = 'black';
    ctx.fillText(text, drawX, drawY);
    ctx.restore();
  }

  _drawRock(ctx, px, py, ts, mx, my, mineralKey, visible, palette) {
    // Alternating rock color
    const base = (mx + my) % 2 === 0 ? palette.rock : palette.rockEdge;
    ctx.fillStyle = base;
    ctx.fillRect(px, py, ts, ts);

    // Inner shadow
    const sw = ts < 14 ? 1 : 2;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(px, py, sw, ts);
    ctx.fillRect(px, py, ts, sw);

    // Mineral vein icon (only when visible)
    if (mineralKey && visible) {
      ctx.drawImage(this._getMineralImg(mineralKey, ts), px, py, ts, ts);
    }
  }

  _drawFloor(ctx, px, py, ts, mx, my, palette) {
    const base = (mx + my) % 3 === 0 ? palette.floorAlt : palette.floor;
    ctx.fillStyle = base;
    ctx.fillRect(px, py, ts, ts);
  }

  _drawLadder(ctx, px, py, ts, isUp, visible, depth) {
    const palette = DEPTH_PALETTES[depth] || DEPTH_PALETTES[1];
    // Base floor color
    ctx.fillStyle = palette.floor;
    ctx.fillRect(px, py, ts, ts);
    ctx.drawImage(this._getLadderImg(isUp, visible, ts), px, py, ts, ts);
  }

  _drawLadderGlows(ctx, map, camX, camY, ts) {
    const pulse = 0.5 + 0.5 * Math.sin(this._tick * 0.08);
    const alpha = 0.25 * pulse;

    const checkLadder = (lx, ly, color) => {
      if (lx < 0 || ly < 0) return;
      if (!map.visited[ly][lx]) return;
      const screenX = (lx - camX) * ts + ts / 2;
      const screenY = (ly - camY) * ts + ts / 2;
      if (screenX < -ts * 2 || screenX > this.canvas.width + ts * 2) return;
      if (screenY < -ts * 2 || screenY > this.canvas.height + ts * 2) return;

      const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, ts * 1.5);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(screenX, screenY, ts * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    checkLadder(map.upLadderPos.x, map.upLadderPos.y, '#4caf50');
    if (map.downLadderPos.x >= 0) {
      checkLadder(map.downLadderPos.x, map.downLadderPos.y, '#ffd700');
    }
  }

  _drawPlayer(ctx, px, py, ts) {
    const cx = px + ts / 2;
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(this._tick * 0.05));

    // Headlamp sits at the top-center of the hat (≈13% from top of the SVG viewBox)
    const lightX = cx;
    const lightY = py + ts * 0.13;
    const lightR = ts * 0.07;

    // Light beam (drawn behind the sprite)
    const grad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, ts * 1.2);
    grad.addColorStop(0, 'rgba(255,253,224,1)');
    grad.addColorStop(1, 'rgba(255,253,224,0)');
    ctx.save();
    ctx.globalAlpha = 0.18 * pulse;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(lightX, lightY);
    ctx.arc(lightX, lightY, ts * 1.2, -Math.PI * 0.6, -Math.PI * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Miner sprite
    const miner = '👷';
    this._drawText(ctx, miner, px, py, ts);
    // Helmet light dot (drawn on top of sprite)
    ctx.beginPath();
    ctx.arc(lightX, lightY, lightR, 0, Math.PI * 2);
    ctx.fillStyle = '#fffde0';
    ctx.fill();
  }

  _drawParticles(ctx, camX, camY, ts) {
    const toRemove = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const progress = p.frame / p.maxFrames;
      const screenX = (p.tx - camX) * ts + ts / 2;
      const screenY = (p.ty - camY) * ts + ts / 2;
      const mineral = MINERALS[p.mineralKey];
      const color = mineral ? mineral.color : '#ffffff';

      ctx.save();
      ctx.globalAlpha = 0.8 * (1 - progress);

      // Impact flash (first 30%)
      if (progress < 0.3) {
        const flashProgress = progress / 0.3;
        const flashR = ts * 0.3 * (1 - flashProgress);
        ctx.globalAlpha = 0.8 * (1 - flashProgress);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(screenX, screenY, flashR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 0.8 * (1 - progress);

      // Particles
      for (const off of p.offsets) {
        const dist = progress * 0.8 * ts * off.dist;
        const px2 = screenX + Math.cos(off.angle) * dist;
        const py2 = screenY + Math.sin(off.angle) * dist;
        const size = ts * 0.08 * (1 - progress * 0.5);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px2, py2, size, 0, Math.PI * 2);
        ctx.fill();

        // White highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px2 + 1, py2 - 1, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      p.frame++;
      if (p.frame >= p.maxFrames) toRemove.push(i);
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.particles.splice(toRemove[i], 1);
    }
  }

  drawMinimap(map, player, tileSize, targetCanvas) {
    const canvas = targetCanvas || this.minimapCanvas;
    const ctx = canvas.getContext('2d');
    const ts = tileSize || 3;
    const cw = map.width * ts;
    const ch = map.height * ts;

    canvas.width = cw;
    canvas.height = ch;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cw, ch);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!map.visited[y][x]) continue;

        const tile = map.getTile(x, y);
        const mineralKey = map.getMineral(x, y);

        let color;
        if (tile === TILE.ROCK) {
          color = '#1a1008';
        } else if (tile === TILE.LADDER_UP || tile === TILE.LADDER_DOWN) {
          color = '#ffd700';
        } else if (mineralKey && tile !== TILE.ROCK) {
          color = MINERALS[mineralKey].color;
        } else {
          color = '#4a3520';
        }

        ctx.fillStyle = color;
        ctx.fillRect(x * ts, y * ts, ts, ts);
      }
    }

    // Player dot
    ctx.fillStyle = '#f5e642';
    ctx.fillRect(player.x * ts - 1, player.y * ts - 1, ts + 1, ts + 1);
  }
}
