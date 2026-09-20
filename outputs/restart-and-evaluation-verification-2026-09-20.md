# Restart and evaluation foundation verification — 2026-09-20

The local app is running at http://127.0.0.1:8000 after restarting the gateway with the new TypeSafe key. Its health endpoint selects TypeSafe Direct. Browser verification confirms WATCH AI PLAY starts autonomous play and the updated HUD identifies local-policy decisions. Versioned local assets bypass old browser caches; the development gateway now requires cache revalidation.

One live four-question integration request returned HTTP 200, model jev-1.13.0, all expected answer types, 887 input tokens and 105 output tokens. The application parser accepted the actual response. End-to-end request time was 1,384.87 ms; this one observation is not a latency distribution. It exceeds the spectator controller's 100 ms deadline, so normal gameplay can still fall back locally. This is not a comparative Jev evaluation.

The response adapter retains the complete model response, including distributions and usage, separately from executed moves and vetoes. A safe model WAIT remains eligible. Local handwritten rules are no longer described as compiled Jev inference. Persistent experiment tracing and the candidate-question comparison remain planned.

Validation: 39 JavaScript tests and 6 Python tests passed. The final nine-scenario offline benchmark produced 177 captures, zero deaths and zero deferred oracle-safe forward moves, versus 147 captures, zero deaths and 741 deferrals before the progress correction. These are deterministic local-policy results with mocked provider failures and fresh memory. Browser learning memory was preserved and is not comparable to those fresh runs. No model superiority or calibrated probability claim follows from these results.

Current research plan: [Jev evaluation and utilization](jev-evaluation-plan-2026-09-20.md). Raw integration check: [TypeSafe response](typesafe-smoke-result.json). Regression output: [test results](jev-foundation-test-results.txt). Final local benchmark: [results](progress-after.json).
