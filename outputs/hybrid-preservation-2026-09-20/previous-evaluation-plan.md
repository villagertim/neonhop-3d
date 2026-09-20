# Jev evaluation and utilization plan

Current plan, updated after the nine-request pilot on 2026-09-20. Owner: implementing developer/Codex in the local `/home/cia-one/dev/frogger` development checkout. The user owns provider credentials and the experiment spending limit.

## Current status and next action

The isolated replay/logging harness and nine-request pilot are complete. All responses identified Jev-1.13.0; 42 replay checks reproduced saved outcomes and 51 regression tests passed. The 60-state corpus, source snapshots, question schemas, request/response traces, and [pilot report](jev-pilot-2026-09-20/report.md) are saved locally.

The pilot found zero surviving raw recommendations across nine responses on three states, with 490–624 ms end-to-end latency. The candidate combination abstained on all three states. This replaces the earlier recommendation to expand immediately to 180 requests: first test a compact representation on a balanced development sample containing safe-UP and blocked-UP cases. Keep Jev as the only inference model, with no learned memory, oracle labels, or other AI grader in the raw test. The separate browser spectator remains a hybrid controller.

The user supplied updated keys for both routes. OpenRouter authentication and inference now succeed. A completed twelve-request matched comparison found OpenRouter faster in five of six pairs: 350 ms median versus 605 ms for TypeSafe Direct. All responses were Jev-family outputs; returned version identifiers differ, so exact model equivalence is not proven. Neither route met 100 ms, and all raw action recommendations remained fatal in replay. See [route report](jev-route-comparison-2026-09-20/report.md). Use OpenRouter provisionally for the next isolated representation test. The ordinary browser gateway still gives TypeSafe priority; no provider switch was made in spectator gameplay.

The detailed protocol below records the experiment design. Steps 1 and the nine-request portion of step 2 are implemented. Held-out evaluation, separate-versus-batched request timing, moving-world shadow tests, and broad comparative claims remain outstanding. No non-Jev inference model is included in the current evaluation.

## Objective and change in direction

Find where Jev offers useful advantages, where it fails, and which integration makes best use of its capabilities. In particular, test whether asking several focused questions about the same state produces better actionable information than requesting one movement. Maximize useful contribution, assessed through outcomes, latency, cost, and coverage of decisions.

This replaces optimizing autonomous survival as the primary recommendation in the hesitation/reliability notes. The repository remediation remains completed prerequisite work. Local progress corrections establish a comparison baseline; they are not evidence of Jev's effectiveness. The older research roadmap and claims in `docs/` are historical context, not this plan or verified comparative results.

## Verified starting point

- Existing remote requests already ask four questions together: one action Choice, one threat Score, and two Noul questions. They do not independently assess every candidate move, and the extra answers currently affect telemetry rather than action selection.
- The adapter previously missed the documented `answers` envelope and `noul` field, used truthiness that lost numeric zeros, and discarded distributions. The corrected adapter retains the full response and exposes the model proposal separately from the executed action and veto. Accepted safe Jev WAIT recommendations remain intact.
- The handwritten local evaluator is not a compiled Jev model. Offline survival and hesitation measurements use mocked provider failures and must be labeled local-only.
- Remote calls in the current spectator controller occur only on banks at 1x, with a 100 ms client deadline and 30-second failure cooldown. Those restrictions censor latency observations and exclude the difficult road/river states. They cannot establish the model's usefulness across gameplay.
- The configured OpenRouter key returned HTTP 401 on GET `/api/v1/key`, checked without inference. See [authentication check](jev-auth-check.json). This was superseded when the user supplied a TypeSafe key: the restarted gateway selected TypeSafe Direct and one real four-question request succeeded (HTTP 200, `jev-1.13.0`, 887 input tokens, 105 output tokens, 1,384.87 ms end to end). The response parsed successfully. See [live integration result](typesafe-smoke-result.json). Authentication no longer blocks TypeSafe experiments. The single observation exceeds the spectator deadline and does not estimate typical or tail latency. Do not paste keys into research traces or chat.
- The focused suite passes 39 JavaScript tests and 6 Python tests, including documented response shapes, simultaneous answers, zero values, veto retention, stale results, collisions, and progress timing. See [test results](jev-foundation-test-results.txt).

## One ordered experiment

### 1. Establish an auditable experiment harness

Developer: implement a command-line replay harness and persistent JSONL traces in this workspace before collecting comparative results. Keep the normal spectator configuration separate. Use the real physics engine to record reachable bank, road, and river decision states, including the reproduced hesitation state, impending drift, occupied portals, and cases with several viable moves.

Start with 60 states spanning these situations, partitioned by trajectory into development and held-out groups before prompt tuning. Freeze the engine revision, complete state, question schema, provider/model version, and memory setting. The same states and same memory setting must reach every comparison. Disable learned memory for the primary comparison; test identical frozen memory later only if the primary results justify that work.

Provide exact obstacle lengths, positions, speeds, boundaries, timing, drift rules, and open portals. Do not supply oracle safety labels or local action scores in the primary model input. The current rounded three-lane prose lacks some geometry and timing; record it as a legacy representation rather than treating its failures as model limitations.

For every attempt, persist state ID, request/questions, complete response, returned model version, provider, wall-clock latency, error/timeout/cancellation, available usage/cost, raw recommendation, selection rule, safety assessment, veto, executed action, and outcome. Never silently substitute a local answer into the model results. Unknown cost remains unknown. Label end-to-end latency separately from any provider-reported inference latency.

Completion: mocked traces cover success, error, timeout, stale result, and veto; offline replay reproduces the recorded engine outcome. Completed for the frozen-state pilot: durable traces include failures/cancellation/stale status tests and raw versus shielded outcomes. Moving-world shadow collection remains outstanding.

### 2. Compare focused uses of simultaneous answers

Use identical states and ask these variants, with counterbalanced request order:

| Variant | Questions per request | Purpose |
| --- | ---: | --- |
| A: action only | 1 Choice | Minimal Jev decision baseline |
| B: current bundle | 4 | Measure whether existing auxiliary answers add value |
| C: candidate assessments | 11 | One action Choice, five Noul safety assessments, and five Score assessments of useful progress/escape opportunity |

Each candidate question must explicitly name its move in the instructions; a question ID alone is not model context. Define safety against the actual landing and next-input interval. Define an ordered progress rubric consistently for every action. All questions in C evaluate the same captured state independently; do not assume one answer can consume another answer from that request.

Keep C's direct action recommendation as a separate result. On development states, define a deterministic rule that combines the candidate safety and progress answers. Freeze that rule and any uncertainty threshold before evaluating held-out states. Compare this derived action against the direct Choice so that the value of the extra answers is measurable. An action's Choice probability is a preference distribution, not automatically its probability of surviving.

Also compare the same candidate questions together versus separate requests on a small fixed subset. This separates the advantage of batching from the advantage of better question design. Measure both time to the first usable answer and time to all answers. Do not assume questions are free or latency is independent of batch size.

Start live work with three representative states across A/B/C: nine requests. Credentials now work; the completed integration smoke call is separate from this comparative pilot. Use their actual latency, tokens, and reported cost to estimate the 180-request primary run and the separate-request subset. Confirm that projected cost and rate fit the user's spending limit before scaling. The nine-request pilot is now complete. No bulk run or paid comparator has been started; see the current-status section for the changed recommendation.

Completion: a saved comparison reports raw decision quality, candidate probability quality, response validity, p50/p95 end-to-end latency, failure/deadline rate, and available cost per state and useful decision. This small corpus is exploratory; it does not establish broad statistical superiority.

### 3. Test useful placement in the moving simulation

First replay with the world frozen while Jev answers to isolate decision quality from network delay. Then run Jev in shadow mode against the moving simulation: local control continues while model responses are scored against both the original state and the state at arrival. Record stale-result frequency and deadline coverage; never reuse a stale answer as a current recommendation.

Use these observations to select placement. If answers arrive before the next meaningful decision often enough, test Jev-assisted movement with the same safety shield used in other hybrid variants. If they arrive too late for immediate hops but provide useful ranking, test route/escape assessment ahead of the next crossing, on bank entry or when portal occupancy changes. Every new request must identify its decision horizon and expiry condition. Evaluate each placement separately; do not extrapolate bank performance to road or river control.

Compare local-only, raw Jev, and shielded Jev in deterministic replay with matched initial states and durations. Run raw Jev in isolated simulation, not by silently disabling safety in the user's spectator session. Report progress/captures per simulated time, deaths, time spent waiting, beneficial waits, vetoes, fallbacks, and the fraction of actions actually influenced by Jev. Verify outcomes in the engine; oracle agreement alone is not ground truth. A safe forward opportunity deferred is a diagnostic event, not necessarily a bad decision if the wait improves later survival or progress.

Completion: identify which states and placements show added value and which do not, with model/local attribution for every result. Promote an integration only when held-out benefit survives the latency and safety comparison and fits the measured cost budget. Retain a negative finding when the local baseline is better.

### 4. Report advantages and disadvantages with limits

The final report will distinguish demonstrated findings, vendor-described capabilities, and hypotheses. Candidate benefits are shared-state multi-question evaluation, directly usable typed answers, probability-informed abstention, and useful ranking among safe alternatives. Candidate disadvantages include inadequate geometric reasoning, sensitivity to state/rubric design, correlated answer errors, uncalibrated probabilities in this domain, latency/staleness, API failures, cost, and dependence on the local safety controller.

A future autoregressive-model comparison is outside the current Jev-only evaluation. Do not introduce another inference model or AI-based grader into this test. Any later comparator requires a separately identified experiment with the same information, rubrics, and outcome definitions; until then, make no claim that Jev is faster, cheaper, or better than that alternative.

Deliver locally: versioned traces, reproducible commands, aggregate tables, representative successes/failures, and one recommendation identifying where to use Jev and where local computation is sufficient. Durable tracing and the small candidate-batch pilot are complete. Held-out and longer-horizon evaluation and the final broad empirical report remain outstanding.

## Primary references

- [TypeSafe System One](https://docs.typesafe.ai/concepts/system-one) describes typed decisions and the workflow of asking independent questions together and combining them with code. Domain accuracy and calibration still require measurement.
- [TypeSafe HTTP API](https://docs.typesafe.ai/api) documents `answers`, Noul probabilities, Choice distributions, weighted Score values, and that question IDs are not used in inference.
- [OpenRouter provider implementation](https://github.com/OpenRouterTeam/ai-sdk-provider#evaluation-jev-with-ai-sdk-through-openrouter) documents Decisions response metadata and notes that the API is alpha.
