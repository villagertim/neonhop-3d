// src/leaderboard.js

export class Leaderboard {
    constructor() {
        this.storageKey = 'neonhop_v1_leaderboard';
        this.legacyKey = 'arcade_v1_leaderboard';
        this.defaultScores = [
            { initials: 'SYS', score: 5000 },
            { initials: 'TIM', score: 3000 },
            { initials: 'ANN', score: 1500 },
            { initials: 'VWC', score: 1000 },
            { initials: 'DEV', score: 500 }
        ];
    }

    // Safely reads and parses scores from localStorage with JSON recovery
    getScores() {
        try {
            let raw = localStorage.getItem(this.storageKey);
            if (!raw && localStorage.getItem(this.legacyKey)) {
                raw = localStorage.getItem(this.legacyKey);
                try { localStorage.setItem(this.storageKey, raw); } catch (e) {}
            }
            if (!raw) {
                this.saveScores(this.defaultScores);
                return JSON.parse(JSON.stringify(this.defaultScores));
            }

            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }

            // Fallback for corrupted/invalid structures
            this.saveScores(this.defaultScores);
            return JSON.parse(JSON.stringify(this.defaultScores));
        } catch (e) {
            console.error("[LEADERBOARD] Corrupted highscore structure loaded, resetting defaults.", e);
            this.saveScores(this.defaultScores);
            return JSON.parse(JSON.stringify(this.defaultScores));
        }
    }

    submitScore(initials, score) {
        const cleanedInitials = (initials || 'AAA').toUpperCase().slice(0, 3);
        const scores = this.getScores();

        scores.push({ initials: cleanedInitials, score: score });
        // Sort descending (highest first)
        scores.sort((a, b) => b.score - a.score);

        // Trim and retain only top 5 entries
        const topFive = scores.slice(0, 5);
        this.saveScores(topFive);
        return topFive;
    }

    saveScores(scores) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(scores));
        } catch (e) {
            console.error("[LEADERBOARD] Failed to save score entry to localStorage:", e);
        }
    }

    isQualified(score) {
        const scores = this.getScores();
        if (scores.length < 5) return true;
        // Qualifies if greater than or equal to the lowest score in the top 5
        return score >= scores[scores.length - 1].score;
    }
}
