// Pure game logic: no DOM, so it can be unit-tested in Node.

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function createGame(size = 20, rng = Math.random) {
  const mid = Math.floor(size / 2);
  const snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  return {
    size,
    snake,
    dir: 'right',
    nextDir: 'right',
    food: placeFood(size, snake, rng),
    score: 0,
    alive: true,
  };
}

export function placeFood(size, snake, rng = Math.random) {
  const free = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(rng() * free.length)];
}

function isOpposite(a, b) {
  return DIRECTIONS[a].x === -DIRECTIONS[b].x && DIRECTIONS[a].y === -DIRECTIONS[b].y;
}

export function turn(state, dir) {
  // Compare against the direction actually moved last tick, not the queued
  // one, so two quick key presses can't reverse the snake into itself.
  if (!DIRECTIONS[dir] || isOpposite(dir, state.dir)) return state;
  return { ...state, nextDir: dir };
}

export function step(state, rng = Math.random) {
  if (!state.alive) return state;
  const dir = state.nextDir;
  const head = state.snake[0];
  const next = { x: head.x + DIRECTIONS[dir].x, y: head.y + DIRECTIONS[dir].y };
  const eating = state.food && next.x === state.food.x && next.y === state.food.y;

  // The tail moves out of the way this tick unless we're growing.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const hitWall = next.x < 0 || next.y < 0 || next.x >= state.size || next.y >= state.size;
  const hitSelf = body.some((s) => s.x === next.x && s.y === next.y);
  if (hitWall || hitSelf) return { ...state, dir, alive: false };

  const snake = [next, ...body];
  return {
    ...state,
    snake,
    dir,
    food: eating ? placeFood(state.size, snake, rng) : state.food,
    score: eating ? state.score + 1 : state.score,
  };
}
