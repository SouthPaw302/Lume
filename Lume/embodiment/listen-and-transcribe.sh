#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${LUME_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/lumeai}"
OUT="${1:-$DATA_DIR/audio/lume-listening.wav}"
DURATION="${2:-10}"
ROOT="$SCRIPT_DIR"
NODE="${LUME_NODE_BIN:-$(command -v node)}"
TASK_ID="voice-stt-$(date +%s)"

"$ROOT/capture-listening.sh" "$OUT" "$DURATION"
LUME_FOREGROUND=1 "$NODE" "$ROOT/emit-event.js" voice.transcribing "$TASK_ID" lume.stt "Transcribing locally" >/dev/null 2>&1 || true
if RESULT=$("$ROOT/.venv-stt/bin/python" "$ROOT/transcribe.py" "$OUT" --json); then
  LUME_FOREGROUND=1 "$NODE" "$ROOT/emit-event.js" voice.transcribed "$TASK_ID" lume.stt "Transcription ready" >/dev/null 2>&1 || true
  printf '%s\n' "$RESULT"
else
  LUME_FOREGROUND=1 "$NODE" "$ROOT/emit-event.js" voice.failed "$TASK_ID" lume.stt "Transcription failed" >/dev/null 2>&1 || true
  exit 1
fi
