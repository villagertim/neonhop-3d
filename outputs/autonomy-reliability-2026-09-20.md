# Autonomous-play reliability follow-up

Status: implemented and verified locally on September 20, 2026. The game was reopened in AI spectator mode using the updated source. Existing browser learning memory was preserved.

## Findings and corrections

The user's reported reduction in reliability was reproducible. The corrected engine now detects stationary road collisions, so older survival claims are not directly comparable. However, the controller also had timing and emergency-selection defects that required correction rather than weakening collision detection.

1. **Remote failures delayed movement.** At 1x, every decision could wait 100 ms for an unavailable provider and then wait another 110 ms before the next polling cycle. The oracle's assumed dwell interval was only 120 ms. Remote requests now run only on safe banks at 1x. Road and river control proceeds locally without awaiting a network response. Failure or timeout delays the next remote attempt for 30 seconds. The live provider's authentication failure itself has not been repaired.
2. **Wall-clock polling caused different behavior at different simulation speeds.** The local controller now gets an opportunity on every idle physics tick, including ticks batched inside a single accelerated render frame. Final action safety checks and takeover cancellation remain in place.
3. **An unproven future escape could trigger an immediately fatal action.** When all full-lookahead candidates were rejected, the emergency sorter could select a hop into water even though waiting was immediately survivable. It now ranks immediately safe choices ahead of immediately fatal ones. Telemetry distinguishes an unconfirmed escape from an unsafe emergency.

These changes replace the earlier remediation plan's use of a blocking remote budget for every normal-speed decision. The 100 ms budget is retained for safe-bank requests only. This is a bounded control-policy correction; collision detection, provider credentials, and existing user learning memory were not relaxed or reset.

Files changed in this follow-up: `src/jevAgent.js`, `src/gameEngine.js`, `tests/agent.test.js`, `README.md`; new benchmark harness: `benchmarks/autonomy.mjs`.

## Controlled comparison

The same harness exercised the controller before and after these changes, using the corrected game engine. It replaces browser timers and animation-frame timing with a fixed virtual clock, mocks unavailable-provider responses at 250 ms, and uses fresh in-memory learning for each scenario. No real provider requests or credentials are involved.

Nine scenarios cover speeds 1x, 2x, and 5x, each with initial obstacle phase offsets of 0, 2, and 5 simulated seconds. Each scenario runs for 180 simulated seconds. On game over the harness restarts while retaining that scenario's learned state, matching spectator mode's continued learning without its cosmetic restart delay. These are deterministic scenarios, not statistically independent random trials.

| Metric across nine scenarios | Before | After |
| --- | ---: | ---: |
| Portal crossings | 113 | 147 |
| Deaths | 7 | 0 |
| Mock remote attempts | 2,041 | 16 |

After correction, each speed produced the same crossing counts for corresponding initial phases: 15, 15, and 19. All nine reached level 4. The final results are in [before](autonomy-before.json) and [after](autonomy-after.json).

Three additional 600-simulated-second scenarios at 1x checked longer play:

| Initial phase | Crossings | Deaths | Highest level | Best crossing streak |
| --- | ---: | ---: | ---: | ---: |
| 0 seconds | 74 | 2 | 15 | 69 |
| 2 seconds | 75 | 2 | 16 | 69 |
| 5 seconds | 81 | 2 | 17 | 69 |

All six long-run deaths were drownings. The common best streak reflects convergence in this deterministic environment, not three independent demonstrations of general reliability. See [long-run results and failure traces](autonomy-long-run.json).

## Regression and live checks

`npm test` passed **30 Node tests and 6 Python tests**. The new tests cover nonblocking road/river decisions, remote retry backoff, local decisions within batched physics ticks, and a concrete no-escape river fixture that must prefer waiting over drowning. Existing cancellation, takeover, collision, speed, reset, and gateway checks continue to pass. See [test output](autonomy-regression-results.txt).

`node --check src/jevAgent.js`, `node --check src/gameEngine.js`, and `git diff --check` passed. The local server was confirmed listening on `127.0.0.1:8000`. A new browser tab was opened and WATCH AI PLAY was activated; the UI showed active local-policy decisions and retained existing streak memory.

## Practical limits

This improves the tested controller behavior; it does not guarantee flawless survival. Higher levels still expose river-navigation failures. The benchmark does not include rendering stalls, every possible initial state, successful live-model responses, or the user's accumulated learning table. Existing learned values can therefore produce different trajectories from the fresh-state comparison.

The previously reported 100-flawless-run milestone remains unverified under the corrected engine. Live remote use still depends on valid provider authentication; the local policy keeps play moving when that service is unavailable.
