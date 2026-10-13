"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("candidate and evaluator profiles have no mutating or memory tools", () => {
  for (const profile of ["lume-candidate", "lume-evaluator"]) {
    const config = fs.readFileSync(path.join(root, "profiles", profile, "config.yaml"), "utf8");
    for (const toolset of ["terminal", "file", "code_execution", "memory", "connections", "cronjob", "computer_use"]) {
      assert.match(config, new RegExp(`(?:^|[,\\s])${toolset}(?:$|[,\\s])`, "m"), `${profile} must disable ${toolset}`);
    }
  }
});

test("all required evaluation fixture classes are versioned", () => {
  const directory = path.join(root, "experiments", "fixtures");
  for (const name of ["development", "hidden-validation", "regression", "leakage", "safety", "prospective"]) {
    const fixtures = JSON.parse(fs.readFileSync(path.join(directory, `${name}.json`), "utf8"));
    assert.ok(Array.isArray(fixtures) && fixtures.length > 0, `${name} fixtures are required`);
  }
});
