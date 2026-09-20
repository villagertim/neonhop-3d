import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameEngine } from '../src/gameEngine.js';
import { SupportedJevAgent } from '../src/supportedJevAgent.js';
import { forecast } from '../src/candidateForecasts.js';
const cases=JSON.parse(fs.readFileSync(new URL('../outputs/jev-supported-final-test/cases.json',import.meta.url)));
const reply=action=>({model:'typesafe/jev-1.13-20260917',answers:{action:{type:'choice',choice:action}}});
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function setup(t,transport,options={}){const e=new GameEngine();e.state='PLAYING';e.aiMode=true;const logs=[];const a=new SupportedJevAgent(e,{transport,persist:async x=>logs.push(x),...options});a.start();t.after(()=>a.stop());return {e,a,logs};}
test('production forecasts reproduce all thirty frozen candidate results without changing live engine',()=>{
 for(const c of cases)for(const [action,expected]of Object.entries(c.candidates)){
  const got=forecast(c.snapshot,action);for(const k of Object.keys(got))assert.deepEqual(got[k],expected[k],`${c.id}/${action}/${k}`);
 }
});
test('request freezes world, includes forecasts, executes safe Jev choice and records attribution',async t=>{
 let resolve,payload;const {e,a,logs}=setup(t,p=>{payload=p;return new Promise(r=>resolve=r);});
 const before=JSON.stringify(e.obstacles),timer=e.countdownTimer;
 for(let i=0;i<20;i++)e.physicsUpdate(e.fixedDeltaTime);
 assert.equal(JSON.stringify(e.obstacles),before);assert.equal(e.countdownTimer,timer);
 assert.equal(payload.provider,'openrouter');assert.equal(Object.keys(payload.state.localCandidatePredictions).length,5);
 resolve(reply('LEFT'));await flush();e.physicsUpdate(e.fixedDeltaTime);await flush();
 assert.equal(a.remoteStats.accepted,1);assert.equal(logs.find(x=>x.type==='applied').proposed,'LEFT');
 assert.equal(e.player.targetPosition.x,-1);
});
test('unsafe Jev choice still receives existing shield veto',async t=>{
 const {e,a}=setup(t,async()=>reply('UP'));e.physicsUpdate(e.fixedDeltaTime);await flush();e.physicsUpdate(e.fixedDeltaTime);
 assert.equal(a.remoteStats.vetoed,1);assert.notEqual(a.lastDecision,'UP');
});
test('timeout resumes local policy with cooldown and does not issue repeated requests',async t=>{
 let calls=0;const {e,a}=setup(t,()=>{calls++;return new Promise(()=>{});},{timeoutMs:5});
 e.physicsUpdate(e.fixedDeltaTime);await new Promise(r=>setTimeout(r,15));
 for(let i=0;i<40;i++)e.physicsUpdate(e.fixedDeltaTime);
 assert.equal(calls,1);assert.equal(a.isDeciding,false);assert.ok(a.decisionCount>0);assert.equal(a.remoteStats.failures,1);
});
test('takeover discards outstanding Jev proposal and unfreezes physics',async t=>{
 let resolve;const {e,a,logs}=setup(t,()=>new Promise(r=>resolve=r));e.physicsUpdate(e.fixedDeltaTime);
 e.setAIMode(false);a.stop();resolve(reply('LEFT'));await flush();
 assert.equal(e.pendingAIIntent,null);assert.equal(a.remoteStats.accepted,0);assert.equal(logs.filter(x=>x.type==='applied').length,0);
 const before=e.countdownTimer;e.physicsUpdate(e.fixedDeltaTime);assert.ok(e.countdownTimer<before);
});
test('non-Jev response rejected and local control remains available',async t=>{
 const {e,a}=setup(t,async()=>({...reply('LEFT'),model:'other-model'}));e.physicsUpdate(e.fixedDeltaTime);await flush();e.physicsUpdate(e.fixedDeltaTime);
 assert.equal(a.remoteStats.failures,1);assert.equal(a.remoteStats.accepted,0);assert.ok(a.remoteStats.local>0);
});
