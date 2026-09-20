# NeonHop 3D: Jev evaluation testbed

The research goal is to **maximize Jev combined with locally executing application logic**. Physics prediction, safety checks, rules, memory, scheduling, and answer aggregation are allowed. **Jev must be the only inference model participating at runtime.** The game records requests, raw responses, executed actions, and outcomes to identify which integrations improve results.

**Deployment status:** the active local game now uses `SupportedJevAgent`: Jev receives exact state and local candidate forecasts; the existing physics shield, fallback policy, and adaptive memory remain active. Jev is the only runtime inference model. See [deployment notes](outputs/jev-supported-deployment.md).

- [Final bounded test: supported Jev results](outputs/jev-supported-final-test/report.md) — effort concluded; no further tests scheduled.
- [Current evaluation plan](outputs/jev-evaluation-plan-2026-09-20.md)
- [Preserved hybrid results and lessons](outputs/hybrid-preservation-2026-09-20/lessons-learned.md)
- [First live Jev-only baseline](outputs/jev-only-live/report.md)
- [Frozen-state pilot](outputs/jev-pilot-2026-09-20/report.md) and [provider-route comparison](outputs/jev-route-comparison-2026-09-20/report.md)

The first live baseline produced three UP choices, three collision deaths, and zero captures. This is a narrow initial finding, not a conclusion about every use of Jev. The preserved hybrid performed substantially better in the observed session and controlled local-policy benchmarks, but those results do not establish Jev's contribution.

## Run locally

Requires Python 3.9+ and a browser with ES modules/WebGL. Tests also require Node.js 18+.

Create `.env` from `.env-example` if it does not already exist, then set:

```dotenv
OPENROUTER_API_KEY=your_key_here
# Optional for direct-provider experiments:
TYPESAFE_API_KEY=your_key_here
```

The active supported controller explicitly selects OpenRouter and requests `typesafe/jev-1.13`. A TypeSafe key alone does not satisfy this controller's route. The gateway still supports explicit TypeSafe requests for separate experiments; unqualified requests retain the historical TypeSafe-first default. Explicit route failures do not switch providers. Keys stay on the server and are excluded from Git; do not copy credentials into logs or reports.

```bash
npm start
```

Open http://127.0.0.1:8000 on this workstation. The server loads `.env` at startup; restart it after changing credentials. There is no bundling build step. Reload the browser after source changes.

## Current supported Jev behavior

Click **WATCH JEV + LOCAL LOGIC**. The app samples a Jev request at the next idle physics boundary after a two-second gap from the preceding completion. It freezes simulation time during that request so candidate forecasts remain current, then rechecks the proposed move with the existing safety shield when it executes. Local control runs between requests. This timing differs from the former 100 ms bank-only request limit and from continuous moving-world inference.

The request includes exact game rules and state plus ten-tick candidate forecasts for all five actions. The action question prefers surviving candidates, then higher progress scores. Threat, evacuation, and forward-clearance questions remain available as simultaneous telemetry. The forecasts use the same computation checked against all 30 candidates in the final bounded test.

The gateway explicitly selects OpenRouter's Jev model. There is no alternate inference model or direct browser-provider fallback in this active controller. An eight-second request timeout or invalid response resumes local control and delays another Jev attempt for 30 seconds. Pause, takeover, restart, and speed changes invalidate pending proposals. The HUD identifies waiting, accepted Jev moves, local control, and safety vetoes. Game over retains the original three-second automatic restart behavior.

Hybrid memory and scores are restored and preserved. Request/response, remote proposal/execution, capture/death, and cumulative attribution statistics are saved under `outputs/jev-supported-live/`; these are private local files. Routine local movements are counted rather than individually persisted. Recording failures display a warning while gameplay continues. The older raw controller remains in the source tree as a diagnostic, but is not the active entrypoint.

## Verification and isolation

```bash
npm test
```

The current recorded suite passes 57 JavaScript and eight Python tests with mocked responses and synthetic credentials. Tests cover frozen simulation, unsafe raw action execution, WAIT/invalid moves, timeout halt, stale reply cancellation, response validation, recording failure, explicit provider routing, and private log storage, alongside prior engine/hybrid regressions.

The optional `tests/browser-smoke.cjs` targets the preserved raw-controller diagnostic, not the newly deployed supported UI. It requires Playwright/Chromium and Node.js 20+. Start `python3 tests/serve-browser-fixture.py`, then supply its printed `TEST_URL` when running the script. It expects a no-key fixture, checks the error halt and retry UI, and uses synthetic responses for other assertions. Do not point it at the credential-backed server. The saved regression count above does not include this optional script; the initial live browser run was verified separately.

The active entrypoint imports `src/supportedJevAgent.js`, which extends the local hybrid controller and uses `src/candidateForecasts.js`. The old agent's direct request method is overridden; the runtime request path explicitly calls Jev through the local gateway. Local physics, adaptive tables, and rules are permitted supporting logic. Codex does not supply gameplay inference.

The gateway binds to loopback only. Static assets use an explicit allowlist; private files, symlinks, repository metadata, and directory listings are excluded. Decision/log POSTs require the matching local Origin, Host, and JSON content type. This is a single-workstation development service, not a public or LAN-authenticated application.

## Preserved hybrid work

The historical source checkpoint is `outputs/hybrid-preservation-2026-09-20/source/`. Its local autonomy benchmark uses mocked provider failures and fresh in-memory learning; it measures local control, not Jev. Run the archived `benchmarks/autonomy.mjs` from that source tree to reproduce its scenarios. Do not pool these results with Jev-only sessions.

Historical pilot results have frozen engine/source snapshots. Their source-hash checks intentionally reject a changed engine; reproduce them using their archived sources rather than silently regrading against the active engine.

## Source layout

- `src/main.js`: application and experiment UI
- `src/supportedJevAgent.js`: deployed Jev + local logic controller and traces
- `src/candidateForecasts.js`: deterministic candidate outcome forecasts
- `src/jevOnlyAgent.js`: preserved raw-controller diagnostic
- `src/gameEngine.js`: physics, scoring, state, and freeze hooks
- `src/renderer.js`, `soundEngine.js`, `inputManager.js`: presentation and human controls
- `server.py`: local gateway, protected trace persistence, static assets
- `tests/`: engine, gateway, controller, and optional browser checks
- `benchmarks/`: historical controller and isolated Jev evaluation tools
- `outputs/`: saved protocols, measurements, traces, and source checkpoints

## Historical documentation

The development history below and older files in `docs/` describe earlier architectures and claims. They are not the current experiment protocol or validated evidence of Jev's advantages. Current scope and results are in the linked plan and reports above.

## 📓 Development History & Changelog

### Phase 1: Foundations, CSS & Core Scaffolding
**Completed**: 2026-05-24
*   **Scaffold Structure**: Created `index.html` mapping out the left sidebar HUD (current/high scores, lives, level meters, pause controls) and central WebGL canvas container.
*   **Dependency Management**: Registered native ES6 Import Maps targeting standard **Three.js r160** modules.
*   **Cyber-Neon Aesthetic**: Created `styles.css` establishing custom HSL colors, pulse neon keyframe glow cycles, and mobile-friendly responsive panels.
*   **Performance Guard**: Configured media queries restricting `backdrop-filter: blur(12px)` to desktop viewports ($\ge 1024\text{px}$), falling back to solid semi-transparent panels on mobile.
*   **Local Inference Logging**: Created `docs/local_model_log.md` to satisfy strict agent boundaries and logging rules.

### Phase 2: Core Game Loop & State Interpolation
**Completed**: 2026-05-24
*   **Fixed-Timestep Clock Loop**: Created `src/gameEngine.js` implementing a deterministic 60Hz physics accumulator game loop, exposing a temporal interpolation factor ($\alpha$) to let the render cycle render perfectly fluid motion on screens of any refresh rate (e.g. 90Hz/120Hz).
*   **Zero-Allocation Systems**: Coded clean coordinate calculations and entity parameters in-place, eliminating GC allocations inside hot loop steps.
*   **Grid Structure**: Standardized a 13-row grid setup: starting safe-zone, 5 road lanes (with vehicles moving at speed metrics scaled by level), 1 mid-river safety junction rest bank, 5 river stream lanes (data packet logs moving at distinct rates), and 5 top destination portal slots.
*   **$O(1)$ Occupancy Collisions**: Developed fast grid cell checks for road vehicle crashes, river dead-zone falls, and targeted destination slot captures.
*   **Application Bootstrapper**: Built `src/main.js` mapping all HUD elements, overlay panels, keyboard arrow navigators, mobile virtual button controllers, and scoring leaderboard operations.

### Phase 3: 3D WebGL Renderer & High-Performance Instanced Spawning
**Completed**: 2026-05-24
*   **WebGL 3D Viewport**: Created `src/renderer.js` configuring the PerspectiveCamera set up with a cinematic isometric follow, and responsive canvas sizing listeners.
*   **Draw-Call Instancing**: Coded `THREE.InstancedMesh` mappings for cars, trucks, and stream packages, merging dozens of independent draw instructions into singular GPU batches to optimize CPU performance.
*   **Parabolic Hop Profiles & Squash-and-Stretch**: Added smooth player capsule coordinate interpolation ($\alpha$) coupled with scale squash and stretch variables and roll rotations mapping directly to hop progression.
*   **Zero-Lighting Billboard Reflections**: Programmed glowing radial canvas textures mapped to additive blending planes positioned at Z lanes at $Y = 0.01$, creating dynamic reflection illusions underneath moving obstacles with zero real-time point light shader costs.
*   **Portal Target Arches**: Added 5 neon wireframe torus structures that dynamically scale and shift emissive intensities and colors depending on gate occupancy.
*   **Bootstrap Linkage**: Modified `src/main.js` to instantiate, resize, and trigger the WebGL renderer rendering cycle.

### Phase 4: Voice-Pooled Web Audio Synth & Scheduler
**Completed**: 2026-05-24
*   **Zero-Asset Audio Synthesis**: Built `src/soundEngine.js` programmatically synthesizing retro hops, crash explosions, water drowning sweeps, level successes, and game over chord chimes using direct AudioContext oscillator grids.
*   **Voice Pooling**: Pre-allocated a fixed pool of 8 connection node sets (oscillators, gains, filters) connected to a master gain line, cycling through idle nodes to eliminate allocations inside high-frequency game ticks.
*   **Look-Ahead Step Sequencer**: Programmed the "Two-Clocks Pattern" using a 25ms Javascript interval sequencer that schedules note triggers 100ms ahead using high-precision hardware clocks (`AudioContext.currentTime`).
*   **Dynamic Background Synthwave**: Coded a rhythmic arpeggiator playing A-minor step loops that scales up its tempo (BPM) and pitch registers dynamically as the level HUD increases.
*   **Autoplay Gesture Workaround**: Linked AudioContext initializations and music activations to user clicks on the READY page, and wired window blur/focus events to suspend/resume the AudioContext to prevent battery drain.

### Phase 5: Hybrid Controls & Leaderboard System
**Completed**: 2026-05-24
*   **Unified Input Manager**: Created `src/inputManager.js` combining keyboard arrow/WASD listeners, virtual button layouts, and custom **Touch Swipe Gesture Vectors** ($dx$/$dy$) into a decoupled module.
*   **Mobile Viewport Overrides**: Bound touch move events with `passive: false` blocks to prevent mobile rubber-band scrolling and avoid double-tap zoom input lags.
*   **JSON-Serialized Local Persistence**: Created `src/leaderboard.js` managing high score structures in local storage under the `neonhop_v1_leaderboard` key.
*   **Try/Catch Parsing Safe**: Shielded JSON deserializations with complete error recovery default sweeps to block codebase crashes from corrupted localStorage edits.
*   **Decoupled Bootstrapper**: Refactored `src/main.js` to strip local listeners and storage calls, moving these controls strictly into class instances to keep main orchestrator lines clean.

### Phase 8: Autonomous AI Spectator Mode Powered by TypeSafe Jev
**Completed**: 2026-09-19
*   **TypeSafe Jev Integration**: Built `src/jevAgent.js` leveraging TypeSafe AI's System One decision model (`typesafe/jev-1.13`) via OpenRouter alpha decisions API.
*   **Three Decision Primitives**: Fully utilizes Jev's three decision primitives in real time:
    1.  **`Choice`**: Tactical navigation selection (`UP`, `DOWN`, `LEFT`, `RIGHT`, `WAIT`).
    2.  **`Score`**: Threat risk level continuous evaluation (`safe` -> `low_risk` -> `moderate_risk` -> `imminent_hazard` -> `fatal_collision_imminent`).
    3.  **`Noul`**: Calibrated binary probabilities for emergency log evacuation (`evacuate_log`) and lane crossing clearance (`forward_path_clear`).
*   **Cyber Telemetry HUD**: Engineered a floating glassmorphic telemetry display (`#ai-telemetry-hud`) over the WebGL canvas, displaying live decision arrows, color-graded threat badges, Noul probability gauges, and decision latency.
*   **Seamless Human Hand-off**: Integrated a "TAKE CONTROL" button and instant keyboard takeover (any arrow / WASD press immediately yields control back to the human player).
*   **Local Gateway & Fallback**: Created `server.py` supporting zero-config proxying using local `OPENROUTER_API_KEY`, direct browser client queries with custom API keys, and calibrated local heuristic fallback.
*   **Arcade Attract Auto-Restart**: In spectator mode, Game Over triggers a 3-second countdown before automatically restarting and continuing gameplay hands-free.

### Phase 9: Spatio-Temporal Physics Oracle & 100 Flawless Runs Milestone
**Completed**: 2026-09-20
*   **Spatio-Temporal Physics Oracle (`src/physicsOracle.js`)**: Implemented high-precision forward kinematic simulation with continuous time window evaluation ($t_{\text{landing}} + t_{\text{dwell}}$), vehicle collision safety buffers ($0.36$), and river log edge margins ($0.42$).
*   **Two-Hop Lookahead Horizon Verification (`hasLane2EscapePath`)**: Formulated deterministic escape checking that accounts for two-hop physics ($T = t_{\text{initial}} + t_{\text{drift}} + t_{\text{hop}}$), preventing the agent from boarding dead-end river logs.
*   **Resolution of Credit Assignment Paradox (`src/learningBrain.js`, `src/jevEvaluator.js`)**: Integrated Jev semantic triage to differentiate between `drift_neglect`, `premature_forward_hop`, and `barrier_impact`, replacing toxic global penalty backpropagation with spatially bounded blame assignment.
*   **Flow-Aware River Navigation**: Added tactical retreats (`DOWN` to Lane 3) when drifting past target portals, rewarded stream conveyance towards portals, and eliminated narrow-log lateral oscillation.
*   **Verified 100 Flawless Runs Milestone**: Confirmed autonomous completion of **100 consecutive successful runs without dying**, clearing Level 20+ ($>3.85\times$ speed) and scoring over **128,250 points**.

---

## 🤖 Multi-Model AI Stack & Deployment Rationale

To achieve reproducible autonomy and survive non-stationary dynamics up to Level 23 ($4.30\times$ speed), the architecture deploys a four-tier heterogeneous intelligence and verification hierarchy, pairing each model with a strictly matched operational time constant and explicit architectural rationale:

| Model / Subsystem | Architectural Tier | Deployment / Access Route | Operational Latency | Primary Technical Rationale & Role |
| :--- | :--- | :--- | :---: | :--- |
| **Gemini 3.8 Flash (High)** | **System 2 Meta-Cognitive Architect** | Google DeepMind / Antigravity Harness | $500\text{–}2500\text{ms}$ | **Deep Reasoning & Code Synthesis**: Ingests multi-module codebases, formulates kinematic proofs (e.g. the 2.5-Unit Confinement Theorem), debugs failure traces, and generates automated Monte Carlo benchmarks. |
| **`local-model` (via `litellm-tim`)** | **Independent Dual Assessment & Local Scaffolding** | Local endpoint via LiteLLM proxy (`call_local_model`) | $1000\text{–}5000\text{ms}$ | **Adversarial Red-Teaming & Local Privacy**: Provides an independent second opinion on milestone success probabilities to counteract primary agent confirmation bias (highlighting the "Integration Gap"), plus private zero-token-cost local code scaffolding and reviews. |
| **TypeSafe Jev (`typesafe/jev-1.13`)** | **System 1 Calibrated Decision Primitives** | OpenRouter Decisions API & local compiled [`src/jevEvaluator.js`](src/jevEvaluator.js) | $<0.1\text{ms}$ (local) / $\sim 100\text{ms}$ (cloud) | **Real-Time Semantic Triage**: Sub-millisecond non-autoregressive decision primitives (`Choice`, `Score`, `Noul`) that resolve the Credit Assignment Paradox by localizing blame to causal actions rather than penalizing reactive evasions. |
| **Kinematic Physics Oracle** | **Deterministic Invariant Shield** | Native ES6 Engine ([`src/physicsOracle.js`](src/physicsOracle.js)) | $<0.5\text{ms}$ per batch | **Absolute Invariant Protection**: Mathematical lookahead shield enforcing continuous collision envelopes and two-hop horizons, guaranteeing that stochastic or learned policies cannot execute kinematically non-survivable transitions. |

### Core Evaluation: Why TypeSafe Jev vs. Sole LLM Reliance?

Traditional autoregressive LLMs (e.g., GPT-4, Claude, Gemini) are fundamentally ill-suited for direct high-frequency continuous control due to three physical and algorithmic bottlenecks:
1. **The Latency Wall**: Generative token-by-token latencies ($300\text{ms}\text{–}2000\text{ms}$) miss sub-$100\text{ms}$ physical control deadlines by orders of magnitude.
2. **Economic Prohibitiveness**: Continuous control at 12 Hz costs \$5–\$20 per hour in standard token pricing, making multi-thousand-run empirical testing unfeasible.
3. **Output Fragility & Lack of Probability Calibration**: Uncalibrated natural language prose requires brittle post-hoc regex parsing and cannot support rigorous mathematical safety thresholds.

By contrast, **TypeSafe Jev** operates as a specialized System 1 decision model providing sub-millisecond, non-autoregressive decision primitives (`Choice`, `Score`, `Noul`) with mathematically calibrated probabilities trained via Reinforcement Learning from Calibrated Decisions (RLCD). Jev enables instant semantic failure triage and spatially localized blame attribution (resolving the classic Credit Assignment Paradox) at negligible cost ($\approx \$0.042$ per 1M input tokens with zero output token fees).

The cyber-arcade game simulation was engineered solely as a demanding real-time physical testbed to evaluate and demonstrate this architectural paradigm shift under extreme velocity stress ($1.0\times\text{--}4.3\times$).

For the complete theoretical formulation, mathematical proofs, and benchmark traces, refer to the peer-reviewable technical white paper:  
👉 **[Technical White Paper: Hybrid Neuro-Symbolic Control in High-Velocity Continuous Environments](docs/white_paper_hybrid_neuro_symbolic_neonhop.md)**

For query prompts and raw responses sent to local inference models, refer to:  
👉 **[Local Model Inference & Query Log](docs/local_model_log.md)**



## Reproducing the isolated Jev pilot

`benchmarks/jev-evaluation.mjs` prepares a 60-state corpus and runs a bounded nine-request pilot against TypeSafe Direct. It never falls back to another model. Raw actions, deterministic local comparisons, safety vetoes, and candidate-combination abstention are logged separately. The observer game should be paused during collection; its learning memory is not used in the CLI experiment.

```bash
# No provider calls:
node benchmarks/jev-evaluation.mjs prepare outputs/NEW-RUN
# Nine live requests; requires a running local gateway and working TypeSafe key:
node benchmarks/jev-evaluation.mjs pilot outputs/NEW-RUN
# No provider calls; recomputes statistics and verifies recorded engine outcomes:
node benchmarks/summarize-jev-pilot.mjs outputs/NEW-RUN
```

The pilot refuses an existing trace file and mismatched source/corpus hashes. Preserve failed or partial runs; use a new directory for an intentional new experiment. The saved 2026-09-20 pilot can be summarized without repeating paid requests. Its exact source snapshot is archived with the results.
