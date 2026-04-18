const GRID_SIZE = 18;
const START_LENGTH = 3;
const INITIAL_SPEED = 170;
const MIN_SPEED = 85;
const SPEED_STEP = 4;
const SPLASH_DURATION = 6500;
const LEADERBOARD_LIMIT = 7;

const COLORS = {
  boardLight: "#aad751",
  boardDark: "#a2d149",
  apple: "#e53935",
  eye: "#f7ffe9",
  stem: "#5d7f27",
};

const SKINS = {
  green: {
    head: "#3f7d20",
    body: "#5fa837",
    name: "Green",
  },
  blue: {
    head: "#2268c7",
    body: "#49a2ff",
    name: "Blue",
  },
  gold: {
    head: "#d69d12",
    body: "#f2cf57",
    name: "Gold",
  },
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreNode = document.getElementById("score");
const bestNode = document.getElementById("best");
const hintNode = document.getElementById("hintText");
const rankMessageNode = document.getElementById("rankMessage");
const leaderboardListNode = document.getElementById("leaderboardList");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const clearBoardButton = document.getElementById("clearBoardButton");
const controlButtons = document.querySelectorAll(".control");
const splashScreen = document.getElementById("splashScreen");

let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let apple = null;
let score = 0;
let best = Number(localStorage.getItem("snake-best") || "0");
let unlockedSkin = localStorage.getItem("snake-skin") || "green";
let leaderboard = loadLeaderboard();
let speed = INITIAL_SPEED;
let running = false;
let timerId = null;
let touchStart = null;
let swipeLocked = false;
let audioCtx = null;
let musicTimerId = null;
let musicStep = 0;

bestNode.textContent = String(best);
ensureSkinConsistency();
updateHint();
renderLeaderboard();

function resetGame() {
  cancelTick();
  stopMusic();
  const center = Math.floor(GRID_SIZE / 2);
  snake = Array.from({ length: START_LENGTH }, (_, index) => ({
    x: center - index,
    y: center,
  }));
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  speed = INITIAL_SPEED;
  running = false;
  spawnApple();
  updateScore();
  draw();
}

function startGame() {
  if (running) {
    return;
  }
  initAudio();
  resumeAudioContext();
  running = true;
  hideOverlay();
  startMusic();
  scheduleTick();
}

function restartGame() {
  resetGame();
  showOverlay("Snake", "Eat apples, grow longer and stay away from walls.", "Play");
}

function scheduleTick() {
  cancelTick();
  timerId = window.setTimeout(tick, speed);
}

function cancelTick() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

function spawnApple() {
  const free = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) {
        free.push({ x, y });
      }
    }
  }
  apple = free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function updateScore() {
  scoreNode.textContent = String(score);
  if (score > best) {
    best = score;
    bestNode.textContent = String(best);
    localStorage.setItem("snake-best", String(best));
    unlockSkinFromBest();
  }
}

function ensureSkinConsistency() {
  if (!SKINS[unlockedSkin]) {
    unlockedSkin = "green";
  }

  if (best >= 50) {
    unlockedSkin = "gold";
  } else if (best >= 20 && unlockedSkin === "green") {
    unlockedSkin = "blue";
  }

  localStorage.setItem("snake-skin", unlockedSkin);
}

function unlockSkinFromBest() {
  const previousSkin = unlockedSkin;

  if (best >= 50) {
    unlockedSkin = "gold";
  } else if (best >= 20) {
    unlockedSkin = "blue";
  }

  if (unlockedSkin !== previousSkin) {
    localStorage.setItem("snake-skin", unlockedSkin);
    updateHint();
    showOverlay(
      `${SKINS[unlockedSkin].name} Skin Unlocked`,
      `Your best score reached ${best}. This skin is now permanent.`,
      "Play"
    );
  }
}

function updateHint() {
  hintNode.textContent = `Swipe on the field or use the buttons below. Skin: ${SKINS[unlockedSkin].name}`;
}

function setDirection(newDir) {
  const isReverse = newDir.x === -direction.x && newDir.y === -direction.y;
  if (!isReverse) {
    nextDirection = newDir;
  }
}

function tick() {
  if (!running) {
    return;
  }

  direction = nextDirection;
  const head = snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  const hitWall =
    newHead.x < 0 ||
    newHead.y < 0 ||
    newHead.x >= GRID_SIZE ||
    newHead.y >= GRID_SIZE;

  const hitSelf = snake.slice(0, -1).some((part) => part.x === newHead.x && part.y === newHead.y);

  if (hitWall || hitSelf) {
    gameOver();
    return;
  }

  snake.unshift(newHead);

  if (apple && newHead.x === apple.x && newHead.y === apple.y) {
    score += 1;
    speed = Math.max(MIN_DELAY_SAFE(), speed - SPEED_STEP);
    playEatSound();
    updateScore();
    spawnApple();
    if (!apple) {
      winGame();
      return;
    }
  } else {
    snake.pop();
  }

  draw();
  scheduleTick();
}

function MIN_DELAY_SAFE() {
  return MIN_SPEED;
}

function finishRound(title, text, buttonText) {
  running = false;
  cancelTick();
  stopMusic();
  const place = updateLeaderboard(score);
  draw();
  if (place > 0) {
    rankMessageNode.textContent = `You took place #${place} with ${score} points`;
  } else {
    rankMessageNode.textContent = `Your score is ${score}. Beat the table to enter top ${LEADERBOARD_LIMIT}`;
  }
  showOverlay(title, text, buttonText);
}

function gameOver() {
  finishRound("Game Over", `Final score: ${score}`, "Play Again");
}

function winGame() {
  finishRound("Victory!", `You filled the whole field and scored ${score}.`, "Play Again");
}

function showOverlay(title, text, buttonText) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function drawBoard(cellSize) {
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.boardLight : COLORS.boardDark;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

function drawApple(cellSize) {
  if (!apple) {
    return;
  }

  const pad = cellSize * 0.18;
  const ax = apple.x * cellSize + pad;
  const ay = apple.y * cellSize + pad * 1.2;
  const size = cellSize - pad * 2;

  ctx.fillStyle = COLORS.apple;
  ctx.beginPath();
  ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = COLORS.stem;
  ctx.lineWidth = Math.max(2, cellSize * 0.08);
  ctx.beginPath();
  ctx.moveTo(ax + size * 0.55, ay + size * 0.15);
  ctx.lineTo(ax + size * 0.7, ay - size * 0.15);
  ctx.stroke();
}

function getEyeOffsets(cellSize) {
  if (direction.x === 1) {
    return [
      [cellSize * 0.62, cellSize * 0.28],
      [cellSize * 0.62, cellSize * 0.62],
    ];
  }
  if (direction.x === -1) {
    return [
      [cellSize * 0.22, cellSize * 0.28],
      [cellSize * 0.22, cellSize * 0.62],
    ];
  }
  if (direction.y === -1) {
    return [
      [cellSize * 0.28, cellSize * 0.22],
      [cellSize * 0.62, cellSize * 0.22],
    ];
  }
  return [
    [cellSize * 0.28, cellSize * 0.62],
    [cellSize * 0.62, cellSize * 0.62],
  ];
}

function drawSnake(cellSize) {
  const skin = SKINS[unlockedSkin];

  snake.forEach((part, index) => {
    const pad = cellSize * 0.08;
    const x = part.x * cellSize + pad;
    const y = part.y * cellSize + pad;
    const size = cellSize - pad * 2;

    ctx.fillStyle = index === 0 ? skin.head : skin.body;
    roundRect(ctx, x, y, size, size, cellSize * 0.18);
    ctx.fill();

    if (index === 0) {
      const eyeSize = Math.max(3, cellSize * 0.12);
      ctx.fillStyle = COLORS.eye;
      for (const [ox, oy] of getEyeOffsets(cellSize)) {
        ctx.beginPath();
        ctx.arc(part.x * cellSize + ox, part.y * cellSize + oy, eyeSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function draw() {
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const cellSize = size / GRID_SIZE;
  drawBoard(cellSize);
  drawApple(cellSize);
  drawSnake(cellSize);
}

function directionFromName(name) {
  switch (name) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

function handleSwipe(endPoint) {
  if (!touchStart) {
    return;
  }

  const dx = endPoint.x - touchStart.x;
  const dy = endPoint.y - touchStart.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < 24) {
    return;
  }

  swipeLocked = true;

  if (absX > absY) {
    setDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    setDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }

  if (!running) {
    startGame();
  }
}

function hideSplash() {
  window.setTimeout(() => {
    splashScreen.classList.add("hidden");
  }, SPLASH_DURATION);
}

function initAudio() {
  if (audioCtx) {
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }
  audioCtx = new AudioContextClass();
}

function resumeAudioContext() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playTone(frequency, duration, volume, type, when = 0) {
  if (!audioCtx) {
    return;
  }

  const startAt = audioCtx.currentTime + when;
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.04);
}

function playEatSound() {
  resumeAudioContext();
  playTone(740, 0.08, 0.03, "square");
  playTone(980, 0.12, 0.02, "triangle", 0.04);
}

function scheduleMusicLoop() {
  if (!running || !audioCtx) {
    return;
  }

  const melody = [262, 330, 392, 330, 294, 349, 440, 349];
  const bass = [131, 165, 196, 147];
  playTone(melody[musicStep % melody.length], 0.24, 0.012, "triangle");
  playTone(bass[musicStep % bass.length], 0.34, 0.005, "sine", 0.03);
  musicStep += 1;
  musicTimerId = window.setTimeout(scheduleMusicLoop, 380);
}

function startMusic() {
  resumeAudioContext();
  stopMusic();
  musicStep = 0;
  scheduleMusicLoop();
}

function stopMusic() {
  if (musicTimerId !== null) {
    clearTimeout(musicTimerId);
    musicTimerId = null;
  }
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem("snake-leaderboard");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLeaderboard() {
  localStorage.setItem("snake-leaderboard", JSON.stringify(leaderboard));
}

function updateLeaderboard(value) {
  if (value <= 0) {
    renderLeaderboard();
    return -1;
  }

  leaderboard.push({
    score: value,
    skin: SKINS[unlockedSkin].name,
    time: new Date().toLocaleDateString(),
  });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, LEADERBOARD_LIMIT);
  saveLeaderboard();
  renderLeaderboard();

  return leaderboard.findIndex((entry) => entry.score === value && entry.time) + 1;
}

function renderLeaderboard() {
  if (!leaderboard.length) {
    leaderboardListNode.innerHTML = '<li class="leaderboard-item"><span class="leaderboard-place">-</span><div><div class="leaderboard-score">No scores yet</div><div class="rank-line">Your best rounds will appear here</div></div><span class="rank-line">start</span></li>';
    return;
  }

  leaderboardListNode.innerHTML = leaderboard
    .map((entry, index) => `
      <li class="leaderboard-item">
        <span class="leaderboard-place">${index + 1}</span>
        <div>
          <div class="leaderboard-score">${entry.score}</div>
          <div class="rank-line">${entry.skin} skin</div>
        </div>
        <span class="rank-line">${entry.time}</span>
      </li>
    `)
    .join("");
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", restartGame);
clearBoardButton.addEventListener("click", () => {
  leaderboard = [];
  saveLeaderboard();
  rankMessageNode.textContent = "Leaderboard cleared";
  renderLeaderboard();
});

controlButtons.forEach((button) => {
  button.addEventListener("click", () => {
    initAudio();
    resumeAudioContext();
    setDirection(directionFromName(button.dataset.dir));
    if (!running) {
      startGame();
    }
  });
});

window.addEventListener("keydown", (event) => {
  const map = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };

  if (event.key.toLowerCase() === "r") {
    restartGame();
    return;
  }

  if (event.key === " ") {
    startGame();
    return;
  }

  if (map[event.key]) {
    event.preventDefault();
    setDirection(map[event.key]);
  }
});

canvas.addEventListener("touchstart", (event) => {
  initAudio();
  resumeAudioContext();
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
  swipeLocked = false;
}, { passive: true });

canvas.addEventListener("touchmove", (event) => {
  if (!touchStart || swipeLocked) {
    return;
  }
  const touch = event.changedTouches[0];
  handleSwipe({ x: touch.clientX, y: touch.clientY });
}, { passive: true });

canvas.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  if (!swipeLocked) {
    handleSwipe({ x: touch.clientX, y: touch.clientY });
  }
  touchStart = null;
  swipeLocked = false;
}, { passive: true });

canvas.addEventListener("touchcancel", () => {
  touchStart = null;
  swipeLocked = false;
}, { passive: true });

canvas.addEventListener("pointerdown", (event) => {
  initAudio();
  resumeAudioContext();
  touchStart = { x: event.clientX, y: event.clientY };
  swipeLocked = false;
});

canvas.addEventListener("pointermove", (event) => {
  if (!touchStart || swipeLocked || event.pointerType === "mouse") {
    return;
  }
  handleSwipe({ x: event.clientX, y: event.clientY });
});

canvas.addEventListener("pointerup", (event) => {
  if (!swipeLocked && event.pointerType !== "mouse") {
    handleSwipe({ x: event.clientX, y: event.clientY });
  }
  touchStart = null;
  swipeLocked = false;
});

window.addEventListener("resize", draw);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

resetGame();
showOverlay("Snake", "Open it on your phone, swipe on the field and play right in the browser.", "Play");
hideSplash();
