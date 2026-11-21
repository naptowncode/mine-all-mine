// map.js — Map and level generation

class GameMap {
  constructor(depth, rng) {
    if (!rng || typeof rng.next !== 'function' || typeof rng.int !== 'function' || typeof rng.shuffle !== 'function') {
      throw new TypeError('GameMap requires a seeded rng');
    }
    this.depth = depth;
    this.rng = rng;
    this.width = MAP_WIDTH;
    this.height = MAP_HEIGHT;
    this.tiles = [];
    this.mineralMap = [];
    this.visited = [];
    this.rooms = [];
    this.upLadderPos = { x: 0, y: 0 };
    this.downLadderPos = { x: -1, y: -1 };

    this._init();
    this._generateRooms();
    this._connectRooms();
    this._placeLadders();
    this._placeMinerals();
  }

  _init() {
    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = [];
      this.mineralMap[y] = [];
      this.visited[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.tiles[y][x] = TILE.ROCK;
        this.mineralMap[y][x] = null;
        this.visited[y][x] = false;
      }
    }
  }

  _generateRooms() {
    const targetRooms = this.rng.int(6, 12);
    const maxAttempts = 300;
    let attempts = 0;

    while (this.rooms.length < targetRooms && attempts < maxAttempts) {
      attempts++;
      const w = this.rng.int(5, 12);
      const h = this.rng.int(4, 9);
      const x = this.rng.int(1, this.width - w - 2);
      const y = this.rng.int(1, this.height - h - 2);

      const newRoom = this._generateIrregularRoom(x, y, w, h);

      if (!this._roomOverlaps(newRoom)) {
        this.rooms.push(newRoom);
        // Carve the room cells
        for (const [cx, cy] of newRoom.cells) {
          this.tiles[cy][cx] = TILE.FLOOR;
        }
      }
    }
  }

  _generateIrregularRoom(bx, by, bw, bh) {
    const cx = bx + Math.floor(bw / 2);
    const cy = by + Math.floor(bh / 2);
    const targetCount = Math.max(4, Math.floor(bw * bh * (0.55 + this.rng.next() * 0.25)));

    const cells = new Set();
    const cellKey = (x, y) => `${x},${y}`;
    const frontier = [[cx, cy]];
    cells.add(cellKey(cx, cy));

    const maxDistSq = (bw / 2) * (bw / 2) + (bh / 2) * (bh / 2);
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];

    while (frontier.length > 0 && cells.size < targetCount) {
      const idx = Math.floor(this.rng.next() * frontier.length);
      const [fx, fy] = frontier[idx];

      // Shuffle directions
      const shuffled = this.rng.shuffle(dirs.slice());
      let expanded = false;

      for (const [dx, dy] of shuffled) {
        const nx = fx + dx;
        const ny = fy + dy;

        // Bounds check: within bounding box and not on map edge
        if (nx < bx || nx >= bx + bw || ny < by || ny >= by + bh) continue;
        if (nx <= 0 || nx >= this.width - 1 || ny <= 0 || ny >= this.height - 1) continue;
        if (cells.has(cellKey(nx, ny))) continue;

        // Distance bias
        const ddx = nx - (bx + bw / 2);
        const ddy = ny - (by + bh / 2);
        const distSq = ddx * ddx + ddy * ddy;
        const acceptProb = 0.4 + 0.6 * (1 - distSq / maxDistSq);
        if (this.rng.next() > acceptProb) continue;

        cells.add(cellKey(nx, ny));
        frontier.push([nx, ny]);
        expanded = true;
        break;
      }

      if (!expanded) {
        frontier.splice(idx, 1);
      }
    }

    // Convert set to array of [x, y]
    const cellArray = [];
    for (const key of cells) {
      const [x, y] = key.split(',').map(Number);
      cellArray.push([x, y]);
    }

    return {
      bx, by, bw, bh,
      cx: bx + Math.floor(bw / 2),
      cy: by + Math.floor(bh / 2),
      cells: cellArray
    };
  }

  _roomOverlaps(newRoom) {
    for (const existing of this.rooms) {
      // Bounding box pre-check (expanded by 1)
      if (newRoom.bx > existing.bx + existing.bw + 1) continue;
      if (newRoom.bx + newRoom.bw + 1 < existing.bx) continue;
      if (newRoom.by > existing.by + existing.bh + 1) continue;
      if (newRoom.by + newRoom.bh + 1 < existing.by) continue;

      // Cell-level check
      const existingSet = new Set(existing.cells.map(([x, y]) => `${x},${y}`));
      for (const [nx, ny] of newRoom.cells) {
        // Check cell and cardinal neighbors
        for (const [dx, dy] of [[0,0],[0,-1],[0,1],[-1,0],[1,0]]) {
          if (existingSet.has(`${nx+dx},${ny+dy}`)) return true;
        }
      }
    }
    return false;
  }

  _connectRooms() {
    for (let i = 0; i < this.rooms.length - 1; i++) {
      const a = this.rooms[i];
      const b = this.rooms[i + 1];
      this._carveTunnel(a.cx, a.cy, b.cx, b.cy);
    }
  }

  _carveTunnel(x1, y1, x2, y2) {
    const horizontal_first = this.rng.next() < 0.5;

    if (horizontal_first) {
      this._carveHorizontal(x1, x2, y1);
      this._carveVertical(y1, y2, x2);
    } else {
      this._carveVertical(y1, y2, x1);
      this._carveHorizontal(x1, x2, y2);
    }
  }

  _carveHorizontal(x1, x2, y) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
        if (this.tiles[y][x] === TILE.ROCK) {
          this.tiles[y][x] = TILE.TUNNEL;
        }
      }
    }
  }

  _carveVertical(y1, y2, x) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
        if (this.tiles[y][x] === TILE.ROCK) {
          this.tiles[y][x] = TILE.TUNNEL;
        }
      }
    }
  }

  _placeLadders() {
    if (this.rooms.length === 0) return;

    const firstRoom = this.rooms[0];
    const lastRoom = this.rooms[this.rooms.length - 1];

    // Up ladder in first room
    const upPos = this._nearestFloorCell(firstRoom);
    this.tiles[upPos.y][upPos.x] = TILE.LADDER_UP;
    this.upLadderPos = upPos;

    // Down ladder in last room (not on level 7)
    if (this.depth < MAX_DEPTH) {
      const downPos = this._nearestFloorCell(lastRoom);
      this.tiles[downPos.y][downPos.x] = TILE.LADDER_DOWN;
      this.downLadderPos = downPos;
    } else {
      this.downLadderPos = { x: -1, y: -1 };
    }
  }

  _nearestFloorCell(room) {
    const cx = room.cx;
    const cy = room.cy;
    let best = null;
    let bestDist = Infinity;

    for (const [x, y] of room.cells) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }

    return best || { x: cx, y: cy };
  }

  _placeMinerals() {
    const count = 18 + this.depth * 4;

    // Build weighted pool
    const pool = [];
    for (const [key, mineral] of Object.entries(MINERALS)) {
      if (mineral.minDepth <= this.depth) {
        for (let i = 0; i < mineral.weight; i++) {
          pool.push(key);
        }
      }
    }

    if (pool.length === 0) return;

    // Find candidates
    const candidates = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.tiles[y][x] !== TILE.ROCK) continue;
        if (this.mineralMap[y][x] !== null) continue;

        // Check cardinal adjacency to walkable tile
        let adjacent = false;
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const t = this.tiles[ny][nx];
            if (t === TILE.FLOOR || t === TILE.TUNNEL || t === TILE.LADDER_UP || t === TILE.LADDER_DOWN) {
              adjacent = true;
              break;
            }
          }
        }
        if (adjacent) candidates.push([x, y]);
      }
    }

    this.rng.shuffle(candidates);

    const toPlace = Math.min(count, candidates.length);
    for (let i = 0; i < toPlace; i++) {
      const [x, y] = candidates[i];
      const mineralKey = pool[this.rng.int(0, pool.length - 1)];
      this.mineralMap[y][x] = mineralKey;
    }
  }

  isWalkable(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.tiles[y][x] !== TILE.ROCK;
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.tiles[y][x];
  }

  getMineral(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.mineralMap[y][x];
  }

  setTile(x, y, type) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.tiles[y][x] = type;
  }

  clearMineral(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.mineralMap[y][x] = null;
  }

  updateVisibility(px, py, radius) {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const tx = px + dx;
          const ty = py + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            this.visited[ty][tx] = true;
          }
        }
      }
    }
  }

  isVisible(px, py, tx, ty, radius) {
    const dx = tx - px;
    const dy = ty - py;
    return dx * dx + dy * dy <= radius * radius;
  }

  getPlayerStartPos() {
    return { ...this.upLadderPos };
  }
}
