/**
 * Advisor-led BDes pathway planner.
 *
 * This module is intentionally pure: it receives a normalized curriculum
 * snapshot, performs a bounded deterministic search, and returns display data.
 * It does not fetch, inspect the DOM, persist state, or read the clock.
 */
const AdvisingPlanner = (function() {
    'use strict';

    const DEFAULT_QUARTERS = ['Fall', 'Winter', 'Spring'];
    const DEFAULT_NORMAL_TERMS = 12;
    const DEFAULT_EXTENSION_TERMS = 6;
    const DEFAULT_MAX_CREDITS = 15;
    const DEFAULT_MAX_SEARCH_NODES = 50000;
    const REVIEW_STATES = new Set([
        'advisor-review-required',
        'ambiguous',
        'conditional',
        'contradictory',
        'missing',
        'stale',
        'unapproved',
        'unparsed',
        'unresolved',
        'unsupported'
    ]);

    function stableStrings(values) {
        return Array.from(new Set((values || []).filter(Boolean).map(String))).sort();
    }

    function deepCopy(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function asPositiveInteger(value, fallback, allowZero) {
        const number = Number(value);
        const minimum = allowZero ? 0 : 1;
        return Number.isInteger(number) && number >= minimum ? number : fallback;
    }

    function stateNeedsReview(state) {
        if (!state) return false;
        return REVIEW_STATES.has(String(state).toLowerCase());
    }

    function normalizeQuarter(value) {
        const text = String(value || '').trim().toLowerCase();
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    }

    function normalizeCourseIndex(courses) {
        const entries = Array.isArray(courses)
            ? courses.map(course => [course && course.code, course])
            : Object.entries(courses || {});
        const index = {};

        entries.forEach(([key, raw]) => {
            if (!raw) return;
            const code = String(raw.code || key || '').trim();
            if (!code) return;
            index[code] = {
                code,
                title: String(raw.title || code),
                credits: Number.isFinite(Number(raw.credits)) ? Number(raw.credits) : 0,
                offeredQuarters: stableStrings((raw.offeredQuarters || []).map(normalizeQuarter)),
                prerequisites: Array.isArray(raw.prerequisites) ? deepCopy(raw.prerequisites) : [],
                prerequisitesKnown: Array.isArray(raw.prerequisites),
                corequisites: Array.isArray(raw.corequisites) ? deepCopy(raw.corequisites) : [],
                standingRequired: raw.standingRequired || null,
                external: raw.external === true,
                conditionOnly: raw.conditionOnly === true,
                sourceIds: stableStrings(raw.sourceIds),
                offeringSourceIds: stableStrings(
                    raw.offeringEvidence && raw.offeringEvidence.sourceIds
                ),
                reviewState: raw.reviewState || 'approved',
                offeringReviewState: raw.offeringReviewState || 'approved'
            };
        });

        return index;
    }

    function normalizeLimits(snapshot, options) {
        const raw = snapshot.planningLimits || {};
        const quarters = (Array.isArray(raw.terms) && raw.terms.length
            ? raw.terms
            : DEFAULT_QUARTERS).map(normalizeQuarter).filter(Boolean);
        const normalTerms = asPositiveInteger(raw.normalTerms, DEFAULT_NORMAL_TERMS);
        const extensionTerms = asPositiveInteger(raw.extensionTerms, DEFAULT_EXTENSION_TERMS, true);
        const optionCap = options && Object.prototype.hasOwnProperty.call(options, 'maxSearchNodes')
            ? options.maxSearchNodes
            : raw.maxSearchNodes;

        return {
            startTerm: normalizeQuarter(raw.startTerm || 'Fall'),
            quarters: quarters.length ? quarters : DEFAULT_QUARTERS.slice(),
            normalTerms,
            extensionTerms,
            maxCreditsPerTerm: Number(raw.maxCreditsPerTerm) > 0
                ? Number(raw.maxCreditsPerTerm)
                : DEFAULT_MAX_CREDITS,
            maxSearchNodes: asPositiveInteger(optionCap, DEFAULT_MAX_SEARCH_NODES, true),
            standingStarts: Object.assign({ sophomore: 3, junior: 6, senior: 9 }, raw.standingStarts || {}),
            sourceIds: stableStrings(raw.sourceIds),
            reviewState: raw.reviewState || 'approved'
        };
    }

    function generateTerms(limits, count) {
        const start = Math.max(0, limits.quarters.indexOf(limits.startTerm));
        return Array.from({ length: count }, (_, index) => {
            const quarter = limits.quarters[(start + index) % limits.quarters.length];
            const year = Math.floor(index / limits.quarters.length) + 1;
            return {
                index,
                year,
                quarter,
                label: `Year ${year} · ${quarter}`,
                isExtension: index >= limits.normalTerms,
                credits: 0,
                courseCodes: []
            };
        });
    }

    function groupCourses(group) {
        const fromOptions = (group.options || []).flatMap(option => option.courses || option.courseCodes || []);
        return stableStrings([].concat(group.courses || group.courseCodes || [], fromOptions));
    }

    function normalizeGroup(raw, ownerId, index) {
        const type = String(raw.type || 'all-of').toLowerCase();
        const options = (raw.options || []).map((option, optionIndex) => ({
            id: String(option.id || `${raw.id || `${ownerId}-group-${index + 1}`}-option-${optionIndex + 1}`),
            label: String(option.label || option.id || `Option ${optionIndex + 1}`),
            courseCodes: stableStrings(option.courses || option.courseCodes),
            sourceIds: stableStrings(option.sourceIds || raw.sourceIds)
        })).sort((a, b) => a.id.localeCompare(b.id));

        return {
            id: String(raw.id || `${ownerId}-group-${index + 1}`),
            label: String(raw.label || raw.id || `Requirement group ${index + 1}`),
            ownerId,
            type,
            count: asPositiveInteger(raw.count || raw.choose || raw.requiredCount, 1),
            courses: groupCourses(raw),
            options,
            sourceIds: stableStrings(raw.sourceIds),
            reviewState: raw.reviewState || 'approved'
        };
    }

    function* combinations(items, count, start = 0, chosen = []) {
        if (chosen.length === count) {
            yield chosen.slice();
            return;
        }
        const needed = count - chosen.length;
        for (let index = start; index <= items.length - needed; index += 1) {
            chosen.push(items[index]);
            yield* combinations(items, count, index + 1, chosen);
            chosen.pop();
        }
    }

    function* choicesForGroup(group) {
        const items = group.options.length
            ? group.options
            : group.courses.map(code => ({
                id: code,
                label: code,
                courseCodes: [code],
                sourceIds: group.sourceIds
            }));
        yield* combinations(items, group.count);
    }

    function* selectionVariants(groups, index = 0, selected = []) {
        if (index === groups.length) {
            yield selected.slice();
            return;
        }
        for (const choice of choicesForGroup(groups[index])) {
            selected.push({ group: groups[index], options: choice });
            yield* selectionVariants(groups, index + 1, selected);
            selected.pop();
        }
    }

    function addContribution(map, code, ownerIds) {
        if (!map.has(code)) map.set(code, new Set());
        const values = Array.isArray(ownerIds) ? ownerIds : Array.from(ownerIds || []);
        let changed = false;
        values.forEach(ownerId => {
            if (ownerId && !map.get(code).has(ownerId)) {
                map.get(code).add(ownerId);
                changed = true;
            }
        });
        return changed;
    }

    function prerequisiteCode(raw) {
        if (typeof raw === 'string') return raw.trim();
        if (!raw) return '';
        return String(raw.code || raw.courseCode || '').trim();
    }

    function prerequisiteIsExternal(raw, courseIndex) {
        const code = prerequisiteCode(raw);
        const course = code && courseIndex[code];
        if (course) return course.external && course.conditionOnly;
        return Boolean(raw && typeof raw === 'object' && raw.external === true);
    }

    function expandPrerequisites(requiredContributions, courseIndex) {
        const contributions = new Map();
        requiredContributions.forEach((owners, code) => addContribution(contributions, code, owners));
        const queue = Array.from(contributions.keys()).sort();
        const conditions = [];
        const dependencies = {};
        const corequisites = {};
        const processedSignatures = new Map();

        while (queue.length) {
            const code = queue.shift();
            const owners = stableStrings(Array.from(contributions.get(code) || []));
            const signature = owners.join('|');
            if (processedSignatures.get(code) === signature) continue;
            processedSignatures.set(code, signature);
            const course = courseIndex[code];

            if (!course) {
                conditions.push({
                    code,
                    affected: [code],
                    reason: 'missing-course-data',
                    message: `${code} is required but has no normalized course record.`,
                    sourceIds: []
                });
                continue;
            }
            if (course.external && course.conditionOnly) {
                const requiresReview = stateNeedsReview(course.reviewState)
                    || stateNeedsReview(course.offeringReviewState);
                conditions.push({
                    code,
                    affected: [code],
                    reason: 'external-condition',
                    message: `${code} is an external requirement and is not silently placed in the Design sequence.`,
                    sourceIds: course.sourceIds,
                    requiresReview,
                    includeUnplaced: requiresReview
                });
                continue;
            }
            if (course.external && (
                !course.offeredQuarters.length || stateNeedsReview(course.offeringReviewState)
            )) {
                conditions.push({
                    code,
                    affected: [code],
                    reason: 'missing-offering-pattern',
                    message: `${code} is a named external requirement without an approved offering pattern.`,
                    sourceIds: stableStrings([].concat(course.offeringSourceIds, course.sourceIds)),
                    requiresReview: true,
                    includeUnplaced: true
                });
            }

            dependencies[code] = dependencies[code] || [];
            corequisites[code] = corequisites[code] || [];
            course.prerequisites.forEach(rawPrerequisite => {
                const prerequisite = prerequisiteCode(rawPrerequisite);
                if (!prerequisite) {
                    conditions.push({
                        code: `Condition for ${code}`,
                        affected: [code],
                        reason: 'external-condition',
                        message: `A prerequisite condition for ${code} cannot be modeled as a Design course.`,
                        sourceIds: course.sourceIds
                    });
                    return;
                }
                if (prerequisiteIsExternal(rawPrerequisite, courseIndex) || !courseIndex[prerequisite]) {
                    const prerequisiteCourse = courseIndex[prerequisite];
                    const isKnownExternal = Boolean(prerequisiteCourse && prerequisiteCourse.external);
                    const requiresReview = !isKnownExternal
                        || stateNeedsReview(prerequisiteCourse.reviewState)
                        || stateNeedsReview(prerequisiteCourse.offeringReviewState);
                    conditions.push({
                        code: prerequisite,
                        affected: stableStrings([prerequisite, code]),
                        reason: prerequisiteCourse ? 'external-condition' : 'missing-course-data',
                        message: prerequisiteCourse
                            ? `${prerequisite} is an external condition for ${code} and is not silently treated as complete.`
                            : `${prerequisite}, required before ${code}, has no normalized internal course record.`,
                        sourceIds: stableStrings([].concat(course.sourceIds, prerequisiteCourse?.sourceIds || [])),
                        requiresReview,
                        includeUnplaced: !prerequisiteCourse?.conditionOnly || requiresReview
                    });
                    return;
                }

                dependencies[code].push(prerequisite);
                if (addContribution(contributions, prerequisite, owners)) queue.push(prerequisite);
            });
            dependencies[code] = stableStrings(dependencies[code]);
            course.corequisites.forEach(rawCorequisite => {
                const corequisite = prerequisiteCode(rawCorequisite);
                const corequisiteCourse = courseIndex[corequisite];
                if (!corequisite || !corequisiteCourse) {
                    conditions.push({
                        code: corequisite || `Condition for ${code}`,
                        affected: stableStrings([code, corequisite]),
                        reason: 'missing-course-data',
                        message: corequisite
                            ? `${corequisite}, required with ${code}, has no normalized course record.`
                            : `A co-requisite condition for ${code} cannot be modeled as a named course.`,
                        sourceIds: course.sourceIds,
                        requiresReview: true,
                        includeUnplaced: true
                    });
                    return;
                }
                if (corequisiteCourse.external && corequisiteCourse.conditionOnly) {
                    const requiresReview = stateNeedsReview(corequisiteCourse.reviewState)
                        || stateNeedsReview(corequisiteCourse.offeringReviewState);
                    conditions.push({
                        code: corequisite,
                        affected: stableStrings([corequisite, code]),
                        reason: 'external-condition',
                        message: `${corequisite} is an external condition for ${code} and is not silently treated as complete.`,
                        sourceIds: stableStrings([].concat(course.sourceIds, corequisiteCourse.sourceIds)),
                        requiresReview,
                        includeUnplaced: requiresReview
                    });
                    return;
                }
                corequisites[code].push(corequisite);
                corequisites[corequisite] = corequisites[corequisite] || [];
                corequisites[corequisite].push(code);
                if (addContribution(contributions, corequisite, owners)) queue.push(corequisite);
            });
            corequisites[code] = stableStrings(corequisites[code]);
            queue.sort();
        }

        const internalCodes = stableStrings(Array.from(contributions.keys()).filter(code => (
            courseIndex[code] && !(courseIndex[code].external && courseIndex[code].conditionOnly)
        )));
        internalCodes.forEach(code => {
            dependencies[code] = stableStrings((dependencies[code] || []).filter(dep => internalCodes.includes(dep)));
            corequisites[code] = stableStrings((corequisites[code] || []).filter(other => internalCodes.includes(other)));
        });

        return {
            contributions,
            conditions: dedupeConditions(conditions),
            dependencies,
            corequisites,
            internalCodes
        };
    }

    function dedupeConditions(conditions) {
        const seen = new Set();
        return conditions.filter(condition => {
            const key = `${condition.reason}|${condition.code}|${(condition.affected || []).join('|')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => `${a.reason}|${a.code}`.localeCompare(`${b.reason}|${b.code}`));
    }

    function dedupeUnplaced(items) {
        const byKey = new Map();
        items.forEach(item => {
            const key = `${item.reason}|${item.code}`;
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, Object.assign({}, item, {
                    affected: stableStrings(item.affected),
                    sourceIds: stableStrings(item.sourceIds)
                }));
                return;
            }
            existing.affected = stableStrings([].concat(existing.affected, item.affected || []));
            existing.sourceIds = stableStrings([].concat(existing.sourceIds, item.sourceIds || []));
        });
        return Array.from(byKey.values()).sort((left, right) => (
            `${left.reason}|${left.code}`.localeCompare(`${right.reason}|${right.code}`)
        ));
    }

    function topologicalOrder(codes, dependencies, courseIndex) {
        const remaining = new Set(codes);
        const order = [];
        const dependents = {};
        codes.forEach(code => {
            (dependencies[code] || []).forEach(dependency => {
                dependents[dependency] = (dependents[dependency] || 0) + 1;
            });
        });

        while (remaining.size) {
            const ready = Array.from(remaining).filter(code => (
                (dependencies[code] || []).every(dependency => !remaining.has(dependency))
            ));
            if (!ready.length) {
                return { order, cycle: Array.from(remaining).sort() };
            }
            ready.sort((left, right) => {
                const leftOfferings = courseIndex[left].offeredQuarters.length || DEFAULT_QUARTERS.length;
                const rightOfferings = courseIndex[right].offeredQuarters.length || DEFAULT_QUARTERS.length;
                return leftOfferings - rightOfferings
                    || (dependents[right] || 0) - (dependents[left] || 0)
                    || left.localeCompare(right);
            });
            const next = ready[0];
            remaining.delete(next);
            order.push(next);
        }
        return { order, cycle: [] };
    }

    function minimumStandingTerm(course, limits) {
        const standing = course.standingRequired;
        if (standing === null || standing === undefined || standing === '') return 0;
        if (Number.isInteger(Number(standing))) return Math.max(0, Number(standing));
        const normalized = String(standing).toLowerCase();
        return asPositiveInteger(limits.standingStarts[normalized], 0, true);
    }

    function candidateTerms(
        code,
        horizon,
        assignments,
        loads,
        dependencies,
        corequisites,
        courseIndex,
        terms,
        limits
    ) {
        const course = courseIndex[code];
        const prerequisiteTerms = (dependencies[code] || []).map(dependency => assignments[dependency]);
        const earliestPrerequisiteTerm = prerequisiteTerms.length ? Math.max(...prerequisiteTerms) + 1 : 0;
        const earliest = Math.max(earliestPrerequisiteTerm, minimumStandingTerm(course, limits));
        const assignedCorequisiteTerms = Array.from(new Set((corequisites[code] || [])
            .filter(other => Object.prototype.hasOwnProperty.call(assignments, other))
            .map(other => assignments[other]))).sort((left, right) => left - right);
        if (assignedCorequisiteTerms.length > 1) return [];
        const requiredTerm = assignedCorequisiteTerms.length
            ? assignedCorequisiteTerms[0]
            : null;
        const offerings = course.offeredQuarters;
        if (!offerings.length) return [];
        const result = [];
        for (let termIndex = earliest; termIndex < horizon; termIndex += 1) {
            if (requiredTerm !== null && termIndex !== requiredTerm) continue;
            if (!offerings.includes(terms[termIndex].quarter)) continue;
            if (loads[termIndex] + course.credits > limits.maxCreditsPerTerm) continue;
            result.push(termIndex);
        }
        return result;
    }

    function searchAtHorizon(order, dependencies, corequisites, courseIndex, terms, limits, horizon, budget) {
        const totalCredits = order.reduce((sum, code) => sum + courseIndex[code].credits, 0);
        if (totalCredits > horizon * limits.maxCreditsPerTerm) {
            return { placement: null, capped: false };
        }
        const loads = Array(horizon).fill(0);
        const assignments = {};

        function visit(index) {
            if (index === order.length) return Object.assign({}, assignments);
            const code = order[index];
            const candidates = candidateTerms(
                code,
                horizon,
                assignments,
                loads,
                dependencies,
                corequisites,
                courseIndex,
                terms,
                limits
            );
            for (const termIndex of candidates) {
                if (budget.visited >= budget.limit) {
                    budget.capped = true;
                    return null;
                }
                budget.visited += 1;
                assignments[code] = termIndex;
                loads[termIndex] += courseIndex[code].credits;
                const result = visit(index + 1);
                if (result) return result;
                loads[termIndex] -= courseIndex[code].credits;
                delete assignments[code];
                if (budget.capped) return null;
            }
            return null;
        }

        const placement = visit(0);
        return { placement, capped: budget.capped };
    }

    function greedyPreview(order, dependencies, corequisites, courseIndex, terms, limits) {
        const assignments = {};
        const loads = Array(terms.length).fill(0);
        order.forEach(code => {
            const candidates = candidateTerms(
                code,
                terms.length,
                assignments,
                loads,
                dependencies,
                corequisites,
                courseIndex,
                terms,
                limits
            );
            if (!candidates.length) return;
            assignments[code] = candidates[0];
            loads[candidates[0]] += courseIndex[code].credits;
        });
        const selectedCodes = new Set(order);
        let removedPairMember;
        do {
            removedPairMember = false;
            Object.keys(assignments).forEach(code => {
                const hasMissingPairMember = (corequisites[code] || []).some(other => (
                    selectedCodes.has(other) && assignments[other] !== assignments[code]
                ));
                if (hasMissingPairMember) {
                    delete assignments[code];
                    removedPairMember = true;
                }
            });
        } while (removedPairMember);
        return assignments;
    }

    function firstSelectionVariant(groups) {
        const selection = [];
        for (const group of groups) {
            const first = choicesForGroup(group).next();
            if (first.done) return null;
            selection.push({ group, options: first.value });
        }
        return selection;
    }

    function consumeBudget(budget) {
        if (budget.visited >= budget.limit) {
            budget.capped = true;
            return false;
        }
        budget.visited += 1;
        return true;
    }

    function prepareVariant(selection, baseContributions, courseIndex, searchTerms, limits) {
        const expanded = buildVariantContext(baseContributions, selection, courseIndex);
        const topology = topologicalOrder(expanded.internalCodes, expanded.dependencies, courseIndex);
        return {
            selection,
            expanded,
            topology,
            preview: greedyPreview(
                topology.order,
                expanded.dependencies,
                expanded.corequisites,
                courseIndex,
                searchTerms,
                limits
            )
        };
    }

    function prepareVariants(groups, baseContributions, courseIndex, searchTerms, limits, budget) {
        const prepared = [];
        for (const selection of selectionVariants(groups)) {
            if (!consumeBudget(budget)) break;
            prepared.push(prepareVariant(selection, baseContributions, courseIndex, searchTerms, limits));
        }
        return prepared;
    }

    function findWinner(prepared, courseIndex, searchTerms, limits, maxHorizon, budget) {
        for (let horizon = 1; horizon <= maxHorizon; horizon += 1) {
            for (const candidate of prepared) {
                if (candidate.topology.cycle.length) continue;
                if (candidate.topology.order.some(code => !courseIndex[code].offeredQuarters.length)) continue;
                const attempt = searchAtHorizon(
                    candidate.topology.order,
                    candidate.expanded.dependencies,
                    candidate.expanded.corequisites,
                    courseIndex,
                    searchTerms,
                    limits,
                    horizon,
                    budget
                );
                if (attempt.placement) {
                    return Object.assign({}, candidate, { placement: attempt.placement });
                }
                if (attempt.capped) return null;
            }
        }
        return null;
    }

    function relaxedOfferingIndex(courseIndex, limits) {
        return Object.fromEntries(Object.entries(courseIndex).map(([code, course]) => [
            code,
            course.external && course.conditionOnly
                ? course
                : Object.assign({}, course, { offeredQuarters: limits.quarters.slice() })
        ]));
    }

    function offeringConstraintDiagnostic(prepared, constrainedWinner, courseIndex, searchTerms, limits, selectedLensIds, mainBudget) {
        if (!selectedLensIds.length || mainBudget.capped) return null;
        if (prepared.some(candidate => candidate.topology.order.some(code => (
            !courseIndex[code].offeredQuarters.length
        )))) return null;
        const constrainedCompletion = constrainedWinner && Object.keys(constrainedWinner.placement).length
            ? Math.max(...Object.values(constrainedWinner.placement))
            : null;
        if (constrainedWinner && constrainedCompletion < limits.normalTerms) return null;

        const diagnosticBudget = {
            visited: prepared.length,
            limit: limits.maxSearchNodes,
            capped: prepared.length > limits.maxSearchNodes
        };
        if (diagnosticBudget.capped) return null;
        const relaxedIndex = relaxedOfferingIndex(courseIndex, limits);
        const relaxedWinner = findWinner(
            prepared,
            relaxedIndex,
            searchTerms,
            limits,
            limits.normalTerms,
            diagnosticBudget
        );
        if (!relaxedWinner || diagnosticBudget.capped) return null;

        const affected = Object.entries(relaxedWinner.placement).filter(([code, termIndex]) => {
            const offerings = courseIndex[code].offeredQuarters;
            return offerings.length > 0 && !offerings.includes(searchTerms[termIndex].quarter);
        }).map(([code]) => code).sort();
        if (!affected.length) return null;

        return {
            affected,
            sourceIds: stableStrings(affected.flatMap(code => (
                courseIndex[code].offeringSourceIds.length
                    ? courseIndex[code].offeringSourceIds
                    : courseIndex[code].sourceIds
            )))
        };
    }

    function buildChoiceResult(selection) {
        return selection.map(({ group, options }) => {
            const selectedOptionIds = new Set(options.map(option => option.id));
            const allOptions = group.options.length
                ? group.options
                : group.courses.map(code => ({ id: code, label: code, courseCodes: [code], sourceIds: group.sourceIds }));
            const selectedOptions = allOptions.filter(option => selectedOptionIds.has(option.id));
            const remainingOptions = allOptions.filter(option => !selectedOptionIds.has(option.id));
            return {
                id: group.id,
                label: group.label,
                ownerId: group.ownerId,
                count: group.count,
                selectedCourseCodes: stableStrings(selectedOptions.flatMap(option => option.courseCodes)),
                remainingCourseCodes: stableStrings(remainingOptions.flatMap(option => option.courseCodes)),
                selectedOptions: selectedOptions.map(option => ({
                    id: option.id,
                    label: option.label,
                    courseCodes: option.courseCodes.slice()
                })),
                remainingOptions: remainingOptions.map(option => ({
                    id: option.id,
                    label: option.label,
                    courseCodes: option.courseCodes.slice()
                })),
                sourceIds: group.sourceIds.slice()
            };
        }).sort((a, b) => a.id.localeCompare(b.id));
    }

    function ledgerEntry(id, category, message, affected, sourceIds) {
        return {
            id,
            category,
            message,
            affected: stableStrings(affected),
            sourceIds: stableStrings(sourceIds)
        };
    }

    function placeholderCourse(raw, defaults) {
        const settings = defaults || {};
        const id = String(raw.id || settings.id || '').trim();
        return {
            id,
            code: id,
            title: String(raw.label || raw.title || settings.label || id),
            credits: Number(raw.credits) || 0,
            offeredQuarters: [],
            prerequisites: [],
            external: true,
            placeholder: true,
            kind: String(raw.kind || settings.kind || 'open-elective'),
            category: String(raw.category || settings.category || 'open-degree'),
            reviewState: raw.reviewState || settings.reviewState || 'approved',
            contributionIds: stableStrings(settings.contributionIds),
            sourceIds: stableStrings(raw.sourceIds || settings.sourceIds),
            requirementState: 'selected',
            degreeWorksVerification: raw.degreeWorksVerification !== false,
            representsCourseCodes: stableStrings(raw.representsCourseCodes),
            prerequisitePlaceholderIds: stableStrings(raw.prerequisitePlaceholderIds),
            termIndex: null,
            termLabel: null
        };
    }

    function creditPlaceholders(totalCredits, rawConfig, defaults) {
        const config = rawConfig || {};
        const creditsPerSlot = Number(config.creditsPerSlot || config.credits) > 0
            ? Number(config.creditsPerSlot || config.credits)
            : 5;
        const prefix = String(config.idPrefix || defaults.idPrefix);
        const slots = [];
        let remaining = Math.max(0, Number(totalCredits) || 0);
        let index = 1;

        while (remaining > 0) {
            const credits = Math.min(creditsPerSlot, remaining);
            slots.push(placeholderCourse(Object.assign({}, config, {
                id: `${prefix}-${String(index).padStart(2, '0')}`,
                credits
            }), defaults));
            remaining -= credits;
            index += 1;
        }
        return slots;
    }

    function degreeRequirementPlaceholders(degreeRequirements, includedCodes) {
        if (!degreeRequirements) return { placeholders: [], satisfied: [] };
        const included = new Set(includedCodes);
        const usedSatisfyingCodes = new Set();
        const placeholders = [];
        const satisfied = [];

        (degreeRequirements.placeholders || []).slice().sort((left, right) => (
            String(left.id).localeCompare(String(right.id))
        )).forEach(raw => {
            const satisfyingCode = stableStrings(raw.satisfiedByCourseCodes).find(code => (
                included.has(code) && !usedSatisfyingCodes.has(code)
            ));
            if (satisfyingCode) {
                usedSatisfyingCodes.add(satisfyingCode);
                satisfied.push({
                    placeholderId: String(raw.id),
                    label: String(raw.label || raw.id),
                    courseCode: satisfyingCode,
                    sourceIds: stableStrings(raw.sourceIds)
                });
                return;
            }
            placeholders.push(placeholderCourse(raw, {
                kind: 'gen-ed',
                category: raw.category || 'general-education',
                contributionIds: ['degree-requirements']
            }));
        });

        return { placeholders, satisfied };
    }

    function worksheetContext(namedContext, placeholders, courseIndex, limits, searchTerms) {
        const index = Object.assign({}, courseIndex);
        const dependencies = Object.fromEntries(Object.entries(namedContext.expanded.dependencies).map(
            ([code, codes]) => [code, codes.slice()]
        ));
        const corequisites = Object.fromEntries(Object.entries(namedContext.expanded.corequisites).map(
            ([code, codes]) => [code, codes.slice()]
        ));
        const representedBy = {};

        placeholders.forEach(placeholder => {
            index[placeholder.code] = {
                code: placeholder.code,
                title: placeholder.title,
                credits: placeholder.credits,
                offeredQuarters: limits.quarters.slice(),
                prerequisites: placeholder.prerequisitePlaceholderIds.slice(),
                prerequisitesKnown: true,
                corequisites: [],
                standingRequired: null,
                external: false,
                conditionOnly: false,
                sourceIds: placeholder.sourceIds.slice(),
                reviewState: placeholder.reviewState,
                offeringReviewState: 'approved'
            };
            dependencies[placeholder.code] = placeholder.prerequisitePlaceholderIds.slice();
            corequisites[placeholder.code] = [];
            placeholder.representsCourseCodes.forEach(code => {
                if (!representedBy[code]) representedBy[code] = placeholder.code;
            });
        });

        namedContext.expanded.internalCodes.forEach(code => {
            (courseIndex[code].prerequisites || []).forEach(rawPrerequisite => {
                const representative = representedBy[prerequisiteCode(rawPrerequisite)];
                if (representative) dependencies[code].push(representative);
            });
            dependencies[code] = stableStrings(dependencies[code]);
        });

        const codes = stableStrings([].concat(
            namedContext.expanded.internalCodes,
            placeholders.map(placeholder => placeholder.code)
        ));
        const topology = topologicalOrder(codes, dependencies, index);
        return {
            index,
            dependencies,
            corequisites,
            topology,
            representedCourseCodes: new Set(Object.keys(representedBy)),
            preview: greedyPreview(topology.order, dependencies, corequisites, index, searchTerms, limits)
        };
    }

    function buildWorksheetVariant(
        candidate,
        baseContributions,
        courseIndex,
        bdes,
        degreeRequirements,
        limits,
        searchTerms
    ) {
        const includedCodes = stableStrings(Array.from(candidate.expanded.contributions.keys()));
        const selectedNamedCodes = includedCodes.filter(code => (
            courseIndex[code] && !courseIndex[code].external
        ));
        const selectedDegreeCourseCodes = includedCodes.filter(code => {
            const course = courseIndex[code];
            return course && !(course.external && course.conditionOnly);
        });
        const electiveCodes = new Set(bdes.electiveCourseCodes || []);
        const contributingCourseCodes = selectedNamedCodes.filter(code => (
            electiveCodes.has(code)
            && !(baseContributions.get(code) || new Set()).has('bdes')
            && Array.from(candidate.expanded.contributions.get(code) || []).some(ownerId => ownerId !== 'bdes')
        )).sort();
        const rawElectiveCredits = contributingCourseCodes.reduce(
            (sum, code) => sum + courseIndex[code].credits,
            0
        );
        const requiredElectiveCredits = Number(bdes.electiveCredits) || 0;
        const contributedCredits = Math.min(requiredElectiveCredits, rawElectiveCredits);
        const electiveProgress = {
            requiredCredits: requiredElectiveCredits,
            contributedCredits,
            openCredits: Math.max(0, requiredElectiveCredits - contributedCredits),
            contributingCourseCodes,
            qualification: 'Counts named selected coursework once; source overlap does not guarantee institutional double-counting.'
        };

        const degreeSlots = degreeRequirementPlaceholders(degreeRequirements, includedCodes);
        const bdesElectivePlaceholders = degreeRequirements
            ? creditPlaceholders(electiveProgress.openCredits, Object.assign(
                {},
                bdes.electivePlaceholder,
                { idPrefix: 'open-bdes-elective' }
            ), {
                idPrefix: 'open-bdes-elective',
                label: 'BDes elective choice',
                kind: 'major-elective',
                category: 'bdes-elective',
                sourceIds: bdes.sourceIds,
                contributionIds: ['bdes']
            })
            : [];
        const namedDegreeCredits = selectedDegreeCourseCodes.reduce(
            (sum, code) => sum + courseIndex[code].credits,
            0
        );
        const reservedRequirementCredits = degreeSlots.placeholders.reduce(
            (sum, item) => sum + item.credits,
            0
        );
        const reservedBdesElectiveCredits = bdesElectivePlaceholders.reduce(
            (sum, item) => sum + item.credits,
            0
        );
        const degreeCreditsRequired = Number(degreeRequirements?.totalCredits) || 0;
        const remainingDegreeCredits = Math.max(0, degreeCreditsRequired
            - namedDegreeCredits
            - reservedRequirementCredits
            - reservedBdesElectiveCredits);
        const openDegreePlaceholders = degreeRequirements
            ? creditPlaceholders(remainingDegreeCredits, degreeRequirements.openDegreeCredits, {
                idPrefix: 'open-degree-credit',
                label: 'Open degree credit',
                kind: 'open-elective',
                category: 'open-degree',
                contributionIds: ['degree-requirements']
            })
            : [];
        const placeholderCourses = [].concat(
            degreeSlots.placeholders,
            bdesElectivePlaceholders,
            openDegreePlaceholders
        ).sort((left, right) => left.code.localeCompare(right.code));
        const representedDegreeCredits = namedDegreeCredits
            + placeholderCourses.reduce((sum, course) => sum + course.credits, 0);
        const overflowCredits = degreeCreditsRequired
            ? Math.max(0, representedDegreeCredits - degreeCreditsRequired)
            : 0;
        const selectedChoiceCodes = stableStrings(candidate.selection.flatMap(({ options }) => (
            options.flatMap(option => option.courseCodes)
        )));
        const additionalChoiceCodes = selectedChoiceCodes.filter(code => !baseContributions.has(code));
        const additionalChoiceCredits = additionalChoiceCodes.reduce((sum, code) => (
            sum + (Number(courseIndex[code]?.credits) || 0)
        ), 0);
        const worksheet = degreeRequirements
            ? worksheetContext(candidate, placeholderCourses, courseIndex, limits, searchTerms)
            : null;
        const representedCourseCodes = worksheet?.representedCourseCodes || new Set();
        const blockingConditions = candidate.expanded.conditions.filter(condition => (
            condition.includeUnplaced !== false && !representedCourseCodes.has(condition.code)
        ));

        return Object.assign({}, candidate, {
            includedCodes,
            selectedNamedCodes,
            selectedDegreeCourseCodes,
            electiveProgress,
            degreeSlots,
            bdesElectivePlaceholders,
            namedDegreeCredits,
            degreeCreditsRequired,
            representedDegreeCredits,
            overflowCredits,
            remainingDegreeCredits,
            openDegreePlaceholders,
            placeholderCourses,
            worksheet,
            searchContext: worksheet || {
                index: courseIndex,
                dependencies: candidate.expanded.dependencies,
                corequisites: candidate.expanded.corequisites,
                topology: candidate.topology,
                representedCourseCodes: new Set(),
                preview: candidate.preview
            },
            blockingConditions,
            hasUnplacedRequirement: blockingConditions.length > 0,
            additionalChoiceCodes,
            additionalChoiceCredits
        });
    }

    function worksheetVariantRank(candidate) {
        const context = candidate.searchContext;
        const previewCodes = new Set(Object.keys(context.preview));
        const unplacedCodes = new Set(candidate.blockingConditions.map(condition => condition.code));
        context.topology.order.forEach(code => {
            if (!previewCodes.has(code)) unplacedCodes.add(code);
        });
        const unplacedCredits = Array.from(unplacedCodes).reduce((sum, code) => (
            sum + (Number(context.index[code]?.credits) || 0)
        ), 0);
        const completionTermIndex = previewCodes.size
            ? Math.max(...Object.values(context.preview))
            : -1;
        const choiceKey = candidate.selection.flatMap(({ group, options }) => (
            options.map(option => `${group.id}:${option.id}`)
        )).join('|');
        return {
            overflowCredits: candidate.overflowCredits,
            unplacedCount: unplacedCodes.size,
            unplacedCredits,
            additionalChoiceCredits: candidate.additionalChoiceCredits,
            additionalChoiceCount: candidate.additionalChoiceCodes.length,
            completionTermIndex,
            choiceKey
        };
    }

    function compareWorksheetVariants(left, right) {
        const a = worksheetVariantRank(left);
        const b = worksheetVariantRank(right);
        return a.overflowCredits - b.overflowCredits
            || a.unplacedCount - b.unplacedCount
            || a.unplacedCredits - b.unplacedCredits
            || a.additionalChoiceCredits - b.additionalChoiceCredits
            || a.additionalChoiceCount - b.additionalChoiceCount
            || a.completionTermIndex - b.completionTermIndex
            || a.choiceKey.localeCompare(b.choiceKey);
    }

    function rankWorksheetVariants(candidates) {
        return candidates.slice().sort(compareWorksheetVariants);
    }

    function previewWithinDegreeLimit(candidate) {
        const preview = candidate.searchContext.preview;
        if (!candidate.overflowCredits || !candidate.degreeCreditsRequired) {
            return preview;
        }

        const placement = {};
        const consumed = new Set();
        let placedCredits = 0;
        const entries = Object.entries(preview).sort(([leftCode, leftTerm], [rightCode, rightTerm]) => (
            leftTerm - rightTerm || leftCode.localeCompare(rightCode)
        ));

        for (const [code, termIndex] of entries) {
            if (consumed.has(code)) continue;
            const group = [];
            const queue = [code];
            while (queue.length) {
                const member = queue.shift();
                if (consumed.has(member) || preview[member] !== termIndex) continue;
                consumed.add(member);
                group.push(member);
                (candidate.searchContext.corequisites[member] || []).forEach(other => queue.push(other));
            }
            const groupCredits = group.reduce((sum, member) => (
                sum + candidate.searchContext.index[member].credits
            ), 0);
            if (placedCredits + groupCredits > candidate.degreeCreditsRequired) break;
            group.sort().forEach(member => {
                placement[member] = termIndex;
            });
            placedCredits += groupCredits;
        }
        return placement;
    }

    function findWorksheetWinner(candidates, searchTerms, limits, maxHorizon, budget) {
        for (let horizon = 1; horizon <= maxHorizon; horizon += 1) {
            for (const candidate of candidates) {
                const context = candidate.searchContext;
                if (candidate.overflowCredits || candidate.hasUnplacedRequirement || context.topology.cycle.length) {
                    continue;
                }
                if (context.topology.order.some(code => !context.index[code].offeredQuarters.length)) continue;
                const attempt = searchAtHorizon(
                    context.topology.order,
                    context.dependencies,
                    context.corequisites,
                    context.index,
                    searchTerms,
                    limits,
                    horizon,
                    budget
                );
                if (attempt.placement) {
                    return Object.assign({}, candidate, { placement: attempt.placement });
                }
                if (attempt.capped) return null;
            }
        }
        return null;
    }

    function ownerGroups(owner, ownerId) {
        return [].concat(
            owner.requirementGroups || owner.groups || [],
            owner.supportRequirements || []
        ).map((group, index) => (
            normalizeGroup(group, ownerId, index)
        ));
    }

    function buildVariantContext(baseContributions, selection, courseIndex) {
        const required = new Map();
        baseContributions.forEach((owners, code) => addContribution(required, code, owners));
        selection.forEach(({ group, options }) => {
            options.forEach(option => {
                option.courseCodes.forEach(code => addContribution(required, code, [group.ownerId]));
            });
        });
        return expandPrerequisites(required, courseIndex);
    }

    function relevantIssues(snapshot, selectedLensIds, includedCodes) {
        const selected = new Set(selectedLensIds);
        const included = new Set(includedCodes);
        return (snapshot.issues || []).filter(issue => {
            if (!stateNeedsReview(issue.status || issue.reviewState || issue.type)) return false;
            const lensIds = issue.lensIds || [];
            const courseCodes = issue.affectedCourseCodes || [];
            if (lensIds.length && !lensIds.some(id => selected.has(id))) return false;
            if (!lensIds.length && courseCodes.length && !courseCodes.some(code => included.has(code))) return false;
            return true;
        }).sort((a, b) => String(a.id || a.summary).localeCompare(String(b.id || b.summary)));
    }

    function plan(snapshot, lensIds, options) {
        if (!snapshot || !snapshot.curriculum || !snapshot.curriculum.bdes) {
            throw new TypeError('AdvisingPlanner requires a normalized curriculum snapshot.');
        }
        if (!Array.isArray(lensIds)) {
            throw new TypeError('lensIds must be an array.');
        }

        const lenses = (snapshot.lenses || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const lensById = Object.fromEntries(lenses.map(lens => [lens.id, lens]));
        const selectedLensIds = stableStrings(lensIds);
        const unknown = selectedLensIds.filter(id => !lensById[id]);
        if (unknown.length) throw new RangeError(`Unknown advising lens: ${unknown.join(', ')}`);
        if (selectedLensIds.length > 3) throw new RangeError('Select no more than three advising lenses.');

        const selectedLenses = selectedLensIds.map(id => lensById[id]);
        const courseIndex = normalizeCourseIndex(snapshot.curriculum.courses);
        const limits = normalizeLimits(snapshot, options || {});
        const totalTermCount = limits.normalTerms + limits.extensionTerms;
        const searchTerms = generateTerms(limits, totalTermCount);
        const bdes = snapshot.curriculum.bdes;
        const owners = [{ owner: bdes, ownerId: 'bdes' }].concat(
            selectedLenses.map(lens => ({ owner: lens, ownerId: lens.id }))
        );
        const allGroups = owners.flatMap(({ owner, ownerId }) => ownerGroups(owner, ownerId));
        const choiceGroups = allGroups.filter(group => group.type !== 'all-of');
        const allOfGroups = allGroups.filter(group => group.type === 'all-of');
        const baseContributions = new Map();
        const highlightContributions = new Map();

        allGroups.forEach(group => {
            group.courses.forEach(code => addContribution(highlightContributions, code, [group.ownerId]));
        });
        allOfGroups.forEach(group => {
            group.courses.forEach(code => addContribution(baseContributions, code, [group.ownerId]));
        });

        const firstSelection = firstSelectionVariant(choiceGroups);
        if (!firstSelection) throw new RangeError('A choose-N requirement has fewer alternatives than required.');
        const budget = { visited: 0, limit: limits.maxSearchNodes, capped: false };
        const prepared = prepareVariants(
            choiceGroups,
            baseContributions,
            courseIndex,
            searchTerms,
            limits,
            budget
        );
        const fallbackPrepared = prepared[0] || prepareVariant(
            firstSelection,
            baseContributions,
            courseIndex,
            searchTerms,
            limits
        );
        const degreeRequirements = snapshot.curriculum.degreeRequirements || null;
        const preparedWorksheets = rankWorksheetVariants(prepared.map(candidate => buildWorksheetVariant(
            candidate,
            baseContributions,
            courseIndex,
            bdes,
            degreeRequirements,
            limits,
            searchTerms
        )));
        const fallback = preparedWorksheets[0]
            || buildWorksheetVariant(
                fallbackPrepared,
                baseContributions,
                courseIndex,
                bdes,
                degreeRequirements,
                limits,
                searchTerms
            );
        const worksheetWinner = budget.capped
            ? null
            : findWorksheetWinner(preparedWorksheets, searchTerms, limits, totalTermCount, budget);
        const offeringDiagnostic = offeringConstraintDiagnostic(
            prepared,
            worksheetWinner,
            courseIndex,
            searchTerms,
            limits,
            selectedLensIds,
            budget
        );

        const chosen = worksheetWinner || fallback;
        const {
            includedCodes,
            selectedNamedCodes,
            selectedDegreeCourseCodes,
            electiveProgress,
            degreeSlots,
            bdesElectivePlaceholders,
            namedDegreeCredits,
            degreeCreditsRequired,
            representedDegreeCredits,
            overflowCredits,
            remainingDegreeCredits,
            openDegreePlaceholders,
            placeholderCourses,
            worksheet
        } = chosen;
        const selectedChoiceResults = buildChoiceResult(chosen.selection);
        const alternativeCodes = new Set(selectedChoiceResults.flatMap(group => group.remainingCourseCodes));
        const selectedRequirementCodes = new Set(includedCodes);
        const allDisplayCodes = stableStrings([].concat(includedCodes, Array.from(alternativeCodes))).filter(code => {
            const course = courseIndex[code];
            return !(course && course.external && course.conditionOnly);
        });
        const winner = worksheetWinner;
        const previewPlacement = chosen.searchContext.preview;
        const placement = winner
            ? winner.placement
            : previewWithinDegreeLimit(chosen);
        const placementIndex = worksheet?.index || courseIndex;
        const scheduledCodes = new Set(Object.keys(placement));
        const overflowExcludedCodes = new Set(Object.keys(previewPlacement).filter(code => (
            !scheduledCodes.has(code)
        )));
        const representedCourseCodes = worksheet?.representedCourseCodes || new Set();
        const conditions = chosen.expanded.conditions.filter(condition => (
            !representedCourseCodes.has(condition.code)
        ));
        const unplaced = conditions.filter(condition => condition.includeUnplaced !== false).map(condition => ({
            code: condition.code,
            title: courseIndex[condition.code]?.title || condition.code,
            reason: condition.reason,
            affected: condition.affected.slice(),
            sourceIds: condition.sourceIds.slice()
        }));
        const conditionUnplacedCodes = new Set(unplaced.map(item => item.code));

        if (!winner) {
            const requiredCodes = worksheet
                ? worksheet.topology.order
                : chosen.expanded.internalCodes;
            requiredCodes.filter(code => (
                !scheduledCodes.has(code) && !conditionUnplacedCodes.has(code)
            )).forEach(code => {
                const course = placementIndex[code];
                unplaced.push({
                    code,
                    title: course.title,
                    reason: budget.capped
                        ? 'search-limit'
                        : !course.offeredQuarters.length
                            ? 'missing-offering-pattern'
                            : overflowExcludedCodes.has(code)
                                ? 'degree-credit-overflow'
                                : 'no-known-placement',
                    affected: [code],
                    sourceIds: course.sourceIds.slice()
                });
            });
        }

        const completionTermIndex = winner && Object.keys(placement).length
            ? Math.max(...Object.values(placement))
            : null;
        const latestPlacedTermIndex = Object.keys(placement).length
            ? Math.max(...Object.values(placement))
            : null;
        const outputTermCount = Math.max(limits.normalTerms, (latestPlacedTermIndex ?? -1) + 1);
        const terms = generateTerms(limits, outputTermCount);
        Object.entries(placement).sort(([left], [right]) => left.localeCompare(right)).forEach(([code, termIndex]) => {
            if (!terms[termIndex]) return;
            terms[termIndex].courseCodes.push(code);
            terms[termIndex].credits += placementIndex[code].credits;
        });
        terms.forEach(term => term.courseCodes.sort());

        const namedCourses = allDisplayCodes.map(code => {
            const course = courseIndex[code];
            const contributionIds = stableStrings([].concat(
                Array.from(chosen.expanded.contributions.get(code) || []),
                Array.from(highlightContributions.get(code) || [])
            ));
            const termIndex = Object.prototype.hasOwnProperty.call(placement, code) ? placement[code] : null;
            return {
                code,
                title: course?.title || code,
                credits: course?.credits || 0,
                offeredQuarters: course?.offeredQuarters.slice() || [],
                prerequisites: deepCopy(course?.prerequisites || []),
                corequisites: deepCopy(course?.corequisites || []),
                external: course?.external === true,
                reviewState: course?.reviewState || 'advisor-review-required',
                contributionIds,
                sourceIds: course?.sourceIds.slice() || [],
                requirementState: alternativeCodes.has(code) && !selectedRequirementCodes.has(code)
                    ? 'alternative'
                    : 'selected',
                termIndex,
                termLabel: termIndex === null ? null : terms[termIndex]?.label || null
            };
        });
        const plannedPlaceholders = placeholderCourses.map(placeholder => {
            const termIndex = Object.prototype.hasOwnProperty.call(placement, placeholder.code)
                ? placement[placeholder.code]
                : null;
            return Object.assign({}, placeholder, {
                termIndex,
                termLabel: termIndex === null ? null : terms[termIndex]?.label || null
            });
        });
        const courses = namedCourses.concat(plannedPlaceholders).sort((left, right) => (
            left.code.localeCompare(right.code)
        ));

        const ledger = [];
        const uncertaintyKeys = new Set();
        function addUncertainty(key, entry) {
            uncertaintyKeys.add(key);
            ledger.push(entry);
        }

        if (stateNeedsReview(limits.reviewState)) {
            addUncertainty('planning-limits', ledgerEntry(
                'review-planning-limits',
                'advisor-review',
                'The planning limits require advisor review.',
                [],
                limits.sourceIds
            ));
        }
        owners.forEach(({ owner, ownerId }) => {
            if (stateNeedsReview(owner.reviewState)) {
                addUncertainty(`owner:${ownerId}`, ledgerEntry(
                    `review-${ownerId}`,
                    'advisor-review',
                    `${owner.name || ownerId} contains a rule that requires advisor review.`,
                    [ownerId],
                    owner.sourceIds
                ));
            }
        });
        allGroups.forEach(group => {
            if (stateNeedsReview(group.reviewState)) {
                addUncertainty(`group:${group.id}`, ledgerEntry(
                    `review-group-${group.id}`,
                    'advisor-review',
                    `${group.label} requires advisor review.`,
                    group.courses,
                    group.sourceIds
                ));
            }
        });
        courses.filter(course => (
            course.requirementState === 'selected' && !course.placeholder
        )).forEach(course => {
            const indexedCourse = courseIndex[course.code];
            if (
                stateNeedsReview(course.reviewState)
                || stateNeedsReview(indexedCourse?.offeringReviewState)
                || !course.offeredQuarters.length
                || !indexedCourse?.prerequisitesKnown
                || (!(course.credits > 0) && !course.external)
            ) {
                addUncertainty(`course:${course.code}`, ledgerEntry(
                    `review-course-${course.code.replace(/\s+/g, '-').toLowerCase()}`,
                    'advisor-review',
                    `${course.code} has missing or review-required course facts.`,
                    [course.code],
                    course.sourceIds
                ));
            }
        });
        conditions.forEach((condition, index) => {
            const entry = ledgerEntry(
                `condition-${index + 1}`,
                condition.reason === 'external-condition' ? 'external-condition' : 'advisor-review',
                condition.message,
                condition.affected,
                condition.sourceIds
            );
            if (condition.requiresReview === false) {
                ledger.push(entry);
            } else {
                addUncertainty(`condition:${condition.reason}:${condition.code}`, entry);
            }
        });
        const activeCycle = worksheet?.topology.cycle || chosen.topology.cycle;
        if (activeCycle.length) {
            ledger.push(ledgerEntry(
                'prerequisite-cycle',
                'prerequisite',
                `A prerequisite cycle prevents placement: ${activeCycle.join(', ')}.`,
                activeCycle,
                activeCycle.flatMap(code => placementIndex[code]?.sourceIds || [])
            ));
        }

        degreeSlots.satisfied.forEach(item => {
            ledger.push(ledgerEntry(
                `degree-requirement-overlap-${item.placeholderId}`,
                'degree-requirement-overlap',
                `${item.courseCode} occupies the ${item.label} requirement slot under the one-course-one-slot policy; confirm the student's audit in DegreeWorks.`,
                [item.placeholderId, item.courseCode],
                item.sourceIds
            ));
        });
        if (placeholderCourses.length) {
            ledger.push(ledgerEntry(
                'degreeworks-placeholder-verification',
                'degreeworks-verification',
                'External planning placeholders reserve credit space only. The advisor must confirm the student-specific requirements and course choices in DegreeWorks.',
                placeholderCourses.map(course => course.code),
                placeholderCourses.flatMap(course => course.sourceIds)
            ));
        }

        relevantIssues(snapshot, selectedLensIds, includedCodes).forEach(issue => {
            if (issue.planningImpact === 'informational') {
                ledger.push(ledgerEntry(
                    `issue-${issue.id || ledger.length + 1}`,
                    'historical-offering-evidence',
                    `${String(issue.summary || issue.details)} The approved normal-quarter pattern remains a hard constraint; observed or possible exceptions were not used.`,
                    [].concat(issue.affectedCourseCodes || [], issue.lensIds || []),
                    issue.sourceIds
                ));
                return;
            }
            addUncertainty(`issue:${issue.id || issue.summary}`, ledgerEntry(
                `issue-${issue.id || ledger.length + 1}`,
                'advisor-review',
                String(issue.summary || issue.details || 'A selected curriculum rule requires advisor review.'),
                [].concat(issue.affectedCourseCodes || [], issue.lensIds || []),
                issue.sourceIds
            ));
        });

        if (budget.capped) {
            addUncertainty('search-cap', ledgerEntry(
                'search-node-limit',
                'search-limit',
                `The planner reached its ${limits.maxSearchNodes}-node search limit; it cannot claim this combination is impossible.`,
                selectedLensIds,
                limits.sourceIds
            ));
        }
        if (overflowCredits > 0) {
            ledger.push(ledgerEntry(
                'degree-credit-overflow',
                'degree-credit-overflow',
                `Selected named requirements and required degree placeholders total ${representedDegreeCredits} credits, exceeding the ${degreeCreditsRequired}-credit worksheet target by ${overflowCredits} credits.`,
                Array.from(overflowExcludedCodes),
                stableStrings([].concat(bdes.sourceIds || [], degreeRequirements?.sourceIds || []))
            ));
        }
        if (offeringDiagnostic && !overflowCredits && !uncertaintyKeys.size && !budget.capped) {
            ledger.push(ledgerEntry(
                'historical-offering-pattern-inhibits-normal-completion',
                'historical-offering-constraint',
                'The current historical teaching pattern inhibits normal completion for the selected lens combination. Review the teaching rotation with the department chair; the planner does not assume a future offering exception.',
                offeringDiagnostic.affected,
                stableStrings([].concat(offeringDiagnostic.sourceIds, limits.sourceIds))
            ));
        }
        if (winner && completionTermIndex >= limits.normalTerms) {
            ledger.push(ledgerEntry(
                'extension-required',
                'extension',
                `The earliest modeled placement uses ${terms[completionTermIndex].label}, beyond the ${limits.normalTerms}-term normal horizon.`,
                terms.slice(limits.normalTerms, completionTermIndex + 1).flatMap(term => term.courseCodes),
                limits.sourceIds
            ));
        }
        if (!winner) {
            const requiredCodes = worksheet
                ? worksheet.topology.order
                : chosen.expanded.internalCodes;
            ledger.push(ledgerEntry(
                'no-complete-placement',
                budget.capped || uncertaintyKeys.size ? 'advisor-review' : 'no-known-sequence',
                budget.capped || uncertaintyKeys.size
                    ? 'The working preview is incomplete; review the named constraints before drawing a feasibility conclusion.'
                    : overflowCredits
                        ? `The selected requirements exceed the ${degreeCreditsRequired}-credit worksheet target.`
                        : `No placement satisfies all approved rules within ${totalTermCount} modeled terms.`,
                requiredCodes.filter(code => !scheduledCodes.has(code)),
                limits.sourceIds
            ));
        }
        if (electiveProgress.openCredits > 0) {
            ledger.push(ledgerEntry(
                'open-bdes-electives',
                'open-electives',
                `${electiveProgress.openCredits} BDes elective credits remain open; the planner does not invent unselected electives.`,
                bdesElectivePlaceholders.map(course => course.code),
                bdes.sourceIds
            ));
        }
        if (openDegreePlaceholders.length) {
            ledger.push(ledgerEntry(
                'open-degree-credits',
                'open-degree-credits',
                `${remainingDegreeCredits} additional credits remain open after named coursework and documented degree-requirement placeholders; the advisor chooses them with the student.`,
                openDegreePlaceholders.map(course => course.code),
                openDegreePlaceholders.flatMap(course => course.sourceIds)
            ));
        }
        ledger.push(ledgerEntry(
            'planning-guidance',
            'planning-assumption',
            'This generic sequence uses usual offerings as planning guidance, not a promise of future enrollment, capacity, or section availability.',
            selectedLensIds,
            stableStrings([].concat(limits.sourceIds, bdes.sourceIds || []))
        ));

        const overlapCourseCount = courses.filter(course => (
            course.requirementState === 'selected' && course.contributionIds.length > 1
        )).length;
        if (overlapCourseCount) {
            ledger.push(ledgerEntry(
                'source-overlap',
                'planning-assumption',
                'Shared markers show source-level curriculum overlap and do not guarantee institutional double-counting.',
                courses.filter(course => course.contributionIds.length > 1).map(course => course.code),
                []
            ));
        }

        let status;
        if (uncertaintyKeys.size) status = 'advisor-review-required';
        else if (!winner) status = 'no-known-sequence';
        else if (completionTermIndex >= limits.normalTerms) status = 'requires-extension';
        else status = 'fits-normal-horizon';

        const usedSourceIds = stableStrings([].concat(
            limits.sourceIds,
            bdes.sourceIds || [],
            selectedLenses.flatMap(lens => lens.sourceIds || []),
            courses.flatMap(course => course.sourceIds),
            ledger.flatMap(entry => entry.sourceIds)
        ));
        const sources = {};
        usedSourceIds.forEach(sourceId => {
            if (snapshot.sources && snapshot.sources[sourceId]) {
                sources[sourceId] = deepCopy(snapshot.sources[sourceId]);
            }
        });

        return {
            status,
            selectedLensIds,
            courses,
            terms,
            unplaced: dedupeUnplaced(unplaced),
            choiceGroups: selectedChoiceResults,
            electiveProgress,
            ledger: ledger.sort((a, b) => a.id.localeCompare(b.id)),
            sources,
            metrics: {
                normalTermCount: limits.normalTerms,
                extensionTermCount: limits.extensionTerms,
                maxCreditsPerTerm: limits.maxCreditsPerTerm,
                maxSearchNodes: limits.maxSearchNodes,
                searchNodesVisited: budget.visited,
                completionTermIndex,
                totalNamedCredits: namedDegreeCredits,
                totalPlannedCredits: terms.reduce((sum, term) => sum + term.credits, 0),
                degreeCreditsRequired,
                requiredWorksheetCredits: representedDegreeCredits,
                degreeOverflowCredits: overflowCredits,
                placeholderCount: placeholderCourses.length,
                placeholderCredits: placeholderCourses.reduce((sum, course) => sum + course.credits, 0),
                generalEducationPlaceholderCount: degreeSlots.placeholders.length,
                bdesElectivePlaceholderCount: bdesElectivePlaceholders.length,
                openDegreePlaceholderCount: openDegreePlaceholders.length,
                totalCourses: selectedDegreeCourseCodes.length,
                overlapCourseCount,
                searchComplete: !budget.capped
            }
        };
    }

    return Object.freeze({ plan });
})();

if (typeof window !== 'undefined') {
    window.AdvisingPlanner = AdvisingPlanner;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvisingPlanner;
}
