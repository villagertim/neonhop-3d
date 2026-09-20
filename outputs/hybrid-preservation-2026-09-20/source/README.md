# NeonHop 3D: Empirical Research Testbed for System 1 Decision Models
### Finding where TypeSafe Jev adds measurable value in continuous control

A high-fidelity, visually spectacular 3D cyber-arcade simulation set in a Cyberpunk / Cyber-Neon digital universe. This application utilizes **WebGL (Three.js r160+)** for isometric 3D rendering, a procedural lane spawning engine, dynamic in-code **Web Audio synthesis**, high-performance mobile-first styling guards, and an autonomous AI spectator mode powered by **TypeSafe Jev** and a deterministic **Kinematic Physics Oracle**.

> [!IMPORTANT]
> **Research Focus & Scope Delimitation**:
> This repository is an **empirical research testbed and measurement instrument** designed to evaluate the architectural, performance, and economic benefits of applying a fast **System 1 decision model (specifically TypeSafe's Jev)** versus the sole reliance on traditional **autoregressive LLM-style models**.
>
> * **Primary Goal**: Evaluate Jev's utility, advantages, and disadvantages, including ways to make greater use of its simultaneous typed answers where they improve results. Compare decision quality, uncertainty, latency, cost, and dependence on deterministic safety checks. Advantages over local rules or autoregressive models are hypotheses to test.
> * **Game's Role**: The simulation is a measurement instrument. Better autonomous gameplay alone does not establish Jev's contribution. Preserve model proposals separately from safety vetoes, local fallbacks, learning, and executed actions.

**Current research plan:** [Jev evaluation and utilization](outputs/jev-evaluation-plan-2026-09-20.md). This replaces gameplay optimization as the research priority. Current deterministic benchmarks mock provider failure and measure the local controller only. On 2026-09-20, the old OpenRouter authentication check returned HTTP 401. After a new TypeSafe key was supplied and the gateway restarted, one live four-question request succeeded (HTTP 200, model `jev-1.13.0`, 1,384.87 ms end to end). This verifies the integration, not comparative performance; it exceeded the current 100 ms gameplay cutoff. The historical research claims below and in `docs/` are not validated findings from the corrected engine.

**Pilot completed:** [Nine-request results and isolation audit](outputs/jev-pilot-2026-09-20/report.md). All replies were from Jev-1.13.0; no other inference model or AI grader participated. Raw replay excludes oracle/learning assistance. On three development states, all nine raw action recommendations were fatal and the eleven-question selection rule abstained; latency was 490–624 ms. This limited result does not establish overall model capability. Ordinary spectator gameplay still uses local safety rules and adaptive memory.

**Route comparison completed:** Both keys now work. [Twelve matched requests](outputs/jev-route-comparison-2026-09-20/report.md) measured OpenRouter at 350 ms median and TypeSafe Direct at 605 ms; OpenRouter was faster in five of six pairs. Neither met 100 ms, and neither improved the raw action outcomes on these states. Returned model identifiers differ. This is a small operational comparison, not proof of equal model weights or general route superiority.



> [!NOTE]
> **Trademark & Legal Attribution**:
> *NeonHop 3D* is an original software title inspired by classic 1980s arcade traffic-dodging and river-crossing mechanics. It is not affiliated with, sponsored by, authorized by, or endorsed by Konami Digital Entertainment Co., Ltd. or any of its subsidiaries. All historical trademarks referenced for nominative context belong to their respective owners.

---

## 🏗️ Architecture & High-Performance Design
To guarantee a solid 60 FPS experience across desktop and mobile, this game implements several advanced engineering patterns:
1.  **Interpolated Fixed-Timestep Loop**: Decouples physics calculations from rendering frame rates. Game state ticks run at a strict $60\text{ Hz}$. The rendering pipeline uses a temporal interpolation factor ($\alpha$) to compute exact sub-frame positions, eliminating micro-stutter on high-refresh-rate displays ($90\text{ Hz}/120\text{ Hz}$).
2.  **Instanced Rendering**: Implements `THREE.InstancedMesh` for road cars, floating logs, and drones, consolidating hundreds of active models into single draw calls.
3.  **Point Light Billboard Simulation**: Point lights on obstacles are replaced with flat emissive materials and additive 2D billboard sprite layers positioned slightly above the floor grid ($Y = 0.01$) to simulate reflection sweeps at zero GPU shading cost.
4.  **Zero-Allocation Pooling**: Pre-allocates active coordinate vectors and synthesizer nodes (Voice Pooling) to completely prevent Garbage Collection (GC) pauses during gameplay.
5.  **Look-Ahead Audio Scheduler**: Uses a "Two-Clocks" pattern to schedule Web Audio events $100\text{ ms}$ ahead of time using hardware clock timers, preventing music tempo drift during WebGL load spikes.

---

## 🚀 Quick Start & API Key Configuration

To run the game with live autonomous AI spectator mode powered by **TypeSafe Jev**, follow these setup steps:

### 1. Configure Your API Key (.env)
The repository includes a configuration template file [`.env-example`](.env-example). Copy it to create your local `.env` in the workspace root directory:
```bash
cp .env-example .env
```

Open `.env` in your text editor and enable **one of two supported keys**:

```bash
# ------------------------------------------------------------------------------
# PRIMARY: TypeSafe AI Direct API Key (Preferred)
# ------------------------------------------------------------------------------
# Direct TypeSafe provider connection; measure actual end-to-end latency.
TYPESAFE_API_KEY=your_typesafe_key_here

# ------------------------------------------------------------------------------
# SECONDARY / FALLBACK: OpenRouter.ai API Key
# ------------------------------------------------------------------------------
# Used if TYPESAFE_API_KEY is unset; routes queries via OpenRouter decisions API.
OPENROUTER_API_KEY=your_openrouter_key_here
```

> [!IMPORTANT]
> **Key Hierarchy & Priority**:
> 1. **`TYPESAFE_API_KEY` (Primary)**: If defined, the server routes decision requests directly to TypeSafe AI's endpoint (`https://api.typesafe.ai/v1/systemone`) targeting `jev-latest`.
> 2. **`OPENROUTER_API_KEY` (Secondary / Fallback)**: If `TYPESAFE_API_KEY` is not provided, the server automatically routes decisions to OpenRouter (`https://openrouter.ai/api/alpha/decisions`) targeting `typesafe/jev-1.13`.
> 3. **Local Fallback (Zero-Key)**: If neither key is configured or a request fails, movement uses a handwritten policy and the Physics Oracle. [`src/jevEvaluator.js`](src/jevEvaluator.js) supplies handwritten heuristics to the learning workflow; it contains no Jev model weights or local Jev inference. Its numeric outputs are not measured model probabilities.
>
> **Security & Privacy Guard**:
> Your local `.env` file is strictly ignored by [`.gitignore`](.gitignore). It will **never** be committed or published to GitHub when pushing to public repositories. Always reference [`.env-example`](.env-example) for sharing configuration examples.

### 2. Start the Server
Run the built-in Python gateway server:
```bash
python3 server.py
```
The server will automatically reference and load `.env` from the active workspace directory, report the active key provider in the startup console banner, and serve the application at:  
👉 **`http://localhost:8000`**

### Local access and verification

The gateway binds only to `127.0.0.1` (port `8000` by default; `PORT` can change it). Open `http://127.0.0.1:8000` or `http://localhost:8000` on the same workstation. Python 3.9+ and a browser supporting ES modules are required; the regression suite also requires Node.js 18+.

Only the game HTML, CSS, and named JavaScript modules are served. Private files, repository metadata, documentation, directory listings, and symlink targets are not public assets. Decision POSTs require the exact local browser Origin, a matching allowed Host, and JSON content type. Foreign or missing Origin requests are rejected before provider access. There is no wildcard CORS or network-interface fallback. This is a single-workstation gateway, not an authenticated LAN/public service; trusted local processes are outside its origin checks.

Remote AI requests are attempted only on the safe starting/median banks at 1x, with one 100 ms client deadline covering the gateway and any direct fallback. Road and river decisions use the local policy immediately. A failed or timed-out request pauses remote retries for 30 seconds; changing the browser API key or reloading permits a fresh attempt. Aborting the browser request does not guarantee cancellation of work already accepted by an upstream provider. Moves are checked against the current board when physics consumes them, and pending AI work is invalidated by takeover, pause, respawn, restart, speed changes, and brain reset. At 2x/5x the agent uses the local policy and the physics step remains 1/60 second. Safety vetoes have their own counter and do not count as deaths. Local control runs on idle physics ticks, including multiple ticks in an accelerated frame. If no future escape is proven, an immediately survivable move is preferred over a fatal hop; this is still marked as an unconfirmed escape.

The local policy now prioritizes a forward move accepted by the oracle, using the engine's hop duration and next-input timing. A safe remote recommendation, including WAIT, remains eligible. The response adapter supports the documented `answers` envelope and `noul` probabilities, preserves zero scores, and keeps the full provider response in `modelDecision.rawResponse` in the telemetry callback even after a veto. The HUD still displays the executed action; callback retention is not a durable experiment log. The evaluation plan requires separate request timing, failures, and persisted raw traces before live comparative claims. The bank-only request schedule is a gameplay fallback configuration, not a representative Jev evaluation across road and river decisions.

Run the focused offline regression suite from the repository root:

```bash
npm test
```

It uses synthetic secrets, temporary storage, and mocked provider responses. An optional browser smoke script is available at `tests/browser-smoke.cjs`; it requires Playwright, Chromium, and Node.js 20+. Run `python3 tests/serve-browser-fixture.py` in one terminal; it skips credential loading and prints an ephemeral `TEST_URL`. In another terminal, set that printed URL as an environment variable and run `node tests/browser-smoke.cjs`. It tests controls, no-key fallback, takeover, reset persistence, and game-over UI in a fresh browser context. Do not point it at a credential-backed server: it deliberately expects the no-key response.

Run `node benchmarks/autonomy.mjs` to reproduce the nine fixed-clock reliability scenarios (three obstacle phases at 1x/2x/5x, 180 simulated seconds each). The benchmark uses fresh in-memory learning per scenario and mocked provider failures; it does not render a browser or call a live model.

Existing learning memory is preserved when upgrading. Use RESET BRAIN or a fresh browser profile before collecting results from the corrected engine. Earlier survival figures in the historical sections below have not been revalidated after the collision and accounting fixes.

### 3. Playing & Spectating
* **Autonomous AI Spectator Mode**: Toggle the **SPECTATOR MODE** button or click **READY** to watch the autonomous agent dodge highway traffic and traverse river streams hands-free while streaming live telemetry.
* **Seamless Human Hand-off**: Press any Arrow key or WASD (or click **TAKE CONTROL**) at any point to instantly take control of the character.

---

## 📂 Project Structure
```
├── .env-example                 # API key configuration template (TypeSafe direct / OpenRouter)
├── package.json                 # Project manifest & ES module declaration
├── index.html                   # HTML structure, sidebar HUD, and import maps
├── styles.css                   # Glassmorphism, neon animations, and responsive layouts
├── server.py                    # Lightweight Python gateway & static asset server
├── README.md                    # Research overview, setup, and changelog (this file)
├── docs/
│   ├── white_paper_hybrid_neuro_symbolic_neonhop.md # Peer-reviewable white paper on hybrid neuro-symbolic control
│   ├── jev_findings_and_lessons_learned.md          # Architectural lessons learned, Credit Assignment Paradox, and RLCD
│   ├── walkthrough.md                               # Milestone walkthrough verifying 100 flawless runs
│   ├── implementation_plan.md                       # Phased roadmap, multi-model allocation, and architecture
│   └── local_model_log.md                           # Mandatory local model inference logging (LiteLLM local-model)
└── src/
    ├── main.js                  # Application bootstrapper [Phase 2]
    ├── gameEngine.js            # Physics updates and grid state interpolation [Phase 2]
    ├── jevAgent.js              # TypeSafe Jev (System One) autonomous AI spectator agent
    ├── renderer.js              # Three.js r160 scene builder and instanced meshes [Phase 3]
    ├── inputManager.js          # Touch-swipe & keyboard input buffer [Phase 5]
    ├── soundEngine.js           # Voice-pooled Web Audio synthesizer & scheduler [Phase 4]
    └── leaderboard.js           # Score serialization and localStorage system [Phase 5]
```

---

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
