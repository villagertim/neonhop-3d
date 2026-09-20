import * as THREE from 'three';
import { GameEngine } from './gameEngine.js';
import { Renderer } from './renderer.js';
import { SoundEngine } from './soundEngine.js';
import { InputManager } from './inputManager.js';
import { Leaderboard } from './leaderboard.js';
import { JevOnlyAgent } from './jevOnlyAgent.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Instantiate the loop engine, WebGL Renderer, Synthesizer, and persistent subsystems
    const engine = new GameEngine();
    engine.highScore = 0;
    engine.persistHighScore = false;
    const canvas = document.getElementById('game-canvas');
    const renderer = new Renderer(canvas);
    const sound = new SoundEngine();
    const leaderboard = new Leaderboard();
    leaderboard.storageKey = 'neonhop_jev_only_leaderboard';
    leaderboard.legacyKey = 'neonhop_jev_only_legacy_unused';
    leaderboard.defaultScores = [];
    const input = new InputManager(engine);
    const jevAgent = new JevOnlyAgent(engine);

    // Expose sound engine and Jev Agent for debugging and inspection
    window.soundEngine = sound;
    window.jevAgent = jevAgent;

    // Link engine SFX/Level callbacks to dynamic sound synthesis triggers
    engine.onHopSound = () => sound.playHop();
    engine.onScoreSound = () => sound.playScore();
    engine.onDeathSound = (type) => sound.playDeath(type);
    engine.onLevelUpSound = () => {
        sound.playLevelUp();
        sound.setLevel(engine.level);
    };
    engine.onGameOverSound = () => {
        sound.stopMusic();
        sound.playGameOver();
    };

    // Arcade alert alarms and projections combo popups
    engine.onTimeLow = () => {
        sound.playTimeLow();
    };

    engine.onCombo = (multiplier, points, x, z) => {
        // Play coin chime sound
        sound.playCombo(multiplier);

        // Project 3D coordinates to 2D HTML overlays
        const tempV = new THREE.Vector3(x, 0.4, z);
        tempV.project(renderer.camera);

        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            const screenX = (tempV.x * 0.5 + 0.5) * rect.width;
            const screenY = (-(tempV.y * 0.5) + 0.5) * rect.height;

            const popup = document.createElement('div');
            popup.className = 'arcade-score-popup' + (multiplier > 1 ? ' multiplier' : '');
            popup.style.left = `${screenX}px`;
            popup.style.top = `${screenY}px`;
            popup.textContent = multiplier > 1 ? `+${points} (${multiplier}x COMBO!)` : `+${points}`;
            wrapper.appendChild(popup);

            // Decay and clean up popup node
            setTimeout(() => popup.remove(), 800);
        }
    };

    // 2. Query DOM HUD items
    const scoreVal = document.getElementById('current-score');
    const highScoreVal = document.getElementById('high-score');
    const levelVal = document.getElementById('game-level');
    const livesContainer = document.getElementById('lives-container');

    const overlayStart = document.getElementById('overlay-start');
    const overlayPaused = document.getElementById('overlay-paused');
    const overlayGameOver = document.getElementById('overlay-gameover');
    const highScoreForm = document.getElementById('high-score-form');

    const btnStart = document.getElementById('btn-start-game');
    const btnWatchAI = document.getElementById('btn-watch-ai');
    const btnToggleAI = document.getElementById('btn-toggle-ai');
    const aiToggleLabel = document.getElementById('ai-toggle-label');
    const btnTakeControl = document.getElementById('btn-take-control');

    const telemetryHUD = document.getElementById('ai-telemetry-hud');
    const hudAction = document.getElementById('hud-action');
    const hudThreat = document.getElementById('hud-threat');
    const hudEvacBar = document.getElementById('hud-evac-bar');
    const hudEvacVal = document.getElementById('hud-evac-val');
    const hudForwardBar = document.getElementById('hud-forward-bar');
    const hudForwardVal = document.getElementById('hud-forward-val');
    const hudStreakBar = document.getElementById('hud-streak-bar');
    const hudStreakVal = document.getElementById('hud-streak-val');
    const hudSource = document.getElementById('hud-source');
    const hudLatency = document.getElementById('hud-latency');
    const hudCount = document.getElementById('hud-count');

    const btnPause = document.getElementById('btn-pause');
    const btnRestart = document.getElementById('btn-restart');
    const btnMute = document.getElementById('btn-mute');
    const volumeSlider = document.getElementById('volume-slider');
    
    const btnSpeed1x = document.getElementById('btn-speed-1x');
    const btnSpeed2x = document.getElementById('btn-speed-2x');
    const btnSpeed5x = document.getElementById('btn-speed-5x');
    const btnExportBaseline = document.getElementById('btn-export-baseline');
    const btnRetryJev = document.getElementById('btn-retry-jev');
    const baselineStatus = document.getElementById('baseline-status');

    const initialsInput = document.getElementById('player-initials');
    const btnSubmitScore = document.getElementById('btn-submit-score');
    const leaderboardList = document.getElementById('leaderboard-list');

    // 2b. AI Spectator state management & Telemetry Hooks
    let aiRestartTimer = null;

    function setAIMode(active) {
        engine.setAIMode(active);
        if (active) {
            // A baseline run starts from a fresh board, never a human-assisted episode.
            if (engine.state !== 'READY') {
                engine.resetGame();
                engine.setGameState('PLAYING');
            }
            if (btnToggleAI) btnToggleAI.classList.add('active');
            if (aiToggleLabel) aiToggleLabel.textContent = 'AI SPECTATOR: ON';
            if (telemetryHUD) telemetryHUD.classList.remove('hide');
            jevAgent.start();
        } else {
            if (btnToggleAI) btnToggleAI.classList.remove('active');
            if (aiToggleLabel) aiToggleLabel.textContent = 'AI SPECTATOR: OFF';
            if (telemetryHUD) telemetryHUD.classList.add('hide');
            jevAgent.stop();
        }
    }

    jevAgent.onTelemetry = (data) => {
        if (!data.enabled) {
            if (telemetryHUD) telemetryHUD.classList.add('hide');
            return;
        }
        if (telemetryHUD) telemetryHUD.classList.remove('hide');

        const arrowMap = { 'UP': '▲ UP', 'DOWN': '▼ DOWN', 'LEFT': '◀ LEFT', 'RIGHT': '▶ RIGHT', 'WAIT': '■ WAIT' };
        if (hudAction) hudAction.textContent = arrowMap[data.action] || data.action;

        const threat = data.threatLevel || 'safe';
        if (hudThreat) {
            hudThreat.textContent = threat.replace(/_/g, ' ');
            hudThreat.className = `cell-value cell-threat threat-${threat}`;
        }

        const evacPct = Number.isFinite(data.evacuateLog) ? Math.round(data.evacuateLog * 100) : null;
        if (hudEvacBar) hudEvacBar.style.width = `${evacPct ?? 0}%`;
        if (hudEvacVal) hudEvacVal.textContent = evacPct === null ? '—' : `${evacPct ?? 0}%`;

        const fwdPct = Number.isFinite(data.forwardClear) ? Math.round(data.forwardClear * 100) : null;
        if (hudForwardBar) hudForwardBar.style.width = `${fwdPct ?? 0}%`;
        if (hudForwardVal) hudForwardVal.textContent = fwdPct === null ? '—' : `${fwdPct ?? 0}%`;

        if (hudStreakBar && data.streak !== undefined) {
            const streakPct = Math.min(100, Math.round((data.streak / 100) * 100));
            hudStreakBar.style.width = `${streakPct}%`;
            if (hudStreakVal) hudStreakVal.textContent = `${data.streak} / 100 (Best: ${data.bestStreak || data.streak})`;
        }

        if (data.mode === 'jev-only') {
            if (hudStreakVal) hudStreakVal.textContent = `${data.stats.captures} / ${data.stats.deaths}`;
            if (baselineStatus) baselineStatus.textContent = data.stateSummary;
            if (btnRetryJev) btnRetryJev.hidden = !data.error;
        }
        if (hudSource) {
            const source = data.safetyVetoed ? 'LOCAL / JEV VETOED'
                : data.source.includes('LOCAL') ? 'LOCAL POLICY'
                : data.source;
            hudSource.textContent = `ENGINE: ${source}`;
            hudSource.title = data.source;
        }
        if (hudLatency) hudLatency.textContent = `DECISION DELAY: ${data.latency} ms`;
        if (hudCount) hudCount.textContent = `DECISIONS: ${data.decisionCount || 0}`;
    };

    engine.onGameOver = () => {
        if (engine.aiMode) {
            jevAgent.record('run_finished', { score: engine.score, level: engine.level, stats: { ...jevAgent.stats } });
            jevAgent.notify('FINISHED');
        }
    };

    // 3. Helper to format HUD scores to 6 padded digits
    function formatScore(score) {
        return score.toString().padStart(6, '0');
    }

    // 4. Update HUD text and pip markers
    function updateHUD(game) {
        scoreVal.textContent = formatScore(game.score);
        highScoreVal.textContent = formatScore(game.highScore);
        levelVal.textContent = game.level;

        // Lives indicator pips
        const pips = livesContainer.querySelectorAll('.live-pip');
        for (let i = 0; i < pips.length; i++) {
            if (i < game.lives) {
                pips[i].classList.remove('spent');
            } else {
                pips[i].classList.add('spent');
            }
        }
    }

    // 5. Leaderboard UI rendering
    function renderLeaderboard() {
        const scores = leaderboard.getScores();
        leaderboardList.innerHTML = '';
        scores.forEach((entry, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="rank">${index + 1}.</span> <span class="initials">${entry.initials}</span> <span class="score">${formatScore(entry.score)}</span>`;
            leaderboardList.appendChild(li);
        });
    }

    function submitScore() {
        const initials = (initialsInput.value || 'AAA').toUpperCase().slice(0, 3);
        leaderboard.submitScore(initials, engine.score);
        renderLeaderboard();

        // Sync personal high score with submission immediately
        if (engine.score > engine.highScore) {
            engine.highScore = engine.score;
            localStorage.setItem('neonhop_high_score', engine.highScore.toString());
            updateHUD(engine);
        }

        highScoreForm.classList.add('hide');
        initialsInput.value = '';
    }

    // 6. Define temporary render callback (Phase 3 WebGL renderer attaches here)
    function renderCallback(game, alpha) {
        // A. Dynamic UI HUD syncing
        updateHUD(game);

        // B. Absolute Overlay visibility mappings
        switch (game.state) {
            case 'READY':
                overlayStart.classList.add('active');
                overlayPaused.classList.remove('active');
                overlayGameOver.classList.remove('active');
                btnPause.disabled = true;
                break;
            case 'PLAYING':
                overlayStart.classList.remove('active');
                overlayPaused.classList.remove('active');
                overlayGameOver.classList.remove('active');
                btnPause.disabled = false;
                btnPause.textContent = 'PAUSE';
                break;
            case 'PAUSED':
                overlayStart.classList.remove('active');
                overlayPaused.classList.add('active');
                overlayGameOver.classList.remove('active');
                btnPause.disabled = false;
                btnPause.textContent = 'RESUME';
                break;
            case 'GAME_OVER':
                overlayStart.classList.remove('active');
                overlayPaused.classList.remove('active');
                overlayGameOver.classList.add('active');
                btnPause.disabled = true;

                // Check highscore qualifications
                if (game.score > 0 && leaderboard.isQualified(game.score)) {
                    highScoreForm.classList.remove('hide');
                } else {
                    highScoreForm.classList.add('hide');
                }
                break;
        }

        // C. Render the high-fidelity 3D WebGL Scene
        renderer.render(game, alpha);
    }

    // 7. Bind interactive actions
    btnStart.addEventListener('click', () => {
        if (engine.state === 'READY') {
            setAIMode(false);
            sound.init();
            sound.startMusic();
            engine.setGameState('PLAYING');
        }
    });

    if (btnWatchAI) {
        btnWatchAI.addEventListener('click', () => {
            if (engine.state === 'READY') {
                sound.init();
                sound.startMusic();
                setAIMode(true);
                engine.setGameState('PLAYING');
            }
        });
    }

    if (btnToggleAI) {
        btnToggleAI.addEventListener('click', () => {
            setAIMode(!engine.aiMode);
        });
    }

    if (btnTakeControl) {
        btnTakeControl.addEventListener('click', () => {
            setAIMode(false);
        });
    }

    btnPause.addEventListener('click', () => {
        if (engine.state === 'PLAYING') {
            engine.pauseGame();
            sound.stopMusic();
        } else if (engine.state === 'PAUSED') {
            engine.resumeGame();
            sound.startMusic();
        }
    });

    btnRestart.addEventListener('click', () => {
        if (aiRestartTimer) clearTimeout(aiRestartTimer);
        engine.resetGame();
        sound.stopMusic();
        sound.setLevel(1);
        highScoreForm.classList.add('hide');
        setAIMode(false);
    });

    btnSubmitScore.addEventListener('click', () => {
        submitScore();
    });

    initialsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitScore();
        }
    });

    // 7b. Simulation speed and baseline recording controls
    function setSimSpeed(mult) {
        engine.setSimulationSpeed(mult);
        mult = engine.simulationSpeed;
        [btnSpeed1x, btnSpeed2x, btnSpeed5x].forEach(b => b?.classList.remove('active'));
        if (mult === 1) btnSpeed1x?.classList.add('active');
        if (mult === 2) btnSpeed2x?.classList.add('active');
        if (mult === 5) btnSpeed5x?.classList.add('active');
    }

    if (btnSpeed1x) btnSpeed1x.addEventListener('click', () => setSimSpeed(1));
    if (btnSpeed2x) btnSpeed2x.addEventListener('click', () => setSimSpeed(2));
    if (btnSpeed5x) btnSpeed5x.addEventListener('click', () => setSimSpeed(5));

    btnRetryJev?.addEventListener('click', () => jevAgent.retry());
    btnExportBaseline?.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([jevAgent.exportSession()], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `jev-only-${jevAgent.sessionId}.json`;
        link.click();
        URL.revokeObjectURL(url);
    });

    // 8. Audio Controls
    let isMuted = false;
    btnMute.addEventListener('click', () => {
        isMuted = !isMuted;
        btnMute.querySelector('.icon').textContent = isMuted ? '🔇' : '🔊';
        // Audio hook linked with soundEngine later
        if (window.soundEngine) {
            window.soundEngine.setMuted(isMuted);
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (window.soundEngine) {
            window.soundEngine.setVolume(val);
        }
    });

    // 9. Input mappings: Menu navigation keys & AI Takeover
    const movementKeyCodes = ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'];
    window.addEventListener('keydown', (e) => {
        // If human presses any movement key while in AI Spectator Mode, instantly hand off control
        if (engine.state === 'PLAYING' && engine.aiMode && movementKeyCodes.includes(e.code)) {
            setAIMode(false);
        }

        if (engine.state === 'PLAYING') {
            if (e.code === 'Escape') {
                engine.pauseGame();
                sound.stopMusic();
                e.preventDefault();
            }
        } else if (engine.state === 'READY' && e.key === 'Enter') {
            sound.init();
            sound.startMusic();
            setAIMode(false);
            engine.setGameState('PLAYING');
            e.preventDefault();
        } else if (engine.state === 'PAUSED' && e.key === 'Escape') {
            engine.resumeGame();
            sound.startMusic();
            e.preventDefault();
        } else if (engine.state === 'GAME_OVER' && e.key === 'Enter') {
            if (aiRestartTimer) clearTimeout(aiRestartTimer);
            engine.resetGame();
            sound.stopMusic();
            sound.setLevel(1);
            setAIMode(false);
            e.preventDefault();
        }
    });

    // 11. Focus and blur tab security
    window.addEventListener('blur', () => {
        sound.suspendEngine();
    });

    window.addEventListener('focus', () => {
        sound.resumeEngine();
    });

    // 12. Initial setup load
    renderLeaderboard();
    updateHUD(engine);

    // 13. Kick off loop execution
    engine.startLoop(renderCallback);

    // Expose engine instance for external module hooks
    window.gameEngine = engine;
});
