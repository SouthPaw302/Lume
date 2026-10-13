#!/usr/bin/env python3
"""Local, bounded speech-to-text adapter for Lume."""

import argparse
import json
import os
from pathlib import Path

from faster_whisper import WhisperModel


ROOT = Path(__file__).resolve().parent
MODEL_NAME = os.environ.get("LUME_STT_MODEL", "tiny.en")
MODEL_ROOT = ROOT / "models"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--language", default="en")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if not args.audio.is_file():
        parser.error(f"audio file not found: {args.audio}")

    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        MODEL_NAME,
        device="cpu",
        compute_type="int8",
        cpu_threads=min(4, os.cpu_count() or 1),
        num_workers=1,
        download_root=str(MODEL_ROOT),
    )
    segments, info = model.transcribe(
        str(args.audio),
        language=args.language,
        beam_size=1,
        best_of=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    result = {
        "text": text,
        "language": info.language,
        "language_probability": round(float(info.language_probability), 4),
        "duration": round(float(info.duration), 3),
        "model": MODEL_NAME,
        "local": True,
    }
    print(json.dumps(result, ensure_ascii=False) if args.json else text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
