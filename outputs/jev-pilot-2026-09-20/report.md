# Jev pilot: results and isolation audit

Completed 2026-09-20 in the local Frogger development workspace.

## Findings

The nine-request pilot succeeded technically but did not demonstrate useful autonomous move selection with this input representation. All nine Jev action recommendations were UP; the engine replayed each into a fatal collision or drowning. These are nine responses on three distinct states, not nine independent gameplay trials. All states had safe alternatives.

The eleven-question candidate bundle exposed uncertainty: no candidate reached the preset 0.8 survival threshold, so the combination rule abstained on all three states. This can prevent blindly accepting the action Choice, but zero action coverage is not a demonstrated gameplay improvement. No fallback was substituted into the raw Jev results.

All nine responses identified `jev-1.13.0`. All supplied the requested answer types, with no HTTP failures, timeouts, or malformed responses. End-to-end latency was 490–624 ms; none met the spectator controller's 100 ms cutoff. The measurement includes local gateway and network work and is not isolated model inference latency.

## Is another AI assisting?

For the isolated pilot, **Jev was the only inference model**. Requests went through the local gateway to TypeSafe Direct. There was no alternate-model fallback, model-written move, or model-based answer grader. The test harness required the active provider to be TypeSafe and rejected a response whose model identifier did not start with `jev-`.

Raw replay executes the Jev action in the deterministic game engine, without instantiating the safety oracle or learning agent. A regression test makes oracle and learning methods throw and confirms raw replay still works. Requests contain measured state and rules, without Q values, trap memory, oracle evaluations, or local-policy answers. The candidate combination is a fixed arithmetic rule over Jev's answers; its threshold was saved before the requests.

Local-only and shielded comparisons are separate fields. They use handwritten rules with Q values and trap penalties forced to zero and learning callbacks disabled. The local controller generated reachable corpus states; that sampling provenance is recorded and can bias the state distribution, but its choices were not supplied to Jev. Deterministic engine outcomes, not oracle agreement, grade raw actions.

The **ordinary browser spectator game is different**: it still includes the safety oracle, local fallback, and adaptive Q-table/trap memory. It cannot be described as Jev-only. Source inspection found TypeSafe and OpenRouter Jev routes, and no other model integration in the gameplay paths. The live health check selected TypeSafe Direct; an OpenRouter key is also configured, but the pilot has no direct OpenRouter fallback. This is an audit of this repository and test configuration, not an audit of every process on the workstation or the provider's internal infrastructure.

The spectator was paused during collection to prevent competing requests. Browser learning memory was not cleared or copied into the pilot. The coding assistant prepared the harness and this report; it did not supply gameplay moves or act as an inference-based grader.

## Measured comparison

| Variant | Requests / answers each | Valid replies | Raw moves surviving | Median latency | Observed maximum | Input / output tokens |
| --- | --- | --- | --- | --- | --- | --- |
| Action Choice only | 3 / 1 | 3/3 | 0/3 | 559 ms | 569 ms | 10,112 / 156 |
| Current question bundle | 3 / 4 | 3/3 | 0/3 | 502 ms | 624 ms | 10,529 / 315 |
| Candidate assessments | 3 / 11 | 3/3 | 0/3 | 567 ms | 595 ms | 13,862 / 624 |

The current bundle retains the four gameplay questions but uses the same complete structured state as the other two variants, rather than the spectator's shorter legacy prose. The candidate bundle adds five survival probabilities and five progress scores to the same action Choice.

Total usage: **34,503 input tokens and 1,095 output tokens**. The provider did not report monetary cost; dollars spent are unknown, not zero. The eleven-question variant used approximately 37% more input tokens and four times the output tokens of the one-question variant across these matched states. Similar observed latency across the variants does not establish equal cost or negligible batching overhead.

The machine-readable summary includes a nearest-rank p95. With only three observations per variant, that statistic is simply the observed maximum and is not a reliable tail-latency estimate. Requests were sequential and variant order was counterbalanced: A/B/C on bank, B/C/A on road, C/A/B on river. The same state was frozen for each comparison; the network wait did not advance the replay world.

## What failed, and what the local shield changed

| State | Position | Raw Jev action, all variants | Engine outcome | Separate local / shielded action |
| --- | --- | --- | --- | --- |
| Starting bank, trajectory 0 tick 0 | x=0, z=12 | UP | Car collision at landing | WAIT, survives |
| Road, trajectory 0 tick 106 | x=0, z=11 | UP | Car collision at landing | WAIT, survives |
| River, trajectory 0 tick 392 | x=-1, z=5 | UP | No supporting log at landing; drowns | LEFT, survives |

The shield vetoed all nine recommendations and the replacement actions survived the short horizon. Those nine rescues are attributable to the local controller, not Jev.

The geometry was also checked directly: at the bank landing, the nearest car center was x=0.82 and collision radius including buffer was 0.95; on the road it was x=-0.625 with radius 0.95. In the river target lane, the closest log center was about x=1.33167, more than 1.8 units from the frog's target x=-1, so no overlap existed.

Across the fifteen candidate survival answers, Brier score was **0.2729** (lower is better; a constant 0.5 prediction scores 0.25 on these binary labels). Progress-score mean absolute error was **1.059** on the 0–4 rubric. These are descriptive errors on a tiny sample, not a calibration study. The preset combination rule selected zero moves; abstentions are recorded explicitly and never counted as successful survival.

## Reproducibility and limits

- A corpus of 60 reachable states from six initial obstacle phases is frozen: 40 development states and 20 held-out states, separated by trajectory. This pilot queried only the first bank, road, and river samples from development trajectory 0. Held-out states have not been queried.
- All three pilot states happened to make UP fatal. This limits generalization and does not test cases where forward progress is correct. Selection followed the saved first-per-zone rule rather than model responses, but the pilot is not balanced by safe action or representative of full gameplay.
- Every candidate receives the same ten-tick horizon: one input tick, eight hop ticks, and one idle tick at the current settings. WAIT lasts all ten ticks. There are no subsequent commands during that horizon. Therefore this is a short action-quality test, not a closed-loop controller or long-run survival comparison. The same horizon is disclosed to Jev in the questions.
- The progress rubric uses a further UP replay to distinguish two non-forward outcomes. Its scalar is an experimental proxy, not a validated long-term value function.
- State includes exact geometry and timing, but the prompt is long and requests numerical prediction. The result may reflect representation/rubric difficulty as well as model capability. The earlier shorter-prose smoke request chose WAIT on the initial bank, but it was a different request at a different time; that is a reason to test representation, not a controlled comparison.
- Raw, local, shielded, and candidate outcomes were reproduced in **42 equality checks** against saved traces. The regression suite passed **45 JavaScript tests and 6 Python tests**. No other inference model or AI-based grader was used.
- Source hashes, request schemas, corpus hash, raw requests/responses, usage, timing, and outcome attribution are saved. The exact engine/harness source files are archived under `sources/`. No credentials are included.

## Updated recommendation

Do not scale this unchanged raw-geometry prompt to the planned 180-request run or promote it into game control. This supersedes the earlier plan to expand after checking pilot latency and usage: the pilot exposed a decision-quality failure first.

The next development test should compare the existing representation against a compact, explicitly organized state on a small balanced set containing both blocked-UP and safe-UP situations. Keep the measured geometry and rules, remove irrelevant fields and unnecessary numerical precision, and continue withholding oracle labels and learned preferences. Check that the reduced precision cannot change collision labels before sending it. Keep question wording and outcome horizon fixed so the representation change is identifiable. Jev remains the only inference model.

Only after a representation yields useful held-out decisions should we test whether batched candidate answers add action coverage or better uncertainty handling, and whether querying ahead of a crossing gives those answers enough time to arrive. The observed latency supports testing decisions with a longer planning horizon; it does not establish that Jev can meet per-hop deadlines. Exact batched-versus-separate request overhead, long-run gameplay benefit, dollar cost, and broader advantages/disadvantages remain unmeasured.

## OpenRouter route follow-up

The user suggested OpenRouter might be faster. A fresh GET `/api/v1/key` using the configured OpenRouter key returned HTTP 401. This check made no inference request and does not measure Jev latency. [Authentication result](openrouter-auth-check.json).

The user subsequently supplied updated keys and the check returned HTTP 200. A separate twelve-request matched comparison is now complete: OpenRouter was faster in five of six pairs, with 350 ms median versus 605 ms for TypeSafe Direct. Returned Jev version identifiers differ, and neither route met 100 ms. Unsafe raw moves persisted. See the [route comparison](../jev-route-comparison-2026-09-20/report.md); the original nine-request pilot remains unchanged.

## Artifacts and commands

- [Raw traces](traces.jsonl), [summary](summary.json), [frozen corpus](corpus.json), [manifest and questions](manifest.json).
- Harness: `benchmarks/jev-evaluation.mjs`; summary/replay verification: `benchmarks/summarize-jev-pilot.mjs`.
- Offline verification: `npm test` and `node benchmarks/summarize-jev-pilot.mjs outputs/jev-pilot-2026-09-20`.
- Preparing a new corpus makes no provider calls: `node benchmarks/jev-evaluation.mjs prepare outputs/NEW-RUN`.
- `node benchmarks/jev-evaluation.mjs pilot outputs/NEW-RUN` makes exactly nine sequential requests through the configured TypeSafe gateway, with no retry. It refuses an existing trace file to prevent accidental duplicate billing. Do not rerun a paid pilot merely to regenerate the report.
