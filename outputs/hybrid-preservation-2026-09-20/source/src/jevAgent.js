// src/jevAgent.js
// Autonomous Cyber-Arcade Agent powered by TypeSafe Jev (typesafe/jev-1.13) System One Decision Model,
// Predictive Spatio-Temporal Physics Oracle, and Run-to-Run Experience Replay Learning Brain.

import { PhysicsOracle } from './physicsOracle.js';
import { LearningBrain } from './learningBrain.js';

export class JevAgent {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.oracle = new PhysicsOracle();
        this.brain = new LearningBrain();

        this.enabled = false;
        this.isDeciding = false;
        this.decisionInterval = 1000 / 60; // Remote polling; local control also runs on physics ticks
        this.timerId = null;
        this.generation = 0;
        this.activeController = null;
        this.remoteBudgetMs = 100;
        this.remoteRetryAt = 0;
        this.remoteRetryDelay = 30000;
        this.engine.onDecisionInvalidated = () => this.invalidateDecisions();
        this.engine.onAIInputReady = () => {
            const generation = this.generation;
            const revision = this.engine.stateRevision;
            if (!this.isDeciding && this.isCurrent(generation, revision)) {
                const started = performance.now();
                this.engine.queueAIIntent(() => this.isCurrent(generation, revision)
                    ? this.resolveDecision(null, started) : null);
            }
        };

        // Telemetry stats
        this.decisionCount = 0;
        this.lastLatency = 0;
        this.lastDecision = null;
        this.onTelemetry = null; // Callback: (telemetryData) => void

        // API Configuration
        this.apiEndpoint = '/api/jev/decision';
        this.directOpenRouterEndpoint = 'https://openrouter.ai/api/alpha/decisions';
        this.apiKey = typeof localStorage !== 'undefined' 
            ? (localStorage.getItem('neonhop_openrouter_key') || localStorage.getItem('arcade_openrouter_key') || '') 
            : '';
        this.model = 'typesafe/jev-1.13';

        // Connect Engine Learning Hooks
        this.engine.onPortalScore = (portalIndex, score) => {
            this.brain.recordSuccess(portalIndex, score);
        };
        this.engine.onDeathOccurred = (deathType) => {
            this.brain.recordDeath(deathType, this.engine);
        };

        // Bindings
        this.runLoop = this.runLoop.bind(this);
    }

    start() {
        if (this.enabled) return;
        this.enabled = true;
        this.isDeciding = false;
        this.decisionCount = 0;
        this.invalidateDecisions();
    }

    stop() {
        this.enabled = false;
        this.invalidateDecisions();
        this.notifyTelemetry({
            enabled: false,
            action: 'OFF',
            threatLevel: 'inactive',
            evacuateLog: 0,
            forwardClear: 1.0,
            latency: 0,
            source: 'NONE',
            streak: this.brain.currentStreak,
            bestStreak: this.brain.bestStreak,
            totalRuns: this.brain.totalRuns
        });
    }

    setApiKey(key) {
        this.apiKey = key ? key.trim() : '';
        this.remoteRetryAt = 0;
        if (this.apiKey) {
            localStorage.setItem('neonhop_openrouter_key', this.apiKey);
        } else {
            localStorage.removeItem('neonhop_openrouter_key');
            localStorage.removeItem('arcade_openrouter_key');
        }
    }

    resetBrain() {
        this.engine.invalidateDecisions();
        this.brain.reset();
        this.decisionCount = 0;
        this.lastDecision = null;
        this.lastLatency = 0;
        this.notifyTelemetry({
            enabled: this.enabled,
            action: 'RESET',
            threatLevel: 'safe',
            evacuateLog: 0,
            forwardClear: 1.0,
            latency: 0,
            source: 'BRAIN RESET',
            streak: 0,
            bestStreak: 0,
            totalRuns: 0
        });
    }

    invalidateDecisions() {
        this.generation++;
        this.activeController?.abort();
        this.activeController = null;
        this.isDeciding = false;
        this.engine.pendingAIIntent = null;
        clearTimeout(this.timerId);
        this.timerId = null;
        if (this.enabled) this.scheduleNext(0);
    }

    scheduleNext(delay = Math.max(1, this.decisionInterval / this.engine.simulationSpeed)) {
        clearTimeout(this.timerId);
        const generation = this.generation;
        this.timerId = setTimeout(() => {
            if (generation === this.generation) this.runLoop();
        }, delay);
    }

    async runLoop() {
        if (!this.enabled) return;
        const generation = this.generation;
        try {
            if (this.engine.state === 'PLAYING' && !this.engine.player.isHopping &&
                !this.engine.pendingAIIntent && !this.isDeciding) {
                await this.evaluateNextMove();
            }
        } finally {
            if (this.enabled && generation === this.generation) this.scheduleNext();
        }
    }

    isCurrent(generation, revision) {
        return this.enabled && this.engine.aiMode && generation === this.generation &&
            revision === this.engine.stateRevision && this.engine.state === 'PLAYING' &&
            !this.engine.player.isHopping && this.engine.inputQueue.length === 0;
    }

    evaluateActions() {
        const { x, z } = this.engine.player.currPosition;
        const stateKey = this.brain.getStateKey(this.engine, x, z);
        return Object.fromEntries(['UP', 'WAIT', 'LEFT', 'RIGHT', 'DOWN'].map(action => {
            const evaluation = this.oracle.verifyLookaheadEscape(this.engine, action);
            const immediate = evaluation.safe ? evaluation : this.oracle.evaluateActionSafety(this.engine, action);
            const qVal = this.brain.getQValue(stateKey, action);
            const trapPenalty = this.brain.getTrapPenalty(stateKey, action);
            return [action, { ...evaluation, immediate, qVal, trapPenalty,
                totalScore: evaluation.safe ? evaluation.score + qVal - trapPenalty : evaluation.score }];
        }));
    }

    // Comprehensive snapshot of the grid for Jev System One reasoning, augmented with learned memory
    serializeGameState() {
        const player = this.engine.player;
        const x = Math.round(player.currPosition.x * 10) / 10;
        const z = Math.round(player.currPosition.z);
        const obstacles = this.engine.obstacles;

        // Identify current zone
        let zone = 'Sidewalk Safe Zone';
        if (z >= 7 && z <= 11) zone = `Highway Traffic Lane (z=${z})`;
        else if (z === 6) zone = 'Median Rest Bank';
        else if (z >= 1 && z <= 5) zone = `Digital Data Stream (z=${z})`;
        else if (z === 0) zone = 'Goal Portals';

        // Find nearest open portal
        const openPortals = this.engine.portals
            .map((p, idx) => ({ ...p, index: idx }))
            .filter(p => !p.filled);
        const closestPortal = openPortals.reduce((closest, p) => {
            if (!closest) return p;
            return Math.abs(p.x - x) < Math.abs(closest.x - x) ? p : closest;
        }, null);

        // Analyze nearby lanes
        const analyzeLane = (laneZ) => {
            if (laneZ < 0 || laneZ > 12) return 'Out of bounds';
            if (laneZ === 12 || laneZ === 6) return 'Safe resting platform (no vehicles)';
            if (laneZ === 0) {
                const portal = this.engine.portals.find(p => Math.abs(x - p.x) <= 0.35);
                if (portal && !portal.filled) return `Open target portal at x=${portal.x}`;
                if (portal && portal.filled) return `OCCUPIED portal at x=${portal.x} (DEADLY)`;
                return 'Solid barrier wall (DEADLY)';
            }
            if (laneZ >= 7 && laneZ <= 11) {
                const cars = obstacles.filter(o => o.laneZ === laneZ);
                const nearCars = cars.map(c => {
                    const dist = Math.round((c.x - x) * 10) / 10;
                    return `car(x=${Math.round(c.x * 10) / 10}, spd=${c.speed.toFixed(1)}, dist=${dist})`;
                }).join(', ');
                return `Road: ${nearCars || 'empty'}`;
            }
            if (laneZ >= 1 && laneZ <= 5) {
                const logs = obstacles.filter(o => o.laneZ === laneZ);
                const nearLogs = logs.map(l => {
                    const dist = Math.round((l.x - x) * 10) / 10;
                    const onLog = Math.abs(x - l.x) <= (l.length / 2 - 0.35);
                    return `log(x=${Math.round(l.x * 10) / 10}, spd=${l.speed.toFixed(1)}, len=${l.length}, safe=${onLog})`;
                }).join(', ');
                return `Stream: ${nearLogs || 'water (drown)'}`;
            }
            return 'Unknown';
        };

        const stateKey = this.brain.getStateKey(this.engine, x, z);
        const learnedContext = this.brain.getLearnedContextForJev(this.engine);

        const stateText = [
            `FROG STATUS: Coordinates (x=${x}, z=${z}). Zone: ${zone}.`,
            `LANE DETAILS:`,
            `- Front Lane (z=${z - 1}): ${analyzeLane(z - 1)}`,
            `- Current Lane (z=${z}): ${analyzeLane(z)}`,
            `- Back Lane (z=${z + 1}): ${analyzeLane(z + 1)}`,
            `GOAL: Closest open portal is at x=${closestPortal ? closestPortal.x : 'None'} (${closestPortal ? (closestPortal.x - x).toFixed(1) + ' lateral hops' : 'all full'}). Goal line is ${z} hops forward.`,
            `COUNTDOWN TIMER: ${this.engine.countdownTimer.toFixed(1)}s remaining.`,
            `LEARNED BRAIN MEMORY: ${learnedContext}`
        ].join('\n');

        return {
            stateText,
            stateKey,
            x,
            z,
            closestPortal
        };
    }

    buildQuestions() {
        return {
            "action": {
                "type": "choice",
                "instructions": "Determine the single best immediate movement for the cyber-frog to advance toward an empty goal portal (z=0) while surviving traffic, riding logs across the digital stream, and avoiding deadly obstacles or drowning:",
                "criteria": {
                    "UP": "Hop forward toward the target portals (z decreases). Choose if the front tile is verified safe and leads toward an open portal.",
                    "DOWN": "Hop backward away from danger (z increases). Choose if trapped with no forward escape or falling off stream edge.",
                    "LEFT": "Hop left (x decreases). Choose to dodge oncoming vehicles, align with a floating log, or shift toward an unoccupied portal.",
                    "RIGHT": "Hop right (x increases). Choose to dodge oncoming vehicles, align with a floating log, or shift toward an unoccupied portal.",
                    "WAIT": "Stay in current position. Choose if current tile is safe (sidewalk, safe bank, or riding safely on a log) and moving in any direction right now would be fatal."
                }
            },
            "threat_level": {
                "type": "score",
                "instructions": "Evaluate the immediate collision or drowning threat to the frog in its current position:",
                "criteria": ["safe", "low_risk", "moderate_risk", "imminent_hazard", "fatal_collision_imminent"]
            },
            "evacuate_log": {
                "type": "noul",
                "instructions": "Is the frog currently riding a log that is dangerously close to drifting off the screen boundaries (|x| > 4.8) requiring an immediate jump off?"
            },
            "forward_path_clear": {
                "type": "noul",
                "instructions": "Is the lane or tile directly ahead (z-1) verified safe from incoming vehicle collisions or drowning?"
            }
        };
    }

    async evaluateNextMove() {
        const generation = this.generation;
        const revision = this.engine.stateRevision;
        if (this.isDeciding || !this.isCurrent(generation, revision)) return;
        this.isDeciding = true;
        const snapshot = this.serializeGameState();
        const startTime = performance.now();
        const questions = this.buildQuestions();

        let controller;
        let budgetTimer;
        let onAbort;
        try {
            let decision = null;
            const z = this.engine.player.currPosition.z;
            if (this.engine.simulationSpeed <= 1.0 && (z === 12 || z === 6) && performance.now() >= this.remoteRetryAt) {
                controller = new AbortController();
                this.activeController = controller;
                // One deadline spans the gateway, response body, and direct fallback.
                const aborted = new Promise((_, reject) => {
                    onAbort = () => reject(new Error('Decision canceled or timed out'));
                    controller.signal.addEventListener('abort', onAbort, { once: true });
                });
                budgetTimer = setTimeout(() => controller.abort(), this.remoteBudgetMs);
                try {
                    decision = await Promise.race([
                        this.queryJevAPI(snapshot.stateText, questions, controller.signal), aborted
                    ]);
                } catch {
                    if (generation === this.generation) this.remoteRetryAt = performance.now() + this.remoteRetryDelay;
                    // Current local policy is selected at the next physics input step.
                }
            }
            if (!this.isCurrent(generation, revision)) return;
            // Capture only the proposal. The physics step evaluates the moving board
            // after obstacles advance, immediately before initiating the actual hop.
            this.engine.queueAIIntent(() => {
                if (!this.isCurrent(generation, revision)) return null;
                return this.resolveDecision(decision, startTime);
            });
        } finally {
            clearTimeout(budgetTimer);
            if (controller && onAbort) controller.signal.removeEventListener('abort', onAbort);
            if (generation === this.generation) {
                this.isDeciding = false;
                if (this.activeController === controller) this.activeController = null;
            }
        }
    }

    resolveDecision(decision, startTime) {
        const evaluations = this.evaluateActions();
        const candidate = decision?.action;
        const acceptedRemote = candidate && evaluations[candidate]?.safe;
        const chosenAction = acceptedRemote ? candidate : this.pickBestLearnedAction(evaluations);
        const vetoed = Boolean(candidate && !evaluations[candidate]?.safe);
        const safe = evaluations[chosenAction].safe;
        let source = acceptedRemote ? 'JEV-1.13 (VERIFIED SAFE)' : 'LOCAL PREDICTIVE POLICY';
        if (vetoed) source = `SAFETY SHIELD VETO (${candidate} -> ${chosenAction})`;
        if (!safe) source += evaluations[chosenAction].immediate?.safe
            ? ' (ESCAPE UNCONFIRMED)' : ' (UNSAFE EMERGENCY)';
        const { x, z } = this.engine.player.currPosition;
        let threatLevel = !safe ? 'fatal_collision_imminent' :
            (z >= 7 && z <= 11 ? 'moderate_risk' :
                (z >= 1 && z <= 5 ? (Math.abs(x) > 4.5 ? 'imminent_hazard' : 'low_risk') : 'safe'));
        let evacuateLog = z >= 1 && z <= 5 && Math.abs(x) > 4.5 ? 0.92 : 0.05;
        let forwardClear = evaluations.UP.safe ? 0.95 : 0.05;
        // Preserve the model's other primitives for accepted remote proposals;
        // substituted local actions report local telemetry instead.
        if (acceptedRemote) {
            if (typeof decision.threat_level === 'string') threatLevel = decision.threat_level;
            // Score is a weighted numeric index; only the HUD uses a rounded label.
            // Keep the original score/distribution in modelDecision below.
            if (Number.isFinite(decision.threat_level)) {
                const labels = ['safe', 'low_risk', 'moderate_risk', 'imminent_hazard', 'fatal_collision_imminent'];
                threatLevel = labels[Math.max(0, Math.min(4, Math.round(decision.threat_level)))];
            }
            if (Number.isFinite(decision.evacuate_log)) evacuateLog = decision.evacuate_log;
            if (Number.isFinite(decision.forward_path_clear)) forwardClear = decision.forward_path_clear;
        }
        return {
            action: chosenAction,
            onAccepted: () => {
                if (vetoed) this.brain.recordVeto();
                this.brain.recordStep(this.engine, chosenAction);
                this.lastLatency = Math.round(performance.now() - startTime);
                this.decisionCount++;
                this.lastDecision = chosenAction;
                this.notifyTelemetry({
                    enabled: true, action: chosenAction, threatLevel, source,
                    modelDecision: decision, modelAction: candidate ?? null, safetyVetoed: vetoed,
                    evacuateLog, forwardClear,
                    latency: this.lastLatency, decisionCount: this.decisionCount,
                    streak: this.brain.currentStreak, bestStreak: this.brain.bestStreak,
                    targetStreak: this.brain.targetStreak, totalRuns: this.brain.totalRuns,
                    totalDeaths: this.brain.totalDeaths, totalVetoes: this.brain.totalVetoes,
                    qValue: evaluations[chosenAction].qVal,
                    stateSummary: `Frog at (${x}, ${z}) -> ${chosenAction}`
                });
            }
        };
    }

    pickBestLearnedAction(actionEvaluations) {
        // A proved forward crossing takes precedence over generic positioning
        // bonuses and historic learned preferences for waiting.
        if (actionEvaluations.UP?.safe) return 'UP';
        // Filter actions verified as safe by the Physics Oracle
        const safeCandidates = Object.entries(actionEvaluations)
            .filter(([_, ev]) => ev.safe);

        if (safeCandidates.length === 0) {
            // Failure to prove a later escape is not proof that the next hop is safe.
            // Keep a currently survivable option ahead of an immediate collision.
            const survivable = Object.entries(actionEvaluations)
                .filter(([, ev]) => ev.immediate?.safe)
                .sort((a, b) => b[1].immediate.score - a[1].immediate.score);
            if (survivable.length) return survivable[0][0];
            // Emergency desperation fallback: pick candidate with least negative score
            const allSorted = Object.entries(actionEvaluations)
                .sort((a, b) => b[1].totalScore - a[1].totalScore);
            return allSorted[0][0];
        }

        // Sort by learned combined score (Physics + Q-value - TrapPenalty)
        safeCandidates.sort((a, b) => b[1].totalScore - a[1].totalScore);
        return safeCandidates[0][0];
    }

    async queryJevAPI(stateText, questions, signal) {
        signal?.throwIfAborted();
        const payload = {
            model: this.model,
            state: stateText,
            questions: questions
        };

        // Try local gateway proxy server first
        try {
            const resp = await fetch(this.apiEndpoint, {
                method: 'POST',
                signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && !data.error && (data.answers || data.decisions || data.action)) {
                    return this.parseJevResponse(data);
                }
            }
        } catch (e) {}

        signal?.throwIfAborted();

        // Direct OpenRouter if user provided API key
        if (this.apiKey) {
            const resp = await fetch(this.directOpenRouterEndpoint, {
                method: 'POST',
                signal,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin || 'https://antigravity.google',
                    'X-Title': 'NeonHop 3D Jev AI Agent'
                },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && !data.error && (data.answers || data.decisions || data.action)) {
                    return this.parseJevResponse(data);
                }
            }
        }

        throw new Error('Jev API unavailable');
    }

    parseJevResponse(response) {
        const decisions = response.answers ?? response.decisions ?? response;
        if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) {
            throw new Error('Invalid Jev answers');
        }
        const result = {};
        for (const [key, val] of Object.entries(decisions)) {
            if (val && typeof val === 'object') {
                result[key] = val.choice ?? val.score ?? val.noul ?? val.probability ?? val.response ?? val;
            } else {
                result[key] = val;
            }
        }
        if (!['UP', 'DOWN', 'LEFT', 'RIGHT', 'WAIT'].includes(result.action)) {
            throw new Error('Jev response lacks a valid action');
        }
        // Preserve all simultaneous answers, probabilities, score legends, actual
        // model version, and usage. These are evidence, including after a veto.
        result.rawResponse = response;
        return result;
    }

    notifyTelemetry(data) {
        if (this.onTelemetry) {
            this.onTelemetry(data);
        }
    }
}
