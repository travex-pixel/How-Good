import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, turn, placeFood } from './game.js';

const fixedRng = () => 0;

test('snake moves one cell per step', () => {
  const g = step(createGame(10, fixedRng), fixedRng);
  assert.deepEqual(g.snake[0], { x: 6, y: 5 });
  assert.equal(g.snake.length, 3);
});

test('eating food grows the snake and scores', () => {
  let g = createGame(10, fixedRng);
  g = { ...g, food: { x: 6, y: 5 } };
  g = step(g, fixedRng);
  assert.equal(g.score, 1);
  assert.equal(g.snake.length, 4);
});

test('hitting a wall ends the game', () => {
  let g = createGame(10, fixedRng);
  g = { ...g, food: null };
  for (let i = 0; i < 10; i++) g = step(g, fixedRng);
  assert.equal(g.alive, false);
});

test('cannot reverse directly into itself', () => {
  const g = turn(createGame(10, fixedRng), 'left');
  assert.equal(g.nextDir, 'right');
});

test('two quick key presses cannot cause a U-turn into the body', () => {
  // Moving right; press up then left before the next tick.
  let g = createGame(10, fixedRng);
  g = turn(g, 'up');
  g = turn(g, 'left');
  g = step(g, fixedRng);
  assert.equal(g.alive, true);
});

test('moving into the cell the tail is leaving is allowed', () => {
  // A 2x2 loop: head chases its own tail.
  let g = {
    ...createGame(10, fixedRng),
    snake: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }],
    dir: 'up',
    nextDir: 'right',
    food: null,
  };
  g = step(g, fixedRng);
  assert.equal(g.alive, true);
});

test('food never spawns on the snake', () => {
  const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < 50; i++) {
    const f = placeFood(2, snake, Math.random);
    assert.deepEqual(f, { x: 1, y: 1 });
  }
});
