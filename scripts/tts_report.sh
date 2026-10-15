#!/usr/bin/env bash
set -euo pipefail

BASE=/home/koss/LumeAI

usage() {
  cat <<'EOF'
tts_report.sh --text-file PATH --out PATH [--voice VOICE]
tts_report.sh --text "Text to speak" --out PATH [--voice VOICE]

Generate report audio with Lume's local Piper voice, falling back to edge-tts.
Output extension may be .wav, .mp3, or .ogg.
EOF
}

TEXT=""
TEXT_FILE=""
OUT=""
VOICE="${TTS_VOICE:-en-US-AriaNeural}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)
      TEXT="${2:-}"
      shift 2
      ;;
    --text-file)
      TEXT_FILE="${2:-}"
      shift 2
      ;;
    --out)
      OUT="${2:-}"
      shift 2
      ;;
    --voice)
      VOICE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$OUT" ]]; then
  echo "--out is required" >&2
  exit 2
fi

if [[ -n "$TEXT_FILE" ]]; then
  TEXT="$(<"$TEXT_FILE")"
fi

if [[ -z "${TEXT//[[:space:]]/}" ]]; then
  echo "no text provided" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUT")"

PIPER_PYTHON="${LUME_PIPER_PYTHON:-/home/koss/clawd/Lume/embodiment/.venv-stt/bin/python}"
PIPER_SCRIPT="$BASE/scripts/piper_tts.py"
PIPER_MODEL="$BASE/Lume/embodiment/models/piper/en_US-amy-medium.onnx"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

if [[ -x "$PIPER_PYTHON" && -f "$PIPER_MODEL" ]]; then
  TMP_WAV="$TMP_DIR/report.wav"
  if [[ -n "$TEXT_FILE" ]]; then
    "$PIPER_PYTHON" "$PIPER_SCRIPT" --text-file "$TEXT_FILE" --out "$TMP_WAV" --model "$PIPER_MODEL" >/dev/null
  else
    "$PIPER_PYTHON" "$PIPER_SCRIPT" --text "$TEXT" --out "$TMP_WAV" --model "$PIPER_MODEL" >/dev/null
  fi
  case "$OUT" in
    *.wav) mv -- "$TMP_WAV" "$OUT" ;;
    *.ogg) ffmpeg -hide_banner -loglevel error -y -i "$TMP_WAV" -c:a libopus -b:a 32k "$OUT" ;;
    *) ffmpeg -hide_banner -loglevel error -y -i "$TMP_WAV" -c:a libmp3lame -b:a 48k "$OUT" ;;
  esac
elif command -v edge-tts >/dev/null 2>&1; then
  TMP_MP3="$TMP_DIR/report.mp3"
  edge-tts --voice "$VOICE" --text "$TEXT" --write-media "$TMP_MP3" >/dev/null
  case "$OUT" in
    *.mp3) mv -- "$TMP_MP3" "$OUT" ;;
    *.ogg) ffmpeg -hide_banner -loglevel error -y -i "$TMP_MP3" -c:a libopus -b:a 32k "$OUT" ;;
    *.wav) ffmpeg -hide_banner -loglevel error -y -i "$TMP_MP3" "$OUT" ;;
    *) mv -- "$TMP_MP3" "$OUT" ;;
  esac
else
  echo "no local Piper voice or edge-tts installation is available" >&2
  exit 1
fi

printf '%s\n' "$OUT"
