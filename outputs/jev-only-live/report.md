# First live Jev-only baseline

Recorded 2026-09-20, 19:03 UTC, in the local browser at `127.0.0.1:8000`. Session `36d9c966-206e-44f2-abbb-c13178b043b0`.

## Result

One complete three-life run produced **three raw UP choices, three collision deaths, zero captures, and score zero at level one**. There were no recorded request errors or illegal moves. Each accepted movement matched Jev's returned Choice. Game over stopped the run; no automatic restart requested more inference.

| Decision | Jev Choice | End-to-end latency (ms) | Applied unchanged | Outcome |
| --- | --- | ---: | --- | --- |
| 1 | UP | 685.5 | Yes | Collision death |
| 2 | UP | 582.8 | Yes | Collision death |
| 3 | UP | 556.3 | Yes | Collision death |

All responses identified `typesafe/jev-1.13-20260917`, requested as `typesafe/jev-1.13` through OpenRouter. Total reported usage: 7,188 input tokens and 315 output tokens. Sum of provider `usage.cost`: 0.000301896; retained as reported rather than an independently reconciled invoice. These three sequential decisions do not provide a representative latency distribution.

## Protocol and attribution

The controller supplied exact board observations and game rules, with four simultaneous typed questions: action, threat level, log evacuation, and forward clearance. Only the raw action Choice controlled movement. Auxiliary answers were recorded and displayed, without combining them into a substitute action.

The simulation froze during inference, including obstacle motion, countdown, and combo time. Each raw movement then ran under the ordinary engine rules. WAIT or an illegal direction would advance nine physics ticks before the next decision. The controller had no oracle, learned memory, local action policy, safety veto, or alternate model. It halted on request/validation/recording failures rather than selecting a fallback. The normal engine still enforced legality and collisions.

The active module graph excludes `jevAgent.js`, `physicsOracle.js`, `learningBrain.js`, and `jevEvaluator.js`. Source inspection and logged model identifiers support Jev-only attribution for this run. Codex implemented and audited the application; it supplied no gameplay actions or model-based grading. Provider-internal infrastructure is outside this application's audit scope.

## Verification

- The JSONL contains 14 events: one start, three requests, three responses, three applied actions, three death outcomes, and one run-finished record.
- Each applied action was checked against its raw response. Restoring each recorded engine snapshot and executing that choice reproduced its collision death using deterministic physics, without an AI grader or safety controller.
- The saved regression suite passed 51 JavaScript and eight Python tests. The optional browser-fixture script was updated but not executed as part of that count. The actual live browser run was observed separately.
- The browser was subsequently reloaded to apply display fixes and left at the ready screen for the next run. It is not running an unattended experiment.

## Evidence

- [Complete request/response and outcome trace](36d9c966-206e-44f2-abbb-c13178b043b0.jsonl)
- [Active source graph and hashes](source-audit.json)
- [Current executable source checkpoint](source-v1/manifest.json)
- [Regression output](../jev-only-test-results.txt)
- [Observed end-of-run browser text](first-run-browser.txt) and [screenshot](first-run.png)

The end-of-run screenshot predates minor status wrapping and zero-score form fixes. The source checkpoint includes those display fixes; the action-selection protocol is unchanged.

## Interpretation and next step

This initial prompt and starting-board sequence failed at the first road crossing on all three lives, even with network delay removed from simulation time. It establishes an auditable negative baseline for these decisions. It does not establish overall Jev capability, river performance, or the usefulness of different state representations or simultaneous-question designs.

The next experiment is a bounded development-state representation test containing both safe-UP and blocked-UP states. It must retain raw Jev decisions and deterministic outcome grading, with no runtime assistance. Hybrid improvements remain preserved for later evaluation in the [lessons record](../hybrid-preservation-2026-09-20/lessons-learned.md). See the [current plan](../jev-evaluation-plan-2026-09-20.md).
