import { JevEvaluator } from './jevEvaluator.js';

export class LearningBrain {
    constructor() {
        this.storageKey = 'neonhop_learning_brain_v1';
        this.legacyKey = 'arcade_learning_brain_v1';
        this.jev = new JevEvaluator();
        this.targetStreak = 100;
        this.currentStreak = 0;
        this.bestStreak = 0;
        this.totalRuns = 0;
        this.totalDeaths = 0;
        this.totalVetoes = 0;
        this.deathsByCause = {
            'crash': 0,
            'drown': 0,
            'out-of-bounds': 0,
            'timeout': 0
        };

        // Q-Table: stateKey -> { action: Q-value }
        this.qTable = {};
        
        // Trap Memory: stateKey:action -> penalty counter
        this.traps = {};

        // Episodic step trace buffer for temporal credit assignment
        this.recentSteps = [];
        this.maxStepHistory = 15;

        // Learning Hyperparameters
        this.alpha = 0.25;  // Learning rate
        this.gamma = 0.85;  // Discount factor
        this.rewardSuccess = 100.0;
        this.penaltyDeath = -150.0;

        this.load();
    }

    // Discretizes state into an invariant feature key
    getStateKey(engine, x, z) {
        const roundedX = Math.round(x);
        const roundedZ = Math.round(z);

        // Speed tier based on current level multiplier
        const level = engine.level || 1;
        const speedTier = Math.min(5, Math.floor((level - 1) / 2));

        // Closest open portal lateral delta
        const openPortals = engine.portals ? engine.portals.filter(p => !p.filled) : [];
        let portalDelta = 0;
        if (openPortals.length > 0) {
            const closest = openPortals.reduce((prev, curr) => 
                Math.abs(curr.x - roundedX) < Math.abs(prev.x - roundedX) ? curr : prev
            );
            portalDelta = Math.max(-5, Math.min(5, Math.round(closest.x - roundedX)));
        }

        return `z${roundedZ}:pdx${portalDelta}:spd${speedTier}`;
    }

    getQValue(stateKey, action) {
        if (!this.qTable[stateKey]) {
            this.qTable[stateKey] = { UP: 0, WAIT: 0, LEFT: 0, RIGHT: 0, DOWN: 0 };
        }
        return this.qTable[stateKey][action] || 0;
    }

    setQValue(stateKey, action, val) {
        if (!this.qTable[stateKey]) {
            this.qTable[stateKey] = { UP: 0, WAIT: 0, LEFT: 0, RIGHT: 0, DOWN: 0 };
        }
        this.qTable[stateKey][action] = val;
    }

    getTrapPenalty(stateKey, action) {
        const trapKey = `${stateKey}:${action}`;
        return (this.traps[trapKey] || 0) * 40;
    }

    recordStep(engine, action) {
        const x = engine.player.currPosition.x;
        const z = engine.player.currPosition.z;
        const stateKey = this.getStateKey(engine, x, z);

        this.recentSteps.push({
            stateKey,
            action,
            x,
            z,
            timestamp: performance.now()
        });

        if (this.recentSteps.length > this.maxStepHistory) {
            this.recentSteps.shift();
        }
    }

    // Called on portal capture
    recordSuccess(portalIndex, score) {
        this.currentStreak++;
        this.totalRuns++;
        if (this.currentStreak > this.bestStreak) {
            this.bestStreak = this.currentStreak;
        }

        // Backpropagate positive reward through recent steps
        let currentReward = this.rewardSuccess;
        for (let i = this.recentSteps.length - 1; i >= 0; i--) {
            const step = this.recentSteps[i];
            const oldQ = this.getQValue(step.stateKey, step.action);
            const newQ = oldQ + this.alpha * (currentReward - oldQ);
            this.setQValue(step.stateKey, step.action, Math.round(newQ * 10) / 10);
            currentReward *= this.gamma; // Discount earlier steps
        }

        this.recentSteps = [];
        this.save();
    }

    // Called on death: Jev Post-Mortem Incident Triage replaces naive credit assignment
    recordDeath(deathType, engine) {
        this.totalDeaths++;
        this.currentStreak = 0;
        if (this.deathsByCause[deathType] !== undefined) {
            this.deathsByCause[deathType]++;
        }

        if (this.recentSteps.length > 0) {
            const lastStep = this.recentSteps[this.recentSteps.length - 1];
            const triageState = {
                deathType,
                x: engine.player.currPosition.x,
                z: engine.player.currPosition.z,
                level: engine.level,
                recentSteps: this.recentSteps
            };

            const triageQuestions = {
                culprit_phase: {
                    type: 'choice',
                    instructions: 'Identify the primary cause of failure:',
                    criteria: {
                        drift_neglect: 'Allowed log to carry frog into boundary zone without timely inward repositioning',
                        premature_forward_hop: 'Hopped forward onto water or moving obstacle before arrival was verified',
                        barrier_impact: 'Hopped into solid portal wall or already-filled portal at z=0',
                        fatal_entrapment: 'Boxed into a tile with zero viable escape options'
                    }
                },
                root_cause_severity: {
                    type: 'score',
                    instructions: 'Rate the severity of the mistake:',
                    criteria: ['minor_mistiming', 'tactical_misjudgment', 'critical_blunder', 'fatal_carelessness']
                },
                should_quarantine_action: {
                    type: 'noul',
                    instructions: 'Should this state-action transition receive an emergency quarantine penalty?'
                }
            };

            const verdict = this.jev.evaluateLocal(triageState, triageQuestions);
            this.lastTriageVerdict = verdict;

            // Targeted credit assignment based on Jev verdict:
            if (verdict.culprit_phase === 'drift_neglect') {
                // Spatially localized credit assignment: ONLY penalize WAIT on the fatal lane in the boundary zone
                const fatalLaneZ = engine.player.currPosition.z;
                for (const step of this.recentSteps) {
                    if (step.action === 'WAIT' && step.z === fatalLaneZ && Math.abs(step.x) >= 3.0) {
                        const trapKey = `${step.stateKey}:WAIT`;
                        this.traps[trapKey] = (this.traps[trapKey] || 0) + 2;
                        const oldQ = this.getQValue(step.stateKey, 'WAIT');
                        this.setQValue(step.stateKey, 'WAIT', oldQ - 120);
                    }
                }
            } else if (verdict.culprit_phase === 'barrier_impact') {
                for (const step of this.recentSteps) {
                    if (step.z === 1 && step.action === 'UP') {
                        const trapKey = `${step.stateKey}:UP`;
                        this.traps[trapKey] = (this.traps[trapKey] || 0) + 5;
                        this.setQValue(step.stateKey, 'UP', -500);
                    }
                }
            } else {
                // Only penalize the final fatal step, NEVER innocent lateral inward hops!
                const fatalStep = this.recentSteps[this.recentSteps.length - 1];
                if (fatalStep && fatalStep.action !== 'LEFT' && fatalStep.action !== 'RIGHT') {
                    const trapKey = `${fatalStep.stateKey}:${fatalStep.action}`;
                    this.traps[trapKey] = (this.traps[trapKey] || 0) + 1;
                    const oldQ = this.getQValue(fatalStep.stateKey, fatalStep.action);
                    this.setQValue(fatalStep.stateKey, fatalStep.action, oldQ - 150);
                }
            }
        }

        this.recentSteps = [];
        this.save();
    }

    recordVeto() {
        this.totalVetoes++;
        this.save();
    }

    getLearnedContextForJev(engine) {
        const topTraps = Object.keys(this.traps).length;
        return [
            `RUN STATS: Streak=${this.currentStreak}/${this.targetStreak} (Best=${this.bestStreak}). Total Runs=${this.totalRuns}, Deaths=${this.totalDeaths}.`,
            `LEARNED DANGER MEMORY: Known death traps mapped=${topTraps}. Active speed tier=${Math.min(5, Math.floor(((engine.level || 1) - 1) / 2))}.`,
            `POLICY DIRECTIVE: Prioritize validated safe crossing windows over premature forward hops.`
        ].join(' ');
    }

    save() {
        try {
            const data = {
                currentStreak: this.currentStreak,
                bestStreak: this.bestStreak,
                totalRuns: this.totalRuns,
                totalDeaths: this.totalDeaths,
                totalVetoes: this.totalVetoes,
                deathsByCause: this.deathsByCause,
                qTable: this.qTable,
                traps: this.traps
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (e) {
            // Storage quota or sandboxed
        }
    }

    load() {
        try {
            let raw = localStorage.getItem(this.storageKey);
            if (!raw && localStorage.getItem(this.legacyKey)) {
                raw = localStorage.getItem(this.legacyKey);
                try { localStorage.setItem(this.storageKey, raw); } catch (e) {}
            }
            if (raw) {
                const data = JSON.parse(raw);
                this.currentStreak = data.currentStreak || 0;
                this.bestStreak = data.bestStreak || 0;
                this.totalRuns = data.totalRuns || 0;
                this.totalDeaths = data.totalDeaths || 0;
                this.totalVetoes = data.totalVetoes || 0;
                if (data.deathsByCause) this.deathsByCause = data.deathsByCause;
                if (data.qTable) this.qTable = data.qTable;
                if (data.traps) this.traps = data.traps;
            }
        } catch (e) {
            // Error recovering defaults
        }
    }

    reset() {
        this.totalVetoes = 0;
        this.lastTriageVerdict = null;
        this.currentStreak = 0;
        this.bestStreak = 0;
        this.totalRuns = 0;
        this.totalDeaths = 0;
        this.deathsByCause = { crash: 0, drown: 0, 'out-of-bounds': 0, timeout: 0 };
        this.qTable = {};
        this.traps = {};
        this.recentSteps = [];
        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.legacyKey);
        } catch (e) {}
    }
}
