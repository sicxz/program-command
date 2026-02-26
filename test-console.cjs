const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('quarter-change') || msg.text().includes('renderSchedule') || msg.text().includes('Schedule')) {
            console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
        }
    });

    console.log('Navigating to http://localhost:3001/index.html...');
    await page.goto('http://localhost:3001/index.html');
    await page.waitForTimeout(2000); // give it time to load

    // Evaluate on page to see what scheduleData is
    const scheduleData = await page.evaluate(() => {
        return window.scheduleData ? Object.keys(window.scheduleData) : 'Not exposed';
    });
    console.log('Keys in scheduleData on window:', scheduleData);

    const springData = await page.evaluate(() => {
        if (!window.scheduleData) return null;
        return window.scheduleData['spring'];
    });
    console.log('Spring Data:', springData);

    await browser.close();
})();
