"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Semaphore, SessionStore, buildPrompt } = require("../lib/direct-chat");
const { isTrustedLanAddress } = require("../lib/lan-policy");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lume-direct-"));
const store = new SessionStore(directory);
const one = "a".repeat(32); const two = "b".repeat(32);
store.save(one, Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` })));
assert.equal(store.load(one).messages.length, 20);
assert.equal(store.load(two).messages.length, 0);
store.clear(one); assert.equal(store.load(one).messages.length, 0);
const messages = buildPrompt({ capsule: { identity: { name: "Lume" }, core_traits: {}, relevant_memories: [{ text: "x".repeat(9000) }] }, history: Array.from({ length: 30 }, () => ({ role: "user", content: "h".repeat(5000) })), message: "q".repeat(9000), library: [{ title: "t", excerpt: "z".repeat(9000) }] });
assert(JSON.stringify(messages).length < 1700);
assert(messages.slice(1, -1).length <= 4);
assert(messages[0].content.includes("persistent hatchling companion"));
assert(isTrustedLanAddress("::ffff:192.168.12.82"));
assert(isTrustedLanAddress("127.0.0.1"));
assert(!isTrustedLanAddress("192.168.13.5"));
(async () => {
  const slots = new Semaphore(2); const first = await slots.acquire(); const second = await slots.acquire(); let thirdStarted = false;
  const third = slots.acquire().then(release => { thirdStarted = true; release(); });
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(thirdStarted, false);
  first(); await third; second(); assert.equal(thirdStarted, true);
  process.stdout.write("direct chat policy tests passed\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
