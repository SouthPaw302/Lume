#!/usr/bin/env python3
"""Render a text report with Lume's local Piper voice."""

from __future__ import annotations

import argparse
import wave
from pathlib import Path

from piper.voice import PiperVoice


def main() -> int:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text")
    source.add_argument("--text-file", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--model",
        type=Path,
        default=Path("/home/koss/LumeAI/Lume/embodiment/models/piper/en_US-amy-medium.onnx"),
    )
    args = parser.parse_args()
    text = args.text_file.read_text("utf-8") if args.text_file else args.text
    if not text or not text.strip():
        parser.error("speech text is empty")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(args.model)
    with wave.open(str(args.out), "wb") as output:
        voice.synthesize_wav(text.strip(), output)
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
