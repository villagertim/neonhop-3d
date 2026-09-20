# Jev-only evaluation: current plan

Updated 2026-09-20. Owner: developer/Codex in the local Frogger development workspace. The user supplies credentials and determines the spending limit.

## Decision and scope

Establish what Jev can do on its own before evaluating hybrid advantages. This replaces the earlier plan to test shadow control, safe-alternative ranking, and shielded Jev against local control during this phase. Preserve the successful hybrid implementation and its evidence for later; do not optimize or evaluate it further now.

“Jev-only” means every autonomous movement comes from Jev's raw Choice answer. Ordinary game physics, input legality, response validation, logging, and cancellation remain application code. No local policy, oracle veto, learned memory, candidate-ranking heuristic, alternate inference model, or AI grader assists gameplay. Codex develops and audits the experiment; it does not supply runtime movement decisions.

## Completed baseline

- Preserved the hybrid source, browser observation, benchmark evidence, and [lessons learned](hybrid-preservation-2026-09-20/lessons-learned.md).
- Switched the active application to a separate Jev-only controller. It explicitly requests OpenRouter's `typesafe/jev-1.13`, freezes simulation time while waiting, and executes the raw action. A request or recording failure halts the baseline until an explicit retry. Three lost lives end a run; no automatic restart.
- Retained four simultaneous typed answers: action, threat, log evacuation, and forward clearance. Only the action controls movement; the other answers are recorded and displayed. Their additional utility is not yet demonstrated.
- Saved requests, complete responses, snapshots, execution records, and outcomes in local JSONL. Hybrid memory is preserved but unused, and baseline scores have separate storage.
- Completed one live three-life run: three UP choices, three collision deaths, zero captures. Replaying each recorded choice against its snapshot reproduced the collision. See [first baseline report](jev-only-live/report.md).
- Passed 51 JavaScript and eight Python regression tests. The active module graph excludes the old agent, oracle, learning brain, and heuristic evaluator.

The first run establishes traceability and an initial negative result for this prompt and initial board. It is not an estimate of general Jev capability, river competence, or long-run performance.

## Ordered next work

### 1. Diagnose representation on development states

Developer: before another broad live run, inspect the recorded first crossing failures and use a small, fixed development set containing both survivable and fatal UP choices. Compare the present exact-state representation with a concise lane representation while preserving identical information and timing rules. Do not give Jev computed safe-move labels or advice from another model. Use deterministic engine replay only after responses to grade outcomes; it must not influence executed choices.

Freeze prompts, request schema, model identifier, engine source, state IDs, and scoring definitions before collecting results. Record all attempts, including failures and invalid responses. Start with a bounded pilot and use observed tokens/cost to size further collection; no bulk request run is currently scheduled.

Completion: a saved table shows which representation, if either, distinguishes safe and blocked crossings, with raw choices, outcome, latency, usage, and uncertainty. Retain a negative finding if neither works.

### 2. Measure simultaneous answers within Jev-only evaluation

After a useful representation is identified, compare action-only against the four-answer bundle on identical states. Then evaluate candidate-specific Jev answers as a separately named Jev-only variant, with a fixed, disclosed answer-combination rule. Keep the raw-choice baseline separate so application logic cannot be mistaken for the model's own choice.

Measure answer validity, action survival/progress, contradictions between Choice and Noul answers, calibration against replay, end-to-end latency, and available cost. Choice preference is not automatically survival probability. Compare batched versus separate questions only on a bounded subset after estimating request volume and cost.

Completion: establish whether additional simultaneous answers improve useful information or decisions under a frozen rule; do not infer benefit from API support alone.

### 3. Validate beyond development states

Once the representation and decision rule are frozen, evaluate the untouched held-out trajectories in the saved 60-state corpus, then collect bounded full-game Jev-only runs. Use the source snapshot appropriate to each experiment; do not silently mix changed physics with historical results.

Continue to freeze simulation time during inference for this decision-quality baseline. Report simulated progress separately from wall-clock latency. A later moving-world Jev-only experiment can measure latency costs, but it must be a separate protocol and must not introduce a local fallback.

Completion: a local report distinguishes bank, road, and river results; success, death, and invalid-action rates; response failures; latency distribution; and observed cost. Hybrid comparisons and other inference models remain deferred.

## Existing evidence and limitations

The [nine-request pilot](jev-pilot-2026-09-20/report.md) covered only three development states, despite creating a 60-state corpus. All raw choices failed; the candidate combination abstained. The [route comparison](jev-route-comparison-2026-09-20/report.md) found OpenRouter faster in five of six pairs, with median 350 ms versus 605 ms for TypeSafe Direct. Different returned model identifiers prevent assuming identical weights. OpenRouter is the provisional baseline route, not an established universal winner.

Prior local-policy survival improvements belong to the preserved hybrid engineering record, not Jev's measured contribution. The historical plan is preserved alongside that record; this document is the current plan. No held-out evaluation, broad model comparison, or hybrid advantage claim has been completed.
