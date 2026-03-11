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
    this._svgCache = {}; // mineral key -> Image
    this._minerImg = null; // miner sprite Image
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
      this._drawLadderGlows(ctx, map, player, camX, camY, ts, visRadius);
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

  _getMinerImg() {
    if (this._minerImg) return this._minerImg;
    // Adapted from https://openmoji.org/library/emoji-1F477/
    const svgSrc = `<svg xmlns="http://www.w3.org/2000/svg" width="32mm" height="32mm" viewBox="0 0 32 32"><path fill="#f1b31c" d="m24.705 12.265-.032.08a24 24 0 0 0-.979-.311c-1.678-.493-3.97-.923-6.81-.923V9.066h2.3l.047-4.742c5.442.963 5.474 7.94 5.474 7.94M16.884 9.066v2.045q-.403.002-.82.016h-.127c-.024 0-.048-.008-.064 0-3.198-.088-5.737.374-7.559.899v.008q-.704.204-1.265.422l-.071-.191s.04-7.32 5.888-8.005l-.048 4.806z"/><path fill="#fcea2b" d="m19.23 4.324-.047 4.742h-6.365l.048-4.806c1.265-2.236 5.864-1.647 6.365 0z"/><g fill="#3f3f3f"><path d="M15.873 11.127s.032.032.096.087c-.732.629-5.467 4.56-8.132 3.43l-.422-.167c.223-.868.525-1.687.9-2.443v-.008c1.821-.525 4.36-.987 7.558-.9M24.594 14.469l-.494.175c-2.665 1.13-7.4-2.801-8.131-3.43.063-.055.095-.087.095-.087.279-.008.55-.016.82-.016 2.84 0 5.132.43 6.81.923.374.756.677 1.575.9 2.435"/></g><path fill="#fcea2b" d="M24.769 15.248c.167.86.254 1.759.254 2.674 0 6.23-4.042 11.282-9.023 11.282s-9.022-5.052-9.022-11.282c0-1.202.15-2.363.437-3.445l.422.167c2.665 1.13 7.4-2.801 8.132-3.43.732.629 5.466 4.56 8.131 3.43l.494-.175c.063.254.127.517.175.78m-3.995 1.592a1.59 1.59 0 1 0-1.59 1.591c.882 0 1.59-.708 1.59-1.591m-2.029 7.28a.804.804 0 0 0 .358-1.066.79.79 0 0 0-1.066-.358c-1.368.684-2.697.684-4.066 0a.786.786 0 0 0-1.066.358.79.79 0 0 0 .358 1.066c.907.453 1.822.684 2.737.684s1.838-.23 2.745-.684m-4.336-7.28a1.59 1.59 0 1 0-1.591 1.591c.883 0 1.591-.708 1.591-1.591"/><path d="M19.183 15.248a1.59 1.59 0 0 1 1.591 1.592 1.59 1.59 0 1 1-1.591-1.591M19.103 23.054a.804.804 0 0 1-.358 1.066c-.907.453-1.83.684-2.745.684s-1.83-.23-2.737-.684a.79.79 0 0 1-.358-1.066.786.786 0 0 1 1.066-.358c1.369.684 2.698.684 4.066 0a.79.79 0 0 1 1.066.358M12.818 15.248a1.59 1.59 0 0 1 1.591 1.592c0 .883-.708 1.591-1.591 1.591a1.59 1.59 0 1 1 0-3.183"/><g fill="none" stroke="#000" stroke-miterlimit="10" stroke-width="2"><path stroke-width="1.59132" d="M8.314 12.034a12.6 12.6 0 0 0-.899 2.443 13.5 13.5 0 0 0-.437 3.445c0 6.23 4.042 11.282 9.022 11.282s9.023-5.052 9.023-11.282a14 14 0 0 0-.43-3.453 12.7 12.7 0 0 0-.899-2.435"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.59132" d="M8.314 12.034q-.704.204-1.265.422c-1.384.509-2.108.97-2.108.97"/><path stroke-width="1.59132" d="M8.314 12.026v.008"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.59132" d="M27.06 13.426s-.82-.525-2.387-1.082a24 24 0 0 0-.979-.31c-1.678-.493-3.97-.923-6.81-.923q-.403.002-.82.016h-.127c-.024 0-.048-.008-.064 0-3.198-.088-5.737.374-7.559.899M19.23 4.324V4.26c-.5-1.647-5.1-2.236-6.364 0l-.048 4.806h6.365z"/><path stroke-width="1.59132" d="M6.978 12.265s.04-7.32 5.888-8.005M24.705 12.265s-.032-6.978-5.474-7.941a6 6 0 0 0-.406-.064"/><path stroke-linecap="round" stroke-width="1.59132" d="M16.064 11.127s-.032.032-.095.087c-.732.629-5.467 4.56-8.132 3.43l-.422-.167h-.008"/><path stroke-linecap="round" stroke-width="1.59132" d="M15.873 11.127s.032.032.096.087c.732.629 5.466 4.56 8.131 3.43l.494-.175"/></g></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgSrc);
    this._minerImg = img;
    return img;
  }

  _getMineralSvg(mineralKey) {
    if (this._svgCache[mineralKey]) return this._svgCache[mineralKey];
    const mineral = MINERALS[mineralKey];
    const [c1, c2, c3] = mineral.colors;
    // Adapted from https://openmoji.org/library/emoji-1FAA8/
    const svgSrc = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${c1}" d="M29.107 15.329a.66.66 0 0 1 .07.692l-2.588 5.358a.67.67 0 0 1-.47.364l-7.176 1.42a.67.67 0 0 1-.528-.12L2.807 11.362a.665.665 0 0 1-.117-.952l1.62-1.992a.7.7 0 0 1 .217-.175l12.167-6.129a.67.67 0 0 1 .437-.056l2.538.536a.66.66 0 0 1 .423.294l1.777 2.754 1.077 1.656z"/><path fill="${c3}" d="m23.128 29.293-4.301-6.767L3.29 10.828l-.75 3.209 7.23 15.256z"/><path fill="${c2}" d="m25.886 21.277 2.553-5.256.896 7.652-1.102 5.62h-5.105l-4.301-6.767z"/><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-width="1.32928" d="m22.469 7.764 6.11 7.968.756 7.738-1.102 5.823H9.77l-7.106-15.38.54-3.085 1.621-1.992 12.167-6.129 2.538.537 1.757 2.731-3.331 2.229"/><path stroke-width="1.32928" d="m23.507 29.293-4.693-6.782L3.205 10.828M28.579 15.732 25.99 21.09l-7.176 1.421"/></g></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgSrc);
    this._svgCache[mineralKey] = img;
    return img;
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
      const img = this._getMineralSvg(mineralKey);
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, px, py, ts, ts);
        ctx.restore();
      }
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

    const alpha = visible ? 1.0 : 0.5;
    const color = isUp ? '#00ff00' : '#ff3333';
    const cx = px + ts / 2;

    // Two stacked triangles, each occupying ~38% of tile height, with a small gap
    const triW = ts * 0.55;       // half-width of triangle base
    const triH = ts * 0.36;       // height of each triangle
    const gap  = ts * 0.04;       // gap between the two triangles
    // Center the pair vertically
    const totalH = triH * 2 + gap;
    const topY = py + (ts - totalH) / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    if (isUp) {
      // First (top) triangle — pointing up
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx + triW, topY + triH);
      ctx.lineTo(cx - triW, topY + triH);
      ctx.closePath();
      ctx.fill();
      // Second (bottom) triangle — pointing up
      const t2y = topY + triH + gap;
      ctx.beginPath();
      ctx.moveTo(cx, t2y);
      ctx.lineTo(cx + triW, t2y + triH);
      ctx.lineTo(cx - triW, t2y + triH);
      ctx.closePath();
      ctx.fill();
    } else {
      // First (top) triangle — pointing down
      ctx.beginPath();
      ctx.moveTo(cx - triW, topY);
      ctx.lineTo(cx + triW, topY);
      ctx.lineTo(cx, topY + triH);
      ctx.closePath();
      ctx.fill();
      // Second (bottom) triangle — pointing down
      const t2y = topY + triH + gap;
      ctx.beginPath();
      ctx.moveTo(cx - triW, t2y);
      ctx.lineTo(cx + triW, t2y);
      ctx.lineTo(cx, t2y + triH);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  _drawLadderGlows(ctx, map, player, camX, camY, ts, visRadius) {
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
    grad.addColorStop(0, 'rgba(255,253,224,0.18)');
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
    const img = this._getMinerImg();
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, px, py, ts, ts);
    }

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
