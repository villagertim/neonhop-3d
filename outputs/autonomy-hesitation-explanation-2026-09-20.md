# Why autonomous play still hesitates

The current policy can reject forward progress even after its safety checker approves the move. This is a scoring conflict, not simply slow model inference.

## Verified cause

In `src/physicsOracle.js`, forward motion starts at +200, but fixed positional rules subtract 2,000 or 2,500 in selected river positions. Separately, riding a log toward a portal adds +400 to WAIT. `src/jevAgent.js` chooses the highest final score among safe candidates, so these preferences can dominate verified forward progress.

A reproduced example at level 1, x=-3.835, z=5:

- UP: full safety/escape check passed; final score -1,800.
- WAIT: full safety check passed; final score +60.
- Learned values and trap penalties were zero for both.

The controller therefore intentionally waited. The river code says to cross as soon as the next lane is clear, but its scoring rules do not enforce that behavior. Some position preferences may anticipate longer-term trouble; the current code does not demonstrate that justification for each rejected safe opportunity.

## Scope of the evidence

Two 180-simulated-second runs with fresh memory (phases 0 and 5 at 1x) recorded 102 and 19 WAIT decisions, respectively, while UP passed the full safety check. These are individual decision ticks, not 121 separate pauses. Neither run required a learned-score override to explain those waits. Existing user memory may produce different rankings, but it is not necessary to reproduce the conflict.

Most recorded waits occurred when the checker rejected UP, so not every visible opening has been established as safe at landing time. The checker also retains a 120 ms post-landing dwell assumption, while the revised local controller can act on the following 16.7 ms physics tick. That conservative mismatch can reject short crossing windows; its effect was identified in code but not isolated quantitatively in these two runs.

Raw evidence: [autonomy-hesitation-diagnosis.json](autonomy-hesitation-diagnosis.json).

## Recommended correction

In the local controller and physics oracle, replace blanket positional penalties with explicit escape/runway justification for deferring a verified forward move. Align the prediction interval with actual execution timing. Measure rejected safe-forward opportunities and crossing time alongside deaths before accepting a scoring change. Do not simply remove all waiting or force forward motion on every visible gap.

The previous reliability work improved survival and removed network stalls, but its acceptance checks did not measure missed safe opportunities. This investigation changes no application code or user learning memory.
