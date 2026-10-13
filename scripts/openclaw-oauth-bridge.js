#!/usr/bin/env node
"use strict";

const { createOAuthBridge } = require("../src/openclaw-oauth-bridge");

const host = "127.0.0.1";
const port = Number(process.env.LUME_OAUTH_BRIDGE_PORT || 12437);
const server = createOAuthBridge();
server.listen(port, host, () => console.log(`Lume OpenClaw OAuth bridge listening on http://${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
