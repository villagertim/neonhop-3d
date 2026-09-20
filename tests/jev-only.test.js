import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/gameEngine.js';
import { JevOnlyAgent } from '../src/jevOnlyAgent.js';

const reply = action => ({ model: 'typesafe/jev-1.13-20260917', answers: {
    action: { type: 'choice', choice: action }, threat_level: { type: 'score', score: 0 },
    evacuate_log: { type: 'noul', noul: 0 }, forward_path_clear: { type: 'noul', noul: 0.5 }
} });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(t, transport = async () => reply('UP'), options = {}) {
    const engine = new GameEngine();
    engine.state = 'PLAYING'; engine.aiMode = true;
    const saved = [];
    const agent = new JevOnlyAgent(engine, { transport, persist: async e => saved.push(e), ...options });
    t.after(() => agent.stop());
    agent.start();
    return { engine, agent, saved };
}

test('waiting freezes physics and simulation clock; unsafe Jev UP is executed without veto', async t => {
    let resolve;
    const { engine, agent, saved } = setup(t, () => new Promise(r => { resolve = r; }));
    const before = JSON.stringify({ player: engine.player, obstacles: engine.obstacles, timer: engine.countdownTimer });
    for (let i = 0; i < 100; i++) engine.physicsUpdate(1 / 60);
    assert.equal(JSON.stringify({ player: engine.player, obstacles: engine.obstacles, timer: engine.countdownTimer }), before);
    assert.equal(engine.simulationTime, 0);
    assert.equal(agent.sequence, 1);
    assert.equal(agent.brain, undefined);
    assert.equal(agent.oracle, undefined);
    resolve(reply('UP')); await flush();
    for (let i = 0; i < 9; i++) engine.physicsUpdate(1 / 60);
    assert.equal(engine.lives, 2); // Starting UP collides with a car.
    assert.equal(agent.stats.deaths, 1);
    await agent.logQueue;
    assert.equal(saved.find(e => e.type === 'applied').action, 'UP');
    assert.equal(saved.find(e => e.type === 'outcome').cause, 'crash');
});

test('WAIT and an illegal direction each advance a fixed cycle without substitute moves', async t => {
    for (const action of ['WAIT', 'DOWN']) {
        const { engine, agent } = setup(t, async () => reply(action));
        engine.physicsUpdate(1 / 60); await flush();
        for (let i = 0; i < 9; i++) engine.physicsUpdate(1 / 60);
        assert.equal(agent.sequence, 1);
        assert.equal(agent.decisionCount, 1);
        assert.equal(agent.stats.invalidMoves, action === 'DOWN' ? 1 : 0);
        assert.equal(engine.player.currPosition.z, 12);
        assert.ok(Math.abs(engine.simulationTime - 0.15) < 1e-10);
        engine.physicsUpdate(1 / 60);
        assert.equal(agent.sequence, 2);
    }
});

test('timeout halts the baseline without automatic retries or local fallback', async t => {
    const { engine, agent } = setup(t, () => new Promise(() => {}), { timeoutMs: 5 });
    await agent.decide();
    assert.match(agent.error, /timed out/);
    for (let i = 0; i < 100; i++) engine.physicsUpdate(1 / 60);
    assert.equal(agent.sequence, 1);
    assert.equal(agent.decisionCount, 0);
    assert.equal(engine.simulationTime, 0);
    agent.transport = async () => reply('WAIT');
    agent.retry(); engine.physicsUpdate(1 / 60); await flush();
    engine.physicsUpdate(1 / 60);
    assert.equal(agent.decisionCount, 1);
});

test('pause and takeover discard delayed replies and preserve human movement', async t => {
    let resolve;
    const { engine, agent } = setup(t, () => new Promise(r => { resolve = r; }));
    engine.physicsUpdate(1 / 60);
    engine.pauseGame();
    resolve(reply('UP')); await flush();
    assert.equal(engine.pendingAIIntent, null);
    assert.equal(agent.decisionCount, 0);
    engine.resumeGame(); engine.setAIMode(false); agent.stop();
    engine.queueMovement('LEFT'); engine.physicsUpdate(1 / 60);
    assert.equal(engine.player.targetPosition.x, -1);
});

test('raw requests contain observations only, with no learned memory or suggested safe actions', async t => {
    const { engine, agent } = setup(t);
    engine.player.currPosition.z = 5;
    const request = agent.buildRequest();
    assert.equal(request.provider, 'openrouter');
    assert.equal(Object.keys(request.questions).length, 4);
    assert.equal(request.state.player.z, 5);
    assert.equal(request.state.actionEvaluations, undefined);
    assert.equal(request.state.learnedMemory, undefined);
    assert.equal(request.state.obstacles[0].safe, undefined);
    assert.ok(request.state.obstacles[0].length > 0);
});

test('provider/schema errors and recording failures halt; no alternate route exists', async t => {
    for (const response of [{ ...reply('UP'), model: 'other-model' }, reply('FLY'),
        { model: 'jev-1.13', answers: { action: { type: 'choice', choice: 'UP' } } }]) {
        const { engine, agent } = setup(t, async () => response);
        await agent.decide();
        assert.ok(agent.error);
        assert.equal(engine.pendingAIIntent, null);
    }
    const { engine, agent } = setup(t, async () => reply('WAIT'), { persist: async () => { throw new Error('disk'); } });
    await agent.logQueue;
    engine.physicsUpdate(1 / 60);
    assert.match(agent.error, /Recording/);
    assert.equal(agent.sequence, 0);
});
