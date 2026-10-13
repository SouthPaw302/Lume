#!/usr/bin/env python3
"""Persistent, loopback-only offline STT/TTS service for Lume."""

import json
import os
import tempfile
import threading
import time
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from faster_whisper import WhisperModel
from piper.voice import PiperVoice

ROOT = Path(__file__).resolve().parent
MODEL_ROOT = ROOT / "models"
AUDIO_ROOT = ROOT / "state" / "direct-audio"
MAX_AUDIO = 8 * 1024 * 1024
MAX_TEXT = 1200

print("Loading Lume voice models…", flush=True)
STT = WhisperModel("tiny.en", device="cpu", compute_type="int8", cpu_threads=min(4, os.cpu_count() or 1), num_workers=1, download_root=str(MODEL_ROOT))
TTS = PiperVoice.load(MODEL_ROOT / "piper" / "en_US-amy-medium.onnx")
MODEL_LOCK = threading.Lock()
AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
print("Lume voice models ready", flush=True)


def cleanup_audio():
    cutoff = time.time() - 900
    for candidate in AUDIO_ROOT.glob("*.wav"):
        try:
            if candidate.stat().st_mtime < cutoff:
                candidate.unlink()
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    server_version = "LumeVoice/1"

    def log_message(self, fmt, *args):
        print(f"voice {self.address_string()} {fmt % args}", flush=True)

    def json(self, status, value):
        payload = (json.dumps(value, ensure_ascii=False) + "\n").encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            # Browsers and health probes may disconnect after headers arrive.
            # This is expected client behavior, not a voice-service failure.
            return

    def do_GET(self):
        if self.path == "/health":
            return self.json(200, {"ok": True, "stt": "faster-whisper tiny.en", "tts": "Piper en_US-amy-medium", "local": True})
        return self.json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_AUDIO:
            return self.json(413, {"error": "invalid request size"})
        if self.path == "/transcribe":
            suffix = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/wav": ".wav"}.get(self.headers.get("Content-Type", "").split(";")[0], ".webm")
            with tempfile.NamedTemporaryFile(suffix=suffix) as audio:
                audio.write(self.rfile.read(length)); audio.flush()
                with MODEL_LOCK:
                    segments, info = STT.transcribe(
                        audio.name,
                        language="en",
                        beam_size=1,
                        best_of=1,
                        vad_filter=True,
                        condition_on_previous_text=False,
                        initial_prompt="Lume, Cardona, Aurelian, Kiwix.",
                    )
                    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
            return self.json(200, {"text": text, "language": info.language, "duration": round(float(info.duration), 3), "model": "tiny.en", "local": True})
        if self.path == "/synthesize":
            try:
                body = json.loads(self.rfile.read(length)); text = str(body.get("text", "")).strip()[:MAX_TEXT]
                if not text: raise ValueError("text is required")
                cleanup_audio(); audio_id = uuid.uuid4().hex; output = AUDIO_ROOT / f"{audio_id}.wav"
                with MODEL_LOCK, wave.open(str(output), "wb") as wav_file:
                    TTS.synthesize_wav(text, wav_file)
                return self.json(200, {"id": audio_id, "url": f"/api/direct/audio/{audio_id}", "voice": "en_US-amy-medium"})
            except (ValueError, json.JSONDecodeError) as error:
                return self.json(400, {"error": str(error)})
        return self.json(404, {"error": "not found"})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8790), Handler).serve_forever()
