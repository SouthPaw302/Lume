#!/usr/bin/env node
"use strict";

const { LumeCore } = require("../src/lume-core");

const query = process.argv.slice(2).join(" ").trim();
const core = new LumeCore({ embed: null });

(async () => {
  const capsule = await core.build_capsule(query, {
    surface: process.env.LUME_SURFACE || "hermes",
    objective: query,
    memoryPolicy: { limit: Number(process.env.LUME_MEMORY_LIMIT || 6) }
  });
  process.stdout.write(`${JSON.stringify(capsule, null, 2)}\n`);
})().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
