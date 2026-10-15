#!/usr/bin/env node
"use strict";

const { sync } = require("../src/evolution/github-bridge");

try {
  console.log(JSON.stringify(sync(), null, 2));
} catch (error) {
  console.error(`Lume GitHub bridge deferred: ${error.message}`);
  process.exitCode = 2;
}
