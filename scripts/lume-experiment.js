"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ExperimentEngine, brainfuck, snake, automata } = require("../src");

const data = fs.mkdtempSync(path.join(os.tmpdir(), "lume-demo-"));
const engine = new ExperimentEngine({
  candidatesPath: path.join(data, "candidates.jsonl"), evidencePath: path.join(data, "evidence.jsonl"), ledgerPath: path.join(data, "ledger.jsonl"), livePolicyPath: path.join(data, "live.json"), policyHistoryPath: path.join(data, "history")
});
const program = brainfuck.generate("lume-demo", 48); const bf = brainfuck.run(program, [1, 2, 3]);
const snakeResult = snake.simulate({ exploration: 0.3, persistence: 0.6 }, "lume-demo");
const ca = automata.run("lume-demo");
const candidate = engine.propose({ hypothesis: "Bounded exploration may improve initiative.", mutation: { target: "initiative_threshold", operator: "weaken", magnitude: 0.03 }, source: { kind: "micro_world", brainfuck: bf, snake: snakeResult, automata: ca } });
console.log(JSON.stringify({ data, candidate, micro_worlds: { brainfuck: bf, snake: snakeResult, automata: { ...ca, populations: undefined } } }, null, 2));
