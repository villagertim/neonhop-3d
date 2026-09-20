# Current plan: maximize Jev with local application logic

Updated 2026-09-20 following the user's explicit scope correction. Owner: Codex as development and experiment tooling assistant in the local Frogger workspace.

## Effort closed after the final bounded test

The user limited remaining work to one five-minute test and then ended this effort. The [final test](jev-supported-final-test/report.md) is complete: supplying local candidate forecasts improved best-scoring shielded choices from 2/6 to 5/6, with 6/6 survival in both variants. This was a frozen-state prototype, not a deployed full-game improvement. The implementation and exploration steps below are retained as an unexecuted reference; none is queued or scheduled. Following the user’s subsequent deployment request, the supported controller with candidate forecasts is now deployed locally; see [deployment notes](jev-supported-deployment.md). No broader research run has been restarted.

## Goal and sole model restriction

Explore how Jev combined with locally executing application logic can improve results in this environment. Jev is the only inference model allowed to participate in runtime execution. No other cloud or local model may plan, choose, advise, repair, rank, or grade runtime decisions. This excludes a Qwen/LiteLLM runtime component and live Codex guidance to the player.

Local programming is fully allowed: physics prediction, safety checks, search, rules, caching, scheduling, aggregation of Jev answers, history, adaptive bookkeeping, and fallback control. Their presence does not invalidate a Jev application. Existing adaptive tables are application state, not permission to introduce another inference model. Development-time coding and deterministic offline analysis are allowed.

The objective is useful outcomes from the complete application, with experiments identifying where Jev improves them. Maximize useful Jev contribution, not raw request count or the fraction of movements directly selected by Jev. Supporting code may transform observations, propose alternatives, provide calculated features, and act on multiple Jev answers.

## What this replaces

This supersedes the restriction that every movement must be an unmodified Jev Choice without local safety or decision support. That restriction was the assistant's mistaken interpretation of the goal. Hybrid evaluation is now central to the work, not deferred. The previous raw-controller plan is preserved in `jev-only-live/superseded-raw-controller-plan.md` as historical context only.

The raw controller's three fatal choices describe that configuration. They do not reject Jev combined with supporting logic. The successful hybrid and its engineering lessons remain the starting point. Attribution measurements should guide improvement, not disqualify normal application engineering.

## Verified state at this correction

- The successful hybrid source and observations are preserved in [the lessons record](hybrid-preservation-2026-09-20/lessons-learned.md).
- Controlled local-policy tests improved from 113 captures/seven deaths to 177 captures/zero deaths across nine scenarios. Those runs mocked provider failures; they demonstrate supporting code capability, not a measured Jev increment.
- The [raw-controller run](jev-only-live/report.md) and prior provider/prompt pilots remain useful diagnostic evidence.
- The application is still configured with the raw Jev controller at the time of this document change. Restoring the supported controller is next implementation work; this goal correction does not claim it has already happened.
- Existing source and trace audits found no second inference model in the tested gameplay path. Recheck that property as new integration paths are introduced.

## Ordered implementation and evaluation

### 1. Restore the successful supported application with durable attribution

Developer: restore the preserved local controller mechanisms in the active development application while retaining request/response and execution logging. Keep the raw controller as a separately named diagnostic mode, not the default definition of Jev-only. Preserve hybrid memory and keep experiment sessions identifiable.

For every decision record Jev's available answers, response age, locally proposed action, accepted/rejected/unused status, final action, reason, latency, available usage/cost, and engine outcome. Inspect outbound runtime calls and imports to confirm only Jev is used as an inference model. Run appropriate controller/gateway regression tests and verify a bounded browser session.

Completion: supported gameplay works again, its source of decisions is visible and recorded, and runtime isolation is verified. No second model is introduced.

### 2. Explore useful roles for Jev through local logic

Prioritize roles that fit observed latency and give Jev information it can use:

1. Ask several focused questions in one request: compare candidate crossings, destination priorities, risk, and escape opportunities. Local code may compute geometry and candidate features and combine typed answers under a documented rule.
2. Request plans or rankings ahead of crossings and portal changes, while local code handles immediate timing and safety. Specify when each answer expires; discard stale advice.
3. Use Jev to select among locally feasible routes or strategies, including situations where immediate safety leaves several useful alternatives.
4. Use history summaries, cached answers for demonstrably equivalent states, and uncertainty-triggered requests to reduce unnecessary calls. Evaluate any memory or scheduling changes separately.

These are hypotheses to test, not claims that all uses are beneficial. Start with candidate assessment and ahead-of-crossing scheduling because the earlier sub-100 ms movement deadline was shorter than measured provider round trips. Keep one integration change at a time where practical.

### 3. Measure improvement with matched comparisons

For each candidate integration, compare the same local application with Jev enabled versus its defined no-response/local-only behavior on matched initial states, durations, and memory settings. Use deterministic engine outcomes for grading. The local-only comparison is an attribution control, not a competing-model evaluation or a restriction on allowed code.

Report captures, deaths, progress per simulated and wall-clock time, stalls, response validity, latency, cost when available, useful-answer coverage, and how often Jev changes a decision. Examine both beneficial and harmful changes; a safety veto can prevent harm while hiding an inaccurate answer.

Use small development pilots before expanding. Estimate request volume, throughput, and observed cost before a larger run; record that estimate and any spending constraint. Freeze the selected integration before using untouched held-out trajectories. Do not claim exhaustive coverage of all conceivable applications from a finite experiment.

Completion: preserve useful integrations and negative findings, explain where Jev improves the complete application, and identify which conditions make those benefits reliable. Deliver source, traces, and a local report. A visually successful demo and a measured improvement are complementary outcomes; record both accurately.

## Evidence to retain

- [Hybrid lessons and checkpoint](hybrid-preservation-2026-09-20/lessons-learned.md)
- [Initial raw-controller result](jev-only-live/report.md)
- [Frozen-state pilot](jev-pilot-2026-09-20/report.md)
- [Route comparison](jev-route-comparison-2026-09-20/report.md)

OpenRouter was faster in five of six measured pairs, but returned model identifiers differed; exact weight equivalence and general route superiority remain unverified. The current scope permits either service to deliver Jev. It does not permit either service to substitute another model.
