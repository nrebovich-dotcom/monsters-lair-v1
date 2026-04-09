const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const manaTextEl = document.getElementById("manaText");
const manaFillEl = document.getElementById("manaFill");
const lairTextEl = document.getElementById("lairText");
const lairFillEl = document.getElementById("lairFill");
const laneNumEl = document.getElementById("laneNum");
const heroesLeftEl = document.getElementById("heroesLeft");
const troopsOutEl = document.getElementById("troopsOut");
const statusEl = document.getElementById("status");

const LANES = 5;
const LAIR_X = 58;
const LAIR_CORE_X = 42;
const INVADER_X = canvas.width - 48;

const WORLD = {
  manaMax: 100,
  manaRegen: 11.5,
  lairMaxHp: 500,
  lairTouchDps: 45
};

const HERO_ORDER = [
  { classKey: "paladin" },
  { classKey: "priest" },
  { classKey: "rogue" },
  { classKey: "mage" },
  { classKey: "warrior" }
];

const HERO_CLASSES = {
  paladin: {
    short: "Paladin",
    maxHp: 410,
    speed: 40,
    damage: 7,
    range: 26,
    attackCd: 0.62,
    armor: 0.36,
    radius: 16,
    color: "#c8b8ff",
    plate: "#5a4a8a"
  },
  priest: {
    short: "Priest",
    maxHp: 125,
    speed: 46,
    damage: 3,
    range: 30,
    attackCd: 0.88,
    armor: 0,
    radius: 14,
    color: "#fff0c8",
    plate: "#d4b87a",
    healAmount: 20,
    healCd: 1.28,
    healRange: 220
  },
  rogue: {
    short: "Rogue",
    maxHp: 92,
    speed: 58,
    damage: 14,
    range: 20,
    attackCd: 0.3,
    armor: 0,
    radius: 13,
    color: "#9ee0c4",
    plate: "#2d5a46"
  },
  mage: {
    short: "Mage",
    maxHp: 82,
    speed: 44,
    damage: 12,
    range: 96,
    attackCd: 0.48,
    armor: 0,
    radius: 13,
    color: "#8ec8ff",
    plate: "#2a5a9e"
  },
  warrior: {
    short: "Warrior",
    maxHp: 210,
    speed: 50,
    damage: 11,
    range: 28,
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
    speed: 70,
    damage: 6,
    range: 19,
    attackCd: 0.4,
    radius: 10,
    color: "#6bff9a"
  },
  brute: {
    cost: 32,
    hpMax: 185,
    speed: 34,
    damage: 10,
    range: 24,
    attackCd: 0.52,
    radius: 14,
    color: "#c9a06a"
  },
  whelp: {
    cost: 48,
    hpMax: 98,
    speed: 54,
    damage: 15,
    range: 40,
    attackCd: 0.46,
    radius: 12,
    color: "#ff7a5c"
  }
};

let heroes = [];
let troops = [];
let mana = WORLD.manaMax;
let lairHp = WORLD.lairMaxHp;
let selectedLane = 0;
let started = false;
let gameOver = false;
let victory = false;
let lastTime = performance.now();

function laneCenterY(lane) {
  const pad = 78;
  const h = canvas.height - pad * 2;
  return pad + (lane / (LANES - 1)) * h;
}

function buildHeroes() {
  return HERO_ORDER.map((row, lane) => {
    const def = HERO_CLASSES[row.classKey];
    return {
      classKey: row.classKey,
      lane,
      x: INVADER_X,
      y: laneCenterY(lane),
      hp: def.maxHp,
      maxHp: def.maxHp,
      attackT: 0,
      healT: 0
    };
  });
}

function resetGame() {
  heroes = buildHeroes();
  troops = [];
  mana = WORLD.manaMax;
  lairHp = WORLD.lairMaxHp;
  selectedLane = 0;
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

function trySpawnTroop(troopKey) {
  if (!started || gameOver) return;
  const spec = TROOP_TYPES[troopKey];
  if (!spec || mana < spec.cost) return;

  mana -= spec.cost;
  troops.push({
    key: troopKey,
    lane: selectedLane,
    x: LAIR_X + 28,
    y: laneCenterY(selectedLane),
    hp: spec.hpMax,
    maxHp: spec.hpMax,
    attackT: 0
  });
  updateBars();
  updateSpawnButtons();
  updateHud();
}

function monstersInLane(lane) {
  return troops.filter((t) => t.lane === lane && t.hp > 0);
}

function frontMonster(lane) {
  const list = monstersInLane(lane);
  if (list.length === 0) return null;
  return list.reduce((a, b) => (a.x > b.x ? a : b));
}

function heroAt(lane) {
  return heroes.find((h) => h.lane === lane && h.hp > 0) || null;
}

function applyDamageToHero(hero, raw) {
  const def = HERO_CLASSES[hero.classKey];
  const mitigated = raw * (1 - def.armor);
  hero.hp -= mitigated;
}

function tryPriestHeal(priestHero, delta) {
  const def = HERO_CLASSES.priest;
  priestHero.healT += delta;
  if (priestHero.healT < def.healCd) return;
  priestHero.healT = 0;

  let best = null;
  let bestRatio = 1.05;
  for (const ally of heroes) {
    if (ally.hp <= 0 || ally === priestHero) continue;
    const dist = Math.hypot(ally.x - priestHero.x, ally.y - priestHero.y);
    if (dist > def.healRange) continue;
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

function updateHero(p, delta) {
  const def = HERO_CLASSES[p.classKey];
  const foe = frontMonster(p.lane);
  const foeR = foe ? TROOP_TYPES[foe.key].radius : 0;

  if (p.classKey === "priest") {
    tryPriestHeal(p, delta);
  }

  if (p.x <= LAIR_CORE_X + def.radius) {
    lairHp -= WORLD.lairTouchDps * delta;
    p.attackT = 0;
    return;
  }

  p.attackT += delta;

  if (!foe) {
    p.x -= def.speed * delta;
    return;
  }

  const reachX = foe.x + def.radius + foeR + def.range;
  if (p.x > reachX) {
    p.x -= def.speed * delta;
    if (p.x < reachX) p.x = reachX;
    return;
  }

  if (p.attackT >= def.attackCd) {
    p.attackT = 0;
    foe.hp -= def.damage;
  }
}

function updateTroop(u, delta) {
  const spec = TROOP_TYPES[u.key];
  const hero = heroAt(u.lane);

  u.attackT += delta;

  if (!hero) {
    u.x += spec.speed * delta;
    if (u.x > canvas.width + 40) u.hp = 0;
    return;
  }

  const def = HERO_CLASSES[hero.classKey];
  const gap = hero.x - u.x;
  const needDist = def.radius + spec.radius + spec.range;

  if (gap > needDist) {
    u.x += spec.speed * delta;
    const maxX = hero.x - def.radius - spec.radius - 2;
    if (u.x > maxX) u.x = maxX;
    return;
  }

  if (u.attackT >= spec.attackCd) {
    u.attackT = 0;
    applyDamageToHero(hero, spec.damage);
  }
}

function update(delta) {
  if (!started) return;

  if (!gameOver) {
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

    const aliveHeroes = heroes.filter((h) => h.hp > 0);
    if (lairHp <= 0) {
      lairHp = 0;
      gameOver = true;
      victory = false;
      statusEl.textContent = "The lair has fallen — Space to retry";
    } else if (aliveHeroes.length === 0) {
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
  laneNumEl.textContent = String(selectedLane + 1);
}

function updateSpawnButtons() {
  document.querySelectorAll(".spawn").forEach((btn) => {
    const key = btn.dataset.troop;
    const cost = TROOP_TYPES[key]?.cost ?? 999;
    const disabled = !started || gameOver || mana < cost;
    btn.disabled = disabled;
  });
}

function drawBackground() {
  ctx.fillStyle = "#120a18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < LANES; i += 1) {
    const y = laneCenterY(i);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(80,40,120,0.35)";
  ctx.fillRect(0, 0, LAIR_X + 70, canvas.height);

  ctx.fillStyle = "#3a2060";
  ctx.beginPath();
  ctx.arc(LAIR_CORE_X, canvas.height / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,200,255,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "11px sans-serif";
  ctx.fillText("LAIR", LAIR_CORE_X - 18, canvas.height / 2 - 44);

  ctx.strokeStyle = "rgba(255,80,80,0.12)";
  ctx.lineWidth = 2;
  for (let x = canvas.width - 40; x > canvas.width - 220; x -= 24) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x - 10, canvas.height - 40);
    ctx.stroke();
  }
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

  ctx.fillStyle = "rgba(0,0,0,0.6)";
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
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.strokeStyle = "rgba(255, 200, 120, 0.55)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(LAIR_X + 18, laneCenterY(selectedLane));
  ctx.lineTo(canvas.width - 18, laneCenterY(selectedLane));
  ctx.stroke();
  ctx.setLineDash([]);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!started || gameOver) startGame();
    return;
  }
  if (e.code === "Digit1") selectedLane = 0;
  if (e.code === "Digit2") selectedLane = 1;
  if (e.code === "Digit3") selectedLane = 2;
  if (e.code === "Digit4") selectedLane = 3;
  if (e.code === "Digit5") selectedLane = 4;
  if (/^Digit[1-5]$/.test(e.code)) {
    updateHud();
  }
});

resetGame();
statusEl.textContent = "Press Space to defend the Lair";
updateSpawnButtons();
requestAnimationFrame(gameLoop);
