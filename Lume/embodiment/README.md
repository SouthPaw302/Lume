# Lume embodiment

Lume embodiment is a local, deterministic presence layer for OpenClaw. It does not call a model to decide activity, animate the avatar, write memory, or route events.

## Event flow

`OpenClaw event → POST /api/events → state engine → runtime.json + WebSocket → visual body`

Every event must contain `event`, `task_id`, `source`, and ISO-8601 `timestamp`. Optional `label`, `foreground`, and object `metadata` add display context without changing state logic. Supported events include task, agent, tool, browser, shell, model, memory, routine, and voice events. Unknown events are rejected instead of guessed.

Run locally:

```bash
node server.js
```

Open `http://127.0.0.1:8788`.

For a direct local integration, POST an observed event:

```bash
curl -X POST http://127.0.0.1:8788/api/events \
  -H 'content-type: application/json' \
  -d '{"event":"shell.running","task_id":"task-42","source":"openclaw","timestamp":"2026-08-20T09:00:00Z","label":"Running a workspace command","foreground":true}'
```

The `lume-events` OpenClaw extension is the normal event source. It forwards structured tool, model, subagent, and compaction lifecycle events locally. Journal parsing is disabled by default and available only for explicit diagnostic use (`LUME_ENABLE_JOURNAL_BRIDGE=1`), so a log line can never animate the avatar during normal operation.

`GET /api/state` is the authoritative snapshot and `/api/ws` streams changes. The compact `GET /api/identity` profile points to the existing workspace identity and memory sources; it does not copy `SECOND_BRAIN` into another store.

Project cues are deliberately limited to the two requested systems: Lume Research and Aurelian. `GET /api/projects` exposes that compact registry. OpenClaw tool/task events and scheduled research routines carry a project ID so the Hatch renderer reflects real project activity with a project badge/accent.

`lib/context-policy.js` builds task-local model inputs and bounds tool output. `lib/routine-digest.js` buffers deterministic routine results; successful background runs stay out of chat, while failures and blocked runs are eligible for a digest.

`GET /api/memory/search?q=...` retrieves a bounded set of relevant lines from the existing authoritative memory files. `GET /api/capsule?q=...` returns compact identity, stable traits, and only relevant memories. Personality changes use `lib/personality-store.js`, require at least three distinct meaningful observations across multiple days or approved sources, move slowly, cannot reuse evidence, and append an audit record. Changes are reversible through `POST /api/personality/rollback`.

The deterministic DNA evaluator consumes explicit candidates from the research probe. It applies a cooldown and bounded delta, while the state snapshot exposes a compact presentation profile controlling Hatch motion, glow, presence, and dominant-trait label. No model chooses or applies DNA changes.

Compatibility routes `GET /state` and WebSocket `/events` mirror the `/api` routes. `GET /api/self` exposes the compact grounded self-model. Run background commands through `run-routine.js --id ID -- command`; it emits lifecycle events and stores a local deterministic result without creating a chat turn. The existing 03:30 Telegram voice report now emits `voice.speaking` only while it actually sends generated audio.

Structured durable records use the existing workspace memory tree at `memory/lume-records.jsonl`. Local authenticated `POST /api/memory` supports save, update, archive, and consolidate operations across the approved domains; `GET /api/memory/records` reads them. `POST /api/personality/evidence` accepts explicit audited evidence. The OpenClaw plugin retrieves a bounded task-relevant capsule locally during prompt construction instead of attaching full memory.

`listen-and-transcribe.sh OUTPUT.wav [seconds]` records the actual local microphone, then transcribes it offline with the installed `faster-whisper` `tiny.en` INT8 model. Real capture and inference emit `voice.listening`, `voice.transcribing`, and terminal success/failure events. `capture-listening.sh` remains available for capture-only use. The renderer uses a lightweight deterministic 3×3 Hatch-style state sheet; CSS selects the frame without model involvement.
