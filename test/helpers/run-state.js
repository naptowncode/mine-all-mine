'use strict';

// Test-only canonical serialization of RunCore state. This is not the
// snapshot contract; it exists so determinism tests can compare runs.

function clone2d(rows) {
  return rows.map((row) => row.slice());
}

function serializeRooms(rooms) {
  return rooms.map((room) => ({
    bx: room.bx,
    by: room.by,
    bw: room.bw,
    bh: room.bh,
    cx: room.cx,
    cy: room.cy,
    cells: room.cells.map(([x, y]) => [x, y])
  }));
}

function serializeLevel(level) {
  return {
    tiles: clone2d(level.tiles),
    mineralMap: clone2d(level.mineralMap),
    visited: clone2d(level.visited),
    upLadderPos: { ...level.upLadderPos },
    downLadderPos: { ...level.downLadderPos },
    rooms: serializeRooms(level.rooms)
  };
}

function serializePlayer(player) {
  return {
    x: player.x,
    y: player.y,
    depth: player.depth,
    deepestLevel: player.deepestLevel,
    inventory: { ...player.inventory },
    totalValue: player.totalValue,
    secondsRemaining: player.secondsRemaining,
    stepsTaken: player.stepsTaken,
    pick: player.pick
      ? {
          id: player.pick.id,
          name: player.pick.name,
          durability: player.pick.durability,
          color: player.pick.color,
          recipe: player.pick.recipe ? { ...player.pick.recipe } : null
        }
      : null,
    pickDurability: player.pickDurability,
    picksBroken: player.picksBroken,
    log: player.log.slice()
  };
}

function serializeMap(map) {
  if (!map) return null;
  return {
    depth: map.depth,
    width: map.width,
    height: map.height,
    ...serializeLevel(map)
  };
}

function serializeLevelCache(levelCache) {
  const serialized = {};
  const depths = Object.keys(levelCache).map(Number).sort((a, b) => a - b);
  for (const depth of depths) {
    serialized[depth] = serializeLevel(levelCache[depth]);
  }
  return serialized;
}

function serializeRun(core) {
  return JSON.stringify({
    phase: core.phase,
    plays: core.plays,
    bestHaul: core.bestHaul,
    player: serializePlayer(core.player),
    map: serializeMap(core.map),
    levelCache: serializeLevelCache(core.levelCache)
  });
}

module.exports = { serializeRun };
