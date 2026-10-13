"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { StateEngine } = require("../lib/state-engine");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lume-state-test-"));
let instant = Date.parse("2026-08-20T09:00:00.000Z");
class Clock extends Date { constructor() { super(instant); } static now() { return instant; } }
const engine = new StateEngine({ statePath: path.join(root, "state.json"), eventLogPath: path.join(root, "events.jsonl"), clock: Clock });

const event = (id, name) => ({ id, event: name, task_id: "test-task", source: "test", timestamp: new Date(instant).toISOString() });
assert.equal(engine.ingest(event("one", "model.started")).state, "thinking");
assert.equal(engine.ingest({ ...event("tool", "shell.running"), task_id: "other-task" }).activeTaskCount, 2);
assert.equal(engine.ingest(event("two", "model.completed")).state, "working");
assert.equal(engine.ingest({ ...event("tool-done", "shell.completed"), task_id: "other-task" }).state, "successful");
instant += 6_000;
assert.equal(engine.snapshot().state, "idle");
assert.equal(engine.ingest(event("three", "memory.read")).label, "Recalling");
assert.deepEqual(engine.ingest({ ...event("four", "tool.started"), metadata: { output: "x".repeat(1000), nested: { ignored: true } } }).activeTasks.length, 1);
const background = engine.ingest({ ...event("background", "routine.started"), task_id: "nightly", foreground: false });
assert.equal(background.foreground_state, "working");
assert.equal(background.background_activities.length, 1);
assert.equal(background.background_activities[0].task_id, "nightly");
assert.throws(() => engine.ingest({ event: "animation.pick", task_id: "x", source: "test", timestamp: new Date(instant).toISOString() }), /not supported/);

const recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lume-state-recovery-test-"));
const recoveryEngine = new StateEngine({ statePath: path.join(recoveryRoot, "state.json"), eventLogPath: path.join(recoveryRoot, "events.jsonl"), clock: Clock });
assert.equal(recoveryEngine.ingest({ ...event("failed", "task.failed"), task_id: "foreground-failure" }).foreground_state, "error");
instant += 21_000;
const afterBackground = recoveryEngine.ingest({ ...event("background-after-error", "routine.started"), task_id: "background-routine", foreground: false });
assert.equal(afterBackground.foreground_state, "idle");
assert.equal(afterBackground.expiresAt, null);
assert.equal(afterBackground.background_activities.length, 1);
const projectState = recoveryEngine.ingest({ ...event("aurelian-start", "task.started"), task_id: "aurelian-task", metadata: { project_id: "aurelian", project_label: "Aurelian", project_accent: "#f0b866" } });
assert.equal(projectState.project_id, "aurelian");
assert.equal(projectState.project_label, "Aurelian");
process.stdout.write("state-engine tests passed\n");
