"use strict";
// Preserve deployed LAN routing unless the host explicitly selects ADB USB.
const LAN = Object.freeze({ qwen: "http://192.168.12.82:12435", kiwix: "http://192.168.12.82:8081", aurelian: "http://192.168.12.82:8082/health" });
const USB = Object.freeze({ qwen: "http://127.0.0.1:12435", kiwix: "http://127.0.0.1:18081", aurelian: "http://127.0.0.1:18082/health" });
function deviceEndpoints(env = process.env) {
  const selected = env.LUME_S10_TRANSPORT === "usb" ? USB : LAN;
  return {
    transport: env.LUME_S10_TRANSPORT === "usb" ? "usb" : "lan",
    qwen: env.LUME_QWEN_URL || selected.qwen,
    kiwix: env.LUME_KIWIX_URL || selected.kiwix,
    aurelian: env.LUME_AURELIAN_URL || selected.aurelian,
  };
}
module.exports = { LAN, USB, deviceEndpoints };
