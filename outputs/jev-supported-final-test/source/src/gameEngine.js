// src/gameEngine.js

export class GameEngine {
    constructor() {
        this.state = 'READY'; // READY, PLAYING, PAUSED, GAME_OVER
        this.level = 1;
        this.lives = 3;
        this.score = 0;
        this.persistHighScore = true;
        this.simulationTime = 0;
        this.useSimulationClock = false;
        this.highScore = typeof localStorage !== 'undefined' 
            ? parseInt(localStorage.getItem('neonhop_high_score') || localStorage.getItem('arcade_high_score') || '5000', 10) 
            : 5000;
        this.stateRevision = 0;
        this.onDecisionInvalidated = null;
        this.pendingAIIntent = null;
        this.beforePhysicsStep = null;
        this.onAIInputReady = null;
        this.aiMode = false; // Autonomous spectator mode indicator
        this.simulationSpeed = 1.0;
        this.onGameOver = null;
        this.onAIModeChange = null;
        this.onPortalScore = null;
        this.onDeathOccurred = null;

        // Grid parameters: Z = 12 (Safe Start) to Z = 0 (Portals)
        // X = -6 to +6 (13 columns)
        this.player = {
            prevPosition: { x: 0, y: 0, z: 12 },
            currPosition: { x: 0, y: 0, z: 12 },
            targetPosition: { x: 0, y: 0, z: 12 },
            isHopping: false,
            hopProgress: 0,
            hopSpeed: 8.0, // Completes hop in ~125ms
            deathType: null // 'crash', 'drown', 'out-of-bounds'
        };

        this.inputQueue = [];
        this.maxInputQueueSize = 2;

        this.timeAccumulator = 0;
        this.fixedDeltaTime = 1 / 60; // 60Hz physics updates (16.67ms)

        // Target Portals at Z = 0
        this.portals = [
            { x: -4, filled: false },
            { x: -2, filled: false },
            { x: 0, filled: false },
            { x: 2, filled: false },
            { x: 4, filled: false }
        ];

        // Active procedural moving entities
        this.obstacles = [];
        
        // Define Lanes: Z, Speed, Direction (-1 = Left, 1 = Right), Length, Type
        this.laneConfig = [
            { z: 11, speed: -1.2, count: 3, length: 1.5, gap: 5.0, type: 'car' },
            { z: 10, speed: 1.5,  count: 3, length: 1.5, gap: 5.5, type: 'car' },
            { z: 9,  speed: -1.8, count: 2, length: 2.0, gap: 8.0, type: 'car' },
            { z: 8,  speed: 2.2,  count: 2, length: 3.0, gap: 9.0, type: 'truck' },
            { z: 7,  speed: -1.4, count: 3, length: 1.5, gap: 5.0, type: 'car' },
            // Z = 6: Stream Junction (Safe rest bank)
            { z: 5,  speed: 1.1,  count: 3, length: 2.5, gap: 5.5, type: 'log' },
            { z: 4,  speed: -1.3, count: 3, length: 3.2, gap: 5.0, type: 'log' },
            { z: 3,  speed: 1.6,  count: 2, length: 4.5, gap: 8.0, type: 'log' },
            { z: 2,  speed: -0.9, count: 3, length: 2.5, gap: 5.5, type: 'log' },
            { z: 1,  speed: 1.4,  count: 3, length: 3.2, gap: 5.0, type: 'log' }
        ];

        this.initObstacles();

        // Arcade Timer & Combo Multiplier variables
        this.countdownTimer = 30.0;
        this.timeLowEventAccumulator = 1.0;
        this.comboMultiplier = 1;
        this.lastForwardHopTime = 0;
        this.isForwardHopPending = false;

        // Audio and dynamic event hooks populated by other modules
        this.onHopSound = null;
        this.onScoreSound = null;
        this.onDeathSound = null;
        this.onLevelUpSound = null;
        this.onGameOverSound = null;
        this.onCombo = null; // function(multiplier, points, x, z)
        this.onTimeLow = null; // function()
    }

    // Initialize all moving logs and cars spaced evenly
    initObstacles() {
        this.obstacles = [];
        let id = 0;
        for (const lane of this.laneConfig) {
            const levelMultiplier = 1.0;
            const speed = lane.speed * levelMultiplier;
            const startOffset = lane.direction === -1 ? 8 : -8;

            for (let i = 0; i < lane.count; i++) {
                // Distribute obstacles evenly across lane width
                const xPos = -9 + (i * lane.gap);
                this.obstacles.push({
                    id: id++,
                    laneZ: lane.z,
                    x: xPos,
                    prevX: xPos,
                    speed: speed,
                    length: lane.length,
                    type: lane.type
                });
            }
        }
    }

    // Spawns/Resets obstacles with speed adjusted for current level and resets positions
    resetObstaclesForLevel() {
        const levelMultiplier = 1.0 + (this.level - 1) * 0.15; // 15% speed increase per level
        let id = 0;
        this.obstacles = []; // Rebuild to reset x positions
        for (const lane of this.laneConfig) {
            const speed = lane.speed * levelMultiplier;
            for (let i = 0; i < lane.count; i++) {
                const xPos = -9 + (i * lane.gap);
                this.obstacles.push({
                    id: id++,
                    laneZ: lane.z,
                    x: xPos,
                    prevX: xPos,
                    speed: speed,
                    length: lane.length,
                    type: lane.type
                });
            }
        }
    }

    startLoop(renderCallback) {
        let lastTime = performance.now();

        const loop = (currentTime) => {
            let elapsedSeconds = ((currentTime - lastTime) / 1000) * this.simulationSpeed;
            lastTime = currentTime;

            // Clamping time step to avoid spiral-of-death during heavy tabs out
            const maxClamp = 0.25 * this.simulationSpeed;
            if (elapsedSeconds > maxClamp) {
                elapsedSeconds = maxClamp;
            }

            this.timeAccumulator += elapsedSeconds;

            // Fixed physics updates
            while (this.timeAccumulator >= this.fixedDeltaTime) {
                this.physicsUpdate(this.fixedDeltaTime);
                this.timeAccumulator -= this.fixedDeltaTime;
            }

            // Calculate interpolation factor
            const alpha = this.timeAccumulator / this.fixedDeltaTime;

            // Visual callback to the renderer
            renderCallback(this, alpha);

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    physicsUpdate(dt) {
        if (this.state !== 'PLAYING') return;
        // A decision-only experiment can hold simulation time while inference
        // runs. Rendering continues; skipped wall time is never replayed later.
        if (this.beforePhysicsStep?.() === false) return;
        this.simulationTime += dt;

        // Ticking countdown timer
        this.countdownTimer = Math.max(0, this.countdownTimer - dt);
        if (this.countdownTimer <= 0) {
            this.triggerDeath('timeout');
            return;
        } else if (this.countdownTimer <= 10) {
            this.timeLowEventAccumulator += dt;
            if (this.timeLowEventAccumulator >= 1.0) {
                this.timeLowEventAccumulator = 0;
                if (this.onTimeLow) this.onTimeLow();
            }
        } else {
            this.timeLowEventAccumulator = 1.0; // Reset ready to trigger immediately
        }

        // 1. Move and wrap all obstacles
        for (let i = 0; i < this.obstacles.length; i++) {
            const obs = this.obstacles[i];
            obs.prevX = obs.x;
            obs.x += obs.speed * dt;

            // Boundary wrapping check
            if (obs.speed > 0 && obs.x > 9.5) {
                obs.x = -9.5;
                obs.prevX = -9.5;
            } else if (obs.speed < 0 && obs.x < -9.5) {
                obs.x = 9.5;
                obs.prevX = 9.5;
            }
        }

        // 2. Manage Hop Interpolation & Movement State
        const player = this.player;
        player.prevPosition.x = player.currPosition.x;
        player.prevPosition.z = player.currPosition.z;

        if (player.isHopping) {
            player.hopProgress += dt * player.hopSpeed;

            if (player.hopProgress >= 1.0) {
                player.currPosition.x = player.targetPosition.x;
                player.currPosition.z = player.targetPosition.z;
                player.isHopping = false;
                player.hopProgress = 0;

                // Check landing conditions immediately when hop finishes
                this.checkLandingCollision();
            } else {
                player.currPosition.x = player.prevPosition.x + (player.targetPosition.x - player.prevPosition.x) * player.hopProgress;
                player.currPosition.z = player.prevPosition.z + (player.targetPosition.z - player.prevPosition.z) * player.hopProgress;
            }
        } else {
            // Grounded road hazards are checked before any new hop can escape them.
            if (player.currPosition.z >= 7 && player.currPosition.z <= 11 &&
                this.findOverlappingCar(player.currPosition.x, player.currPosition.z)) {
                this.triggerDeath('crash');
                return;
            }

            // Give autonomous local control every idle simulation tick, even when
            // multiple physics ticks run inside one accelerated render frame.
            if (this.aiMode && this.inputQueue.length === 0 && !this.pendingAIIntent) {
                this.onAIInputReady?.();
            }

            // 3. Process human input first; AI is validated at this exact physics state.
            if (this.inputQueue.length > 0) {
                const dir = this.inputQueue.shift();
                this.pendingAIIntent = null;
                this.initiateHop(dir);
            } else if (this.pendingAIIntent) {
                const resolveIntent = this.pendingAIIntent;
                this.pendingAIIntent = null;
                const intent = resolveIntent();
                if (intent) {
                    if (intent.action !== 'WAIT') this.initiateHop(intent.action);
                    const accepted = intent.action === 'WAIT' || player.isHopping;
                    if (accepted) intent.onAccepted?.();
                    intent.onResolved?.({ accepted });
                }
            }

            // 4. Data Stream (Log) Riding Physics
            if (!player.isHopping && player.currPosition.z >= 1 && player.currPosition.z <= 5) {
                const ridingLog = this.findOverlappingLog(player.currPosition.x, player.currPosition.z);
                if (ridingLog) {
                    player.currPosition.x += ridingLog.speed * dt;
                    player.prevPosition.x += ridingLog.speed * dt;
                    player.targetPosition.x = player.currPosition.x;

                    // Bounds check - if log carries player off-screen
                    if (player.currPosition.x < -6.5 || player.currPosition.x > 6.5) {
                        this.triggerDeath('out-of-bounds');
                    }
                } else {
                    // Slipped off or log drifted away
                    this.triggerDeath('drown');
                }
            }
        }
    }

    initiateHop(direction) {
        const player = this.player;
        if (player.isHopping || this.state !== 'PLAYING') return;

        player.prevPosition.x = player.currPosition.x;
        player.prevPosition.z = player.currPosition.z;
        player.targetPosition.x = player.currPosition.x;
        player.targetPosition.z = player.currPosition.z;

        let validMove = false;
        switch (direction) {
            case 'UP':
                if (player.currPosition.z > 0) {
                    player.targetPosition.z -= 1;
                    validMove = true;
                    this.isForwardHopPending = true;
                }
                break;
            case 'DOWN':
                if (player.currPosition.z < 12) {
                    player.targetPosition.z += 1;
                    validMove = true;
                }
                break;
            case 'LEFT':
                if (player.currPosition.x > -5) {
                    player.targetPosition.x -= 1.0;
                    validMove = true;
                }
                break;
            case 'RIGHT':
                if (player.currPosition.x < 5) {
                    player.targetPosition.x += 1.0;
                    validMove = true;
                }
                break;
        }

        if (validMove) {
            player.isHopping = true;
            player.hopProgress = 0;
            if (this.onHopSound) this.onHopSound();
        }
    }

    invalidateDecisions() {
        this.stateRevision++;
        this.pendingAIIntent = null;
        if (this.onDecisionInvalidated) this.onDecisionInvalidated();
    }

    queueAIIntent(resolveIntent) {
        if (this.state === 'PLAYING' && this.aiMode && this.inputQueue.length === 0) {
            this.pendingAIIntent = resolveIntent;
        }
    }

    queueMovement(direction) {
        if (this.state !== 'PLAYING') return;
        if (this.inputQueue.length < this.maxInputQueueSize) {
            this.inputQueue.push(direction);
        }
    }

    // Checks landing logic when hop has finished
    checkLandingCollision() {
        const player = this.player;
        const z = player.currPosition.z;
        const x = player.currPosition.x;

        // A. Cyber-Road Lanes Collision Check
        if (z >= 7 && z <= 11) {
            const hitObstacle = this.findOverlappingCar(x, z);
            if (hitObstacle) {
                this.triggerDeath('crash');
            }
        }
        // B. Data Streams River Check
        else if (z >= 1 && z <= 5) {
            const ridingLog = this.findOverlappingLog(x, z);
            if (!ridingLog) {
                this.triggerDeath('drown');
            }
        }
        // C. Target Portals Check
        else if (z === 0) {
            const targetPortalIndex = this.portals.findIndex(p => Math.abs(x - p.x) < 0.5);

            if (targetPortalIndex !== -1) {
                const portal = this.portals[targetPortalIndex];
                if (!portal.filled) {
                    portal.filled = true;
                    this.score += 500;
                    if (this.onScoreSound) this.onScoreSound();
                    if (this.onPortalScore) this.onPortalScore(targetPortalIndex, this.score);

                    // Check level completion
                    const allFilled = this.portals.every(p => p.filled);
                    if (allFilled) {
                        this.levelUp();
                    } else {
                        this.resetPlayerToStart();
                    }
                } else {
                    // Portal already occupied -> Fatal Crash!
                    this.triggerDeath('crash');
                }
            } else {
                // Landed on the portal divider barrier -> Deadly Grid Crash!
                this.triggerDeath('crash');
            }
        }

        // If player is still alive after landing check
        if (this.player.deathType === null) {
            if (this.isForwardHopPending) {
                this.isForwardHopPending = false;
                const now = this.useSimulationClock ? this.simulationTime * 1000 : performance.now();
                const elapsed = (now - this.lastForwardHopTime) / 1000;
                if (elapsed <= 1.2) {
                    this.comboMultiplier = Math.min(this.comboMultiplier + 1, 5);
                } else {
                    this.comboMultiplier = 1;
                }
                this.lastForwardHopTime = now;

                // Add score
                const points = 10 * this.comboMultiplier;
                this.score += points;

                // Trigger combo event
                if (this.onCombo) {
                    this.onCombo(this.comboMultiplier, points, this.player.currPosition.x, this.player.currPosition.z);
                }
            } else {
                // If they hopped sideways/backwards, reset combo
                this.comboMultiplier = 1;
            }
        } else {
            // Died during landing
            this.comboMultiplier = 1;
            this.isForwardHopPending = false;
        }
    }

    // Finding vehicle overlapping coordinates
    findOverlappingCar(x, z) {
        const COLLISION_TOLERANCE = 0.20;
        return this.obstacles.find(obs => {
            if (obs.laneZ !== z || obs.type === 'log') return false;
            // Car collision box: half obstacle length + buffer
            const halfLen = obs.length / 2;
            return x >= (obs.x - halfLen - COLLISION_TOLERANCE) && x <= (obs.x + halfLen + COLLISION_TOLERANCE);
        });
    }

    // Finding log overlapping coordinates
    findOverlappingLog(x, z) {
        const COLLISION_TOLERANCE = 0.20;
        return this.obstacles.find(obs => {
            if (obs.laneZ !== z || obs.type !== 'log') return false;
            // Log riding window: half log length with a slight landing safety padding
            const halfLen = obs.length / 2;
            return x >= (obs.x - halfLen - COLLISION_TOLERANCE) && x <= (obs.x + halfLen + COLLISION_TOLERANCE);
        });
    }

    triggerDeath(type) {
        if (this.state !== 'PLAYING') return;

        this.invalidateDecisions();
        this.lives--;
        this.player.deathType = type;
        this.inputQueue = [];

        if (this.onDeathOccurred) this.onDeathOccurred(type);
        if (this.onDeathSound) this.onDeathSound(type);

        if (this.lives <= 0) {
            this.state = 'GAME_OVER';
            if (this.score > this.highScore) {
                this.highScore = this.score;
                if (this.persistHighScore && typeof localStorage !== 'undefined') {
                    localStorage.setItem('neonhop_high_score', this.highScore.toString());
                }
            }
            if (this.onGameOverSound) this.onGameOverSound();
            if (this.onGameOver) this.onGameOver();
        } else {
            this.resetPlayerToStart();
        }
    }

    levelUp() {
        this.level++;
        this.score += 2000;
        this.portals.forEach(p => p.filled = false);
        this.resetPlayerToStart();
        this.resetObstaclesForLevel();
        if (this.onLevelUpSound) this.onLevelUpSound();
    }

    resetPlayerToStart() {
        this.invalidateDecisions();
        const player = this.player;
        player.prevPosition.x = 0;
        player.prevPosition.y = 0;
        player.prevPosition.z = 12;

        player.currPosition.x = 0;
        player.currPosition.y = 0;
        player.currPosition.z = 12;

        player.targetPosition.x = 0;
        player.targetPosition.y = 0;
        player.targetPosition.z = 12;

        player.isHopping = false;
        player.hopProgress = 0;
        player.deathType = null;

        this.countdownTimer = 30.0;
        this.isForwardHopPending = false;
    }

    setGameState(newState) {
        const validTransitions = {
            'READY': ['PLAYING'],
            'PLAYING': ['PAUSED', 'GAME_OVER', 'READY'],
            'PAUSED': ['PLAYING', 'READY'],
            'GAME_OVER': ['READY']
        };
        if (validTransitions[this.state]?.includes(newState)) {
            this.state = newState;
            this.invalidateDecisions();
        }
    }

    resetGame() {
        this.score = 0;
        this.simulationTime = 0;
        this.level = 1;
        this.lives = 3;
        this.portals.forEach(p => p.filled = false);
        this.resetPlayerToStart();
        this.resetObstaclesForLevel();
        this.inputQueue = [];
        this.state = 'READY';

        this.countdownTimer = 30.0;
        this.comboMultiplier = 1;
        this.lastForwardHopTime = 0;
        this.isForwardHopPending = false;
    }

    pauseGame() {
        if (this.state === 'PLAYING') {
            this.setGameState('PAUSED');
        }
    }

    resumeGame() {
        if (this.state === 'PAUSED') {
            this.setGameState('PLAYING');
        }
    }

    setAIMode(enabled) {
        this.aiMode = Boolean(enabled);
        this.invalidateDecisions();
        if (this.onAIModeChange) {
            this.onAIModeChange(this.aiMode);
        }
    }

    setSimulationSpeed(speed) {
        const nextSpeed = Math.max(0.5, Math.min(10.0, Number(speed) || 1.0));
        if (nextSpeed !== this.simulationSpeed) {
            this.simulationSpeed = nextSpeed;
            this.invalidateDecisions();
        }
    }
}
