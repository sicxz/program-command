const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadAdvisingCurriculum() {
    const source = fs.readFileSync(path.join(ROOT, 'js/advising-curriculum.js'), 'utf8');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'js/advising-curriculum.js' });
    return sandbox.AdvisingCurriculum;
}

describe('AdvisingCurriculum', () => {
    const AdvisingCurriculum = loadAdvisingCurriculum();
    const overlayFixture = readJson('data/advising-curriculum.json');
    const catalogFixture = readJson('data/course-catalog.json');

    function normalize(overlay = overlayFixture, catalog = catalogFixture) {
        return AdvisingCurriculum.normalize(clone(overlay), clone(catalog));
    }

    test('normalizes the reviewed 2026-27 BDes snapshot and seven stable lens IDs', () => {
        const snapshot = normalize();

        expect(snapshot.curriculum.year).toBe('2026-27');
        expect(snapshot.curriculum.name).toBe('Bachelor of Design (BDes)');
        expect(snapshot.curriculum.bdes).toMatchObject({
            creditsRequired: 95,
            fixedCredits: 55,
            electiveCredits: 40,
            reviewState: 'approved'
        });
        expect(snapshot.lenses.map((lens) => lens.id)).toEqual([
            'animation-motion',
            'game-design',
            'graphic-design',
            'interaction-design',
            'photography',
            'user-experience-design',
            'web-development'
        ]);
        expect(snapshot.planningLimits).toMatchObject({
            startTerm: 'Fall',
            terms: ['Fall', 'Winter', 'Spring'],
            normalTerms: 12,
            extensionTerms: 6,
            maxCreditsPerTerm: 15,
            maxSearchNodes: 50000
        });
        expect(snapshot.sources['program-command-course-catalog']).toMatchObject({
            path: 'data/course-catalog.json',
            version: '2026-04-20',
            capturedOn: '2026-04-20',
            reviewedOn: '2026-08-14'
        });
    });

    test('normalizes the complete advisor-led degree worksheet without inventing gen-ed codes', () => {
        const snapshot = normalize();
        const requirements = snapshot.curriculum.degreeRequirements;

        expect(requirements).toMatchObject({
            totalCredits: 180,
            upperDivisionCredits: 60,
            minimumCumulativeGpa: 2,
            minimumMajorGpa: 2.5,
            overlapPolicy: 'one-course-one-slot',
            reviewState: 'approved'
        });
        expect(requirements.placeholders).toHaveLength(11);
        expect(requirements.placeholders.reduce((counts, placeholder) => ({
            ...counts,
            [placeholder.category]: (counts[placeholder.category] || 0) + 1
        }), {})).toEqual({
            english: 2,
            math: 1,
            humanities: 2,
            'natural-sciences': 2,
            'social-sciences': 2,
            diversity: 1,
            'global-studies': 1
        });
        requirements.placeholders.forEach((placeholder) => {
            expect(placeholder).toMatchObject({
                credits: 5,
                kind: 'gen-ed',
                degreeWorksVerification: true,
                reviewState: 'approved'
            });
        });

        const english201 = requirements.placeholders.find(
            (placeholder) => placeholder.id === 'english-analysis-research'
        );
        expect(english201).toMatchObject({
            representsCourseCodes: ['ENGL 201'],
            prerequisitePlaceholderIds: ['english-composition']
        });
        expect(requirements.placeholders.find(
            (placeholder) => placeholder.id === 'english-composition'
        ).representsCourseCodes).toEqual([]);
        expect(requirements.placeholders.filter(
            (placeholder) => placeholder.category === 'humanities'
        ).every((placeholder) => placeholder.satisfiedByCourseCodes.includes('DESN 200'))).toBe(true);
        expect(requirements.placeholders.find(
            (placeholder) => placeholder.id === 'diversity'
        ).satisfiedByCourseCodes).toEqual(['DESN 359']);
        expect(requirements.openDegreeCredits).toMatchObject({
            creditsPerSlot: 5,
            kind: 'open-elective',
            calculation: 'remainder-to-total'
        });
        expect(snapshot.curriculum.bdes.electivePlaceholder).toMatchObject({
            credits: 5,
            count: 8,
            kind: 'major-elective'
        });
    });

    test('uses the dated department usual pattern and keeps historical exceptions reviewable', () => {
        const snapshot = normalize();
        const courses = snapshot.curriculum.courses;

        expect(courses['DESN 301'].offeredQuarters).toEqual(['Fall']);
        expect(courses['DESN 336'].offeredQuarters).toEqual(['Winter']);
        expect(courses['DESN 350'].offeredQuarters).toEqual(['Spring']);
        expect(courses['DESN 368'].offeredQuarters).toEqual(['Fall']);
        expect(courses['DESN 378'].offeredQuarters).toEqual(['Winter']);
        expect(courses['DESN 468'].offeredQuarters).toEqual(['Spring']);
        expect(courses['DESN 301'].offeringEvidence.observedTerms).toEqual(expect.arrayContaining([
            '2022-23 Winter',
            '2024-25 Spring'
        ]));
        expect(courses['DESN 301'].issues).toContain('desn-historical-offering-exceptions');
        snapshot.curriculum.offeringEvidence.courses
            .filter((evidence) => evidence.reviewState === 'approved')
            .forEach((evidence) => {
                const hasHistoricalException = evidence.observedTerms.some(
                    (term) => !evidence.normalQuarters.includes(term.split(' ')[1])
                );
                if (hasHistoricalException) {
                    expect(evidence.issues).toContain('desn-historical-offering-exceptions');
                }
            });
        expect(snapshot.issues).toContainEqual(expect.objectContaining({
            id: 'desn-historical-offering-exceptions',
            status: 'advisor-review-required',
            planningImpact: 'informational',
            affectedCourseCodes: expect.arrayContaining(['DESN 301', 'DESN 336', 'DESN 350'])
        }));
    });

    test('keeps DESN 326 Fall-only and a possible Winter exception out of normal availability', () => {
        const snapshot = normalize();
        const course = snapshot.curriculum.courses['DESN 326'];
        const canonical = catalogFixture.courses.find(({ code }) => code === 'DESN 326');

        expect(canonical.offeredQuarters).toEqual(['Winter', 'Spring']);
        expect(course).toMatchObject({
            offeredQuarters: ['Fall'],
            offeringReviewState: 'approved'
        });
        expect(course.offeringEvidence).toMatchObject({
            normalQuarters: ['Fall'],
            observedTerms: ['2023-24 Fall', '2024-25 Fall', '2025-26 Fall'],
            winter2026Observed: false,
            reviewState: 'approved'
        });
        expect(course.offeringEvidence.observedTerms.some((term) => term.endsWith(' Winter')))
            .toBe(false);
        expect(snapshot.issues).toContainEqual(expect.objectContaining({
            id: 'desn-326-winter-exception-unconfirmed',
            status: 'advisor-review-required',
            planningImpact: 'informational',
            affectedCourseCodes: ['DESN 326'],
            lensIds: ['animation-motion', 'game-design']
        }));
    });

    test('records offering provenance for every plannable DESN and ART requirement', () => {
        const snapshot = normalize();
        const groups = [
            ...snapshot.curriculum.bdes.requirementGroups,
            ...snapshot.lenses.flatMap((lens) => lens.requirementGroups)
        ];
        const codes = new Set([
            ...snapshot.curriculum.bdes.electiveCourseCodes,
            ...groups.flatMap((group) => group.courses)
        ]);
        const evidenceCodes = snapshot.curriculum.offeringEvidence.courses.map(({ code }) => code);

        expect(new Set(evidenceCodes)).toEqual(codes);
        [...codes].forEach((code) => {
            const course = snapshot.curriculum.courses[code];
            expect(course.offeringEvidence.sourceIds.length).toBeGreaterThan(0);
            expect(course.offeringEvidence.normalQuarters).toEqual(course.offeredQuarters);
        });
        expect(snapshot.curriculum.courses['DESN 343']).toMatchObject({
            offeredQuarters: [],
            offeringReviewState: 'unresolved'
        });
        expect(snapshot.issues).toContainEqual(expect.objectContaining({
            id: 'course-desn-343-offerings',
            type: 'unresolved'
        }));
        expect(snapshot.curriculum.courses['ART 404'].offeringEvidence).toMatchObject({
            normalQuarters: [],
            observedTerms: [],
            reviewState: 'unresolved'
        });
    });

    test('joins every internal requirement and elective to the dated course catalog', () => {
        const snapshot = normalize();
        const groups = [
            ...snapshot.curriculum.bdes.requirementGroups,
            ...snapshot.curriculum.bdes.supportRequirements,
            ...snapshot.lenses.flatMap((lens) => [
                ...lens.requirementGroups,
                ...lens.supportRequirements
            ])
        ];
        const allCodes = new Set([
            ...groups.flatMap((group) => group.courses),
            ...snapshot.curriculum.bdes.electiveCourseCodes
        ]);

        [...allCodes]
            .filter((code) => code.startsWith('DESN '))
            .forEach((code) => {
                expect(snapshot.curriculum.courses[code]).toMatchObject({
                    code,
                    external: false,
                    reviewState: 'approved'
                });
                expect(snapshot.curriculum.courses[code].sourceIds).toContain(
                    'program-command-course-catalog'
                );
            });

        const animation = snapshot.lenses.find((lens) => lens.id === 'animation-motion');
        expect(animation.requirementGroups[0].courses).toEqual([
            'DESN 301',
            'DESN 326',
            'DESN 336',
            'DESN 355',
            'DESN 365',
            'DESN 401'
        ]);
        const web = snapshot.lenses.find((lens) => lens.id === 'web-development');
        expect(web.requirementGroups[0].courses).toContain('DESN 469');
        expect(snapshot.curriculum.courses['DESN 4699']).toBeUndefined();
    });

    test('preserves external ART requirements and ENGL conditions explicitly', () => {
        const snapshot = normalize();
        const courses = snapshot.curriculum.courses;

        expect(courses['ENGL 201']).toMatchObject({
            external: true,
            conditionOnly: true,
            prerequisites: ['ENGL 101']
        });
        expect(courses['ENGL 101']).toMatchObject({
            external: true,
            conditionOnly: true
        });
        expect(courses['ART 305']).toMatchObject({
            external: true,
            credits: 4,
            corequisites: ['ART 305L'],
            offeringReviewState: 'unresolved'
        });
        expect(courses['ART 305L']).toMatchObject({
            external: true,
            credits: 1,
            corequisites: ['ART 305']
        });

        const photography = snapshot.lenses.find((lens) => lens.id === 'photography');
        const pairChoice = photography.requirementGroups.find(
            (group) => group.id === 'photography-advanced-pair-choice'
        );
        expect(pairChoice.type).toBe('choose-N');
        expect(pairChoice.count).toBe(1);
        expect(pairChoice.options).toEqual([
            {
                id: 'photography-art-308-pair',
                label: 'ART 308 and ART 308L',
                courses: ['ART 308', 'ART 308L']
            },
            {
                id: 'photography-art-404-pair',
                label: 'ART 404 and ART 404L',
                courses: ['ART 404', 'ART 404L']
            }
        ]);
        expect(pairChoice.courses).toEqual(['ART 308', 'ART 308L', 'ART 404', 'ART 404L']);
    });

    test('keeps source conflicts and missing offering facts as advisor-review issues', () => {
        const snapshot = normalize();
        const interaction = snapshot.lenses.find((lens) => lens.id === 'interaction-design');
        const photography = snapshot.lenses.find((lens) => lens.id === 'photography');

        expect(interaction.reviewState).toBe('unresolved');
        expect(interaction.issues).toEqual(['interaction-design-source-conflict']);
        expect(interaction.requirementGroups[0].courses).toEqual([
            'DESN 348',
            'DESN 369',
            'DESN 378',
            'DESN 379',
            'DESN 458',
            'DESN 468'
        ]);
        expect(photography.reviewState).toBe('unresolved');

        expect(snapshot.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'interaction-design-source-conflict',
                type: 'contradictory',
                status: 'advisor-review-required',
                lensIds: ['interaction-design'],
                affectedCourseCodes: expect.arrayContaining([
                    'DESN 216',
                    'DESN 338',
                    'DESN 369',
                    'DESN 379'
                ])
            }),
            expect.objectContaining({
                id: 'photography-art-offerings',
                type: 'missing',
                status: 'advisor-review-required',
                lensIds: ['photography']
            })
        ]));
    });

    test('normalizes newly stale, unresolved, and unsupported facts instead of rejecting them', () => {
        const overlay = clone(overlayFixture);
        overlay.sources.find((source) => source.id === 'web-development-catalog').reviewState = 'stale';
        overlay.lenses.find((lens) => lens.id === 'user-experience-design').reviewState = 'unsupported';
        overlay.planningLimits.reviewState = 'unresolved';

        const snapshot = normalize(overlay);

        expect(snapshot.sources['web-development-catalog'].reviewState).toBe('stale');
        expect(snapshot.lenses.find((lens) => lens.id === 'user-experience-design').reviewState)
            .toBe('unsupported');
        expect(snapshot.planningLimits.reviewState).toBe('unresolved');
        expect(snapshot.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'stale', status: 'advisor-review-required' }),
            expect.objectContaining({ type: 'unsupported', status: 'advisor-review-required' }),
            expect.objectContaining({ type: 'unresolved', status: 'advisor-review-required' })
        ]));
    });

    test('rejects an invalid choose-N count without discarding valid alternatives', () => {
        const overlay = clone(overlayFixture);
        const graphic = overlay.lenses.find((lens) => lens.id === 'graphic-design');
        graphic.requirementGroups.find((group) => group.type === 'choose-N').count = 7;

        expect(() => normalize(overlay)).toThrow(/cannot choose 7 from 6 alternatives/);
    });

    test('rejects the legacy DESN 4699 typo as no valid course', () => {
        const overlay = clone(overlayFixture);
        const web = overlay.lenses.find((lens) => lens.id === 'web-development');
        web.requirementGroups[0].courses[3] = 'DESN 4699';

        expect(() => normalize(overlay)).toThrow(/invalid course code "DESN 4699"/);
    });

    test.each([
        [
            'malformed requirement groups',
            (overlay) => { overlay.lenses[0].requirementGroups[0].type = 'sometimes'; },
            /expected "all-of" or "choose-N"/
        ],
        [
            'duplicate lens IDs',
            (overlay) => { overlay.lenses[1].id = overlay.lenses[0].id; },
            /duplicate lens ID/
        ],
        [
            'duplicate requirement group IDs',
            (overlay) => {
                overlay.lenses[1].requirementGroups[0].id = overlay.lenses[0].requirementGroups[0].id;
            },
            /duplicate requirement group ID/
        ],
        [
            'missing source registry entries',
            (overlay) => { overlay.lenses[0].sourceIds = ['not-a-source']; },
            /missing source registry entry "not-a-source"/
        ],
        [
            'unexplained non-external course codes',
            (overlay) => { overlay.lenses[0].requirementGroups[0].courses.push('DESN 999'); },
            /unexplained non-external course code "DESN 999"/
        ],
        [
            'missing source review metadata',
            (overlay) => { delete overlay.sources[0].reviewedOn; },
            /sources\[0\]\.reviewedOn/
        ],
        [
            'missing rule review metadata',
            (overlay) => { delete overlay.lenses[0].reviewState; },
            /lenses\[0\]\.reviewState/
        ],
        [
            'missing issue review metadata',
            (overlay) => { delete overlay.issues[0].reviewedBy; },
            /issues\[0\]\.reviewedBy/
        ],
        [
            'offering evidence outside its declared quarter coverage',
            (overlay) => {
                overlay.courseOfferingEvidence.courses.find(
                    ({ code }) => code === 'DESN 326'
                ).normalQuarters = ['Summer'];
            },
            /quarter "Summer" is outside evidence coverage/
        ],
        [
            'non-reciprocal course co-requisites',
            (overlay) => {
                overlay.externalCourses.find(({ code }) => code === 'ART 305L').corequisites = [];
            },
            /corequisite relationship with "ART 305L" must be reciprocal/
        ],
        [
            'missing offering evidence for an advising course',
            (overlay) => {
                overlay.courseOfferingEvidence.courses = overlay.courseOfferingEvidence.courses.filter(
                    ({ code }) => code !== 'DESN 326'
                );
            },
            /missing offering evidence for "DESN 326"/
        ],
        [
            'unknown prerequisite placeholder IDs',
            (overlay) => {
                overlay.curriculum.degreeRequirements.placeholders[1]
                    .prerequisitePlaceholderIds = ['not-a-placeholder'];
            },
            /unknown placeholder ID "not-a-placeholder"/
        ],
        [
            'missing DegreeWorks verification',
            (overlay) => {
                overlay.curriculum.degreeRequirements.placeholders[0]
                    .degreeWorksVerification = false;
            },
            /degreeWorksVerification: expected true/
        ]
    ])('rejects structural failure: %s', (_name, mutate, expected) => {
        const overlay = clone(overlayFixture);
        mutate(overlay);
        expect(() => normalize(overlay)).toThrow(expected);
    });

    test('rejects prerequisite cycles before making the snapshot available', () => {
        const catalog = clone(catalogFixture);
        catalog.courses.find((course) => course.code === 'DESN 100').prerequisites = ['DESN 200'];
        catalog.courses.find((course) => course.code === 'DESN 200').prerequisites = ['DESN 100'];

        expect(() => normalize(overlayFixture, catalog)).toThrow(
            /prerequisite cycle detected: DESN 100 -> DESN 200 -> DESN 100/
        );
    });

    test('deep-freezes the snapshot without mutating caller-owned data', () => {
        const overlay = clone(overlayFixture);
        const catalog = clone(catalogFixture);
        const originalOverlay = clone(overlay);
        const originalCatalog = clone(catalog);
        const snapshot = AdvisingCurriculum.normalize(overlay, catalog);

        expect(overlay).toEqual(originalOverlay);
        expect(catalog).toEqual(originalCatalog);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.curriculum)).toBe(true);
        expect(Object.isFrozen(snapshot.curriculum.courses['DESN 100'])).toBe(true);
        expect(Object.isFrozen(snapshot.curriculum.courses['DESN 326'].offeringEvidence)).toBe(true);
        expect(Object.isFrozen(snapshot.curriculum.degreeRequirements.placeholders)).toBe(true);
        expect(Object.isFrozen(snapshot.lenses[0].requirementGroups[0].courses)).toBe(true);
        expect(() => Object.defineProperty(snapshot.curriculum, 'year', { value: 'changed' }))
            .toThrow();
        expect(snapshot.curriculum.year).toBe('2026-27');
    });

    test('loads both default files through an injected fetch and delegates to normalize', async () => {
        const responses = {
            'data/advising-curriculum.json?v=20260814-4': overlayFixture,
            'data/course-catalog.json?v=20260814-4': catalogFixture
        };
        const fetchImpl = jest.fn(async (url) => ({
            ok: true,
            json: async () => clone(responses[url])
        }));

        const snapshot = await AdvisingCurriculum.load({ fetchImpl });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(fetchImpl).toHaveBeenNthCalledWith(1, 'data/advising-curriculum.json?v=20260814-4');
        expect(fetchImpl).toHaveBeenNthCalledWith(2, 'data/course-catalog.json?v=20260814-4');
        expect(snapshot.curriculum.year).toBe('2026-27');
        expect(Object.isFrozen(snapshot)).toBe(true);
    });
});
