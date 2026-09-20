// src/jevEvaluator.js
// Handwritten heuristic evaluator using Jev-style question names.
// evaluateLocal does not run Jev. Its numbers are rules, not calibrated model
// probabilities; do not count these outputs as Jev inference in experiments.

export class JevEvaluator {
    constructor() {
        this.model = 'typesafe/jev-1.13';
        this.apiEndpoint = '/api/jev/decision';
        this.openRouterDirectEndpoint = 'https://openrouter.ai/api/alpha/decisions';
    }

    // Local heuristic outputs for the learning workflow; no model inference.
    evaluateLocal(state, questions) {
        const results = {};

        for (const [key, q] of Object.entries(questions)) {
            if (q.type === 'noul') {
                results[key] = this._evalLocalNoul(key, q, state);
            } else if (q.type === 'score') {
                results[key] = this._evalLocalScore(key, q, state);
            } else if (q.type === 'choice') {
                results[key] = this._evalLocalChoice(key, q, state);
            }
        }

        return results;
    }

    _evalLocalNoul(key, q, state) {
        // Evacuate log probability: increases sharply as frog approaches outer boundaries on moving log
        if (key === 'evacuate_log' || q.instructions.includes('drifting')) {
            const z = state.z !== undefined ? state.z : (state.player ? state.player.currPosition.z : 12);
            const x = state.x !== undefined ? state.x : (state.player ? state.player.currPosition.x : 0);
            if (z >= 1 && z <= 5) {
                const absX = Math.abs(x);
                if (absX >= 4.5) return 0.98;
                if (absX >= 3.8) return 0.85;
                if (absX >= 3.0) return 0.55;
                if (absX >= 2.0) return 0.20;
                return 0.05;
            }
            return 0.01;
        }

        // Forward path clear probability
        if (key === 'forward_path_clear' || q.instructions.includes('ahead')) {
            if (state.actionEvaluations && state.actionEvaluations['UP']) {
                return state.actionEvaluations['UP'].safe ? 0.92 : 0.05;
            }
            return 0.50;
        }

        // Post-mortem quarantine probability
        if (key === 'should_quarantine_action' || q.instructions.includes('blocked') || q.instructions.includes('quarantine')) {
            if (state.deathType === 'crash' && state.z === 0) return 0.99; // 100% block diving into wall
            if (state.deathType === 'drown' && Math.abs(state.x) > 4.5) return 0.95; // 95% block riding to border
            return 0.80;
        }

        return 0.50;
    }

    _evalLocalScore(key, q, state) {
        const criteria = q.criteria || [];
        if (criteria.length === 0) return null;

        if (key === 'threat_level') {
            const z = state.z !== undefined ? state.z : 12;
            const x = state.x !== undefined ? state.x : 0;
            if (z === 12 || z === 6) return criteria[0]; // 'safe'
            if (z >= 7 && z <= 11) return criteria[2] || criteria[1]; // 'moderate_risk'
            if (z >= 1 && z <= 5) {
                if (Math.abs(x) > 4.2) return criteria[criteria.length - 1]; // 'fatal_collision_imminent' or 'imminent_hazard'
                return criteria[1] || criteria[0]; // 'low_risk'
            }
            return criteria[0];
        }

        if (key === 'root_cause_severity') {
            if (state.deathType === 'crash' && state.z === 0) return criteria[criteria.length - 1]; // 'fatal_carelessness'
            if (state.deathType === 'drown' && Math.abs(state.x) > 4.5) return criteria[criteria.length - 2] || criteria[criteria.length - 1];
            return criteria[1] || criteria[0];
        }

        return criteria[0];
    }

    _evalLocalChoice(key, q, state) {
        const criteria = q.criteria || {};
        const options = Object.keys(criteria);
        if (options.length === 0) return null;

        // Post-mortem culprit triage
        if (key === 'culprit_phase') {
            if (state.deathType === 'crash' && state.z === 0) return 'barrier_impact';
            if (state.deathType === 'drown' && Math.abs(state.x) > 4.2) return 'drift_neglect';
            if (state.deathType === 'drown') return 'premature_forward_hop';
            return options[0];
        }

        // Portal selection
        if (key === 'target_portal_choice' || key === 'target_portal') {
            if (state.openPortals && state.openPortals.length > 0) {
                const x = state.x || 0;
                const closest = state.openPortals.reduce((best, p) => 
                    Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best
                );
                const portalKey = `portal_${closest.x < 0 ? 'neg' + Math.abs(closest.x) : (closest.x > 0 ? 'pos' + closest.x : '0')}`;
                if (criteria[portalKey]) return portalKey;
                return options[0];
            }
        }

        // Tactical movement action
        if (key === 'action') {
            if (state.actionEvaluations) {
                const safeSorted = Object.entries(state.actionEvaluations)
                    .filter(([_, ev]) => ev.safe)
                    .sort((a, b) => b[1].totalScore - a[1].totalScore);
                if (safeSorted.length > 0) return safeSorted[0][0];
            }
            return options[0];
        }

        return options[0];
    }

    // Unified evaluation query: Tries remote endpoint first if configured, falls back to local Jev evaluation
    async queryJev(state, questions, apiKey = '', useRemote = false) {
        if (!useRemote) {
            return this.evaluateLocal(state, questions);
        }

        const stateText = typeof state === 'string' ? state : JSON.stringify(state);
        const payload = {
            model: this.model,
            state: stateText,
            questions: questions
        };

        try {
            const resp = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                },
                body: JSON.stringify(payload)
            });

            if (resp.ok) {
                const data = await resp.json();
                return data;
            }
        } catch (err) {
            // Fall through to local evaluation
        }

        return this.evaluateLocal(state, questions);
    }
}
