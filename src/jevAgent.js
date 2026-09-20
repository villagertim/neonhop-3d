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
        this.decisionInterval = 110; // Decision loop cadence in ms
        this.timerId = null;

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
        this.runLoop();
    }

    stop() {
        this.enabled = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.isDeciding = false;
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
        if (this.apiKey) {
            localStorage.setItem('neonhop_openrouter_key', this.apiKey);
        } else {
            localStorage.removeItem('neonhop_openrouter_key');
            localStorage.removeItem('arcade_openrouter_key');
        }
    }

    resetBrain() {
        this.brain.reset();
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

    async runLoop() {
        if (!this.enabled) return;

        // Only evaluate decisions when the game is actively running
        if (this.engine.state === 'PLAYING') {
            if (!this.engine.player.isHopping && !this.isDeciding) {
                await this.evaluateNextMove();
            }
        }

        // Schedule next check (scaled by simulation speed)
        if (this.enabled) {
            const adjustedInterval = Math.max(20, Math.round(this.decisionInterval / (this.engine.simulationSpeed || 1.0)));
            this.timerId = setTimeout(this.runLoop, adjustedInterval);
        }
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

    async evaluateNextMove() {
        this.isDeciding = true;
        const snapshot = this.serializeGameState();
        const startTime = performance.now();

        // 1. Evaluate Physics Oracle & Safety Shield for all candidate moves
        const candidateActions = ['UP', 'WAIT', 'LEFT', 'RIGHT', 'DOWN'];
        const actionEvaluations = {};

        for (const action of candidateActions) {
            const evalResult = this.oracle.verifyLookaheadEscape(this.engine, action);
            const qVal = this.brain.getQValue(snapshot.stateKey, action);
            const trapPenalty = this.brain.getTrapPenalty(snapshot.stateKey, action);
            
            actionEvaluations[action] = {
                ...evalResult,
                qVal,
                trapPenalty,
                totalScore: evalResult.safe ? (evalResult.score + qVal - trapPenalty) : -9999
            };
        }

        // 2. 3-Primitive Schema for TypeSafe Jev
        const questions = {
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

        let chosenAction = 'WAIT';
        let threatLevel = 'safe';
        let source = 'JEV-1.13';
        let evacuateLog = 0.05;
        let forwardClear = actionEvaluations['UP'].safe ? 0.95 : 0.05;

        // Try Jev API if enabled and not in high-speed simulation
        let jevDecision = null;
        if (this.engine.simulationSpeed <= 1.0) {
            try {
                jevDecision = await this.queryJevAPI(snapshot.stateText, questions);
            } catch (err) {
                // Graceful fallback to predictive learned policy
            }
        }

        if (jevDecision && jevDecision.action) {
            const candidate = jevDecision.action;
            // Verify Jev's chosen action against the Physics Oracle Safety Shield!
            if (actionEvaluations[candidate] && actionEvaluations[candidate].safe) {
                chosenAction = candidate;
                source = 'JEV-1.13 (VERIFIED SAFE)';
            } else {
                // Jev recommended an unsafe move -> Safety Shield Vetoes and picks safest learned move!
                chosenAction = this.pickBestLearnedAction(actionEvaluations);
                source = `SAFETY SHIELD VETO (${candidate} -> ${chosenAction})`;
                this.brain.recordDeath('crash', this.engine); // Mark trap in memory
            }
            if (jevDecision.threat_level) threatLevel = jevDecision.threat_level;
            if (typeof jevDecision.evacuate_log === 'number') evacuateLog = jevDecision.evacuate_log;
            if (typeof jevDecision.forward_path_clear === 'number') forwardClear = jevDecision.forward_path_clear;
        } else {
            // Local Predictive Learned Policy
            chosenAction = this.pickBestLearnedAction(actionEvaluations);
            source = 'LEARNED PREDICTIVE POLICY';
            
            // Calibrate threat score
            const bestEval = actionEvaluations[chosenAction];
            if (!bestEval.safe) threatLevel = 'fatal_collision_imminent';
            else if (snapshot.z >= 7 && snapshot.z <= 11) threatLevel = 'moderate_risk';
            else if (snapshot.z >= 1 && snapshot.z <= 5) threatLevel = Math.abs(snapshot.x) > 4.5 ? 'imminent_hazard' : 'low_risk';
            else threatLevel = 'safe';

            if (snapshot.z >= 1 && snapshot.z <= 5 && Math.abs(snapshot.x) > 4.5) {
                evacuateLog = 0.92;
            }
        }

        const latency = Math.round(performance.now() - startTime);
        this.lastLatency = latency;
        this.decisionCount++;

        // Record step in learning trace
        this.brain.recordStep(this.engine, chosenAction);

        // Execute action if not WAIT and game is active
        if (chosenAction !== 'WAIT' && this.engine.state === 'PLAYING') {
            this.engine.queueMovement(chosenAction);
        }

        // Broadcast telemetry
        this.notifyTelemetry({
            enabled: true,
            action: chosenAction,
            threatLevel: threatLevel,
            evacuateLog: evacuateLog,
            forwardClear: forwardClear,
            latency: latency,
            source: source,
            decisionCount: this.decisionCount,
            streak: this.brain.currentStreak,
            bestStreak: this.brain.bestStreak,
            targetStreak: this.brain.targetStreak,
            totalRuns: this.brain.totalRuns,
            totalDeaths: this.brain.totalDeaths,
            qValue: actionEvaluations[chosenAction] ? actionEvaluations[chosenAction].qVal : 0,
            stateSummary: `Frog at (${snapshot.x}, ${snapshot.z}) -> ${chosenAction}`
        });

        this.isDeciding = false;
    }

    pickBestLearnedAction(actionEvaluations) {
        // Filter actions verified as safe by the Physics Oracle
        const safeCandidates = Object.entries(actionEvaluations)
            .filter(([_, ev]) => ev.safe);

        if (safeCandidates.length === 0) {
            // Emergency desperation fallback: pick candidate with least negative score
            const allSorted = Object.entries(actionEvaluations)
                .sort((a, b) => b[1].totalScore - a[1].totalScore);
            return allSorted[0][0];
        }

        // Sort by learned combined score (Physics + Q-value - TrapPenalty)
        safeCandidates.sort((a, b) => b[1].totalScore - a[1].totalScore);
        return safeCandidates[0][0];
    }

    async queryJevAPI(stateText, questions) {
        const payload = {
            model: this.model,
            state: stateText,
            questions: questions
        };

        // Try local gateway proxy server first
        try {
            const resp = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.decisions) {
                    return this.parseJevResponse(data.decisions);
                }
            }
        } catch (e) {}

        // Direct OpenRouter if user provided API key
        if (this.apiKey) {
            const resp = await fetch(this.directOpenRouterEndpoint, {
                method: 'POST',
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
                if (data && data.decisions) {
                    return this.parseJevResponse(data.decisions);
                }
            }
        }

        throw new Error('Jev API unavailable');
    }

    parseJevResponse(decisions) {
        const result = {};
        for (const [key, val] of Object.entries(decisions)) {
            if (val && typeof val === 'object') {
                result[key] = val.choice || val.score || val.probability || val.response || val;
            } else {
                result[key] = val;
            }
        }
        return result;
    }

    notifyTelemetry(data) {
        if (this.onTelemetry) {
            this.onTelemetry(data);
        }
    }
}
