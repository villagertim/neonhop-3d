import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/gameEngine.js';

function game(z = 11) {
    const e = new GameEngine();
    e.setGameState('PLAYING');
    e.player.currPosition = { x: 0, y: 0, z };
    e.obstacles = [{ x: -1.1, prevX: -1.1, speed: 1.2, length: 1.5, laneZ: 11, type: 'car' }];
    return e;
}

test('approaching traffic kills an idle road player once and respawns', () => {
    const e = game();
    let deaths = 0;
    e.onDeathOccurred = () => deaths++;
    for (let i = 0; i < 20; i++) e.physicsUpdate(1 / 60);
    assert.equal(e.lives, 2);
    assert.equal(deaths, 1);
    assert.equal(e.player.currPosition.z, 12);
});

test('collision precedes queued input and final death does not repeat', () => {
    const e = game();
    e.obstacles[0].x = 0;
    e.queueMovement('UP');
    e.physicsUpdate(1 / 60);
    assert.equal(e.lives, 2);
    assert.equal(e.player.isHopping, false);
    assert.deepEqual(e.inputQueue, []);
    const final = game();
    final.lives = 1;
    final.obstacles[0].x = 0;
    let deaths = 0;
    final.onDeathOccurred = () => deaths++;
    for (let i = 0; i < 20; i++) final.physicsUpdate(1 / 60);
    assert.equal(final.state, 'GAME_OVER');
    assert.equal(final.lives, 0);
    assert.equal(deaths, 1);
});

test('other rows and banks remain safe; landing collision remains active', () => {
    for (const z of [12, 6, 10]) {
        const e = game(z);
        for (let i = 0; i < 20; i++) e.physicsUpdate(1 / 60);
        assert.equal(e.lives, 3);
    }
    const e = game(12);
    e.obstacles[0].x = 0;
    e.obstacles[0].speed = 0;
    e.initiateHop('UP');
    for (let i = 0; i < 8; i++) e.physicsUpdate(1 / 60);
    assert.equal(e.lives, 2);
});

test('controlled real-time loop advances 1x, 2x and 5x using fixed steps', () => {
    const oldRAF = globalThis.requestAnimationFrame;
    const oldPerformance = globalThis.performance;
    try {
        globalThis.performance = { now: () => 0 };
        for (const speed of [1, 2, 5]) {
            let frame;
            globalThis.requestAnimationFrame = fn => { frame = fn; };
            const e = game(12);
            e.setSimulationSpeed(speed);
            e.startLoop(() => {});
            for (let i = 1; i <= 60; i++) frame(i * 1000 / 60);
            assert.equal(e.fixedDeltaTime, 1 / 60);
            assert.ok(Math.abs(e.countdownTimer - (30 - speed)) <= 1 / 60 + 1e-9);
            e.pauseGame();
            const timer = e.countdownTimer;
            for (let i = 61; i <= 120; i++) frame(i * 1000 / 60);
            assert.equal(e.countdownTimer, timer);
        }
    } finally {
        globalThis.requestAnimationFrame = oldRAF;
        globalThis.performance = oldPerformance;
    }
});

test('hop duration remains eight simulation ticks at every speed', () => {
    for (const speed of [1, 2, 5]) {
        const e = game(12);
        e.obstacles = [];
        e.setSimulationSpeed(speed);
        e.initiateHop('UP');
        for (let i = 0; i < 7; i++) e.physicsUpdate(e.fixedDeltaTime);
        assert.equal(e.player.isHopping, true);
        e.physicsUpdate(e.fixedDeltaTime);
        assert.equal(e.player.isHopping, false);
    }
});
