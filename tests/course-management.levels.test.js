const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'pages', 'course-management.html'), 'utf8');
const script = fs.readFileSync(path.join(repoRoot, 'pages', 'course-management.js'), 'utf8');

function selectOptions(selectId) {
    const page = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(page.querySelectorAll(`#${selectId} option`)).map((option) => ({
        value: option.getAttribute('value'),
        label: option.textContent.trim()
    }));
}

// Runs the page controller against a stub document so its helpers can be called
// without Supabase. Elements are looked up from the sandbox's "elements" map.
function createPageSandbox() {
    const elements = {};
    const sandbox = {
        console,
        elements,
        document: {
            addEventListener() {},
            getElementById: (id) => elements[id] || null
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    vm.runInContext('renderCatalogTable = () => {}', sandbox);
    return sandbox;
}

const NUMERIC_LEVEL_OPTIONS = [
    { value: '100', label: '100-level' },
    { value: '200', label: '200-level' },
    { value: '300', label: '300-level' },
    { value: '400', label: '400-level' }
];

describe('Course Management course levels', () => {
    test('the level filter and the edit form use the numeric scheme the data stores', () => {
        expect(selectOptions('levelFilter')).toEqual([{ value: '', label: 'All Levels' }, ...NUMERIC_LEVEL_OPTIONS]);
        expect(selectOptions('courseLevel')).toEqual(NUMERIC_LEVEL_OPTIONS);
        expect(html).not.toMatch(/value="(intro|intermediate|advanced|graduate)"/);
    });

    test('a row saved with an empty or legacy level resolves to the level its code implies', () => {
        const sandbox = createPageSandbox();
        const resolve = (course) => vm.runInContext(`resolveCourseLevel(${JSON.stringify(course)})`, sandbox);

        expect(resolve({ code: 'DESN 374', level: '300' })).toBe('300');
        expect(resolve({ code: 'DESN 374', level: '' })).toBe('300');
        expect(resolve({ code: 'DESN 374', level: 'intermediate' })).toBe('300');
        expect(resolve({ code: 'DESN 100', level: null })).toBe('100');
        expect(resolve({ code: 'DESN 499X' })).toBe('400');
        expect(resolve({ code: '' })).toBe('');
    });

    test('the level filter matches numeric levels and derives one for rows without it', () => {
        const sandbox = createPageSandbox();
        sandbox.elements.catalogSearch = { value: '' };
        sandbox.elements.levelFilter = { value: '300' };

        const filtered = Array.from(vm.runInContext(`
            courses = [
                { code: 'DESN 243', title: 'Typography', level: '200' },
                { code: 'DESN 374', title: 'Applied AI', level: '300' },
                { code: 'DESN 368', title: 'Web Design + Code 1', level: '' },
                { code: 'DESN 490', title: 'Senior Capstone', level: 'advanced' }
            ];
            filterCatalog();
            filteredCourses.map((course) => course.code)
        `, sandbox));

        expect(filtered).toEqual(['DESN 374', 'DESN 368']);
    });

    test('saving a course without a level choice writes the level its code implies', () => {
        const sandbox = createPageSandbox();
        expect(vm.runInContext("deriveCourseLevel('DESN 374')", sandbox)).toBe('300');
        expect(vm.runInContext("deriveCourseLevel('desn368')", sandbox)).toBe('300');
        expect(vm.runInContext("deriveCourseLevel('DESN 5XX')", sandbox)).toBe('');
        expect(script).toContain("level: document.getElementById('courseLevel').value || deriveCourseLevel(code)");
    });
});
