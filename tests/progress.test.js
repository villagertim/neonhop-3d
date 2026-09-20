import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameEngine } from '../src/gameEngine.js';
import { JevAgent } from '../src/jevAgent.js';
import { PhysicsOracle } from '../src/physicsOracle.js';

function setup(t) {
    const e = new GameEngine();
    e.setGameState('PLAYING');
    e.setAIMode(true);
    const a = new JevAgent(e);
    a.enabled = true;
    t.after(() => a.stop());
    return { e, a };
}

test('captured river hesitation now takes the verified forward crossing', t => {
    const { e, a } = setup(t);
    const captured = JSON.parse(fs.readFileSync(new URL('./fixtures/river-hesitation.json', import.meta.url)));
    Object.assign(e, captured);
    const key = a.brain.getStateKey(e, e.player.currPosition.x, e.player.currPosition.z);
    // Old memories may prefer WAIT; progress priority must not erase that memory.
    a.brain.setQValue(key, 'WAIT', 5000);
    a.brain.setQValue(key, 'UP', -5000);
    const evaluations = a.evaluateActions();
    assert.equal(evaluations.UP.safe, true);
    assert.ok(evaluations.UP.score > 0);
    assert.equal(a.pickBestLearnedAction(evaluations), 'UP');
    e.physicsUpdate(1 / 60);
    assert.equal(e.player.targetPosition.z, 4);
    assert.equal(e.player.isHopping, true);
    for (let i = 0; i < 8; i++) e.physicsUpdate(1 / 60);
    assert.equal(e.player.currPosition.z, 4);
    assert.equal(e.lives, 3);
    assert.equal(a.brain.getQValue(key, 'WAIT'), 5000);
});

test('short traffic gap supports a landing and a next-tick exit', () => {
    const e = new GameEngine();
    e.setGameState('PLAYING');
    e.obstacles = [{ x: 1.8, prevX: 1.8, speed: -4, length: 1.5, laneZ: 11, type: 'car' }];
    const oracle = new PhysicsOracle();
    assert.equal(oracle.verifyLookaheadEscape(e, 'UP').safe, true);
    assert.equal(oracle.isPositionSafeOverTime(0, 11, oracle.hopDuration, 0.120, e), false);
    e.initiateHop('UP');
    for (let i = 0; i < 8; i++) e.physicsUpdate(e.fixedDeltaTime);
    assert.equal(e.lives, 3);
    e.queueMovement('UP');
    e.physicsUpdate(e.fixedDeltaTime);
    for (let i = 0; i < 8; i++) e.physicsUpdate(e.fixedDeltaTime);
    assert.equal(e.player.currPosition.z, 10);
    assert.equal(e.lives, 3);
});

test('predictor timing agrees with physics hop completion and speed scaling', () => {
    for (const speed of [1, 2, 5]) {
        for (const hopSpeed of [8, 4]) {
            const e = new GameEngine();
            e.setGameState('PLAYING');
            e.setSimulationSpeed(speed);
            e.player.hopSpeed = hopSpeed;
            e.obstacles = [];
            const oracle = new PhysicsOracle();
            oracle.evaluateActionSafety(e, 'UP');
            e.initiateHop('UP');
            let ticks = 0;
            while (e.player.isHopping) { e.physicsUpdate(e.fixedDeltaTime); ticks++; }
            assert.equal(oracle.hopDuration, ticks * e.fixedDeltaTime);
            assert.equal(oracle.minDwellTime, e.fixedDeltaTime);
        }
    }
});

test('forward priority still waits when the landing tile is fatal', t => {
    const { e, a } = setup(t);
    e.obstacles = [{ x: 0, prevX: 0, speed: 0, length: 12, laneZ: 11, type: 'car' }];
    const choices = a.evaluateActions();
    assert.equal(choices.UP.safe, false);
    assert.equal(a.pickBestLearnedAction(choices), 'WAIT');
    e.physicsUpdate(e.fixedDeltaTime);
    assert.equal(e.player.isHopping, false);
    assert.equal(e.lives, 3);
});

test('safe Jev recommendations remain observable instead of being replaced by local progress preferences', async t => {
    const { e, a } = setup(t);
    e.obstacles = [];
    a.queryJevAPI = async () => ({ action: 'WAIT' });
    let telemetry;
    a.onTelemetry = data => { telemetry = data; };
    await a.evaluateNextMove();
    e.physicsUpdate(e.fixedDeltaTime);
    assert.equal(e.player.targetPosition.z, 12);
    assert.equal(telemetry.action, 'WAIT');
    assert.match(telemetry.source, /JEV-1.13/);
    assert.equal(a.brain.totalVetoes, 0);
    assert.equal(a.brain.totalDeaths, 0);
});
