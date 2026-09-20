// src/physicsOracle.js
// High-Precision Spatio-Temporal Physics Oracle & Forward Safety Shield for NeonHop 3D

export class PhysicsOracle {
    constructor() {
        this.hopDuration = 8 / 60; // Eight fixed physics ticks per hop
        this.minDwellTime = 1 / 60; // Next idle physics tick can initiate another hop
        this.carBuffer = 0.36;     // Extra safety buffer against high-speed vehicles (Level 20+)
        this.logMargin = 0.42;     // Required safety margin from log ends to avoid edge drowns
        this.portalMargin = 0.46;  // Maximum allowed distance to portal center (engine allows < 0.50)
    }

    syncTiming(engine) {
        const dt = engine.fixedDeltaTime || 1 / 60;
        const hopSpeed = engine.player.hopSpeed || 8;
        // Use the same accumulation as physics, including floating-point rounding.
        if (dt !== this.timingDelta || hopSpeed !== this.timingHopSpeed) {
            let progress = 0;
            let ticks = 0;
            while (progress < 1) { progress += dt * hopSpeed; ticks++; }
            this.hopDuration = ticks * dt;
            this.timingDelta = dt;
            this.timingHopSpeed = hopSpeed;
        }
        this.minDwellTime = dt;
    }

    // Predicts obstacle X position at future time dt, taking periodic boundary wrap into account
    predictObstacleX(obs, dt) {
        const laneSpan = 19.0; // From -9.5 to +9.5
        const minX = -9.5;
        const maxX = 9.5;
        
        let projectedX = obs.x + obs.speed * dt;
        
        // Wrap around bounds
        while (projectedX > maxX) {
            projectedX -= laneSpan;
        }
        while (projectedX < minX) {
            projectedX += laneSpan;
        }
        return projectedX;
    }

    // Evaluates whether landing at (targetX, targetZ) at time tLanding is physically safe and stable through dwell
    isPositionSafeOverTime(targetX, targetZ, tLanding, tDwell, engine) {
        if (targetX < -5.4 || targetX > 5.4) return false;
        if (targetZ < 0 || targetZ > 12) return false;

        // Sidewalk (Z=12) & Median Bank (Z=6) are always safe resting platforms
        if (targetZ === 12 || targetZ === 6) return true;

        // Goal Portals (Z=0)
        if (targetZ === 0) {
            const portal = engine.portals.find(p => !p.filled && Math.abs(targetX - p.x) <= this.portalMargin);
            return portal !== undefined;
        }

        // Highway Lanes (Z = 7 to 11): Vehicles
        if (targetZ >= 7 && targetZ <= 11) {
            const laneObstacles = engine.obstacles.filter(o => o.laneZ === targetZ && o.type !== 'log');
            // Sample continuous time intervals across landing and dwell
            const sampleSteps = 8;
            for (let i = 0; i <= sampleSteps; i++) {
                const t = tLanding + (tDwell * (i / sampleSteps));
                for (const car of laneObstacles) {
                    const carX = this.predictObstacleX(car, t);
                    const halfLen = car.length / 2;
                    const dangerMin = carX - halfLen - this.carBuffer;
                    const dangerMax = carX + halfLen + this.carBuffer;
                    if (targetX >= dangerMin && targetX <= dangerMax) {
                        return false; // Car collides with frog!
                    }
                }
            }
            return true;
        }

        // Digital Stream River (Z = 1 to 5): Logs
        if (targetZ >= 1 && targetZ <= 5) {
            const laneLogs = engine.obstacles.filter(o => o.laneZ === targetZ && o.type === 'log');
            // The frog must land securely on a log at tLanding
            let landingLog = null;
            for (const log of laneLogs) {
                const logX = this.predictObstacleX(log, tLanding);
                const halfLen = log.length / 2;
                const safeMin = logX - halfLen + this.logMargin;
                const safeMax = logX + halfLen - this.logMargin;
                if (targetX >= safeMin && targetX <= safeMax) {
                    landingLog = log;
                    break;
                }
            }

            if (!landingLog) {
                return false; // Landed in water or off log edge -> drowns!
            }

            // River Runway Check: Ensure log provides enough time to dwell and execute an escape move
            const minSafeRunwayTime = tDwell + this.hopDuration;
            if (landingLog.speed < 0) {
                const runwayDist = targetX - (-4.8);
                const runwayTime = runwayDist / Math.abs(landingLog.speed);
                if (runwayTime < minSafeRunwayTime) {
                    return false; // Insufficient downstream runway on left-moving log
                }
            } else if (landingLog.speed > 0) {
                // In Lane 1: If an open portal is immediately ahead, runway to the portal is sufficient!
                if (targetZ === 1 && engine.portals) {
                    const openAhead = engine.portals.find(p => !p.filled && p.x >= targetX && (p.x - targetX) <= 1.2);
                    if (openAhead) {
                        return true; // Direct capture glide path into open portal
                    }
                }
                const runwayDist = 4.8 - targetX;
                const runwayTime = runwayDist / landingLog.speed;
                if (runwayTime < minSafeRunwayTime) {
                    return false; // Insufficient downstream runway on right-moving log
                }
            }

            // Downstream Gate Check for Lane 1 (Z=1):
            // Lane 1 flows RIGHT. If frog is to the right of ALL open portals, it can never score
            if (targetZ === 1 && engine.portals) {
                const openPortals = engine.portals.filter(p => !p.filled);
                if (openPortals.length > 0) {
                    const maxOpenX = Math.max(...openPortals.map(p => p.x));
                    if (targetX > maxOpenX + 0.35) {
                        return false; // Passed all open portals downstream; trapped against right wall
                    }
                }
            }

            return true;
        }

        return false;
    }

    // Evaluates candidate action from current state and returns detailed safety evaluation
    evaluateActionSafety(engine, action, lastAction = null) {
        this.syncTiming(engine);
        const player = engine.player;
        if (player.isHopping) {
            return { safe: false, score: -1000, reason: 'Already hopping' };
        }

        const currX = player.currPosition.x;
        const currZ = Math.round(player.currPosition.z);

        let targetX = currX;
        let targetZ = currZ;

        switch (action) {
            case 'UP':
                targetZ -= 1;
                break;
            case 'DOWN':
                targetZ += 1;
                break;
            case 'LEFT':
                targetX -= 1.0;
                break;
            case 'RIGHT':
                targetX += 1.0;
                break;
            case 'WAIT':
                break;
            default:
                return { safe: false, score: -1000, reason: 'Invalid action' };
        }

        // Boundary checks
        if (targetZ < 0 || targetZ > 12) {
            return { safe: false, score: -1000, reason: 'Out of grid Z bounds' };
        }
        if (targetX < -5.2 || targetX > 5.2) {
            return { safe: false, score: -1000, reason: 'Out of grid X bounds' };
        }

        // Special Portal Barrier Guard at Z=0
        if (targetZ === 0) {
            const portal = engine.portals.find(p => !p.filled && Math.abs(targetX - p.x) <= this.portalMargin);
            if (!portal) {
                return { safe: false, score: -9999, reason: 'Fatal portal barrier wall impact or occupied portal' };
            }
        }

        const tLanding = action === 'WAIT' ? 0 : this.hopDuration;
        const tDwell = this.minDwellTime;

        // If riding a log and waiting, verify drift doesn't carry player off screen
        if (action === 'WAIT' && currZ >= 1 && currZ <= 5) {
            const currentLog = engine.findOverlappingLog(currX, currZ);
            if (currentLog) {
                // If log is carrying frog past outer screen boundaries, WAIT is unsafe
                if (currX > 4.9 && currentLog.speed > 0) {
                    return { safe: false, score: -3000, reason: 'Log drifting into right boundary zone' };
                }
                if (currX < -4.9 && currentLog.speed < 0) {
                    return { safe: false, score: -3000, reason: 'Log drifting into left boundary zone' };
                }
                const projectedXAtDwell = currX + currentLog.speed * (tLanding + tDwell);
                if (projectedXAtDwell < -5.2 || projectedXAtDwell > 5.2) {
                    return { safe: false, score: -3000, reason: 'Log drifting out of bounds' };
                }
            } else {
                return { safe: false, score: -3000, reason: 'No log under frog' };
            }
        }

        const isSafe = this.isPositionSafeOverTime(targetX, targetZ, tLanding, tDwell, engine);
        if (!isSafe) {
            return {
                safe: false,
                score: -1000,
                targetX,
                targetZ,
                reason: targetZ >= 7 && targetZ <= 11 ? 'Vehicle collision trajectory' : (targetZ === 0 ? 'Portal barrier impact' : 'Water drowning / log miss')
            };
        }

        // Calculate heuristic score
        let score = 0;

        // Base progress rewards
        if (action === 'UP') {
            score += 200;
        } else if (action === 'WAIT') {
            if (currZ === 12 || currZ === 6) score += 50;
            else if (currZ >= 1 && currZ <= 5) score += 60;
            else score += 20; // Waiting on highway for clear gap
        } else if (action === 'DOWN') {
            score -= 100;
        } else if (action === 'LEFT' || action === 'RIGHT') {
            if (currZ === 12) score -= 30;
            else if (currZ >= 7 && currZ <= 11) score -= 30;
        }

        // Anti-oscillation penalty: discourage immediately reversing lateral moves
        if (lastAction === 'LEFT' && action === 'RIGHT') score -= 150;
        if (lastAction === 'RIGHT' && action === 'LEFT') score -= 150;

        // Open portal navigation
        const openPortals = engine.portals ? engine.portals.filter(p => !p.filled) : [];
        const closestPortal = openPortals.length > 0 ? openPortals.reduce((prev, curr) => 
            Math.abs(curr.x - currX) < Math.abs(prev.x - currX) ? curr : prev
        ) : null;

        // River stream log navigation & Portal guidance
        if (closestPortal && currZ >= 1 && currZ <= 5) {
            const lateralDelta = closestPortal.x - currX;
            const currentLog = engine.findOverlappingLog(currX, currZ);

            // In Lanes 2 to 5: Rapid Transit & Safe Central Corridor!
            // Cross forward as soon as the next lane is clear; do NOT wait to align with portals here!
            if (currZ >= 2) {
                // Flow-aware forward crossing:
                if (action === 'UP') {
                    // Forward motion has already passed the landing/runway checks.
                    // Do not re-penalize it solely because of its X coordinate.
                    score += 300;
                }

                // Tactical Retreat Shield:
                // In Lane 2: If drifting past the portal into the far left corner (x <= -4.1) and Lane 1 log is not available,
                // prioritize stepping DOWN to right-moving Lane 3 rather than drowning in the left wall!
                if (currZ === 2 && currX <= -4.1) {
                    const upSafe = this.isPositionSafeOverTime(currX, 1, this.hopDuration, this.minDwellTime, engine);
                    if (!upSafe) {
                        const downSafe = this.isPositionSafeOverTime(currX, 3, this.hopDuration, this.minDwellTime, engine);
                        if (downSafe) {
                            if (action === 'DOWN') score += 1800; // Tactical retreat to right-flowing Lane 3!
                            if (action === 'WAIT') score -= 900; // Do NOT wait into a corner!
                        }
                    }
                }

                if (currentLog && currentLog.length >= 3.0) {
                    if (currX >= 2.0 && currentLog.speed > 0) {
                        if (action === 'WAIT') score -= 600;
                        if (action === 'LEFT') score += 900; // Inward hop!
                        if (action === 'RIGHT') score -= 1000; // Outward strictly forbidden
                    } else if (currX <= -2.0 && currentLog.speed < 0) {
                        if (action === 'WAIT') score -= 600;
                        if (action === 'RIGHT') score += 900; // Inward hop!
                        if (action === 'LEFT') score -= 1000; // Outward strictly forbidden
                    }
                }
                // Stream flow direction evaluation for Lanes 2-5:
                if (currentLog && closestPortal && Math.abs(closestPortal.x - currX) > 0.3) {
                    const deltaX = closestPortal.x - currX;
                    const movingTowards = (deltaX > 0 && currentLog.speed > 0) || (deltaX < 0 && currentLog.speed < 0);
                    if (movingTowards) {
                        if (action === 'WAIT') score += 400; // Ride stream towards portal!
                        if (currZ === 2 && (action === 'LEFT' || action === 'RIGHT')) score -= 500; // Never shuffle on short log!
                    } else {
                        if (action === 'WAIT') score -= 300; // Stream carrying away from portal
                    }
                }
            }

            // In stream lane Z=1: STRICT PORTAL DOCKING & LATERAL GUIDANCE
            if (currZ === 1) {
                const targetPortalDist = Math.abs(closestPortal.x - targetX);
                if (targetPortalDist <= this.portalMargin && action === 'UP') {
                    score += 3000; // Perfect portal capture!
                } else if (action === 'UP') {
                    return {
                        safe: false,
                        score: -9999,
                        targetX,
                        targetZ: 0,
                        reason: 'Fatal misaligned portal barrier impact vetoed'
                    };
                }

                // If not yet aligned with open portal, actively guide lateral hops toward it!
                if (Math.abs(lateralDelta) > 0.3) {
                    if (lateralDelta < 0) {
                        if (action === 'LEFT') score += 400; // Hop left toward portal!
                        if (action === 'RIGHT') score -= 300;
                    } else {
                        if (action === 'RIGHT') score += 400; // Hop right toward portal!
                        if (action === 'LEFT') score -= 300;
                    }
                }

                // Stream flow direction evaluation:
                if (currentLog && Math.abs(lateralDelta) > 0.2) {
                    const movingTowards = (lateralDelta > 0 && currentLog.speed > 0) || (lateralDelta < 0 && currentLog.speed < 0);
                    if (movingTowards) {
                        if (action === 'WAIT') score += 300; // Ride stream directly into portal!
                    } else {
                        if (action === 'WAIT') score -= 400; // NEVER wait while stream carries you away from portal!
                    }
                }

                // In Lane 1: If drifting near boundary, strongly prioritize inward evacuation!
                if (currX > 4.2) {
                    if (action === 'LEFT') score += 600;
                    if (action === 'WAIT') score -= 600;
                } else if (currX < -4.2) {
                    if (action === 'RIGHT') score += 600;
                    if (action === 'WAIT') score -= 600;
                }
            }
        }

        // Platform alignment guidance (Z=12 & Z=6)
        if (currZ === 12 && closestPortal) {
            const lateralDist = closestPortal.x - currX;
            if (Math.abs(lateralDist) > 0.55) {
                if (lateralDist < 0 && action === 'LEFT') score += 100;
                if (lateralDist > 0 && action === 'RIGHT') score += 100;
            }
        } else if (currZ === 6) {
            // Median Rest Bank: Lane 5 flows RIGHT.
            // Entering Lane 5 from x > 1.5 has insufficient downstream runway.
            // Actively steer inward/leftward towards central river entry funnel [-2.5, 0.5]
            if (currX > 1.5) {
                if (action === 'LEFT') score += 300;
                if (action === 'WAIT') score -= 200;
            } else if (currX < -3.0) {
                if (action === 'RIGHT') score += 300;
                if (action === 'WAIT') score -= 200;
            }
        }

        // Countdown Urgency Boost & Anti-Idle:
        if (engine.countdownTimer !== undefined && engine.countdownTimer < 12.0) {
            const urgency = 12.0 - engine.countdownTimer;
            if ((currZ === 12 || currZ === 6) && action === 'WAIT') {
                score -= urgency * 50; // Don't sit idle on safe banks
            }
            if (engine.countdownTimer < 5.0 && action === 'UP') {
                score += 1000; // Desperation push at buzzer
            }
        }

        return {
            safe: true,
            score,
            targetX,
            targetZ,
            reason: 'Physics trajectory verified safe'
        };
    }

    // Verifies whether riding a Lane 2 log from startX provides at least one safe escape window
    // Verifies whether riding a Lane 2 log from startX provides at least one safe escape window
    // (either hopping UP to Lane 1 or hopping DOWN to Lane 3) before running out of bounds
    hasLane2EscapePath(engine, startX, speed, isAlreadyOnLane2 = false, targetPortalX = null) {
        if (speed >= 0) return true;
        const tHop = this.hopDuration;
        const tInitial = isAlreadyOnLane2 ? 0 : tHop;
        const maxTime = (startX - (-4.7)) / Math.abs(speed);
        if (maxTime < tHop) return false;

        const openPortals = engine.portals ? engine.portals.filter(p => !p.filled) : [];
        if (openPortals.length === 0) return true;

        const maxTargetX = targetPortalX !== null ? (targetPortalX + 0.35) : (Math.max(...openPortals.map(p => p.x)) + 0.35);

        const lane1Logs = engine.obstacles.filter(o => o.laneZ === 1 && o.type === 'log');
        const lane3Logs = engine.obstacles.filter(o => o.laneZ === 3 && o.type === 'log');

        const stepCount = Math.min(30, Math.floor(maxTime / 0.10));
        for (let i = 0; i <= stepCount; i++) {
            const t = i * 0.10;
            const frogX = startX + speed * t;
            const tLand = tInitial + t + tHop;

            // Check UP escape to Lane 1
            if (frogX <= maxTargetX && frogX >= -4.7) {
                for (const log of lane1Logs) {
                    const logX = this.predictObstacleX(log, tLand);
                    const halfLen = log.length / 2;
                    if (frogX >= (logX - halfLen + this.logMargin) && frogX <= (logX + halfLen - this.logMargin)) {
                        return true; // Safe escape to Lane 1 exists!
                    }
                }
            }

            // Check DOWN escape to Lane 3 near the end of the log
            if (frogX <= -3.5 && frogX >= -4.7) {
                for (const log of lane3Logs) {
                    const logX = this.predictObstacleX(log, tLand);
                    const halfLen = log.length / 2;
                    if (frogX >= (logX - halfLen + this.logMargin) && frogX <= (logX + halfLen - this.logMargin)) {
                        return true; // Safe escape to Lane 3 exists!
                    }
                }
            }
        }

        return false; // Inescapable dead-end log!
    }

    // 2-hop lookahead safety shield: verifies candidate action has at least one safe escape move afterwards
    verifyLookaheadEscape(engine, primaryAction, lastAction = null) {
        const evalPrimary = this.evaluateActionSafety(engine, primaryAction, lastAction);
        if (!evalPrimary.safe) return evalPrimary;

        // Goal reached (Z=0) is unconditionally safe
        if (evalPrimary.targetZ === 0) {
            return evalPrimary;
        }

        // Safe rest platforms don't require escape lookahead
        if (evalPrimary.targetZ === 12 || evalPrimary.targetZ === 6) {
            return evalPrimary;
        }

        // If riding a valid river log, check if waiting is genuinely a safe escape option
        if (evalPrimary.targetZ >= 1 && evalPrimary.targetZ <= 5) {
            const laneLogs = engine.obstacles.filter(o => o.laneZ === evalPrimary.targetZ && o.type === 'log');
            const landingOffset = primaryAction === 'WAIT' ? 0 : this.hopDuration;
            const landingLog = laneLogs.find(l => {
                const logX = this.predictObstacleX(l, landingOffset);
                const halfLen = l.length / 2;
                return evalPrimary.targetX >= (logX - halfLen + this.logMargin) && 
                       evalPrimary.targetX <= (logX + halfLen - this.logMargin);
            });
            if (landingLog) {
                // In Lane 1: If an open portal is immediately ahead, waiting is a valid capture path!
                if (evalPrimary.targetZ === 1 && engine.portals) {
                    const openAhead = engine.portals.find(p => !p.filled && p.x >= evalPrimary.targetX && (p.x - evalPrimary.targetX) <= 1.2);
                    if (openAhead) {
                        return evalPrimary; // Direct capture glide path into open portal!
                    }
                }
                const runwayTime = landingLog.speed < 0 ?
                    (evalPrimary.targetX - (-4.8)) / Math.abs(landingLog.speed) :
                    (4.8 - evalPrimary.targetX) / landingLog.speed;
                const minRunway = this.minDwellTime + this.hopDuration;
                if (runwayTime > minRunway) {
                    // For Lane 1, ensure not past all open portals
                    if (evalPrimary.targetZ === 1 && engine.portals) {
                        const openPortals = engine.portals.filter(p => !p.filled);
                        if (openPortals.length > 0) {
                            const maxOpenX = Math.max(...openPortals.map(p => p.x));
                            if (evalPrimary.targetX <= maxOpenX + 0.35) {
                                return evalPrimary;
                            }
                        }
                    } else if (evalPrimary.targetZ === 2) {
                        // Lane 2 special lookahead: verify this Lane 2 log actually has an escape before exit!
                        const openPortals = engine.portals ? engine.portals.filter(p => !p.filled) : [];
                        const closestPortal = openPortals.length > 0 ? openPortals.reduce((prev, curr) => 
                            Math.abs(curr.x - evalPrimary.targetX) < Math.abs(prev.x - evalPrimary.targetX) ? curr : prev
                        ) : null;
                        const targetPortalX = closestPortal ? closestPortal.x : null;

                        const isAlreadyOnLane2 = (primaryAction === 'WAIT');
                        if (this.hasLane2EscapePath(engine, evalPrimary.targetX, landingLog.speed, isAlreadyOnLane2, targetPortalX)) {
                            return evalPrimary;
                        }
                        return { safe: false, score: -3000, reason: 'No future escape path from Lane 2 log' };
                    } else {
                        return evalPrimary; // Generous runway on intermediate river log
                    }
                }
            }
        }

        // The next decision occurs one idle tick after landing, or one tick
        // after WAIT. WAIT carries the frog with its current log during this tick.
        const futureTime = (primaryAction === 'WAIT' ? 0 : this.hopDuration) + this.minDwellTime;
        const waitLog = primaryAction === 'WAIT'
            ? engine.findOverlappingLog(evalPrimary.targetX, evalPrimary.targetZ) : null;
        const futureX = evalPrimary.targetX + (waitLog ? waitLog.speed * this.minDwellTime : 0);
        const simulatedEngine = {
            fixedDeltaTime: engine.fixedDeltaTime,
            player: {
                hopSpeed: engine.player.hopSpeed,
                currPosition: { x: futureX, y: 0, z: evalPrimary.targetZ },
                isHopping: false
            },
            obstacles: engine.obstacles.map(o => ({
                ...o,
                x: this.predictObstacleX(o, futureTime)
            })),
            portals: engine.portals,
            findOverlappingCar: (x, z) => {
                return engine.obstacles.find(obs => {
                    if (obs.laneZ !== z || obs.type === 'log') return false;
                    const halfLen = obs.length / 2;
                    const simulatedCarX = this.predictObstacleX(obs, futureTime);
                    return x >= (simulatedCarX - halfLen - this.carBuffer) && x <= (simulatedCarX + halfLen + this.carBuffer);
                });
            },
            findOverlappingLog: (x, z) => {
                return engine.obstacles.find(obs => {
                    if (obs.laneZ !== z || obs.type !== 'log') return false;
                    const halfLen = obs.length / 2;
                    const simulatedLogX = this.predictObstacleX(obs, futureTime);
                    return x >= (simulatedLogX - halfLen + this.logMargin) && x <= (simulatedLogX + halfLen - this.logMargin);
                });
            }
        };

        const nextActions = ['UP', 'WAIT', 'LEFT', 'RIGHT', 'DOWN'];
        let hasSafeFollowup = false;

        for (const nextAct of nextActions) {
            const nextEval = this.evaluateActionSafety(simulatedEngine, nextAct, primaryAction);
            if (nextEval.safe) {
                hasSafeFollowup = true;
                break;
            }
        }

        if (!hasSafeFollowup) {
            return {
                safe: false,
                score: -800,
                targetX: evalPrimary.targetX,
                targetZ: evalPrimary.targetZ,
                reason: 'Entrapment trap detected (no safe follow-up move)'
            };
        }

        return evalPrimary;
    }
}
