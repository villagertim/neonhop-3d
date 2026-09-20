import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/gameEngine.js';
import { JevAgent } from '../src/jevAgent.js';

// Shape from OpenRouter's Decisions API documentation; values are synthetic.
function response(action = 'UP') {
    return {
        id: 'synthetic-decision', model: 'synthetic-version', provider: 'TypeSafe',
        answers: {
            action: { type: 'choice', choice: action, confidence: 0.8,
                probabilities: { UP: 0.7, WAIT: 0.3, DOWN: 0, LEFT: 0, RIGHT: 0 } },
            threat_level: { type: 'score', score: 0, probabilities: { 0: 1, 1: 0 },
                legend: { 0: 'safe', 1: 'low_risk' } },
            evacuate_log: { type: 'noul', noul: 0 },
            forward_path_clear: { type: 'noul', noul: 0.92 }
        },
        usage: { cost: 0.00001, input_tokens: 100, output_tokens: 40 }
    };
}

test('one gateway request decodes all four answers and keeps distributions and usage', async t => {
    const engine = new GameEngine();
    const agent = new JevAgent(engine);
    engine.setGameState('PLAYING');
    engine.setAIMode(true);
    agent.enabled = true;
    const oldFetch = globalThis.fetch;
    t.after(() => { agent.stop(); globalThis.fetch = oldFetch; });
    const raw = response();
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
        calls++;
        const payload = JSON.parse(options.body);
        assert.deepEqual(Object.keys(payload.questions),
            ['action', 'threat_level', 'evacuate_log', 'forward_path_clear']);
        return { ok: true, json: async () => raw };
    };
    let telemetry;
    agent.onTelemetry = value => { telemetry = value; };
    engine.obstacles = [];
    await agent.evaluateNextMove();
    engine.physicsUpdate(engine.fixedDeltaTime);
    assert.equal(calls, 1);
    assert.equal(telemetry.modelDecision.threat_level, 0);
    assert.equal(telemetry.evacuateLog, 0);
    assert.equal(telemetry.threatLevel, 'safe');
    assert.equal(telemetry.forwardClear, 0.92);
    assert.deepEqual(telemetry.modelDecision.rawResponse, raw);
});

test('veto preserves Jev evidence independently of the executed local action', t => {
    const engine = new GameEngine();
    const agent = new JevAgent(engine);
    t.after(() => agent.stop());
    const raw = response('DOWN'); // Out of bounds on the starting bank.
    const decision = agent.parseJevResponse(raw);
    let telemetry;
    agent.onTelemetry = value => { telemetry = value; };
    const intent = agent.resolveDecision(decision, performance.now());
    intent.onAccepted();
    assert.equal(telemetry.modelAction, 'DOWN');
    assert.notEqual(telemetry.action, 'DOWN');
    assert.equal(telemetry.safetyVetoed, true);
    assert.deepEqual(telemetry.modelDecision.rawResponse, raw);
});

test('legacy answers preserve zero values and malformed actions are rejected', () => {
    const agent = new JevAgent(new GameEngine());
    const parsed = agent.parseJevResponse({ decisions: {
        action: { choice: 'WAIT' }, threat_level: { score: 0 }, evacuate_log: { probability: 0 }
    } });
    assert.equal(parsed.action, 'WAIT');
    assert.equal(parsed.threat_level, 0);
    assert.equal(parsed.evacuate_log, 0);
    for (const invalid of [{ answers: {} }, { answers: [] }, { answers: { action: { choice: 'FLY' } } }]) {
        assert.throws(() => agent.parseJevResponse(invalid), /Jev/);
    }
});

test('direct fallback also recognizes the documented answers envelope', async t => {
    const agent = new JevAgent(new GameEngine());
    const oldFetch = globalThis.fetch;
    const oldWindow = globalThis.window;
    t.after(() => { globalThis.fetch = oldFetch; globalThis.window = oldWindow; });
    globalThis.window = { location: { origin: 'http://127.0.0.1:8000' } };
    agent.apiKey = 'synthetic';
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? { ok: false }
        : { ok: true, json: async () => response() };
    const decision = await agent.queryJevAPI('synthetic state', {});
    assert.equal(calls, 2);
    assert.equal(decision.action, 'UP');
    assert.equal(decision.rawResponse.usage.cost, 0.00001);
});
