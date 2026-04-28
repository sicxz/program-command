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
});
