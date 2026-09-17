const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'program-command.html'), 'utf8');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Could not find ${name}`);

    const bodyStart = source.indexOf(') {', start) + 2;
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not find the end of ${name}`);
}

function createHarness() {
    const roomLabels = html.match(/const SCHEDULE_VIEW_ROOM_LABELS = \{[\s\S]*?\n\s*\};/);
    if (!roomLabels) throw new Error('Schedule view room labels were not found');

    const sandbox = {
        getSchedulerRoomHeaderLabel: jest.fn((roomCode) => roomCode)
    };
    vm.createContext(sandbox);
    return vm.runInContext(
        `${roomLabels[0]}\n${extractFunction(html, 'getScheduleViewRoomHeaderLabel')}\n` +
            '({ getScheduleViewRoomHeaderLabel })',
        sandbox
    );
}

describe('Program Command schedule view headers', () => {
    const harness = createHarness();

    test('includes room codes in the 2026-27 Isle Hall headers', () => {
        const roomOrder = ['ISL 156', 'ISL 154', 'ISL 155', 'ISL 101', 'CEB 102', 'CEB 104'];

        expect(roomOrder.map(harness.getScheduleViewRoomHeaderLabel)).toEqual([
            'ISL 156 | UX Lab',
            'ISL 154 | Motion Lab',
            'ISL 155 | Mac Lab',
            'ISL 101 | Design Lab',
            'CEB 102 | Mac Lab',
            'CEB 104 | Design Lab'
        ]);
    });

    test('includes room codes in the 2025-26 Catalyst headers', () => {
        const roomOrder = ['206', '209', '210', '212', 'CEB 102', 'CEB 104'];

        expect(roomOrder.map(harness.getScheduleViewRoomHeaderLabel)).toEqual([
            '206 | UX Lab',
            '209 | Motion Lab',
            '210 | Mac Lab',
            '212 | Design Lab',
            'CEB 102 | Mac Lab',
            'CEB 104 | Design Lab'
        ]);
    });

    test('includes the A.Hughes faculty color mapping and CSS rule', () => {
        expect(html).toContain("'A.Hughes': { class: 'faculty-hughes'");
        expect(html).toContain('.faculty-hughes {');
    });
});
