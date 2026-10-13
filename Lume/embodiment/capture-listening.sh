#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-}"
DURATION="${2:-10}"
if [[ -z "$OUT" || ! "$DURATION" =~ ^[0-9]+$ || "$DURATION" -lt 1 || "$DURATION" -gt 300 ]]; then
  echo "usage: capture-listening.sh OUTPUT.wav [seconds:1-300]" >&2
  exit 2
fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NODE="${LUME_NODE_BIN:-$(command -v node)}"
EMIT="$SCRIPT_DIR/emit-event.js"
TASK_ID="voice-listen-$(date +%s)"
mkdir -p "$(dirname "$OUT")"
"$NODE" "$EMIT" voice.listening "$TASK_ID" microphone "Listening" >/dev/null 2>&1 || true
finish() { "$NODE" "$EMIT" voice.stopped "$TASK_ID" microphone "Listening stopped" >/dev/null 2>&1 || true; }
trap finish EXIT INT TERM
arecord -q -d "$DURATION" -f S16_LE -r 16000 -c 1 "$OUT"
