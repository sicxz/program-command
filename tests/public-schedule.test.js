const fs = require('fs');
const path = require('path');
const PublicSchedulePage = require('../pages/public-schedule.js');
const ScheduleDataUtils = require('../js/schedule-data-utils.js');

function setupDom() {
    document.body.innerHTML = `
        <div id="publicStatus"></div>
        <span id="publicAcademicYearLabel"></span>
        <span id="publicQuarterLabel"></span>
        <h2 id="publicScheduleTitle"></h2>
        <p id="publicScheduleSubtitle"></p>
        <div id="publicPanelCount"></div>
        <div id="publicScheduleGrid"></div>
        <section id="publicSpecialSections"></section>
    `;
}

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('public schedule page', () => {
    beforeEach(() => {
        setupDom();
    });

    test('uses AY 2026-27 Fall as the default context', () => {
        expect(PublicSchedulePage.DEFAULTS.year).toBe('2026-27');
        expect(PublicSchedulePage.DEFAULTS.quarter).toBe('fall');
        expect(PublicSchedulePage.formatQuarterTitle('2026-27', 'fall')).toBe('Fall 2026');
    });

    test('loads public schedule rows through the RPC and renders the Fall grid', async () => {
        const rpc = jest.fn().mockResolvedValue({
            data: [
                {
                    academic_year: '2026-27',
                    quarter: 'fall',
                    day_pattern: 'MW',
                    time_slot: '10:00-12:20',
                    section: '001',
                    course_code: 'DESN 368',
                    course_title: 'Code + Design 1',
                    credits: 5,
                    instructor_name: 'T. Masingale',
                    room_code: '206',
                    projected_enrollment: 24
                },
                {
                    academic_year: '2026-27',
                    quarter: 'fall',
                    day_pattern: 'ONLINE',
                    time_slot: 'async',
                    section: '002',
                    course_code: 'DESN 216',
                    course_title: 'Digital Foundations',
                    credits: 5,
                    instructor_name: 'Barton/Pettigrew',
                    room_code: 'ONLINE'
                }
            ],
            error: null
        });

        const app = PublicSchedulePage.createPublicScheduleApp({
            document,
            scheduleDataUtils: ScheduleDataUtils,
            getClient: () => ({ rpc })
        });

        await app.init();
        await flushPromises();

        expect(rpc).toHaveBeenCalledWith('get_public_schedule', {
            p_academic_year: '2026-27',
            p_program_code: 'ewu-design',
            p_quarter: 'fall'
        });
        expect(document.getElementById('publicScheduleTitle').textContent).toBe('Fall 2026');
        expect(document.getElementById('publicPanelCount').textContent).toBe('2 sections');
        expect(document.getElementById('publicStatus').textContent).toBe('Live schedule');
        expect(document.getElementById('publicScheduleGrid').textContent).toContain('DESN 368');
        expect(document.getElementById('publicSpecialSections').textContent).toContain('DESN 216');
    });

    test('shows an unavailable state when the public RPC fails', async () => {
        const app = PublicSchedulePage.createPublicScheduleApp({
            document,
            scheduleDataUtils: ScheduleDataUtils,
            getClient: () => ({
                rpc: jest.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'permission denied' }
                })
            })
        });

        await app.init();
        await flushPromises();

        expect(document.getElementById('publicStatus').textContent).toBe('Unavailable');
        expect(document.getElementById('publicScheduleGrid').textContent).toContain('permission denied');
    });

    test('public HTML does not load protected editor/auth scripts or save controls', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '..', 'public-schedule.html'), 'utf8');

        expect(html).not.toContain('auth-guard.js');
        expect(html).not.toContain('auth-service.js');
        expect(html).not.toContain('dirty-state-tracker.js');
        expect(html).not.toMatch(/save/i);
        expect(html).not.toMatch(/import/i);
        expect(html).not.toMatch(/Add Course/i);
        expect(html).not.toMatch(/Copy to Next Year/i);
        expect(html).not.toMatch(/Settings/i);
    });

    test('public HTML exposes only the login link as navigation', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '..', 'public-schedule.html'), 'utf8');

        const anchors = html.match(/<a\b/gi) || [];
        expect(anchors).toHaveLength(1);
        expect(html).toContain('href="login.html"');
        expect(html).toContain('Program Command');
    });
});
