import { JevAgent } from './jevAgent.js';
import { supportedState } from './candidateForecasts.js';

// Jev is the only runtime inference model. Local forecasts and the existing
// shield/learning policy support it. Freeze only while a sampled request runs.
export class SupportedJevAgent extends JevAgent {
    constructor(engine, { transport, persist, timeoutMs = 8000 } = {}) {
        super(engine);
        this.remoteBudgetMs = timeoutMs;
        this.nextRequestAt = 0;
        this.requestIntervalMs = 2000;
        this.sessionId = globalThis.crypto?.randomUUID?.() ?? `supported-${Date.now()}`;
        this.events = [];
        this.logQueue = Promise.resolve();
        this.supportStatus = 'Jev + local forecasts · safety checked';
        this.remoteStats = { requests: 0, accepted: 0, vetoed: 0, failures: 0, local: 0 };
        this.transport = transport ?? this.querySupported.bind(this);
        this.persist = persist ?? (async event => {
            const r = await fetch('/api/jev/baseline/event', { method:'POST',
                headers:{'Content-Type':'application/json'},body:JSON.stringify(event) });
            if (!r.ok) throw new Error('Recording failed');
        });
        engine.useSimulationClock = true;
        engine.beforePhysicsStep = () => {
            if (!this.enabled || !engine.aiMode) return true;
            if (this.isDeciding) return false;
            if (engine.player.isHopping || engine.pendingAIIntent || engine.inputQueue.length) return true;
            if (performance.now() >= Math.max(this.nextRequestAt, this.remoteRetryAt)) {
                void this.evaluateNextMove();
                return false;
            }
            return true; // Original onAIInputReady supplies local movement between requests.
        };
        const death = engine.onDeathOccurred, success = engine.onPortalScore;
        engine.onDeathOccurred = cause => { death(cause); if(this.enabled) this.record('death',{cause,stats:{...this.remoteStats}}); };
        engine.onPortalScore = (i,s) => { success(i,s); if(this.enabled) this.record('capture',{portal:i,score:s,stats:{...this.remoteStats}}); };
    }
    scheduleNext() {} // Requests start at stable pre-tick snapshots, never a wall timer.
    start() { if(this.enabled)return; super.start(); this.nextRequestAt=0; this.record('started',{provider:'openrouter',model:this.model,intervalMs:this.requestIntervalMs,timeoutMs:this.remoteBudgetMs}); }
    stop() { super.stop(); this.record('stopped',{stats:{...this.remoteStats}}); }
    record(type,data={}) {
        const event={sessionId:this.sessionId,mode:'jev-supported',eventIndex:this.events.length,recordedAt:new Date().toISOString(),type,...data};
        this.events.push(event);
        this.logQueue=this.logQueue.then(()=>this.persist(event)).catch(()=>{this.supportStatus='Recording error · local control continues';});
    }
    async querySupported(payload,signal) {
        const r=await fetch(this.apiEndpoint,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!r.ok)throw new Error(`Jev HTTP ${r.status}`);
        const response=await r.json();
        if(!/^(typesafe\/)?jev-/.test(response?.model??''))throw new Error('Non-Jev response rejected');
        return response;
    }
    async evaluateNextMove() {
        const generation=this.generation,revision=this.engine.stateRevision;
        if(this.isDeciding || !this.isCurrent(generation,revision))return;
        this.isDeciding=true;
        const started=performance.now(), controller=new AbortController();
        this.activeController=controller;
        const requestId=++this.remoteStats.requests;
        let timer;
        try {
            const questions=this.buildQuestions();
            questions.action={type:'choice',instructions:'Select a legal action that survives the ten-tick horizon and makes useful progress toward an open portal. Use the local candidate predictions: prefer surviving candidates, then higher progressScore. A prediction is computed by local game physics, not another model. Return your chosen action.',criteria:Object.fromEntries(['UP','DOWN','LEFT','RIGHT','WAIT'].map(a=>[a,a]))};
            const payload={provider:'openrouter',model:this.model,state:supportedState(this.engine),questions};
            this.record('request',{requestId,payload});
            this.supportStatus='Waiting for Jev · simulation frozen';
            this.notifyTelemetry({enabled:true,source:'JEV REQUEST',action:'THINKING',latency:0,decisionCount:this.decisionCount});
            const canceled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Jev canceled or timed out')),{once:true}));
            timer=setTimeout(()=>controller.abort(),this.remoteBudgetMs);
            const response=await Promise.race([this.transport(payload,controller.signal),canceled]);
            if(!/^(typesafe\/)?jev-/.test(response?.model??''))throw new Error('Non-Jev response rejected');
            const decision=this.parseJevResponse(response);
            this.record('response',{requestId,latencyMs:performance.now()-started,response});
            if(!this.isCurrent(generation,revision)){this.record('canceled',{requestId});return;}
            this.supportStatus='Jev + local forecasts · safety checked';
            this.engine.queueAIIntent(()=> {
                if(!this.isCurrent(generation,revision))return null;
                const resolved=this.resolveDecision(decision,started);
                const accepted=resolved.onAccepted;
                resolved.onAccepted=()=>{accepted();this.record('applied',{requestId,proposed:decision.action,executed:resolved.action,stats:{...this.remoteStats}});};
                return resolved;
            });
        } catch(error) {
            this.record('request_error',{requestId,message:error.message});
            if(generation===this.generation){this.remoteStats.failures++;this.remoteRetryAt=performance.now()+this.remoteRetryDelay;this.supportStatus='Jev unavailable · local control · retry after 30s';}
        } finally {
            clearTimeout(timer);
            if(generation===this.generation){this.isDeciding=false;this.activeController=null;this.nextRequestAt=performance.now()+this.requestIntervalMs;}
        }
    }
    notifyTelemetry(data) {
        if(data.modelAction){ if(data.safetyVetoed)this.remoteStats.vetoed++;else this.remoteStats.accepted++; }
        else if(data.action && !['OFF','THINKING','RESET'].includes(data.action))this.remoteStats.local++;
        super.notifyTelemetry({threatLevel:'unknown',evacuateLog:0,forwardClear:0,streak:this.brain.currentStreak,bestStreak:this.brain.bestStreak,...data,supportStatus:this.supportStatus,remoteStats:{...this.remoteStats}});
    }
}
