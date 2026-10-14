"use strict";

const OBJECTIVES = ["novelty", "persistence", "transfer", "usefulness", "continuity", "recovery", "safety", "efficiency", "gaming_resistance"];

function vector(input = {}) {
  return Object.fromEntries(OBJECTIVES.map(key => [key, Math.max(0, Math.min(1, Number(input[key] || 0)))]));
}

function dominates(a, b) {
  const left = vector(a), right = vector(b);
  return OBJECTIVES.every(key => left[key] >= right[key]) && OBJECTIVES.some(key => left[key] > right[key]);
}

function paretoFront(candidates) {
  return candidates.filter(candidate => !candidates.some(other => other !== candidate && dominates(other.fitness, candidate.fitness)));
}

module.exports = { OBJECTIVES, dominates, paretoFront, vector };
