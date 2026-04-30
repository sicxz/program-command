const fs = require('fs');
const path = require('path');
const PublicSchedulePage = require('../pages/public-schedule.js');
const ScheduleDataUtils = require('../js/schedule-data-utils.js');

function setupDom() {
    document.body.innerHTML = `
        <div id="publicStatus"></div>
        <span id="publicAcademicYearLabel"></span>
        <span id="publicQuarterLabel"></span>
        <div id="publicYearTabs"></div>
        <div id="publicQuarterTabs"></div>
        <section id="publicFacultyLegend"></section>
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
        expect(PublicSchedulePage.PUBLIC_YEARS).toEqual(['2026-27', '2025-26', '2024-25', '2023-24']);
        expect(PublicSchedulePage.formatQuarterTitle('2026-27', 'fall')).toBe('Fall 2026');
    });

    test('maps known and unmapped faculty to stable color-coded blocks', () => {
        expect(PublicSchedulePage.getFacultyInfo('T. Masingale')).toMatchObject({
            className: 'faculty-masingale',
            color: '#667eea',
            name: 'T.Masingale'
        });

        const breen = PublicSchedulePage.getFacultyInfo('M.Breen');
        expect(breen.className).toBe('faculty-generated');
        expect(breen.name).toBe('M.Breen');
        expect(breen.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(PublicSchedulePage.getFallbackFacultyColor('M.Breen')).toBe(breen.color);
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
                },
                {
                    academic_year: '2026-27',
                    quarter: 'fall',
                    day_pattern: 'MW',
                    time_slot: '10:00-12:20',
                    section: '003',
                    course_code: 'DESN 999',
                    course_title: 'Hidden Media Lab Section',
                    credits: 5,
                    instructor_name: 'TBD',
                    room_code: '207'
                },
                {
                    academic_year: '2026-27',
                    quarter: 'winter',
                    day_pattern: 'TR',
                    time_slot: '10:00-12:20',
                    section: '001',
                    course_code: 'DESN 379',
                    course_title: 'Web Development 2',
                    credits: 5,
                    instructor_name: 'C.Manikoth',
                    room_code: '206',
                    projected_enrollment: 24
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
            p_quarter: null
        });
        expect(document.getElementById('publicScheduleTitle').textContent).toBe('Fall 2026');
        expect(document.getElementById('publicPanelCount').textContent).toBe('2 sections');
        expect(document.getElementById('publicStatus').textContent).toBe('Live schedule');
        expect(document.querySelector('[data-year="2026-27"]').getAttribute('aria-selected')).toBe('true');
        expect(document.getElementById('publicYearTabs').textContent).toContain('2023-24');
        expect(document.getElementById('publicScheduleGrid').textContent).toContain('DESN 368');
        expect(document.getElementById('publicScheduleGrid').textContent).not.toContain('DESN 999');
        expect(document.getElementById('publicSpecialSections').textContent).toContain('DESN 216');
        expect(document.querySelector('.public-course-block').className).toContain('faculty-masingale');
        expect(document.getElementById('publicFacultyLegend').textContent).toContain('T.Masingale');
        expect(document.getElementById('publicFacultyLegend').textContent).not.toMatch(/\bcr\b/i);

        const headers = Array.from(document.querySelectorAll('.public-grid-header')).map((header) => header.textContent);
        expect(headers).toEqual(['Time', 'UX Lab', 'Mac Lab 1', 'Mac Lab 2', 'Mac Lab 3', 'Design Studio', 'Mac Lab 4']);
        expect(headers).not.toContain('207 Media Lab');
        expect(headers).not.toContain('CEB 102');
        expect(headers).not.toContain('CEB 104');

        const timeSlot = document.querySelector('.public-time-slot');
        expect(timeSlot.getAttribute('aria-label')).toBe('10:00 AM to 12:20 PM');
        expect(timeSlot.querySelector('.public-time-start').textContent).toBe('10:00 AM');
        expect(timeSlot.querySelector('.public-time-end').textContent).toBe('12:20 PM');

        document.querySelector('[data-quarter="winter"]').click();

        expect(document.getElementById('publicScheduleTitle').textContent).toBe('Winter 2027');
        expect(document.getElementById('publicScheduleGrid').textContent).toContain('DESN 379');
        expect(document.querySelector('.public-course-block').className).toContain('faculty-manikoth');
        expect(document.getElementById('publicFacultyLegend').textContent).toContain('C.Manikoth');
        expect(document.getElementById('publicFacultyLegend').textContent).not.toMatch(/\bcr\b/i);
    });

    test('reloads public schedule rows when an allowed academic year is selected', async () => {
        const rpc = jest.fn()
            .mockResolvedValueOnce({
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
                    }
                ],
                error: null
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        academic_year: '2025-26',
                        quarter: 'fall',
                        day_pattern: 'TR',
                        time_slot: '13:00-15:20',
                        section: '001',
                        course_code: 'DESN 263',
                        course_title: 'Typography',
                        credits: 5,
                        instructor_name: 'S.Durr',
                        room_code: '209',
                        projected_enrollment: 22
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

        document.querySelector('[data-year="2025-26"]').click();
        await flushPromises();
        await flushPromises();

        expect(rpc).toHaveBeenLastCalledWith('get_public_schedule', {
            p_academic_year: '2025-26',
            p_program_code: 'ewu-design',
            p_quarter: null
        });
        expect(document.getElementById('publicAcademicYearLabel').textContent).toBe('AY 2025-26');
        expect(document.getElementById('publicScheduleTitle').textContent).toBe('Fall 2025');
        expect(document.querySelector('[data-year="2025-26"]').getAttribute('aria-selected')).toBe('true');
        expect(document.getElementById('publicScheduleGrid').textContent).toContain('DESN 263');
        expect(document.getElementById('publicScheduleGrid').textContent).not.toContain('DESN 368');
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

    test('places the faculty key below the schedule content', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '..', 'public-schedule.html'), 'utf8');

        expect(html.indexOf('id="publicFacultyLegend"')).toBeGreaterThan(html.indexOf('id="publicSpecialSections"'));
        expect(html.indexOf('id="publicFacultyLegend"')).toBeGreaterThan(html.indexOf('id="publicScheduleGrid"'));
    });
});
