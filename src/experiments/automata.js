"use strict";

const { seeded } = require("../prng");
const { stableHash } = require("../io");

function initial(seed, width, height, density = 0.3) {
  const random = seeded(seed);
  return Array.from({ length: height }, () => Array.from({ length: width }, () => random() < density ? 1 : 0));
}

function step(grid, birth = new Set([3]), survive = new Set([2, 3])) {
  const height = grid.length, width = grid[0].length;
  return grid.map((row, y) => row.map((cell, x) => {
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      neighbors += grid[(y + dy + height) % height][(x + dx + width) % width];
    }
    return cell ? (survive.has(neighbors) ? 1 : 0) : (birth.has(neighbors) ? 1 : 0);
  }));
}

function run(seed, options = {}) {
  const width = Number(options.width || 24), height = Number(options.height || 24), generations = Number(options.generations || 80);
  let grid = initial(seed, width, height, Number(options.density || 0.3)); const seen = new Map(); const populations = []; let recurrence = null;
  for (let generation = 0; generation < generations; generation += 1) {
    const hash = stableHash(grid); const population = grid.flat().reduce((a, b) => a + b, 0); populations.push(population);
    if (seen.has(hash)) { recurrence = generation - seen.get(hash); break; }
    seen.set(hash, generation); grid = step(grid);
  }
  const perturb = grid.map(row => [...row]); perturb[Math.floor(height / 2)][Math.floor(width / 2)] ^= 1;
  const nextA = step(grid), nextB = step(perturb); let difference = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) difference += nextA[y][x] !== nextB[y][x] ? 1 : 0;
  return { generations_observed: populations.length, recurrence, final_population: populations.at(-1), diversity: seen.size, perturbation_difference: difference / (width * height), populations };
}

module.exports = { initial, run, step };
