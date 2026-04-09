const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const timeEl = document.getElementById("time");
const hpEl = document.getElementById("hp");
const levelEl = document.getElementById("level");
const killsEl = document.getElementById("kills");
const statusEl = document.getElementById("status");

const keys = new Set();

const WORLD = {
  playerSpeed: 250,
  enemySpeedBase: 66,
  enemySpawnMs: 880,
  fireRateMs: 300,
  bulletSpeed: 530,
  touchDamagePerSecond: 30
};

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  r: 16,
  hp: 100,
  maxHp: 100,
  level: 1,
  xp: 0,
  xpNeed: 10
};

let started = false;
let gameOver = false;
let elapsed = 0;
let kills = 0;
let enemies = [];
let bullets = [];
let souls = [];
let spawnTimer = 0;
let fireTimer = 0;
let lastTime = performance.now();

function resetGame() {
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.hp = 100;
  player.maxHp = 100;
  player.level = 1;
  player.xp = 0;
  player.xpNeed = 10;
  elapsed = 0;
  kills = 0;
  enemies = [];
  bullets = [];
  souls = [];
  spawnTimer = 0;
  fireTimer = 0;
  gameOver = false;
  updateHud();
}

function startGame() {
  resetGame();
  started = true;
  statusEl.textContent = "";
}

function update(delta) {
  if (!started || gameOver) return;

  elapsed += delta;
  spawnTimer += delta * 1000;
  fireTimer += delta * 1000;

  const move = getMove();
  player.x += move.x * WORLD.playerSpeed * delta;
  player.y += move.y * WORLD.playerSpeed * delta;
  player.x = clamp(player.x, player.r, canvas.width - player.r);
  player.y = clamp(player.y, player.r, canvas.height - player.r);

  const interval = Math.max(230, WORLD.enemySpawnMs - elapsed * 11);
  while (spawnTimer >= interval) {
    spawnEnemy();
    spawnTimer -= interval;
  }

  if (fireTimer >= WORLD.fireRateMs) {
    shootNearest();
    fireTimer = 0;
  }

  const enemySpeed = WORLD.enemySpeedBase + elapsed * 1.3;
  enemies.forEach((enemy) => {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / d) * enemySpeed * delta;
    enemy.y += (dy / d) * enemySpeed * delta;
    if (d < player.r + enemy.r) {
      player.hp -= WORLD.touchDamagePerSecond * delta;
    }
  });

  bullets.forEach((b) => {
    b.x += b.vx * delta;
    b.y += b.vy * delta;
  });
  bullets = bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < canvas.width + 30 && b.y > -30 && b.y < canvas.height + 30);

  resolveHits();
  collectSouls();
  updateHud();

  if (player.hp <= 0) {
    player.hp = 0;
    gameOver = true;
    statusEl.textContent = `Defeated after ${Math.floor(elapsed)}s - Press Space to restart`;
    updateHud();
  }
}

function resolveHits() {
  const survivors = [];

  for (const enemy of enemies) {
    let alive = true;
    for (const b of bullets) {
      if (distance(enemy.x, enemy.y, b.x, b.y) <= enemy.r + b.r) {
        enemy.hp -= b.damage;
        b.life -= 1;
      }
    }

    if (enemy.hp <= 0) {
      alive = false;
      kills += 1;
      souls.push({ x: enemy.x, y: enemy.y, r: 5, value: 1 });
    }

    if (alive) survivors.push(enemy);
  }

  enemies = survivors;
}

function collectSouls() {
  souls = souls.filter((soul) => {
    const pickupRange = player.r + soul.r + 7;
    if (distance(player.x, player.y, soul.x, soul.y) <= pickupRange) {
      gainXp(soul.value);
      return false;
    }
    return true;
  });
}

function gainXp(amount) {
  player.xp += amount;
  while (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level += 1;
    player.xpNeed = Math.floor(player.xpNeed * 1.3);
    player.maxHp += 7;
    player.hp = Math.min(player.maxHp, player.hp + 14);
  }
}

function shootNearest() {
  if (enemies.length === 0) return;

  let target = enemies[0];
  let best = distance(player.x, player.y, target.x, target.y);
  for (const e of enemies) {
    const d = distance(player.x, player.y, e.x, e.y);
    if (d < best) {
      best = d;
      target = e;
    }
  }

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const len = Math.hypot(dx, dy) || 1;

  bullets.push({
    x: player.x,
    y: player.y,
    vx: (dx / len) * WORLD.bulletSpeed,
    vy: (dy / len) * WORLD.bulletSpeed,
    r: 4,
    life: 1,
    damage: 1 + (player.level - 1) * 0.25
  });
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  const pad = 24;
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = randomRange(0, canvas.width);
    y = -pad;
  } else if (edge === 1) {
    x = canvas.width + pad;
    y = randomRange(0, canvas.height);
  } else if (edge === 2) {
    x = randomRange(0, canvas.width);
    y = canvas.height + pad;
  } else {
    x = -pad;
    y = randomRange(0, canvas.height);
  }

  enemies.push({
    x,
    y,
    r: 14,
    hp: 2 + elapsed * 0.025
  });
}

function getMove() {
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  const up = keys.has("KeyW") || keys.has("ArrowUp");
  const down = keys.has("KeyS") || keys.has("ArrowDown");
  let x = (right ? 1 : 0) - (left ? 1 : 0);
  let y = (down ? 1 : 0) - (up ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  x /= len;
  y /= len;
  return { x, y };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFloor();
  drawSouls();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawXpBar();
}

function drawFloor() {
  ctx.fillStyle = "#1d1126";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.fillStyle = "#8df0ff";
  circle(player.x, player.y, player.r);
  ctx.fillStyle = "#ffffff";
  circle(player.x - 5, player.y - 4, 3);
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    ctx.fillStyle = "#f15e7f";
    circle(enemy.x, enemy.y, enemy.r);
    ctx.fillStyle = "#8a2a43";
    circle(enemy.x + 2, enemy.y + 2, enemy.r * 0.35);
  });
}

function drawBullets() {
  bullets.forEach((b) => {
    ctx.fillStyle = "#ffe48a";
    circle(b.x, b.y, b.r);
  });
}

function drawSouls() {
  souls.forEach((soul) => {
    ctx.fillStyle = "#7dffad";
    circle(soul.x, soul.y, soul.r);
  });
}

function drawXpBar() {
  const w = 240;
  const h = 12;
  const x = canvas.width - w - 14;
  const y = 14;
  const fill = player.xpNeed > 0 ? player.xp / player.xpNeed : 0;
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#7dffad";
  ctx.fillRect(x, y, w * fill, h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.strokeRect(x, y, w, h);
}

function updateHud() {
  timeEl.textContent = `Time: ${Math.floor(elapsed)}s`;
  hpEl.textContent = `HP: ${Math.max(0, Math.floor(player.hp))}`;
  levelEl.textContent = `Level: ${player.level}`;
  killsEl.textContent = `Kills: ${kills}`;
}

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function gameLoop(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(delta);
  draw();
  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space") {
    e.preventDefault();
    if (!started || gameOver) startGame();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

updateHud();
requestAnimationFrame(gameLoop);
