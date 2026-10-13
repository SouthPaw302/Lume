"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const secretPatterns = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /(?:api[_-]?key|token|password)\s*[:=]\s*["'][^"']{12,}["']/i
];
const findings = [];
for (const relative of files) {
  const file = path.join(ROOT, relative); let stat;
  try { stat = fs.statSync(file); } catch (_) { continue; }
  if (!stat.isFile()) continue;
  if (stat.size > 5 * 1024 * 1024) findings.push(`${relative}: oversized (${stat.size} bytes)`);
  if (stat.size > 2 * 1024 * 1024) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of secretPatterns) if (pattern.test(text)) findings.push(`${relative}: possible secret matching ${pattern}`);
}
if (findings.length) { console.error(findings.join("\n")); process.exit(1); }
console.log(`repository check passed (${files.length} visible files)`);
