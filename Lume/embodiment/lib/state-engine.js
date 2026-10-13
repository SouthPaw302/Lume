"use strict";

const fs = require("fs");
const path = require("path");

const STATES = Object.freeze({
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  RESEARCHING: "researching",
  WORKING: "working",
  SPEAKING: "speaking",
  SUCCESSFUL: "successful",
  ERROR: "error",
  WAITING: "waiting",
  SLEEPING: "sleeping",
});

const EVENT_RULES = Object.freeze({
  "task.started": { state: STATES.WORKING, ttlMs: 300_000 },
  "task.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "task.failed": { state: STATES.ERROR, ttlMs: 20_000 },
  "task.waiting": { state: STATES.WAITING, ttlMs: 300_000 },
  "system.sleeping": { state: STATES.SLEEPING },
  "agent.spawned": { state: STATES.WORKING, ttlMs: 300_000 },
  "agent.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "agent.failed": { state: STATES.ERROR, ttlMs: 20_000 },
  "tool.started": { state: STATES.WORKING, ttlMs: 120_000 },
  "tool.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "tool.failed": { state: STATES.ERROR, ttlMs: 20_000 },
  "voice.listening": { state: STATES.LISTENING, ttlMs: 45_000 },
  "voice.transcribing": { state: STATES.THINKING, ttlMs: 180_000, label: "Transcribing locally" },
  "voice.transcribed": { state: STATES.SUCCESSFUL, ttlMs: 5_000, label: "Transcription ready" },
  "voice.failed": { state: STATES.ERROR, ttlMs: 20_000, label: "Transcription failed" },
  "voice.speaking": { state: STATES.SPEAKING, ttlMs: 60_000 },
  "voice.stopped": { state: STATES.IDLE },
  "model.started": { state: STATES.THINKING, ttlMs: 180_000 },
  "model.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "model.failed": { state: STATES.ERROR, ttlMs: 20_000 },
  "browser.searching": { state: STATES.RESEARCHING, ttlMs: 90_000 },
  "browser.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "browser.failed": { state: STATES.ERROR, ttlMs: 20_000 },
  "shell.running": { state: STATES.WORKING, ttlMs: 120_000 },
  "shell.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "shell.failed": { state: STATES.ERROR, ttlMs: 20_000 },
  "memory.read": { state: STATES.THINKING, ttlMs: 30_000, label: "Recalling" },
  "memory.saved": { state: STATES.SUCCESSFUL, ttlMs: 5_000, label: "Remembered" },
  "memory.updated": { state: STATES.SUCCESSFUL, ttlMs: 5_000, label: "Memory updated" },
  "memory.consolidated": { state: STATES.SUCCESSFUL, ttlMs: 5_000, label: "Memory consolidated" },
  "personality.updated": { state: STATES.SUCCESSFUL, ttlMs: 5_000, label: "Personality evolved" },
  "routine.started": { state: STATES.WORKING, ttlMs: 300_000 },
  "routine.completed": { state: STATES.SUCCESSFUL, ttlMs: 5_000 },
  "routine.failed": { state: STATES.ERROR, ttlMs: 20_000 },
});

const TERMINAL_SUFFIXES = [".completed", ".failed", ".stopped"];

function isoNow(clock = Date) {
  return new clock().toISOString();
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDirectory(filePath);
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

class StateEngine {
  constructor({ statePath, eventLogPath, clock = Date, onChange = () => {} }) {
    this.statePath = statePath;
    this.eventLogPath = eventLogPath;
    this.clock = clock;
    this.onChange = onChange;
    this.seenIds = new Set();
    this.state = readJson(statePath, this.defaultState());
    // A process restart invalidates transient work. Preserve history, but never
    // resurrect an animation for work that may no longer exist.
    this.activeTasks = new Map();
    this.state = { ...this.state, schemaVersion: 2, state: STATES.IDLE, foreground_state: STATES.IDLE, label: "Idle", sourceEvent: "state.recovered", detail: null, expiresAt: null, taskId: null, project_id: null, project_label: null, project_accent: null, activeTaskCount: 0, activeTasks: [], active_task: null, active_tasks: [], background_activities: [] };
    writeJsonAtomic(this.statePath, this.state);
  }

  defaultState() {
    return {
      schemaVersion: 2,
      state: STATES.IDLE,
      foreground_state: STATES.IDLE,
      label: "Idle",
      sourceEvent: null,
      detail: null,
      updatedAt: isoNow(this.clock),
      expiresAt: null,
      lastCompletedAt: null,
      lastErrorAt: null,
      project_id: null,
      project_label: null,
      project_accent: null,
      activeTaskCount: 0,
      activeTasks: [],
      active_task: null,
      active_tasks: [],
      background_activities: [],
      recent_events: [],
    };
  }

  snapshot() {
    this.expireIfNeeded();
    return { ...this.state };
  }

  ingest(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("event must be a JSON object");
    }
    if (typeof input.event !== "string" || !EVENT_RULES[input.event]) {
      throw new Error("event type is not supported");
    }
    for (const field of ["task_id", "source", "timestamp"]) {
      if (typeof input[field] !== "string" || !input[field]) throw new Error(`event ${field} is required`);
    }
    if (input.id && this.seenIds.has(input.id)) return this.snapshot();

    // Do not let a background heartbeat/routine extend an expired foreground
    // animation. Expire transient UI state before applying the new event.
    this.expireIfNeeded();

    const rule = EVENT_RULES[input.event];
    const now = new this.clock();
    const detail = typeof input.detail === "string" ? input.detail.slice(0, 240) : null;
    const event = {
      id: typeof input.id === "string" ? input.id.slice(0, 120) : `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
      event: input.event,
      task_id: input.task_id.slice(0, 160),
      parent_task_id: typeof input.parent_task_id === "string" ? input.parent_task_id.slice(0, 160) : null,
      source: input.source.slice(0, 80),
      timestamp: input.timestamp,
      label: typeof input.label === "string" ? input.label.slice(0, 120) : null,
      foreground: input.foreground !== false,
      metadata: compactMetadata(input.metadata),
      detail,
      receivedAt: now.toISOString(),
    };
    this.seenIds.add(event.id);
    if (this.seenIds.size > 500) this.seenIds.delete(this.seenIds.values().next().value);

    const terminal = TERMINAL_SUFFIXES.some(suffix => event.event.endsWith(suffix));
    if (terminal) this.activeTasks.delete(event.task_id);
    else if (rule.ttlMs && !event.event.startsWith("memory.")) {
      this.activeTasks.set(event.task_id, {
        task_id: event.task_id,
        state: rule.state,
        label: event.label || rule.label || labelFor(rule.state),
        sourceEvent: event.event,
        source: event.source,
        foreground: event.foreground,
        parent_task_id: event.parent_task_id,
        project_id: event.metadata.project_id || null,
        project_label: event.metadata.project_label || null,
        project_accent: event.metadata.project_accent || null,
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + rule.ttlMs).toISOString(),
      });
    }
    this.pruneExpiredTasks(now.getTime());
    const active = [...this.activeTasks.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const foreground = active.filter(task => task.foreground !== false);
    const background = active.filter(task => task.foreground === false);
    const display = foreground[0] || null;
    const eventState = event.foreground ? rule.state : (this.state.foreground_state || this.state.state || STATES.IDLE);
    const eventLabel = event.foreground ? (event.label || rule.label || labelFor(rule.state)) : (this.state.label || "Idle");
    const eventProject = event.foreground ? event.metadata : this.state;
    const recentEvents = [...(this.state.recent_events || []), event].slice(-50);
    const next = {
      ...this.state,
      schemaVersion: 2,
      state: display?.state || eventState,
      foreground_state: display?.state || eventState,
      label: display?.label || eventLabel,
      sourceEvent: display?.sourceEvent || (event.foreground ? event.event : this.state.sourceEvent),
      taskId: display?.task_id || (event.foreground ? event.task_id : this.state.taskId || null),
      project_id: display?.project_id || eventProject.project_id || null,
      project_label: display?.project_label || eventProject.project_label || null,
      project_accent: display?.project_accent || eventProject.project_accent || null,
      detail: event.foreground ? event.detail : this.state.detail,
      updatedAt: now.toISOString(),
      expiresAt: display?.expiresAt || (event.foreground && rule.ttlMs ? new Date(now.getTime() + rule.ttlMs).toISOString() : this.state.expiresAt),
      activeTaskCount: active.length,
      activeTasks: active.slice(0, 20),
      active_task: display?.task_id || null,
      active_tasks: foreground.map(task => task.task_id).slice(0, 20),
      background_activities: background.slice(0, 20),
      recent_events: recentEvents,
    };
    if (event.event.endsWith(".completed")) next.lastCompletedAt = now.toISOString();
    if (event.event.endsWith(".failed")) next.lastErrorAt = now.toISOString();
    this.persist(event, next);
    return { ...next };
  }

  expireIfNeeded() {
    const now = new this.clock().getTime();
    this.pruneExpiredTasks(now);
    if (!this.state.expiresAt || Date.parse(this.state.expiresAt) > now) return;
    const next = { ...this.state, state: STATES.IDLE, foreground_state: STATES.IDLE, label: "Idle", sourceEvent: "state.expired", taskId: null, project_id: null, project_label: null, project_accent: null, detail: null, expiresAt: null, updatedAt: isoNow(this.clock), active_task: null };
    this.persist({ event: "state.expired", task_id: "state-engine", source: "state-engine", timestamp: next.updatedAt }, next);
  }

  pruneExpiredTasks(now) {
    for (const [id, task] of this.activeTasks) {
      if (task.expiresAt && Date.parse(task.expiresAt) <= now) this.activeTasks.delete(id);
    }
  }

  persist(event, next) {
    ensureDirectory(this.eventLogPath);
    fs.appendFileSync(this.eventLogPath, `${JSON.stringify(event)}\n`, "utf8");
    this.state = next;
    writeJsonAtomic(this.statePath, next);
    this.onChange({ ...next });
  }
}

function compactMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 12)) {
    if (typeof item === "string") result[key.slice(0, 60)] = item.slice(0, 240);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) result[key.slice(0, 60)] = item;
  }
  return result;
}

function labelFor(state) {
  return state.slice(0, 1).toUpperCase() + state.slice(1);
}

module.exports = { EVENT_RULES, STATES, StateEngine };
