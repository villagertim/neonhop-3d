import fs from 'node:fs';
import {ACTIONS,replay,modelState} from './jev-evaluation.mjs';
const dir='outputs/jev-supported-final-test';
const corpus=JSON.parse(fs.readFileSync('outputs/jev-pilot-2026-09-20/corpus.json')).records;
const questions={action:{type:'choice',instructions:'Select a legal action that survives the ten-tick horizon and makes useful progress toward an open portal. If local candidate predictions are supplied, use them: prefer surviving candidates, then higher progressScore. A prediction is computed by local game physics, not another model. Return your chosen action.',criteria:Object.fromEntries(ACTIONS.map(a=>[a,a]))}};
if(process.argv[2]==='prepare'){
 const cases=[];
 for(const zone of ['bank','road','river']) for(const upSafe of [false,true]){
  const r=corpus.find(r=>r.split==='development'&&r.zone===zone&&replay(r.snapshot,'UP').safe===upSafe&&ACTIONS.some(a=>replay(r.snapshot,a).safe));
  if(!r)continue;
  const candidates=Object.fromEntries(ACTIONS.map(a=>[a,replay(r.snapshot,a)]));
  cases.push({id:r.id,zone,upSafe,snapshot:r.snapshot,state:modelState(r.snapshot),candidates,local:replay(r.snapshot,'LOCAL'),questions});
 }
 fs.writeFileSync(`${dir}/cases.json`,JSON.stringify(cases,null,2));
 console.log(cases.map(c=>({id:c.id,zone:c.zone,upSafe:c.upSafe,local:c.local.executedAction})));
}else{
 const cases=JSON.parse(fs.readFileSync(`${dir}/cases.json`));
 const traces=fs.readFileSync(`${dir}/traces.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
 const results=traces.map(t=>{const c=cases.find(c=>c.id===t.stateId);const a=t.response?.answers?.action?.choice;return {...t,grade:ACTIONS.includes(a)?replay(c.snapshot,a):null,local:c.local,shielded:ACTIONS.includes(a)?replay(c.snapshot,a,{shield:true}):null,bestProgress:Math.max(...Object.values(c.candidates).filter(x=>x.safe).map(x=>x.progressScore))};});
 fs.writeFileSync(`${dir}/graded.json`,JSON.stringify(results,null,2));
 console.log(results.map(r=>({id:r.stateId,variant:r.variant,action:r.response?.answers?.action?.choice,safe:r.grade?.safe,progress:r.grade?.progressScore,best:r.bestProgress,ms:r.latencyMs})));
}
