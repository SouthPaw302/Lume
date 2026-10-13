"use strict";

function createHermesAdapter(core) {
  return {
    async beforeTurn({ message, session_id, surface = "hermes" }) {
      const capsule = await core.build_capsule(message, { objective: message, surface, memoryPolicy: { limit: 5 } });
      core.emit_event("model.started", `hermes-${session_id}`, { source: "hermes", label: "Lume is thinking", foreground: true });
      return { system_context: JSON.stringify(capsule), metadata: { session_id, capsule_memory_count: capsule.memories.length } };
    },
    afterTurn({ session_id, response, model }) {
      core.emit_event("model.completed", `hermes-${session_id}`, { source: "hermes", label: "Lume replied", foreground: true, model });
      return { response_digest_input: String(response || ""), model };
    },
    failed({ session_id, error }) {
      return core.emit_event("model.failed", `hermes-${session_id}`, { source: "hermes", label: "Lume encountered an error", detail: String(error).slice(0, 240) });
    }
  };
}

module.exports = { createHermesAdapter };
