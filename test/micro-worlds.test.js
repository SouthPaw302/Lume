"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { brainfuck, snake, automata } = require("../src");

test("Brainfuck generation and execution replay deterministically", () => {
  const a = brainfuck.generate("seed", 40); const b = brainfuck.generate("seed", 40); assert.equal(a, b);
  assert.deepEqual(brainfuck.run(a, [1, 2]), brainfuck.run(b, [1, 2]));
});

test("Brainfuck execution is bounded", () => {
  const result = brainfuck.run("+[]", [], { maxSteps: 50 }); assert.equal(result.exhausted, true); assert.equal(result.steps, 50);
});

test("Snake and automata replay from seeds", () => {
  assert.deepEqual(snake.simulate({ exploration: 0.4, persistence: 0.6 }, "x"), snake.simulate({ exploration: 0.4, persistence: 0.6 }, "x"));
  assert.deepEqual(automata.run("x"), automata.run("x"));
});
