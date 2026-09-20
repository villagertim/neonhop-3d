import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/gameEngine.js';
import { JevAgent } from '../src/jevAgent.js';
import { LearningBrain } from '../src/learningBrain.js';

function fixture(t) {
    const e = new GameEngine();
    e.setGameState('PLAYING');
    e.setAIMode(true);
    e.obstacles = [];
    const a = new JevAgent(e);
    a.enabled = true;
    t.after(() => a.stop());
    return { e, a };
}
function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
function blockForward(e) {
    e.obstacles = [{ x: 0, prevX: 0, speed: 0, length: 1.5, laneZ: 11, type: 'car' }];
}

test('safe proposal is recorded only when consumed by physics', async t => {
    const { e, a } = fixture(t);
    a.queryJevAPI = async () => ({ action: 'UP' });
    await a.evaluateNextMove();
    assert.equal(a.brain.recentSteps.length, 0);
    assert.ok(e.pendingAIIntent);
    e.physicsUpdate(1 / 60);
    assert.equal(e.player.targetPosition.z, 11);
    assert.equal(e.player.isHopping, true);
    assert.equal(a.brain.recentSteps[0].action, 'UP');
});

for (const timing of ['during response', 'after response']) {
    test(`revalidates safety ${timing} and never executes stale UP`, async t => {
        const { e, a } = fixture(t);
        const remote = deferred();
        a.queryJevAPI = () => remote.promise;
        const pending = a.evaluateNextMove();
        if (timing === 'during response') blockForward(e);
        remote.resolve({ action: 'UP' });
        await pending;
        if (timing === 'after response') blockForward(e);
        e.physicsUpdate(1 / 60);
        assert.notEqual(a.lastDecision, 'UP');
        assert.equal(e.player.targetPosition.z, 12);
        assert.equal(e.lives, 3);
        assert.equal(a.brain.totalVetoes, 1);
    });
}

const invalidations = {
    stop: (e, a) => a.stop(),
    takeover: e => e.setAIMode(false),
    pauseResume: e => { e.pauseGame(); e.resumeGame(); },
    death: e => e.triggerDeath('crash'),
    portal: e => { e.player.currPosition = { x: 0, y: 0, z: 0 }; e.checkLandingCollision(); },
    level: e => e.levelUp(),
    restart: e => { e.resetGame(); e.setGameState('PLAYING'); },
    speed: e => e.setSimulationSpeed(5),
    brain: (e, a) => a.resetBrain()
};
for (const [name, invalidate] of Object.entries(invalidations)) {
    test(`${name} invalidates in-flight reply without post-cancel side effects`, async t => {
        const { e, a } = fixture(t);
        const remote = deferred();
        a.queryJevAPI = () => remote.promise;
        const telemetry = [];
        a.onTelemetry = data => telemetry.push(data);
        const pending = a.evaluateNextMove();
        invalidate(e, a);
        const before = JSON.stringify({ telemetry, steps: a.brain.recentSteps, deaths: a.brain.totalDeaths });
        remote.resolve({ action: 'UP' });
        await pending;
        assert.equal(e.pendingAIIntent, null);
        assert.deepEqual(e.inputQueue, []);
        assert.equal(JSON.stringify({ telemetry, steps: a.brain.recentSteps, deaths: a.brain.totalDeaths }), before);
    });
}

test('takeover removes AI intent and preserves first human movement', async t => {
    const { e, a } = fixture(t);
    a.queryJevAPI = async () => ({ action: 'UP' });
    await a.evaluateNextMove();
    // Keyboard input is registered before the main takeover listener.
    e.queueMovement('LEFT');
    e.setAIMode(false);
    a.stop();
    e.physicsUpdate(1 / 60);
    assert.equal(e.player.targetPosition.x, -1);
    assert.equal(e.player.targetPosition.z, 12);
    assert.equal(a.brain.recentSteps.length, 0);
});

test('remote deadline releases a hung request and uses local fallback', async t => {
    const { e, a } = fixture(t);
    let signal;
    a.queryJevAPI = (_state, _questions, abortSignal) => {
        signal = abortSignal;
        return new Promise(() => {});
    };
    await a.evaluateNextMove();
    assert.equal(signal.aborted, true);
    assert.equal(a.isDeciding, false);
    e.physicsUpdate(1 / 60);
    assert.equal(a.lastDecision, 'UP');
});

test('provider error uses local fallback and accelerated mode skips provider', async t => {
    const { e, a } = fixture(t);
    let calls = 0;
    a.queryJevAPI = async () => { calls++; throw new Error('offline'); };
    await a.evaluateNextMove();
    e.physicsUpdate(1 / 60);
    assert.equal(a.lastDecision, 'UP');
    e.resetPlayerToStart();
    e.setSimulationSpeed(5);
    await a.evaluateNextMove();
    assert.equal(calls, 1);
});

test('one abort signal and deadline cover gateway and direct fallback', async t => {
    const { a } = fixture(t);
    const oldFetch = globalThis.fetch;
    const oldWindow = globalThis.window;
    t.after(() => { globalThis.fetch = oldFetch; globalThis.window = oldWindow; });
    globalThis.window = { location: { origin: 'http://127.0.0.1:8000' } };
    a.apiKey = 'synthetic';
    const signals = [];
    globalThis.fetch = async (_url, options) => {
        signals.push(options.signal);
        if (signals.length === 1) return { ok: false };
        return new Promise(() => {});
    };
    await a.evaluateNextMove();
    assert.equal(signals.length, 2);
    assert.equal(signals[0], signals[1]);
    assert.equal(signals[1].aborted, true);
});

test('old request completion cannot clear a newer request busy state', async t => {
    const { e, a } = fixture(t);
    const old = deferred();
    a.queryJevAPI = () => old.promise;
    const p1 = a.evaluateNextMove();
    a.stop();
    a.enabled = true;
    const current = deferred();
    a.queryJevAPI = () => current.promise;
    const p2 = a.evaluateNextMove();
    old.resolve({ action: 'UP' });
    await p1;
    assert.equal(a.isDeciding, true);
    assert.equal(e.pendingAIIntent, null);
    current.resolve({ action: 'WAIT' });
    await p2;
    assert.equal(a.isDeciding, false);
});

test('rapid stop/start keeps only one scheduled loop', async t => {
    const { a } = fixture(t);
    const oldSet = globalThis.setTimeout;
    const oldClear = globalThis.clearTimeout;
    const tasks = new Map();
    let id = 0;
    globalThis.setTimeout = fn => { tasks.set(++id, fn); return id; };
    globalThis.clearTimeout = key => tasks.delete(key);
    try {
        a.stop();
        for (let i = 0; i < 5; i++) { a.start(); a.stop(); }
        a.start();
        assert.equal(tasks.size, 1);
        a.stop();
        assert.equal(tasks.size, 0);
    } finally {
        globalThis.setTimeout = oldSet;
        globalThis.clearTimeout = oldClear;
    }
});

test('veto does not reset streak or penalize executed history; actual death does', async t => {
    const { e, a } = fixture(t);
    a.brain.currentStreak = 5;
    a.brain.recordStep(e, 'WAIT');
    a.brain.setQValue('previous', 'WAIT', 20);
    a.queryJevAPI = async () => ({ action: 'DOWN' });
    await a.evaluateNextMove();
    e.physicsUpdate(1 / 60);
    assert.equal(a.brain.currentStreak, 5);
    assert.equal(a.brain.totalDeaths, 0);
    assert.equal(a.brain.totalVetoes, 1);
    assert.equal(a.brain.getQValue('previous', 'WAIT'), 20);
    assert.deepEqual(a.brain.traps, {});
    assert.equal(a.brain.recentSteps.length, 2);
    e.triggerDeath('crash');
    assert.equal(a.brain.totalDeaths, 1);
    assert.equal(a.brain.currentStreak, 0);
});

test('reset removes current and legacy memory and refreshes telemetry', t => {
    const oldStorage = globalThis.localStorage;
    const entries = new Map();
    globalThis.localStorage = {
        getItem: key => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: key => entries.delete(key)
    };
    t.after(() => { globalThis.localStorage = oldStorage; });
    const { a } = fixture(t);
    const saved = JSON.stringify({ currentStreak: 9, totalVetoes: 4, qTable: { bad: { UP: -100 } } });
    entries.set(a.brain.storageKey, saved);
    entries.set(a.brain.legacyKey, saved);
    a.brain.load();
    a.brain.lastTriageVerdict = { cause: 'old' };
    let telemetry;
    a.onTelemetry = data => { telemetry = data; };
    a.resetBrain();
    assert.equal(telemetry.action, 'RESET');
    assert.equal(telemetry.streak, 0);
    assert.equal(entries.size, 0);
    const fresh = new LearningBrain();
    assert.equal(fresh.currentStreak, 0);
    assert.equal(fresh.totalVetoes, 0);
    assert.deepEqual(fresh.qTable, {});
    assert.equal(a.brain.lastTriageVerdict, null);
});


test('accepted remote decisions retain model threat and probability telemetry', async t => {
    const { e, a } = fixture(t);
    let telemetry;
    a.onTelemetry = data => { telemetry = data; };
    a.queryJevAPI = async () => ({ action: 'UP', threat_level: 'low_risk', evacuate_log: 0, forward_path_clear: 0.8 });
    await a.evaluateNextMove();
    e.physicsUpdate(1 / 60);
    assert.equal(telemetry.threatLevel, 'low_risk');
    assert.equal(telemetry.evacuateLog, 0);
    assert.equal(telemetry.forwardClear, 0.8);
});

test('hazardous lanes never wait for a provider request', async t => {
    for (const z of [11, 5]) {
        const { e, a } = fixture(t);
        e.player.currPosition = { x: 0, y: 0, z };
        let requested = false;
        a.queryJevAPI = () => { requested = true; return new Promise(() => {}); };
        await a.evaluateNextMove();
        assert.equal(requested, false);
        assert.ok(e.pendingAIIntent);
    }
});

test('provider failures back off until retry is allowed', async t => {
    const { e, a } = fixture(t);
    let requests = 0;
    a.queryJevAPI = async () => { requests++; throw new Error('unauthorized'); };
    await a.evaluateNextMove();
    e.pendingAIIntent = null;
    await a.evaluateNextMove();
    assert.equal(requests, 1);
    a.remoteRetryAt = 0;
    e.pendingAIIntent = null;
    await a.evaluateNextMove();
    assert.equal(requests, 2);
});

test('local autonomy consumes every idle simulation tick within one render frame', t => {
    const { e, a } = fixture(t);
    e.setSimulationSpeed(5);
    // Keep the frog on the bank with a safe deliberate WAIT at every tick.
    a.resolveDecision = () => ({ action: 'WAIT', onAccepted: () => a.decisionCount++ });
    for (let i = 0; i < 5; i++) e.physicsUpdate(1 / 60);
    assert.equal(a.decisionCount, 5);
});

test('unproven escape prefers immediate survival to diving into water', t => {
    const { e, a } = fixture(t);
    // Lane 2 still supports the player, but no lane 1 or lane 3 logs exist.
    e.player.currPosition = { x: 0, y: 0, z: 2 };
    e.obstacles = [{ x: 0, prevX: 0, speed: -0.9, length: 2.5, laneZ: 2, type: 'log' }];
    const choices = a.evaluateActions();
    assert.ok(Object.values(choices).every(choice => !choice.safe));
    assert.equal(choices.UP.immediate.safe, false);
    assert.equal(choices.WAIT.immediate.safe, true);
    assert.equal(a.pickBestLearnedAction(choices), 'WAIT');
    e.physicsUpdate(1 / 60);
    assert.equal(e.lives, 3);
    assert.equal(e.player.isHopping, false);
});
