"use strict";

const { seeded } = require("../prng");
const OPS = [">", "<", "+", "-", ".", ",", "[", "]"];

function run(program, input = [], limits = {}) {
  const maxSteps = Math.min(100_000, Number(limits.maxSteps || 10_000));
  const memorySize = Math.min(4096, Number(limits.memorySize || 256));
  const tape = new Uint8Array(memorySize); const output = []; const stack = []; const jumps = new Map();
  for (let i = 0; i < program.length; i += 1) {
    if (program[i] === "[") stack.push(i);
    if (program[i] === "]") { const open = stack.pop(); if (open === undefined) throw new Error("unbalanced program"); jumps.set(open, i); jumps.set(i, open); }
  }
  if (stack.length) throw new Error("unbalanced program");
  let pointer = 0, ip = 0, steps = 0, inputIndex = 0;
  while (ip < program.length && steps < maxSteps) {
    const op = program[ip]; steps += 1;
    if (op === ">") pointer = (pointer + 1) % memorySize;
    else if (op === "<") pointer = (pointer - 1 + memorySize) % memorySize;
    else if (op === "+") tape[pointer] = (tape[pointer] + 1) & 255;
    else if (op === "-") tape[pointer] = (tape[pointer] - 1) & 255;
    else if (op === "." && output.length < 32) output.push(tape[pointer]);
    else if (op === ",") tape[pointer] = Number(input[inputIndex++] || 0) & 255;
    else if (op === "[" && tape[pointer] === 0) ip = jumps.get(ip);
    else if (op === "]" && tape[pointer] !== 0) ip = jumps.get(ip);
    ip += 1;
  }
  return { output, steps, halted: ip >= program.length, exhausted: steps >= maxSteps, pointer, tape_digest: [...tape.slice(0, 16)] };
}

function generate(seed, length = 48) {
  const random = seeded(seed); let depth = 0; let program = "";
  for (let i = 0; i < length; i += 1) {
    let op = OPS[Math.floor(random() * OPS.length)];
    if (op === "]" && depth === 0) op = "+";
    if (op === "[") depth += 1;
    if (op === "]") depth -= 1;
    program += op;
  }
  return program + "]".repeat(depth);
}

function outputToMutation(result) {
  const values = result.output.length ? result.output : result.tape_digest;
  const byte = index => Number(values[index % values.length] || 0);
  return {
    target: ["retrieval_depth", "initiative_threshold", "clarification_threshold", "compression_target"][byte(0) % 4],
    operation: byte(1) % 2 ? "strengthen" : "weaken",
    magnitude: Number((0.01 + (byte(2) / 255) * 0.09).toFixed(3))
  };
}

module.exports = { generate, outputToMutation, run };
