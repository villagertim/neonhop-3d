# Jev route comparison — 2026-09-20

OpenRouter was faster in this small matched test: **350 ms median versus 605 ms for TypeSafe Direct**, a 42% lower observed median. It was faster in five of six pairs. Neither route met the game's 100 ms deadline.

Both keys worked. The earlier OpenRouter 401 is superseded by a successful authentication recheck and six successful inference requests. The local gateway was restarted to load the updated credentials; its configured priority remains TypeSafe Direct.

## Method and attribution

Twelve sequential requests compared six identical payloads: three saved game states, each with the one-question and eleven-question configurations. Each payload was submitted once through each route. Route order was counterbalanced, with each route going first in three pairs. State/question hashes match within each pair. No retries, alternate-model fallback, or response-dependent prompt changes were used.

Both routes were called from the same workstation using Python urllib with a fresh connection for each request, matching the gateway's connection behavior. Timing covers connection, provider response, and reading the full response body. This comparison bypassed the local gateway hop for both routes. These timings are end-to-end route measurements, not model inference time alone. The spectator game was paused during collection.

TypeSafe returned `jev-1.13.0`; OpenRouter returned `typesafe/jev-1.13-20260917`. Both identify the Jev 1.13 family, but the identifiers are not identical and exact weight equivalence has not been verified. Provider deployment, batching, and network effects are not separately isolated. This supports a provisional operational preference for OpenRouter, not a universal latency claim or proof that routing alone explains the difference.

Jev was the only inference model. All twelve responses passed answer-schema validation. No other AI model generated actions or graded the results; raw action outcomes were checked by deterministic engine replay without the oracle or learning controller.

## Results

| Route | Valid replies | Median | Minimum | Maximum | Within 100 ms |
| --- | --- | --- | --- | --- | --- |
| TypeSafe Direct | 6/6 | 605 ms | 429 ms | 752 ms | 0/6 |
| OpenRouter | 6/6 | 350 ms | 327 ms | 464 ms | 0/6 |

| State / question count | TypeSafe | OpenRouter | Faster route |
| --- | --- | --- | --- |
| Bank / 1 | 752 ms | 431 ms | OpenRouter |
| Bank / 11 | 485 ms | 327 ms | OpenRouter |
| Road / 1 | 429 ms | 464 ms | TypeSafe |
| Road / 11 | 669 ms | 333 ms | OpenRouter |
| River / 1 | 593 ms | 350 ms | OpenRouter |
| River / 11 | 618 ms | 350 ms | OpenRouter |

Each route reported 23,974 input tokens and 780 output tokens in total. OpenRouter reported an aggregate `usage.cost` of 0.001006908; TypeSafe did not return monetary cost. A relative price advantage has not been established.

All twelve action Choices were UP, and all were fatal in the same frozen-state engine replays. The fixed candidate-combination rule abstained in all six eleven-question requests. A faster route did not resolve the representation/decision-quality failure identified in the first pilot. These are three distinct states with repeated configurations; they are not twelve independent gameplay scenarios.

## Decision

Use OpenRouter provisionally for the next isolated Jev representation experiment and keep its returned model version explicit in the trace. Keep the TypeSafe route available for future matched checks. Do not lower the measured latency to 100 ms by truncating and omitting slow responses, or credit fallback moves to Jev.

The next priority remains a compact input representation and a balanced set including safe-forward and blocked-forward situations. A longer planning horizon may make these response times usable; the present result does not justify letting raw Jev control per-hop movement without separate validation. The browser spectator remains a hybrid controller with local safety and adaptive memory, not the isolated Jev-only experiment.

## Reproduction

- [Raw requests/responses and timings](traces.jsonl)
- [Aggregate and paired statistics](summary.json)
- [Engine replay and answer validation](quality.json)
- [Frozen experiment order and hashes](manifest.json)
- The exact route script is saved alongside this report as `compare-jev-routes.py`; its maintained copy is `benchmarks/compare-jev-routes.py`.
- `python3 benchmarks/compare-jev-routes.py PILOT_DIRECTORY NEW_OUTPUT_DIRECTORY` makes twelve live requests and requires both keys in the local `.env`. Existing output traces cause it to stop before inference, preventing accidental duplicate charges. Keys are never included in traces.

No larger route benchmark or long-run gameplay evaluation was performed in this comparison.
