"""One bounded 12-request paired Jev experiment; no retries or other models."""
import sys,json,time,datetime,hashlib,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import server
out=ROOT/'outputs/jev-supported-final-test'
cases=json.loads((out/'cases.json').read_text())
manifest={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'maximumRequests':len(cases)*2,'timeoutSeconds':8,'retries':0,'selection':'First development state per zone and UP survival class with at least one safe action; no held-out states','hypothesis':'Supplying deterministic candidate forecasts improves Jev safe/progress selection over identical geometry-only questions','primaryMetric':'raw chosen action survives ten ticks','secondaryMetric':'chosen progressScore equals best safe candidate score','limitations':'Small selected development sample; frozen state; predictions and grading share engine; not a full-game or net improvement over local policy claim','casesSha256':hashlib.sha256((out/'cases.json').read_bytes()).hexdigest(),'estimatedCost':'12 calls at previous roughly 0.0001 cost per request; approximately 0.0012 reported currency units, variable with tokens','sources':{}}
for name in ['src/gameEngine.js','src/jevAgent.js','src/physicsOracle.js','src/learningBrain.js','src/jevEvaluator.js','benchmarks/jev-evaluation.mjs','benchmarks/jev-supported-final-test.mjs','benchmarks/jev-supported-final-test.py']:
 p=ROOT/name;dest=out/'source'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes());manifest['sources'][name]=hashlib.sha256(p.read_bytes()).hexdigest()
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
with (out/'traces.jsonl').open('x') as f:
 for i,c in enumerate(cases):
  for variant in (['geometry','supported'] if i%2==0 else ['supported','geometry']):
   state=dict(c['state'])
   if variant=='supported':
    state['localCandidatePredictions']={a:{k:v[k] for k in ['accepted','safe','death','captures','rowGain','progressScore']} for a,v in c['candidates'].items()}
    state['predictionRubric']='Exact local ten-tick simulation: safe requires legal accepted command and no death. progressScore 0=unsafe, 1=survives without forward progress and next UP unsafe, 2=survives without progress and next UP safe, 3=survives and advances, 4=captures portal. Predictions expire when state changes.'
   payload={'model':'typesafe/jev-1.13','state':state,'questions':c['questions']}
   trace={'stateId':c['id'],'variant':variant,'request':payload};start=time.perf_counter()
   try:
    req=urllib.request.Request('https://openrouter.ai/api/alpha/decisions',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+server.OPENROUTER_API_KEY,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=8) as r: trace['response']=json.loads(r.read());trace['status']=r.status
    model=trace['response'].get('model','')
    if not model.startswith('typesafe/jev-'):raise ValueError('Unexpected model')
   except Exception as e:
    trace['errorType']=type(e).__name__
   trace['latencyMs']=(time.perf_counter()-start)*1000
   f.write(json.dumps(trace)+'\n');f.flush()
   print(json.dumps({'state':c['id'],'variant':variant,'action':trace.get('response',{}).get('answers',{}).get('action',{}).get('choice'),'latencyMs':round(trace['latencyMs']),'error':trace.get('errorType')}),flush=True)
   if trace.get('errorType'):sys.exit(1)
