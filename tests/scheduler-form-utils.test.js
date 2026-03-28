const utils = require('../js/scheduler-form-utils.js');

describe('SchedulerFormUtils', () => {
    test('builds canonical day pattern ids from checkbox-style selections', () => {
        const patterns = [
            { id: 'MW', aliases: ['WM'] },
            { id: 'TR', aliases: ['RT', 'TH', 'TTH'] },
            { id: 'MTWRF', aliases: [] }
        ];

        expect(utils.buildDayPatternId(['M', 'W'], patterns)).toBe('MW');
        expect(utils.buildDayPatternId(['T', 'Th'], patterns)).toBe('TR');
        expect(utils.buildDayPatternId(['M', 'T', 'W', 'Th', 'F'], patterns)).toBe('MTWRF');
    });

    test('maps start and end inputs back to the configured scheduler slot id', () => {
        const timeSlots = [
            { id: '09:00-09:50', aliases: ['9:00-9:50'], startMinutes: 540, endMinutes: 590 },
            { id: '13:00-14:50', aliases: ['1:00-2:50'], startMinutes: 780, endMinutes: 890 }
        ];

        expect(utils.getTimeSlotIdFromInputs('09:00', '09:50', timeSlots)).toBe('09:00-09:50');
        expect(utils.getTimeSlotIdFromInputs('13:00', '14:50', timeSlots)).toBe('13:00-14:50');
        expect(utils.getTimeSlotRangeForId(timeSlots, '13:00-14:50')).toEqual({
            start: '13:00',
            end: '14:50'
        });
    });

    test('builds room options with display labels while preserving canonical values', () => {
        const options = utils.buildRoomOptions(
            ['Catalyst 193', 'CEB 105'],
            {
                'Catalyst 193': 'CAT 193',
                'CEB 105': 'CHN 105'
            },
            {
                includeBlank: true,
                includeOnline: true,
                preserveValue: 'ARRANGED',
                includeArranged: true
            }
        );

        expect(options).toEqual([
            { value: '', label: 'Select Room...' },
            { value: 'ONLINE', label: 'Online / Async' },
            { value: 'ARRANGED', label: 'Arranged' },
            { value: 'Catalyst 193', label: 'CAT 193' },
            { value: 'CEB 105', label: 'CHN 105' }
        ]);
    });
});
