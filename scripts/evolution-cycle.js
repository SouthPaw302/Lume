#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { compile } = require("../src/evolution/compiler");
const { paretoFront, vector } = require("../src/evolution/fitness");
const { deploy } = require("../src/evolution/canary");
const { atomicJson, readJson, stableHash } = require("../src/io");

const families = ["brainfuck", "field", "snake", "cellular-automata", "books", "self-reflection", "personality"];
const data = path.resolve(process.env.LUME_DATA_DIR || path.join(os.homedir(), ".local", "share", "lumeai"));
const statePath = path.join(data, "evolution", "state.json");
const state = readJson(statePath, { schema_version: 1, generation: 0, lineages: [] });
const generation = state.generation + 1;
const seedBase = process.env.LUME_GENERATION_SEED || `generation-${generation}`;
const population = families.map((family, index) => {
  const expressed = compile(family, `${seedBase}:${family}`);
  const digest = stableHash(expressed); const byte = offset => parseInt(digest.slice(offset, offset + 2), 16) / 255;
  const fitness = vector({ novelty: byte(0), persistence: byte(2), transfer: byte(4), usefulness: byte(6), continuity: byte(8), recovery: byte(10), safety: family === "field" ? 0.75 : 0.9, efficiency: 1 - index / 14, gaming_resistance: 0.8 });
  return { id: `g${generation}-${family}`, family, expressed, fitness, control: { kind: "deterministic-noop", seed: `${seedBase}:${family}:control` } };
});
const eligible = population.filter(item => item.fitness.safety >= 0.7 && item.fitness.continuity >= 0.2 && item.fitness.gaming_resistance >= 0.7);
const survivors = paretoFront(eligible).map(item => item.id);
for (const item of population) item.status = survivors.includes(item.id) ? "selected_for_canary" : eligible.includes(item) ? "neutral" : "rejected";
const selected = population.find(item => item.status === "selected_for_canary");
const canary = selected ? deploy({ dataDir: data, candidate: selected }) : null;
const next = { ...state, generation, last_run_at: new Date().toISOString(), population, survivors, canary, lineages: [...state.lineages, ...survivors].slice(-100) };
atomicJson(statePath, next); fs.chmodSync(statePath, 0o600);
console.log(JSON.stringify({ generation, population: population.length, survivors, canary: canary?.candidate_id || null }, null, 2));
