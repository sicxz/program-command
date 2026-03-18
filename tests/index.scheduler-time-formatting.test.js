const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, name) {
    const signature = `function ${name}(`;
    const start = source.indexOf(signature);
    if (start === -1) {
        throw new Error(`Could not find function ${name}`);
    }

    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }

    throw new Error(`Could not extract function ${name}`);
}

function loadSchedulerTimeHelpers() {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const sandbox = {
        getSchedulerTimeSlotByAlias: jest.fn(() => null),
        getSchedulerTimeSlots: jest.fn(() => []),
        document: {
            getElementById: jest.fn(() => null)
        }
    };

    vm.createContext(sandbox);
    [
        'formatSchedulerClockTime',
        'formatSchedulerTimeRange',
        'getSchedulerTimeSlotDisplayText',
        'parseSchedulerClockValueToMinutes',
        'getSchedulerTimeSlotForClockInputs'
    ].forEach((name) => {
        const fnSource = extractFunction(source, name);
        vm.runInContext(fnSource, sandbox, { filename: `index.html#${name}` });
    });

    return { sandbox, source };
}

describe('index scheduler time formatting', () => {
    test('formats canonical scheduler ranges in 12-hour time', () => {
        const { sandbox } = loadSchedulerTimeHelpers();

        expect(sandbox.formatSchedulerTimeRange('10:00-12:20')).toBe('10:00 AM - 12:20 PM');
        expect(sandbox.formatSchedulerTimeRange('13:00-15:20')).toBe('1:00 PM - 3:20 PM');
        expect(sandbox.formatSchedulerTimeRange('16:00-18:20')).toBe('4:00 PM - 6:20 PM');
    });

    test('uses configured slot labels when building display text', () => {
        const { sandbox } = loadSchedulerTimeHelpers();
        sandbox.getSchedulerTimeSlotByAlias.mockReturnValue({ label: '13:00-15:20' });

        expect(sandbox.getSchedulerTimeSlotDisplayText('13:00-15:20')).toBe('1:00 PM - 3:20 PM');
    });

    test('maps start and end clock inputs to the configured 2h20 scheduler slot', () => {
        const { sandbox } = loadSchedulerTimeHelpers();
        sandbox.getSchedulerTimeSlots.mockReturnValue([
            { id: '10:00-12:20', startMinutes: 600, endMinutes: 740 },
            { id: '13:00-15:20', startMinutes: 780, endMinutes: 920 },
            { id: '16:00-18:20', startMinutes: 960, endMinutes: 1100 }
        ]);

        const slot = sandbox.getSchedulerTimeSlotForClockInputs('10:00', '12:20');
        expect(slot && slot.id).toBe('10:00-12:20');
    });

    test('add-course form offers 2h20 end times', () => {
        const { source } = loadSchedulerTimeHelpers();

        expect(source).toContain('<option value="12:20">12:20 PM</option>');
        expect(source).toContain('<option value="15:20">3:20 PM</option>');
        expect(source).toContain('<option value="18:20">6:20 PM</option>');
    });
});
