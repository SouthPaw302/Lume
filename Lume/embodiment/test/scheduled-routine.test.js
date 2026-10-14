"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ROUTINES } = require("../scheduled-routine");
assert.equal(Object.keys(ROUTINES).length, 15);
for (const command of Object.values(ROUTINES)) {
  assert(path.isAbsolute(command[0]) && path.isAbsolute(command[1]));
  // Historical experiment scripts and local interpreters deliberately stay
  // outside Git. Validate their presence only on Lume's actual host.
  if (!process.env.CI) assert(fs.existsSync(command[0]) && fs.existsSync(command[1]));
}
process.stdout.write("scheduled routine registry tests passed\n");
