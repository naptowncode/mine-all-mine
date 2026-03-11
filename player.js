// player.js — Player state and actions

class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.depth = 1;
    this.deepestLevel = 1;
    this.inventory = {};
    for (const key of MINERAL_KEYS) {
      this.inventory[key] = 0;
    }
    this.totalValue = 0;
    this.secondsRemaining = COUNTDOWN_SECONDS;
    this.stepsTaken = 0;
    this.pick = { ...STARTING_PICK };
    this.pickDurability = STARTING_PICK.durability;
    this.picksBroken = 0;
    this.log = [
      'You descend into the mine. Good luck!',
      `Pick: ${STARTING_PICK.name} (${STARTING_PICK.durability} strikes)`
    ];
  }

  addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > MAX_LOG) {
      this.log.pop();
    }
  }

  getVisibilityRadius() {
    if (this.secondsRemaining > 7200) return 6;
    if (this.secondsRemaining >= 3600) return 4;
    return 3;
  }

  deductTime(seconds) {
    this.secondsRemaining = Math.max(0, this.secondsRemaining - seconds);
  }

  // Returns 'moved', 'descend', 'ascend', 'mined', 'blocked', 'no_pick'
  tryMove(dx, dy, map) {
    const nx = this.x + dx;
    const ny = this.y + dy;

    // Out of bounds
    if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) {
      return 'blocked';
    }

    const tile = map.getTile(nx, ny);

    if (tile !== TILE.ROCK) {
      // Walkable tile
      this.x = nx;
      this.y = ny;
      this.deductTime(WALK_COST);
      this.stepsTaken++;

      // Auto-pickup mineral on floor (fallback)
      const mineral = map.getMineral(nx, ny);
      if (mineral && tile !== TILE.ROCK) {
        this._collectMineral(mineral, map, nx, ny);
        this.addLog(`Picked up ${MINERALS[mineral].name}! (+${MINERALS[mineral].value}¢)`);
      }

      if (tile === TILE.LADDER_DOWN) return 'descend';
      if (tile === TILE.LADDER_UP) return 'ascend';
      return 'moved';
    } else {
      // Rock — attempt to mine
      return this._mine(nx, ny, map);
    }
  }

  _mine(tx, ty, map) {
    if (!this.pick || this.pickDurability <= 0) {
      this.addLog('⚠ No pick equipped! Tap ⚒ to craft one.');
      return 'no_pick';
    }

    this.stepsTaken++;
    this.deductTime(MINE_COST);

    const mineralKey = map.getMineral(tx, ty);
    const mineral = mineralKey ? MINERALS[mineralKey] : null;

    // Break chance
    let breakChance;
    if (!mineral) {
      breakChance = 1.0;
    } else {
      breakChance = this.pick.durability / 10 / mineral.value;
      breakChance = Math.min(0.95, Math.max(0.02, breakChance));
    }

    const prevDurability = this.pickDurability;
    const success = Math.random() < breakChance;

    if (success) {
      // Rock breaks
      map.setTile(tx, ty, TILE.FLOOR);
      map.clearMineral(tx, ty);

      if (mineral) {
        this._collectMineral(mineralKey, map, tx, ty);
        this.addLog(`⛏ Broke through! ${mineral.name} (+${mineral.value}¢)`);
      } else {
        this.addLog('⛏ The rock crumbles.');
      }

      this._wearPick(1.0, prevDurability);
      return { result: 'mined', success: true, mineralKey };
    } else {
      // Rock holds
      if (mineral) {
        this.addLog(`⛏ The ${mineral.name} vein holds firm…`);
      } else {
        this.addLog('⛏ The rock holds firm…');
      }

      this._wearPick(0.5, prevDurability);
      return { result: 'mined', success: false, mineralKey };
    }
  }

  _collectMineral(mineralKey, map, x, y) {
    const mineral = MINERALS[mineralKey];
    this.inventory[mineralKey] = (this.inventory[mineralKey] || 0) + 1;
    this.totalValue += mineral.value;
  }

  _wearPick(amount, prevDurability) {
    if (!this.pick) return;

    const maxDur = this.pick.durability;
    this.pickDurability -= amount;

    // Check warnings (only fire once per threshold crossing)
    const threshold25 = maxDur * 0.25;
    const threshold10 = maxDur * 0.10;

    if (prevDurability > threshold25 && this.pickDurability <= threshold25) {
      this.addLog(`⚠ ${this.pick.name} is wearing thin! (25% left)`);
    } else if (prevDurability > threshold10 && this.pickDurability <= threshold10) {
      this.addLog(`⚠ ${this.pick.name} is almost gone! (10% left)`);
    }

    if (this.pickDurability <= 0) {
      const name = this.pick.name;
      this.pick = null;
      this.pickDurability = 0;
      this.picksBroken++;
      this.addLog(`💥 Your ${name} shattered! Tap ⚒ to craft a new one.`);
    }
  }

  canCraft(pickIndex) {
    const pick = PICKS[pickIndex];
    if (!pick || !pick.recipe) return false;
    for (const [mineral, count] of Object.entries(pick.recipe)) {
      if ((this.inventory[mineral] || 0) < count) return false;
    }
    return true;
  }

  craftPick(pickIndex) {
    if (!this.canCraft(pickIndex)) return false;
    const pick = PICKS[pickIndex];

    // Deduct ingredients and value
    for (const [mineral, count] of Object.entries(pick.recipe)) {
      this.inventory[mineral] -= count;
      this.totalValue -= MINERALS[mineral].value * count;
    }
    this.totalValue = Math.max(0, this.totalValue);

    this.pick = { ...pick };
    this.pickDurability = pick.durability;
    this.addLog(`🔨 Crafted ${pick.name}! (${pick.durability} strikes)`);
    return true;
  }

  canRepair() {
    if (!this.pick) return false;
    if (this.pickDurability <= 0) return false;
    if (this.pickDurability >= this.pick.durability) return false;
    if (!this.pick.recipe) return false;

    const cost = getRepairCost(this.pick);
    if (!cost) return false;

    for (const [mineral, count] of Object.entries(cost)) {
      if ((this.inventory[mineral] || 0) < count) return false;
    }
    return true;
  }

  repairPick() {
    if (!this.canRepair()) return false;
    const cost = getRepairCost(this.pick);

    for (const [mineral, count] of Object.entries(cost)) {
      this.inventory[mineral] -= count;
      this.totalValue -= MINERALS[mineral].value * count;
    }
    this.totalValue = Math.max(0, this.totalValue);

    this.pickDurability = this.pick.durability;
    this.addLog(`🔧 Repaired ${this.pick.name} to full! (${this.pick.durability} strikes)`);
    return true;
  }

  isRepairAvailable() {
    if (!this.pick) return false;
    if (this.pickDurability <= 0) return false;
    if (this.pickDurability >= this.pick.durability) return false;
    if (!this.pick.recipe) return false;
    return true;
  }

  getInventoryList() {
    const items = [];
    for (const key of MINERAL_KEYS) {
      if (this.inventory[key] > 0) {
        items.push({
          key,
          name: MINERALS[key].name,
          color: MINERALS[key].color,
          count: this.inventory[key],
          value: MINERALS[key].value * this.inventory[key]
        });
      }
    }
    return items;
  }
}
