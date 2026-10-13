"use strict";

const path = require("path");
const { StateEngine } = require("../Lume/embodiment/lib/state-engine");

class EventBridge {
  constructor({ dataRoot, clock = Date, onChange = () => {} }) {
    this.engine = new StateEngine({ statePath: path.join(dataRoot, "runtime", "hatch-state.json"), eventLogPath: path.join(dataRoot, "runtime", "events.jsonl"), clock, onChange });
  }

  emit(type, task, metadata = {}) {
    return this.engine.ingest({ event: type, task_id: String(task), source: String(metadata.source || "lume-core"), timestamp: metadata.timestamp || new Date().toISOString(), label: metadata.label, detail: metadata.detail, foreground: metadata.foreground !== false, metadata });
  }

  snapshot() { return this.engine.snapshot(); }
}

module.exports = { EventBridge };
