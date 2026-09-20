# NeonHop 3D remediation plan

Status: implemented. Automated regression checks pass; see the companion verification report for final browser results and limits.

This is the current plan for the seven findings in [the repository review](repository-review-2026-09-20.md). It replaces the review's brief recommended sequence with the concrete steps below. The historical feature roadmap in `docs/implementation_plan.md` remains historical context, not the remediation checklist.

## Scope, ownership, and environment

The implementing developer owns the code changes and verification. All work runs in the local development checkout and on a loopback-only test server. Provider tests use synthetic credentials and mocked upstream responses; no paid calls or production changes are required. The baseline supports the documented single-workstation browser workflow. Network hosting, multi-user authentication, renderer redesign, and model tuning are outside this plan.

Complete four ordered changes, each with focused regression checks. Do not estimate elapsed implementation time or promise AI survival performance until the corrected physics has been exercised. The repository currently has no automated test suite; use Node's built-in test runner and Python's standard-library unittest tools to avoid adding a framework dependency.

| Order | Work | Review findings | Completion gate |
| --- | --- | --- | --- |
| 1 | Restrict static serving and gateway access | 1, 2 — P1 | Private files inaccessible; untrusted requests never reach upstream |
| 2 | Correct road collisions and simulation speed | 4 — P1; 5 — P2 | Grounded road collisions work; 1x/2x/5x preserve fixed physics steps |
| 3 | Make AI decisions safe across delay and lifecycle changes | 3 — P1 | Old decisions cannot act; accepted moves use current safety checks |
| 4 | Correct veto accounting and brain reset | 7, 6 — P2 | Vetoes do not count as deaths; reset survives reload |

Speed correction moves alongside collision correction because both establish the timing contract required by AI validation. This is a dependency adjustment to the review's priority sequence, not additional scope.

## 1. Restrict the local server

Files: `server.py`, `README.md`, new gateway regression tests.

Actions:

1. Bind to loopback only and document the exact supported local URL. Remove the wildcard-interface fallback. Validate Host against explicit local hostnames and the configured port; do not derive trusted origins from arbitrary request headers.
2. Replace repository-wide static access with an explicit public asset allowlist: `/`, `/index.html`, `/styles.css`, and the JavaScript modules required by the application. Apply one normalized-path policy to GET and HEAD. Resolve filesystem paths before checking containment, reject symlink escapes, and disable directory listing. Do not expose `.env`, `.git`, Python source, documentation, or review outputs.
3. Remove wildcard CORS. Before any provider-key lookup or upstream request, require the decision POST to have an allowed same-origin Origin and JSON content type. Reject foreign, `null`, and absent origins for this browser-only endpoint. Reject untrusted preflight requests. Keep ordinary same-origin play working without exposing provider credentials to the browser.
4. Keep any future LAN/public hosting unsupported by this baseline. Such hosting requires a separate authenticated deployment design; CORS alone is not authentication. Trusted local processes remain outside the network-origin protection boundary.

Acceptance checks:

- Run the actual handler on an ephemeral loopback port with a temporary public-file fixture and a synthetic `.env`.
- GET and HEAD for private paths, encoded dot segments, traversal variants, directory paths, and symlink escapes return a denial and no private content. Intended assets still return successfully.
- Foreign/null/missing Origin and invalid Host requests cause zero mocked upstream calls. A valid local browser-origin request forwards the synthetic key and receives the mocked response.
- Verify the configured server address is loopback and both normal startup and failure handling cannot silently bind all interfaces.
- Start the app locally and confirm its assets and no-key fallback still work.

Gate: finish these checks before continuing credential-backed development serving. The review demonstrated exposure with synthetic data; it did not establish that real credentials were accessed.

## 2. Restore the physics and speed contract

Files: `src/gameEngine.js`, `src/main.js`, new engine regression tests.

Actions:

1. Check collisions for a grounded player in road rows after obstacles advance, including while no input is queued. If a collision causes death, exit the tick so no queued move or later branch affects the respawned player. Preserve the existing airborne/landing collision rules; this change does not introduce a new airborne collision model.
2. Route speed buttons through `engine.setSimulationSpeed(mult)`. Keep `fixedDeltaTime` at 1/60 for every speed and update the selected-button state from the actual engine setting.
3. Confirm the existing agent speed adjustment and accelerated-mode local fallback now observe the selected multiplier. Keep hop duration measured in simulation time.

Acceptance checks:

- Reproduce the approaching-car fixture from the review: a stationary road player loses exactly one life when overlap occurs; moving cars on another row and safe banks do not kill the player.
- Cover landing collisions, respawn, final-life game over, and collision with input queued. Verify one death callback per collision.
- With a controlled animation clock delivering normal-size frame increments, one wall-clock second advances approximately 1, 2, or 5 simulated seconds, within one fixed step. Do not simulate this with a single one-second frame because the existing long-frame clamp intentionally limits catch-up.
- Verify fixed timestep and hop duration remain unchanged at 1x, 2x, and 5x. Verify paused time does not advance gameplay.

Gate: engine regression checks pass before using this engine for AI acceptance tests or reporting new survival results.

## 3. Invalidate stale AI work and validate at execution

Files: `src/jevAgent.js`, `src/gameEngine.js`, lifecycle wiring in `src/main.js`, new asynchronous agent tests.

Actions:

1. Introduce a decision generation identifier and an engine episode/state revision. Invalidate pending decisions on stop/takeover, pause, death/respawn, portal reset/level change, game restart, speed change, and brain reset. Ensure pause/resume cannot make a pre-pause response valid again.
2. Abort active fetches when invalidated. Apply a total remote-decision budget of 100 ms at 1x, as an initial control deadline based on the existing 110 ms decision cadence. This is a selected deadline, not a measured provider latency guarantee. The direct-provider fallback shares the remaining budget; it does not get a fresh 100 ms. On deadline or provider failure, use the current local policy immediately. Accelerated modes continue to use local decisions.
3. After every asynchronous boundary, check generation, revision, enabled state, game state, and player readiness. Discard obsolete results without changing telemetry, learning history, queue state, or scheduling another loop.
4. Recompute action evaluations from the current board after the response. Choose the remote proposal only if it is currently safe; otherwise choose the current local fallback.
5. Close the remaining gap between validation and physics execution: carry AI intent separately from human input and validate it at the physics input-consumption point, after that tick's obstacle movement and immediately before initiating the hop. On takeover, remove pending AI intent without discarding the user's input. Record learning steps only for the decision actually accepted/executed; retain intentional WAIT records where applicable.
6. Use generation-aware cleanup so completion of an old request cannot clear a newer request's busy state. Keep exactly one decision loop active after rapid stop/start cycles. If no safe move exists, preserve an explicit emergency policy and mark it unsafe; do not claim the shield guarantees survival.

Acceptance checks:

- Delay a mocked provider reply, advance obstacles until the proposed move is unsafe, then resolve it. The old move is not executed, including if safety changes between response handling and the next physics tick.
- Repeat with stop/takeover, pause/resume, death, portal capture, restart, speed change, and brain reset during the request. Old results neither queue moves nor restore enabled telemetry nor alter learning.
- A pending AI intent is removed on takeover while the first human move remains intact.
- Timeout and provider errors release the active decision and permit current local fallback without overlapping loops. Rapid stop/start leaves one loop.
- Verify safe responses still execute, so cancellation protections do not disable normal spectator play.

Gate: deterministic delayed-response tests pass against the corrected engine. A provider response's old safety label is never accepted as proof of current safety.

## 4. Repair learning statistics and reset behavior

Files: `src/jevAgent.js`, `src/learningBrain.js`, `src/main.js`, new learning integration tests.

Actions:

1. Remove `recordDeath('crash', engine)` from the safety-veto path. Track rejected proposals with a separate veto counter. Only actual engine death callbacks update death totals, survival streaks, and death-related penalties.
2. Wire Reset Brain to `jevAgent.resetBrain()`. Apply the invalidation from step 3 so a pending decision cannot immediately repopulate freshly cleared learning.
3. Reset counters, Q-values, trap memory, traces, and transient triage/veto state. Remove both current and legacy learning-storage keys so the migration fallback cannot resurrect old memory on reload. Refresh HUD telemetry through the existing agent callback.
4. Preserve existing user memory during code installation. For validation and subsequent benchmark measurements, use a fresh isolated browser profile/storage fixture. Do not silently combine historical statistics produced by the defective engine with corrected measurements.

Acceptance checks:

- A mocked unsafe proposal increases only veto accounting: lives, death counters, streak, and death-related Q/trap penalties remain unchanged by the veto itself.
- A real engine death updates death accounting exactly once; portal success still updates the success streak.
- Confirming Reset Brain clears in-memory and persisted learning and updates the HUD without an exception. Seed current and legacy keys, reset, then instantiate a new brain to verify defaults remain.
- Canceling reset preserves state. Resolving a response that started before reset cannot restore old state.

Gate: learning integration tests and the browser reset flow pass.

## Final verification and delivery

The implementing developer runs the combined regression suite after all four changes, then starts the local server for one browser smoke pass. Add an `npm test` entry that runs the Node tests and Python unittest discovery; retain JavaScript syntax and Python parse checks. No paid services are needed.

The browser pass covers human movement, spectator start/stop, keyboard takeover, pause/resume, all speed buttons, restart, brain reset, and game-over handling. Check that normal assets load, denied paths remain blocked, and these actions produce no uncaught exceptions. Use mocked remote responses for the delayed-response case and no-key local mode for ordinary play.

Remediation is complete when all seven findings have passing acceptance evidence, the README describes the new local access behavior, and the final change summary identifies any remaining limitations. Save test commands and outcomes in a local verification report. Do not require the agent to reproduce 100 flawless runs as a bug-fix acceptance gate: correcting collisions and statistics may legitimately reduce the reported streak. Any renewed survival claim requires a separate run with fresh learning state and recorded conditions/results.

Deliver the source changes, focused regression tests, updated README, and verification report. No deployment, provider purchase, or historical research-result rewrite is included.


## Execution notes

All four stages were implemented in the working tree. AI proposals are evaluated at the physics input-consumption point, after obstacle movement; no snapshot-based action is selected or recorded before that point. This consolidates the planned post-response and execution checks into the final authoritative check.

Browser screenshot inspection found an existing missing closing brace in `styles.css` that disabled layout and overlay rules. The brace was restored as a small prerequisite for meaningful visual verification; this did not introduce a redesign. The optional browser script now checks computed layout and hidden telemetry as well as control state.

The implementation and verification evidence are recorded in [remediation-verification-2026-09-20.md](remediation-verification-2026-09-20.md).
