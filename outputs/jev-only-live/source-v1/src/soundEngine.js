// src/soundEngine.js

export class SoundEngine {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.isMuted = false;
        this.masterVolume = 0.5;

        // Sound effect Voice Pool parameters
        this.voicePool = [];
        this.poolSize = 8;

        // Dedicated synth voice for background arpeggiator
        this.bgOsc = null;
        this.bgGain = null;
        this.bgFilter = null;

        // Arpeggiator step sequencer state
        this.isPlayingMusic = false;
        this.schedulerInterval = null;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.bpm = 112; // Base BPM
        this.currentLevel = 1;

        // Cyberpunk synth arpeggio progression (A-minor chord scales)
        this.notesPattern = [
            110.00, // A2
            130.81, // C3
            164.81, // E3
            196.00, // G3
            220.00, // A3
            196.00, // G3
            164.81, // E3
            130.81  // C3
        ];
    }

    // Lazy initialization on first user interaction
    init() {
        if (this.initialized) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();

            // Handle autoplay policies by resuming immediately if suspended
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            // 1. Create Master controls node
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            // 2. Pre-allocate Voice Pool for high-frequency SFX
            for (let i = 0; i < this.poolSize; i++) {
                this.voicePool.push(this.createVoiceNode());
            }

            // 3. Setup dedicated background music synthesizer
            this.initMusicSynth();

            this.initialized = true;
            console.log("[AUDIO] Web Audio Synthesis Engine fully initialized.");
        } catch (e) {
            console.error("[AUDIO] Failed to initialize AudioContext:", e);
        }
    }

    createVoiceNode() {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, this.ctx.currentTime);
        
        // Connect together
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        // Turn oscillator gain to zero immediately (idle) but keep osc spinning
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        osc.start(0);

        return {
            osc,
            filter,
            gain,
            active: false
        };
    }

    initMusicSynth() {
        this.bgOsc = this.ctx.createOscillator();
        this.bgFilter = this.ctx.createBiquadFilter();
        this.bgGain = this.ctx.createGain();

        this.bgOsc.type = 'sawtooth';
        this.bgFilter.type = 'lowpass';
        this.bgFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
        this.bgFilter.Q.setValueAtTime(3.0, this.ctx.currentTime); // Resonance accent

        this.bgOsc.connect(this.bgFilter);
        this.bgFilter.connect(this.bgGain);
        this.bgGain.connect(this.masterGain);

        // Set initial background volume
        this.bgGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.bgOsc.start(0);
    }

    // Grabs first idle voice from pre-allocated SFX pool
    getIdleVoice() {
        const voice = this.voicePool.find(v => !v.active);
        if (voice) {
            voice.active = true;
            return voice;
        }
        // Pool exhausted: hijack oldest voice or skip to prevent clipping
        return null;
    }

    releaseVoice(voice, delayMs) {
        setTimeout(() => {
            if (voice) {
                voice.gain.gain.setValueAtTime(0, this.ctx.currentTime);
                voice.active = false;
            }
        }, delayMs);
    }

    // --- PROCEDURAL SFX TRIGGERS ---

    playHop() {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;
        voice.osc.type = 'triangle';

        // Fast chiptune sweep upwards
        voice.osc.frequency.setValueAtTime(140, now);
        voice.osc.frequency.exponentialRampToValueAtTime(620, now + 0.11);

        voice.filter.frequency.setValueAtTime(1800, now);

        voice.gain.gain.setValueAtTime(0.3, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

        this.releaseVoice(voice, 120);
    }

    playDeath(type) {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;

        if (type === 'crash') {
            // A. Crunchy synth blast representing physical crash
            voice.osc.type = 'sawtooth';
            voice.osc.frequency.setValueAtTime(580, now);
            voice.osc.frequency.linearRampToValueAtTime(60, now + 0.32);

            voice.filter.frequency.setValueAtTime(1600, now);
            voice.filter.frequency.exponentialRampToValueAtTime(150, now + 0.32);

            voice.gain.gain.setValueAtTime(0.45, now);
            voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
            
            this.releaseVoice(voice, 350);
        } else {
            // B. Gurgling filter sweep representing river drowning
            voice.osc.type = 'sawtooth';
            voice.osc.frequency.setValueAtTime(120, now);
            voice.osc.frequency.linearRampToValueAtTime(38, now + 0.4);

            voice.filter.frequency.setValueAtTime(950, now);
            voice.filter.frequency.exponentialRampToValueAtTime(45, now + 0.4);

            voice.gain.gain.setValueAtTime(0.5, now);
            voice.gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
            
            this.releaseVoice(voice, 450);
        }
    }

    playScore() {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;
        voice.osc.type = 'triangle';

        // Quick uplifting major-triad arpeggio (C5 -> E5 -> G5 -> C6)
        voice.osc.frequency.setValueAtTime(523.25, now); // C5
        voice.osc.frequency.setValueAtTime(659.25, now + 0.05); // E5
        voice.osc.frequency.setValueAtTime(783.99, now + 0.10); // G5
        voice.osc.frequency.setValueAtTime(1046.50, now + 0.15); // C6

        voice.filter.frequency.setValueAtTime(2500, now);

        voice.gain.gain.setValueAtTime(0.35, now);
        voice.gain.gain.setValueAtTime(0.35, now + 0.05);
        voice.gain.gain.setValueAtTime(0.35, now + 0.10);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        this.releaseVoice(voice, 300);
    }

    playLevelUp() {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;
        voice.osc.type = 'sine';

        // Polyphonic uplifting chords simulated sequentially
        voice.osc.frequency.setValueAtTime(440, now);
        voice.osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        voice.osc.frequency.setValueAtTime(1320, now + 0.1);
        voice.osc.frequency.exponentialRampToValueAtTime(1760, now + 0.25);

        voice.filter.frequency.setValueAtTime(3000, now);

        voice.gain.gain.setValueAtTime(0.4, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        this.releaseVoice(voice, 500);
    }

    playGameOver() {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;
        voice.osc.type = 'sawtooth';

        // Sorrowful minor descent: A3 -> F3 -> D3 -> A2
        voice.osc.frequency.setValueAtTime(220.00, now); // A3
        voice.osc.frequency.setValueAtTime(174.61, now + 0.15); // F3
        voice.osc.frequency.setValueAtTime(146.83, now + 0.30); // D3
        voice.osc.frequency.setValueAtTime(110.00, now + 0.45); // A2

        voice.filter.frequency.setValueAtTime(800, now);
        voice.filter.frequency.linearRampToValueAtTime(200, now + 0.65);

        voice.gain.gain.setValueAtTime(0.4, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

        this.releaseVoice(voice, 800);
    }

    playCombo(multiplier) {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;
        voice.osc.type = 'triangle';

        // Rising retro-arcade coin chime pitch
        const pitchScale = 1.0 + (multiplier - 1) * 0.12;
        const f1 = 523.25 * pitchScale; // C5
        const f2 = 659.25 * pitchScale; // E5
        const f3 = 783.99 * pitchScale; // G5

        voice.osc.frequency.setValueAtTime(f1, now);
        voice.osc.frequency.setValueAtTime(f2, now + 0.05);
        voice.osc.frequency.setValueAtTime(f3, now + 0.10);

        voice.filter.frequency.setValueAtTime(2500, now);

        voice.gain.gain.setValueAtTime(0.3, now);
        voice.gain.gain.setValueAtTime(0.3, now + 0.05);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        this.releaseVoice(voice, 250);
    }

    playTimeLow() {
        this.init();
        if (!this.initialized || this.isMuted) return;

        const voice = this.getIdleVoice();
        if (!voice) return;

        const now = this.ctx.currentTime;
        voice.osc.type = 'sawtooth';

        // High-pitched double beep alarm
        voice.osc.frequency.setValueAtTime(880.00, now); // A5
        voice.osc.frequency.setValueAtTime(880.00, now + 0.10);

        voice.filter.frequency.setValueAtTime(900, now);

        voice.gain.gain.setValueAtTime(0.2, now);
        voice.gain.gain.setValueAtTime(0.001, now + 0.07);
        voice.gain.gain.setValueAtTime(0.2, now + 0.10);
        voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        this.releaseVoice(voice, 220);
    }

    // --- BACKGROUND ARPEGGIATOR MUSIC (TWO-CLOCKS LOOK-AHEAD SCHEDULER) ---

    startMusic() {
        this.init();
        if (!this.initialized || this.isPlayingMusic) return;

        this.isPlayingMusic = true;
        this.nextNoteTime = this.ctx.currentTime;
        this.currentStep = 0;

        // Ticks low-frequency interval clock every 25ms
        this.schedulerInterval = setInterval(() => this.runScheduler(), 25);
        console.log("[AUDIO] Background arpeggiator clock started.");
    }

    stopMusic() {
        if (!this.isPlayingMusic) return;

        clearInterval(this.schedulerInterval);
        this.schedulerInterval = null;
        this.isPlayingMusic = false;

        if (this.bgGain) {
            this.bgGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        console.log("[AUDIO] Background arpeggiator clock stopped.");
    }

    runScheduler() {
        // High-precision scheduling window: looks ahead 100ms
        const lookAheadTime = 0.100;
        const now = this.ctx.currentTime;

        while (this.nextNoteTime < now + lookAheadTime) {
            this.scheduleStep(this.currentStep, this.nextNoteTime);
            
            // Advance steps
            const stepDuration = 60 / (this.bpm * 4); // Sixteenth note steps
            this.nextNoteTime += stepDuration;
            this.currentStep = (this.currentStep + 1) % this.notesPattern.length;
        }
    }

    scheduleStep(stepIndex, time) {
        if (!this.bgOsc || !this.bgGain || this.isMuted) return;

        // Extract pitch, scaling frequency multiplier by level count
        const levelPitchScale = 1.0 + (this.currentLevel - 1) * 0.08; // Slight pitch raises per level
        const baseFreq = this.notesPattern[stepIndex] * levelPitchScale;

        // Schedule oscillator pitch shifts
        this.bgOsc.frequency.setValueAtTime(baseFreq, time);

        // Schedule resonant lowpass filter frequency envelopes
        const sweepFilterFreq = 400 + Math.sin(time * 0.8) * 200;
        this.bgFilter.frequency.setValueAtTime(sweepFilterFreq, time);

        // Cyber arpeggiator note decays: sharp attack, quick decay
        this.bgGain.gain.setValueAtTime(0.08, time);
        this.bgGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    }

    setLevel(level) {
        this.currentLevel = level;
        // Increase BPM to intensify arpeggio loops as levels grow
        this.bpm = 112 + (level - 1) * 8; 
    }

    setVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.initialized && !this.isMuted) {
            this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        }
    }

    setMuted(muted) {
        this.isMuted = muted;
        if (this.initialized) {
            const volumeVal = this.isMuted ? 0 : this.masterVolume;
            this.masterGain.gain.setValueAtTime(volumeVal, this.ctx.currentTime);
        }
    }

    handleResize() {
        // Safe check method to map layout resizes
    }

    suspendEngine() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
        }
    }

    resumeEngine() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}
