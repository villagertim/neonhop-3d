// Optional integration check: requires Playwright and its Chromium browser.
// Run against a no-key fixture server, using an isolated browser context.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const failedAssets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (/\.(js|css)(\?|$)/.test(response.url()) && response.status() >= 400) {
            failedAssets.push(`${response.status()} ${response.url()}`);
        }
    });
    let confirmReset = true;
    page.on('dialog', dialog => dialog.type() === 'confirm' && !confirmReset ? dialog.dismiss() : dialog.accept());
    try {
        const base = process.env.TEST_URL;
        assert.ok(base, 'Set TEST_URL to an isolated no-key fixture server');
        await page.goto(base);
        await page.waitForFunction(() => Boolean(window.gameEngine), { timeout: 30000 });
        assert.equal(await page.evaluate(() => window.gameEngine.state), 'READY');
        assert.equal(await page.locator('#ai-telemetry-hud').isVisible(), false);
        assert.equal(await page.locator('#game-stage').evaluate(el => getComputedStyle(el).position), 'relative');
        assert.ok((await page.locator('#game-canvas').boundingBox()).width > 800);
        // Exercise a genuine browser-origin fetch, with no provider key configured.
        assert.equal(await page.evaluate(async () => (await fetch('/api/jev/decision', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        })).status), 401);
        assert.equal(await page.evaluate(async () => (await fetch('/.env')).status), 404);
        await page.locator('#btn-start-game').click();
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(() => window.gameEngine.player.currPosition.x === -1 && !window.gameEngine.player.isHopping);
        await page.locator('#btn-pause').click();
        assert.equal(await page.evaluate(() => window.gameEngine.state), 'PAUSED');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => window.gameEngine.state), 'PLAYING');
        for (const speed of [2, 5, 1]) {
            await page.locator(`#btn-speed-${speed}x`).click();
            const state = await page.evaluate(() => [window.gameEngine.simulationSpeed, window.gameEngine.fixedDeltaTime]);
            assert.deepEqual(state, [speed, 1 / 60]);
            assert.ok(await page.locator(`#btn-speed-${speed}x`).evaluate(el => el.classList.contains('active')));
        }
        await page.locator('#btn-toggle-ai').click();
        await page.waitForFunction(() => window.jevAgent.decisionCount > 0);
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.evaluate(() => window.gameEngine.aiMode), false);
        assert.equal(await page.evaluate(() => window.jevAgent.enabled), false);
        await page.locator('#btn-restart').click();
        assert.equal(await page.evaluate(() => window.gameEngine.state), 'READY');
        await page.locator('#btn-watch-ai').click();
        await page.waitForFunction(() => window.jevAgent.decisionCount > 0);
        await page.locator('#btn-take-control').click();
        assert.equal(await page.evaluate(() => window.jevAgent.enabled), false);
        // Seed only this isolated browser's memory; test cancel, confirm, and reload.
        await page.evaluate(() => {
            window.jevAgent.brain.currentStreak = 9;
            window.jevAgent.brain.save();
            localStorage.setItem('arcade_learning_brain_v1', JSON.stringify({ currentStreak: 8 }));
        });
        confirmReset = false;
        await page.locator('#btn-reset-brain').click();
        assert.equal(await page.evaluate(() => window.jevAgent.brain.currentStreak), 9);
        confirmReset = true;
        await page.locator('#btn-reset-brain').click();
        assert.equal(await page.evaluate(() => window.jevAgent.brain.currentStreak), 0);
        assert.equal(await page.evaluate(() => localStorage.getItem('arcade_learning_brain_v1')), null);
        await page.reload();
        await page.waitForFunction(() => Boolean(window.gameEngine));
        assert.equal(await page.evaluate(() => window.jevAgent.brain.currentStreak), 0);
        // Inject only the remote decision transport to reproduce delayed takeover in the UI.
        await page.evaluate(() => {
            window.jevAgent.queryJevAPI = () => new Promise(resolve => { window.resolveReviewDecision = resolve; });
        });
        await page.locator('#btn-watch-ai').click();
        await page.waitForFunction(() => typeof window.resolveReviewDecision === 'function');
        await page.keyboard.press('ArrowLeft');
        await page.evaluate(() => window.resolveReviewDecision({ action: 'UP' }));
        await page.waitForFunction(() => !window.gameEngine.player.isHopping);
        assert.equal(await page.evaluate(() => window.gameEngine.pendingAIIntent), null);
        assert.equal(await page.evaluate(() => window.jevAgent.enabled), false);
        assert.ok(await page.locator('#ai-telemetry-hud').evaluate(el => el.classList.contains('hide')));
        // Deterministically trigger game over without waiting for three natural deaths.
        await page.evaluate(() => { window.gameEngine.lives = 1; window.gameEngine.triggerDeath('crash'); });
        await page.waitForFunction(() => document.querySelector('#overlay-gameover').classList.contains('active'));
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.gameEngine.state), 'READY');
        await page.waitForFunction(() => document.querySelector('#overlay-start').classList.contains('active'));
        await page.screenshot({ path: 'outputs/remediation-browser-smoke.png' });
        assert.deepEqual(errors, []);
        assert.deepEqual(failedAssets, []);
        console.log('PASS: assets, browser-origin gateway, private-file denial, human play, pause/resume, 1x/2x/5x, spectator, takeover, reset/cancel/reload, delayed reply, game over/restart; no page exceptions');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
