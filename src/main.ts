import createButton from "./buttons";
import Leaderboard from "./leaderboardSystem";
import notifier from "./notifier";
import "./style.css";
import Two from "two.js";

let mode = (new URL(window.location.href).searchParams.get("mode") ||
  "easy") as "easy" | "hard";

const LDBoard = Leaderboard({
  getGameRunning() {
    return gameRunning;
  },
  kvAPIKey: mode == "hard" ? "jungle-hard" : "jungle-easy",
  notifier: notifier,
});

(window as any).lb = LDBoard;

const container = document.getElementById("container")!;
const scoreElement = document.getElementById("score")!;
const gameOverElement = document.getElementById("game-over")!;
const finalScoreElement = document.getElementById("final-score")!;
const restartBtn = document.getElementById("restart-btn")!;

// Two.js setup with fixed game dimensions
const GAME_WIDTH = 600;
const GAME_HEIGHT = 800;

const params = {
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  autostart: false, // Disable autostart, we'll use manual loop
};
const two = new Two(params).appendTo(container);

// Scale to fit screen while maintaining aspect ratio
function resizeGame() {
  const scaleX = window.innerWidth / GAME_WIDTH;
  const scaleY = window.innerHeight / GAME_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = "top left";
  container.style.left = `${(window.innerWidth - GAME_WIDTH * scale) / 2}px`;
  container.style.top = `${(window.innerHeight - GAME_HEIGHT * scale) / 2}px`;
}

window.addEventListener("resize", resizeGame);
resizeGame();

// Game constants
const PLAYER_SIZE = 30;
const PLATFORM_WIDTH = mode == "hard" ? 40 : 80;
const PLATFORM_HEIGHT = 15;
const PLAYER_SPEED_X = mode == "hard" ? 10000 : 18; // Horizontal speed (2x)
const GRAVITY = mode == "hard" ? 2.75 : 1.0; // Gravity (2x)
const JUMP_FORCE = mode == "hard" ? -40 : -30; // Jump force (2x)
const PLATFORM_SPAWN_INTERVAL = mode == "hard" ? 240 : 120; // pixels between platforms
const INITIAL_PLATFORMS = 8;
const BEDROCK_THRESHOLD = -500; // Player must reach this Y before bedrock disappears

// Game state
let gameRunning = false;
let score = 0;
let mouseX = GAME_WIDTH / 2;

// Player
interface Player {
  shape: any;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

// Platform
interface Platform {
  shape: any;
  x: number;
  y: number;
  used: boolean;
  isBedrock?: boolean;
}

let player: Player;
let platforms: Platform[] = [];
let cameraOffsetY = 0;
let highestPlatformY = 0;
let startingY = 0;
let bedrockPlatform: Platform | null = null;
let gameStartTime = 0;
let lastBouncedPlatform: Platform | null = null;

// Initialize game
function initGame() {
  // Clear existing objects
  two.clear();
  platforms = [];
  score = 0;
  cameraOffsetY = 0;
  highestPlatformY = GAME_HEIGHT - 100;
  gameRunning = true;
  gameStartTime = Date.now();
  lastBouncedPlatform = null;

  scoreElement.textContent = `Score: ${score}`;
  gameOverElement.style.display = "none";

  // Create player
  const playerShape = two.makeCircle(
    GAME_WIDTH / 2,
    GAME_HEIGHT - 150,
    PLAYER_SIZE
  );
  playerShape.fill = "#4CAF50";
  playerShape.stroke = "#2E7D32";
  playerShape.linewidth = 3;

  player = {
    shape: playerShape,
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT - 150,
    velocityX: 0,
    velocityY: 0,
  };

  // Create initial platforms
  for (let i = 0; i < INITIAL_PLATFORMS; i++) {
    const platformY =
      GAME_HEIGHT -
      50 -
      i * (PLATFORM_SPAWN_INTERVAL + (mode == "hard" ? 0 : score / 10));
    createPlatform(platformY);
  }

  highestPlatformY =
    GAME_HEIGHT -
    50 -
    (INITIAL_PLATFORMS - 1) *
      (PLATFORM_SPAWN_INTERVAL + (mode == "hard" ? 0 : score / 10));

  // Create bedrock platform at the bottom
  startingY = player.y;
  const bedrockY = GAME_HEIGHT - 10; // Just at the bottom of screen
  const bedrockShape = two.makeRectangle(
    GAME_WIDTH / 2,
    bedrockY,
    GAME_WIDTH,
    PLATFORM_HEIGHT * 2
  );
  bedrockShape.fill = "#424242";
  bedrockShape.stroke = "#212121";
  bedrockShape.linewidth = 4;

  bedrockPlatform = {
    shape: bedrockShape,
    x: two.width / 2,
    y: bedrockY,
    used: false,
    isBedrock: true,
  };
  platforms.push(bedrockPlatform);
}

// Create platform
function createPlatform(y: number) {
  const x = Math.random() * (GAME_WIDTH - PLATFORM_WIDTH - 40) + 20;

  const platformShape = two.makeRectangle(
    x,
    y,
    PLATFORM_WIDTH,
    PLATFORM_HEIGHT
  );
  platformShape.fill = "#FF9800";
  platformShape.stroke = "#F57C00";
  platformShape.linewidth = 2;

  platforms.push({
    shape: platformShape,
    x: x,
    y: y,
    used: false,
  });
}

// Check collision (only when falling down)
function checkCollision(player: Player, platform: Platform): boolean {
  if (platform.used && !platform.isBedrock) return false;
  if (player.velocityY <= 0) return false; // Only check when falling

  const playerBottom = player.y + PLAYER_SIZE;
  const playerTop = player.y - PLAYER_SIZE;
  const playerLeft = player.x - PLAYER_SIZE;
  const playerRight = player.x + PLAYER_SIZE;

  // Bedrock uses full width
  if (platform.isBedrock) {
    const platformTop = platform.y - (PLATFORM_HEIGHT * 2) / 2;
    const platformBottom = platform.y + (PLATFORM_HEIGHT * 2) / 2;

    // Check if player is crossing or on the platform
    return playerBottom >= platformTop && playerTop <= platformBottom;
  }

  // Regular platforms
  const platformTop = platform.y - PLATFORM_HEIGHT / 2;
  const platformLeft = platform.x - PLATFORM_WIDTH / 2;
  const platformRight = platform.x + PLATFORM_WIDTH / 2;

  // Check if player is landing on platform from above (more lenient)
  // Player's bottom should be near or past platform top
  const isAbovePlatform = playerBottom >= platformTop;
  const isBelowPlatformTop = playerTop <= platformTop + PLATFORM_HEIGHT;
  const isHorizontallyAligned =
    playerRight >= platformLeft && playerLeft <= platformRight;

  return isAbovePlatform && isBelowPlatformTop && isHorizontallyAligned;
}

// Update game
function update() {
  if (!gameRunning) return;

  // Apply gravity
  player.velocityY += GRAVITY;

  // Move player horizontally towards mouse
  const dx = mouseX - player.x;
  const absDx = Math.abs(dx);

  if (absDx > PLAYER_SPEED_X) {
    player.velocityX = (dx / absDx) * PLAYER_SPEED_X;
  } else {
    player.velocityX = dx;
  }

  // Update position
  player.x += player.velocityX;
  player.y += player.velocityY;

  // Keep player within bounds (horizontal)
  if (player.x - PLAYER_SIZE < 0) {
    player.x = PLAYER_SIZE;
    player.velocityX = 0;
  }
  if (player.x + PLAYER_SIZE > GAME_WIDTH) {
    player.x = GAME_WIDTH - PLAYER_SIZE;
    player.velocityX = 0;
  }

  // Check platform collisions
  for (let platform of platforms) {
    if (checkCollision(player, platform)) {
      // Only mark as used if we actually bounce (different from last platform)
      if (!platform.isBedrock && platform !== lastBouncedPlatform) {
        platform.used = true;
        platform.shape.fill = "#BDBDBD"; // Gray out used platform

        // Add score
        score += 10;
        scoreElement.textContent = `Score: ${score}`;

        lastBouncedPlatform = platform;
      }

      // Bounce!
      player.velocityY = JUMP_FORCE;
      player.y = platform.y - PLATFORM_HEIGHT / 2 - PLAYER_SIZE;

      break; // Only collide with one platform per frame
    }
  }

  // Remove bedrock when player has risen enough
  if (bedrockPlatform && player.y < startingY + BEDROCK_THRESHOLD) {
    two.remove(bedrockPlatform.shape);
    platforms = platforms.filter((p) => p !== bedrockPlatform);
    bedrockPlatform = null;
  }

  // Camera follow player (when player goes up)
  const targetCameraY = player.y - GAME_HEIGHT * 0.6;
  if (targetCameraY < cameraOffsetY) {
    cameraOffsetY = targetCameraY;
  }

  // Update player visual position
  player.shape.translation.set(player.x, player.y - cameraOffsetY);

  // Update platforms and remove off-screen ones
  platforms = platforms.filter((platform) => {
    const visualY = platform.y - cameraOffsetY;
    platform.shape.translation.set(platform.x, visualY);

    // Keep bedrock at bottom of screen
    if (platform.isBedrock) {
      const bedrockY = GAME_HEIGHT - 10;
      platform.shape.translation.set(platform.x, bedrockY);
      platform.y = bedrockY + cameraOffsetY;
      return true;
    }

    // Remove platforms that are too far below
    if (visualY > GAME_HEIGHT + 100) {
      two.remove(platform.shape);
      return false;
    }

    // Remove used platforms immediately
    if (platform.used) {
      two.remove(platform.shape);
      return false;
    }

    return true;
  });

  // Spawn new platforms
  while (
    highestPlatformY - cameraOffsetY >
    -(PLATFORM_SPAWN_INTERVAL + (mode == "hard" ? 0 : score / 10))
  ) {
    highestPlatformY -=
      PLATFORM_SPAWN_INTERVAL + (mode == "hard" ? 0 : score / 10);
    createPlatform(highestPlatformY);
  }

  // Check game over (player falls below screen)
  if (player.y - cameraOffsetY > GAME_HEIGHT) {
    gameOver();
  }
}

// Name prompt function
const namePrompt = (): string | null => {
  // allow only english in lowercase, numbers, _, -
  const name = prompt(
    "이름을 입력하세요 (영어 소문자, 숫자, _, - 만 가능, 최대 10자)"
  );
  if (!name) return null;
  if (name.length > 10) {
    alert("이름이 너무 깁니다. 최대 10자까지 가능합니다.");
    return namePrompt();
  }
  if (!/^[a-z0-9_-]+$/.test(name)) {
    alert("이름에 허용되지 않는 문자가 포함되어 있습니다.");
    return namePrompt();
  }
  return name;
};

let nm: string | null = null;
// Game over
function gameOver() {
  gameRunning = false;
  gameOverElement.style.display = "flex";
  finalScoreElement.textContent = score.toString();

  // Calculate play time in seconds with 2 decimal places
  const playTimeSeconds = ((Date.now() - gameStartTime) / 1000).toFixed(2);
  const playTimeString = `${playTimeSeconds}s`;

  // Submit score to leaderboard - ask for name now
  nm = nm || namePrompt();
  if (nm) {
    LDBoard.saveScore(nm, score, playTimeString);
  }
}

// Mouse move event
document.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();
  const scaleX = GAME_WIDTH / rect.width;
  mouseX = (e.clientX - rect.left) * scaleX;
});

// Touch move event for mobile
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 0) {
    const rect = container.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    mouseX = (e.touches[0].clientX - rect.left) * scaleX;
  }
});

// Restart button
restartBtn.addEventListener("click", () => {
  initGame();
});

// Fixed 60 FPS update loop
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
let lastFrameTime = performance.now();

function gameLoop(currentTime: number) {
  const deltaTime = currentTime - lastFrameTime;

  if (deltaTime >= FRAME_TIME) {
    lastFrameTime = currentTime - (deltaTime % FRAME_TIME);
    update();
    two.update();
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// Start game immediately
initGame();

if (mode != "easy") {
  createButton({
    text: "이지 모드",
    bgColor: "#4CAF50",
    fgColor: "#FFFFFF",
    onClick: () => {
      window.location.href = window.location.pathname + "?mode=easy";
    },
  });
}

if (mode != "hard") {
  createButton({
    text: "하드 모드",
    bgColor: "#F44336",
    fgColor: "#FFFFFF",
    onClick: () => {
      window.location.href = window.location.pathname + "?mode=hard";
    },
  });
}

createButton({
  text: "버전 2.0.0",
  bgColor: "#9E9E9E",
  fgColor: "#FFFFFF",
  onClick: () => {},
});
