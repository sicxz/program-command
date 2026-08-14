const fs = require('fs');
const path = require('path');
const vm = require('vm');
const AdvisingPathwayPlanner = require('../js/components/advising-pathway-planner.js');
const AdvisingController = require('../js/advising-controller.js');

const ROOT = path.resolve(__dirname, '..');

const LENSES = [
    ['animation-motion', 'Animation and Motion Design', 'approved'],
    ['game-design', 'Game Design', 'approved'],
    ['graphic-design', 'Graphic Design', 'approved'],
    ['interaction-design', 'Interaction Design', 'unresolved'],
    ['user-experience-design', 'User Experience Design', 'approved'],
    ['web-development', 'Web Development', 'approved'],
    ['photography', 'Photography', 'unresolved']
];

function loadActualCurriculum() {
    const sandbox = { console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
        fs.readFileSync(path.join(ROOT, 'js', 'advising-curriculum.js'), 'utf8'),
        sandbox,
        { filename: 'js/advising-curriculum.js' }
    );
    return sandbox.AdvisingCurriculum.normalize(
        JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'advising-curriculum.json'), 'utf8')),
        JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'course-catalog.json'), 'utf8'))
    );
}

function makeSnapshot() {
    return {
        curriculum: {
            year: '2026-27',
            name: 'Bachelor of Design',
            offeringEvidence: { asOf: '2026-08-14' },
            bdes: {
                creditsRequired: 95,
                fixedCredits: 50,
                electiveCredits: 40,
                reviewState: 'approved'
            },
            degreeRequirements: {
                totalCredits: 180,
                upperDivisionCredits: 60,
                minimumCumulativeGpa: 2.0,
                minimumMajorGpa: 2.5
            },
            courses: {}
        },
        lenses: LENSES.map(([id, name, reviewState]) => ({
            id,
            name,
            reviewState,
            issues: reviewState === 'approved' ? [] : [`${id}-source-review`]
        })),
        planningLimits: {
            startTerm: 'Fall',
            normalTerms: 12,
            extensionTerms: 6,
            maxCreditsPerTerm: 15,
            reviewState: 'approved'
        },
        sources: {
            'ewu-catalog': {
                id: 'ewu-catalog',
                label: 'EWU 2026-27 catalog',
                url: 'https://catalog.ewu.edu/stem/design/design-bdes/',
                version: '2026-27',
                capturedOn: '2026-08-11',
                reviewedOn: '2026-08-11',
                reviewState: 'approved'
            },
            'course-data': {
                id: 'course-data',
                label: 'Program Command course data',
                path: 'data/course-catalog.json',
                version: '2026-08-11',
                capturedOn: '2026-08-11',
                reviewState: 'approved'
            }
        },
        issues: []
    };
}

function makeResult(overrides = {}) {
    const result = {
        status: 'fits-normal-horizon',
        selectedLensIds: [],
        courses: [
            {
                code: 'DESN 100',
                title: 'Drawing for Communication',
                credits: 5,
                contributionIds: ['bdes'],
                sourceIds: ['ewu-catalog']
            },
            {
                code: 'DESN 338',
                title: 'User Experience Design 1',
                credits: 5,
                contributionIds: ['bdes', 'interaction-design', 'user-experience-design'],
                sourceIds: ['ewu-catalog']
            },
            {
                code: 'DESN 348',
                title: 'User Experience Design 2',
                credits: 5,
                contributionIds: ['interaction-design', 'user-experience-design'],
                sourceIds: ['ewu-catalog']
            },
            {
                code: 'DESN 490',
                title: 'Senior Capstone',
                credits: 5,
                contributionIds: ['bdes'],
                sourceIds: ['ewu-catalog']
            }
        ],
        terms: [
            { index: 0, year: 1, quarter: 'Fall', label: 'Fall, Year 1', isExtension: false, credits: 5, courseCodes: ['DESN 100'] },
            { index: 6, year: 3, quarter: 'Fall', label: 'Fall, Year 3', isExtension: false, credits: 5, courseCodes: ['DESN 338'] },
            { index: 7, year: 3, quarter: 'Winter', label: 'Winter, Year 3', isExtension: false, credits: 5, courseCodes: ['DESN 348'] },
            { index: 11, year: 4, quarter: 'Spring', label: 'Spring, Year 4', isExtension: false, credits: 5, courseCodes: ['DESN 490'] }
        ],
        unplaced: [],
        choiceGroups: [],
        electiveProgress: {
            requiredCredits: 40,
            contributedCredits: 10,
            openCredits: 30,
            contributingCourseCodes: ['DESN 338', 'DESN 348'],
            qualification: 'Named Design electives are provisional until DegreeWorks confirms official counting.'
        },
        ledger: [
            {
                id: 'planning-envelope',
                category: 'planning-assumption',
                message: 'Sequence uses the approved 15-credit Design/Art planning limit.',
                affected: ['All modeled terms'],
                sourceIds: ['course-data']
            }
        ],
        sources: makeSnapshot().sources,
        metrics: {
            normalTermCount: 12,
            extensionTermCount: 6,
            maxCreditsPerTerm: 15,
            overlapCourseCount: 2,
            totalCourses: 4
        }
    };
    return { ...result, ...overrides };
}

function mountPlanner() {
    const element = document.createElement('advising-pathway-planner');
    document.body.appendChild(element);
    return element;
}

function readyPlanner(result = makeResult()) {
    const element = mountPlanner();
    element.setCurriculum(makeSnapshot());
    element.setResult(result);
    return element;
}

function shadowText(element) {
    return element.shadowRoot.textContent.replace(/\s+/g, ' ').trim();
}

describe('<advising-pathway-planner>', () => {
    beforeEach(() => {
        AdvisingController.destroy();
        document.body.innerHTML = '';
        localStorage.clear();
    });

    afterEach(() => {
        AdvisingController.destroy();
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    test('registers safely with open Shadow DOM and starts in a loading state', () => {
        expect(customElements.get('advising-pathway-planner')).toBe(AdvisingPathwayPlanner);
        const element = mountPlanner();

        expect(element.shadowRoot).toBeTruthy();
        expect(shadowText(element)).toContain('Loading the advising model');
        expect(element.shadowRoot.querySelector('[aria-busy="true"]')).toBeTruthy();
    });

    test('shows a contained unavailable state without implying data was changed', () => {
        const element = mountPlanner();
        element.setUnavailable(new Error('Curriculum source could not be read.'));

        expect(element.shadowRoot.querySelector('[role="alert"]')).toBeTruthy();
        expect(shadowText(element)).toContain('Advising model unavailable');
        expect(shadowText(element)).toContain('Curriculum source could not be read.');
        expect(shadowText(element)).toContain('No schedule or student data was changed.');
    });

    test('renders the BDes baseline and seven readiness-labeled native lens buttons', () => {
        const element = readyPlanner();
        const buttons = element.shadowRoot.querySelectorAll('[data-lens-id]');

        expect(buttons).toHaveLength(7);
        expect(buttons[0].tagName).toBe('BUTTON');
        expect(buttons[0].type).toBe('button');
        expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
        expect(buttons[0].getAttribute('aria-label')).toContain('Source reviewed');
        expect(element.shadowRoot.querySelector('[data-lens-id="interaction-design"]').getAttribute('aria-label')).toContain('Advisor review required');
        expect(shadowText(element)).toContain('BDes baseline');
        expect(shadowText(element)).toContain('Always included');
    });

    test('derives lens readiness from required course facts in the actual curriculum', () => {
        const element = mountPlanner();
        element.setCurriculum(loadActualCurriculum());

        expect(element.shadowRoot.querySelector('[data-lens-id="web-development"]')
            .getAttribute('aria-label')).toContain('Advisor review required');
        expect(element.shadowRoot.querySelector('[data-lens-id="animation-motion"]')
            .getAttribute('aria-label')).toContain('Source reviewed');
    });

    test('emits a bubbling composed selection event for pointer or keyboard-compatible buttons', () => {
        const element = readyPlanner();
        const listener = jest.fn();
        document.body.addEventListener('advising-selection-change', listener);

        element.shadowRoot.querySelector('[data-lens-id="animation-motion"]').click();

        expect(listener).toHaveBeenCalledTimes(1);
        const event = listener.mock.calls[0][0];
        expect(event.detail).toEqual({ lensIds: ['animation-motion'] });
        expect(event.bubbles).toBe(true);
        expect(event.composed).toBe(true);
        expect(element.shadowRoot.querySelector('[data-lens-id="animation-motion"]').getAttribute('aria-pressed')).toBe('true');
    });

    test('enforces the three-lens cap and announces an attempted fourth selection', () => {
        const element = readyPlanner();
        const changes = [];
        element.addEventListener('advising-selection-change', (event) => changes.push(event.detail.lensIds));

        ['animation-motion', 'game-design', 'graphic-design'].forEach((id) => {
            element.shadowRoot.querySelector(`[data-lens-id="${id}"]`).click();
        });
        element.shadowRoot.querySelector('[data-lens-id="user-experience-design"]').click();

        expect(element.selectedLensIds).toEqual(['animation-motion', 'game-design', 'graphic-design']);
        expect(changes).toHaveLength(3);
        expect(element.shadowRoot.querySelector('[data-lens-id="user-experience-design"]').getAttribute('aria-disabled')).toBe('true');
        expect(element.shadowRoot.querySelector('#lensLimitMessage').textContent).toContain('up to three lenses');
    });

    test('clears optional lenses while keeping the BDes baseline', () => {
        const element = readyPlanner();
        const listener = jest.fn();
        element.addEventListener('advising-selection-change', listener);
        element.shadowRoot.querySelector('[data-lens-id="animation-motion"]').click();

        element.shadowRoot.querySelector('[data-clear-lenses]').click();

        expect(element.selectedLensIds).toEqual([]);
        expect(listener.mock.calls.at(-1)[0].detail).toEqual({ lensIds: [] });
        expect(shadowText(element)).toContain('BDes baseline');
        expect(shadowText(element)).toContain('Always included');
    });

    test('renders a shared course once with every contribution badge', () => {
        const element = readyPlanner(makeResult({ selectedLensIds: ['interaction-design', 'user-experience-design'] }));
        const cards = element.shadowRoot.querySelectorAll('[data-course-code="DESN 338"]');

        expect(cards).toHaveLength(1);
        const text = cards[0].textContent;
        expect(text).toContain('BDes baseline');
        expect(text).toContain('Interaction Design');
        expect(text).toContain('User Experience Design');
        expect(text).not.toContain('Source:');
        expect(cards[0].getAttribute('aria-label')).toContain('Fall, Year 3');
        expect(cards[0].getAttribute('aria-label')).toContain('contributes to');
    });

    test('removing one lens preserves focus, baseline courses, and other contributions', () => {
        const initial = makeResult({ selectedLensIds: ['interaction-design', 'user-experience-design'] });
        const element = readyPlanner(initial);
        element.addEventListener('advising-selection-change', (event) => {
            element.setResult(makeResult({
                selectedLensIds: event.detail.lensIds,
                courses: initial.courses.map((course) => ({
                    ...course,
                    contributionIds: course.contributionIds.filter((id) => id !== 'interaction-design')
                }))
            }));
        });
        const button = element.shadowRoot.querySelector('[data-lens-id="interaction-design"]');
        button.focus();

        button.click();

        expect(element.shadowRoot.activeElement.dataset.lensId).toBe('interaction-design');
        expect(element.shadowRoot.querySelector('[data-course-code="DESN 100"]')).toBeTruthy();
        expect(element.shadowRoot.querySelector('[data-course-code="DESN 338"]').textContent).toContain('User Experience Design');
        expect(element.shadowRoot.querySelector('[data-course-code="DESN 338"]').textContent).not.toContain('Interaction Design');
    });

    test.each([
        ['fits-normal-horizon', 'Fits the normal horizon'],
        ['requires-extension', 'Requires an extended horizon'],
        ['no-known-sequence', 'No known sequence'],
        ['advisor-review-required', 'Advisor review required']
    ])('renders the %s status banner and keeps the available sequence visible', (status, title) => {
        const element = readyPlanner(makeResult({ status }));

        expect(element.shadowRoot.querySelector(`[data-status="${status}"]`)).toBeTruthy();
        expect(shadowText(element)).toContain(title);
        expect(element.shadowRoot.querySelector('.sequence-section')).toBeTruthy();
        if (status === 'advisor-review-required') {
            expect(shadowText(element)).toContain('Working preview retained');
        }
    });

    test('labels a genuine extension with its actual term count', () => {
        const base = makeResult();
        const element = readyPlanner(makeResult({
            status: 'requires-extension',
            courses: [
                ...base.courses,
                { code: 'DESN 499', title: 'Independent Study', credits: 5, contributionIds: ['bdes'] }
            ],
            terms: [
                ...base.terms,
                { index: 12, year: 5, quarter: 'Fall', label: 'Fall, Year 5', isExtension: true, credits: 5, courseCodes: ['DESN 499'] }
            ],
            metrics: { ...base.metrics, totalPlannedCredits: 180, degreeCreditsRequired: 180 }
        }));
        const text = shadowText(element);

        expect(text).toContain('180-credit / 13-term worksheet with extension');
        expect(text).toContain('13-quarter worksheet with extension');
        expect(text).not.toContain('Complete 12-quarter worksheet');
    });

    test('uses nested year and quarter lists with chronological, accessible course cards', () => {
        const element = readyPlanner();
        const yearList = element.shadowRoot.querySelector('ol.year-list');
        const quarterList = yearList.querySelector('ol.quarter-list');
        const labels = [...element.shadowRoot.querySelectorAll('.course-card')].map((card) => card.getAttribute('aria-label'));

        expect(yearList).toBeTruthy();
        expect(quarterList).toBeTruthy();
        expect(shadowText(element)).toContain('Assumed start');
        expect(labels.every((label) => label.includes('contributes to'))).toBe(true);
        expect(labels[0]).toContain('DESN 100');
        expect(labels[0]).toContain('Fall, Year 1');
    });

    test('renders a complete 12-quarter worksheet with external placeholders', () => {
        const base = makeResult();
        const element = readyPlanner(makeResult({
            courses: [
                ...base.courses,
                {
                    id: 'GEN-ED-COMP',
                    code: 'GEN-ED-COMP',
                    title: 'Composition requirement',
                    credits: 5,
                    termIndex: 1,
                    placeholder: true,
                    kind: 'gen-ed',
                    external: true,
                    reviewState: 'advisor-review-required',
                    sourceIds: ['ewu-catalog']
                }
            ],
            terms: [
                ...base.terms,
                { index: 1, year: 1, quarter: 'Winter', label: 'Winter, Year 1', credits: 5, courseCodes: ['GEN-ED-COMP'] }
            ]
        }));

        expect(element.shadowRoot.querySelectorAll('.quarter-card')).toHaveLength(12);
        const placeholder = element.shadowRoot.querySelector('[data-course-code="GEN-ED-COMP"]');
        expect(placeholder.classList.contains('placeholder-card')).toBe(true);
        expect(placeholder.textContent).toContain('General education placeholder');
        expect(placeholder.textContent).toContain('confirm the student-specific requirement in DegreeWorks');
        expect(placeholder.getAttribute('aria-label')).toContain('General education placeholder planning placeholder');
        expect(shadowText(element)).toContain('Complete 12-quarter worksheet');
    });

    test('labels a credit gap when unresolved coursework cannot be placed', () => {
        const base = makeResult();
        const element = readyPlanner(makeResult({
            status: 'advisor-review-required',
            unplaced: [{ code: 'DESN 351', title: 'Publication Design', credits: 5 }],
            metrics: {
                ...base.metrics,
                totalPlannedCredits: 175,
                degreeCreditsRequired: 180
            }
        }));
        const text = shadowText(element);

        expect(text).toContain('175 of 180 credits placed');
        expect(text).toContain('12-quarter worksheet with unplaced coursework');
        expect(text).not.toContain('Complete 12-quarter worksheet');
    });

    test('distinguishes BDes elective slots from open degree credit placeholders', () => {
        const base = makeResult();
        const element = readyPlanner(makeResult({
            courses: [
                ...base.courses,
                { code: 'BDES-ELECTIVE-1', title: 'BDes elective space', credits: 5, placeholder: true, kind: 'open-elective', subtype: 'bdes-elective' },
                { code: 'DEGREE-OPEN-1', title: 'Open degree space', credits: 5, placeholder: true, kind: 'open-elective', category: 'open-degree' }
            ],
            terms: [
                ...base.terms,
                { index: 1, year: 1, quarter: 'Winter', courseCodes: ['BDES-ELECTIVE-1'] },
                { index: 2, year: 1, quarter: 'Spring', courseCodes: ['DEGREE-OPEN-1'] }
            ]
        }));

        expect(element.shadowRoot.querySelector('[data-course-code="BDES-ELECTIVE-1"]').textContent).toContain('BDes elective slot');
        expect(element.shadowRoot.querySelector('[data-course-code="DEGREE-OPEN-1"]').textContent).toContain('Open degree credit');
    });

    test('supports keyboard moves without persistence and flags the layout for advisor review', () => {
        const storageWrite = jest.spyOn(Storage.prototype, 'setItem');
        window.StateManager = { set: jest.fn() };
        const element = readyPlanner();
        const firstTerm = element.shadowRoot.querySelector('[data-term-index="0"]');
        const nextButton = firstTerm.querySelector('[data-course-code="DESN 100"] [data-focus-key="move-DESN 100-next"]');
        nextButton.focus();

        nextButton.click();

        expect(element.shadowRoot.querySelector('[data-term-index="0"] [data-course-code="DESN 100"]')).toBeFalsy();
        const movedCard = element.shadowRoot.querySelector('[data-term-index="1"] [data-course-code="DESN 100"]');
        expect(movedCard.classList.contains('manually-moved')).toBe(true);
        expect(movedCard.textContent).toContain('require advisor review');
        expect(element.shadowRoot.querySelector('.manual-move-notice').textContent).toContain('temporary and unsaved');
        expect(element.shadowRoot.querySelector('.status-banner').textContent).toContain('status describes the planner-generated sequence');
        expect(element.shadowRoot.activeElement.dataset.focusKey).toBe('move-DESN 100-next');
        expect(storageWrite).not.toHaveBeenCalled();
        expect(window.StateManager.set).not.toHaveBeenCalled();

        element.shadowRoot.querySelector('[data-reset-moves]').click();
        expect(element.shadowRoot.querySelector('[data-term-index="0"] [data-course-code="DESN 100"]')).toBeTruthy();
        expect(element.shadowRoot.querySelector('.manual-move-notice')).toBeFalsy();
        expect(element.shadowRoot.activeElement.dataset.courseCode).toBe('DESN 100');
        delete window.StateManager;
    });

    test('names a historically unsupported target quarter after a manual move', () => {
        const base = makeResult();
        const element = readyPlanner(makeResult({
            courses: [
                ...base.courses,
                {
                    code: 'DESN 326',
                    title: 'Digital Photography',
                    credits: 5,
                    offeredQuarters: ['Fall', 'Winter'],
                    contributionIds: ['photography'],
                    sourceIds: ['course-data']
                }
            ],
            terms: [
                ...base.terms,
                { index: 1, year: 1, quarter: 'Winter', label: 'Winter, Year 1', credits: 5, courseCodes: ['DESN 326'] }
            ]
        }));

        element.shadowRoot.querySelector('[data-course-code="DESN 326"] [data-focus-key="move-DESN 326-next"]').click();

        const movedCard = element.shadowRoot.querySelector('[data-term-index="2"] [data-course-code="DESN 326"]');
        expect(movedCard.textContent).toContain('Not historically offered in Spring; chair review required.');
    });

    test('supports ephemeral drag-and-drop between quarter columns', () => {
        const element = readyPlanner();
        const sourceCard = element.shadowRoot.querySelector('[data-term-index="0"] [data-course-code="DESN 100"]');
        const targetTerm = element.shadowRoot.querySelector('[data-term-index="2"]');
        const transfer = {
            value: '',
            effectAllowed: '',
            dropEffect: '',
            setData(type, value) { this.value = value; },
            getData() { return this.value; }
        };
        const dragStart = new Event('dragstart', { bubbles: true });
        Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
        sourceCard.dispatchEvent(dragStart);
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: transfer });

        targetTerm.dispatchEvent(drop);

        expect(element.shadowRoot.querySelector('[data-term-index="2"] [data-course-code="DESN 100"]')).toBeTruthy();
        expect(shadowText(element)).toContain('Advisor review required after 1 move');
    });

    test('lets an advisor place unplaced coursework by keyboard control or drag and restore it', () => {
        const base = makeResult();
        const unplacedCourse = {
            code: 'DESN 469',
            title: 'Web Development 3',
            credits: 5,
            offeredQuarters: [],
            offeringReviewState: 'unresolved',
            contributionIds: ['web-development']
        };
        const element = readyPlanner(makeResult({
            status: 'advisor-review-required',
            courses: [...base.courses, unplacedCourse],
            unplaced: [{ ...unplacedCourse, reason: 'missing-offering-pattern' }],
            metrics: { ...base.metrics, totalPlannedCredits: 175, degreeCreditsRequired: 180 }
        }));

        const select = element.shadowRoot.querySelector('[data-course-code="DESN 469"] [data-place-course]');
        expect(select).toBeTruthy();
        expect(select.closest('.course-card').draggable).toBe(true);
        select.focus();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(element.shadowRoot.querySelector('.unplaced-section [data-course-code="DESN 469"]')).toBeTruthy();
        select.value = '2';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        expect(element.shadowRoot.querySelector('[data-term-index="2"] [data-course-code="DESN 469"]')).toBeTruthy();
        expect(element.shadowRoot.activeElement.dataset.courseCode).toBe('DESN 469');
        expect(shadowText(element)).toContain('Prerequisites, offerings, standing, and credit limits require advisor review.');

        element.shadowRoot.querySelector('[data-reset-moves]').click();
        const sourceCard = element.shadowRoot.querySelector('.unplaced-section [data-course-code="DESN 469"]');
        const targetTerm = element.shadowRoot.querySelector('[data-term-index="1"]');
        const transfer = {
            value: '',
            effectAllowed: '',
            dropEffect: '',
            setData(type, value) { this.value = value; },
            getData() { return this.value; }
        };
        const dragStart = new Event('dragstart', { bubbles: true });
        Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
        sourceCard.dispatchEvent(dragStart);
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: transfer });
        targetTerm.dispatchEvent(drop);

        expect(element.shadowRoot.querySelector('[data-term-index="1"] [data-course-code="DESN 469"]')).toBeTruthy();
    });

    test('renders unplaced coursework, choose-N alternatives, and a traceable expandable ledger', () => {
        const result = makeResult({
            status: 'advisor-review-required',
            selectedLensIds: ['graphic-design'],
            courses: [
                ...makeResult().courses,
                { code: 'DESN 458', title: 'User Experience Design 3', credits: 5, contributionIds: ['graphic-design'], sourceIds: ['ewu-catalog'] }
            ],
            unplaced: [
                { code: 'DESN 458', title: 'User Experience Design 3', reason: 'external-condition', affected: ['DESN 458'], sourceIds: ['ewu-catalog'] }
            ],
            choiceGroups: [
                {
                    id: 'graphic-electives',
                    label: 'Graphic Design electives',
                    count: 2,
                    selectedCourseCodes: ['DESN 305', 'DESN 343'],
                    remainingCourseCodes: ['DESN 360', 'DESN 366'],
                    sourceIds: ['ewu-catalog']
                }
            ],
            ledger: [
                {
                    id: 'interaction-source-conflict',
                    category: 'unresolved-authority',
                    message: 'Catalog HTML and PDF publish different requirements.',
                    rule: 'Confirm the Interaction Design requirement set.',
                    affected: ['DESN 458', 'Interaction Design'],
                    owner: 'Department curriculum owner',
                    approvalNeeded: 'Approved source version and review date',
                    sourceIds: ['ewu-catalog']
                }
            ]
        });
        const element = readyPlanner(result);

        expect(element.shadowRoot.querySelector('.unplaced-section [data-course-code="DESN 458"]')).toBeTruthy();
        expect(shadowText(element)).toContain('Why unplaced: external-condition');
        expect(shadowText(element)).toContain('Planner-selected provisional alternatives');
        expect(shadowText(element)).toContain('DESN 305');
        expect(shadowText(element)).toContain('Remaining approved alternatives');
        expect(shadowText(element)).toContain('DESN 360');
        const ledger = element.shadowRoot.querySelector('[data-classification="unresolved-authority"]');
        expect(ledger.tagName).toBe('DETAILS');
        expect(ledger.textContent).toContain('DESN 458');
        expect(ledger.textContent).toContain('EWU 2026-27 catalog');
        expect(ledger.textContent).toContain('Department curriculum owner');
    });

    test('qualifies overlap, reports elective progress, and names catalog and offering dates', () => {
        const element = readyPlanner();
        const text = shadowText(element);

        expect(text).toContain('Generic 2026–27 model');
        expect(text).toContain('2026-27 catalog model');
        expect(text).toContain('Usual offerings as of 2026-08-14');
        expect(text).toContain('10 of 40 credits contributed');
        expect(text).toContain('30 credits remain open');
        expect(text).toContain('180-credit / 12-term worksheet');
        expect(text).toContain('60-credit upper-division requirement');
        expect(text).toContain('do not prove this total');
        expect(text).toContain('does not guarantee official double-counting');
        expect(text).toContain('Not modeled: individual course history');
    });

    test('uses the exact safe InsideEWU handoff and safe source links', () => {
        const element = readyPlanner();
        const links = [...element.shadowRoot.querySelectorAll('a')];
        const degreeworksLinks = links.filter((link) => link.textContent.includes('Open InsideEWU for DegreeWorks'));

        expect(degreeworksLinks.length).toBeGreaterThan(0);
        degreeworksLinks.forEach((link) => {
            expect(link.href).toBe('https://inside.ewu.edu/');
            expect(link.target).toBe('_blank');
            expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
        });
        const sourceLink = links.find((link) => link.textContent.includes('EWU 2026-27 catalog'));
        expect(sourceLink.protocol).toBe('https:');
        expect(sourceLink.rel).toContain('noopener');
    });

    test('collapses the chair-facing Data sources register by default', () => {
        const element = readyPlanner();
        const disclosure = element.shadowRoot.querySelector('details.data-sources-disclosure');

        expect(disclosure).toBeTruthy();
        expect(disclosure.open).toBe(false);
        expect(disclosure.querySelector('summary').textContent).toContain('Data sources');
        expect(disclosure.querySelector('.data-sources-body').textContent).toContain('EWU 2026-27 catalog');
    });

    test('keeps selection ephemeral without StateManager or localStorage writes', () => {
        const storageWrite = jest.spyOn(Storage.prototype, 'setItem');
        window.StateManager = { set: jest.fn() };
        const element = readyPlanner();

        element.shadowRoot.querySelector('[data-lens-id="animation-motion"]').click();
        element.shadowRoot.querySelector('[data-clear-lenses]').click();

        expect(storageWrite).not.toHaveBeenCalled();
        expect(window.StateManager.set).not.toHaveBeenCalled();
        delete window.StateManager;
    });
});

describe('AdvisingController', () => {
    beforeEach(() => {
        AdvisingController.destroy();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        AdvisingController.destroy();
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    test('loads curriculum, plans BDes, and replans from the component selection event', async () => {
        const snapshot = makeSnapshot();
        const curriculumService = { load: jest.fn().mockResolvedValue(snapshot) };
        const planner = {
            plan: jest.fn((receivedSnapshot, lensIds) => makeResult({ selectedLensIds: lensIds }))
        };
        const element = mountPlanner();

        const initialized = await AdvisingController.init({ element, curriculumService, planner });
        element.shadowRoot.querySelector('[data-lens-id="animation-motion"]').click();

        expect(initialized.snapshot).toBe(snapshot);
        expect(curriculumService.load).toHaveBeenCalledWith(undefined);
        expect(planner.plan).toHaveBeenNthCalledWith(1, snapshot, [], undefined);
        expect(planner.plan).toHaveBeenNthCalledWith(2, snapshot, ['animation-motion'], undefined);
        expect(element.selectedLensIds).toEqual(['animation-motion']);
    });

    test('opens and closes the modal workspace with focus returned to the launcher', async () => {
        document.body.innerHTML = `
            <button type="button" id="openAdvisingWorkspace">Advising</button>
            <dialog id="advisingWorkspaceDialog">
                <button type="button" id="closeAdvisingWorkspace">Close</button>
                <advising-pathway-planner></advising-pathway-planner>
            </dialog>`;
        const element = document.querySelector('advising-pathway-planner');
        const openButton = document.getElementById('openAdvisingWorkspace');
        const closeButton = document.getElementById('closeAdvisingWorkspace');
        const dialog = document.getElementById('advisingWorkspaceDialog');
        const curriculumService = { load: jest.fn().mockResolvedValue(makeSnapshot()) };
        const planner = { plan: jest.fn(() => makeResult()) };

        await AdvisingController.init({ element, curriculumService, planner });
        openButton.focus();
        openButton.click();

        expect(dialog.hasAttribute('open')).toBe(true);
        expect(document.body.classList.contains('advising-workspace-open')).toBe(true);
        expect(document.activeElement).toBe(closeButton);

        closeButton.click();

        expect(dialog.hasAttribute('open')).toBe(false);
        expect(document.body.classList.contains('advising-workspace-open')).toBe(false);
        expect(document.activeElement).toBe(openButton);
    });

    test('keeps the modal launcher working when the host page replaces the button', async () => {
        document.body.innerHTML = `
            <div id="scheduleActions"><button type="button" id="openAdvisingWorkspace">Advising</button></div>
            <dialog id="advisingWorkspaceDialog">
                <button type="button" id="closeAdvisingWorkspace">Close</button>
                <advising-pathway-planner></advising-pathway-planner>
            </dialog>`;
        const element = document.querySelector('advising-pathway-planner');
        const dialog = document.getElementById('advisingWorkspaceDialog');
        const closeButton = document.getElementById('closeAdvisingWorkspace');
        const curriculumService = { load: jest.fn().mockResolvedValue(makeSnapshot()) };
        const planner = { plan: jest.fn(() => makeResult()) };

        await AdvisingController.init({ element, curriculumService, planner });
        document.getElementById('scheduleActions').innerHTML =
            '<button type="button" id="openAdvisingWorkspace">Advising</button>';
        const replacementButton = document.getElementById('openAdvisingWorkspace');

        replacementButton.click();
        expect(dialog.hasAttribute('open')).toBe(true);

        closeButton.click();
        expect(dialog.hasAttribute('open')).toBe(false);
        expect(document.activeElement).toBe(replacementButton);
    });

    test('turns a loading failure into an unavailable panel', async () => {
        const element = mountPlanner();
        const curriculumService = { load: jest.fn().mockRejectedValue(new Error('Snapshot fetch failed.')) };
        const planner = { plan: jest.fn() };

        await AdvisingController.init({ element, curriculumService, planner });

        expect(shadowText(element)).toContain('Advising model unavailable');
        expect(shadowText(element)).toContain('Snapshot fetch failed.');
        expect(planner.plan).not.toHaveBeenCalled();
    });
});
