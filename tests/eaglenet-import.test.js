const ProgramCommandImport = require('../js/eaglenet-import.js');

describe('ProgramCommandImport', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    test('parses CSV headers into normalized row objects', () => {
        const csv = [
            'Academic Year,Term,Subject,Catalog Number,Section,Course Title,Faculty,Meeting Days,Start Time,End Time,Location,Credits,Registered',
            '2025-26,Fall,CSCD,101,1,Intro to CS,"Doe, Jane",TuTh,1300,1500,CEB 210,5,24'
        ].join('\n');

        const rows = ProgramCommandImport.parseCsvRows(csv);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            academicYear: '2025-26',
            term: 'Fall',
            subject: 'CSCD',
            catalogNumber: '101',
            courseTitle: 'Intro to CS',
            faculty: 'Doe, Jane',
            meetingDays: 'TuTh',
            startTime: '1300',
            endTime: '1500',
            location: 'CEB 210',
            registered: '24'
        });
    });

    test('builds CLSS preview rows from EagleNET-style tabular rows', () => {
        const result = ProgramCommandImport.buildClssPreviewRowsFromTabularRows([
            {
                academicYear: '2025-26',
                term: 'Fall',
                subject: 'CSCD',
                catalogNumber: '101',
                section: '1',
                courseTitle: 'Intro to CS',
                faculty: 'Doe, Jane',
                meetingDays: 'TuTh',
                startTime: '1300',
                endTime: '1500',
                location: 'CEB 210',
                credits: '5',
                registered: '24',
                __sheetName: 'Fall export'
            }
        ], {
            dayPatterns: [
                { id: 'MW', aliases: ['MW'] },
                { id: 'TR', aliases: ['TR', 'TTH'] }
            ],
            timeSlots: [
                { id: '10:00-12:20', aliases: ['10:00-12:00'], startMinutes: 600, endMinutes: 740 },
                { id: '13:00-15:20', aliases: ['13:00-15:00'], startMinutes: 780, endMinutes: 920 }
            ],
            roomOptions: ['CEB 210', 'CEB 215'],
            resolveCourseCode: (value) => value,
            resolveFacultyName: (value) => value
        });

        expect(result.rows).toHaveLength(1);
        expect(result.meta.quarterCounts).toMatchObject({ fall: 1 });
        expect(result.rows[0]).toMatchObject({
            status: 'ready',
            code: 'CSCD 101',
            title: 'Intro to CS',
            section: '001',
            instructor: 'Jane Doe',
            meetingLabel: 'TR 13:00-15:00',
            roomLabel: 'CEB 210',
            schedulerDay: 'TR',
            schedulerTime: '13:00-15:20',
            schedulerRoom: 'CEB 210',
            targetQuarter: 'fall',
            reviewQuarter: 'fall',
            enrollment: 24
        });
        expect(result.rows[0].notes).toEqual(expect.arrayContaining([
            'Enrollment 24',
            'Sheet: Fall export'
        ]));
    });

    test('infers quarter from worksheet names and detects online rows', () => {
        const result = ProgramCommandImport.buildClssPreviewRowsFromTabularRows([
            {
                subject: 'CYBR',
                catalogNumber: '310',
                section: '2',
                title: 'Cyber Operations',
                faculty: 'Staff',
                modality: 'Online async',
                __sheetName: 'Spring 2026 export'
            }
        ], {
            dayPatterns: [
                { id: 'MW', aliases: ['MW'] },
                { id: 'TR', aliases: ['TR', 'TTH'] }
            ],
            timeSlots: [],
            roomOptions: [],
            resolveCourseCode: (value) => value,
            resolveFacultyName: (value) => value,
            defaultQuarter: 'winter'
        });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({
            status: 'online',
            code: 'CYBR 310',
            targetQuarter: 'spring',
            reviewQuarter: 'spring',
            schedulerRoom: 'ONLINE',
            schedulerSlotLabel: 'ONLINE / async',
            reviewRoom: ''
        });
    });

    test('persists pending onboarding import handoff state', () => {
        const payload = {
            source: 'spreadsheet',
            programId: 'biology',
            profileId: 'biology-v01'
        };

        ProgramCommandImport.writePendingOnboardingImport(payload);
        expect(ProgramCommandImport.readPendingOnboardingImport()).toEqual(payload);

        ProgramCommandImport.clearPendingOnboardingImport();
        expect(ProgramCommandImport.readPendingOnboardingImport()).toBeNull();
    });

    test('groups screenshot OCR text by inferred quarter for onboarding handoff', async () => {
        const files = [
            {
                name: 'cscd fall 2025 1.png',
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/cscd fall 2025/cscd fall 2025 1.png'
            },
            {
                name: 'cscd winter 2026 1.png',
                type: 'image/png',
                webkitRelativePath: 'cscd-cyber AY2025-26/cscd winter 2026/cscd winter 2026 1.png'
            }
        ];
        const textByName = {
            'cscd fall 2025 1.png': 'CSCD 101 - Intro to CS 001 Doe, Jane TR 1:00 PM - 3:00 PM CEB 210',
            'cscd winter 2026 1.png': 'CSCD 202 - Data Structures 001 Roe, Jamie MW 10:00 AM - 12:00 PM CEB 215'
        };

        const result = await ProgramCommandImport.readScreenshotTextImportFromFiles(files, {
            recognize: async (file) => ({
                data: {
                    text: textByName[file.name] || ''
                }
            })
        });

        expect(result).toMatchObject({
            scope: 'all',
            meta: {
                fileCount: 2,
                extractedTextCount: 2,
                assignedQuarterCount: 2,
                shouldAutoParse: true,
                quarterFileCounts: {
                    fall: 1,
                    winter: 1,
                    spring: 0
                }
            }
        });
        expect(result.quarterTexts.fall).toContain('===== cscd-cyber AY2025-26/cscd fall 2025/cscd fall 2025 1.png =====');
        expect(result.quarterTexts.winter).toContain('===== cscd-cyber AY2025-26/cscd winter 2026/cscd winter 2026 1.png =====');
    });

    test('falls back to single-quarter review when OCR text has no quarter signal', async () => {
        const files = [
            {
                name: 'screen1.png',
                type: 'image/png'
            }
        ];

        const result = await ProgramCommandImport.readScreenshotTextImportFromFiles(files, {
            defaultQuarter: 'winter',
            recognize: async () => ({
                data: {
                    text: 'CSCD 460 - Software Engineering 001 Staff ONLINE'
                }
            })
        });

        expect(result.scope).toBe('single');
        expect(result.targetQuarter).toBe('winter');
        expect(result.singleText).toContain('===== screen1.png =====');
        expect(result.meta.shouldAutoParse).toBe(false);
        expect(result.meta.warnings.join(' ')).toMatch(/Quarter inference failed/i);
    });

    test('builds screenshot OCR preview rows and filters to the selected program code', () => {
        const payload = {
            scope: 'single',
            targetQuarter: 'fall',
            singleText: [
                '===== sample.png =====',
                'INTRODUCTION TO PROGR... Computer Sci... 110 001 5 40668 FallQ.. Lemelin, Rob (Primary) 09:00 AM - 09:50 AM Type: Class Cheney',
                'CYBER DEFENSE Cybersecurity 410 040 3 21086 FallQ.. Espinoza, Antonio (Primary) 08:00 AM - 08:50 AM Type: Class Spokane'
            ].join('\n'),
            meta: {
                fileCount: 1,
                extractedTextCount: 1,
                warnings: []
            }
        };

        const result = ProgramCommandImport.buildClssPreviewRowsFromScreenshotImport(payload, {
            dayPatterns: [
                { id: 'MW', aliases: ['MW'] },
                { id: 'TR', aliases: ['TR', 'TTH'] }
            ],
            timeSlots: [
                { id: '10:00-12:20', aliases: ['10:00-12:00'], startMinutes: 600, endMinutes: 740 },
                { id: '13:00-15:20', aliases: ['13:00-15:00'], startMinutes: 780, endMinutes: 920 }
            ],
            roomOptions: ['Cheney', 'Spokane'],
            resolveCourseCode: (value) => value,
            resolveFacultyName: (value) => value,
            allowedCoursePrefixes: ['CSCD']
        });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({
            code: 'CSCD 110',
            targetQuarter: 'fall'
        });
        expect(result.meta.omittedCount).toBe(1);
        expect(result.meta.warnings.join(' ')).toMatch(/outside the selected program code/i);
    });
});
