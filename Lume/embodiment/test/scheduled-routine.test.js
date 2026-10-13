"use strict";
const assert = require("assert");
const fs = require("fs");
const { ROUTINES } = require("../scheduled-routine");
assert.equal(Object.keys(ROUTINES).length, 15);
for (const command of Object.values(ROUTINES)) assert(fs.existsSync(command[0]) && fs.existsSync(command[1]));
process.stdout.write("scheduled routine registry tests passed\n");
