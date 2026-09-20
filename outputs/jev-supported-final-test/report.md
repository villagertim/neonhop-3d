# Final bounded test: local candidate forecasts for Jev

Completed 2026-09-20 within the user's five-minute limit. This is the final experiment for this effort. No further experiment or background inference run is scheduled.

## Result

**Supplying local physics forecasts improved Jev's choices in this small paired test.** With the existing hybrid safety/fallback applied to both variants, all six states survived in each variant. The number selecting a highest-scoring short-horizon outcome improved from **2/6 to 5/6**, and safety vetoes fell from **4/6 to 1/6**.

Before the shield intervened, geometry-only Jev chose legal surviving moves in **3/6** states; forecast-supported Jev did so in **6/6**. The former includes one illegal DOWN at the bank and two fatal moves; it is not three deaths. Supported choices achieved the best available progress score in **6/6**, compared with **2/6** for geometry alone.

| Measure | Geometry only | Local forecasts supplied |
| --- | ---: | ---: |
| Raw choices legal and surviving | 3/6 | 6/6 |
| Raw choices with best progress score | 2/6 | 6/6 |
| After existing shield: surviving | 6/6 | 6/6 |
| After existing shield: best progress score | 2/6 | 5/6 |
| Existing shield vetoes | 4/6 | 1/6 |
| Median provider round trip | 402 ms | 326 ms |

The previous local policy alone survived all six and selected a best-scoring outcome in 2/6 under this test's rubric. Adaptive Q values and trap penalties were disabled for that comparator and the shield fallback to keep replay deterministic; it does not reproduce the browser's accumulated memory.

## What changed

Both request variants used identical geometry, rules, and one Choice question. The supported variant additionally supplied locally calculated candidate outcomes for UP, DOWN, LEFT, RIGHT, and WAIT: legality, survival, death cause, portal captures, row progress, and progress score. Jev selected the action. No other inference model participated.

Forecasts used the actual engine over ten physics ticks, including movement and landing. Progress scores were fixed before requests: 0 unsafe/illegal; 1 survives without advancing and the next UP is unsafe; 2 survives without advancing and the next UP survives; 3 survives and advances; 4 captures a portal. Each raw answer was replayed, then separately replayed through the previous hybrid's oracle and fallback.

## Paired outcomes

“Proposed → executed” shows the existing shield's effect. Scores describe the short-horizon rubric, not a full-game win rate.

| State class | Geometry: proposed → executed | Supported: proposed → executed | Shielded progress score |
| --- | --- | --- | --- |
| bank / blocked UP | DOWN → WAIT | LEFT → LEFT | 1 → 2 |
| bank / safe UP | WAIT → WAIT | UP → UP | 2 → 3 |
| road / blocked UP | DOWN → DOWN | DOWN → DOWN | 2 → 2 |
| road / safe UP | RIGHT → UP | UP → UP | 3 → 3 |
| river / blocked UP | UP → LEFT | DOWN → DOWN | 1 → 2 |
| river / safe UP | UP → WAIT | UP → WAIT | 2 → 2 |

The remaining veto was supported UP in a river state: direct engine replay survived and advanced, but the existing oracle rejected it and selected WAIT. This identifies a specific conservative veto worth retaining in the record. No safety checks were weakened during this test.

## Scope, execution, and cost

Six saved development states were selected before inference: the first safe-UP and blocked-UP case per bank, road, and river, each with at least one safe candidate. All are from one saved development trajectory. No held-out states were used. Request order alternated by state, for twelve requests total, eight-second timeout, no retries. Each reply identified `typesafe/jev-1.13-20260917` through OpenRouter. Total provider-reported `usage.cost` was **0.001798650** (not independently reconciled against billing).

This was a frozen-state prototype using Python requests and JavaScript replay on the workstation. Existing application source was not changed or redeployed; the browser remains configured with the earlier raw controller. The test makes no claim that continuous live hybrid play has already improved.

The question wording was held identical across variants but differs from the historical hybrid prompt. Thus the paired improvement isolates the added forecast information within this test, not every difference from the historical browser.

## Interpretation and practical limit

This is positive evidence for combining Jev with local computed features: the application can remove geometry arithmetic from the model's task and give it actionable alternatives. The previous safety shield retained survival while allowing more useful choices.

The forecasts include an explicit progress score, so a simple local maximum-score selector could also achieve 6/6 on this rubric. This experiment demonstrates that Jev can use the supporting information; it does not establish an advantage over that simple selector or a full-game advantage. Forecasts and grading use the same engine and short horizon. One sample per case, six selected states, and no moving-world latency test limit generalization. Observed 290–366 ms supported responses also exceed the historical 100 ms hybrid deadline: deploying this unchanged would discard them. A live implementation would need requests ahead of use with expiry checks or explicit frozen-time operation.

**Final finding:** retain locally computed candidate forecasts as a promising Jev integration technique. The bounded experiment improved shielded short-horizon selection from 2/6 to 5/6 without reducing observed survival. No deployment or broader claim follows from this test. Work stops here as requested.

## Reproducibility and evidence

- [Frozen cases and predictions](cases.json)
- [Complete requests and Jev responses](traces.jsonl)
- [Raw and shielded engine grades](graded.json)
- [Summary](summary.json)
- [Pre-request manifest and source hashes](manifest.json)
- [Final grader](final-grader.mjs) and [hash](final-grader-sha256.txt)

From the repository root, `node benchmarks/jev-supported-final-test.mjs grade` reproduces the offline grading with no inference requests. Initial experiment sources are in `source/`; the final grader adds shielded outcome recording. The request script refuses to overwrite an existing trace file. API credentials are not included in these artifacts.
