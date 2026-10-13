"use strict";
const assert = require("assert");
const { detectProject, projects } = require("../lib/project-registry");

assert.deepEqual(projects.map(project => project.id), ["research", "aurelian"]);
assert.equal(detectProject("/home/koss/clawd/research_loop/ACTIVE-GOAL.md").id, "research");
assert.equal(detectProject("/home/koss/clawd/aurelian/CORPUS-v1.md").id, "aurelian");
assert.equal(detectProject("/home/koss/clawd/QuickFiX2.0/index.html"), null);
process.stdout.write("project registry tests passed\n");
