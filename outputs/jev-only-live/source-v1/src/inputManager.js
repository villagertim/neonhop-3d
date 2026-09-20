// src/inputManager.js

export class InputManager {
    constructor(gameEngine) {
        this.engine = gameEngine;

        // Key code mapping to standard uppercase directions
        this.keyMap = {
            'ArrowUp': 'UP',
            'KeyW': 'UP',
            'ArrowDown': 'DOWN',
            'KeyS': 'DOWN',
            'ArrowLeft': 'LEFT',
            'KeyA': 'LEFT',
            'ArrowRight': 'RIGHT',
            'KeyD': 'RIGHT'
        };

        // Mobile touch gesture coordinates
        this.touchStart = { x: 0, y: 0 };
        this.touchEnd = { x: 0, y: 0 };
        this.swipeThreshold = 45; // Minimum px threshold for swipe trigger

        this.initKeyboard();
        this.initTouchGestures();
        this.initVirtualDPad();
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (this.engine.state !== 'PLAYING') return;

            const direction = this.keyMap[e.code];
            if (direction) {
                this.engine.queueMovement(direction);
                e.preventDefault(); // Stop standard browser arrow scrolling
            }
        });
    }

    initTouchGestures() {
        const stage = document.getElementById('game-stage');
        if (!stage) return;

        stage.addEventListener('touchstart', (e) => {
            // Defer context unlock on touch interactions safely
            if (window.soundEngine) {
                window.soundEngine.init();
            }

            this.touchStart.x = e.touches[0].clientX;
            this.touchStart.y = e.touches[0].clientY;
        }, { passive: true });

        // Enforce no-scroll/bounce overrides on viewport swipe movement
        stage.addEventListener('touchmove', (e) => {
            if (this.engine.state === 'PLAYING') {
                e.preventDefault();
            }
        }, { passive: false });

        stage.addEventListener('touchend', (e) => {
            this.touchEnd.x = e.changedTouches[0].clientX;
            this.touchEnd.y = e.changedTouches[0].clientY;
            this.parseSwipeVector();
        }, { passive: true });
    }

    parseSwipeVector() {
        if (this.engine.state !== 'PLAYING') return;

        const dx = this.touchEnd.x - this.touchStart.x;
        const dy = this.touchEnd.y - this.touchStart.y;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Verify swipe exceeds min threshold limits
        if (Math.max(absX, absY) < this.swipeThreshold) return;

        if (absX > absY) {
            // Horizontal swipe direction
            if (dx > 0) {
                this.engine.queueMovement('RIGHT');
            } else {
                this.engine.queueMovement('LEFT');
            }
        } else {
            // Vertical swipe direction
            if (dy > 0) {
                this.engine.queueMovement('DOWN');
            } else {
                this.engine.queueMovement('UP');
            }
        }
    }

    initVirtualDPad() {
        const bindButton = (id, direction) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('pointerdown', (e) => {
                    // Unlock Audio context on button taps
                    if (window.soundEngine) {
                        window.soundEngine.init();
                    }
                    this.engine.queueMovement(direction);
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
        };

        bindButton('pad-up', 'UP');
        bindButton('pad-down', 'DOWN');
        bindButton('pad-left', 'LEFT');
        bindButton('pad-right', 'RIGHT');
    }
}
