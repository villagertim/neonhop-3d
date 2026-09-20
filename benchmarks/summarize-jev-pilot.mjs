import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ACTIONS, replay } from './jev-evaluation.mjs';

const out = path.resolve(process.argv[2] ?? 'outputs/jev-pilot-2026-09-20');
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
for (const [file, hash] of Object.entries(manifest.sourceSha256)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `Source mismatch: ${file}`);
}
const rows = fs.readFileSync(path.join(out, 'traces.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const corpus = JSON.parse(fs.readFileSync(path.join(out, 'corpus.json')));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * values.length) - 1)] : null;
let replayChecks = 0;
for (const row of rows) {
    assert.deepEqual(row.snapshot, corpus.records.find(r => r.id === row.stateId).snapshot);
    assert.deepEqual(replay(row.snapshot, 'LOCAL'), row.localBaseline); replayChecks++;
    if (row.rawReplay) {
        assert.deepEqual(replay(row.snapshot, row.rawAction), row.rawReplay); replayChecks++;
        assert.deepEqual(replay(row.snapshot, row.rawAction, { shield: true }), row.shieldedReplay); replayChecks++;
    }
    if (row.candidateTruth) for (const action of ACTIONS) {
        assert.deepEqual(replay(row.snapshot, action), row.candidateTruth[action]); replayChecks++;
    }
}
const summaries = {};
for (const variant of manifest.variants) {
    const attempts = rows.filter(r => r.variant === variant);
    const successes = attempts.filter(r => r.status === 'success');
    const latency = successes.map(r => r.latencyMs);
    const brierTerms = [], progressErrors = [];
    for (const row of successes.filter(r => r.candidateTruth)) {
        for (const a of ACTIONS) {
            brierTerms.push((row.rawResponse.answers[`safe_${a}`].noul - Number(row.candidateTruth[a].safe)) ** 2);
            progressErrors.push(Math.abs(row.rawResponse.answers[`progress_${a}`].score - row.candidateTruth[a].progressScore));
        }
    }
    summaries[variant] = {
        attempts: attempts.length, validResponses: successes.length,
        rawSafe: successes.filter(r => r.rawReplay.safe).length,
        shieldedSafe: successes.filter(r => r.shieldedReplay.safe).length,
        vetoes: successes.filter(r => r.shieldedReplay.vetoed).length,
        combinedCoverage: successes.filter(r => r.combined?.action).length,
        combinedSafe: successes.filter(r => r.combinedReplay?.safe).length,
        latencyMedianMs: quantile(latency, 0.5), latencyP95NearestRankMs: quantile(latency, 0.95),
        latencyMinMs: latency.length ? Math.min(...latency) : null,
        latencyMaxMs: latency.length ? Math.max(...latency) : null,
        within100ms: successes.filter(r => r.latencyMs <= 100).length,
        inputTokens: successes.reduce((n, r) => n + (r.usage?.input_tokens ?? 0), 0),
        outputTokens: successes.reduce((n, r) => n + (r.usage?.output_tokens ?? 0), 0),
        reportedCost: successes.length && successes.every(r => Number.isFinite(r.reportedCost))
            ? successes.reduce((n, r) => n + r.reportedCost, 0) : null,
        candidateBrier: mean(brierTerms), candidateProgressMAE: mean(progressErrors), candidateLabels: brierTerms.length
    };
}
const result = { requests: rows.length, distinctStates: new Set(rows.map(r => r.stateId)).size,
    actualModels: [...new Set(rows.map(r => r.actualModel).filter(Boolean))], replayChecks,
    variants: summaries, allCostsReported: rows.every(r => Number.isFinite(r.reportedCost)),
    statuses: Object.fromEntries([...new Set(rows.map(r => r.status))].map(s => [s, rows.filter(r => r.status === s).length])) };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
