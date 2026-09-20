// Jev-only baseline. No oracle, learning, action ranking, or alternate-model imports.
const ACTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'WAIT'];
const THREATS = ['safe', 'low_risk', 'moderate_risk', 'imminent_hazard', 'fatal_collision_imminent'];

export class JevOnlyAgent {
    constructor(engine, { transport, persist, timeoutMs = 9000 } = {}) {
        this.engine = engine;
        engine.useSimulationClock = true;
        this.enabled = false;
        this.isDeciding = false;
        this.error = null;
        this.generation = 0;
        this.sequence = 0;
        this.decisionCount = 0;
        this.idleTicks = 0;
        this.controller = null;
        this.activeDecision = null;
        this.lastAppliedId = null;
        this.onTelemetry = null;
        this.lastLatency = 0;
        this.timeoutMs = timeoutMs;
        this.sessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        this.events = [];
        this.stats = { captures: 0, deaths: 0, errors: 0, invalidMoves: 0 };
        this.logQueue = Promise.resolve();
        this.transport = transport ?? this.query.bind(this);
        this.persist = persist ?? (async event => {
            const response = await fetch('/api/jev/baseline/event', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event)
            });
            if (!response.ok) throw new Error(`Recording failed (HTTP ${response.status})`);
        });
        engine.onAIInputReady = null;
        engine.beforePhysicsStep = () => this.beforeStep();
        engine.onDecisionInvalidated = () => this.invalidate();
        engine.onPortalScore = () => {
            if (!this.enabled || !engine.aiMode) return;
            this.stats.captures++;
            this.record('outcome', { decisionId: this.lastAppliedId, outcome: 'portal' });
        };
        engine.onDeathOccurred = cause => {
            if (!this.enabled || !engine.aiMode) return;
            this.stats.deaths++;
            this.record('outcome', { decisionId: this.lastAppliedId, outcome: 'death', cause });
        };
    }

    record(type, data = {}) {
        const event = { sessionId: this.sessionId, eventIndex: this.events.length,
            recordedAt: new Date().toISOString(), mode: 'jev-only-frozen-time', type, ...data };
        this.events.push(event);
        this.logQueue = this.logQueue.then(() => this.persist(event)).catch(() => {
            this.error = 'Recording failed. Export this session, then retry.';
            this.controller?.abort();
            this.engine.pendingAIIntent = null;
            this.notify('ERROR');
        });
    }

    start() {
        if (this.enabled) return;
        this.enabled = true;
        this.error = null;
        this.invalidate();
        this.record('started', { provider: 'openrouter', requestedModel: 'typesafe/jev-1.13',
            learning: false, safetyVeto: false, fallback: false, timeoutMs: this.timeoutMs });
        this.notify('READY');
    }

    stop() {
        this.enabled = false;
        this.invalidate();
        this.record('stopped');
        this.onTelemetry?.({ enabled: false });
    }

    invalidate() {
        this.generation++;
        this.controller?.abort();
        this.controller = null;
        this.isDeciding = false;
        if (this.activeDecision) this.record('canceled', { decisionId: this.activeDecision });
        this.activeDecision = null;
        this.engine.pendingAIIntent = null;
        this.idleTicks = 0;
    }

    retry() {
        if (!this.enabled) return;
        this.invalidate();
        this.error = null;
        this.record('retry');
        this.notify('READY');
    }

    beforeStep() {
        if (!this.enabled || !this.engine.aiMode) return true;
        if (this.error || this.isDeciding) return false;
        if (this.engine.pendingAIIntent || this.engine.player.isHopping) return true;
        if (this.idleTicks > 0) { this.idleTicks--; return true; }
        // Start at a pre-tick snapshot. All simulation state remains unchanged
        // until a response is available, including roads, rivers, and countdown.
        void this.decide();
        return false;
    }

    buildRequest() {
        const e = this.engine;
        let progress = 0, hopTicks = 0;
        while (progress < 1) { progress += e.fixedDeltaTime * e.player.hopSpeed; hopTicks++; }
        return { provider: 'openrouter', model: 'typesafe/jev-1.13',
            state: {
                rules: {
                    goal: 'Reach any unfilled portal at z=0 without dying.',
                    movement: 'UP: z-1 if z>0. DOWN: z+1 if z<12. LEFT: x-1 if x>-5. RIGHT: x+1 if x<5. WAIT: stay idle, with river drift. Illegal directions do nothing and are recorded as invalid.',
                    timing: `World is frozen while you answer. Once your action arrives, obstacles move first, then the command is applied. A hop lands after ${hopTicks} further physics ticks. WAIT runs ${hopTicks + 1} ticks before your next decision. No log drift during a hop.`,
                    dtSeconds: e.fixedDeltaTime,
                    roads: 'Rows 7..11: a grounded frog dies if abs(frog.x-car.x) <= car.length/2 + 0.2. Checked before input and on landing; no airborne collisions.',
                    river: 'Rows 1..5: at landing or while idle, a log must overlap abs(frog.x-log.x) <= log.length/2 + 0.2, else drown. While idle, after moving logs, check overlap then carry the frog by log.speed*dt. Drifting outside x=-6.5..6.5 is fatal.',
                    banks: 'Rows 12 and 6 are safe from cars and water.',
                    portals: 'At z=0, an unfilled portal must have abs(frog.x-portal.x)<0.5, else crash.',
                    obstacles: 'Each tick x+=speed*dt. Beyond x=9.5 moving right, wrap to -9.5; beyond -9.5 moving left, wrap to 9.5.',
                    countdown: 'Countdown reaching zero is fatal; frozen during requests.'
                },
                player: { x: e.player.currPosition.x, z: e.player.currPosition.z },
                level: e.level, countdownSeconds: e.countdownTimer,
                portals: e.portals.map(p => ({ x: p.x, filled: p.filled })),
                obstacles: e.obstacles.map(o => ({ x: o.x, z: o.laneZ, speed: o.speed, length: o.length, type: o.type }))
            },
            questions: {
                action: { type: 'choice', instructions: 'Choose the next action to survive and advance toward an unfilled portal. Use the supplied state and rules. No external safety checker will override your choice.',
                    criteria: { UP: 'Hop toward the portals.', DOWN: 'Hop away from the portals.', LEFT: 'Hop left.', RIGHT: 'Hop right.', WAIT: 'Wait for a better opportunity, allowing traffic and logs to move.' } },
                threat_level: { type: 'score', instructions: 'Rate the immediate danger in the current position.', criteria: THREATS },
                evacuate_log: { type: 'noul', instructions: 'Does the frog need to leave its current log now to avoid drifting out of bounds?' },
                forward_path_clear: { type: 'noul', instructions: 'Would choosing UP now survive through landing under the supplied rules?' }
            }
        };
    }

    async query(request, signal) {
        const response = await fetch('/api/jev/decision', { method: 'POST', signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        if (!response.ok) throw new Error(`Jev request failed (HTTP ${response.status})`);
        return response.json();
    }

    async decide() {
        if (this.isDeciding || !this.enabled || !this.engine.aiMode || this.engine.state !== 'PLAYING') return;
        this.isDeciding = true;
        const generation = this.generation, revision = this.engine.stateRevision;
        const decisionId = ++this.sequence;
        this.activeDecision = decisionId;
        const request = this.buildRequest();
        const controller = new AbortController();
        this.controller = controller;
        const start = performance.now();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let abort;
        const canceled = new Promise((_, reject) => {
            abort = () => reject(new Error('Jev request canceled or timed out'));
            controller.signal.addEventListener('abort', abort, { once: true });
        });
        this.record('request', { decisionId, request, snapshot: { level: this.engine.level,
            player: structuredClone(this.engine.player), obstacles: structuredClone(this.engine.obstacles),
            portals: structuredClone(this.engine.portals), countdownTimer: this.engine.countdownTimer } });
        this.notify('THINKING');
        try {
            const response = await Promise.race([this.transport(request, controller.signal), canceled]);
            const latencyMs = performance.now() - start;
            this.record('response', { decisionId, latencyMs, response });
            if (generation !== this.generation || revision !== this.engine.stateRevision || !this.enabled || !this.engine.aiMode) return;
            if (this.error) return;
            const action = response?.answers?.action?.choice;
            if (!/^(typesafe\/)?jev-/.test(response?.model ?? '') || !ACTIONS.includes(action)) {
                throw new Error('Response lacks a valid Jev action');
            }
            const answers = response.answers;
            if (answers.action.type !== 'choice' || answers.threat_level?.type !== 'score'
                || !Number.isFinite(answers.threat_level.score) || answers.threat_level.score < 0 || answers.threat_level.score > 4
                || ['evacuate_log', 'forward_path_clear'].some(key => answers[key]?.type !== 'noul'
                    || !Number.isFinite(answers[key].noul) || answers[key].noul < 0 || answers[key].noul > 1)) {
                throw new Error('Response contains invalid Jev telemetry');
            }
            this.lastLatency = Math.round(latencyMs);
            this.engine.queueAIIntent(() => {
                if (generation !== this.generation || revision !== this.engine.stateRevision || this.error) return null;
                return { action, onResolved: ({ accepted }) => {
                    this.activeDecision = null;
                    this.lastAppliedId = decisionId;
                    this.decisionCount++;
                    if (!accepted) this.stats.invalidMoves++;
                    if (action === 'WAIT' || !accepted) {
                        let progress = 0;
                        while (progress < 1) { progress += this.engine.fixedDeltaTime * this.engine.player.hopSpeed; this.idleTicks++; }
                    }
                    this.record('applied', { decisionId, action, accepted, stats: { ...this.stats } });
                    this.notify(action, response);
                } };
            });
        } catch (error) {
            if (generation !== this.generation || !this.enabled) return;
            this.stats.errors++;
            this.error = error.message;
            this.record('error', { decisionId, latencyMs: performance.now() - start, message: this.error });
            this.activeDecision = null;
            this.notify('ERROR');
        } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', abort);
            if (generation === this.generation) {
                this.isDeciding = false;
                this.controller = null;
            }
        }
    }

    notify(action, response) {
        const answers = response?.answers;
        const score = answers?.threat_level?.score;
        this.onTelemetry?.({ enabled: this.enabled, mode: 'jev-only', action,
            source: 'JEV ONLY', latency: this.lastLatency, decisionCount: this.decisionCount,
            threatLevel: Number.isFinite(score) ? THREATS[Math.max(0, Math.min(4, Math.round(score)))] : 'unknown',
            evacuateLog: answers?.evacuate_log?.noul, forwardClear: answers?.forward_path_clear?.noul,
            error: this.error, stats: { ...this.stats }, model: response?.model,
            stateSummary: this.error ?? (action === 'THINKING' ? 'Waiting for Jev · simulation frozen'
                : action === 'FINISHED' ? 'Run complete · recorded locally' : 'Jev-only · simulation freezes during requests') });
    }

    exportSession() {
        return JSON.stringify({ sessionId: this.sessionId, mode: 'jev-only-frozen-time', stats: this.stats, events: this.events }, null, 2);
    }
}
