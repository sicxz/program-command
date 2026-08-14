(function(root) {
    'use strict';

    const SOURCE_REVIEW_STATES = new Set(['approved', 'stale', 'unresolved']);
    const RULE_REVIEW_STATES = new Set(['approved', 'stale', 'unresolved', 'unsupported']);
    const COURSE_CODE_PATTERN = /^[A-Z]{2,5} \d{3}[A-Z]?$/;
    const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    const ACADEMIC_TERM_PATTERN = /^\d{4}-\d{2} (Fall|Winter|Spring|Summer)$/;
    const ASSET_VERSION = '20260814-4';
    const DEFAULT_OVERLAY_URL = `data/advising-curriculum.json?v=${ASSET_VERSION}`;
    const DEFAULT_CATALOG_URL = `data/course-catalog.json?v=${ASSET_VERSION}`;

    function fail(path, message) {
        throw new Error(`Invalid advising curriculum at ${path}: ${message}`);
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function requireObject(value, path) {
        if (!isObject(value)) {
            fail(path, 'expected an object');
        }
        return value;
    }

    function requireArray(value, path) {
        if (!Array.isArray(value)) {
            fail(path, 'expected an array');
        }
        return value;
    }

    function requireString(value, path) {
        if (typeof value !== 'string' || value.trim() === '') {
            fail(path, 'expected a non-empty string');
        }
        return value.trim();
    }

    function requireDate(value, path) {
        const date = requireString(value, path);
        if (!DATE_PATTERN.test(date)) {
            fail(path, 'expected a YYYY-MM-DD date');
        }
        return date;
    }

    function requirePositiveNumber(value, path, options) {
        const settings = options || {};
        if (settings.allowNull && value === null) {
            return null;
        }
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            fail(path, 'expected a positive number');
        }
        if (settings.integer && !Number.isInteger(value)) {
            fail(path, 'expected a positive integer');
        }
        return value;
    }

    function requireBoolean(value, path) {
        if (typeof value !== 'boolean') {
            fail(path, 'expected a boolean');
        }
        return value;
    }

    function canonicalCourseCode(value, path) {
        const code = requireString(value, path).toUpperCase().replace(/\s+/g, ' ');
        if (!COURSE_CODE_PATTERN.test(code)) {
            fail(path, `invalid course code "${code}"`);
        }
        return code;
    }

    function uniqueStrings(values, path, mapper) {
        const result = [];
        const seen = new Set();
        requireArray(values, path).forEach((value, index) => {
            const normalized = mapper
                ? mapper(value, `${path}[${index}]`)
                : requireString(value, `${path}[${index}]`);
            if (seen.has(normalized)) {
                fail(path, `duplicate value "${normalized}"`);
            }
            seen.add(normalized);
            result.push(normalized);
        });
        return result;
    }

    function deepFreeze(value, seen) {
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
            return value;
        }
        const visited = seen || new WeakSet();
        if (visited.has(value)) {
            return value;
        }
        visited.add(value);
        Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key], visited));
        return Object.freeze(value);
    }

    function normalizeReviewState(value, path, allowedStates) {
        const state = requireString(value, path);
        if (!allowedStates.has(state)) {
            fail(path, `unsupported review state "${state}"`);
        }
        return state;
    }

    function normalizeSources(rawSources) {
        const sources = Object.create(null);
        requireArray(rawSources, 'sources').forEach((rawSource, index) => {
            const path = `sources[${index}]`;
            const source = requireObject(rawSource, path);
            const id = requireString(source.id, `${path}.id`);
            if (sources[id]) {
                fail(`${path}.id`, `duplicate source ID "${id}"`);
            }
            const url = source.url === undefined ? undefined : requireString(source.url, `${path}.url`);
            const sourcePath = source.path === undefined ? undefined : requireString(source.path, `${path}.path`);
            if (!url && !sourcePath) {
                fail(path, 'expected either url or path');
            }
            sources[id] = {
                id,
                label: requireString(source.label, `${path}.label`),
                ...(url ? { url } : {}),
                ...(sourcePath ? { path: sourcePath } : {}),
                version: requireString(source.version, `${path}.version`),
                capturedOn: requireDate(source.capturedOn, `${path}.capturedOn`),
                reviewedOn: requireDate(source.reviewedOn, `${path}.reviewedOn`),
                reviewedBy: requireString(source.reviewedBy, `${path}.reviewedBy`),
                reviewState: normalizeReviewState(
                    source.reviewState,
                    `${path}.reviewState`,
                    SOURCE_REVIEW_STATES
                )
            };
        });
        if (Object.keys(sources).length === 0) {
            fail('sources', 'expected at least one source');
        }
        return sources;
    }

    function normalizeSourceIds(values, path, sources) {
        const ids = uniqueStrings(values, path);
        if (ids.length === 0) {
            fail(path, 'expected at least one source ID');
        }
        ids.forEach((id) => {
            if (!sources[id]) {
                fail(path, `missing source registry entry "${id}"`);
            }
        });
        return ids.sort();
    }

    function normalizeIssueIds(values, path, knownIssueIds) {
        const ids = uniqueStrings(values === undefined ? [] : values, path);
        ids.forEach((id) => {
            if (!knownIssueIds.has(id)) {
                fail(path, `missing issue entry "${id}"`);
            }
        });
        return ids.sort();
    }

    function normalizeManualIssues(rawIssues, sources) {
        const issueIds = new Set();
        const issues = requireArray(rawIssues === undefined ? [] : rawIssues, 'issues').map((rawIssue, index) => {
            const path = `issues[${index}]`;
            const issue = requireObject(rawIssue, path);
            const id = requireString(issue.id, `${path}.id`);
            if (issueIds.has(id)) {
                fail(`${path}.id`, `duplicate issue ID "${id}"`);
            }
            issueIds.add(id);
            const status = requireString(issue.status, `${path}.status`);
            if (status !== 'advisor-review-required') {
                fail(`${path}.status`, 'expected "advisor-review-required"');
            }
            const planningImpact = issue.planningImpact === undefined
                ? 'blocking'
                : requireString(issue.planningImpact, `${path}.planningImpact`);
            if (planningImpact !== 'blocking' && planningImpact !== 'informational') {
                fail(`${path}.planningImpact`, 'expected "blocking" or "informational"');
            }
            return {
                id,
                type: requireString(issue.type, `${path}.type`),
                status,
                planningImpact,
                summary: requireString(issue.summary, `${path}.summary`),
                details: requireString(issue.details, `${path}.details`),
                owner: requireString(issue.owner, `${path}.owner`),
                approvalNeeded: requireString(issue.approvalNeeded, `${path}.approvalNeeded`),
                approvedVersion: issue.approvedVersion === null || issue.approvedVersion === undefined
                    ? null
                    : requireString(issue.approvedVersion, `${path}.approvedVersion`),
                resolutionState: requireString(issue.resolutionState || 'open', `${path}.resolutionState`),
                affectedCourseCodes: uniqueStrings(
                    issue.affectedCourseCodes === undefined ? [] : issue.affectedCourseCodes,
                    `${path}.affectedCourseCodes`,
                    canonicalCourseCode
                ).sort(),
                lensIds: uniqueStrings(
                    issue.lensIds === undefined ? [] : issue.lensIds,
                    `${path}.lensIds`
                ).sort(),
                sourceIds: normalizeSourceIds(issue.sourceIds, `${path}.sourceIds`, sources),
                reviewedOn: requireDate(issue.reviewedOn, `${path}.reviewedOn`),
                reviewedBy: requireString(issue.reviewedBy, `${path}.reviewedBy`)
            };
        });
        return { issues, issueIds };
    }

    function normalizeCourseCatalog(rawCatalog, overlay, sources, issueIds) {
        const catalog = requireObject(rawCatalog, 'courseCatalog');
        const catalogCourses = requireArray(catalog.courses, 'courseCatalog.courses');
        const catalogSourceId = requireString(overlay.courseCatalogSourceId, 'courseCatalogSourceId');
        if (!sources[catalogSourceId]) {
            fail('courseCatalogSourceId', `missing source registry entry "${catalogSourceId}"`);
        }
        const lastModified = requireDate(catalog.lastModified, 'courseCatalog.lastModified');
        if (sources[catalogSourceId].version !== lastModified) {
            fail(
                `sources.${catalogSourceId}.version`,
                `expected course catalog lastModified "${lastModified}"`
            );
        }
        const courseSourceIds = normalizeSourceIds(overlay.courseSourceIds, 'courseSourceIds', sources);
        const courses = Object.create(null);

        catalogCourses.forEach((rawCourse, index) => {
            const path = `courseCatalog.courses[${index}]`;
            const course = requireObject(rawCourse, path);
            const code = canonicalCourseCode(course.code, `${path}.code`);
            if (courses[code]) {
                fail(`${path}.code`, `duplicate course code "${code}"`);
            }
            const credits = course.defaultCredits === undefined || course.defaultCredits === null
                ? null
                : requirePositiveNumber(course.defaultCredits, `${path}.defaultCredits`);
            const hasTitle = typeof course.title === 'string' && course.title.trim() !== '';
            const offeredQuarters = uniqueStrings(
                course.offeredQuarters === undefined ? [] : course.offeredQuarters,
                `${path}.offeredQuarters`
            );
            courses[code] = {
                code,
                title: hasTitle ? course.title.trim() : code,
                titleReviewState: hasTitle ? 'approved' : 'unsupported',
                credits,
                offeredQuarters,
                prerequisites: uniqueStrings(
                    course.prerequisites === undefined ? [] : course.prerequisites,
                    `${path}.prerequisites`,
                    canonicalCourseCode
                ).sort(),
                corequisites: uniqueStrings(
                    course.corequisites === undefined ? [] : course.corequisites,
                    `${path}.corequisites`,
                    canonicalCourseCode
                ).sort(),
                standingRequired: course.standingRequired === undefined
                    ? null
                    : requireString(course.standingRequired, `${path}.standingRequired`),
                external: false,
                conditionOnly: false,
                sourceIds: courseSourceIds.slice(),
                reviewState: 'approved',
                offeringReviewState: offeredQuarters.length === 0 ? 'unsupported' : 'approved',
                issues: [],
                ...(typeof course.creditRange === 'string' ? { creditRange: course.creditRange } : {}),
                ...(course.isVariable === true ? { isVariable: true } : {})
            };
        });

        requireArray(
            overlay.externalCourses === undefined ? [] : overlay.externalCourses,
            'externalCourses'
        ).forEach((rawCourse, index) => {
            const path = `externalCourses[${index}]`;
            const course = requireObject(rawCourse, path);
            const code = canonicalCourseCode(course.code, `${path}.code`);
            if (courses[code]) {
                fail(`${path}.code`, `duplicate course code "${code}"`);
            }
            if (course.external !== true) {
                fail(`${path}.external`, 'external courses must set external to true');
            }
            const conditionOnly = course.conditionOnly === true;
            const credits = requirePositiveNumber(course.credits, `${path}.credits`, { allowNull: conditionOnly });
            courses[code] = {
                code,
                title: requireString(course.title, `${path}.title`),
                titleReviewState: 'approved',
                credits,
                offeredQuarters: uniqueStrings(
                    course.offeredQuarters === undefined ? [] : course.offeredQuarters,
                    `${path}.offeredQuarters`
                ),
                prerequisites: uniqueStrings(
                    course.prerequisites === undefined ? [] : course.prerequisites,
                    `${path}.prerequisites`,
                    canonicalCourseCode
                ).sort(),
                corequisites: uniqueStrings(
                    course.corequisites === undefined ? [] : course.corequisites,
                    `${path}.corequisites`,
                    canonicalCourseCode
                ).sort(),
                standingRequired: course.standingRequired === undefined
                    ? null
                    : requireString(course.standingRequired, `${path}.standingRequired`),
                external: true,
                conditionOnly,
                sourceIds: normalizeSourceIds(course.sourceIds, `${path}.sourceIds`, sources),
                reviewState: normalizeReviewState(
                    course.reviewState,
                    `${path}.reviewState`,
                    RULE_REVIEW_STATES
                ),
                offeringReviewState: course.offeringReviewState === undefined
                    ? 'approved'
                    : normalizeReviewState(
                        course.offeringReviewState,
                        `${path}.offeringReviewState`,
                        RULE_REVIEW_STATES
                    ),
                issues: normalizeIssueIds(course.issueIds, `${path}.issueIds`, issueIds)
            };
        });

        Object.values(courses).forEach((course) => {
            course.prerequisites.forEach((prerequisite) => {
                if (!courses[prerequisite]) {
                    fail(
                        `courses.${course.code}.prerequisites`,
                        `unexplained non-external course code "${prerequisite}"`
                    );
                }
            });
            course.corequisites.forEach((corequisite) => {
                if (!courses[corequisite]) {
                    fail(
                        `courses.${course.code}.corequisites`,
                        `unexplained non-external course code "${corequisite}"`
                    );
                }
                if (!courses[corequisite].corequisites.includes(course.code)) {
                    fail(
                        `courses.${course.code}.corequisites`,
                        `corequisite relationship with "${corequisite}" must be reciprocal`
                    );
                }
            });
        });

        return { courses, catalogSourceId, lastModified };
    }

    function normalizeRequirementGroup(rawGroup, path, context) {
        const group = requireObject(rawGroup, path);
        const id = requireString(group.id, `${path}.id`);
        if (context.groupIds.has(id)) {
            fail(`${path}.id`, `duplicate requirement group ID "${id}"`);
        }
        context.groupIds.add(id);
        const type = requireString(group.type, `${path}.type`);
        if (type !== 'all-of' && type !== 'choose-N') {
            fail(`${path}.type`, 'expected "all-of" or "choose-N"');
        }

        const rawOptions = group.options === undefined ? [] : requireArray(group.options, `${path}.options`);
        if (type === 'all-of' && rawOptions.length > 0) {
            fail(`${path}.options`, 'all-of groups cannot define alternatives');
        }
        if (rawOptions.length > 0 && group.courses !== undefined) {
            fail(path, 'choose-N groups must define courses or options, not both');
        }

        const optionIds = new Set();
        const options = rawOptions.map((rawOption, optionIndex) => {
            const optionPath = `${path}.options[${optionIndex}]`;
            const option = requireObject(rawOption, optionPath);
            const optionId = requireString(option.id, `${optionPath}.id`);
            if (optionIds.has(optionId)) {
                fail(`${optionPath}.id`, `duplicate option ID "${optionId}"`);
            }
            optionIds.add(optionId);
            const courses = uniqueStrings(
                option.courses,
                `${optionPath}.courses`,
                canonicalCourseCode
            ).sort();
            if (courses.length === 0) {
                fail(`${optionPath}.courses`, 'expected at least one course');
            }
            return {
                id: optionId,
                label: requireString(option.label, `${optionPath}.label`),
                courses
            };
        });

        const courses = options.length > 0
            ? uniqueStrings(
                options.flatMap((option) => option.courses),
                `${path}.options.courses`,
                canonicalCourseCode
            ).sort()
            : uniqueStrings(group.courses, `${path}.courses`, canonicalCourseCode).sort();
        if (courses.length === 0) {
            fail(`${path}.courses`, 'expected at least one course');
        }
        courses.forEach((code) => {
            if (!context.courses[code]) {
                fail(`${path}.courses`, `unexplained non-external course code "${code}"`);
            }
        });

        let count;
        if (type === 'all-of') {
            if (group.count !== undefined) {
                fail(`${path}.count`, 'all-of groups do not accept count');
            }
            count = courses.length;
        } else {
            count = requirePositiveNumber(group.count, `${path}.count`, { integer: true });
            const choiceCount = options.length > 0 ? options.length : courses.length;
            if (count > choiceCount) {
                fail(`${path}.count`, `cannot choose ${count} from ${choiceCount} alternatives`);
            }
        }

        return {
            id,
            label: requireString(group.label, `${path}.label`),
            type,
            count,
            courses,
            options,
            conditionOnly: group.conditionOnly === true,
            sourceIds: normalizeSourceIds(group.sourceIds, `${path}.sourceIds`, context.sources),
            reviewState: normalizeReviewState(
                group.reviewState,
                `${path}.reviewState`,
                RULE_REVIEW_STATES
            ),
            issues: normalizeIssueIds(group.issueIds, `${path}.issueIds`, context.issueIds)
        };
    }

    function normalizeGroups(rawGroups, path, context) {
        return requireArray(rawGroups === undefined ? [] : rawGroups, path).map((group, index) => (
            normalizeRequirementGroup(group, `${path}[${index}]`, context)
        ));
    }

    function normalizeBdes(rawBdes, context) {
        const bdes = requireObject(rawBdes, 'curriculum.bdes');
        const requirementGroups = normalizeGroups(
            bdes.requirementGroups,
            'curriculum.bdes.requirementGroups',
            context
        );
        if (requirementGroups.length === 0) {
            fail('curriculum.bdes.requirementGroups', 'expected at least one group');
        }
        const electiveCourseCodes = uniqueStrings(
            bdes.electiveCourseCodes,
            'curriculum.bdes.electiveCourseCodes',
            canonicalCourseCode
        ).sort();
        electiveCourseCodes.forEach((code) => {
            if (!context.courses[code]) {
                fail(
                    'curriculum.bdes.electiveCourseCodes',
                    `unexplained non-external course code "${code}"`
                );
            }
        });
        const rawElectivePlaceholder = requireObject(
            bdes.electivePlaceholder,
            'curriculum.bdes.electivePlaceholder'
        );
        const electivePlaceholder = {
            idPrefix: requireString(
                rawElectivePlaceholder.idPrefix,
                'curriculum.bdes.electivePlaceholder.idPrefix'
            ),
            label: requireString(
                rawElectivePlaceholder.label,
                'curriculum.bdes.electivePlaceholder.label'
            ),
            credits: requirePositiveNumber(
                rawElectivePlaceholder.credits,
                'curriculum.bdes.electivePlaceholder.credits'
            ),
            count: requirePositiveNumber(
                rawElectivePlaceholder.count,
                'curriculum.bdes.electivePlaceholder.count',
                { integer: true }
            ),
            kind: requireString(
                rawElectivePlaceholder.kind,
                'curriculum.bdes.electivePlaceholder.kind'
            ),
            sourceIds: normalizeSourceIds(
                rawElectivePlaceholder.sourceIds,
                'curriculum.bdes.electivePlaceholder.sourceIds',
                context.sources
            ),
            reviewState: normalizeReviewState(
                rawElectivePlaceholder.reviewState,
                'curriculum.bdes.electivePlaceholder.reviewState',
                RULE_REVIEW_STATES
            ),
            issues: normalizeIssueIds(
                rawElectivePlaceholder.issueIds,
                'curriculum.bdes.electivePlaceholder.issueIds',
                context.issueIds
            )
        };
        if (electivePlaceholder.kind !== 'major-elective') {
            fail('curriculum.bdes.electivePlaceholder.kind', 'expected "major-elective"');
        }
        const electiveCredits = requirePositiveNumber(
            bdes.electiveCredits,
            'curriculum.bdes.electiveCredits'
        );
        if (electivePlaceholder.credits * electivePlaceholder.count !== electiveCredits) {
            fail(
                'curriculum.bdes.electivePlaceholder',
                'placeholder credits and count must equal curriculum.bdes.electiveCredits'
            );
        }
        return {
            creditsRequired: requirePositiveNumber(bdes.creditsRequired, 'curriculum.bdes.creditsRequired'),
            fixedCredits: requirePositiveNumber(bdes.fixedCredits, 'curriculum.bdes.fixedCredits'),
            electiveCredits,
            requirementGroups,
            electiveCourseCodes,
            electivePlaceholder,
            supportRequirements: normalizeGroups(
                bdes.supportRequirements,
                'curriculum.bdes.supportRequirements',
                context
            ),
            sourceIds: normalizeSourceIds(bdes.sourceIds, 'curriculum.bdes.sourceIds', context.sources),
            reviewState: normalizeReviewState(
                bdes.reviewState,
                'curriculum.bdes.reviewState',
                RULE_REVIEW_STATES
            )
        };
    }

    function normalizeDegreeRequirements(rawRequirements, context) {
        const path = 'curriculum.degreeRequirements';
        const requirements = requireObject(rawRequirements, path);
        const totalCredits = requirePositiveNumber(requirements.totalCredits, `${path}.totalCredits`);
        const upperDivisionCredits = requirePositiveNumber(
            requirements.upperDivisionCredits,
            `${path}.upperDivisionCredits`
        );
        if (upperDivisionCredits > totalCredits) {
            fail(`${path}.upperDivisionCredits`, 'cannot exceed totalCredits');
        }
        const overlapPolicy = requireString(requirements.overlapPolicy, `${path}.overlapPolicy`);
        if (overlapPolicy !== 'one-course-one-slot') {
            fail(`${path}.overlapPolicy`, 'expected "one-course-one-slot"');
        }

        const placeholderIds = new Set();
        const pendingPrerequisites = [];
        const placeholders = requireArray(requirements.placeholders, `${path}.placeholders`).map(
            (rawPlaceholder, index) => {
                const placeholderPath = `${path}.placeholders[${index}]`;
                const placeholder = requireObject(rawPlaceholder, placeholderPath);
                const id = requireString(placeholder.id, `${placeholderPath}.id`);
                if (placeholderIds.has(id)) {
                    fail(`${placeholderPath}.id`, `duplicate placeholder ID "${id}"`);
                }
                placeholderIds.add(id);
                const kind = requireString(placeholder.kind, `${placeholderPath}.kind`);
                if (kind !== 'gen-ed') {
                    fail(`${placeholderPath}.kind`, 'expected "gen-ed"');
                }
                if (placeholder.degreeWorksVerification !== true) {
                    fail(`${placeholderPath}.degreeWorksVerification`, 'expected true');
                }
                const satisfiedByCourseCodes = uniqueStrings(
                    placeholder.satisfiedByCourseCodes === undefined
                        ? []
                        : placeholder.satisfiedByCourseCodes,
                    `${placeholderPath}.satisfiedByCourseCodes`,
                    canonicalCourseCode
                ).sort();
                const representsCourseCodes = uniqueStrings(
                    placeholder.representsCourseCodes === undefined
                        ? []
                        : placeholder.representsCourseCodes,
                    `${placeholderPath}.representsCourseCodes`,
                    canonicalCourseCode
                ).sort();
                satisfiedByCourseCodes.concat(representsCourseCodes).forEach((code) => {
                    if (!context.courses[code]) {
                        fail(
                            `${placeholderPath}.satisfiedByCourseCodes`,
                            `unexplained non-external course code "${code}"`
                        );
                    }
                });
                const prerequisitePlaceholderIds = uniqueStrings(
                    placeholder.prerequisitePlaceholderIds === undefined
                        ? []
                        : placeholder.prerequisitePlaceholderIds,
                    `${placeholderPath}.prerequisitePlaceholderIds`
                );
                pendingPrerequisites.push({ placeholderPath, prerequisitePlaceholderIds });
                return {
                    id,
                    label: requireString(placeholder.label, `${placeholderPath}.label`),
                    credits: requirePositiveNumber(placeholder.credits, `${placeholderPath}.credits`),
                    kind,
                    category: requireString(placeholder.category, `${placeholderPath}.category`),
                    guidance: requireString(placeholder.guidance, `${placeholderPath}.guidance`),
                    degreeWorksVerification: true,
                    satisfiedByCourseCodes,
                    representsCourseCodes,
                    prerequisitePlaceholderIds,
                    sourceIds: normalizeSourceIds(
                        placeholder.sourceIds,
                        `${placeholderPath}.sourceIds`,
                        context.sources
                    ),
                    reviewState: normalizeReviewState(
                        placeholder.reviewState,
                        `${placeholderPath}.reviewState`,
                        RULE_REVIEW_STATES
                    ),
                    issues: normalizeIssueIds(
                        placeholder.issueIds,
                        `${placeholderPath}.issueIds`,
                        context.issueIds
                    )
                };
            }
        );
        if (placeholders.length === 0) {
            fail(`${path}.placeholders`, 'expected at least one placeholder');
        }
        pendingPrerequisites.forEach(({ placeholderPath, prerequisitePlaceholderIds }) => {
            prerequisitePlaceholderIds.forEach((id) => {
                if (!placeholderIds.has(id)) {
                    fail(`${placeholderPath}.prerequisitePlaceholderIds`, `unknown placeholder ID "${id}"`);
                }
            });
        });

        const rawOpenCredits = requireObject(
            requirements.openDegreeCredits,
            `${path}.openDegreeCredits`
        );
        const openDegreeCredits = {
            idPrefix: requireString(rawOpenCredits.idPrefix, `${path}.openDegreeCredits.idPrefix`),
            label: requireString(rawOpenCredits.label, `${path}.openDegreeCredits.label`),
            creditsPerSlot: requirePositiveNumber(
                rawOpenCredits.creditsPerSlot,
                `${path}.openDegreeCredits.creditsPerSlot`
            ),
            kind: requireString(rawOpenCredits.kind, `${path}.openDegreeCredits.kind`),
            calculation: requireString(
                rawOpenCredits.calculation,
                `${path}.openDegreeCredits.calculation`
            ),
            sourceIds: normalizeSourceIds(
                rawOpenCredits.sourceIds,
                `${path}.openDegreeCredits.sourceIds`,
                context.sources
            ),
            reviewState: normalizeReviewState(
                rawOpenCredits.reviewState,
                `${path}.openDegreeCredits.reviewState`,
                RULE_REVIEW_STATES
            ),
            issues: normalizeIssueIds(
                rawOpenCredits.issueIds,
                `${path}.openDegreeCredits.issueIds`,
                context.issueIds
            )
        };
        if (openDegreeCredits.kind !== 'open-elective') {
            fail(`${path}.openDegreeCredits.kind`, 'expected "open-elective"');
        }
        if (openDegreeCredits.calculation !== 'remainder-to-total') {
            fail(`${path}.openDegreeCredits.calculation`, 'expected "remainder-to-total"');
        }

        return {
            totalCredits,
            upperDivisionCredits,
            minimumCumulativeGpa: requirePositiveNumber(
                requirements.minimumCumulativeGpa,
                `${path}.minimumCumulativeGpa`
            ),
            minimumMajorGpa: requirePositiveNumber(
                requirements.minimumMajorGpa,
                `${path}.minimumMajorGpa`
            ),
            overlapPolicy,
            placeholders,
            openDegreeCredits,
            sourceIds: normalizeSourceIds(requirements.sourceIds, `${path}.sourceIds`, context.sources),
            reviewState: normalizeReviewState(
                requirements.reviewState,
                `${path}.reviewState`,
                RULE_REVIEW_STATES
            ),
            issues: normalizeIssueIds(requirements.issueIds, `${path}.issueIds`, context.issueIds)
        };
    }

    function normalizeLenses(rawLenses, context) {
        const lensIds = new Set();
        const lenses = requireArray(rawLenses, 'lenses').map((rawLens, index) => {
            const path = `lenses[${index}]`;
            const lens = requireObject(rawLens, path);
            const id = requireString(lens.id, `${path}.id`);
            if (lensIds.has(id)) {
                fail(`${path}.id`, `duplicate lens ID "${id}"`);
            }
            lensIds.add(id);
            const requirementGroups = normalizeGroups(
                lens.requirementGroups,
                `${path}.requirementGroups`,
                context
            );
            if (requirementGroups.length === 0) {
                fail(`${path}.requirementGroups`, 'expected at least one group');
            }
            return {
                id,
                name: requireString(lens.name, `${path}.name`),
                kind: requireString(lens.kind, `${path}.kind`),
                credits: requirePositiveNumber(lens.credits, `${path}.credits`),
                requirementGroups,
                supportRequirements: normalizeGroups(
                    lens.supportRequirements,
                    `${path}.supportRequirements`,
                    context
                ),
                sourceIds: normalizeSourceIds(lens.sourceIds, `${path}.sourceIds`, context.sources),
                reviewState: normalizeReviewState(
                    lens.reviewState,
                    `${path}.reviewState`,
                    RULE_REVIEW_STATES
                ),
                issues: normalizeIssueIds(lens.issueIds, `${path}.issueIds`, context.issueIds)
            };
        });
        if (lenses.length === 0) {
            fail('lenses', 'expected at least one lens');
        }
        return { lenses: lenses.sort((a, b) => a.id.localeCompare(b.id)), lensIds };
    }

    function normalizePlanningLimits(rawLimits, sources) {
        const limits = requireObject(rawLimits, 'planningLimits');
        const terms = uniqueStrings(limits.terms, 'planningLimits.terms');
        const startTerm = requireString(limits.startTerm, 'planningLimits.startTerm');
        if (!terms.includes(startTerm)) {
            fail('planningLimits.startTerm', 'must be included in planningLimits.terms');
        }
        return {
            startTerm,
            terms,
            normalTerms: requirePositiveNumber(
                limits.normalTerms,
                'planningLimits.normalTerms',
                { integer: true }
            ),
            extensionTerms: requirePositiveNumber(
                limits.extensionTerms,
                'planningLimits.extensionTerms',
                { integer: true }
            ),
            maxCreditsPerTerm: requirePositiveNumber(
                limits.maxCreditsPerTerm,
                'planningLimits.maxCreditsPerTerm'
            ),
            maxSearchNodes: requirePositiveNumber(
                limits.maxSearchNodes,
                'planningLimits.maxSearchNodes',
                { integer: true }
            ),
            sourceIds: normalizeSourceIds(limits.sourceIds, 'planningLimits.sourceIds', sources),
            reviewState: normalizeReviewState(
                limits.reviewState,
                'planningLimits.reviewState',
                RULE_REVIEW_STATES
            )
        };
    }

    function collectAdvisingCourseCodes(curriculum, lenses) {
        const codes = new Set(curriculum.bdes.electiveCourseCodes);
        const groups = curriculum.bdes.requirementGroups
            .concat(curriculum.bdes.supportRequirements)
            .concat(lenses.flatMap((lens) => (
                lens.requirementGroups.concat(lens.supportRequirements)
            )));
        groups.forEach((group) => group.courses.forEach((code) => codes.add(code)));
        return new Set(
            [...codes].filter((code) => !curriculum.courses[code].conditionOnly)
        );
    }

    function normalizeCourseOfferingEvidence(rawEvidence, context, requiredCourseCodes) {
        const path = 'courseOfferingEvidence';
        const evidence = requireObject(rawEvidence, path);
        const method = requireString(evidence.method, `${path}.method`);
        if (method !== 'dated-department-pattern-cross-checked-against-observed-enrollment') {
            fail(`${path}.method`, 'unsupported offering evidence method');
        }
        const coverageQuarters = uniqueStrings(
            evidence.coverageQuarters,
            `${path}.coverageQuarters`
        );
        const coverageSet = new Set(coverageQuarters);
        const evidenceCodes = new Set();
        const courses = requireArray(evidence.courses, `${path}.courses`).map(
            (rawCourse, index) => {
                const coursePath = `${path}.courses[${index}]`;
                const raw = requireObject(rawCourse, coursePath);
                const code = canonicalCourseCode(raw.code, `${coursePath}.code`);
                if (evidenceCodes.has(code)) {
                    fail(`${coursePath}.code`, `duplicate offering evidence for "${code}"`);
                }
                evidenceCodes.add(code);
                const course = context.courses[code];
                if (!course) {
                    fail(`${coursePath}.code`, `unexplained non-external course code "${code}"`);
                }
                if (!requiredCourseCodes.has(code)) {
                    fail(`${coursePath}.code`, `course "${code}" is not used by advising`);
                }
                const normalQuarters = uniqueStrings(
                    raw.normalQuarters,
                    `${coursePath}.normalQuarters`
                );
                normalQuarters.forEach((quarter) => {
                    if (!coverageSet.has(quarter)) {
                        fail(
                            `${coursePath}.normalQuarters`,
                            `quarter "${quarter}" is outside evidence coverage`
                        );
                    }
                });
                const observedTerms = uniqueStrings(
                    raw.observedTerms,
                    `${coursePath}.observedTerms`
                );
                observedTerms.forEach((term) => {
                    if (!ACADEMIC_TERM_PATTERN.test(term)) {
                        fail(`${coursePath}.observedTerms`, `invalid academic term "${term}"`);
                    }
                    const quarter = term.split(' ')[1];
                    if (!coverageSet.has(quarter)) {
                        fail(
                            `${coursePath}.observedTerms`,
                            `term "${term}" is outside evidence coverage`
                        );
                    }
                });
                const winter2026Observed = requireBoolean(
                    raw.winter2026Observed,
                    `${coursePath}.winter2026Observed`
                );
                if (winter2026Observed !== observedTerms.includes('2025-26 Winter')) {
                    fail(
                        `${coursePath}.winter2026Observed`,
                        'must match the 2025-26 Winter observed term'
                    );
                }
                const sourceIds = normalizeSourceIds(
                    raw.sourceIds,
                    `${coursePath}.sourceIds`,
                    context.sources
                );
                const reviewState = normalizeReviewState(
                    raw.reviewState,
                    `${coursePath}.reviewState`,
                    RULE_REVIEW_STATES
                );
                const issues = normalizeIssueIds(
                    raw.issueIds,
                    `${coursePath}.issueIds`,
                    context.issueIds
                );
                course.offeredQuarters = normalQuarters.slice();
                course.offeringReviewState = reviewState;
                course.issues = [...new Set(course.issues.concat(issues))].sort();
                course.offeringEvidence = {
                    normalQuarters: normalQuarters.slice(),
                    observedTerms,
                    winter2026Observed,
                    sourceIds,
                    reviewState,
                    issues: issues.slice()
                };
                return { code, ...course.offeringEvidence };
            }
        );

        requiredCourseCodes.forEach((code) => {
            if (!evidenceCodes.has(code)) {
                fail(`${path}.courses`, `missing offering evidence for "${code}"`);
            }
        });
        return {
            method,
            asOf: requireDate(evidence.asOf, `${path}.asOf`),
            coverageQuarters,
            courses: courses.sort((left, right) => left.code.localeCompare(right.code))
        };
    }

    function detectPrerequisiteCycles(courses) {
        const visiting = new Set();
        const visited = new Set();

        function visit(code, trail) {
            if (visiting.has(code)) {
                const cycleStart = trail.indexOf(code);
                const cycle = trail.slice(cycleStart).concat(code);
                fail('courses', `prerequisite cycle detected: ${cycle.join(' -> ')}`);
            }
            if (visited.has(code)) {
                return;
            }
            visiting.add(code);
            const course = courses[code];
            course.prerequisites.forEach((prerequisite) => visit(prerequisite, trail.concat(code)));
            visiting.delete(code);
            visited.add(code);
        }

        Object.keys(courses).sort().forEach((code) => visit(code, []));
    }

    function issueCoversEntity(issues, entity) {
        const issueSet = new Set(entity.issues || []);
        return issueSet.size > 0 && issues.some((issue) => issueSet.has(issue.id));
    }

    function issueCoversSource(issues, sourceId) {
        return issues.some((issue) => issue.sourceIds.includes(sourceId));
    }

    function makeStateIssue(id, type, summary, details, entity, sources, extras) {
        const firstSource = sources[entity.sourceIds[0]];
        const additions = extras || {};
        return {
            id,
            type,
            status: 'advisor-review-required',
            planningImpact: 'blocking',
            summary,
            details,
            owner: 'EWU Design Department curriculum owner',
            approvalNeeded: 'Review the cited fact and record an approved source version before clearing this warning.',
            approvedVersion: null,
            resolutionState: 'open',
            affectedCourseCodes: (additions.affectedCourseCodes || []).slice().sort(),
            lensIds: (additions.lensIds || []).slice().sort(),
            sourceIds: entity.sourceIds.slice().sort(),
            reviewedOn: firstSource.reviewedOn,
            reviewedBy: firstSource.reviewedBy
        };
    }

    function appendDerivedIssues(manualIssues, snapshotParts) {
        const issues = manualIssues.slice();
        const ids = new Set(issues.map((issue) => issue.id));
        const { sources, courses, curriculum, lenses, planningLimits } = snapshotParts;

        function add(issue) {
            if (!ids.has(issue.id)) {
                ids.add(issue.id);
                issues.push(issue);
            }
        }

        Object.values(sources).forEach((source) => {
            if (source.reviewState !== 'approved' && !issueCoversSource(issues, source.id)) {
                add(makeStateIssue(
                    `source-${source.id}-${source.reviewState}`,
                    source.reviewState,
                    `${source.label} is ${source.reviewState}.`,
                    'The source remains usable for an advisor preview but cannot support an authoritative feasibility claim.',
                    { sourceIds: [source.id] },
                    sources
                ));
            }
        });

        function inspectReviewable(entity, id, label, extras) {
            if (entity.reviewState !== 'approved' && !issueCoversEntity(issues, entity)) {
                add(makeStateIssue(
                    `${id}-${entity.reviewState}`,
                    entity.reviewState,
                    `${label} is ${entity.reviewState}.`,
                    'This rule is preserved for advisor review and does not become an unsupported possible or impossible claim.',
                    entity,
                    sources,
                    extras
                ));
            }
        }

        inspectReviewable(curriculum, 'curriculum', curriculum.name);
        inspectReviewable(curriculum.bdes, 'bdes', 'BDes requirements');
        inspectReviewable(
            curriculum.bdes.electivePlaceholder,
            'bdes-elective-placeholder',
            curriculum.bdes.electivePlaceholder.label
        );
        curriculum.bdes.requirementGroups.concat(curriculum.bdes.supportRequirements).forEach((group) => {
            inspectReviewable(
                group,
                `group-${group.id}`,
                group.label,
                { affectedCourseCodes: group.courses }
            );
        });
        inspectReviewable(
            curriculum.degreeRequirements,
            'degree-requirements',
            'Degree requirements'
        );
        curriculum.degreeRequirements.placeholders.forEach((placeholder) => {
            inspectReviewable(
                placeholder,
                `degree-placeholder-${placeholder.id}`,
                placeholder.label,
                { affectedCourseCodes: placeholder.satisfiedByCourseCodes }
            );
        });
        inspectReviewable(
            curriculum.degreeRequirements.openDegreeCredits,
            'open-degree-credits',
            curriculum.degreeRequirements.openDegreeCredits.label
        );
        inspectReviewable(planningLimits, 'planning-limits', 'Advising planning limits');

        lenses.forEach((lens) => {
            inspectReviewable(lens, `lens-${lens.id}`, lens.name, { lensIds: [lens.id] });
            lens.requirementGroups.concat(lens.supportRequirements).forEach((group) => {
                inspectReviewable(
                    group,
                    `group-${group.id}`,
                    group.label,
                    { affectedCourseCodes: group.courses, lensIds: [lens.id] }
                );
            });
        });

        Object.values(courses).forEach((course) => {
            inspectReviewable(
                course,
                `course-${course.code.replace(/\s+/g, '-').toLowerCase()}`,
                course.code,
                { affectedCourseCodes: [course.code] }
            );
            if (
                !course.conditionOnly
                && course.offeringReviewState !== 'approved'
                && !issueCoversEntity(issues, course)
            ) {
                const offeringEntity = course.offeringEvidence
                    ? { ...course, sourceIds: course.offeringEvidence.sourceIds }
                    : course;
                add(makeStateIssue(
                    `course-${course.code.replace(/\s+/g, '-').toLowerCase()}-offerings`,
                    course.offeringReviewState,
                    `${course.code} usual offerings are ${course.offeringReviewState}.`,
                    course.offeredQuarters.length === 0
                        ? 'The course remains visible but cannot be placed into a generic quarter without reviewed offering data.'
                        : 'The dated pattern is preserved for preview, but an advisor must review it before relying on feasibility.',
                    offeringEntity,
                    sources,
                    { affectedCourseCodes: [course.code] }
                ));
            }
            if (course.credits === null && !course.conditionOnly) {
                add(makeStateIssue(
                    `course-${course.code.replace(/\s+/g, '-').toLowerCase()}-credits`,
                    'unsupported',
                    `${course.code} credits are unavailable.`,
                    'The course remains visible but cannot support a credit-load claim.',
                    course,
                    sources,
                    { affectedCourseCodes: [course.code] }
                ));
            }
            if (course.titleReviewState !== 'approved' && !issueCoversEntity(issues, course)) {
                add(makeStateIssue(
                    `course-${course.code.replace(/\s+/g, '-').toLowerCase()}-title`,
                    course.titleReviewState,
                    `${course.code} title is unavailable.`,
                    'The course code is preserved, but the display title requires a reviewed catalog fact.',
                    course,
                    sources,
                    { affectedCourseCodes: [course.code] }
                ));
            }
        });

        return issues.sort((a, b) => a.id.localeCompare(b.id));
    }

    function validateIssueTargets(issues, lensIds, courses) {
        issues.forEach((issue) => {
            issue.lensIds.forEach((lensId) => {
                if (!lensIds.has(lensId)) {
                    fail(`issues.${issue.id}.lensIds`, `unknown lens ID "${lensId}"`);
                }
            });
            issue.affectedCourseCodes.forEach((code) => {
                if (!courses[code]) {
                    fail(
                        `issues.${issue.id}.affectedCourseCodes`,
                        `unexplained non-external course code "${code}"`
                    );
                }
            });
        });
    }

    function normalize(rawOverlay, rawCourseCatalog) {
        const overlay = requireObject(rawOverlay, 'overlay');
        requireString(overlay.schemaVersion, 'schemaVersion');
        const sources = normalizeSources(overlay.sources);
        const manual = normalizeManualIssues(overlay.issues, sources);
        const catalog = normalizeCourseCatalog(rawCourseCatalog, overlay, sources, manual.issueIds);
        const context = {
            sources,
            courses: catalog.courses,
            issueIds: manual.issueIds,
            groupIds: new Set()
        };
        const rawCurriculum = requireObject(overlay.curriculum, 'curriculum');
        const curriculum = {
            year: requireString(rawCurriculum.year, 'curriculum.year'),
            name: requireString(rawCurriculum.name, 'curriculum.name'),
            sourceIds: normalizeSourceIds(rawCurriculum.sourceIds, 'curriculum.sourceIds', sources),
            reviewState: normalizeReviewState(
                rawCurriculum.reviewState,
                'curriculum.reviewState',
                RULE_REVIEW_STATES
            ),
            bdes: normalizeBdes(rawCurriculum.bdes, context),
            degreeRequirements: normalizeDegreeRequirements(
                rawCurriculum.degreeRequirements,
                context
            ),
            courses: Object.fromEntries(
                Object.entries(catalog.courses).sort(([a], [b]) => a.localeCompare(b))
            )
        };
        const lensResult = normalizeLenses(overlay.lenses, context);
        curriculum.offeringEvidence = normalizeCourseOfferingEvidence(
            overlay.courseOfferingEvidence,
            context,
            collectAdvisingCourseCodes(curriculum, lensResult.lenses)
        );
        const planningLimits = normalizePlanningLimits(overlay.planningLimits, sources);
        detectPrerequisiteCycles(curriculum.courses);
        validateIssueTargets(manual.issues, lensResult.lensIds, curriculum.courses);
        const issues = appendDerivedIssues(manual.issues, {
            sources,
            courses: curriculum.courses,
            curriculum,
            lenses: lensResult.lenses,
            planningLimits
        });
        validateIssueTargets(issues, lensResult.lensIds, curriculum.courses);

        return deepFreeze({
            curriculum,
            lenses: lensResult.lenses,
            sources: Object.fromEntries(
                Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))
            ),
            planningLimits,
            issues
        });
    }

    async function load(options) {
        const settings = options || {};
        const fetchImplementation = settings.fetch || settings.fetchImpl || (root && root.fetch);
        if (typeof fetchImplementation !== 'function') {
            throw new Error('Advising curriculum load requires a fetch implementation');
        }
        const overlayUrl = settings.overlayUrl || DEFAULT_OVERLAY_URL;
        const courseCatalogUrl = settings.courseCatalogUrl || DEFAULT_CATALOG_URL;
        const fetchFn = fetchImplementation.bind(root);
        const [overlayResponse, catalogResponse] = await Promise.all([
            fetchFn(overlayUrl),
            fetchFn(courseCatalogUrl)
        ]);
        if (!overlayResponse || overlayResponse.ok === false) {
            throw new Error(`Unable to load advising curriculum from ${overlayUrl}`);
        }
        if (!catalogResponse || catalogResponse.ok === false) {
            throw new Error(`Unable to load course catalog from ${courseCatalogUrl}`);
        }
        if (typeof overlayResponse.json !== 'function' || typeof catalogResponse.json !== 'function') {
            throw new Error('Advising curriculum fetch responses must provide json()');
        }
        const [overlay, courseCatalog] = await Promise.all([
            overlayResponse.json(),
            catalogResponse.json()
        ]);
        return normalize(overlay, courseCatalog);
    }

    root.AdvisingCurriculum = Object.freeze({
        normalize,
        load
    });
})(typeof window !== 'undefined' ? window : globalThis);
