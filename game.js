const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const manaTextEl = document.getElementById("manaText");
const manaFillEl = document.getElementById("manaFill");
const lairTextEl = document.getElementById("lairText");
const lairFillEl = document.getElementById("lairFill");
const spawnRowEl = document.getElementById("spawnRow");
const heroesLeftEl = document.getElementById("heroesLeft");
const troopsOutEl = document.getElementById("troopsOut");
const statusEl = document.getElementById("status");

const GRID_W = 20;
const GRID_H = 12;

const WORLD = {
  manaMax: 100,
  manaRegen: 11.5,
  lairMaxHp: 500,
  lairTouchDps: 45
};

const HERO_FORMATION = [
  { classKey: "paladin", gx: 14, gy: 6 },
  { classKey: "warrior", gx: 14, gy: 3 },
  { classKey: "rogue", gx: 14, gy: 9 },
  { classKey: "mage", gx: 16, gy: 4 },
  { classKey: "priest", gx: 16, gy: 8 }
];

const HERO_CLASSES = {
  paladin: {
    short: "Paladin",
    maxHp: 410,
    speed: 88,
    damage: 7,
    rangeCells: 0.72,
    attackCd: 0.62,
    armor: 0.36,
    radius: 16,
    color: "#c8b8ff",
    plate: "#5a4a8a"
  },
  priest: {
    short: "Priest",
    maxHp: 125,
    speed: 92,
    damage: 3,
    rangeCells: 0.78,
    attackCd: 0.88,
    armor: 0,
    radius: 14,
    color: "#fff0c8",
    plate: "#d4b87a",
    healAmount: 20,
    healCd: 1.28,
    healRangeCells: 5.8
  },
  rogue: {
    short: "Rogue",
    maxHp: 92,
    speed: 112,
    damage: 14,
    rangeCells: 0.52,
    attackCd: 0.3,
    armor: 0,
    radius: 13,
    color: "#9ee0c4",
    plate: "#2d5a46"
  },
  mage: {
    short: "Mage",
    maxHp: 82,
    speed: 90,
    damage: 12,
    rangeCells: 2.55,
    attackCd: 0.48,
    armor: 0,
    radius: 13,
    color: "#8ec8ff",
    plate: "#2a5a9e"
  },
  warrior: {
    short: "Warrior",
    maxHp: 210,
    speed: 98,
    damage: 11,
    rangeCells: 0.75,
    attackCd: 0.4,
    armor: 0.1,
    radius: 15,
    color: "#ffbba6",
    plate: "#9a4a3a"
  }
};

const TROOP_TYPES = {
  imp: {
    cost: 12,
    hpMax: 44,
    speed: 125,
    damage: 6,
    rangeCells: 0.48,
    attackCd: 0.4,
    radius: 10,
    color: "#6bff9a"
  },
  brute: {
    cost: 32,
    hpMax: 185,
    speed: 72,
    damage: 10,
    rangeCells: 0.62,
    attackCd: 0.52,
    radius: 14,
    color: "#c9a06a"
  },
  whelp: {
    cost: 48,
    hpMax: 98,
    speed: 108,
    damage: 15,
    rangeCells: 1.05,
    attackCd: 0.46,
    radius: 12,
    color: "#ff7a5c"
  }
};

let pathX = 0;
let pathY = 0;
let cellSize = 40;
let pathPixelW = 0;
let pathPixelH = 0;

let heroes = [];
let troops = [];
let mana = WORLD.manaMax;
let lairHp = WORLD.lairMaxHp;
let spawnRow = 6;
let started = false;
let gameOver = false;
let victory = false;
let lastTime = performance.now();

function layoutPath() {
  const padX = 72;
  const padY = 36;
  const availW = canvas.width - padX * 2;
  const availH = canvas.height - padY * 2;
  cellSize = Math.min(availW / GRID_W, availH / GRID_H);
  pathPixelW = GRID_W * cellSize;
  pathPixelH = GRID_H * cellSize;
  pathX = (canvas.width - pathPixelW) / 2;
  pathY = (canvas.height - pathPixelH) / 2;
}

function cellCenter(gx, gy) {
  return {
    x: pathX + (gx + 0.5) * cellSize,
    y: pathY + (gy + 0.5) * cellSize
  };
}

function lairCorePixel() {
  return {
    x: pathX - 36,
    y: pathY + pathPixelH / 2
  };
}

function pathBounds() {
  return {
    minX: pathX,
    maxX: pathX + pathPixelW,
    minY: pathY,
    maxY: pathY + pathPixelH
  };
}

function clampToPath(x, y, radius) {
  const b = pathBounds();
  return {
    x: clamp(x, b.minX + radius, b.maxX - radius),
    y: clamp(y, b.minY + radius, b.maxY - radius)
  };
}

function buildHeroes() {
  layoutPath();
  return HERO_FORMATION.map((slot) => {
    const def = HERO_CLASSES[slot.classKey];
    const pos = cellCenter(slot.gx, slot.gy);
    return {
      classKey: slot.classKey,
      x: pos.x,
      y: pos.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      attackT: 0,
      healT: 0
    };
  });
}

function heroRangePx(def) {
  return def.rangeCells * cellSize;
}

function troopRangePx(spec) {
  return spec.rangeCells * cellSize;
}

function resetGame() {
  heroes = buildHeroes();
  troops = [];
  mana = WORLD.manaMax;
  lairHp = WORLD.lairMaxHp;
  spawnRow = 6;
  gameOver = false;
  victory = false;
  updateBars();
  updateHud();
  updateSpawnButtons();
}

function startGame() {
  resetGame();
  started = true;
  statusEl.textContent = "";
}

function nearestTroopFrom(px, py) {
  let best = null;
  let bestD = Infinity;
  for (const t of troops) {
    if (t.hp <= 0) continue;
    const d = Math.hypot(t.x - px, t.y - py);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return { unit: best, dist: bestD };
}

function nearestHeroFrom(px, py) {
  let best = null;
  let bestD = Infinity;
  for (const h of heroes) {
    if (h.hp <= 0) continue;
    const d = Math.hypot(h.x - px, h.y - py);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return { unit: best, dist: bestD };
}

function trySpawnTroop(troopKey) {
  if (!started || gameOver) return;
  const spec = TROOP_TYPES[troopKey];
  if (!spec || mana < spec.cost) return;

  mana -= spec.cost;
  const gy = clamp(spawnRow, 0, GRID_H - 1);
  const pos = cellCenter(0.5, gy);
  troops.push({
    key: troopKey,
    x: pos.x,
    y: pos.y,
    hp: spec.hpMax,
    maxHp: spec.hpMax,
    attackT: 0
  });
  updateBars();
  updateSpawnButtons();
  updateHud();
}

function applyDamageToHero(hero, raw) {
  const def = HERO_CLASSES[hero.classKey];
  hero.hp -= raw * (1 - def.armor);
}

function tryPriestHeal(priestHero, delta) {
  const def = HERO_CLASSES.priest;
  priestHero.healT += delta;
  if (priestHero.healT < def.healCd) return;
  priestHero.healT = 0;

  const healR = def.healRangeCells * cellSize;
  let best = null;
  let bestRatio = 1.05;
  for (const ally of heroes) {
    if (ally.hp <= 0 || ally === priestHero) continue;
    const dist = Math.hypot(ally.x - priestHero.x, ally.y - priestHero.y);
    if (dist > healR) continue;
    const ratio = ally.hp / ally.maxHp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = ally;
    }
  }

  if (best) {
    best.hp = Math.min(best.maxHp, best.hp + def.healAmount);
  }
}

function moveToward(unit, tx, ty, speed, delta, radius) {
  const dx = tx - unit.x;
  const dy = ty - unit.y;
  const len = Math.hypot(dx, dy) || 1;
  const step = speed * delta;
  if (len <= step) {
    unit.x = tx;
    unit.y = ty;
  } else {
    unit.x += (dx / len) * step;
    unit.y += (dy / len) * step;
  }
  const clamped = clampToPath(unit.x, unit.y, radius);
  unit.x = clamped.x;
  unit.y = clamped.y;
}

function updateHero(p, delta) {
  const def = HERO_CLASSES[p.classKey];
  const reachLair = p.x <= pathX + cellSize * 0.35;

  if (p.classKey === "priest") {
    tryPriestHeal(p, delta);
  }

  if (reachLair) {
    p.x = pathX + cellSize * 0.35;
    lairHp -= WORLD.lairTouchDps * delta;
    p.attackT = 0;
    return;
  }

  p.attackT += delta;
  const { unit: foe, dist } = nearestTroopFrom(p.x, p.y);
  const rangePx = foe
    ? heroRangePx(def) + def.radius + TROOP_TYPES[foe.key].radius
    : heroRangePx(def) + def.radius;

  if (foe && dist <= rangePx) {
    if (p.attackT >= def.attackCd) {
      p.attackT = 0;
      foe.hp -= def.damage;
    }
    return;
  }

  if (foe) {
    const dx = foe.x - p.x;
    const dy = foe.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const step = Math.min(def.speed * delta, Math.max(0, dist - rangePx));
    if (step > 0) {
      p.x += (dx / len) * step;
      p.y += (dy / len) * step;
    }
    const c = clampToPath(p.x, p.y, def.radius);
    p.x = c.x;
    p.y = c.y;
    return;
  }

  const advanceX = pathX + cellSize * 0.55;
  if (p.x > advanceX) {
    p.x -= def.speed * delta;
  }
  p.y += (pathY + pathPixelH / 2 - p.y) * 0.9 * delta;
  const c2 = clampToPath(p.x, p.y, def.radius);
  p.x = c2.x;
  p.y = c2.y;
}

function updateTroop(u, delta) {
  const spec = TROOP_TYPES[u.key];
  u.attackT += delta;

  const { unit: hero, dist } = nearestHeroFrom(u.x, u.y);
  if (!hero) {
    u.x += spec.speed * delta;
    if (u.x > pathX + pathPixelW + 60) u.hp = 0;
    return;
  }

  const def = HERO_CLASSES[hero.classKey];
  const rangePx = troopRangePx(spec) + spec.radius + def.radius;

  if (dist <= rangePx) {
    if (u.attackT >= spec.attackCd) {
      u.attackT = 0;
      applyDamageToHero(hero, spec.damage);
    }
    return;
  }

  moveToward(u, hero.x, hero.y, spec.speed, delta, spec.radius);
}

function update(delta) {
  if (!started) return;

  if (!gameOver) {
    layoutPath();
    mana = Math.min(WORLD.manaMax, mana + WORLD.manaRegen * delta);

    heroes.forEach((h) => {
      if (h.hp > 0) updateHero(h, delta);
    });

    troops.forEach((u) => {
      if (u.hp > 0) updateTroop(u, delta);
    });

    troops = troops.filter((u) => u.hp > 0);

    updateBars();
    updateHud();
    updateSpawnButtons();

    if (lairHp <= 0) {
      lairHp = 0;
      gameOver = true;
      victory = false;
      statusEl.textContent = "The lair has fallen — Space to retry";
    } else if (heroes.every((h) => h.hp <= 0)) {
      gameOver = true;
      victory = true;
      statusEl.textContent = "Invaders repelled! Space to play again";
    }
  }
}

function updateBars() {
  manaTextEl.textContent = `${Math.floor(mana)} / ${WORLD.manaMax}`;
  manaFillEl.style.transform = `scaleX(${mana / WORLD.manaMax})`;

  lairTextEl.textContent = `${Math.max(0, Math.floor(lairHp))} / ${WORLD.lairMaxHp}`;
  lairFillEl.style.transform = `scaleX(${Math.max(0, lairHp) / WORLD.lairMaxHp})`;
}

function updateHud() {
  const alive = heroes.filter((h) => h.hp > 0).length;
  heroesLeftEl.textContent = `Invaders: ${alive}`;
  troopsOutEl.textContent = `Monsters: ${troops.filter((t) => t.hp > 0).length}`;
  spawnRowEl.textContent = String(spawnRow + 1);
}

function updateSpawnButtons() {
  document.querySelectorAll(".spawn").forEach((btn) => {
    const key = btn.dataset.troop;
    const cost = TROOP_TYPES[key]?.cost ?? 999;
    btn.disabled = !started || gameOver || mana < cost;
  });
}

function drawBackground() {
  ctx.fillStyle = "#0c0812";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const core = lairCorePixel();
  ctx.fillStyle = "rgba(60,35,90,0.5)";
  ctx.fillRect(0, 0, pathX + 8, canvas.height);

  ctx.fillStyle = "#3a2060";
  ctx.beginPath();
  ctx.arc(core.x, core.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,200,255,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "11px sans-serif";
  ctx.fillText("LAIR", core.x - 16, core.y - 42);

  layoutPath();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  for (let cx = 0; cx <= GRID_W; cx += 1) {
    const x = pathX + cx * cellSize;
    ctx.beginPath();
    ctx.moveTo(x, pathY);
    ctx.lineTo(x, pathY + pathPixelH);
    ctx.stroke();
  }
  for (let cy = 0; cy <= GRID_H; cy += 1) {
    const y = pathY + cy * cellSize;
    ctx.beginPath();
    ctx.moveTo(pathX, y);
    ctx.lineTo(pathX + pathPixelW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(120,200,255,0.12)";
  for (let row = 0; row < GRID_H; row += 1) {
    ctx.fillRect(pathX, pathY + row * cellSize, cellSize * 2, cellSize);
  }

  ctx.fillStyle = "rgba(255, 200, 120, 0.18)";
  ctx.fillRect(pathX, pathY + spawnRow * cellSize, cellSize * 2, cellSize);
}

function drawUnitCircle(x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawHealthBar(x, y, w, ratio, fill, bg) {
  const bw = w;
  const bh = 5;
  ctx.fillStyle = bg;
  ctx.fillRect(x - bw / 2, y, bw, bh);
  ctx.fillStyle = fill;
  ctx.fillRect(x - bw / 2, y, bw * clamp(ratio, 0, 1));
}

function drawTroop(u) {
  const spec = TROOP_TYPES[u.key];
  drawUnitCircle(u.x, u.y, spec.radius, spec.color, "rgba(0,0,0,0.35)");
  drawHealthBar(u.x, u.y - spec.radius - 9, 34, u.hp / u.maxHp, "#5cff8a", "rgba(0,0,0,0.5)");
}

function drawHero(h) {
  if (h.hp <= 0) return;
  const def = HERO_CLASSES[h.classKey];
  drawUnitCircle(h.x, h.y, def.radius, def.plate, "rgba(255,255,255,0.25)");
  drawUnitCircle(h.x, h.y, def.radius * 0.72, def.color, null);
  drawHealthBar(h.x, h.y - def.radius - 10, 44, h.hp / h.maxHp, "#6ec8ff", "rgba(0,0,0,0.55)");

  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.font = "10px sans-serif";
  const label = def.short;
  ctx.fillText(label, h.x - ctx.measureText(label).width / 2, h.y + def.radius + 14);
}

function draw() {
  drawBackground();
  troops.forEach(drawTroop);
  heroes.forEach(drawHero);

  if (!started) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f4ebff";
    ctx.font = "18px sans-serif";
    ctx.fillText("Space — Enter the Lair", canvas.width / 2 - 112, canvas.height / 2);
  } else if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function canvasMouseToGrid(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = ((clientX - rect.left) / rect.width) * canvas.width;
  const sy = ((clientY - rect.top) / rect.height) * canvas.height;
  layoutPath();
  const gx = (sx - pathX) / cellSize;
  const gy = (sy - pathY) / cellSize;
  return { gx, gy, sx, sy };
}

function gameLoop(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.06);
  lastTime = now;
  update(delta);
  draw();
  requestAnimationFrame(gameLoop);
}

document.querySelectorAll(".spawn").forEach((btn) => {
  btn.addEventListener("click", () => trySpawnTroop(btn.dataset.troop));
});

canvas.addEventListener("pointerdown", (e) => {
  const { gx, gy } = canvasMouseToGrid(e.clientX, e.clientY);
  if (gx >= 0 && gx < 2 && gy >= 0 && gy < GRID_H) {
    spawnRow = clamp(Math.floor(gy), 0, GRID_H - 1);
    updateHud();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!started || gameOver) startGame();
  }
});

window.addEventListener("resize", () => {
  layoutPath();
});

resetGame();
layoutPath();
statusEl.textContent = "Press Space to defend the Lair";
updateSpawnButtons();
requestAnimationFrame(gameLoop);
