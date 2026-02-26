const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('quarter-change') || msg.text().includes('renderSchedule') || msg.text().includes('Schedule')) {
            console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
        }
    });

    console.log('Navigating to http://localhost:3001/index.html...');
    await page.goto('http://localhost:3001/index.html');
    await page.waitForTimeout(2000); // give it time to load

    await browser.close();
})();
