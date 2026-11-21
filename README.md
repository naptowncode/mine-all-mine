# ⛏ Mine All Mine

A single-player, browser-based, rogue-like mining adventure rendered on an HTML5 Canvas. Descend through procedurally generated mine levels, collect valuable minerals, craft progressively better pickaxes, and escape before your light fades and time runs out.

**[Play it now →](https://naptowncode.github.io/mine-all-mine/)** *(or open `index.html` locally — no build step required)*

---

## Table of Contents

- [Credits](#credits)
- [Overview](#overview)
- [How to Play](#how-to-play)
- [Controls](#controls)
- [Gameplay Mechanics](#gameplay-mechanics)
  - [The Timer](#the-timer)
  - [The Mine](#the-mine)
  - [Minerals](#minerals)
  - [Mining](#mining)
  - [Picks & Durability](#picks--durability)
  - [Crafting](#crafting)
  - [Repairing](#repairing)
  - [Fog of Dust](#fog-of-dust)
  - [Win & Loss Conditions](#win--loss-conditions)
- [Minerals Reference](#minerals-reference)
- [Picks Reference](#picks-reference)
- [Running Locally](#running-locally)
- [Project Structure](#project-structure)

---

## Credits

This game is an experiment in vibe coding. Code, text, and gameplay were created mostly by Claude Sonnet 4.6 with sprinklings of Claude Opus 4.6, Amazon Nova Pro, Qwen3-Coder, Devstral 2, Llama 3.2, and a dash of plain old human.

Look and feel was heavily influenced by Chris McCormick's [Rogule](https://rogule.com/). The push-your-luck depth mechanic was inspired by [Deep Sea Adventure](https://oinkgames.com/en/games/analog/deep-sea-adventure/) by Jun Sasaki & Goro Sasaki.

---

## Overview

Mine All Mine is a **mobile-first** game designed for a 360 × 780 px smartphone viewport. It is fully playable on touchscreen with no keyboard required. On larger screens, tiles scale up and a sidebar panel appears with your inventory, log, and minimap.

There is **no server, no build step, and no external dependencies** — just plain HTML, CSS, and vanilla JavaScript.

---

## How to Play

1. You start on **Level 1** of a procedurally generated mine, equipped with a **Rusty Pick**.
2. Navigate through rooms and tunnels, mining rock walls to collect minerals.
3. Use collected minerals to **craft better pickaxes** at the ⚒ Craft menu.
4. Descend deeper (up to **Level 7**) to find rarer, more valuable minerals.
5. **Escape through the up ladder on Level 1** before the 24-hour countdown reaches zero.
6. If time runs out, your entire haul is lost.

---

## Controls

### Mobile / Touch

| Control | Action |
|---------|--------|
| **▲ ▼ ◄ ►** D-pad | Move / Mine |
| **📦 Info** button | View inventory & event log |
| **⚒ Craft** button | Open crafting menu |
| **🗺 Map** (minimap) | Always visible in bottom-left |

### Keyboard (Desktop)

| Key | Action |
|-----|--------|
| **Arrow Keys** / **WASD** | Move / Mine |
| **C** | Open / close Craft menu |
| **M** | Open / close Map modal |
| **I** | Open / close Info modal |
| **Esc** | Close any open modal |
| **1–6** | Craft pick by number (in Craft menu) |
| **R** | Repair current pick (in Craft menu) |
| **Enter** / **Space** | Restart (on Win / Game Over screen) |

Movement keys support **key repeat**: hold a direction for 150 ms, then it fires every 80 ms.

---

## Gameplay Mechanics

### The Timer

You have **24 hours (86,400 seconds)** to mine and escape. Every action costs time:

| Action | Time Cost |
|--------|-----------|
| Walk one tile | **5 seconds** |
| Mining attempt (success or fail) | **5 minutes (300 seconds)** |

The timer is always visible in the status bar. As time dwindles, it changes color:

| Time Remaining | Color |
|----------------|-------|
| > 30% (~7h 12m+) | White |
| 15–30% (~3h 36m – 7h 12m) | 🟡 Yellow |
| 5–15% (~1h 12m – 3h 36m) | 🟠 Orange |
| ≤ 5% (~0 – 1h 12m) | 🔴 Red |

---

### The Mine

The mine has **7 levels**. Each level is a **60 × 40 tile** grid of procedurally generated rooms connected by tunnels.

- **Rooms** are irregular blobs (not simple rectangles), 6–12 per level.
- **Tunnels** connect rooms in sequence, ensuring every room is reachable.
- **Ladders** connect levels: a green **▲ up ladder** leads toward the surface, a gold **▼ down ladder** leads deeper.
- **Levels are never cached** — every time you change levels (up or down), a completely fresh map is generated. You cannot memorize layouts.
- Deeper levels have **darker color palettes** and **richer mineral deposits**.

#### Mineral Density by Level

| Level | Minerals Placed |
|-------|----------------|
| 1 | 22 |
| 2 | 26 |
| 3 | 30 |
| 4 | 34 |
| 5 | 38 |
| 6 | 42 |
| 7 | 46 |

---

### Minerals

Minerals are hidden inside rock walls. You can see colored **vein hints** (small speckles and a crack line) on rocks that contain minerals — but only when they're within your current visibility radius.

Deeper levels unlock rarer, more valuable minerals:

| Mineral | Color | Value | Available From |
|---------|-------|-------|----------------|
| Tin | Yellow-green | 1¢ | Level 1 |
| Copper | Orange | 3¢ | Level 1 |
| Zinc | Pink/rose | 5¢ | Level 1 |
| Iron | Purple | 8¢ | Level 2 |
| Silver | Lavender | 15¢ | Level 3 |
| Gold | Yellow | 25¢ | Level 4 |
| Platinum | Light teal | 50¢ | Level 5 |

Common minerals (Tin, Copper, Zinc) spawn frequently; rare minerals (Gold, Platinum) spawn rarely but are worth far more.

---

### Mining

To mine a rock, simply **walk into it**. Your pick swings automatically.

Each mining attempt costs **5 minutes** of time and has a chance to break through the rock. The formula is `pickDurability / 10 / mineralValue`, clamped between 2% and 95%. Harder (more valuable) minerals are tougher to crack — and a worn-down pick is less effective. The table below shows approximate break chances with a **fresh Rusty Pick** (durability 20):

| Mineral | Break Chance (Rusty Pick) |
|---------|--------------------------|
| Plain rock | 100% (always breaks) |
| Tin (value 1¢) | ~95% |
| Copper (value 3¢) | ~67% |
| Zinc (value 5¢) | ~40% |
| Iron (value 8¢) | ~25% |
| Silver (value 15¢) | ~13% |
| Gold (value 25¢) | ~8% |
| Platinum (value 50¢) | ~4% |

Better picks have higher durability, which directly improves your break chances on tough minerals.

- **Success**: The rock becomes floor, the mineral is added to your inventory, and your pick loses **1 durability**.
- **Failure**: The rock holds firm, a particle burst animation plays, and your pick loses **0.5 durability**.

You cannot mine without a pick equipped. If your pick breaks, open the ⚒ Craft menu to make a new one.

---

### Picks & Durability

Your pick has a **durability** rating — the number of successful strikes before it shatters. Failed mining attempts cost half durability.

| Pick | Durability | Notes |
|------|------------|-------|
| Rusty Pick | 20 | Starting pick; cannot be crafted or repaired |
| Stinum Pick | 25 | First craftable pick |
| Brontix Pick | 30 | — |
| Zinkon Pick | 40 | — |
| Ferium Pick | 60 | — |
| Electovar Pick | 90 | — |
| Auripetal Pick | 150 | Deepest-level pick |

The durability bar in the status bar changes color as your pick wears down:

| Durability | Color |
|------------|-------|
| > 50% | 🟢 Green |
| 25–50% | 🟠 Orange |
| < 25% | 🔴 Red |

You'll receive log warnings at **25%** and **10%** durability. When a pick shatters, you must craft a new one before you can mine again.

---

### Crafting

Open the **⚒ Craft** menu (button on mobile, **C** on keyboard) to craft a new pick from minerals in your inventory.

**Crafting costs minerals** — those minerals are consumed and their value is deducted from your haul total. Plan ahead: spending minerals on a better pick is an investment that pays off with faster, more efficient mining.

| Pick | Recipe |
|------|--------|
| Stinum Pick | 4 Tin + 2 Copper |
| Brontix Pick | 2 Tin + 6 Copper + 2 Zinc |
| Zinkon Pick | 4 Copper + 6 Zinc |
| Ferium Pick | 2 Zinc + 8 Iron |
| Electovar Pick | 6 Iron + 2 Silver + 2 Gold |
| Auripetal Pick | 6 Gold + 4 Platinum |

Each recipe row in the Craft menu shows ingredient chips colored **green** (you have enough) or **red** (you need more). You can only craft a pick if all ingredients are available.

---

### Repairing

If your current pick is damaged (but not broken), you can **repair it to full durability** for half the crafting cost (rounded up per ingredient).

| Pick | Repair Cost |
|------|-------------|
| Stinum Pick | 2 Tin + 1 Copper |
| Brontix Pick | 1 Tin + 3 Copper + 1 Zinc |
| Zinkon Pick | 2 Copper + 3 Zinc |
| Ferium Pick | 1 Zinc + 4 Iron |
| Electovar Pick | 3 Iron + 1 Silver + 1 Gold |
| Auripetal Pick | 3 Gold + 2 Platinum |

The Rusty Pick **cannot** be repaired (it has no recipe). The repair option only appears in the Craft menu when your current pick is damaged and repairable.

---

### Fog of Dust

You can only see tiles within a **circular radius** around your character. Tiles you've visited but are no longer in range appear dimmed (55% dark overlay). Unexplored tiles are completely black.

Critically, **your visibility radius shrinks as time runs out** — simulating your miner's lamp fading:

| Time Remaining | Visibility Radius |
|----------------|------------------|
| > 2 hours | 6 tiles |
| 1–2 hours | 4 tiles |
| < 1 hour | 3 tiles |

Mineral vein hints are **only visible** when a rock is within your current radius — explored-but-dim rocks appear as plain rock, hiding their contents.

---

### Win & Loss Conditions

**🏆 Escape (Win):** Step onto the **▲ up ladder on Level 1**. Your haul is secured and the escape screen shows your stats.

**💀 Time's Up (Loss):** The countdown reaches zero. Your **entire haul is lost** (set to 0¢). The game-over screen shows your deepest level reached.

#### Persistent Stats

Both outcomes increment your lifetime **Plays** counter (stored in `localStorage`). Your **Best Haul** is only updated on a successful escape. These stats persist across browser sessions.

---

## Minerals Reference

| Mineral | Hex Color | Value | Min Level | Spawn Weight |
|---------|-----------|-------|-----------|--------------|
| Tin | `#b0c878` | 1¢ | 1 | 45 (most common) |
| Copper | `#ff5500` | 3¢ | 1 | 40 |
| Zinc | `#e05080` | 5¢ | 1 | 35 |
| Iron | `#cc44ff` | 8¢ | 2 | 30 |
| Silver | `#c8c0d8` | 15¢ | 3 | 20 |
| Gold | `#ffdd00` | 25¢ | 4 | 10 |
| Platinum | `#50d0e8` | 50¢ | 5 | 5 (rarest) |

---

## Picks Reference

| Pick | Durability | Recipe | Repair Cost |
|------|------------|--------|-------------|
| Rusty Pick *(starter)* | 20 | — | Not repairable |
| Stinum Pick | 25 | 4 Tin + 2 Copper | 2 Tin + 1 Copper |
| Brontix Pick | 30 | 2 Tin + 6 Copper + 2 Zinc | 1 Tin + 3 Copper + 1 Zinc |
| Zinkon Pick | 40 | 4 Copper + 6 Zinc | 2 Copper + 3 Zinc |
| Ferium Pick | 60 | 2 Zinc + 8 Iron | 1 Zinc + 4 Iron |
| Electovar Pick | 90 | 6 Iron + 2 Silver + 2 Gold | 3 Iron + 1 Silver + 1 Gold |
| Auripetal Pick | 150 | 6 Gold + 4 Platinum | 3 Gold + 2 Platinum |

---

## Running Locally

No build step or dependencies required. Just serve the files from any static file server:

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# Then open:
# http://localhost:8080
```

Or simply open `index.html` directly in your browser (note: some browsers restrict `localStorage` for `file://` URLs, which affects persistent stats).

---

## Project Structure

```
mine-all-mine/
├── index.html      # Game shell: HTML structure, CSS, modal markup
├── constants.js    # Tile IDs, mineral definitions, pick recipes, map dimensions
├── map.js          # Procedural level generation (rooms, tunnels, ladders, minerals)
├── player.js       # Player state, movement, mining, crafting, repair logic
├── renderer.js     # Canvas rendering: tiles, player, animations, minimap
├── game.js         # Game loop, input handling, UI updates, state management
└── LICENSE
```

**Script load order matters:** `constants.js` → `map.js` → `player.js` → `renderer.js` → `game.js`. Each file depends on globals defined by earlier scripts.

---

## License

See [LICENSE](LICENSE) for details.
