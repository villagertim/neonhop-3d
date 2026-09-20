import { GameEngine } from '../src/gameEngine.js';
import { JevAgent } from '../src/jevAgent.js';

// Reproducible virtual browser clock; no rendering, credentials, or network.
export async function runScenario({ speed = 1, latency = 250, phase = 0, seconds = 180 } = {}) {
    const original = { performance: globalThis.performance, setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout, requestAnimationFrame: globalThis.requestAnimationFrame };
    let now = 0, id = 0, frame;
    const timers = new Map();
    globalThis.performance = { now: () => now };
    globalThis.setTimeout = (fn, delay = 0) => { timers.set(++id, { at: now + delay, fn }); return id; };
    globalThis.clearTimeout = key => timers.delete(key);
    globalThis.requestAnimationFrame = fn => { frame = fn; };
    const e = new GameEngine();
    const a = new JevAgent(e);
    e.setSimulationSpeed(speed);
    for (const obstacle of e.obstacles) {
        obstacle.x = ((obstacle.x + obstacle.speed * phase + 9.5) % 19 + 19) % 19 - 9.5;
        obstacle.prevX = obstacle.x;
    }
    let deaths = 0, captures = 0, maxLevel = 1, requests = 0;
    const progress = { safeForwardOffers: 0, deferredForward: 0, waitsWithSafeForward: 0,
        longestSafeForwardWaitSeconds: 0, crossingSeconds: [], examples: [] };
    let waitTicks = 0;
    const chooseAction = a.pickBestLearnedAction.bind(a);
    a.pickBestLearnedAction = evaluations => {
        const action = chooseAction(evaluations);
        if (evaluations.UP.safe) {
            progress.safeForwardOffers++;
            if (action !== 'UP') {
                progress.deferredForward++;
                if (progress.examples.length < 3) progress.examples.push({
                    action, level: e.level, player: structuredClone(e.player),
                    obstacles: structuredClone(e.obstacles), portals: structuredClone(e.portals),
                    up: evaluations.UP, chosen: evaluations[action]
                });
            }
            if (action === 'WAIT') {
                progress.waitsWithSafeForward++;
                waitTicks++;
                progress.longestSafeForwardWaitSeconds = Math.max(progress.longestSafeForwardWaitSeconds, waitTicks / 60);
            } else waitTicks = 0;
        } else waitTicks = 0;
        return action;
    };
    const causes = {};
    const failures = [];
    const recordDeath = e.onDeathOccurred;
    e.onDeathOccurred = type => {
        deaths++;
        causes[type] = (causes[type] || 0) + 1;
        if (failures.length < 5) failures.push({ type, level: e.level, position: { ...e.player.currPosition }, steps: a.brain.recentSteps.slice(-4) });
        recordDeath(type);
    };
    const recordSuccess = e.onPortalScore;
    e.onPortalScore = (...args) => { captures++; progress.crossingSeconds.push(30 - e.countdownTimer); recordSuccess(...args); };
    a.queryJevAPI = () => {
        requests++;
        return new Promise((_, reject) => setTimeout(() => reject(new Error('Mock provider unavailable')), latency));
    };
    e.setAIMode(true);
    e.setGameState('PLAYING');
    e.startLoop(() => {});
    a.start();
    try {
        const frames = Math.ceil(seconds * 60 / speed);
        for (let i = 1; i <= frames; i++) {
            now = i * 1000 / 60;
            const due = [...timers].filter(([, timer]) => timer.at <= now);
            for (const [key, timer] of due) { if (timers.delete(key)) timer.fn(); }
            for (let j = 0; j < 8; j++) await Promise.resolve();
            frame(now);
            maxLevel = Math.max(maxLevel, e.level);
            if (e.state === 'GAME_OVER') { e.resetGame(); e.setGameState('PLAYING'); }
        }
        return { speed, latency, phase, seconds, captures, deaths, maxLevel, bestStreak: a.brain.bestStreak, requests, causes, failures, progress };
    } finally {
        a.stop();
        Object.assign(globalThis, original);
    }
}

if (process.argv[1]?.endsWith('autonomy.mjs')) {
    const results = [];
    for (const speed of [1, 2, 5]) {
        for (const phase of [0, 2, 5]) {
            results.push(await runScenario({ speed, phase }));
        }
    }
    console.log(JSON.stringify(results, null, 2));
}
