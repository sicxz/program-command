const fs = require('fs');
const path = require('path');
const PublicSchedulePage = require('../pages/public-schedule.js');

const repoRoot = path.resolve(__dirname, '..');
const programCommand = fs.readFileSync(path.join(repoRoot, 'program-command.html'), 'utf8');
const designProfile = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'department-profiles', 'design-v1.json'), 'utf8')
);

function extractScheduleGridRoomsForYear() {
    const helpers = programCommand.match(
        /const SCHEDULE_GRID_ROOM_SETS = Object\.freeze\([\s\S]*?(?=\n\s*function normalizeScheduleGridRoomForYear)/
    );
    if (!helpers) throw new Error('Schedule grid room year logic was not found');

    const getSchedulerRoomOptionList = ({ year }) => {
        const yearEntry = designProfile.scheduler.roomLabelsByYear[year];
        const configuredRooms = Object.keys(yearEntry?.roomLabels || designProfile.scheduler.roomLabels);
        const priority = designProfile.import.clss.roomMatchPriority;
        const allowed = designProfile.scheduler.allowedRooms;
        return [...new Set([...priority, ...allowed, ...configuredRooms])];
    };

    return Function(
        'getSchedulerRoomOptionList',
        `${helpers[0]}; return getScheduleGridRoomsForYear;`
    )(getSchedulerRoomOptionList);
}

describe('Isle Hall room transition', () => {
    test('uses Catalyst rooms before 2026-27 and Isle Hall rooms from 2026-27 on', () => {
        expect(PublicSchedulePage.roomsForYear('2025-26').order).toEqual([
            '206',
            '209',
            '210',
            '212',
            'CEB 102',
            'CEB 104'
        ]);
        expect(PublicSchedulePage.roomsForYear('2026-27').order).toEqual([
            'ISL 156',
            'ISL 154',
            'ISL 155',
            'ISL 101',
            'CEB 102',
            'CEB 104'
        ]);
    });

    test('keeps both Isle Hall and Catalyst room codes in Program Command', () => {
        expect(programCommand).toContain("'ISL 156'");
        expect(programCommand).toContain("'206'");
    });

    test('keeps the Program Command grid in its configured Catalyst order for 2025-26', () => {
        expect(extractScheduleGridRoomsForYear()('2025-26')).toEqual([
            '206',
            '209',
            '210',
            '212',
            'CEB 102',
            'CEB 104'
        ]);
    });

    test('keeps the Program Command grid in its configured Isle Hall order for 2026-27', () => {
        expect(extractScheduleGridRoomsForYear()('2026-27')).toEqual([
            'ISL 156',
            'ISL 154',
            'ISL 155',
            'ISL 101',
            'CEB 102',
            'CEB 104'
        ]);
    });
});
