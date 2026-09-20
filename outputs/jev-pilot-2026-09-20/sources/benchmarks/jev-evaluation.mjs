import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../src/gameEngine.js';
import { JevAgent } from '../src/jevAgent.js';

export const ACTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'WAIT'];
export const HORIZON_TICKS = 10;
export const SNAPSHOT_FIELDS = ['level', 'lives', 'player', 'obstacles', 'portals',
    'countdownTimer', 'fixedDeltaTime', 'simulationSpeed'];
export const snapshot = engine => structuredClone(Object.fromEntries(SNAPSHOT_FIELDS.map(k => [k, engine[k]])));
export function restore(state) {
    const engine = new GameEngine();
    Object.assign(engine, structuredClone(state));
    engine.state = 'PLAYING';
    return engine;
}

function fixedLocalAgent(engine) {
    const agent = new JevAgent(engine);
    // Comparator only: neither saved Q values nor adaptive updates influence it.
    agent.brain.getQValue = () => 0;
    agent.brain.getTrapPenalty = () => 0;
    engine.onDecisionInvalidated = null;
    engine.onDeathOccurred = null;
    engine.onPortalScore = null;
    engine.onAIInputReady = null;
    return agent;
}

// One queued input, then no further input for ten ticks. Includes the initial
// obstacle movement, eight hop ticks, and one idle tick after landing at 1x.
// WAIT deliberately spans the same horizon, rather than receiving a shorter test.
export function replay(state, requestedAction, { shield = false, progress = true } = {}) {
    const engine = restore(state);
    // Raw Jev replay does not even instantiate the oracle or learning agent.
    const agent = shield || requestedAction === 'LOCAL' ? fixedLocalAgent(engine) : null;
    engine.aiMode = true;
    engine.onAIInputReady = null;
    engine.onDecisionInvalidated = null;
    let death = null, captures = 0, accepted = false, executedAction = null, vetoed = false;
    engine.onDeathOccurred = cause => { death = cause; };
    engine.onPortalScore = () => { captures++; };
    engine.queueAIIntent(() => {
        const evaluations = agent?.evaluateActions();
        executedAction = requestedAction;
        if (requestedAction === 'LOCAL') executedAction = agent.pickBestLearnedAction(evaluations);
        else if (shield && !evaluations[requestedAction]?.safe) {
            vetoed = true;
            executedAction = agent.pickBestLearnedAction(evaluations);
        }
        return { action: executedAction, onAccepted: () => { accepted = true; } };
    });
    let ticks = 0;
    while (ticks < HORIZON_TICKS && !death && !captures) {
        engine.physicsUpdate(engine.fixedDeltaTime);
        ticks++;
    }
    const safe = accepted && !death;
    const rowGain = captures ? state.player.currPosition.z : state.player.currPosition.z - engine.player.currPosition.z;
    let progressScore = null;
    if (progress) {
        if (!safe) progressScore = 0;
        else if (captures) progressScore = 4;
        else if (rowGain > 0) progressScore = 3;
        else progressScore = replay(snapshot(engine), 'UP', { progress: false }).safe ? 2 : 1;
    }
    return { requestedAction, executedAction, accepted, vetoed, safe, death, captures,
        rowGain, progressScore, ticks, finalPosition: { ...engine.player.currPosition } };
}

export function questionsFor(variant) {
    const original = new JevAgent(new GameEngine()).buildQuestions();
    if (variant === 'action') return { action: original.action };
    if (variant === 'bundle') return original;
    if (variant !== 'candidates') throw new Error(`Unknown variant: ${variant}`);
    const questions = { action: original.action };
    for (const action of ACTIONS) {
        questions[`safe_${action}`] = {
            type: 'noul',
            instructions: `If the frog queues ${action} now, is that command legal and will it survive the next ${HORIZON_TICKS} physics ticks, with no further commands? Use state.rules for exact timing and collision rules. For WAIT, remain idle for all ten ticks. Judge this independently; other question answers are not available.`
        };
        questions[`progress_${action}`] = {
            type: 'score',
            instructions: `Rate the outcome of queuing ${action} now under the same ten-tick rules. Choose the highest applicable rubric level. Use a further ten-tick UP replay only to distinguish levels 1 and 2, assuming the frog survived the first horizon.`,
            criteria: [
                'Illegal command or death during the first ten ticks.',
                'Survives but does not advance toward z=0; a subsequent UP command would be illegal or fatal within its next ten ticks.',
                'Survives without advancing toward z=0; a subsequent UP command would be legal and survive its next ten ticks.',
                'Survives and advances at least one row toward z=0 within the first ten ticks, without capturing a portal.',
                'Captures an open portal within the first ten ticks.'
            ]
        };
    }
    return questions;
}

export function modelState(state) {
    return {
        rules: {
            objective: 'Survive and reach an empty portal at z=0. Prefer useful forward progress when safe; waiting can allow traffic or logs to align.',
            dtSeconds: state.fixedDeltaTime, hopSpeed: state.player.hopSpeed,
            horizonTicks: HORIZON_TICKS,
            timing: 'The snapshot is immediately before a physics tick. Each tick reduces countdown, moves obstacles, then processes the frog. On the first tick a grounded road collision kills before input. A legal command starts a hop; hop progress starts increasing on the following tick by dt*hopSpeed until >=1. At hopSpeed=8 it lands after eight further ticks. No drift during hopping or on the landing tick. No further commands during the horizon. WAIT remains grounded for all ten ticks.',
            obstacles: 'x += speed*dt on every tick. After moving past x=9.5 to the right, set x=-9.5; after moving past -9.5 to the left, set x=9.5. Speeds are signed units per simulated second.',
            movement: 'UP decreases z by 1 if z>0; DOWN increases z by 1 if z<12; LEFT decreases x by 1 only if current x>-5; RIGHT increases x by 1 only if current x<5. WAIT is always a legal command. An illegal move is not a safe candidate even if the frog survives staying still.',
            roads: 'Rows z=7..11. Grounded/landing collision when abs(frog.x-obstacle.x) <= obstacle.length/2 + 0.20. No airborne collisions.',
            river: 'Rows z=1..5. At landing or while idle, a log must satisfy abs(frog.x-log.x) <= log.length/2 + 0.20 or the frog drowns. When idle, test overlap after log movement then carry frog by log.speed*dt. Carried x outside [-6.5,6.5] is fatal.',
            banks: 'Rows z=12 and z=6 have no traffic or river hazards.',
            portals: 'At z=0, abs(frog.x-portal.x) must be strictly <0.5 and portal must be unfilled; otherwise fatal. Capturing ends the evaluation successfully.',
            timeout: 'Countdown reaching zero is fatal.'
        },
        level: state.level, countdownSeconds: state.countdownTimer,
        player: state.player, obstacles: state.obstacles, portals: state.portals
    };
}

// Explicit, provisional rule fixed before seeing any pilot replies. Confidence
// thresholds are not calibrated on three cases; report abstention separately.
export function combineCandidates(answers, threshold = 0.8) {
    const eligible = ACTIONS.filter(a => Number.isFinite(answers[`safe_${a}`]?.noul)
        && answers[`safe_${a}`].noul >= threshold && Number.isFinite(answers[`progress_${a}`]?.score));
    eligible.sort((a, b) => answers[`progress_${b}`].score - answers[`progress_${a}`].score
        || answers[`safe_${b}`].noul - answers[`safe_${a}`].noul);
    return { action: eligible[0] ?? null, abstained: !eligible.length, threshold };
}

export function validateAnswers(response, questions) {
    if (typeof response?.model !== 'string' || !response.model.startsWith('jev-')) {
        throw new Error('Response is not identified as a Jev model');
    }
    const answers = response?.answers;
    if (!answers || typeof answers !== 'object') throw new Error('Missing answers envelope');
    for (const [id, question] of Object.entries(questions)) {
        const answer = answers[id];
        if (answer?.type !== question.type) throw new Error(`Missing or incorrect answer type: ${id}`);
        if (question.type === 'choice' && !Object.hasOwn(question.criteria, answer.choice)) throw new Error(`Invalid choice: ${id}`);
        const value = question.type === 'noul' ? answer.noul : question.type === 'score' ? answer.score : null;
        if (question.type !== 'choice' && (!Number.isFinite(value) || value < 0
            || value > (question.type === 'noul' ? 1 : question.criteria.length - 1))) throw new Error(`Invalid numeric answer: ${id}`);
    }
    return answers;
}

export async function attempt({ record, variant, transport, timeoutMs = 10000, signal,
    isCurrent = () => true, persist = () => {} }) {
    const questions = questionsFor(variant);
    const request = { model: 'typesafe/jev-1.13', state: modelState(record.snapshot), questions };
    const trace = { schemaVersion: 1, stateId: record.id, trajectory: record.trajectory,
        split: record.split, variant, startedAt: new Date().toISOString(), request,
        status: 'pending', timeoutMs, memory: 'disabled', world: 'frozen',
        snapshot: record.snapshot, localBaseline: replay(record.snapshot, 'LOCAL') };
    const controller = new AbortController();
    const externalAbort = () => controller.abort();
    signal?.addEventListener('abort', externalAbort, { once: true });
    if (signal?.aborted) controller.abort();
    let timedOut = false, abortListener;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const start = performance.now();
    try {
        const canceled = new Promise((_, reject) => {
            abortListener = () => reject(new Error('Request aborted'));
            controller.signal.addEventListener('abort', abortListener, { once: true });
            if (controller.signal.aborted) abortListener();
        });
        const reply = await Promise.race([transport(request, controller.signal), canceled]);
        trace.latencyMs = performance.now() - start;
        trace.httpStatus = reply.status;
        trace.rawResponse = reply.response;
        if (reply.status < 200 || reply.status >= 300) trace.status = 'http_error';
        else {
            trace.status = 'invalid_response';
            const answers = validateAnswers(reply.response, questions);
            trace.status = isCurrent() ? 'success' : 'stale';
            trace.actualModel = reply.response.model ?? null;
            trace.usage = reply.response.usage ?? null;
            trace.reportedCost = reply.response.usage?.cost ?? null;
            trace.rawAction = answers.action.choice;
            trace.rawReplay = replay(record.snapshot, trace.rawAction);
            trace.shieldedReplay = replay(record.snapshot, trace.rawAction, { shield: true });
            if (variant === 'candidates') {
                trace.combined = combineCandidates(answers);
                trace.combinedReplay = trace.combined.action ? replay(record.snapshot, trace.combined.action) : null;
                trace.candidateTruth = Object.fromEntries(ACTIONS.map(a => [a, replay(record.snapshot, a)]));
            }
        }
    } catch (error) {
        if (trace.status === 'pending') trace.status = timedOut ? 'timeout' : controller.signal.aborted ? 'canceled' : 'transport_error';
        trace.error = String(error.message);
    } finally {
        trace.latencyMs ??= performance.now() - start;
        trace.missedGameplayDeadline = trace.latencyMs > 100;
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', abortListener);
        signal?.removeEventListener('abort', externalAbort);
        persist(trace);
    }
    return trace;
}

export function buildCorpus() {
    const records = [];
    const phases = [0, 1, 2, 3, 5, 7];
    for (let trajectory = 0; trajectory < phases.length; trajectory++) {
        const engine = new GameEngine();
        engine.state = 'PLAYING';
        for (let i = 0; i < phases[trajectory] * 60; i++) engine.physicsUpdate(engine.fixedDeltaTime);
        const agent = fixedLocalAgent(engine);
        engine.aiMode = true;
        engine.onDecisionInvalidated = null;
        engine.onDeathOccurred = null;
        engine.onPortalScore = null;
        engine.onAIInputReady = () => engine.queueAIIntent(() => ({
            action: agent.pickBestLearnedAction(agent.evaluateActions()), onAccepted() {}
        }));
        const pools = { bank: [], road: [], river: [] }, seen = new Set();
        for (let tick = 0; tick < 3600; tick++) {
            if (!engine.player.isHopping) {
                const { x, z } = engine.player.currPosition;
                const zone = z === 12 || z === 6 ? 'bank' : z >= 7 ? 'road' : 'river';
                const key = `${z}:${Math.round(x * 2)}:${engine.portals.filter(p => p.filled).length}`;
                if (!seen.has(key) && z > 0) {
                    seen.add(key);
                    pools[zone].push({ id: `trajectory-${trajectory}-tick-${tick}`, trajectory,
                        split: trajectory < 4 ? 'development' : 'held-out', zone,
                        phaseSeconds: phases[trajectory], tick, snapshot: snapshot(engine) });
                }
            }
            engine.physicsUpdate(engine.fixedDeltaTime);
            if (engine.state === 'GAME_OVER') break;
        }
        for (const [zone, count] of [['bank', 2], ['road', 4], ['river', 4]]) {
            if (pools[zone].length < count) throw new Error(`Insufficient ${zone} states`);
            for (let i = 0; i < count; i++) records.push(pools[zone][Math.floor(i * pools[zone].length / count)]);
        }
    }
    return records;
}

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export async function runCLI(args) {
    const command = args[0];
    const out = path.resolve(args[1] ?? 'outputs/jev-pilot');
    if (!['prepare', 'pilot'].includes(command)) throw new Error('Usage: node benchmarks/jev-evaluation.mjs prepare|pilot [output-directory]');
    if (command === 'prepare') {
        fs.mkdirSync(out, { recursive: true });
        if (fs.existsSync(path.join(out, 'corpus.json'))) throw new Error('Corpus exists; choose a new directory to preserve provenance');
        const records = buildCorpus();
        const corpus = { schemaVersion: 1, createdAt: new Date().toISOString(), records };
        fs.writeFileSync(path.join(out, 'corpus.json'), JSON.stringify(corpus, null, 2) + '\n');
        const sources = ['src/gameEngine.js', 'src/jevAgent.js', 'src/physicsOracle.js', 'src/learningBrain.js', 'src/jevEvaluator.js', 'benchmarks/jev-evaluation.mjs'];
        const manifest = { sourceSha256: Object.fromEntries(sources.map(p => [p, sha(fs.readFileSync(p))])),
            corpusSha256: sha(fs.readFileSync(path.join(out, 'corpus.json'))), variants: ['action', 'bundle', 'candidates'],
            questionSets: Object.fromEntries(['action', 'bundle', 'candidates'].map(v => [v, questionsFor(v)])),
            combinationRule: 'p(survive)>=0.8; maximum progress score, then survival probability; stable action order breaks ties; otherwise abstain',
            pilotIds: ['bank', 'road', 'river'].map(zone => records.find(r => r.trajectory === 0 && r.zone === zone).id) };
        fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
        console.log(JSON.stringify({ prepared: records.length, pilot: manifest.pilotIds, out }));
        return;
    }
    const tracePath = path.join(out, 'traces.jsonl');
    if (fs.existsSync(tracePath)) throw new Error('Pilot traces already exist; refusing duplicate billed requests');
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
    for (const [file, hash] of Object.entries(manifest.sourceSha256)) {
        if (sha(fs.readFileSync(file)) !== hash) throw new Error(`Source changed since preparation: ${file}`);
    }
    const corpusBytes = fs.readFileSync(path.join(out, 'corpus.json'));
    if (sha(corpusBytes) !== manifest.corpusSha256) throw new Error('Corpus hash mismatch');
    const records = JSON.parse(corpusBytes).records;
    const base = 'http://127.0.0.1:8000';
    const health = await (await fetch(`${base}/api/jev/health`)).json();
    if (health.active_provider !== 'typesafe') throw new Error('Pilot requires the configured TypeSafe Direct provider');
    fs.writeFileSync(tracePath, '', { flag: 'wx' });
    const transport = async (request, signal) => {
        const response = await fetch(`${base}/api/jev/decision`, { method: 'POST', signal,
            headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(request) });
        return { status: response.status, response: await response.json() };
    };
    // Latin-square ordering across three states: ABC / BCA / CAB. Sequential
    // requests avoid client fanout and cannot collide with duplicate pilot runs.
    for (let i = 0; i < manifest.pilotIds.length; i++) {
        const record = records.find(r => r.id === manifest.pilotIds[i]);
        for (let j = 0; j < 3; j++) {
            const variant = manifest.variants[(i + j) % 3];
            const trace = await attempt({ record, variant, transport,
                persist: trace => fs.appendFileSync(tracePath, JSON.stringify(trace) + '\n') });
            console.log(JSON.stringify({ state: record.id, zone: record.zone, variant,
                status: trace.status, latencyMs: Math.round(trace.latencyMs), action: trace.rawAction,
                combined: trace.combined?.action, safe: trace.rawReplay?.safe }));
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runCLI(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
