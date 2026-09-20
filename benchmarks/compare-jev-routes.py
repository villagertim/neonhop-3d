"""Twelve bounded inference requests: six saved payloads through both Jev routes.

No alternate model, retry, fallback, or credential logging. Uses a fresh HTTP
connection per request, like the current Python gateway. Existing traces are
never overwritten. Run from the repository root while spectator play is paused.
"""
import datetime
import hashlib
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server


def run(pilot_dir, output_dir):
    if not server.TYPESAFE_API_KEY or not server.OPENROUTER_API_KEY:
        raise RuntimeError('Both configured keys are required')
    source = pilot_dir / 'traces.jsonl'
    previous = [json.loads(line) for line in source.read_text().splitlines()]
    manifest = json.loads((pilot_dir / 'manifest.json').read_text())
    cases = [next(row for row in previous if row['stateId'] == state_id and row['variant'] == variant)
             for state_id in manifest['pilotIds'] for variant in ['action', 'candidates']]
    endpoints = {
        'typesafe': ('https://api.typesafe.ai/v1/systemone', server.TYPESAFE_API_KEY, 'jev-latest'),
        'openrouter': ('https://openrouter.ai/api/alpha/decisions', server.OPENROUTER_API_KEY, 'typesafe/jev-1.13')
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    trace_path = output_dir / 'traces.jsonl'
    # Reserve before any billed request. A partial run also prevents a silent rerun.
    with trace_path.open('x'):
        pass
    plan = {'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'source_trace_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'maximum_requests': 12, 'timeout_seconds': 8, 'retries': 0,
            'model_family': 'Jev 1.13; aliases differ; record returned model identifiers',
            'client': 'Python urllib, fresh connection per request, direct from workstation, no local gateway hop',
            'order': [{'state_id': row['stateId'], 'variant': row['variant'],
                       'routes': ['typesafe', 'openrouter'] if i % 4 in (0, 3) else ['openrouter', 'typesafe']}
                      for i, row in enumerate(cases)]}
    (output_dir / 'manifest.json').write_text(json.dumps(plan, indent=2) + '\n')
    results = []
    for case, order in zip(cases, plan['order']):
        shared = {'state': case['request']['state'], 'questions': case['request']['questions']}
        payload_hash = hashlib.sha256(json.dumps(shared, sort_keys=True).encode()).hexdigest()
        for route in order['routes']:
            url, key, model = endpoints[route]
            payload = {'model': model, **shared}
            trace = {'state_id': case['stateId'], 'variant': case['variant'], 'route': route,
                     'shared_payload_sha256': payload_hash, 'request': payload,
                     'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'status': 'pending'}
            request = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                             headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
            start = time.perf_counter()
            try:
                with urllib.request.urlopen(request, timeout=8) as response:
                    trace['http_status'] = response.status
                    raw = response.read()
                trace['latency_ms'] = (time.perf_counter() - start) * 1000
                trace['response'] = json.loads(raw)
                answers = trace['response'].get('answers', {})
                trace['actual_model'] = trace['response'].get('model')
                valid_model = isinstance(trace['actual_model'], str) and (
                    trace['actual_model'].startswith('jev-') or trace['actual_model'].startswith('typesafe/jev-'))
                trace['status'] = 'success' if valid_model and all(
                    answers.get(k, {}).get('type') == q['type'] for k, q in shared['questions'].items()) else 'invalid_response'
                trace['action'] = answers.get('action', {}).get('choice')
                trace['usage'] = trace['response'].get('usage')
            except urllib.error.HTTPError as error:
                trace['http_status'] = error.code
                trace['status'] = 'http_error'
            except Exception as error:
                trace['status'] = 'transport_error'
                trace['error_type'] = type(error).__name__
            trace.setdefault('latency_ms', (time.perf_counter() - start) * 1000)
            with trace_path.open('a') as stream:
                stream.write(json.dumps(trace) + '\n')
                stream.flush()
            results.append(trace)
            print(json.dumps({k: trace.get(k) for k in ['state_id', 'variant', 'route', 'status', 'http_status', 'latency_ms', 'actual_model', 'action']}), flush=True)
            if trace.get('http_status') in [401, 402, 403]:
                raise RuntimeError('Authentication, credits, or access failure; stopping without retries')
    summary = {'requests': len(results), 'routes': {}, 'paired_deltas_ms_openrouter_minus_typesafe': []}
    for route in endpoints:
        rows = [r for r in results if r['route'] == route and r['status'] == 'success']
        times = [r['latency_ms'] for r in rows]
        summary['routes'][route] = {
            'successes': len(rows), 'median_ms': statistics.median(times) if times else None,
            'min_ms': min(times) if times else None, 'max_ms': max(times) if times else None,
            'within_100_ms': sum(t <= 100 for t in times),
            'actual_models': sorted({r['actual_model'] for r in rows}),
            'input_tokens': sum((r.get('usage') or {}).get('input_tokens', 0) for r in rows),
            'output_tokens': sum((r.get('usage') or {}).get('output_tokens', 0) for r in rows),
            'reported_cost': sum(r['usage']['cost'] for r in rows) if rows and all(
                isinstance((r.get('usage') or {}).get('cost'), (int, float)) for r in rows) else None}
    for case in cases:
        pair = {r['route']: r for r in results if r['state_id'] == case['stateId'] and r['variant'] == case['variant']}
        if all(pair.get(route, {}).get('status') == 'success' for route in endpoints):
            assert pair['openrouter']['shared_payload_sha256'] == pair['typesafe']['shared_payload_sha256']
            summary['paired_deltas_ms_openrouter_minus_typesafe'].append({
                'state_id': case['stateId'], 'variant': case['variant'],
                'delta_ms': pair['openrouter']['latency_ms'] - pair['typesafe']['latency_ms'],
                'same_action': pair['openrouter']['action'] == pair['typesafe']['action']})
    (output_dir / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    return summary


if __name__ == '__main__':
    try:
        summary = run(Path(sys.argv[1] if len(sys.argv) > 1 else 'outputs/jev-pilot-2026-09-20'),
                      Path(sys.argv[2] if len(sys.argv) > 2 else 'outputs/jev-route-comparison-2026-09-20'))
        print(json.dumps(summary, indent=2))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
