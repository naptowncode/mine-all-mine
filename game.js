// game.js — Main game controller

// DOM-free run layer: rules, level state, stats, and phase.
class RunCore {
  constructor(rng) {
    this.rng = rng;
    this.player = new Player(rng);
    this.map = null;
    this.levelCache = {};
    this.phase = 'playing'; // playing, win, gameover
    this.plays = 0;
    this.bestHaul = 0;
    this._prevVisRadius = 6;
  }

  // ─── Run Start / Reset ────────────────────────────────────────────────────

  start() {
    this.levelCache = {};
    this.player.reset();
    this.map = new GameMap(1, this.rng);
    this._saveCurrentLevel();
    const startPos = this.map.getPlayerStartPos();
    this.player.x = startPos.x;
    this.player.y = startPos.y;
    this._prevVisRadius = this.player.getVisibilityRadius();
    this.map.updateVisibility(this.player.x, this.player.y, this._prevVisRadius);
    this.phase = 'playing';
  }

  restart() {
    this.start();
  }

  // ─── Action Handling ──────────────────────────────────────────────────────

  move(dx, dy) {
    if (this.phase !== 'playing') return;

    const result = this.player.tryMove(dx, dy, this.map);

    if (typeof result === 'object' && result !== null && result.result === 'mined') {
      this._updateVisibility();
      this._checkTimeOut();
    } else if (result === 'descend') {
      this._descend();
    } else if (result === 'ascend') {
      this._ascend();
    } else if (result === 'moved') {
      this._updateVisibility();
      this._checkTimeOut();
    }

    return result;
  }

  craft(index) {
    return this.player.craftPick(index);
  }

  repair() {
    return this.player.repairPick();
  }

  // ─── Level Cache ──────────────────────────────────────────────────────────

  _saveCurrentLevel() {
    if (!this.map) return;
    // Deep-copy the mutable arrays so future changes don't affect the snapshot
    const depth = this.map.depth;
    this.levelCache[depth] = {
      tiles:         this.map.tiles.map(row => row.slice()),
      mineralMap:    this.map.mineralMap.map(row => row.slice()),
      visited:       this.map.visited.map(row => row.slice()),
      upLadderPos:   { ...this.map.upLadderPos },
      downLadderPos: { ...this.map.downLadderPos },
      rooms:         this.map.rooms  // rooms are never mutated, safe to share
    };
  }

  _loadOrCreateLevel(depth) {
    const cached = this.levelCache[depth];
    if (cached) {
      // Generate a fresh map structure then overwrite with saved state
      const map = new GameMap(depth, this.rng);
      map.tiles         = cached.tiles.map(row => row.slice());
      map.mineralMap    = cached.mineralMap.map(row => row.slice());
      map.visited       = cached.visited.map(row => row.slice());
      map.upLadderPos   = { ...cached.upLadderPos };
      map.downLadderPos = { ...cached.downLadderPos };
      map.rooms         = cached.rooms;
      return map;
    }
    // No cache — generate a brand new level and immediately cache it
    const map = new GameMap(depth, this.rng);
    this.levelCache[depth] = {
      tiles:         map.tiles.map(row => row.slice()),
      mineralMap:    map.mineralMap.map(row => row.slice()),
      visited:       map.visited.map(row => row.slice()),
      upLadderPos:   { ...map.upLadderPos },
      downLadderPos: { ...map.downLadderPos },
      rooms:         map.rooms
    };
    return map;
  }

  // ─── Level Change ─────────────────────────────────────────────────────────

  _descend() {
    this._saveCurrentLevel();
    this.player.depth++;
    this.player.deepestLevel = Math.max(this.player.deepestLevel, this.player.depth);
    this.player.addLog(`Level ${this.player.depth} — deeper into the earth…`);
    this.map = this._loadOrCreateLevel(this.player.depth);
    const pos = this.map.upLadderPos;
    this.player.x = pos.x;
    this.player.y = pos.y;
    this._updateVisibility();
  }

  _ascend() {
    if (this.player.depth === 1) {
      // Win!
      this._triggerWin();
      return;
    }
    this._saveCurrentLevel();
    this.player.depth--;
    this.player.addLog(`Level ${this.player.depth} — heading back up…`);
    this.map = this._loadOrCreateLevel(this.player.depth);
    const pos = this.map.downLadderPos;
    this.player.x = pos.x;
    this.player.y = pos.y;
    this._updateVisibility();
  }

  // ─── Win / Loss ───────────────────────────────────────────────────────────

  _triggerWin() {
    this.plays++;
    if (this.player.totalValue > this.bestHaul) {
      this.bestHaul = this.player.totalValue;
    }
    this.phase = 'win';
  }

  _triggerGameOver() {
    this.player.totalValue = 0;
    this.plays++;
    this.phase = 'gameover';
  }

  _checkTimeOut() {
    if (this.player.secondsRemaining <= 0) {
      this._triggerGameOver();
      return true;
    }
    return false;
  }

  // ─── Visibility ───────────────────────────────────────────────────────────

  _updateVisibility() {
    const newRadius = this.player.getVisibilityRadius();
    if (newRadius < this._prevVisRadius) {
      if (newRadius === 4) {
        this.player.addLog('⚠ Your light is dimming… (radius 4)');
      } else if (newRadius === 3) {
        this.player.addLog('⚠ Your light is nearly gone… (radius 3)');
      }
      this._prevVisRadius = newRadius;
    }
    this.map.updateVisibility(this.player.x, this.player.y, newRadius);
  }
}

class Game {
  constructor(config = {}) {
    // DOM refs
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.mobileMinimapCanvas = document.getElementById('mobile-minimap-canvas');

    // Seeded run state
    this.rng = createRng(config.seed ?? Date.now());
    this.core = new RunCore(this.rng);
    this._loadPersistent();

    // Rendering
    this.renderer = new Renderer(this.canvas, this.minimapCanvas);

    // UI state
    this.state = 'playing'; // playing, crafting, info, map, win, gameover
    this.craftCursor = 0;

    // Input
    this._keyRepeatTimer = null;
    this._keyRepeatKey = null;
    this._pointerRepeatTimer = null;

    // Tile size
    this.tileSize = 12;

    this._setupDOM();
    this._setupInput();
    this._startGame();
    this._loop();
  }

  // ─── Persistent Storage ───────────────────────────────────────────────────

  _loadPersistent() {
    try {
      this.core.plays = parseInt(localStorage.getItem('mam_plays') || '0', 10);
      this.core.bestHaul = parseInt(localStorage.getItem('mam_bestHaul') || '0', 10);
    } catch (e) {
      this.core.plays = 0;
      this.core.bestHaul = 0;
    }
  }

  _savePersistent() {
    try {
      localStorage.setItem('mam_plays', String(this.core.plays));
      localStorage.setItem('mam_bestHaul', String(this.core.bestHaul));
    } catch (e) {}
  }

  // ─── Game Start / Reset ───────────────────────────────────────────────────

  _startGame() {
    this.core.start();
    this.state = 'playing';
    this._updateTileSize();
    this._updateUI();
  }

  // ─── Action Handling ──────────────────────────────────────────────────────

  _doMove(dx, dy) {
    if (this.state !== 'playing') return;

    const result = this.core.move(dx, dy);

    if (typeof result === 'object' && result !== null && result.result === 'mined') {
      // Mining attempt — trigger particle animation
      const tx = this.core.player.x + dx;
      const ty = this.core.player.y + dy;
      this.renderer.addParticle(tx, ty, result.mineralKey);
    }

    if (this.core.phase !== 'playing' && this.state !== this.core.phase) {
      this.state = this.core.phase;
      this._savePersistent();
      if (this.state === 'win') {
        this._showWinScreen();
      } else if (this.state === 'gameover') {
        this._showGameOverScreen();
      }
    }

    this._updateUI();
  }

  // ─── Tile Size ────────────────────────────────────────────────────────────

  _updateTileSize() {
    const isDesktop = window.innerWidth > 900;
    let availableWidth;
    if (isDesktop) {
      availableWidth = window.innerWidth - 280 - 16; // sidebar + padding
    } else {
      availableWidth = window.innerWidth;
    }

    // Also constrain by available height so the canvas never overflows vertically
    const chromeTop = document.getElementById(isDesktop ? 'header' : 'status-bar');
    const chromeBottom = document.getElementById('controls');
    const topH = chromeTop ? chromeTop.offsetHeight : 0;
    const bottomH = (!isDesktop && chromeBottom) ? chromeBottom.offsetHeight : 0;
    const availableHeight = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - topH - bottomH;

    const tsFromWidth  = Math.floor(availableWidth  / VIEWPORT_TILES_W);
    const tsFromHeight = Math.floor(availableHeight / VIEWPORT_TILES_H);
    const ts = Math.max(10, Math.min(tsFromWidth, tsFromHeight));
    this.tileSize = ts;
    this.renderer.setTileSize(ts);
  }

  // ─── UI Update ────────────────────────────────────────────────────────────

  _updateUI() {
    this._updateStatusBar();
    this._updateSidebar();
    if (this.minimapCanvas) {
      this.renderer.drawMinimap(this.core.map, this.core.player, 4);
    }
    if (this.mobileMinimapCanvas) {
      // On wider viewports (≥601px) the two items are evenly distributed,
      // so each gets roughly half the screen. On narrow viewports the minimap
      // sits in the left portion with the d-pad pushed to the right edge.
      const isWide = window.innerWidth >= 601;
      const availW = isWide
        ? Math.floor((window.innerWidth - 48) / 2)   // half-screen with even spacing
        : Math.floor((window.innerWidth - 24) / 2);  // left zone with space-between
      const ts = Math.max(1, Math.floor(availW / this.core.map.width));
      this.renderer.drawMinimap(this.core.map, this.core.player, ts, this.mobileMinimapCanvas);
    }
  }

  _updateStatusBar() {
    // Timer
    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = formatTime(this.core.player.secondsRemaining);
      const col = timerColor(this.core.player.secondsRemaining);
      timerEl.style.color = col || '';
    }

    // Depth
    const depthEl = document.getElementById('status-depth');
    if (depthEl) depthEl.textContent = `Lv ${this.core.player.depth}`;

    // Pick
    const pickNameEl = document.getElementById('status-pick-name');
    const pickBarEl = document.getElementById('status-pick-bar');
    const pickBarFillEl = document.getElementById('status-pick-bar-fill');
    if (pickNameEl) {
      if (this.core.player.pick) {
        pickNameEl.textContent = this.core.player.pick.name;
        pickNameEl.style.color = this.core.player.pick.color;
      } else {
        pickNameEl.textContent = 'No Pick';
        pickNameEl.style.color = '#ff4444';
      }
    }
    if (pickBarFillEl && this.core.player.pick) {
      const pct = (this.core.player.pickDurability / this.core.player.pick.durability) * 100;
      pickBarFillEl.style.width = `${pct.toFixed(1)}%`;
      pickBarFillEl.className = 'pick-bar-fill ' + this._durClass(pct);
    } else if (pickBarFillEl) {
      pickBarFillEl.style.width = '0%';
    }

    // Haul
    const haulEl = document.getElementById('status-haul');
    if (haulEl) haulEl.textContent = `${this.core.player.totalValue} ¢`;
  }

  _durClass(pct) {
    if (pct > 50) return 'dur-good';
    if (pct >= 25) return 'dur-warn';
    return 'dur-crit';
  }

  _updateSidebar() {
    // Status panel
    const sdDepth = document.getElementById('sd-depth');
    const sdTime = document.getElementById('sd-time');
    const sdHaul = document.getElementById('sd-haul');
    if (sdDepth) sdDepth.textContent = `Level ${this.core.player.depth}`;
    if (sdTime) {
      sdTime.textContent = formatTime(this.core.player.secondsRemaining);
      const col = timerColor(this.core.player.secondsRemaining);
      sdTime.style.color = col || '';
    }
    if (sdHaul) sdHaul.textContent = `${this.core.player.totalValue} ¢`;

    // Pick panel
    const sdPickName = document.getElementById('sd-pick-name');
    const sdPickDur = document.getElementById('sd-pick-dur');
    const sdPickBarFill = document.getElementById('sd-pick-bar-fill');
    if (sdPickName) {
      if (this.core.player.pick) {
        sdPickName.textContent = this.core.player.pick.name;
        sdPickName.style.color = this.core.player.pick.color;
      } else {
        sdPickName.textContent = 'None';
        sdPickName.style.color = '#ff4444';
      }
    }
    if (sdPickDur) {
      if (this.core.player.pick) {
        sdPickDur.textContent = `${Math.ceil(this.core.player.pickDurability)} / ${this.core.player.pick.durability}`;
      } else {
        sdPickDur.textContent = 'BROKEN';
        sdPickDur.style.color = '#ff4444';
      }
    }
    if (sdPickBarFill && this.core.player.pick) {
      const pct = (this.core.player.pickDurability / this.core.player.pick.durability) * 100;
      sdPickBarFill.style.width = `${pct.toFixed(1)}%`;
      sdPickBarFill.className = 'pick-bar-fill ' + this._durClass(pct);
    } else if (sdPickBarFill) {
      sdPickBarFill.style.width = '0%';
    }

    // Inventory
    this._renderInventory('sd-inventory');

    // Log
    this._renderLog('sd-log');
  }

  _renderInventory(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const items = this.core.player.getInventoryList();
    if (items.length === 0) {
      el.innerHTML = '<div class="inv-empty">Nothing yet…</div>';
      return;
    }
    el.innerHTML = items.map(item => `
      <div class="inv-item">
        <span class="inv-dot" style="background:${item.color};box-shadow:0 0 4px ${item.color}"></span>
        <span class="inv-name">${item.name}</span>
        <span class="inv-count">×${item.count}</span>
        <span class="inv-value">${item.value}¢</span>
      </div>
    `).join('');
  }

  _renderLog(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = this.core.player.log.map((msg, i) => `
      <div class="log-entry${i === 0 ? ' log-new' : ''}">${msg}</div>
    `).join('');
  }

  // ─── Craft Modal ──────────────────────────────────────────────────────────

  _openCraft() {
    this._stopRepeat();
    this.state = 'crafting';
    this.craftCursor = 0;
    this._renderCraftMenu();
    document.getElementById('craft-overlay').classList.remove('hidden');
  }

  _closeCraft() {
    this.state = 'playing';
    document.getElementById('craft-overlay').classList.add('hidden');
  }

  _renderCraftMenu() {
    const container = document.getElementById('craft-list');
    if (!container) return;

    const p = this.core.player;
    const pick = p.pick;
    const maxDur = pick ? pick.durability : 0;
    const curDur = p.pickDurability;
    const pct = pick ? (curDur / maxDur * 100) : 0;

    // Current pick summary
    let summaryHTML = `<div class="craft-current-pick">`;
    if (pick) {
      summaryHTML += `<span style="color:${pick.color}">${pick.name}</span>`;
      summaryHTML += ` <span class="craft-dur-text">${Math.ceil(curDur)}/${maxDur}</span>`;
      summaryHTML += `<div class="pick-bar" style="margin-top:4px">
        <div class="pick-bar-fill ${this._durClass(pct)}" style="width:${pct.toFixed(1)}%"></div>
      </div>`;
    } else {
      summaryHTML += `<span style="color:#ff4444">No Pick Equipped</span>`;
    }
    summaryHTML += `</div>`;

    // Pick rows
    let rowsHTML = '';
    for (let i = 0; i < PICKS.length; i++) {
      const pk = PICKS[i];
      const isEquipped = pick && pick.id === pk.id;
      const craftable = p.canCraft(i);
      const selected = this.craftCursor === i ? ' craft-row-selected' : '';

      let tag = '';
      if (isEquipped) tag = '<span class="craft-tag craft-tag-equipped">EQUIPPED</span>';
      else if (craftable) tag = '<span class="craft-tag craft-tag-craft">CRAFT</span>';

      const strengthLabels = ['Weak', 'Light', 'Firm', 'Hardy', 'Serious', 'Mighty'];
      const strengthLabel = strengthLabels[i] || '';

      let ingredientsHTML = Object.entries(pk.recipe).map(([min, cnt]) => {
        const have = p.inventory[min] || 0;
        const enough = have >= cnt;
        const mColor = MINERALS[min].color;
        return `<span class="craft-chip ${enough ? 'have' : 'need'}">
          <span class="chip-dot" style="background:${mColor}"></span>
          ${MINERALS[min].name} ${have}/${cnt}
        </span>`;
      }).join('');

      rowsHTML += `<div class="craft-row${selected}" data-index="${i}">
        <span class="craft-row-num">${i + 1}</span>
        <span class="craft-dot" style="background:${pk.color}"></span>
        <span class="craft-name">${pk.name}</span>
        <div class="craft-stats-group">
          <span class="craft-strikes">${pk.durability} strikes</span>
          <span class="craft-strength">Strength: ${strengthLabel}</span>
        </div>
        ${tag}
        <div class="craft-ingredients">${ingredientsHTML}</div>
      </div>`;
    }

    // Repair row
    let repairHTML = '';
    if (p.isRepairAvailable()) {
      const cost = getRepairCost(pick);
      const canRepair = p.canRepair();
      const selected = this.craftCursor === 6 ? ' craft-row-selected' : '';
      let costHTML = Object.entries(cost).map(([min, cnt]) => {
        const have = p.inventory[min] || 0;
        const enough = have >= cnt;
        const mColor = MINERALS[min].color;
        return `<span class="craft-chip ${enough ? 'have' : 'need'}">
          <span class="chip-dot" style="background:${mColor}"></span>
          ${MINERALS[min].name} ${have}/${cnt}
        </span>`;
      }).join('');
      repairHTML = `<div class="craft-row craft-repair-row${selected}" data-repair="1">
        <span class="craft-row-num">R</span>
        <span class="craft-name">Repair ${pick.name}</span>
        ${canRepair ? '<span class="craft-tag craft-tag-craft">REPAIR</span>' : ''}
        <div class="craft-ingredients">${costHTML}</div>
      </div>`;
    }

    container.innerHTML = summaryHTML + rowsHTML + repairHTML;

    // Attach tap handlers
    container.querySelectorAll('.craft-row').forEach(row => {
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const idx = row.dataset.index;
        const isRepair = row.dataset.repair;
        if (isRepair) {
          this._doRepair();
        } else {
          this._doCraft(parseInt(idx));
        }
      });
    });
  }

  _doCraft(index) {
    if (this.core.craft(index)) {
      this._closeCraft();
      this._updateUI();
    }
  }

  _doRepair() {
    if (this.core.repair()) {
      this._closeCraft();
      this._updateUI();
    }
  }

  _craftCursorMove(dir) {
    const maxIdx = this.core.player.isRepairAvailable() ? 6 : 5;
    this.craftCursor = (this.craftCursor + dir + maxIdx + 1) % (maxIdx + 1);
    this._renderCraftMenu();
  }

  _craftActivate() {
    if (this.craftCursor === 6) {
      this._doRepair();
    } else {
      this._doCraft(this.craftCursor);
    }
  }

  // ─── Info Modal ───────────────────────────────────────────────────────────

  _openInfo() {
    this.state = 'info';
    this._renderInventory('info-inventory');
    this._renderLog('info-log');
    document.getElementById('info-overlay').classList.remove('hidden');
  }

  _closeInfo() {
    this.state = 'playing';
    document.getElementById('info-overlay').classList.add('hidden');
  }

  // ─── Map Modal ────────────────────────────────────────────────────────────

  _openMap() {
    this.state = 'map';
    this._renderMapModal();
    document.getElementById('map-overlay').classList.remove('hidden');
  }

  _closeMap() {
    this.state = 'playing';
    document.getElementById('map-overlay').classList.add('hidden');
  }

  _renderMapModal() {
    const modalContent = document.getElementById('map-modal-content');
    if (!modalContent) return;
    const modalWidth = Math.min(window.innerWidth * 0.94, 500);
    const ts = Math.max(3, Math.floor(modalWidth / MAP_WIDTH));
    const mapCanvas = document.getElementById('map-modal-canvas');
    if (mapCanvas) {
      mapCanvas.width = MAP_WIDTH * ts;
      mapCanvas.height = MAP_HEIGHT * ts;
      // Draw using renderer's minimap logic but on this canvas
      const ctx = mapCanvas.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

      for (let y = 0; y < this.core.map.height; y++) {
        for (let x = 0; x < this.core.map.width; x++) {
          if (!this.core.map.visited[y][x]) continue;
          const tile = this.core.map.getTile(x, y);
          let color;
          if (tile === TILE.ROCK) color = '#1a1008';
          else if (tile === TILE.LADDER_UP || tile === TILE.LADDER_DOWN) color = '#ffd700';
          else color = '#4a3520';
          ctx.fillStyle = color;
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
      // Player dot
      ctx.fillStyle = '#f5e642';
      ctx.fillRect(this.core.player.x * ts - 1, this.core.player.y * ts - 1, ts + 1, ts + 1);
    }
  }

  // ─── Win / Game Over Screens ──────────────────────────────────────────────

  _showWinScreen() {
    const timeUsed = COUNTDOWN_SECONDS - this.core.player.secondsRemaining;
    const isRecord = this.core.player.totalValue >= this.core.bestHaul && this.core.player.totalValue > 0;

    document.getElementById('win-haul').textContent = `${this.core.player.totalValue} ¢`;
    document.getElementById('win-depth').textContent = this.core.player.deepestLevel;
    document.getElementById('win-time').textContent = formatTime(timeUsed);
    document.getElementById('win-plays').textContent = this.core.plays;
    document.getElementById('win-best').textContent = `${this.core.bestHaul} ¢`;

    const recordBadge = document.getElementById('win-record');
    if (recordBadge) {
      recordBadge.style.display = isRecord ? 'inline' : 'none';
    }

    document.getElementById('win-overlay').classList.remove('hidden');
  }

  _showGameOverScreen() {
    document.getElementById('go-depth').textContent = this.core.player.deepestLevel;
    document.getElementById('go-plays').textContent = this.core.plays;
    document.getElementById('go-best').textContent = `${this.core.bestHaul} ¢`;
    document.getElementById('gameover-overlay').classList.remove('hidden');
  }

  // ─── Input Setup ──────────────────────────────────────────────────────────

  _setupInput() {
    // Keyboard
    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => this._onKeyUp(e));

    // D-pad buttons
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const dx = parseInt(btn.dataset.dx || '0');
        const dy = parseInt(btn.dataset.dy || '0');
        this._doMove(dx, dy);
        this._startPointerRepeat(dx, dy);
      });
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this._stopPointerRepeat();
      });
      btn.addEventListener('pointerleave', (e) => {
        this._stopPointerRepeat();
      });
    });

    // Action buttons
    document.getElementById('btn-map')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'map') this._closeMap();
      else if (this.state === 'playing') this._openMap();
    });
    document.getElementById('btn-info')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'info') this._closeInfo();
      else if (this.state === 'playing') this._openInfo();
    });
    document.getElementById('btn-craft')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'crafting') this._closeCraft();
      else if (this.state === 'playing') this._openCraft();
    });

    // Sidebar craft button
    document.getElementById('sd-craft-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'playing') this._openCraft();
    });

    // Modal close buttons
    document.getElementById('craft-close')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._closeCraft();
    });
    document.getElementById('info-close')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._closeInfo();
    });
    document.getElementById('map-close')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._closeMap();
    });

    // Modal backdrops
    document.getElementById('craft-overlay')?.addEventListener('pointerdown', (e) => {
      if (e.target === document.getElementById('craft-overlay')) {
        this._closeCraft();
      }
    });
    document.getElementById('info-overlay')?.addEventListener('pointerdown', (e) => {
      if (e.target === document.getElementById('info-overlay')) {
        this._closeInfo();
      }
    });
    document.getElementById('map-overlay')?.addEventListener('pointerdown', (e) => {
      if (e.target === document.getElementById('map-overlay')) {
        this._closeMap();
      }
    });

    // Win / Game Over buttons
    document.getElementById('win-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'win') {
        document.getElementById('win-overlay').classList.add('hidden');
        this._startGame();
      }
    });
    document.getElementById('go-btn')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'gameover') {
        document.getElementById('gameover-overlay').classList.add('hidden');
        this._startGame();
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      this._updateTileSize();
    });
  }

  _onKeyDown(e) {
    const key = e.key;

    // Win/gameover state
    if (this.state === 'win' || this.state === 'gameover') {
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        document.getElementById('win-overlay')?.classList.add('hidden');
        document.getElementById('gameover-overlay')?.classList.add('hidden');
        this._startGame();
      }
      return;
    }

    // Escape closes any modal
    if (key === 'Escape') {
      e.preventDefault();
      if (this.state === 'crafting') this._closeCraft();
      else if (this.state === 'info') this._closeInfo();
      else if (this.state === 'map') this._closeMap();
      return;
    }

    // Crafting state
    if (this.state === 'crafting') {
      e.preventDefault();
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        this._craftCursorMove(-1);
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        this._craftCursorMove(1);
      } else if (key === 'Enter' || key === ' ') {
        this._craftActivate();
      } else if (key === 'r' || key === 'R') {
        this._doRepair();
      } else if (key === 'c' || key === 'C') {
        this._closeCraft();
      } else if (key >= '1' && key <= '6') {
        const idx = parseInt(key) - 1;
        this.craftCursor = idx;
        this._doCraft(idx);
      }
      return;
    }

    // Info/map state
    if (this.state === 'info') {
      if (key === 'i' || key === 'I') { e.preventDefault(); this._closeInfo(); }
      return;
    }
    if (this.state === 'map') {
      if (key === 'm' || key === 'M') { e.preventDefault(); this._closeMap(); }
      return;
    }

    // Playing state
    if (this.state === 'playing') {
      const dir = this._keyToDir(key);
      if (dir) {
        e.preventDefault();
        if (this._keyRepeatKey !== key) {
          this._stopRepeat();
          this._keyRepeatKey = key;
          this._doMove(dir.dx, dir.dy);
          this._keyRepeatTimer = setTimeout(() => {
            this._keyRepeatTimer = setInterval(() => {
              if (this.state === 'playing') this._doMove(dir.dx, dir.dy);
            }, 80);
          }, 150);
        }
        return;
      }

      if (key === 'c' || key === 'C') { e.preventDefault(); this._openCraft(); }
      else if (key === 'm' || key === 'M') { e.preventDefault(); this._openMap(); }
      else if (key === 'i' || key === 'I') { e.preventDefault(); this._openInfo(); }
    }
  }

  _onKeyUp(e) {
    const key = e.key;
    if (this._keyRepeatKey === key) {
      this._stopRepeat();
    }
  }

  _keyToDir(key) {
    switch (key) {
      case 'ArrowUp':    case 'w': case 'W': return { dx: 0, dy: -1 };
      case 'ArrowDown':  case 's': case 'S': return { dx: 0, dy: 1 };
      case 'ArrowLeft':  case 'a': case 'A': return { dx: -1, dy: 0 };
      case 'ArrowRight': case 'd': case 'D': return { dx: 1, dy: 0 };
    }
    return null;
  }

  _stopRepeat() {
    if (this._keyRepeatTimer) {
      clearTimeout(this._keyRepeatTimer);
      clearInterval(this._keyRepeatTimer);
      this._keyRepeatTimer = null;
    }
    this._keyRepeatKey = null;
  }

  _startPointerRepeat(dx, dy) {
    this._stopPointerRepeat();
    this._pointerRepeatTimer = setTimeout(() => {
      this._pointerRepeatTimer = setInterval(() => {
        if (this.state === 'playing') this._doMove(dx, dy);
      }, 80);
    }, 150);
  }

  _stopPointerRepeat() {
    if (this._pointerRepeatTimer) {
      clearTimeout(this._pointerRepeatTimer);
      clearInterval(this._pointerRepeatTimer);
      this._pointerRepeatTimer = null;
    }
  }

  // ─── DOM Setup ────────────────────────────────────────────────────────────

  _setupDOM() {
    this._updateTileSize();
  }

  // ─── Game Loop ────────────────────────────────────────────────────────────

  _loop() {
    if (this.core.map && this.core.player) {
      this.renderer.draw(this.core.map, this.core.player, this.state);
      this._updateUI();
    }
    requestAnimationFrame(() => this._loop());
  }
}

// Boot
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
  });
}
