# NeonHop 3D: Autonomous Cyber-Arcade

A high-fidelity, visually spectacular 3D cyber-arcade game set in a Cyberpunk / Cyber-Neon digital universe. This application utilizes **WebGL (Three.js r160+)** for isometric 3D rendering, a procedural lane spawning engine, dynamic in-code **Web Audio synthesis**, high-performance mobile-first styling guards, and an autonomous AI spectator mode powered by **TypeSafe Jev** and a deterministic **Kinematic Physics Oracle**.

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

## 📂 Project Structure
```
├── index.html                   # HTML structure, sidebar HUD, and import maps
├── styles.css                   # Glassmorphism, neon animations, and responsive layouts
├── server.py                    # Lightweight Python gateway & static asset server
├── README.md                    # Local development history and technical documentation (this file)
├── docs/
│   ├── implementation_plan.md  # Core phased technical implementation plan
│   └── local_model_log.md      # Mandatory query logging for local model inference
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


