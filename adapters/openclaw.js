"use strict";

const { buildReplayEnvelope } = require("../src/replay");

function createOpenClawAdapter(core) {
  return {
    async capsuleForPrompt({ prompt, session_id }) {
      return core.build_capsule(prompt, { objective: prompt, surface: "openclaw", session_id, memoryPolicy: { limit: 5 } });
    },
    forwardEvent(event) {
      return core.emit_event(event.event, event.task_id, { ...event.metadata, source: "openclaw", timestamp: event.timestamp, label: event.label, foreground: event.foreground });
    },
    replayEnvelope(input) { return buildReplayEnvelope(input); }
  };
}

module.exports = { createOpenClawAdapter };
