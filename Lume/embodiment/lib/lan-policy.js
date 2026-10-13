"use strict";

function normalizeAddress(value = "") {
  return String(value).replace(/^::ffff:/, "");
}

function isLoopbackAddress(value) {
  const address = normalizeAddress(value);
  return address === "127.0.0.1" || address === "::1";
}

function isTrustedLanAddress(value, prefix = "192.168.12.") {
  const address = normalizeAddress(value);
  if (isLoopbackAddress(address)) return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return false;
  return address.startsWith(prefix) && Number(address.split(".")[3]) >= 1 && Number(address.split(".")[3]) <= 254;
}

class RateLimiter {
  constructor({ limit = 20, windowMs = 60_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  allow(key, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

module.exports = { RateLimiter, isLoopbackAddress, isTrustedLanAddress, normalizeAddress };
