const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadPlanner() {
    const source = fs.readFileSync(path.join(ROOT, 'js/advising-planner.js'), 'utf8');
    const sandbox = {
        module: { exports: {} },
        exports: {},
        console
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/advising-planner.js' });
    return sandbox.module.exports;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function course(code, overrides = {}) {
    return {
        code,
        title: `${code} title`,
        credits: 5,
        offeredQuarters: ['Fall', 'Winter', 'Spring'],
        prerequisites: [],
        corequisites: [],
        external: false,
        sourceIds: ['course-source'],
        reviewState: 'approved',
        ...overrides
    };
}

function group(id, courses, overrides = {}) {
    return {
        id,
        label: `${id} label`,
        type: 'all-of',
        courses,
        sourceIds: ['curriculum-source'],
        reviewState: 'approved',
        ...overrides
    };
}

function lens(id, groups, overrides = {}) {
    return {
        id,
        name: `${id} lens`,
        kind: 'minor',
        credits: 15,
        requirementGroups: groups,
        supportRequirements: [],
        sourceIds: ['curriculum-source'],
        reviewState: 'approved',
        issues: [],
        ...overrides
    };
}

function withDegreeRequirements(snapshot) {
    snapshot.curriculum.bdes.electivePlaceholder = {
        idPrefix: 'bdes-elective',
        label: 'BDes elective choice',
        credits: 5,
        count: 8,
        kind: 'major-elective',
        sourceIds: ['curriculum-source'],
        reviewState: 'approved'
    };
    snapshot.curriculum.degreeRequirements = {
        totalCredits: 180,
        upperDivisionCredits: 60,
        minimumCumulativeGpa: 2,
        minimumMajorGpa: 2.5,
        overlapPolicy: 'one-course-one-slot',
        placeholders: [
            {
                id: 'english-composition',
                label: 'English composition',
                credits: 5,
                kind: 'gen-ed',
                category: 'english',
                sourceIds: ['curriculum-source'],
                reviewState: 'approved',
                degreeWorksVerification: true,
                satisfiedByCourseCodes: [],
                representsCourseCodes: [],
                prerequisitePlaceholderIds: []
            },
            {
                id: 'english-analysis-research',
                label: 'English analysis, research, and documentation',
                credits: 5,
                kind: 'gen-ed',
                category: 'english',
                sourceIds: ['curriculum-source'],
                reviewState: 'approved',
                degreeWorksVerification: true,
                satisfiedByCourseCodes: [],
                representsCourseCodes: ['ENGL 201'],
                prerequisitePlaceholderIds: ['english-composition']
            },
            {
                id: 'humanities-1',
                label: 'Humanities choice 1',
                credits: 5,
                kind: 'gen-ed',
                category: 'humanities',
                sourceIds: ['curriculum-source'],
                reviewState: 'approved',
                degreeWorksVerification: true,
                satisfiedByCourseCodes: ['DESN 100'],
                representsCourseCodes: [],
                prerequisitePlaceholderIds: []
            },
            {
                id: 'humanities-2',
                label: 'Humanities choice 2',
                credits: 5,
                kind: 'gen-ed',
                category: 'humanities',
                sourceIds: ['curriculum-source'],
                reviewState: 'approved',
                degreeWorksVerification: true,
                satisfiedByCourseCodes: ['DESN 100'],
                representsCourseCodes: [],
                prerequisitePlaceholderIds: []
            }
        ],
        openDegreeCredits: {
            idPrefix: 'open-degree-credit',
            label: 'Open degree credit',
            creditsPerSlot: 5,
            kind: 'open-elective',
            calculation: 'remainder-to-total',
            sourceIds: ['curriculum-source'],
            reviewState: 'approved'
        }
    };
    return snapshot;
}

function makeSnapshot(overrides = {}) {
    const courses = {
        'DESN 100': course('DESN 100'),
        'DESN 200': course('DESN 200', { prerequisites: ['DESN 100'] }),
        'DESN 300': course('DESN 300', { prerequisites: ['DESN 200'] }),
        'DESN 310': course('DESN 310'),
        'DESN 320': course('DESN 320'),
        'DESN 330': course('DESN 330'),
        'DESN 340': course('DESN 340')
    };
    const snapshot = {
        curriculum: {
            year: '2026-27',
            name: 'BDes fixture',
            bdes: {
                creditsRequired: 50,
                fixedCredits: 10,
                electiveCredits: 40,
                requirementGroups: [group('bdes-fixed', ['DESN 100', 'DESN 200'])],
                electiveCourseCodes: ['DESN 300', 'DESN 310', 'DESN 320', 'DESN 330', 'DESN 340'],
                supportRequirements: [],
                sourceIds: ['curriculum-source'],
                reviewState: 'approved'
            },
            courses
        },
        lenses: [
            lens('alpha', [group('alpha-required', ['DESN 200', 'DESN 300'])]),
            lens('beta', [group('beta-required', ['DESN 300', 'DESN 310'])]),
            lens('gamma', [group('gamma-required', ['DESN 320'])]),
            lens('delta', [group('delta-required', ['DESN 330'])])
        ],
        sources: {
            'course-source': { id: 'course-source', label: 'Course facts' },
            'curriculum-source': { id: 'curriculum-source', label: 'Curriculum facts' },
            'limit-source': { id: 'limit-source', label: 'Planning limits' }
        },
        planningLimits: {
            startTerm: 'Fall',
            terms: ['Fall', 'Winter', 'Spring'],
            normalTerms: 12,
            extensionTerms: 6,
            maxCreditsPerTerm: 15,
            maxSearchNodes: 50000,
            standingStarts: { sophomore: 3, junior: 6, senior: 9 },
            sourceIds: ['limit-source'],
            reviewState: 'approved'
        },
        issues: []
    };

    if (overrides.curriculum) {
        snapshot.curriculum = { ...snapshot.curriculum, ...overrides.curriculum };
        if (overrides.curriculum.bdes) {
            snapshot.curriculum.bdes = {
                ...makeSnapshot().curriculum.bdes,
                ...overrides.curriculum.bdes
            };
        }
        if (overrides.curriculum.courses) {
            snapshot.curriculum.courses = overrides.curriculum.courses;
        }
    }
    Object.keys(overrides).filter(key => key !== 'curriculum').forEach(key => {
        snapshot[key] = overrides[key];
    });
    return snapshot;
}

describe('AdvisingPlanner', () => {
    const AdvisingPlanner = loadPlanner();

    test('returns the exact result contract and a partial BDes baseline with open electives', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.bdes.electiveCourseCodes.push('DESN 200');
        const result = AdvisingPlanner.plan(snapshot, []);

        expect(Object.keys(result)).toEqual([
            'status',
            'selectedLensIds',
            'courses',
            'terms',
            'unplaced',
            'choiceGroups',
            'electiveProgress',
            'ledger',
            'sources',
            'metrics'
        ]);
        expect(result.status).toBe('fits-normal-horizon');
        expect(result.selectedLensIds).toEqual([]);
        expect(result.courses.map(item => item.code)).toEqual(['DESN 100', 'DESN 200']);
        expect(result.terms).toHaveLength(12);
        expect(result.terms[0]).toMatchObject({ year: 1, quarter: 'Fall', isExtension: false });
        expect(result.electiveProgress).toMatchObject({
            requiredCredits: 40,
            contributedCredits: 0,
            openCredits: 40,
            contributingCourseCodes: []
        });
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'open-electives' }),
            expect.objectContaining({ category: 'planning-assumption' })
        ]));
    });

    test('deduplicates overlap and retains every contribution ID', () => {
        const result = AdvisingPlanner.plan(makeSnapshot(), ['alpha', 'beta']);
        const shared = result.courses.find(item => item.code === 'DESN 300');

        expect(result.status).toBe('fits-normal-horizon');
        expect(result.courses.filter(item => item.code === 'DESN 300')).toHaveLength(1);
        expect(shared.contributionIds).toEqual(['alpha', 'beta']);
        expect(result.courses.find(item => item.code === 'DESN 200').contributionIds).toEqual([
            'alpha',
            'bdes',
            'beta'
        ]);
        expect(result.metrics.overlapCourseCount).toBe(3);
        expect(result.electiveProgress).toMatchObject({ contributedCredits: 10, openCredits: 30 });
    });

    test('builds a complete 12-quarter worksheet with distinct placeholder pools', () => {
        const snapshot = withDegreeRequirements(makeSnapshot());
        snapshot.curriculum.courses['DESN 200'] = course('DESN 200', { prerequisites: ['ENGL 201'] });
        snapshot.curriculum.courses['ENGL 201'] = course('ENGL 201', {
            external: true,
            conditionOnly: true,
            prerequisites: [],
            sourceIds: ['curriculum-source']
        });

        const result = AdvisingPlanner.plan(snapshot, []);
        const placeholders = result.courses.filter(item => item.placeholder);
        const composition = placeholders.find(item => item.code === 'english-composition');
        const analysis = placeholders.find(item => item.code === 'english-analysis-research');
        const desn200 = result.courses.find(item => item.code === 'DESN 200');

        expect(result.status).toBe('fits-normal-horizon');
        expect(result.terms).toHaveLength(12);
        expect(result.terms.reduce((sum, term) => sum + term.credits, 0)).toBe(180);
        result.terms.forEach(term => expect(term.credits).toBeLessThanOrEqual(15));
        expect(result.metrics).toMatchObject({
            totalPlannedCredits: 180,
            degreeCreditsRequired: 180,
            placeholderCount: placeholders.length,
            generalEducationPlaceholderCount: 3,
            bdesElectivePlaceholderCount: 8
        });
        expect(placeholders.filter(item => item.category === 'bdes-elective')).toHaveLength(8);
        expect(placeholders.filter(item => item.category === 'open-degree')).not.toHaveLength(0);
        expect(placeholders.find(item => item.category === 'bdes-elective')).toMatchObject({
            code: 'open-bdes-elective-01',
            kind: 'major-elective',
            contributionIds: ['bdes']
        });
        expect(composition.termIndex).toBeLessThan(analysis.termIndex);
        expect(analysis.termIndex).toBeLessThan(desn200.termIndex);
        expect(result.courses.some(item => item.code === 'ENGL 201')).toBe(false);
        expect(result.ledger.some(item => (
            item.category === 'external-condition' && item.affected.includes('ENGL 201')
        ))).toBe(false);
        expect(result.ledger.filter(item => item.category === 'degree-requirement-overlap')).toHaveLength(1);
    });

    test('selected lens electives replace BDes slots without changing the 180-credit total', () => {
        const snapshot = withDegreeRequirements(makeSnapshot());
        const baseline = AdvisingPlanner.plan(snapshot, []);
        const selected = AdvisingPlanner.plan(snapshot, ['alpha', 'beta']);

        expect(baseline.metrics.totalPlannedCredits).toBe(180);
        expect(selected.metrics.totalPlannedCredits).toBe(180);
        expect(baseline.metrics.bdesElectivePlaceholderCount).toBe(8);
        expect(selected.metrics.bdesElectivePlaceholderCount).toBe(6);
        expect(selected.electiveProgress).toMatchObject({ contributedCredits: 10, openCredits: 30 });
        expect(selected.metrics.openDegreePlaceholderCount).toBe(baseline.metrics.openDegreePlaceholderCount);
    });

    test('is invariant to lens permutations and repeat runs', () => {
        const snapshot = makeSnapshot();
        const first = AdvisingPlanner.plan(snapshot, ['gamma', 'alpha', 'beta']);
        const permuted = AdvisingPlanner.plan(snapshot, ['beta', 'gamma', 'alpha']);
        const repeated = AdvisingPlanner.plan(snapshot, ['gamma', 'alpha', 'beta']);

        expect(first).toEqual(permuted);
        expect(first).toEqual(repeated);
        expect(first.selectedLensIds).toEqual(['alpha', 'beta', 'gamma']);
    });

    test('selects choose-N alternatives deterministically and reports the remaining choices', () => {
        const snapshot = makeSnapshot();
        snapshot.lenses = [lens('chooser', [group(
            'chooser-options',
            ['DESN 310', 'DESN 320', 'DESN 330'],
            { type: 'choose-N', count: 2 }
        )])];

        const result = AdvisingPlanner.plan(snapshot, ['chooser']);

        expect(result.choiceGroups).toEqual([
            expect.objectContaining({
                id: 'chooser-options',
                selectedCourseCodes: ['DESN 310', 'DESN 320'],
                remainingCourseCodes: ['DESN 330']
            })
        ]);
        expect(result.courses.find(item => item.code === 'DESN 330')).toMatchObject({
            requirementState: 'alternative',
            termIndex: null,
            contributionIds: ['chooser']
        });
    });

    test('keeps paired options together when choose-N counts options', () => {
        const snapshot = makeSnapshot();
        snapshot.lenses = [lens('paired', [group(
            'paired-options',
            ['DESN 310', 'DESN 320', 'DESN 330', 'DESN 340'],
            {
                type: 'choose-N',
                count: 1,
                options: [
                    { id: 'a-pair', label: 'A pair', courses: ['DESN 310', 'DESN 320'] },
                    { id: 'b-pair', label: 'B pair', courses: ['DESN 330', 'DESN 340'] }
                ]
            }
        )])];

        const result = AdvisingPlanner.plan(snapshot, ['paired']);

        expect(result.choiceGroups[0]).toMatchObject({
            selectedCourseCodes: ['DESN 310', 'DESN 320'],
            remainingCourseCodes: ['DESN 330', 'DESN 340']
        });
        expect(result.choiceGroups[0].selectedOptions[0].id).toBe('a-pair');
    });

    test('applies choose-N semantics to support requirements without preselecting every alternative', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.bdes.supportRequirements = [group(
            'support-choice',
            ['DESN 310', 'DESN 320'],
            { type: 'choose-N', count: 1 }
        )];

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.choiceGroups[0]).toMatchObject({
            id: 'support-choice',
            selectedCourseCodes: ['DESN 310'],
            remainingCourseCodes: ['DESN 320']
        });
        expect(result.courses.find(item => item.code === 'DESN 310')).toMatchObject({
            requirementState: 'selected',
            contributionIds: ['bdes']
        });
        expect(result.courses.find(item => item.code === 'DESN 320')).toMatchObject({
            requirementState: 'alternative',
            termIndex: null,
            contributionIds: ['bdes']
        });
    });

    test('ranks choose-N alternatives by complete worksheet placement', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses = {
            'DESN 200': course('DESN 200', {
                offeredQuarters: ['Fall'],
                prerequisites: ['ENGL 201']
            }),
            'DESN 300': course('DESN 300', {
                offeredQuarters: ['Winter'],
                prerequisites: []
            }),
            'ENGL 201': course('ENGL 201', {
                credits: 0,
                offeredQuarters: [],
                external: true,
                conditionOnly: true,
                prerequisites: []
            })
        };
        snapshot.curriculum.bdes = {
            creditsRequired: 5,
            fixedCredits: 0,
            electiveCredits: 0,
            requirementGroups: [],
            electiveCourseCodes: [],
            supportRequirements: [group(
                'support-choice',
                ['DESN 200', 'DESN 300'],
                { type: 'choose-N', count: 1 }
            )],
            sourceIds: ['curriculum-source'],
            reviewState: 'approved'
        };
        snapshot.curriculum.degreeRequirements = {
            totalCredits: 10,
            placeholders: [{
                id: 'english-analysis-research',
                label: 'English analysis, research, and documentation',
                credits: 5,
                kind: 'gen-ed',
                category: 'english',
                sourceIds: ['curriculum-source'],
                reviewState: 'approved',
                satisfiedByCourseCodes: [],
                representsCourseCodes: ['ENGL 201'],
                prerequisitePlaceholderIds: []
            }],
            openDegreeCredits: {
                idPrefix: 'open-degree-credit',
                label: 'Open degree credit',
                creditsPerSlot: 5,
                sourceIds: ['curriculum-source'],
                reviewState: 'approved'
            }
        };
        snapshot.lenses = [];
        snapshot.planningLimits = {
            ...snapshot.planningLimits,
            terms: ['Fall', 'Winter'],
            normalTerms: 2,
            extensionTerms: 0,
            maxCreditsPerTerm: 5
        };

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('fits-normal-horizon');
        expect(result.choiceGroups[0]).toMatchObject({
            selectedCourseCodes: ['DESN 300'],
            remainingCourseCodes: ['DESN 200']
        });
        expect(result.courses.find(item => item.code === 'DESN 300')).toMatchObject({
            requirementState: 'selected',
            termIndex: 1
        });
        expect(result.courses.find(item => item.code === 'DESN 200')).toMatchObject({
            requirementState: 'alternative',
            termIndex: null
        });
        expect(result.terms).toHaveLength(2);
        expect(result.metrics).toMatchObject({
            maxSearchNodes: 50000,
            totalPlannedCredits: 10,
            degreeCreditsRequired: 10
        });
    });

    test('expands transitive internal prerequisites and respects their order', () => {
        const snapshot = makeSnapshot({
            curriculum: {
                bdes: {
                    requirementGroups: [group('bdes-fixed', [])]
                }
            },
            lenses: [lens('advanced', [group('advanced-required', ['DESN 300'])])]
        });

        const result = AdvisingPlanner.plan(snapshot, ['advanced']);
        const byCode = Object.fromEntries(result.courses.map(item => [item.code, item]));

        expect(Object.keys(byCode)).toEqual(['DESN 100', 'DESN 200', 'DESN 300']);
        expect(byCode['DESN 100'].contributionIds).toEqual(['advanced']);
        expect(byCode['DESN 100'].termIndex).toBeLessThan(byCode['DESN 200'].termIndex);
        expect(byCode['DESN 200'].termIndex).toBeLessThan(byCode['DESN 300'].termIndex);
    });

    test('uses standing boundaries and the per-term Design/Art load limit', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['DESN 300'].standingRequired = 'junior';
        const result = AdvisingPlanner.plan(snapshot, ['alpha', 'beta']);
        const advanced = result.courses.find(item => item.code === 'DESN 300');

        expect(advanced.termIndex).toBeGreaterThanOrEqual(6);
        result.terms.forEach(term => expect(term.credits).toBeLessThanOrEqual(15));
    });

    test('distinguishes normal fit from a feasible extension', () => {
        const fallChain = {};
        const codes = ['DESN 101', 'DESN 201', 'DESN 301', 'DESN 401', 'DESN 402'];
        codes.forEach((code, index) => {
            fallChain[code] = course(code, {
                credits: 1,
                offeredQuarters: ['Fall'],
                prerequisites: index ? [codes[index - 1]] : []
            });
        });
        const snapshot = makeSnapshot({
            curriculum: {
                courses: fallChain,
                bdes: {
                    requirementGroups: [group('fall-chain', [codes[codes.length - 1]])],
                    electiveCourseCodes: [],
                    electiveCredits: 0
                }
            },
            lenses: []
        });

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('requires-extension');
        expect(result.metrics.completionTermIndex).toBe(12);
        expect(result.terms[12]).toMatchObject({ quarter: 'Fall', isExtension: true });
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'extension' })
        ]));
        expect(result.ledger.some(entry => entry.category === 'historical-offering-constraint')).toBe(false);
    });

    test('flags the historical teaching pattern when it alone forces a selected lens into extension', () => {
        const fallChain = {};
        const codes = ['DESN 101', 'DESN 201', 'DESN 301', 'DESN 401', 'DESN 402'];
        codes.forEach((code, index) => {
            fallChain[code] = course(code, {
                credits: 1,
                offeredQuarters: ['Fall'],
                offeringEvidence: { sourceIds: ['department-course-categorizations'] },
                prerequisites: index ? [codes[index - 1]] : []
            });
        });
        const snapshot = makeSnapshot({
            curriculum: {
                courses: fallChain,
                bdes: {
                    requirementGroups: [group('bdes-fixed', [])],
                    electiveCourseCodes: [],
                    electiveCredits: 0
                }
            },
            lenses: [lens('rotation', [group('rotation-required', [codes.at(-1)])])]
        });

        const result = AdvisingPlanner.plan(snapshot, ['rotation']);
        const diagnostic = result.ledger.find(entry => entry.category === 'historical-offering-constraint');

        expect(result.status).toBe('requires-extension');
        expect(result.metrics.completionTermIndex).toBe(12);
        expect(diagnostic).toMatchObject({
            id: 'historical-offering-pattern-inhibits-normal-completion',
            category: 'historical-offering-constraint'
        });
        expect(diagnostic.message).toContain('historical teaching pattern inhibits normal completion');
        expect(diagnostic.message).toContain('department chair');
        expect(diagnostic.message).toContain('does not assume a future offering exception');
        expect(diagnostic.affected.length).toBeGreaterThan(0);
        expect(diagnostic.sourceIds).toContain('department-course-categorizations');
        expect(diagnostic.sourceIds).not.toContain('course-source');
        result.courses.forEach((plannedCourse) => {
            expect(result.terms[plannedCourse.termIndex].quarter).toBe('Fall');
        });
    });

    test('flags historical offerings when relaxing only quarters restores a normal sequence', () => {
        const snapshot = makeSnapshot({
            curriculum: {
                bdes: { requirementGroups: [group('bdes-fixed', [])] }
            },
            lenses: [lens('summer-pattern', [group('summer-required', ['DESN 310'])])]
        });
        snapshot.curriculum.courses['DESN 310'].offeredQuarters = ['Summer'];

        const result = AdvisingPlanner.plan(snapshot, ['summer-pattern']);

        expect(result.status).toBe('no-known-sequence');
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({
                category: 'historical-offering-constraint',
                affected: ['DESN 310']
            })
        ]));
    });

    test('does not blame offerings when standing is what forces extension', () => {
        const snapshot = makeSnapshot({
            curriculum: {
                bdes: { requirementGroups: [group('bdes-fixed', [])] }
            },
            lenses: [lens('standing', [group('standing-required', ['DESN 310'])])]
        });
        snapshot.curriculum.courses['DESN 310'].offeredQuarters = ['Fall'];
        snapshot.curriculum.courses['DESN 310'].standingRequired = 12;

        const result = AdvisingPlanner.plan(snapshot, ['standing']);

        expect(result.status).toBe('requires-extension');
        expect(result.ledger.some(entry => entry.category === 'historical-offering-constraint')).toBe(false);
    });

    test('returns no-known-sequence only after approved facts have a complete failed search', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['DESN 200'].offeredQuarters = ['Summer'];

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('no-known-sequence');
        expect(result.metrics.searchComplete).toBe(true);
        expect(result.unplaced).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'DESN 200', reason: 'no-known-placement' })
        ]));
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'no-known-sequence' })
        ]));
    });

    test('treats an approved prerequisite cycle as no-known-sequence', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['DESN 100'].prerequisites = ['DESN 200'];

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('no-known-sequence');
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'prerequisite-cycle', category: 'prerequisite' })
        ]));
    });

    test('propagates selected uncertainty while preserving a working preview', () => {
        const snapshot = makeSnapshot();
        snapshot.lenses[0].reviewState = 'unresolved';
        snapshot.issues = [{
            id: 'alpha-conflict',
            type: 'contradictory',
            status: 'advisor-review-required',
            summary: 'Alpha has two conflicting source definitions.',
            affectedCourseCodes: ['DESN 300'],
            lensIds: ['alpha'],
            sourceIds: ['curriculum-source']
        }];

        const result = AdvisingPlanner.plan(snapshot, ['alpha']);

        expect(result.status).toBe('advisor-review-required');
        expect(result.courses.find(item => item.code === 'DESN 300').termIndex).not.toBeNull();
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'issue-alpha-conflict', category: 'advisor-review' })
        ]));
    });

    test('keeps unapproved historical offering exceptions informational and obeys approved quarters', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['DESN 310'] = course('DESN 310', {
            offeredQuarters: ['Fall'],
            offeringReviewState: 'approved'
        });
        snapshot.lenses = [lens('fall-only', [group('fall-only-required', ['DESN 310'])])];
        snapshot.sources['historical-enrollment'] = { id: 'historical-enrollment', label: 'Historical enrollment' };
        snapshot.issues = [{
            id: 'possible-winter-exception',
            type: 'unresolved',
            status: 'advisor-review-required',
            planningImpact: 'informational',
            summary: 'A possible Winter exception is not approved.',
            affectedCourseCodes: ['DESN 310'],
            lensIds: ['fall-only'],
            sourceIds: ['historical-enrollment']
        }];

        const result = AdvisingPlanner.plan(snapshot, ['fall-only']);
        const planned = result.courses.find(item => item.code === 'DESN 310');

        expect(result.status).toBe('fits-normal-horizon');
        expect(result.terms[planned.termIndex].quarter).toBe('Fall');
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'issue-possible-winter-exception',
                category: 'historical-offering-evidence'
            })
        ]));
        expect(result.ledger.find(item => item.id === 'issue-possible-winter-exception').message)
            .toContain('exceptions were not used');
    });

    test('never treats a missing internal offering pattern as availability in every quarter', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['DESN 310'] = course('DESN 310', {
            offeredQuarters: [],
            offeringReviewState: 'unresolved'
        });
        snapshot.lenses = [lens('unknown-offering', [group('unknown-offering-required', ['DESN 310'])])];

        const result = AdvisingPlanner.plan(snapshot, ['unknown-offering']);
        const planned = result.courses.find(item => item.code === 'DESN 310');

        expect(result.status).toBe('advisor-review-required');
        expect(planned.termIndex).toBeNull();
        expect(result.terms).toHaveLength(12);
        expect(result.terms.some(term => term.isExtension)).toBe(false);
        expect(result.unplaced).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'DESN 310', reason: 'missing-offering-pattern' })
        ]));
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'review-course-desn-310', category: 'advisor-review' })
        ]));
        expect(result.ledger.some(item => item.category === 'historical-offering-constraint')).toBe(false);
    });

    test('puts external and missing prerequisites in the ledger and unplaced list', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['DESN 200'].prerequisites = [
            { code: 'ENGL 101', external: true },
            'DESN 999'
        ];

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('advisor-review-required');
        expect(result.unplaced).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'ENGL 101', reason: 'missing-course-data' }),
            expect.objectContaining({ code: 'DESN 999', reason: 'missing-course-data' })
        ]));
        expect(result.courses.some(item => item.code === 'ENGL 101')).toBe(false);
    });

    test('reserves unresolved external named-course credits without placing the course', () => {
        const snapshot = withDegreeRequirements(makeSnapshot());
        snapshot.curriculum.courses['ART 305'] = course('ART 305', {
            credits: 5,
            offeredQuarters: [],
            external: true,
            conditionOnly: false,
            offeringReviewState: 'unresolved'
        });
        snapshot.lenses = [lens('photography', [group('photography-required', ['ART 305'])], {
            reviewState: 'unresolved'
        })];

        const result = AdvisingPlanner.plan(snapshot, ['photography']);
        const artCourse = result.courses.find(item => item.code === 'ART 305');
        const selectedDegreeCredits = result.courses
            .filter(item => item.requirementState === 'selected')
            .reduce((sum, item) => sum + item.credits, 0);

        expect(result.status).toBe('advisor-review-required');
        expect(artCourse).toMatchObject({
            credits: 5,
            external: true,
            requirementState: 'selected',
            termIndex: null
        });
        expect(result.unplaced).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'ART 305', reason: 'missing-offering-pattern' })
        ]));
        expect(result.unplaced.filter(item => item.code === 'ART 305')).toHaveLength(1);
        expect(result.terms).toHaveLength(12);
        expect(result.metrics).toMatchObject({
            totalNamedCredits: 15,
            totalPlannedCredits: 175,
            degreeCreditsRequired: 180,
            placeholderCredits: 165,
            totalCourses: 3
        });
        expect(selectedDegreeCredits).toBe(180);
    });

    test('places an approved external named prerequisite and orders it before its dependent', () => {
        const snapshot = makeSnapshot({
            curriculum: {
                courses: {
                    'ART 201': course('ART 201', {
                        offeredQuarters: ['Fall'],
                        external: true,
                        conditionOnly: false
                    }),
                    'DESN 200': course('DESN 200', {
                        offeredQuarters: ['Winter'],
                        prerequisites: ['ART 201']
                    })
                },
                bdes: {
                    requirementGroups: [group('bdes-fixed', ['DESN 200'])],
                    electiveCourseCodes: [],
                    electiveCredits: 0
                }
            },
            lenses: []
        });

        const result = AdvisingPlanner.plan(snapshot, []);
        const art = result.courses.find(item => item.code === 'ART 201');
        const design = result.courses.find(item => item.code === 'DESN 200');

        expect(result.status).toBe('fits-normal-horizon');
        expect(art).toMatchObject({ external: true, termIndex: 0 });
        expect(design.termIndex).toBe(1);
        expect(art.termIndex).toBeLessThan(design.termIndex);
        expect(result.unplaced).toEqual([]);
    });

    test('keeps selected lecture and lab co-requisites in the same term under load pressure', () => {
        const snapshot = makeSnapshot({
            curriculum: {
                courses: {
                    'ART 305': course('ART 305', {
                        credits: 4,
                        external: true,
                        corequisites: ['ART 305L']
                    }),
                    'ART 305L': course('ART 305L', {
                        credits: 1,
                        external: true,
                        corequisites: ['ART 305']
                    }),
                    'DESN 010': course('DESN 010', {
                        credits: 1,
                        offeredQuarters: ['Fall']
                    })
                },
                bdes: {
                    requirementGroups: [group('bdes-fixed', ['ART 305', 'ART 305L', 'DESN 010'])],
                    electiveCourseCodes: [],
                    electiveCredits: 0
                }
            },
            lenses: [],
            planningLimits: {
                startTerm: 'Fall',
                terms: ['Fall', 'Winter'],
                normalTerms: 2,
                extensionTerms: 0,
                maxCreditsPerTerm: 5,
                maxSearchNodes: 50000,
                sourceIds: ['limit-source'],
                reviewState: 'approved'
            }
        });

        const termZeroSnapshot = clone(snapshot);
        delete termZeroSnapshot.curriculum.courses['DESN 010'];
        termZeroSnapshot.curriculum.bdes.requirementGroups[0].courses = ['ART 305', 'ART 305L'];
        const termZeroResult = AdvisingPlanner.plan(termZeroSnapshot, []);
        const result = AdvisingPlanner.plan(snapshot, []);
        const lecture = result.courses.find(item => item.code === 'ART 305');
        const lab = result.courses.find(item => item.code === 'ART 305L');

        expect(termZeroResult.courses.find(item => item.code === 'ART 305')).toMatchObject({ termIndex: 0 });
        expect(termZeroResult.courses.find(item => item.code === 'ART 305L')).toMatchObject({ termIndex: 0 });
        expect(result.status).toBe('fits-normal-horizon');
        expect(result.courses.find(item => item.code === 'DESN 010').termIndex).toBe(0);
        expect(lecture.termIndex).toBe(1);
        expect(lab.termIndex).toBe(lecture.termIndex);
        expect(result.terms[1]).toMatchObject({ credits: 5 });
    });

    test('prefers a reusable BDes choice in complete and incomplete worksheet ties', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['ART 201'] = course('ART 201', {
            external: true,
            conditionOnly: false
        });
        snapshot.lenses = [lens('reuse', [
            group('reuse-common', ['DESN 310']),
            group('reuse-choice', ['ART 201', 'DESN 200'], { type: 'choose-N', count: 1 })
        ])];

        const complete = AdvisingPlanner.plan(snapshot, ['reuse']);
        snapshot.curriculum.courses['DESN 310'].offeredQuarters = [];
        snapshot.curriculum.courses['DESN 310'].offeringReviewState = 'unresolved';
        const incomplete = AdvisingPlanner.plan(snapshot, ['reuse']);

        [complete, incomplete].forEach(result => {
            expect(result.choiceGroups.find(item => item.id === 'reuse-choice')).toMatchObject({
                selectedCourseCodes: ['DESN 200'],
                remainingCourseCodes: ['ART 201']
            });
        });
        expect(complete.status).toBe('fits-normal-horizon');
        expect(incomplete.status).toBe('advisor-review-required');
    });

    test('rejects required worksheet credits above the degree target without planning beyond it', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.bdes.electiveCredits = 0;
        snapshot.curriculum.bdes.electiveCourseCodes = [];
        snapshot.curriculum.degreeRequirements = {
            totalCredits: 10,
            placeholders: [{
                id: 'mathematics',
                label: 'Mathematics',
                credits: 5,
                kind: 'gen-ed',
                category: 'math',
                sourceIds: ['curriculum-source'],
                reviewState: 'approved',
                satisfiedByCourseCodes: [],
                representsCourseCodes: [],
                prerequisitePlaceholderIds: []
            }],
            openDegreeCredits: {
                idPrefix: 'open-degree-credit',
                label: 'Open degree credit',
                creditsPerSlot: 5,
                sourceIds: ['curriculum-source'],
                reviewState: 'approved'
            },
            sourceIds: ['curriculum-source']
        };

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('no-known-sequence');
        expect(result.terms.reduce((sum, term) => sum + term.credits, 0)).toBeLessThanOrEqual(10);
        expect(result.metrics).toMatchObject({
            degreeCreditsRequired: 10,
            requiredWorksheetCredits: 15,
            degreeOverflowCredits: 5,
            totalPlannedCredits: 10
        });
        expect(result.unplaced).toEqual(expect.arrayContaining([
            expect.objectContaining({ reason: 'degree-credit-overflow' })
        ]));
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'degree-credit-overflow',
                category: 'degree-credit-overflow'
            })
        ]));
    });

    test('keeps an approved external condition informational and out of course placement', () => {
        const snapshot = makeSnapshot();
        snapshot.curriculum.courses['ENGL 201'] = course('ENGL 201', {
            credits: 0,
            offeredQuarters: [],
            external: true,
            conditionOnly: true,
            sourceIds: ['course-source'],
            offeringReviewState: 'approved'
        });
        snapshot.curriculum.bdes.supportRequirements = [group('writing-condition', ['ENGL 201'])];
        snapshot.curriculum.courses['DESN 200'].prerequisites = ['ENGL 201'];

        const result = AdvisingPlanner.plan(snapshot, []);

        expect(result.status).toBe('fits-normal-horizon');
        expect(result.courses.some(item => item.code === 'ENGL 201')).toBe(false);
        expect(result.unplaced).toEqual([]);
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'external-condition', affected: ['ENGL 201'] })
        ]));
    });

    test('turns search-cap exhaustion into advisor review, never impossibility', () => {
        const result = AdvisingPlanner.plan(makeSnapshot(), [], { maxSearchNodes: 0 });

        expect(result.status).toBe('advisor-review-required');
        expect(result.metrics).toMatchObject({ maxSearchNodes: 0, searchNodesVisited: 0, searchComplete: false });
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'search-limit' })
        ]));
        expect(result.ledger.some(entry => entry.category === 'historical-offering-constraint')).toBe(false);
    });

    test('keeps complete-worksheet placement inside the same search-node limit', () => {
        const result = AdvisingPlanner.plan(
            withDegreeRequirements(makeSnapshot()),
            [],
            { maxSearchNodes: 10 }
        );

        expect(result.status).toBe('advisor-review-required');
        expect(result.metrics).toMatchObject({
            maxSearchNodes: 10,
            searchNodesVisited: 10,
            searchComplete: false
        });
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'search-node-limit', category: 'search-limit' })
        ]));
        expect(result.ledger.some(entry => entry.category === 'no-known-sequence')).toBe(false);
    });

    test('charges lazy choice-variant preparation to the bounded search budget', () => {
        const snapshot = makeSnapshot();
        const choices = [
            'DESN 100',
            'DESN 200',
            'DESN 300',
            'DESN 310',
            'DESN 320',
            'DESN 330',
            'DESN 340'
        ];
        snapshot.curriculum.bdes.requirementGroups = [group('bdes-fixed', [])];
        snapshot.lenses = [lens('many-choices', [group('many-options', choices, {
            type: 'choose-N',
            count: 3
        })])];

        const result = AdvisingPlanner.plan(snapshot, ['many-choices'], { maxSearchNodes: 5 });

        expect(result.status).toBe('advisor-review-required');
        expect(result.metrics).toMatchObject({
            maxSearchNodes: 5,
            searchNodesVisited: 5,
            searchComplete: false
        });
        expect(result.ledger).toEqual(expect.arrayContaining([
            expect.objectContaining({ category: 'search-limit' })
        ]));
        expect(result.ledger.some(entry => entry.category === 'historical-offering-constraint')).toBe(false);
    });

    test('rejects an unknown lens and a fourth unique lens', () => {
        const snapshot = makeSnapshot();

        expect(() => AdvisingPlanner.plan(snapshot, ['not-a-lens'])).toThrow('Unknown advising lens');
        expect(() => AdvisingPlanner.plan(snapshot, ['alpha', 'beta', 'gamma', 'delta'])).toThrow(
            'no more than three'
        );
    });

    test('does not mutate the snapshot or selection array', () => {
        const snapshot = makeSnapshot();
        const selected = ['beta', 'alpha'];
        const beforeSnapshot = clone(snapshot);
        const beforeSelected = clone(selected);

        AdvisingPlanner.plan(snapshot, selected);

        expect(snapshot).toEqual(beforeSnapshot);
        expect(selected).toEqual(beforeSelected);
    });
});
