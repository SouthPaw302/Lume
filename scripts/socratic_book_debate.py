#!/usr/bin/env python3
"""Socratic book debate experiment.

Reads recent book excerpts already logged by the 3am book job, then writes a
small self-question/self-answer debate artifact. This keeps the experiment
local, inspectable, and tied to the existing library reading loop.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import random
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(os.environ.get("LUME_PROJECT_ROOT", "/home/koss/LumeAI"))
MEMORY = ROOT / "memory"
OUT_DIR = Path(os.environ.get("LUME_SOCRATIC_DIR", "/home/koss/.local/share/lumeai/experiments/socratic"))
BOOKS_DIR = Path(os.environ.get("LUME_BOOK_LIBRARY", "/home/koss/LumeAI/canon/books"))


@dataclass
class BookExcerpt:
    day: str
    title: str
    text: str
    source_scope: str = "memory_excerpt"
    source_path: str | None = None


def ensure_daily_memory(day: str) -> Path:
    mem = MEMORY / f"{day}.md"
    mem.parent.mkdir(parents=True, exist_ok=True)
    if not mem.exists():
        mem.write_text(f"# {day}\n\n", encoding="utf-8")
    return mem


def safe_append_daily_log(day: str, lines: list[str], *, job_name: str) -> None:
    mem = ensure_daily_memory(day)
    backups = MEMORY / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    try:
        shutil.copy2(mem, backups / f"{day}.md.pre-{job_name}.{ts}.bak")
    except Exception:
        pass
    with mem.open("a", encoding="utf-8") as f:
        for line in lines:
            f.write(line if line.endswith("\n") else f"{line}\n")


def clean_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value.replace("\r", " ").replace("\n", " "))
    return value.strip()


def strip_html(value: str) -> str:
    value = re.sub(r"(?is)<(script|style|nav).*?>.*?</\\1>", " ", value)
    value = re.sub(r"(?is)<br\\s*/?>", "\n", value)
    value = re.sub(r"(?is)</(p|div|h[1-6]|li)\\s*>", "\n", value)
    value = re.sub(r"(?is)<[^>]+>", " ", value)
    return clean_text(html.unescape(value))


def slug(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", value.lower()).strip("-")
    return value[:80] or "book"


def list_book_files() -> list[Path]:
    if not BOOKS_DIR.exists():
        return []
    files = [
        p
        for p in BOOKS_DIR.rglob("*")
        if p.is_file() and p.suffix.lower() in {".epub", ".txt"}
    ]
    files.sort(key=lambda p: str(p.relative_to(BOOKS_DIR)).lower())
    return files


def read_seed(today: str) -> int:
    value = f"{today}|socratic-library-random".encode("utf-8")
    return int(hashlib.sha256(value).hexdigest()[:16], 16)


def extract_book_excerpts(path: Path) -> list[BookExcerpt]:
    if not path.exists():
        return []
    text = path.read_text("utf-8", errors="replace")
    day = path.stem
    found: list[BookExcerpt] = []
    pattern = re.compile(
        r"(?s)\[3am-book-job\].*?Excerpt from \*\*(?P<title>.+?)\*\*.*?\n\s*>\s*(?P<excerpt>.*?)(?=\n\s*Connects to guardian purpose:|\n## |\Z)"
    )
    for match in pattern.finditer(text):
        title = clean_text(match.group("title"))
        excerpt = clean_text(match.group("excerpt"))
        if title and len(excerpt.split()) >= 40:
            found.append(BookExcerpt(day=day, title=title, text=excerpt))
    return found


def find_book_folder(title: str) -> Path | None:
    if not BOOKS_DIR.exists():
        return None
    normalized = clean_text(title).lower()
    exact = BOOKS_DIR / title
    if exact.exists() and exact.is_dir():
        return exact
    for folder in sorted(BOOKS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if folder.is_dir() and folder.name.lower() == normalized:
            return folder
    title_words = set(re.findall(r"[a-z0-9]+", normalized))
    best: tuple[int, Path] | None = None
    for folder in BOOKS_DIR.iterdir():
        if not folder.is_dir():
            continue
        folder_words = set(re.findall(r"[a-z0-9]+", folder.name.lower()))
        score = len(title_words & folder_words)
        if score and (best is None or score > best[0]):
            best = (score, folder)
    return best[1] if best else None


def chapter_from_epub(path: Path, *, min_words: int = 700, max_words: int = 12000) -> tuple[str, str] | None:
    boilerplate = re.compile(
        r"copyright|all rights reserved|isbn|table of contents|about the author|newsletter|praise for",
        re.I,
    )
    candidates: list[tuple[int, str, str]] = []
    try:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
            names.sort(
                key=lambda n: (
                    0 if re.search(r"(chapter|ch\\d+|/text/|text/)", n, re.I) else 1,
                    n.lower(),
                )
            )
            for name in names:
                raw = z.read(name)
                text = strip_html(raw.decode("utf-8", errors="ignore"))
                words = text.split()
                if len(words) < min_words:
                    continue
                boiler_hits = len(boilerplate.findall(text[:3000]))
                chapter_hint = 2 if re.search(r"(chapter|ch\\d+)", name, re.I) else 0
                score = chapter_hint + min(len(words), max_words) // 1000 - boiler_hits
                candidates.append((score, name, " ".join(words[:max_words])))
    except Exception:
        return None
    if not candidates:
        return None
    candidates.sort(key=lambda item: (-item[0], item[1].lower()))
    _, name, text = candidates[0]
    return name, text


def chapter_from_txt(path: Path, *, min_words: int = 700, max_words: int = 12000) -> tuple[str, str] | None:
    try:
        words = path.read_text("utf-8", errors="replace").split()
    except Exception:
        return None
    if len(words) < min_words:
        return None
    return path.name, " ".join(words[:max_words])


def enrich_with_chapter(item: BookExcerpt) -> BookExcerpt:
    folder = find_book_folder(item.title)
    if not folder:
        return item
    for epub in sorted(folder.glob("*.epub")):
        chapter = chapter_from_epub(epub)
        if chapter:
            chapter_name, text = chapter
            return BookExcerpt(
                day=item.day,
                title=item.title,
                text=text,
                source_scope="chapter",
                source_path=f"library/{epub.relative_to(BOOKS_DIR)}::{chapter_name}",
            )
    for txt in sorted(folder.glob("*.txt")):
        chapter = chapter_from_txt(txt)
        if chapter:
            chapter_name, text = chapter
            return BookExcerpt(
                day=item.day,
                title=item.title,
                text=text,
                source_scope="chapter",
                source_path=f"library/{txt.relative_to(BOOKS_DIR)}::{chapter_name}",
            )
    return item


def recent_excerpts(today: str, lookback_days: int) -> list[BookExcerpt]:
    today_date = dt.datetime.strptime(today, "%Y-%m-%d").date()
    items: list[BookExcerpt] = []
    for offset in range(lookback_days):
        day = (today_date - dt.timedelta(days=offset)).strftime("%Y-%m-%d")
        items.extend(extract_book_excerpts(MEMORY / f"{day}.md"))
    return items


def random_library_excerpt(today: str) -> BookExcerpt | None:
    files = list_book_files()
    if not files:
        return None

    skip_re = re.compile(os.environ.get("BOOK_JOB_SKIP_RE", r"\bcalibre\b|quick\s*start\s*guide"), re.I)
    candidates = [p for p in files if not skip_re.search(str(p.relative_to(BOOKS_DIR)))]
    if not candidates:
        return None

    rng = random.Random(read_seed(today))
    rng.shuffle(candidates)
    for path in candidates:
        if path.suffix.lower() == ".epub":
            chapter = chapter_from_epub(path)
        else:
            chapter = chapter_from_txt(path)
        if not chapter:
            continue
        chapter_name, text = chapter
        rel = path.relative_to(BOOKS_DIR)
        title = rel.parts[0] if len(rel.parts) > 1 else path.stem
        return BookExcerpt(
            day=today,
            title=title,
            text=text,
            source_scope="library_random",
            source_path=f"library/{path.relative_to(BOOKS_DIR)}::{chapter_name}",
        )
    return None


def choose_excerpt(items: list[BookExcerpt], today: str) -> BookExcerpt:
    if not items:
        raise RuntimeError("No recent 3am book excerpts found in memory.")
    # Prefer the newest thing the library job read. This keeps the experiment
    # coupled to the nightly reading loop instead of drifting into archive trivia.
    return enrich_with_chapter(items[0])


def top_terms(item: BookExcerpt, limit: int = 5) -> list[str]:
    stop = {
        "about", "after", "again", "also", "because", "before", "between",
        "airport", "australia", "author", "auckland", "avenue", "books", "canada",
        "chapter", "copyright", "coelho", "could", "ebooks", "every",
        "exclusive", "favorite", "from", "harpercollins", "harpercollinsebooks",
        "friend", "going", "have", "http", "into", "kingdom", "london", "more", "ours", "publisher",
        "publishers", "pymble", "road", "states", "their", "there", "these",
        "that", "they", "this", "through", "toronto", "united", "visit", "were",
        "what", "when", "where", "which", "while", "with", "would", "your",
        "zealand",
        "asked", "back", "been", "came", "come", "didn", "down", "even",
        "first", "hand", "head", "himself", "just", "knew", "know", "left",
        "like", "look", "looked", "made", "maybe", "much", "next", "only",
        "other", "right", "said", "shallows", "something", "than", "then",
        "them", "there", "thought", "time", "toward", "voice", "wasn",
    }
    proper_name_stop = {
        "aunt", "bobbie", "david", "hutch", "innis", "leelee", "mars",
        "martian", "sol", "steppan",
    }
    title_words = set(re.findall(r"[A-Za-z][A-Za-z'-]{3,}", item.title.lower()))
    boilerplate = re.compile(
        r"copyright|publisher|isbn|http|www\.|about the author|all rights reserved|printed in|harpercollins",
        re.I,
    )
    sentences = re.split(r"(?<=[.!?])\s+", item.text)
    content = " ".join(s for s in sentences if not boilerplate.search(s))
    words = re.findall(r"[A-Za-z][A-Za-z'-]{3,}", content.lower())
    counts: dict[str, int] = {}
    for word in words:
        if word in stop or word in proper_name_stop or word in title_words:
            continue
        counts[word] = counts.get(word, 0) + 1
    priority = [
        "agency", "choice", "constraint", "truth", "risk", "value", "work",
        "money", "family", "home", "data", "laboratory", "labs", "university",
        "fear", "failure", "power", "customs", "sword", "auction", "lie",
        "declaration",
    ]
    picked: list[str] = []
    for word in priority:
        if word in counts and word not in picked:
            picked.append(word)
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    for word, _ in ranked:
        if word not in picked:
            picked.append(word)
        if len(picked) >= limit:
            break
    return picked[:limit] or ["agency", "truth", "choice"]


def sentence_sample(text: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    boilerplate = re.compile(
        r"copyright|publisher|isbn|http|www\.|about the author|all rights reserved|printed in",
        re.I,
    )
    candidates = []
    for sentence in sentences:
        s = sentence.strip()
        if "-" in s[:80]:
            left, right = s.split("-", 1)
            if left.strip() and right.lower().startswith(left.strip().lower()):
                continue
        words = re.findall(r"[A-Za-z][A-Za-z'-]+", s.lower())
        single_letter_ratio = sum(1 for word in words[:8] if len(word) == 1) / min(len(words), 8) if words else 1
        unique_ratio = len(set(words)) / len(words) if words else 0
        if (
            60 <= len(s) <= 260
            and not boilerplate.search(s)
            and unique_ratio >= 0.55
            and single_letter_ratio < 0.25
            and not re.match(r"^[a-z]?\d+\b", s.lower())
        ):
            candidates.append(s)
    if candidates:
        return candidates[0]
    words = text.split()
    return " ".join(words[:45])


def model_turn(role: str, instruction: str, context: str) -> str:
    endpoint = os.environ.get("SOCRATIC_MODEL_URL", "http://127.0.0.1:12435/v1/chat/completions")
    payload = {
        "model": os.environ.get("SOCRATIC_MODEL", "qwen3-4b-local"),
        "messages": [
            {"role": "system", "content": f"/no_think\nYou are the {role} in Lume's private developmental dialogue. {instruction} Return one complete response under 45 words. Be candid and grounded only in the supplied passage."},
            {"role": "user", "content": context},
        ],
        "temperature": 0.65,
        "max_tokens": 72,
        "chat_template_kwargs": {"enable_thinking": False},
        "stream": False,
    }
    request = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.loads(response.read().decode("utf-8"))
    text = clean_text(result["choices"][0]["message"]["content"])
    text = re.sub(r"(?is)<think>.*?</think>", "", text).strip()
    if not text:
        raise RuntimeError(f"{role} returned no usable text")
    return text


def build_debate(item: BookExcerpt) -> tuple[str, list[dict[str, str]], list[dict[str, str]], str]:
    anchor = sentence_sample(item.text)
    passage = clean_text(item.text)[:600]
    common = f"Book: {item.title}\nAnchor: {anchor}\nPassage: {passage}"
    try:
        question = model_turn("Socratic Questioner", "Ask one difficult philosophical question exposing an assumption about identity, agency, memory, or development.", common)
        advocate = model_turn("Advocate", "State one defensible interpretation, one textual clue, and one implication for Lume.", f"{common}\nQuestion: {question}")
        skeptic = model_turn("Skeptic", "Name one overreach or alternative reading and one observation that would falsify the Advocate's claim.", f"{common}\nQuestion: {question}\nAdvocate: {advocate}")
        synthesis = model_turn("Synthesizer", "State only what survives criticism, then one reversible observable hypothesis in the format '3-generation hypothesis: ...'.", f"{common}\nQuestioner: {question}\nAdvocate: {advocate}\nSkeptic: {skeptic}")
        dialogue = [
            {"role": "questioner", "text": question},
            {"role": "advocate", "text": advocate},
            {"role": "skeptic", "text": skeptic},
            {"role": "synthesizer", "text": synthesis},
        ]
        rounds = [
            {"anchor": anchor, "question": question, "answer": advocate},
            {"anchor": anchor, "question": "What survives the skeptic's challenge?", "answer": synthesis},
        ]
        return synthesis, rounds, dialogue, synthesis
    except Exception as error:
        terms = top_terms(item)
        central = terms[0]
        contrast = terms[1] if len(terms) > 1 else "agency"
        evidence = terms[2] if len(terms) > 2 else "truth"
        rounds = [
            {"anchor": anchor, "question": f"What does '{central}' mean under constraint?", "answer": f"The passage makes '{central}' matter because someone must act while '{contrast}' limits the available choices."},
            {"anchor": anchor, "question": "What would falsify that reading?", "answer": f"Later action would need to show that '{central}' was only scenery and did not alter the preservation of '{evidence}'."},
        ]
        synthesis = f"Model dialogue was unavailable ({type(error).__name__}); deterministic fallback produced an expiring question, not a learned trait."
        return synthesis, rounds, [{"role": "fallback", "text": synthesis}], synthesis


def write_outputs(today: str, item: BookExcerpt, synthesis: str, rounds: list[dict[str, str]], dialogue: list[dict[str, str]], hypothesis: str) -> tuple[Path, Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    md_path = OUT_DIR / f"{today}-socratic-book-debate.md"
    json_path = OUT_DIR / f"{today}-socratic-book-debate.json"
    history_md_path = OUT_DIR / f"{today}-{slug(item.title)}-socratic-book-debate.md"
    history_json_path = OUT_DIR / f"{today}-{slug(item.title)}-socratic-book-debate.json"

    md_lines = [
        f"# Socratic Book Debate ({today})",
        "",
        f"- source_day: {item.day}",
        f"- book: {item.title}",
        f"- source_scope: {item.source_scope}",
        f"- source_path: {item.source_path or 'memory excerpt fallback'}",
        f"- source_word_count: {len(item.text.split())}",
        f"- method: isolated Questioner -> Advocate -> Skeptic -> Synthesizer role passes",
        "",
        "## Anchor",
        f"> {sentence_sample(item.text)}",
        "",
        "## Debate",
    ]
    for turn in dialogue:
        md_lines.extend([f"### {turn['role'].replace('_', ' ').title()}", turn["text"], ""])
    md_lines.extend(["", "## Synthesis", synthesis, ""])
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    payload = {
        "day": today,
        "source_day": item.day,
        "book": item.title,
        "source_scope": item.source_scope,
        "source_path": item.source_path,
        "source_word_count": len(item.text.split()),
        "anchor": sentence_sample(item.text),
        "rounds": rounds,
        "dialogue": dialogue,
        "synthesis": synthesis,
        "hypothesis": hypothesis,
        "method": "four isolated role passes through local S10 Qwen; deterministic fallback on failure",
        "expires_after_generations": 3,
    }
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    history_md_path.write_text("\n".join(md_lines), encoding="utf-8")
    history_json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return md_path, json_path


def main() -> int:
    ap = argparse.ArgumentParser(description="Run Socratic self-debate over recent library excerpts.")
    ap.add_argument("--day", default=None)
    ap.add_argument("--lookback-days", type=int, default=14)
    ap.add_argument("--log-to-memory", action="store_true")
    args = ap.parse_args()

    today = args.day or dt.datetime.now().astimezone().strftime("%Y-%m-%d")
    item = random_library_excerpt(today)
    if item is None:
        items = recent_excerpts(today, args.lookback_days)
        item = choose_excerpt(items, today)
    synthesis, rounds, dialogue, hypothesis = build_debate(item)
    md_path, json_path = write_outputs(today, item, synthesis, rounds, dialogue, hypothesis)

    if args.log_to_memory:
        rel_md = md_path
        rel_json = json_path
        lines = [
            "",
            "## socratic book debate",
            f"- {dt.datetime.now().astimezone().strftime('%H:%M')} — debated `{item.title}` from memory/{item.day}.md",
            f"- artifact: `{rel_md}`",
            f"- log: `{rel_json}`",
            f"- synthesis: {synthesis}",
        ]
        safe_append_daily_log(today, lines, job_name="socratic_book_debate")

    print(json.dumps({"ok": True, "book": item.title, "report": str(md_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
