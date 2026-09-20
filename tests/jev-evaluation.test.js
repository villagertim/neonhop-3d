import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/gameEngine.js';
import { PhysicsOracle } from '../src/physicsOracle.js';
import { LearningBrain } from '../src/learningBrain.js';
import { ACTIONS, snapshot, replay, questionsFor, combineCandidates, attempt } from '../benchmarks/jev-evaluation.mjs';

function record() {
    const engine = new GameEngine();
    engine.obstacles = [];
    return { id: 'synthetic-state', trajectory: 0, split: 'development', snapshot: snapshot(engine) };
}
function response(variant = 'bundle', action = 'UP') {
    const answers = Object.fromEntries(Object.entries(questionsFor(variant)).map(([id, q]) => [id,
        q.type === 'choice' ? { type: 'choice', choice: action }
            : q.type === 'noul' ? { type: 'noul', noul: 0 }
                : { type: 'score', score: 0 }]));
    return { model: 'jev-synthetic', answers, usage: { input_tokens: 100, output_tokens: 20 } };
}

test('raw engine replay uses neither oracle nor learning and reproduces lethal landing', t => {
    const originalOracle = PhysicsOracle.prototype.verifyLookaheadEscape;
    const originalQ = LearningBrain.prototype.getQValue;
    PhysicsOracle.prototype.verifyLookaheadEscape = () => { throw new Error('Oracle must not assist raw replay'); };
    LearningBrain.prototype.getQValue = () => { throw new Error('Learning must not assist raw replay'); };
    t.after(() => { PhysicsOracle.prototype.verifyLookaheadEscape = originalOracle; LearningBrain.prototype.getQValue = originalQ; });
    const state = record().snapshot;
    state.obstacles = [{ x: 0, prevX: 0, laneZ: 11, length: 2, speed: 0, type: 'car' }];
    const before = structuredClone(state);
    const first = replay(state, 'UP');
    assert.equal(first.death, 'crash');
    assert.equal(first.safe, false);
    assert.equal(first.ticks, 9);
    assert.deepEqual(replay(state, 'UP'), first);
    assert.deepEqual(state, before);
    assert.equal(replay(state, 'WAIT').safe, true);
    assert.equal(replay(state, 'DOWN').accepted, false);
});

test('the same ten-tick horizon catches a waiting road collision and log drift', () => {
    const state = record().snapshot;
    state.player.currPosition = { x: 0, y: 0, z: 11 };
    state.player.targetPosition = { ...state.player.currPosition };
    state.obstacles = [{ x: 1.4, prevX: 1.4, laneZ: 11, length: 1.5, speed: -4, type: 'car' }];
    assert.equal(replay(state, 'WAIT').death, 'crash');
    assert.equal(replay(state, 'UP').safe, true);
    state.player.currPosition.z = 5;
    state.obstacles = [{ x: 0, prevX: 0, laneZ: 5, length: 3, speed: 1, type: 'log' }];
    const drift = replay(state, 'WAIT');
    assert.equal(drift.safe, true);
    assert.ok(Math.abs(drift.finalPosition.x - 10 / 60) < 1e-10);
});

test('question variants share the same action question and identify all moves explicitly', () => {
    const a = questionsFor('action'), b = questionsFor('bundle'), c = questionsFor('candidates');
    assert.equal(Object.keys(a).length, 1);
    assert.equal(Object.keys(b).length, 4);
    assert.equal(Object.keys(c).length, 11);
    assert.deepEqual(a.action, b.action);
    assert.deepEqual(a.action, c.action);
    for (const action of ACTIONS) assert.ok(c[`safe_${action}`].instructions.includes(action));
});

test('candidate combination abstains below threshold and uses score among qualifying actions', () => {
    const answers = response('candidates').answers;
    assert.equal(combineCandidates(answers).abstained, true);
    answers.safe_UP.noul = 0.95;
    answers.progress_UP.score = 3;
    answers.safe_WAIT.noul = 0.99;
    answers.progress_WAIT.score = 1;
    assert.equal(combineCandidates(answers).action, 'UP');
});

test('trace retains raw, veto, geometry, usage and unknown cost separately', async () => {
    const saved = [];
    const trace = await attempt({ record: record(), variant: 'bundle',
        transport: async () => ({ status: 200, response: response('bundle', 'DOWN') }), persist: row => saved.push(row) });
    assert.equal(saved.length, 1);
    assert.equal(trace.status, 'success');
    assert.equal(trace.rawAction, 'DOWN');
    assert.equal(trace.rawReplay.safe, false);
    assert.equal(trace.shieldedReplay.vetoed, true);
    assert.equal(trace.shieldedReplay.executedAction, 'UP');
    assert.equal(trace.reportedCost, null);
    assert.equal(trace.request.state.learnedMemory, undefined);
    assert.equal(trace.rawResponse.answers.evacuate_log.noul, 0);
});

test('timeouts, cancellation, HTTP errors, malformed replies, other models, and stale results remain distinct', async () => {
    const common = { record: record(), variant: 'action' };
    const timeout = await attempt({ ...common, timeoutMs: 5, transport: () => new Promise(() => {}) });
    assert.equal(timeout.status, 'timeout');
    const controller = new AbortController(); controller.abort();
    const canceled = await attempt({ ...common, signal: controller.signal, transport: () => new Promise(() => {}) });
    assert.equal(canceled.status, 'canceled');
    const http = await attempt({ ...common, transport: async () => ({ status: 401, response: { error: 'synthetic' } }) });
    assert.equal(http.status, 'http_error');
    const invalid = await attempt({ ...common, transport: async () => ({ status: 200, response: { model: 'jev-synthetic', answers: {} } }) });
    assert.equal(invalid.status, 'invalid_response');
    const other = await attempt({ ...common, transport: async () => ({ status: 200, response: { ...response('action'), model: 'other-model' } }) });
    assert.equal(other.status, 'invalid_response');
    const stale = await attempt({ ...common, isCurrent: () => false, transport: async () => ({ status: 200, response: response('action') }) });
    assert.equal(stale.status, 'stale');
    assert.equal(stale.rawAction, 'UP');
});
