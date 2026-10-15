"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ExperimentEngine } = require("../src/experiment-engine");
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"lume-post-promotion-"));
  const options = { candidatesPath:path.join(dir,"candidates.jsonl"), evidencePath:path.join(dir,"evidence.jsonl"), ledgerPath:path.join(dir,"ledger.jsonl"), livePolicyPath:path.join(dir,"live.json"), policyHistoryPath:path.join(dir,"history") };
  const candidate = {id:"candidate-test",state:"promoted",created_at:"2026-10-01T00:00:00Z",mutation:{target:"uncertainty_threshold",operator:"strengthen",magnitude:0.1}};
  fs.writeFileSync(options.candidatesPath,JSON.stringify({at:"2026-10-10T00:00:00Z",candidate})+"\n");
  fs.writeFileSync(options.livePolicyPath,JSON.stringify({uncertainty_threshold:0.1}));
  return {engine:new ExperimentEngine(options),options,candidate};
}
function observed(id,passed) {return {episode_id:id,occurred_at:"2026-10-16T17:00:00Z",post_deployment:true,source:{kind:"real_interaction"},prompt:"correction",baseline:{text:"old"},candidate:{text:"new"},evaluation:{passed,deterministic_pass:passed}}; }
test("promoted candidate cannot accept unmarked evidence",()=>{const {engine,candidate}=setup();assert.throws(()=>engine.recordProspective(candidate.id,{...observed("one",true),post_deployment:false}),/exercised candidate or explicitly/);});
test("successful post-promotion real episode is recorded without re-promoting or altering policy",()=>{const {engine,options,candidate}=setup();const before=fs.readFileSync(options.livePolicyPath,"utf8");const state=engine.recordProspective(candidate.id,observed("one",true));assert.equal(state.state,"promoted");assert.equal(fs.readFileSync(options.livePolicyPath,"utf8"),before);assert.match(fs.readFileSync(options.evidencePath,"utf8"),/post_deployment/);});
test("failing post-promotion real episode marks native candidate regressed for controller rollback",()=>{const {engine,candidate}=setup();const state=engine.recordProspective(candidate.id,observed("bad",false));assert.equal(state.state,"regressed");assert.equal(engine.get(candidate.id).state,"regressed");});
