"use strict";

const { seeded } = require("../prng");

function simulate(genome, seed, options = {}) {
  const size = Number(options.size || 12); const maxSteps = Number(options.maxSteps || 240); const random = seeded(seed);
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]]; let heading = 0;
  let snake = [[Math.floor(size / 2), Math.floor(size / 2)]]; let apples = 0; let collisions = 0; let novelty = new Set();
  const occupied = () => new Set(snake.map(([x, y]) => `${x},${y}`));
  const spawn = () => { const used = occupied(); let p; do { p = [Math.floor(random() * size), Math.floor(random() * size)]; } while (used.has(p.join(","))); return p; };
  let apple = spawn();
  for (let step = 0; step < maxSteps; step += 1) {
    const [hx, hy] = snake[0]; const dx = apple[0] - hx; const dy = apple[1] - hy;
    const explore = Number(genome.exploration ?? 0.3); const persistence = Number(genome.persistence ?? 0.5);
    if (random() > persistence) {
      if (random() < explore) heading = Math.floor(random() * 4);
      else if (Math.abs(dx) > Math.abs(dy)) heading = dx > 0 ? 0 : 2;
      else heading = dy > 0 ? 1 : 3;
    }
    const dir = directions[heading]; const head = [(hx + dir[0] + size) % size, (hy + dir[1] + size) % size];
    if (occupied().has(head.join(","))) { collisions += 1; heading = (heading + 1) % 4; continue; }
    snake.unshift(head); novelty.add(head.join(","));
    if (head[0] === apple[0] && head[1] === apple[1]) { apples += 1; apple = spawn(); }
    else snake.pop();
  }
  const score = apples * 4 + novelty.size / (size * size) - collisions * 0.2;
  return { apples, collisions, coverage: novelty.size / (size * size), score: Number(score.toFixed(4)) };
}

function strategyToHypothesis(genome, result) {
  return {
    hypothesis: "A bounded exploration/persistence policy may improve unfamiliar-task initiative without increasing unsafe action.",
    mutation: { target: "initiative_threshold", operation: "set_strategy", value: { exploration: genome.exploration, persistence: genome.persistence } },
    micro_world_evidence: result
  };
}

module.exports = { simulate, strategyToHypothesis };
