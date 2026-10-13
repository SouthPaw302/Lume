"use strict";

const { sha256 } = require("./io");

function seeded(seed) {
  let state = Number.parseInt(sha256(String(seed)).slice(0, 8), 16) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { seeded };
