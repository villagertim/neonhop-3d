# Hybrid play: preserved results and lessons

Captured 2026-09-20 before changing the active browser experiment to Jev-only.

The user observed strong hybrid play and requested preservation for later research. Hybrid evaluation is now deferred; this record preserves evidence without claiming that Jev or learning caused the successful behavior.

## Live observation

The paused browser showed score **3,390**, saved high score **174,930**, level **1**, current streak **4**, and persisted best streak **137**. The HUD showed **LOCAL POLICY**, a last decision delay of **14 ms**, and **50,045 decisions**. The decision counter includes WAIT and is not a hop count. The last delay is not a latency distribution. The saved high score and best streak may span multiple runs and prior settings; this screenshot cannot establish their provenance or a Jev success rate.

Earlier in the same observed browser session, the HUD reached level 27 and score 165,630; the later level-1 snapshot follows an automatic restart. This is consistent with a controller that can make substantial sustained progress, rather than a claim that the entire session was death-free.

Evidence: [visible browser state](browser-state.txt), [screenshot](browser.png), [source manifest](manifest.json). The prior implementation is archived under `source/`, including the original main module, HTML, server, physics engine, oracle, learning brain, heuristic evaluator, and autonomy benchmark. The archived engine was checked against the pre-baseline snapshot. Browser learning storage is preserved; the Jev-only controller does not read or erase it. No API keys or `.env` files are included in the archive.

## Controlled local-policy evidence

| Stage | Matched scenario set | Captures | Deaths | Attribution |
| --- | --- | ---: | ---: | --- |
| Before reliability corrections | Nine 180-second scenarios | 113 | 7 | Local policy with mocked provider failures |
| After reliability corrections | Same nine scenarios | 147 | 0 | Local policy with mocked provider failures |
| After progress/timing corrections | Same nine scenarios | 177 | 0 | Local policy with mocked provider failures |
| Longer progress run | Three 600-second scenarios | 276 | 0 | Local policy with mocked provider failures |

The nine-scenario set used three obstacle phases at 1x, 2x, and 5x; each scenario began with fresh memory. The longer set used phases 0, 2, and 5 at 1x. These finite deterministic scenarios do not establish universal reliability. The changes were applied together, so the aggregate improvements cannot assign an exact effect to each individual mechanism.

Recorded oracle-safe forward deferrals fell from **741 to zero** in the nine matched progress scenarios while captures rose from 147 to 177. The counter measures deferral according to the oracle, not proof that every wait was strategically wrong. The higher capture count and unchanged observed death count are the relevant outcome checks.

Sources: [reliability before](../autonomy-before.json), [reliability after](../autonomy-after.json), [progress before](../progress-before.json), [progress after](../progress-after.json), [longer run](../progress-long-run.json).

## Lessons worth retaining

| Mechanism | Evidence and implication | Boundary of the finding |
| --- | --- | --- |
| Local decisions on idle physics ticks | The controller can act on the next available input tick, including accelerated frames. This avoids waiting for browser timer scheduling while a crossing window closes. | Supports real-time responsiveness of local computation; does not measure remote Jev inference. |
| Predictions use actual hop and input timing | The corrected predictor uses eight hop ticks and the next available input tick, rather than an excessive dwell assumption. A regression reproduces a short traffic gap and verifies survival in the engine. | Model mismatch in the controller can create hesitation even when its action scorer is functioning as written. |
| Forward progress is explicit | Removing broad river-position penalties and giving oracle-safe forward actions priority eliminated the captured local-policy hesitation case. | This is a handcrafted policy decision, not evidence of learned or model-derived strategy. |
| Safety is checked when a move executes | Moving obstacles are evaluated after their tick update and before initiating the queued hop. Tests cover delayed replies, takeover, pause, death, restart, and speed changes. | A safety shield can mask a poor model recommendation unless raw and executed actions are logged separately. |
| Immediate survival is distinguished from future escape | When no longer escape is proven, the fallback prefers an immediately survivable action over a known fatal move and labels uncertainty. | This is risk ordering under incomplete lookahead, not a proof of long-term safety. |
| Vetoes and deaths have separate accounting | Rejected model actions no longer penalize the history of actions actually taken. Death callbacks record real outcomes. | Accurate bookkeeping is necessary before comparing learning or hybrid strategies. |
| Fixed physics step and real speed scaling | 1x/2x/5x alter simulated throughput while physics stays at 1/60 second. Collision checks run while the frog is grounded as well as on landing. | Prevents apparent survival improvements caused by missing collisions or a speed control that did not change actual speed. |
| Failure cooldown limits repeated provider stalls | The hybrid uses local control in hazardous lanes and pauses remote retries after failures. | This can make the game look reliable while Jev contributes few or no actions. It belongs to later hybrid evaluation. |

## Questions to retain for later hybrid research

1. How much does adaptive Q-table/trap memory improve results beyond the same fixed local policy? The observed best streak does not answer this; use memory-on/off tests with matched starting states.
2. Does Jev improve any outcomes when the same local controller and safety shield are held constant? Count how often Jev actually influences executed actions and compare against local-only play.
3. Which timing and progress corrections account for the gain? Test each change separately after the baseline is stable.
4. Can a useful Jev decision be requested early enough to arrive before a crossing or portal-selection decision? Existing sub-100 ms gameplay deadlines filtered out measured live responses.

The live browser's displayed local-policy success and the controlled local-only gains should be preserved as engineering lessons. They do not establish a Jev-plus-local advantage. The current priority is a separate unassisted Jev baseline; these hybrid questions remain deferred.

## Restoration reference

The preserved implementation can be examined and run separately from `source/` with a suitable port and separately configured credentials. The archive is a historical checkpoint, not the active application. `source/benchmarks/autonomy.mjs` reproduces the local-only scenarios without provider calls. Keep its results and saved learning memory separate from Jev-only sessions.
