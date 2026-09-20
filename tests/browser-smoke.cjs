// Optional no-key fixture check. Synthetic responses here are test data, not model measurements.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
    assert.ok(process.env.TEST_URL, 'Set TEST_URL to tests/serve-browser-fixture.py');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.goto(process.env.TEST_URL);
        await page.waitForFunction(() => Boolean(window.jevAgent));
        await page.evaluate(() => { window.jevAgent.sessionId = 'browser-fixture-' + Date.now(); });
        await page.locator('#btn-watch-ai').click();
        await page.waitForFunction(() => Boolean(window.jevAgent.error));
        assert.equal(await page.evaluate(() => window.jevAgent.decisionCount), 0);
        assert.ok(await page.locator('#btn-retry-jev').isVisible());
        assert.equal(await page.evaluate(() => window.jevAgent.brain), undefined);
        assert.equal(await page.evaluate(() => window.jevAgent.oracle), undefined);
        await page.evaluate(() => {
            window.jevAgent.transport = async () => ({ model: 'jev-synthetic', answers: {
                action: { type: 'choice', choice: 'UP' }, threat_level: { type: 'score', score: 0 },
                evacuate_log: { type: 'noul', noul: 0 }, forward_path_clear: { type: 'noul', noul: 0 }
            } });
        });
        await page.locator('#btn-retry-jev').click();
        await page.waitForFunction(() => window.gameEngine.state === 'GAME_OVER');
        assert.equal(await page.evaluate(() => window.jevAgent.stats.deaths), 3);
        assert.equal(await page.evaluate(() => window.jevAgent.decisionCount), 3);
        assert.equal(await page.evaluate(() => window.jevAgent.stats.captures), 0);
        assert.ok(await page.locator('#hud-source').innerText().then(t => t.includes('JEV ONLY')));
        await page.keyboard.press('Enter');
        await page.evaluate(() => {
            window.jevAgent.transport = () => new Promise(resolve => { window.resolveSyntheticReply = resolve; });
        });
        await page.locator('#btn-watch-ai').click();
        await page.waitForFunction(() => typeof window.resolveSyntheticReply === 'function');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.evaluate(() => window.jevAgent.enabled), false);
        await page.evaluate(() => window.resolveSyntheticReply({ model: 'jev-synthetic', answers: {} }));
        await page.waitForFunction(() => !window.gameEngine.player.isHopping);
        assert.equal(await page.evaluate(() => window.gameEngine.pendingAIIntent), null);
        assert.deepEqual(errors, []);
        console.log('PASS: missing-key halt, explicit retry, raw fatal model moves, no brain/oracle, game over and takeover. Synthetic transport only.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
