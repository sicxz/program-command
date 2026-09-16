describe('schedule-builder runtime source banner', () => {
    let builder;
    let originalAddEventListener;

    beforeEach(() => {
        jest.resetModules();

        document.body.innerHTML = `
            <div id="runtimeDataSourceBanner" hidden></div>
        `;

        originalAddEventListener = document.addEventListener;
        document.addEventListener = jest.fn((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                return;
            }
            return originalAddEventListener.call(document, eventName, handler, options);
        });

        builder = require('../pages/schedule-builder.js');
    });

    afterEach(() => {
        document.addEventListener = originalAddEventListener;
    });

    test('renders a warning banner when tracked inputs still use local files', () => {
        builder.__setRuntimeDataSourcesForTests({
            historicalWorkload: {
                label: 'Historical workload baseline',
                source: 'local-file',
                canonical: false,
                fallback: true,
                detail: '../workload-data.json',
                message: 'Historical workload analysis still boots from local workload JSON.'
            },
            courses: {
                label: 'Courses',
                source: 'database',
                canonical: true,
                fallback: false,
                detail: 'courses',
                message: 'Courses loaded from the canonical Supabase courses table.'
            }
        });

        const banner = document.getElementById('runtimeDataSourceBanner');
        const summary = builder.__getRuntimeDataSourceSummaryForTests();

        expect(banner.hidden).toBe(false);
        expect(banner.className).toContain('runtime-source-banner-warning');
        expect(banner.textContent).toContain('still depends on local data');
        expect(banner.textContent).toContain('Historical workload baseline');
        expect(summary.hasFallbacks).toBe(true);
        expect(summary.fallbackCount).toBe(1);
    });

    test('renders a success banner when tracked inputs are canonical', () => {
        builder.__setRuntimeDataSourcesForTests({
            courses: {
                label: 'Courses',
                source: 'database',
                canonical: true,
                fallback: false,
                detail: 'courses',
                message: 'Courses loaded from the canonical Supabase courses table.'
            },
            savedSchedule: {
                label: 'Saved schedule',
                source: 'database',
                canonical: true,
                fallback: false,
                detail: 'scheduled_courses',
                message: '2026-27 schedule changes are now persisted in Supabase scheduled_courses.'
            }
        });

        const banner = document.getElementById('runtimeDataSourceBanner');
        const summary = builder.__getRuntimeDataSourceSummaryForTests();

        expect(banner.hidden).toBe(false);
        expect(banner.className).toContain('runtime-source-banner-success');
        expect(banner.textContent).toContain('canonical persisted sources');
        expect(summary.hasFallbacks).toBe(false);
        expect(summary.canonicalCount).toBe(2);
    });
});
