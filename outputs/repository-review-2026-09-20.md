# Repository review — NeonHop 3D

Reviewed September 20, 2026, at commit `f7be564`. The working tree was clean before review. Application source was not changed.

Seven confirmed findings follow in priority order. P1 means address promptly; P2 means a functional defect to address in the normal development cycle.

## 1. [P1] Static serving exposes the workspace `.env`

Location: `server.py:73–74, 106–107`; network binding: `server.py:223–228`.

The static handler serves the entire repository directory without a path allowlist. Following the README and creating `.env` therefore makes API credentials downloadable through `GET /.env`. Git ignore rules do not restrict HTTP serving. The server binds all interfaces, so any client able to reach its port can request the file; this also exposes other repository metadata such as `.git` files.

Verification: started the actual handler on an ephemeral loopback port, with its directory pointed to a temporary fixture containing a synthetic `.env`. An unauthenticated GET returned HTTP 200 and the synthetic secret. No real credential file was read or disclosed.

Fix: serve only intended public assets, block private paths for both GET and HEAD, and default the development server to loopback. Completion criterion: `.env`, encoded variants, and `.git/config` cannot be retrieved, while game assets load normally.

## 2. [P1] The gateway lets unauthenticated callers spend the configured API key

Location: `server.py:124–145`; CORS: `server.py:76–84`.

Requests without Authorization automatically use the server's configured provider key. With the all-interface binding, a reachable network client can submit arbitrary decision requests using the owner's credentials. Wildcard CORS additionally allows foreign browser origins wherever browser local-network policy permits access. Hiding the credential file alone does not close this separate proxy-abuse path.

Verification: sent an unauthenticated decision POST carrying an unrelated Origin to the real handler. A mocked upstream received the synthetic configured Bearer key, and the response allowed `*`. No paid provider requests were made.

Fix: restrict the local gateway to loopback, validate permitted browser origins, and require authentication if access beyond the workstation is supported. Completion criterion: untrusted callers cannot invoke the credential-backed upstream.

## 3. [P1] Delayed AI responses bypass current safety and takeover state

Location: `src/jevAgent.js:253–264, 298–301`.

Action safety is computed before awaiting the provider, then reused after the board has continued moving. There is no fresh safety evaluation at execution. The completion path also checks only PLAYING, so `stop()` or human takeover does not invalidate an in-flight decision. It can queue an AI move and publish enabled telemetry after the agent has been disabled. Death, reset, and restart during a request can similarly invalidate its snapshot.

Verification: delayed a mocked provider promise after evaluating a safe UP move, placed a car in the destination, verified the current oracle rejected UP, and stopped the agent. Resolving the old promise still queued UP; stepping physics lost a life.

Fix: invalidate outstanding work on stop/reset/episode changes, bound request latency, and recompute safety from current state immediately before accepting a move. Completion criterion: delayed responses cannot act after takeover or execute an action that the current oracle rejects.

## 4. [P1] Cars do not collide with a stationary player

Location: `src/gameEngine.js:217–245`; landing-only check: `src/gameEngine.js:302–307`.

Road collisions run only when a hop finishes. The idle physics branch checks river hazards but never vehicles. A player who lands in a clear road tile can stand there while traffic passes through them without losing a life. This also compromises survival measurements collected with this engine.

Verification: placed an idle player at `(0, 11)` with an approaching car initially outside collision range. After 20 physics ticks, `findOverlappingCar(0, 11)` returned the car but lives remained three.

Fix: check road collisions each applicable physics tick after obstacles move, including while idle. Completion criterion: an approaching car kills a stationary road player when its collision envelope reaches them.

## 5. [P2] Speed buttons reduce physics precision instead of accelerating time

Location: `src/main.js:337–344`.

The 2x/5x controls multiply `fixedDeltaTime` rather than calling `setSimulationSpeed`. Since the loop consumes the same real-time accumulator in larger chunks, this reduces update frequency without producing the requested time multiplier. `simulationSpeed` stays one, so the AI also retains its normal cadence and remote-request behavior. The oracle's fixed hop-duration assumption no longer matches the coarser hop integration.

Verification: executed the actual `setSimSpeed` function body with multiplier five. It left `simulationSpeed === 1` and changed the timestep from 16.67 ms to 83.33 ms.

Fix: call `engine.setSimulationSpeed(mult)` and retain the 1/60 physics step. Completion criterion: one wall-clock second advances approximately five simulated seconds at 5x, with the fixed timestep unchanged and agent cadence adjusted.

## 6. [P2] Reset Brain calls a method that does not exist

Location: `src/main.js:352–354`.

After confirmation, the Reset Brain button calls `jevAgent.brain.clear()`. LearningBrain provides `reset()`, not `clear()`, so the handler throws and memory remains intact. JevAgent already provides `resetBrain()` to reset memory and update telemetry.

Verification: imported LearningBrain and confirmed `typeof brain.clear === 'undefined'` and `typeof brain.reset === 'function'`.

Fix: call `jevAgent.resetBrain()` from the button handler. Completion criterion: confirming reset clears counters and learned state without a TypeError and refreshes telemetry.

## 7. [P2] Safety vetoes are recorded as actual deaths

Location: `src/jevAgent.js:265–269`.

When the provider proposes an unsafe action, the shield selects a substitute but calls `recordDeath('crash', engine)`. That increments death counters, clears the survival streak, applies blame to previous executed steps, and saves the result, even though no crash happened and the rejected action was never executed. This corrupts both learning and the research telemetry.

Verification: with three lives and a streak of five, mocked an invalid DOWN recommendation from the starting row. The veto left lives at three but increased totalDeaths to one and reset the streak to zero.

Fix: track rejected proposals separately from actual engine deaths; do not penalize unrelated executed history. Completion criterion: a veto changes a veto counter only, while real engine death events continue to update death statistics and learning.

## Validation and limits

- All ten JavaScript source files passed `node --check`; Python source passed AST parsing.
- Executed focused Node reproductions for collisions, delayed decisions/takeover, speed-button behavior, the missing reset method, and false death accounting.
- Exercised the Python HTTP handler with synthetic secrets and a mocked provider, as described above.
- No automated test suite or test script is included in the repository; package.json exposes only the start script.
- This review focused on server exposure, game physics, AI/learning integration, and UI wiring. Renderer/audio code was inspected selectively; browser rendering, mobile interactions, real provider compatibility, and the claimed 100-run research result were not verified.

Recommended order: close the two server exposure paths, fix stale decision execution and road collisions, then correct the three controls/telemetry defects. Rerun survival benchmarks after the physics and accounting fixes before relying on their results.
