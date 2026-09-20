# Remediation verification — September 20, 2026

All seven review findings are fixed in the local working tree. The implementation has passed 32 automated regression tests, JavaScript/Python syntax checks, a whitespace check, and a Chromium browser smoke test. Changes have not been committed or deployed.

## Implemented changes

| Finding | Result | Primary files |
| --- | --- | --- |
| 1. Private-file exposure | Explicit public asset allowlist shared by GET/HEAD; directory listings, private paths, and symlink targets denied | `server.py` |
| 2. Unauthenticated network gateway use | Loopback-only binding; validated Host and exact browser Origin; JSON required before provider access; wildcard CORS removed | `server.py` |
| 3. Stale AI decisions | Generation/revision cancellation, abortable 100 ms total remote deadline, separate pending AI intent, current-board safety selection at physics consumption, learning recorded only for accepted actions | `src/jevAgent.js`, `src/gameEngine.js` |
| 4. Idle road collisions | Grounded vehicle collisions checked after obstacle movement and before accepting input; death exits the tick | `src/gameEngine.js` |
| 5. Incorrect speed controls | Buttons call the simulation-speed setter; timestep stays 1/60 second; selection follows engine speed | `src/main.js`, `src/gameEngine.js` |
| 6. Broken brain reset | Correct agent reset method; pending decisions canceled; current and legacy persisted memory removed; telemetry refreshed | `src/main.js`, `src/jevAgent.js`, `src/learningBrain.js` |
| 7. Vetoes counted as deaths | Separate persisted veto counter; only real death events update death/streak/penalty accounting | `src/jevAgent.js`, `src/learningBrain.js` |

One additional integration repair was necessary: the existing hover rule in `styles.css` lacked a closing brace, disabling much of the layout and overlay styling. Restoring the brace made the normal interface render correctly. The browser check now asserts computed layout and actual hidden-element visibility. The initial control-only smoke pass missed this; screenshot inspection caught it, and subsequent browser passes included the repair.

The README documents local access restrictions, deadline behavior, fresh-memory benchmarking, and test commands. Existing user learning data was not erased during implementation.

## Verification evidence

`npm test` passed with **26 Node tests and 6 Python unittest tests**, using the standard runtimes available on this workstation. See [automated test output](remediation-test-results.txt).

The tests cover private and encoded paths, symlinks, GET/HEAD, successful public assets, rejected origins and hosts, allowed synthetic-key forwarding, no-key fallback, malformed payloads, and failure to bind without a wildcard fallback. Provider requests are mocked and actual workspace credentials are not loaded.

Engine/agent tests cover idle and landing collisions, queued input at collision, one death callback, safe banks, final-life game over, controlled 1x/2x/5x elapsed time, unchanged hop duration, delayed responses, takeover, pause/resume, death, portal/level changes, restart, speed changes, brain reset, timeout, provider failure, shared fallback deadline, loop cancellation, veto accounting, reset persistence, and accepted remote primitive telemetry.

All ten source JavaScript files passed `node --check`. `server.py` and Python test/helper sources passed AST parsing. `git diff --check` passed.

The final browser pass used Chromium through the bundled Playwright runtime and a fresh browser context at 1440 × 1000. The system Node.js 18 runtime could run the regression suite but could not run the bundled Playwright; the browser pass used the bundled Node.js runtime instead. No runtime installation was needed.

The browser server was launched with `python3 tests/serve-browser-fixture.py`, which skips credential loading and binds an ephemeral loopback port. The browser script ran as `TEST_URL=<printed local URL> node tests/browser-smoke.cjs`, with the bundled Node executable and Playwright module path supplied in this environment.

The final browser check passed asset loading, real browser-origin no-key requests, private-file denial, human movement, pause/resume, speed buttons, spectator start, keyboard/button takeover, canceling and confirming brain reset, persistence after reload, delayed reply after takeover, and game-over/restart. It reported no uncaught page exceptions and no failed JavaScript/CSS responses. See [browser output](remediation-browser-results.txt) and [final screenshot](remediation-browser-smoke.png). The screenshot was visually inspected after the CSS repair.

## Boundaries and remaining limitations

- The gateway is for a trusted workstation. Origin checks are not user authentication and do not protect against malicious local processes that can forge headers. LAN/public hosting remains unsupported.
- No paid provider requests were made. Live provider schema compatibility and latency were not verified. The 100 ms client deadline may cause frequent local fallback; aborting a browser request does not guarantee cancellation of upstream work already accepted by a provider.
- The emergency policy can still select an explicitly unsafe action when no safe action exists. The fixes do not establish a mathematical survival guarantee.
- Historical survival results were not rerun or rewritten. The README now notes that they predate the collision/accounting corrections. New research results require fresh learning state and recorded benchmark conditions.
- Browser validation covered desktop Chromium. Mobile touch behavior and other browser engines were not tested.

The original seven-finding remediation baseline is complete. No deployment or further model tuning was performed.
