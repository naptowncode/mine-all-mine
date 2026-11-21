'use strict';

const OVERLAY_IDS = [
  'craft-overlay',
  'info-overlay',
  'map-overlay',
  'win-overlay',
  'gameover-overlay'
];

function createContext2dStub() {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    font: '',
    fillRect() {},
    clearRect() {},
    strokeRect() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    measureText() {
      return {
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0
      };
    },
    fillText() {},
    createRadialGradient() {
      return { addColorStop() {} };
    }
  };
}

function createElement(id, options) {
  const initialClasses = (options && options.classes) || [];
  const classes = new Set(initialClasses);
  const addCalls = [];
  const removeCalls = [];
  const listeners = [];
  const context = createContext2dStub();

  return {
    id,
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    className: '',
    width: 0,
    height: 0,
    offsetHeight: 0,
    listeners,
    classList: {
      add(...names) {
        for (const name of names) {
          addCalls.push(name);
          classes.add(name);
        }
      },
      remove(...names) {
        for (const name of names) {
          removeCalls.push(name);
          classes.delete(name);
        }
      },
      contains(name) {
        return classes.has(name);
      },
      addCalls,
      removeCalls
    },
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
    removeEventListener(type, handler) {
      const index = listeners.findIndex(
        (entry) => entry.type === type && entry.handler === handler
      );
      if (index !== -1) listeners.splice(index, 1);
    },
    querySelectorAll() {
      return [];
    },
    getContext() {
      return context;
    },
    _context: context
  };
}

function createFakeDom(options = {}) {
  const elements = Object.create(null);
  const documentListeners = [];

  function getElementById(id) {
    if (!elements[id]) {
      const classes = OVERLAY_IDS.includes(id) ? ['hidden'] : [];
      elements[id] = createElement(id, { classes });
    }
    return elements[id];
  }

  const document = {
    getElementById,
    addEventListener(type, handler) {
      documentListeners.push({ type, handler });
    },
    removeEventListener(type, handler) {
      const index = documentListeners.findIndex(
        (entry) => entry.type === type && entry.handler === handler
      );
      if (index !== -1) documentListeners.splice(index, 1);
    },
    querySelectorAll() {
      return [];
    },
    listeners: documentListeners
  };

  const windowListeners = [];
  const window = {
    innerWidth: 1024,
    innerHeight: 768,
    visualViewport: null,
    addEventListener(type, handler) {
      windowListeners.push({ type, handler });
    },
    removeEventListener(type, handler) {
      const index = windowListeners.findIndex(
        (entry) => entry.type === type && entry.handler === handler
      );
      if (index !== -1) windowListeners.splice(index, 1);
    },
    listeners: windowListeners
  };
  window.window = window;

  const store = new Map(Object.entries(options.storage || {}));
  const localStorage = {
    getItem(key) {
      const normalized = String(key);
      return store.has(normalized) ? store.get(normalized) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index) {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length() {
      return store.size;
    },
    _store: store
  };

  const rafCallbacks = [];
  let nextRafId = 0;

  function requestAnimationFrame(callback) {
    rafCallbacks.push(callback);
    nextRafId += 1;
    return nextRafId;
  }

  function cancelAnimationFrame() {}

  return {
    document,
    window,
    localStorage,
    requestAnimationFrame,
    cancelAnimationFrame,
    elements,
    rafCallbacks
  };
}

class StubRenderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.minimapCanvas = minimapCanvas;
    this.tileSize = 12;
    this.setTileSizeCalls = [];
    this.drawCalls = [];
    this.drawMinimapCalls = [];
    this.addParticleCalls = [];
  }

  setTileSize(tileSize) {
    this.tileSize = tileSize;
    this.setTileSizeCalls.push(tileSize);
    if (this.canvas) {
      this.canvas.width = tileSize;
      this.canvas.height = tileSize;
    }
  }

  draw(map, player, gameState) {
    this.drawCalls.push([map, player, gameState]);
  }

  drawMinimap(map, player, tileSize, targetCanvas) {
    this.drawMinimapCalls.push([map, player, tileSize, targetCanvas]);
  }

  addParticle(tx, ty, mineralKey) {
    this.addParticleCalls.push([tx, ty, mineralKey]);
  }
}

module.exports = { createFakeDom, StubRenderer };
