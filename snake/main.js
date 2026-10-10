import { createGame, step, turn } from './game.js';

const SIZE = 20;
const TICK_MS = 120;
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const cell = canvas.width / SIZE;
const scoreEl = document.getElementById('score');
const statusEl = document.getElementById('status');

let game = createGame(SIZE);

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

document.addEventListener('keydown', (e) => {
  if (!game.alive && e.key === ' ') {
    game = createGame(SIZE);
    statusEl.textContent = 'Go!';
    return;
  }
  const dir = KEYS[e.key];
  if (dir) {
    e.preventDefault();
    game = turn(game, dir);
  }
});

let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  touchStart = e.touches[0];
  if (!game.alive) game = createGame(SIZE);
}, { passive: true });
canvas.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.clientX;
  const dy = t.clientY - touchStart.clientY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
    game = turn(game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
  touchStart = null;
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (game.food) {
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(game.food.x * cell + 2, game.food.y * cell + 2, cell - 4, cell - 4);
  }
  game.snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#7ee787' : '#3fb950';
    ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
  });
  scoreEl.textContent = game.score;
}

setInterval(() => {
  const wasAlive = game.alive;
  game = step(game);
  if (wasAlive && !game.alive) statusEl.textContent = 'Game over: press Space or tap';
  draw();
}, TICK_MS);
draw();
