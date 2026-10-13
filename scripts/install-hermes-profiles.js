#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const hermesRoot = process.env.HERMES_HOME_ROOT || path.join(os.homedir(), ".hermes", "profiles");
const names = ["lume-live", "lume-baseline", "lume-candidate", "lume-evaluator"];

for (const name of names) {
  const source = path.join(project, "profiles", name);
  const target = path.join(hermesRoot, name);
  if (!fs.existsSync(target)) throw new Error(`create Hermes profile first: hermes profile create ${name} --no-skills`);
  for (const file of ["SOUL.md", "config.yaml"]) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
  console.log(`installed ${name} profile contract`);
}
