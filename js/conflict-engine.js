/**
 * Conflict Engine
 * Evaluates schedules against database-driven constraints
 */

const ConflictEngine = (function() {

    // Available rooms for resolution calculations
    const ROOMS = ['206', '207', '208', '209', '210', '212'];
    const DEFAULT_TIME_SLOTS = ['10:00-12:20', '13:00-15:20', '16:00-18:20'];
    const LEGACY_TIME_SLOT_ALIASES = {
        '10:00-12:00': '10:00-12:20',
        '13:00-15:00': '13:00-15:20',
        '16:00-18:00': '16:00-18:20'
    };
    const DAY_PATTERNS = ['MW', 'TR'];
    const AY_QUARTERS = ['fall', 'winter', 'spring'];
    const AY_QUARTER_LABELS = {
        fall: 'Fall',
        winter: 'Winter',
        spring: 'Spring'
    };
    
    // Common course pairings that students typically take together
    // These are graduation pathway conflicts - courses in the same pathway/year
    const COMMON_PAIRINGS = [
        // Freshman year combinations
        ['DESN 100', 'DESN 216'],
        ['DESN 200', 'DESN 216'],
        ['DESN 200', 'DESN 243'],
        ['DESN 243', 'DESN 263'],
        
        // Sophomore year combinations  
        ['DESN 326', 'DESN 355'],
        ['DESN 326', 'DESN 301'],
        ['DESN 338', 'DESN 368'],
        ['DESN 338', 'DESN 355'],
        
        // Junior year combinations
        ['DESN 336', 'DESN 365'],
        ['DESN 348', 'DESN 378'],
        ['DESN 369', 'DESN 379'],
        ['DESN 458', 'DESN 468'],
        
        // Senior year combinations - CRITICAL
        ['DESN 401', 'DESN 463'],
        ['DESN 365', 'DESN 468'],
        ['DESN 463', 'DESN 480'],
        ['DESN 463', 'DESN 490'],
        ['DESN 480', 'DESN 490'],
        ['DESN 469', 'DESN 480'],
        
        // UX Track sequence
        ['DESN 338', 'DESN 348'],
        ['DESN 348', 'DESN 458'],
        
        // Animation Track sequence
        ['DESN 355', 'DESN 365'],
        ['DESN 336', 'DESN 446'],
        
        // Code Track sequence
        ['DESN 368', 'DESN 378'],
        ['DESN 369', 'DESN 469']
    ];

    const PATHWAY_PAIR_IMPACT_OVERRIDES = {
        'DESN 463::DESN 480': { label: 'graduation-critical', score: 28 },
        'DESN 463::DESN 490': { label: 'graduation-critical', score: 28 },
        'DESN 480::DESN 490': { label: 'graduation-critical', score: 28 },
        'DESN 469::DESN 480': { label: 'graduation-critical', score: 24 },
        'DESN 401::DESN 463': { label: 'pathway-sequence-critical', score: 22 },
        'DESN 365::DESN 468': { label: 'pathway-sequence-critical', score: 20 },
        'DESN 348::DESN 458': { label: 'pathway-sequence-critical', score: 18 },
        'DESN 355::DESN 365': { label: 'pathway-sequence-critical', score: 16 },
        'DESN 368::DESN 378': { label: 'pathway-sequence-critical', score: 16 },
        'DESN 369::DESN 469': { label: 'pathway-sequence-critical', score: 16 }
    };

    const AY_DEFAULT_THRESHOLDS = {
        annualOverloadWarning: 3,
        annualOverloadCritical: 8,
        annualUnderloadWarning: 6,
        quarterOverloadWarning: 2,
        quarterOverloadCritical: 5,
        quarterUnderloadWarning: 3,
        adjunctUnderloadWarning: 0.5,
        adjunctOverloadWarning: 2
    };

    const CONSTRAINT_TYPE_ALIASES = {
        faculty_conflict: 'faculty_double_book',
        faculty_double_booking: 'faculty_double_book',
        room_conflict: 'room_double_book',
        room_double_booking: 'room_double_book',
        student_pathway_conflict: 'student_conflict',
        pathway_conflict: 'student_conflict',
        student_scheduling_conflict: 'student_conflict'
    };

    const FALLBACK_CONFLICT_TAXONOMY = {
        tiers: {
            hard_block: { label: 'Hard Block', scoreMin: 90, scoreMax: 100, blocksSave: true },
            warning: { label: 'Warning', scoreMin: 50, scoreMax: 89, blocksSave: false },
            suggestion: { label: 'Suggestion', scoreMin: 20, scoreMax: 49, blocksSave: false },
            optimization: { label: 'Optimization', scoreMin: 1, scoreMax: 19, blocksSave: false }
        },
        legacyToTier: {
            critical: 'hard_block',
            warning: 'warning',
            info: 'suggestion'
        },
        tierToLegacy: {
            hard_block: 'critical',
            warning: 'warning',
            suggestion: 'info',
            optimization: 'info'
        },
        defaultTierByConstraint: {
            room_restriction: 'warning',
            student_conflict: 'warning',
            faculty_double_book: 'hard_block',
            room_double_book: 'hard_block',
            evening_safety: 'warning',
            ay_setup_alignment: 'warning',
            enrollment_threshold: 'suggestion',
            campus_transition: 'suggestion'
        },
        escalation: {
            STUDENT_CONFLICT_PROMOTE_WARNING_DAYS: 45,
            STUDENT_CONFLICT_PROMOTE_HARD_BLOCK_DAYS: 14,
            STUDENT_CONFLICT_DEMOTE_SUGGESTION_DAYS: 120,
            LOW_IMPACT_PATHWAY_SCORE_MAX: 8
        }
    };

    const externalConflictConstants = (
        typeof CONSTANTS !== 'undefined'
        && CONSTANTS
        && typeof CONSTANTS === 'object'
        && CONSTANTS.CONFLICTS
    ) ? CONSTANTS.CONFLICTS : null;

    const CONFLICT_TIER_DEFINITIONS = {
        ...FALLBACK_CONFLICT_TAXONOMY.tiers,
        ...(externalConflictConstants?.TIERS
            ? {
                hard_block: externalConflictConstants.TIERS.HARD_BLOCK || FALLBACK_CONFLICT_TAXONOMY.tiers.hard_block,
                warning: externalConflictConstants.TIERS.WARNING || FALLBACK_CONFLICT_TAXONOMY.tiers.warning,
                suggestion: externalConflictConstants.TIERS.SUGGESTION || FALLBACK_CONFLICT_TAXONOMY.tiers.suggestion,
                optimization: externalConflictConstants.TIERS.OPTIMIZATION || FALLBACK_CONFLICT_TAXONOMY.tiers.optimization
            }
            : {})
    };

    const LEGACY_SEVERITY_TO_TIER = {
        ...FALLBACK_CONFLICT_TAXONOMY.legacyToTier,
        ...(externalConflictConstants?.LEGACY_SEVERITY_TO_TIER || {})
    };

    const TIER_TO_LEGACY_SEVERITY = {
        ...FALLBACK_CONFLICT_TAXONOMY.tierToLegacy,
        ...(externalConflictConstants?.TIER_TO_LEGACY_SEVERITY || {})
    };

    const DEFAULT_TIER_BY_CONSTRAINT = {
        ...FALLBACK_CONFLICT_TAXONOMY.defaultTierByConstraint,
        ...(externalConflictConstants?.DEFAULT_TIER_BY_CONSTRAINT || {})
    };

    const TIER_ESCALATION = {
        ...FALLBACK_CONFLICT_TAXONOMY.escalation,
        ...(externalConflictConstants?.ESCALATION || {})
    };

    function resolveTierScore(tier) {
        const def = CONFLICT_TIER_DEFINITIONS[tier];
        if (!def) return 20;
        const min = Number(def.scoreMin);
        const max = Number(def.scoreMax);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return 20;
        return Math.round((min + max) / 2);
    }

    const ISSUE_SEVERITY_SCORE = {
        hard_block: resolveTierScore('hard_block'),
        warning: resolveTierScore('warning'),
        suggestion: resolveTierScore('suggestion'),
        optimization: resolveTierScore('optimization')
    };

    const ISSUE_PRIORITY_SCORE = {
        critical: 18,
        high: 12,
        medium: 6,
        low: 2
    };

    const CONFLICT_RULE_REGISTRY = {
        room_restriction: {
            id: 'room_restriction',
            label: 'Room Restriction',
            category: 'room',
            hardness: 'hard',
            baseWeight: 16
        },
        student_conflict: {
            id: 'student_conflict',
            label: 'Student Pathway Conflict',
            category: 'pathway',
            hardness: 'hard',
            baseWeight: 28,
            pairings: COMMON_PAIRINGS
        },
        faculty_double_book: {
            id: 'faculty_double_book',
            label: 'Faculty Double Booking',
            category: 'faculty',
            hardness: 'hard',
            baseWeight: 30
        },
        room_double_book: {
            id: 'room_double_book',
            label: 'Room Double Booking',
            category: 'room',
            hardness: 'hard',
            baseWeight: 30
        },
        evening_safety: {
            id: 'evening_safety',
            label: 'Evening Safety',
            category: 'safety',
            hardness: 'soft',
            baseWeight: 18
        },
        ay_setup_alignment: {
            id: 'ay_setup_alignment',
            label: 'AY Setup Alignment',
            category: 'workload',
            hardness: 'soft',
            baseWeight: 14
        },
        enrollment_threshold: {
            id: 'enrollment_threshold',
            label: 'Enrollment Threshold',
            category: 'enrollment',
            hardness: 'soft',
            baseWeight: 10
        },
        _default: {
            id: 'generic',
            label: 'Generic Rule',
            category: 'general',
            hardness: 'soft',
            baseWeight: 10
        }
    };

    const DEFAULT_RULE_PLUGIN_METADATA = {
        room_restriction: { name: 'Room Restriction Rule', tier: 'warning' },
        student_conflict: { name: 'Student Pathway Rule', tier: 'warning' },
        faculty_double_book: { name: 'Faculty Double Book Rule', tier: 'hard_block' },
        room_double_book: { name: 'Room Double Book Rule', tier: 'hard_block' },
        evening_safety: { name: 'Evening Safety Rule', tier: 'warning' },
        ay_setup_alignment: { name: 'AY Setup Alignment Rule', tier: 'warning' },
        enrollment_threshold: { name: 'Enrollment Threshold Rule', tier: 'suggestion' },
        campus_transition: { name: 'Campus Transition Rule', tier: 'suggestion' }
    };

    const rulePlugins = new Map();

    function normalizeConstraintType(type) {
        const normalized = String(type || '').trim().toLowerCase();
        return CONSTRAINT_TYPE_ALIASES[normalized] || normalized;
    }

    function toTierName(rawValue) {
        const normalized = String(rawValue || '').trim().toLowerCase().replace(/\s+/g, '_');
        if (!normalized) return '';
        if (CONFLICT_TIER_DEFINITIONS[normalized]) return normalized;
        return LEGACY_SEVERITY_TO_TIER[normalized] || '';
    }

    function clampIssueTier(baseTier, normalizedConstraintType) {
        if (CONFLICT_TIER_DEFINITIONS[baseTier]) return baseTier;
        const fallback = DEFAULT_TIER_BY_CONSTRAINT[normalizedConstraintType];
        if (CONFLICT_TIER_DEFINITIONS[fallback]) return fallback;
        return 'suggestion';
    }

    function isUpperDivisionPathwayIssue(issue) {
        const courses = Array.isArray(issue?.courses) ? issue.courses : [];
        const has400LevelCourse = courses.some((course) => {
            const code = normalizeCourseCode(course?.code || course);
            const match = code.match(/(\d{3})/);
            return match ? Number(match[1]) >= 400 : false;
        });
        return has400LevelCourse || String(issue?.pathwayImpact || '').includes('graduation');
    }

    function promoteTier(tier) {
        if (tier === 'optimization') return 'suggestion';
        if (tier === 'suggestion') return 'warning';
        if (tier === 'warning') return 'hard_block';
        return 'hard_block';
    }

    function demoteTier(tier) {
        if (tier === 'hard_block') return 'warning';
        if (tier === 'warning') return 'suggestion';
        if (tier === 'suggestion') return 'optimization';
        return 'optimization';
    }

    function applyTierEscalationRules(tier, normalizedConstraintType, issue, context = {}) {
        let nextTier = clampIssueTier(tier, normalizedConstraintType);
        const daysUntilGraduation = Number(
            context.daysUntilGraduation ?? context.graduationDeadlineDays
        );
        const pathwayImpactScore = Number(issue?.pathwayImpactScore || 0);

        if (normalizedConstraintType === 'student_conflict' && Number.isFinite(daysUntilGraduation)) {
            if (daysUntilGraduation <= TIER_ESCALATION.STUDENT_CONFLICT_PROMOTE_WARNING_DAYS && nextTier === 'suggestion') {
                nextTier = promoteTier(nextTier);
            }

            if (
                daysUntilGraduation <= TIER_ESCALATION.STUDENT_CONFLICT_PROMOTE_HARD_BLOCK_DAYS
                && nextTier === 'warning'
                && isUpperDivisionPathwayIssue(issue)
            ) {
                nextTier = promoteTier(nextTier);
            }

            if (
                daysUntilGraduation >= TIER_ESCALATION.STUDENT_CONFLICT_DEMOTE_SUGGESTION_DAYS
                && nextTier === 'warning'
                && pathwayImpactScore <= TIER_ESCALATION.LOW_IMPACT_PATHWAY_SCORE_MAX
            ) {
                nextTier = demoteTier(nextTier);
            }
        }

        if (normalizedConstraintType === 'room_restriction' && issue?.roomFitStatus === 'blocked') {
            nextTier = 'hard_block';
        }

        return clampIssueTier(nextTier, normalizedConstraintType);
    }

    function resolveIssueTier(issue, normalizedConstraintType, context = {}) {
        const raw = issue?.severityTier || issue?.tier || issue?.severity;
        const baseTier = clampIssueTier(toTierName(raw), normalizedConstraintType);
        return applyTierEscalationRules(baseTier, normalizedConstraintType, issue, context);
    }

    function resolveLegacySeverityFromTier(tier) {
        return TIER_TO_LEGACY_SEVERITY[tier] || 'info';
    }

    function normalizeTimeSlotLabel(timeSlot) {
        const raw = String(timeSlot || '').trim();
        if (!raw) return '';
        return LEGACY_TIME_SLOT_ALIASES[raw] || raw;
    }

    function getDayPatternLabel(dayPattern) {
        return dayPattern === 'MW'
            ? 'Monday/Wednesday'
            : dayPattern === 'TR'
                ? 'Tuesday/Thursday'
                : dayPattern;
    }

    function sortTimeSlots(slots) {
        const order = new Map(DEFAULT_TIME_SLOTS.map((slot, index) => [slot, index]));

        return [...slots].sort((a, b) => {
            const aOrder = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
            const bOrder = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a).localeCompare(String(b));
        });
    }

    function resolveTimeSlotToValidLabel(timeSlot, validTimeSlots) {
        const normalized = normalizeTimeSlotLabel(timeSlot);
        if (!normalized) return '';

        const slots = Array.isArray(validTimeSlots)
            ? validTimeSlots.map(normalizeTimeSlotLabel).filter(Boolean)
            : [];

        if (slots.length === 0) return normalized;
        if (slots.includes(normalized)) return normalized;

        const startTime = normalized.split('-')[0];
        const byStartTime = slots.find((slot) => slot.split('-')[0] === startTime);
        return byStartTime || '';
    }

    function deriveResolutionTimeSlots(schedule, context = {}) {
        const discovered = [];
        const collect = (value) => {
            const normalized = normalizeTimeSlotLabel(value);
            if (normalized) discovered.push(normalized);
        };

        if (Array.isArray(context.timeSlots)) {
            context.timeSlots.forEach(collect);
        }
        if (Array.isArray(context.availableTimeSlots)) {
            context.availableTimeSlots.forEach(collect);
        }

        if (context.scheduleByQuarter && typeof context.scheduleByQuarter === 'object') {
            AY_QUARTERS.forEach((quarter) => {
                const courses = Array.isArray(context.scheduleByQuarter[quarter]) ? context.scheduleByQuarter[quarter] : [];
                courses.forEach((course) => collect(course.time));
            });
        }

        (Array.isArray(schedule) ? schedule : []).forEach((course) => collect(course.time));

        return sortTimeSlots(new Set([...discovered, ...DEFAULT_TIME_SLOTS]));
    }

    function normalizePreferredResolutions(preferredResolutions, validTimeSlots) {
        const normalized = [];

        (Array.isArray(preferredResolutions) ? preferredResolutions : []).forEach((resolution) => {
            if (!resolution || typeof resolution !== 'object') return;
            if (!resolution.target_slot) {
                normalized.push({ ...resolution });
                return;
            }

            const rawTargetSlot = String(resolution.target_slot || '').trim();
            const [dayPattern, ...timeParts] = rawTargetSlot.split(/\s+/);
            const normalizedTime = resolveTimeSlotToValidLabel(timeParts.join(' '), validTimeSlots);
            if (!dayPattern || !normalizedTime) return;

            normalized.push({
                ...resolution,
                target_slot: `${dayPattern} ${normalizedTime}`,
                time: normalizeTimeSlotLabel(resolution.time) || normalizedTime,
                dayName: resolution.dayName || getDayPatternLabel(dayPattern)
            });
        });

        return normalized;
    }

    function dedupeResolutions(resolutions) {
        const seen = new Set();
        const deduped = [];

        (Array.isArray(resolutions) ? resolutions : []).forEach((resolution) => {
            const key = [
                resolution.action || '',
                resolution.target_slot || '',
                resolution.target_room || '',
                resolution.time || ''
            ].join('::');

            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(resolution);
        });

        return deduped;
    }

    function getRoomRestrictionRulesFromContext(context = {}) {
        const constraints = Array.isArray(context.enabledConstraints) ? context.enabledConstraints : [];
        return constraints
            .filter((constraint) => constraint && constraint.enabled !== false)
            .filter((constraint) => normalizeConstraintType(constraint.constraint_type) === 'room_restriction')
            .map((constraint) => ({
                id: constraint.id,
                ...(constraint.rule_details || {})
            }));
    }

    function evaluateRoomFitForCourse(course, room, context = {}) {
        const roomCode = String(room || '').trim();
        const courseCode = normalizeCourseCode(course?.code);
        const rules = getRoomRestrictionRulesFromContext(context)
            .filter((rule) => String(rule.room || '').trim() === roomCode);

        if (rules.length === 0) {
            return {
                status: 'valid',
                reasons: [],
                matchedRules: []
            };
        }

        let status = 'valid';
        const reasons = [];
        const matchedRules = [];

        rules.forEach((rule) => {
            matchedRules.push(rule.id || rule.room || 'room_restriction');

            if (Array.isArray(rule.allowed_courses) && rule.allowed_courses.length > 0) {
                if (!rule.allowed_courses.includes(courseCode)) {
                    status = 'blocked';
                    reasons.push(rule.message || `Room ${roomCode} is restricted for ${courseCode}.`);
                    return;
                }
            }

            if (Array.isArray(rule.preferred_courses) && rule.preferred_courses.length > 0) {
                if (!rule.preferred_courses.includes(courseCode) && status !== 'blocked') {
                    status = 'warning';
                    reasons.push(rule.message || `Room ${roomCode} is not a preferred room for ${courseCode}.`);
                }
            }
        });

        return {
            status,
            reasons,
            matchedRules
        };
    }

    function summarizeRoomFitCandidates(candidates) {
        const valid = [];
        const warning = [];
        const blocked = [];

        (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
            if (candidate.roomFit.status === 'blocked') blocked.push(candidate);
            else if (candidate.roomFit.status === 'warning') warning.push(candidate);
            else valid.push(candidate);
        });

        const placeable = [...valid, ...warning];
        const summaryBits = [];
        if (valid.length > 0) summaryBits.push(`${valid.length} valid room${valid.length === 1 ? '' : 's'}`);
        if (warning.length > 0) summaryBits.push(`${warning.length} room-fit warning${warning.length === 1 ? '' : 's'}`);
        if (blocked.length > 0) summaryBits.push(`${blocked.length} blocked by room rules`);

        return {
            placeable,
            validCount: valid.length,
            warningCount: warning.length,
            blockedCount: blocked.length,
            summaryText: summaryBits.join(', ') || 'no room-fit data'
        };
    }

    function getRuleRegistryEntry(normalizedConstraintType) {
        return CONFLICT_RULE_REGISTRY[normalizedConstraintType] || CONFLICT_RULE_REGISTRY._default;
    }

    /**
     * @typedef {Object} RulePlugin
     * @property {string} id
     * @property {string} name
     * @property {'hard_block'|'warning'|'suggestion'|'optimization'} [tier]
     * @property {boolean} [enabled]
     * @property {number} [weight]
     * @property {(schedule: Array, ruleDetails: Object, constraint: Object, context: Object) => Array} detect
     */

    function normalizeRulePlugin(plugin = {}) {
        const id = normalizeConstraintType(plugin.id);
        if (!id) {
            throw new Error('Rule plugin requires a non-empty id');
        }
        if (typeof plugin.detect !== 'function') {
            throw new Error(`Rule plugin "${id}" requires a detect(schedule, context) function`);
        }

        const metadata = DEFAULT_RULE_PLUGIN_METADATA[id] || {};
        const tier = clampIssueTier(toTierName(plugin.tier || metadata.tier), id);
        const weight = Number(plugin.weight);

        return {
            id,
            name: String(plugin.name || metadata.name || id),
            tier,
            enabled: plugin.enabled !== false,
            detect: plugin.detect,
            weight: Number.isFinite(weight) ? weight : 1
        };
    }

    function registerRule(plugin, options = {}) {
        const normalized = normalizeRulePlugin(plugin);
        const replace = options.replace === true;
        if (!replace && rulePlugins.has(normalized.id)) {
            throw new Error(`Rule plugin "${normalized.id}" is already registered`);
        }
        rulePlugins.set(normalized.id, normalized);
        return normalized;
    }

    function getRulePlugin(id) {
        const normalized = normalizeConstraintType(id);
        return rulePlugins.get(normalized) || null;
    }

    function enableRule(id) {
        const plugin = getRulePlugin(id);
        if (!plugin) return false;
        plugin.enabled = true;
        return true;
    }

    function disableRule(id) {
        const plugin = getRulePlugin(id);
        if (!plugin) return false;
        plugin.enabled = false;
        return true;
    }

    function setWeight(id, weight) {
        const plugin = getRulePlugin(id);
        const numericWeight = Number(weight);
        if (!plugin || !Number.isFinite(numericWeight)) return false;
        plugin.weight = numericWeight;
        return true;
    }

    function getProgramRuleOverride(context, id) {
        const overrides = context?.ruleOverrides;
        if (!overrides || typeof overrides !== 'object') return null;
        const override = overrides[id];
        return override && typeof override === 'object' ? override : null;
    }

    function isRuleEnabledForEvaluation(plugin, context = {}) {
        if (!plugin || plugin.enabled === false) return false;
        const override = getProgramRuleOverride(context, plugin.id);
        if (override && typeof override.enabled === 'boolean') {
            return override.enabled;
        }
        return true;
    }

    function getEffectiveRuleDetails(plugin, ruleDetails = {}, context = {}) {
        const rawRule = (ruleDetails && typeof ruleDetails === 'object') ? { ...ruleDetails } : {};
        const override = getProgramRuleOverride(context, plugin.id);

        if (!Number.isFinite(Number(rawRule.weight))) {
            if (override && Number.isFinite(Number(override.weight))) {
                rawRule.weight = Number(override.weight);
            } else if (Number.isFinite(Number(plugin.weight))) {
                rawRule.weight = Number(plugin.weight);
            }
        }

        return rawRule;
    }

    function listRegisteredRules() {
        return Array.from(rulePlugins.values()).map((plugin) => ({
            id: plugin.id,
            name: plugin.name,
            tier: plugin.tier,
            enabled: plugin.enabled !== false,
            weight: Number(plugin.weight)
        }));
    }

    function calculateWeightedIssueScore(issue, normalizedConstraintType, ruleDetails = {}) {
        const registry = getRuleRegistryEntry(normalizedConstraintType);
        const tier = clampIssueTier(
            toTierName(issue?.severityTier || issue?.tier || issue?.severity),
            normalizedConstraintType
        );
        const priority = String(issue?.priority || '').toLowerCase();
        const ruleWeightOverride = Number(ruleDetails?.weight);
        const ruleWeight = Number.isFinite(ruleWeightOverride) ? ruleWeightOverride : 1;
        const severityWeight = ISSUE_SEVERITY_SCORE[tier] || ISSUE_SEVERITY_SCORE.suggestion;
        const priorityWeight = ISSUE_PRIORITY_SCORE[priority] || 0;
        const hardnessMultiplier = registry.hardness === 'hard' ? 1.15 : 0.85;
        const impactCourseCount = Array.isArray(issue?.courses) ? issue.courses.length : 0;
        const impactWeight = Math.min(impactCourseCount * 2, 10);
        const baseWeight = registry.baseWeight || 0;
        const pathwayImpactWeight = normalizedConstraintType === 'student_conflict'
            ? Math.max(0, Number(issue?.pathwayImpactScore) || 0)
            : 0;

        const contributions = [
            { source: 'severity', value: severityWeight, detail: tier },
            { source: 'registry-base', value: baseWeight, detail: registry.id },
            { source: 'priority', value: priorityWeight, detail: priority || 'none' },
            { source: 'affected-courses', value: impactWeight, detail: impactCourseCount }
        ];

        if (pathwayImpactWeight > 0) {
            contributions.push({
                source: 'pathway-impact',
                value: pathwayImpactWeight,
                detail: issue.pathwayImpact || 'pathway-overlap'
            });
        }

        if (ruleWeight !== 1) {
            contributions.push({ source: 'rule-weight', value: Math.round((ruleWeight - 1) * 20), detail: ruleWeight });
        }

        const preMultiplier = contributions.reduce((sum, item) => sum + item.value, 0);
        const total = Math.max(0, Math.round(preMultiplier * hardnessMultiplier * ruleWeight));

        return {
            total,
            explanation: [
                `${registry.label} (${registry.hardness})`,
                `tier=${tier}`,
                priority ? `priority=${priority}` : null,
                issue?.pathwayImpact ? `pathway=${issue.pathwayImpact}` : null,
                `courses=${impactCourseCount}`,
                ruleWeight !== 1 ? `ruleWeight=${ruleWeight}` : null
            ].filter(Boolean).join(' | '),
            breakdown: {
                hardnessMultiplier,
                preMultiplier,
                contributions
            },
            rule: {
                id: registry.id,
                label: registry.label,
                category: registry.category,
                hardness: registry.hardness,
                baseWeight
            }
        };
    }

    function getIssueSeverityRank(severityOrTier) {
        const tier = toTierName(severityOrTier) || 'suggestion';
        if (tier === 'hard_block') return 3;
        if (tier === 'warning') return 2;
        if (tier === 'suggestion') return 1;
        return 0;
    }

    function normalizeCourseCode(courseCode) {
        return String(courseCode || '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getCourseLevel(courseCode) {
        const match = normalizeCourseCode(courseCode).match(/(\d{3})/);
        return match ? Math.floor(Number(match[1]) / 100) * 100 : 0;
    }

    function buildPathwayPairKey(courseA, courseB) {
        return [normalizeCourseCode(courseA), normalizeCourseCode(courseB)]
            .sort()
            .join('::');
    }

    function getPathwayPairImpact(pair) {
        const [courseA, courseB] = Array.isArray(pair) ? pair : ['', ''];
        const key = buildPathwayPairKey(courseA, courseB);
        const override = PATHWAY_PAIR_IMPACT_OVERRIDES[key];
        if (override) return override;

        const levels = [getCourseLevel(courseA), getCourseLevel(courseB)];
        const maxLevel = Math.max(...levels);

        if (maxLevel >= 400) {
            return { label: 'upper-division-pathway', score: 20 };
        }
        if (maxLevel >= 300) {
            return { label: 'pathway-sequence', score: 12 };
        }
        return { label: 'foundation-overlap', score: 8 };
    }

    function summarizePathwayConflictImpact(conflictingPairs) {
        const pairDetails = (Array.isArray(conflictingPairs) ? conflictingPairs : []).map((pair) => {
            const impact = getPathwayPairImpact(pair);
            return {
                pair,
                label: impact.label,
                score: impact.score
            };
        });

        const top = pairDetails.reduce((best, entry) => {
            if (!best) return entry;
            return entry.score > best.score ? entry : best;
        }, null);

        return {
            label: top?.label || 'pathway-overlap',
            score: top?.score || 0,
            pairs: pairDetails
        };
    }

    function normalizeFacultyName(name, canonicalizeFacultyName) {
        const raw = String(name || '').trim();
        if (!raw) return 'TBD';
        if (typeof canonicalizeFacultyName === 'function') {
            return canonicalizeFacultyName(raw);
        }

        const lower = raw.toLowerCase();
        if (lower.includes('adjunct')) return 'Adjunct';
        if (lower.includes('barton') || lower.includes('pettigrew') || lower.includes('online')) return 'Barton/Pettigrew';
        if (lower.includes('tbd')) return 'TBD';
        return raw;
    }

    function normalizeQuarterSchedule(scheduleByQuarter, canonicalizeFacultyName) {
        const normalized = {
            fall: [],
            winter: [],
            spring: []
        };

        AY_QUARTERS.forEach((quarter) => {
            const quarterCourses = Array.isArray(scheduleByQuarter?.[quarter]) ? scheduleByQuarter[quarter] : [];
            normalized[quarter] = quarterCourses.map((course) => ({
                code: normalizeCourseCode(course.code),
                title: String(course.title || course.name || '').trim(),
                instructor: normalizeFacultyName(course.instructor, canonicalizeFacultyName),
                room: String(course.room || '').trim(),
                day: String(course.day || '').trim(),
                time: String(course.time || '').trim(),
                credits: Number(course.credits) || 5
            }));
        });

        return normalized;
    }

    function sortAndDedupeIssues(issues) {
        const deduped = [];
        const seen = new Set();

        issues.forEach((issue) => {
            const key = [
                issue.type || '',
                issue.scope || '',
                issue.quarter || '',
                issue.title || '',
                issue.description || '',
                issue.severity || ''
            ].join('::');

            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(issue);
        });

        deduped.sort((a, b) => {
            const severityDelta = getIssueSeverityRank(b.severity) - getIssueSeverityRank(a.severity);
            if (severityDelta !== 0) return severityDelta;
            return String(a.title || '').localeCompare(String(b.title || ''));
        });

        return deduped;
    }

    function createAyIssue({
        severity = 'warning',
        priority = 'medium',
        title = 'AY Setup Check',
        description = '',
        suggestion = 'Update AY Setup values or rebalance assignments to match planned workload.',
        courses = [],
        scope = 'quarter',
        quarter = null
    }) {
        return {
            type: 'ay-setup',
            severity,
            priority,
            title,
            description,
            suggestion,
            courses,
            scope,
            quarter
        };
    }

    function mapQuarterCoursesToDisplay(courses) {
        return (courses || []).map((course) => ({
            code: normalizeCourseCode(course.code),
            title: String(course.title || '').trim(),
            instructor: String(course.instructor || '').trim(),
            day: String(course.day || '').trim(),
            time: String(course.time || '').trim(),
            room: String(course.room || '').trim(),
            credits: Number(course.credits) || 5
        }));
    }

    function evaluateAySetup(scheduleByQuarter, aySetupData, options = {}) {
        const byQuarter = {
            fall: [],
            winter: [],
            spring: []
        };
        const annualIssues = [];
        const thresholds = { ...AY_DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
        const academicYear = String(options.academicYear || 'this academic year');
        const canonicalizeFacultyName = options.canonicalizeFacultyName;

        const normalizedSchedule = normalizeQuarterSchedule(scheduleByQuarter, canonicalizeFacultyName);
        const setupData = aySetupData || {};
        const setupFaculty = Array.isArray(setupData.faculty) ? setupData.faculty : [];
        const adjunctTargets = setupData.adjunctTargets || {};
        const setupByFaculty = new Map();

        if (setupFaculty.length === 0) {
            annualIssues.push(createAyIssue({
                severity: 'warning',
                priority: 'high',
                title: `No AY Setup Data for ${academicYear}`,
                description: 'Add faculty targets, release time, and adjunct targets in Academic Year Setup so assignment checks can run.',
                scope: 'annual'
            }));

            return {
                byQuarter,
                annualIssues: sortAndDedupeIssues(annualIssues)
            };
        }

        setupFaculty.forEach((record) => {
            const canonicalName = normalizeFacultyName(record.name, canonicalizeFacultyName);
            setupByFaculty.set(canonicalName, record);
        });

        const facultyLoads = new Map();
        AY_QUARTERS.forEach((quarter) => {
            normalizedSchedule[quarter].forEach((course) => {
                const instructor = normalizeFacultyName(course.instructor, canonicalizeFacultyName);
                if (!instructor || instructor === 'TBD') return;

                if (!facultyLoads.has(instructor)) {
                    facultyLoads.set(instructor, {
                        annualCredits: 0,
                        byQuarter: { fall: 0, winter: 0, spring: 0 },
                        coursesByQuarter: { fall: [], winter: [], spring: [] }
                    });
                }

                const facultyLoad = facultyLoads.get(instructor);
                facultyLoad.annualCredits += Number(course.credits) || 5;
                facultyLoad.byQuarter[quarter] += Number(course.credits) || 5;
                facultyLoad.coursesByQuarter[quarter].push(course);
            });
        });

        // Missing AY setup records for scheduled instructors
        facultyLoads.forEach((facultyLoad, facultyName) => {
            if (facultyName === 'Adjunct' || facultyName === 'Barton/Pettigrew') return;
            if (setupByFaculty.has(facultyName)) return;

            annualIssues.push(createAyIssue({
                severity: 'warning',
                priority: 'high',
                title: `Missing AY Setup Record: ${facultyName}`,
                description: `${facultyName} has assigned courses but no setup record for ${academicYear}.`,
                scope: 'annual'
            }));
        });

        setupByFaculty.forEach((record, facultyName) => {
            const annualTarget = Number(record.annualTargetCredits) || 0;
            const releaseCredits = Number(record.releaseCredits) || 0;
            const netAnnualTarget = Math.max(0, annualTarget - releaseCredits);
            const expectedQuarter = netAnnualTarget > 0 ? netAnnualTarget / 3 : 0;
            const facultyLoad = facultyLoads.get(facultyName) || {
                annualCredits: 0,
                byQuarter: { fall: 0, winter: 0, spring: 0 },
                coursesByQuarter: { fall: [], winter: [], spring: [] }
            };

            if (netAnnualTarget > 0) {
                const annualDelta = facultyLoad.annualCredits - netAnnualTarget;
                if (annualDelta > thresholds.annualOverloadWarning) {
                    annualIssues.push(createAyIssue({
                        severity: annualDelta > thresholds.annualOverloadCritical ? 'critical' : 'warning',
                        priority: annualDelta > thresholds.annualOverloadCritical ? 'critical' : 'high',
                        title: `Annual Overload Risk: ${facultyName}`,
                        description: `${facultyName} is assigned ${facultyLoad.annualCredits} credits vs ${netAnnualTarget} planned (after release).`,
                        scope: 'annual',
                        courses: mapQuarterCoursesToDisplay([
                            ...facultyLoad.coursesByQuarter.fall,
                            ...facultyLoad.coursesByQuarter.winter,
                            ...facultyLoad.coursesByQuarter.spring
                        ])
                    }));
                } else if (annualDelta < -thresholds.annualUnderloadWarning) {
                    annualIssues.push(createAyIssue({
                        severity: 'warning',
                        priority: 'medium',
                        title: `Annual Underload: ${facultyName}`,
                        description: `${facultyName} is assigned ${facultyLoad.annualCredits} credits vs ${netAnnualTarget} planned (after release).`,
                        scope: 'annual',
                        courses: mapQuarterCoursesToDisplay([
                            ...facultyLoad.coursesByQuarter.fall,
                            ...facultyLoad.coursesByQuarter.winter,
                            ...facultyLoad.coursesByQuarter.spring
                        ])
                    }));
                }
            }

            AY_QUARTERS.forEach((quarter) => {
                if (expectedQuarter <= 0) return;

                const quarterAssigned = facultyLoad.byQuarter[quarter] || 0;
                const quarterDelta = quarterAssigned - expectedQuarter;
                const quarterCourses = mapQuarterCoursesToDisplay(facultyLoad.coursesByQuarter[quarter] || []);

                if (quarterDelta > thresholds.quarterOverloadWarning) {
                    byQuarter[quarter].push(createAyIssue({
                        severity: quarterDelta > thresholds.quarterOverloadCritical ? 'critical' : 'warning',
                        priority: quarterDelta > thresholds.quarterOverloadCritical ? 'critical' : 'high',
                        title: `${AY_QUARTER_LABELS[quarter]} Workload Pacing: ${facultyName}`,
                        description: `${facultyName} has ${quarterAssigned} credits vs ${expectedQuarter.toFixed(1)} planned in AY setup.`,
                        quarter,
                        courses: quarterCourses
                    }));
                } else if (quarterDelta < -thresholds.quarterUnderloadWarning && quarterAssigned > 0) {
                    byQuarter[quarter].push(createAyIssue({
                        severity: 'warning',
                        priority: 'medium',
                        title: `${AY_QUARTER_LABELS[quarter]} Workload Pacing: ${facultyName}`,
                        description: `${facultyName} has ${quarterAssigned} credits vs ${expectedQuarter.toFixed(1)} planned in AY setup.`,
                        quarter,
                        courses: quarterCourses
                    }));
                }
            });
        });

        AY_QUARTERS.forEach((quarter) => {
            const target = Number(adjunctTargets[quarter]) || 0;
            const adjunctLoad = facultyLoads.get('Adjunct');
            const assigned = adjunctLoad?.byQuarter?.[quarter] || 0;
            const delta = assigned - target;
            const adjunctCourses = mapQuarterCoursesToDisplay(adjunctLoad?.coursesByQuarter?.[quarter] || []);

            if (target === 0 && assigned > 0) {
                byQuarter[quarter].push(createAyIssue({
                    severity: 'warning',
                    priority: 'medium',
                    title: `${AY_QUARTER_LABELS[quarter]} Adjunct Allocation`,
                    description: `Adjunct is carrying ${assigned} credits with a target of 0 in AY setup.`,
                    quarter,
                    courses: adjunctCourses
                }));
            } else if (delta < -thresholds.adjunctUnderloadWarning) {
                byQuarter[quarter].push(createAyIssue({
                    severity: 'warning',
                    priority: 'high',
                    title: `${AY_QUARTER_LABELS[quarter]} Adjunct Shortfall`,
                    description: `${assigned} assigned vs ${target} target adjunct credits for ${AY_QUARTER_LABELS[quarter]}.`,
                    quarter,
                    courses: adjunctCourses
                }));
            } else if (delta > thresholds.adjunctOverloadWarning) {
                byQuarter[quarter].push(createAyIssue({
                    severity: 'warning',
                    priority: 'medium',
                    title: `${AY_QUARTER_LABELS[quarter]} Adjunct Over-allocation`,
                    description: `${assigned} assigned vs ${target} target adjunct credits for ${AY_QUARTER_LABELS[quarter]}.`,
                    quarter,
                    courses: adjunctCourses
                }));
            }
        });

        return {
            byQuarter: {
                fall: sortAndDedupeIssues(byQuarter.fall),
                winter: sortAndDedupeIssues(byQuarter.winter),
                spring: sortAndDedupeIssues(byQuarter.spring)
            },
            annualIssues: sortAndDedupeIssues(annualIssues)
        };
    }

    /**
     * Evaluate a schedule against all enabled constraints
     * @param {Array} schedule - Array of course objects from getCurrentScheduleData()
     * @param {Array} constraints - Array of constraint objects from ConstraintsService
     * @returns {Object} { conflicts: [], warnings: [], suggestions: [] }
     */
    function evaluate(schedule, constraints, context = {}) {
        const results = {
            conflicts: [],
            warnings: [],
            suggestions: [],
            summary: {
                totalIssues: 0,
                totalActionableIssues: 0,
                totalTieredIssues: 0,
                criticalCount: 0,
                warningCount: 0,
                tierCounts: {
                    hard_block: 0,
                    warning: 0,
                    suggestion: 0,
                    optimization: 0
                },
                weightedScore: 0,
                weightedByConstraintType: {}
            },
            scoringModel: {
                version: 'v2',
                registry: CONFLICT_RULE_REGISTRY,
                taxonomy: CONFLICT_TIER_DEFINITIONS,
                registeredRules: listRegisteredRules()
            }
        };

        if (!schedule || schedule.length === 0) {
            return results;
        }

        const enabledConstraints = (constraints || []).filter((c) => c && c.enabled);
        const evaluationContext = {
            ...context,
            enabledConstraints
        };

        // Run each enabled constraint rule plugin
        enabledConstraints.forEach(constraint => {
            const normalizedConstraintType = normalizeConstraintType(constraint.constraint_type);
            const plugin = getRulePlugin(normalizedConstraintType);
            if (!plugin || !isRuleEnabledForEvaluation(plugin, evaluationContext)) return;

            const effectiveRuleDetails = getEffectiveRuleDetails(plugin, constraint.rule_details, evaluationContext);
            const issues = plugin.detect(schedule, effectiveRuleDetails, constraint, evaluationContext);

            (Array.isArray(issues) ? issues : []).forEach(issue => {
                issue.constraintId = constraint.id;
                issue.constraintType = normalizedConstraintType;
                issue.constraintTypeOriginal = constraint.constraint_type;
                issue.constraintRule = getRuleRegistryEntry(normalizedConstraintType);
                issue.rulePluginId = plugin.id;
                issue.rulePluginName = plugin.name;
                issue.severityTier = resolveIssueTier(issue, normalizedConstraintType, evaluationContext);
                issue.tier = issue.severityTier;
                issue.severity = resolveLegacySeverityFromTier(issue.severityTier);
                issue.blocksSave = Boolean(CONFLICT_TIER_DEFINITIONS[issue.severityTier]?.blocksSave);

                const weighted = calculateWeightedIssueScore(
                    issue,
                    normalizedConstraintType,
                    effectiveRuleDetails
                );
                issue.score = weighted.total;
                issue.scoreExplanation = weighted.explanation;
                issue.scoreBreakdown = weighted.breakdown;
                issue.scoreRuleMeta = weighted.rule;

                results.summary.weightedScore += issue.score;
                results.summary.weightedByConstraintType[normalizedConstraintType] =
                    (results.summary.weightedByConstraintType[normalizedConstraintType] || 0) + issue.score;
                results.summary.tierCounts[issue.severityTier] =
                    (results.summary.tierCounts[issue.severityTier] || 0) + 1;

                if (issue.severityTier === 'hard_block') {
                    results.conflicts.push(issue);
                    results.summary.criticalCount++;
                } else if (issue.severityTier === 'warning') {
                    results.warnings.push(issue);
                    results.summary.warningCount++;
                } else {
                    results.suggestions.push(issue);
                }
            });
        });

        results.summary.totalActionableIssues = results.conflicts.length + results.warnings.length;
        results.summary.totalTieredIssues = results.conflicts.length + results.warnings.length + results.suggestions.length;
        // Backward-compatible field used by existing UI sections.
        results.summary.totalIssues = results.summary.totalActionableIssues;
        return results;
    }

    // Backward-compatible API alias
    function findIssues(schedule, constraints, context = {}) {
        return evaluate(schedule, constraints, context);
    }

    /**
     * Constraint checker functions
     */
    const checkers = {

        /**
         * Room restriction - check if courses are in allowed rooms
         */
        room_restriction: function(schedule, rule, constraint, context = {}) {
            const issues = [];
            const roomCourses = schedule.filter(c => c.room === rule.room);

            roomCourses.forEach(course => {
                // Check against allowed_courses (strict)
                if (rule.allowed_courses && !rule.allowed_courses.includes(course.code)) {
                    issues.push({
                        severity: rule.severity || 'warning',
                        title: `Room ${rule.room} Restriction`,
                        description: rule.message || `${course.code} is scheduled in Room ${rule.room}, which is reserved for specific courses`,
                        courses: [course],
                        suggestion: `Consider moving ${course.code} to a different room`,
                        resolutions: calculateRoomResolutions(schedule, course, context)
                    });
                }
                // Check against preferred_courses (soft recommendation)
                else if (rule.preferred_courses && !rule.preferred_courses.includes(course.code)) {
                    issues.push({
                        severity: 'info',
                        title: `Room ${rule.room} Preference`,
                        description: `${course.code} in Room ${rule.room} - this room is best suited for hands-on courses`,
                        courses: [course],
                        suggestion: `Room ${rule.room} works better for project-based courses`
                    });
                }
            });

            return issues;
        },

        /**
         * Academic-year setup alignment checks
         * Ensures assignments are aligned to AY faculty targets and adjunct goals.
         */
        ay_setup_alignment: function(schedule, rule, constraint, context) {
            const currentQuarter = String(context?.currentQuarter || 'spring').toLowerCase();
            const scheduleByQuarter = context?.scheduleByQuarter || {
                [currentQuarter]: Array.isArray(schedule) ? schedule : []
            };
            const aySetupData = context?.aySetupData || null;
            const analysis = evaluateAySetup(scheduleByQuarter, aySetupData, {
                academicYear: context?.academicYear,
                canonicalizeFacultyName: context?.canonicalizeFacultyName,
                thresholds: rule || {}
            });

            return [
                ...analysis.annualIssues,
                ...(analysis.byQuarter[currentQuarter] || [])
            ];
        },

        /**
         * Student conflict - courses that students commonly take together at same time
         * Uses graduation pathway pairings to detect real conflicts
         */
        student_conflict: function(schedule, rule, constraint, context = {}) {
            const issues = [];
            const foundConflicts = new Set(); // Track reported conflicts to avoid duplicates
            const validTimeSlots = deriveResolutionTimeSlots(schedule, context);
            const pairingRules = Array.isArray(rule?.pairings)
                ? rule.pairings
                : (getRuleRegistryEntry('student_conflict').pairings || COMMON_PAIRINGS);
            
            // Group courses by day+time
            const slots = {};
            schedule.forEach(course => {
                if (course.day && course.time && course.code) {
                    const key = `${course.day}-${course.time}`;
                    if (!slots[key]) slots[key] = [];
                    slots[key].push(course);
                }
            });

            // Check each slot for pathway conflicts
            Object.entries(slots).forEach(([key, coursesInSlot]) => {
                if (coursesInSlot.length < 2) return; // Need at least 2 courses to conflict
                
                const courseCodes = coursesInSlot.map(c => c.code);
                const conflictingPairs = [];
                
                // Check if any common pairings are in the same slot
                pairingRules.forEach(([course1, course2]) => {
                    if (courseCodes.includes(course1) && courseCodes.includes(course2)) {
                        const pairKey = [course1, course2].sort().join('-');
                        if (!foundConflicts.has(`${key}-${pairKey}`)) {
                            foundConflicts.add(`${key}-${pairKey}`);
                            conflictingPairs.push([course1, course2]);
                        }
                    }
                });
                
                // Report conflicts for this slot
                if (conflictingPairs.length > 0) {
                    const [day, ...timeParts] = key.split('-');
                    const time = timeParts.join('-');
                    const dayName = getDayPatternLabel(day);
                    const timeFormatted = formatTime(time);
                    
                    // Get all conflicting courses
                    const conflictingCodes = [...new Set(conflictingPairs.flat())];
                    const conflictingCourses = coursesInSlot.filter(c => conflictingCodes.includes(c.code));
                    const pathwayImpact = summarizePathwayConflictImpact(conflictingPairs);
                    
                    // Determine severity based on course levels
                    const has400Level = conflictingCodes.some(c => {
                        const num = parseInt(c.replace('DESN ', ''));
                        return num >= 400;
                    });
                    const severity = has400Level ? 'critical' : (rule.severity || 'warning');
                    const priority = has400Level
                        ? 'critical'
                        : pathwayImpact.score >= 16
                            ? 'high'
                            : 'medium';
                    
                    // Calculate dynamic resolutions
                    const dynamicResolutions = calculateSlotResolutions(
                        schedule,
                        conflictingCourses[0],
                        day,
                        time,
                        { ...context, timeSlots: validTimeSlots }
                    );
                    const storedResolutions = normalizePreferredResolutions(rule.preferred_resolutions, validTimeSlots);
                    const allResolutions = dedupeResolutions([...storedResolutions, ...dynamicResolutions]).slice(0, 4);
                    
                    // Create descriptive message
                    const pairDescriptions = conflictingPairs.map(([c1, c2]) => `${c1} and ${c2}`).join(', ');
                    
                    issues.push({
                        severity: severity,
                        priority,
                        type: 'student-conflict',
                        title: `Pathway Conflict: ${dayName}, ${timeFormatted}`,
                        description: `Students commonly need to take ${pairDescriptions} together, but they're scheduled at the same time`,
                        courses: conflictingCourses,
                        studentsAffected: estimateAffectedStudents(conflictingCourses),
                        currentSlot: `${day} ${time}`,
                        pathwayImpact: pathwayImpact.label,
                        pathwayImpactScore: pathwayImpact.score,
                        pathwayImpactPairs: pathwayImpact.pairs,
                        resolutions: allResolutions,
                        suggestion: `Move one course to a different time slot so students can complete their graduation pathway`
                    });
                }
            });

            return issues;
        },

        /**
         * Faculty double-booking - same instructor, same time, different rooms
         */
        faculty_double_book: function(schedule, rule, constraint, context = {}) {
            const issues = [];
            const slots = {};

            schedule.forEach(course => {
                if (course.instructor && course.instructor !== 'TBD' && course.day && course.time) {
                    const key = `${course.instructor}-${course.day}-${course.time}`;
                    if (!slots[key]) slots[key] = [];
                    slots[key].push(course);
                }
            });

            Object.entries(slots).forEach(([key, courses]) => {
                if (courses.length > 1) {
                    const rooms = [...new Set(courses.map(c => c.room))];
                    if (rooms.length > 1) {
                        issues.push({
                            severity: rule.severity || 'critical',
                            title: 'Faculty Double-Booking',
                            description: `${courses[0].instructor} is scheduled to teach ${courses.map(c => c.code).join(' and ')} at the same time in different rooms`,
                            courses: courses,
                            suggestion: 'Reassign one course to a different instructor or time',
                            resolutions: calculateTimeResolutions(schedule, courses[0], context)
                        });
                    }
                }
            });

            return issues;
        },

        /**
         * Room double-booking - multiple courses in same room at same time
         */
        room_double_book: function(schedule, rule, constraint, context = {}) {
            const issues = [];
            const slots = {};

            schedule.forEach(course => {
                if (course.room && course.day && course.time) {
                    const key = `${course.room}-${course.day}-${course.time}`;
                    if (!slots[key]) slots[key] = [];
                    slots[key].push(course);
                }
            });

            Object.entries(slots).forEach(([key, courses]) => {
                if (courses.length > 1) {
                    issues.push({
                        severity: rule.severity || 'critical',
                        title: 'Room Double-Booking',
                        description: `${courses.map(c => c.code).join(' and ')} are both scheduled in Room ${courses[0].room} on ${courses[0].day} at ${courses[0].time}`,
                        courses: courses,
                        suggestion: 'Move one course to a different room or time slot',
                        resolutions: calculateRoomResolutions(schedule, courses[1], context)
                    });
                }
            });

            return issues;
        },

        /**
         * Evening safety - minimum instructors for evening classes
         */
        evening_safety: function(schedule, rule, constraint) {
            const issues = [];
            const timeAfter = rule.time_after || '16:00';
            const minInstructors = rule.min_instructors || 2;

            // Find evening classes
            const eveningClasses = schedule.filter(c => {
                if (!c.time) return false;
                const hour = parseInt(c.time.split(':')[0]);
                const threshold = parseInt(timeAfter.split(':')[0]);
                return hour >= threshold;
            });

            // Group by day
            const days = {};
            eveningClasses.forEach(course => {
                if (!days[course.day]) days[course.day] = new Set();
                if (course.instructor && course.instructor !== 'TBD') {
                    days[course.day].add(course.instructor);
                }
            });

            Object.entries(days).forEach(([day, instructors]) => {
                if (instructors.size > 0 && instructors.size < minInstructors) {
                    const dayName = day === 'MW' ? 'Monday/Wednesday' : day === 'TR' ? 'Tuesday/Thursday' : day;
                    issues.push({
                        severity: rule.severity || 'warning',
                        title: 'Evening Safety Concern',
                        description: `Only ${instructors.size} instructor(s) (${[...instructors].join(', ')}) scheduled for evening classes on ${dayName}`,
                        suggestion: `Schedule at least ${minInstructors} instructors for evening safety`,
                        courses: eveningClasses.filter(c => c.day === day)
                    });
                }
            });

            return issues;
        },

        /**
         * Enrollment threshold - flag courses outside normal range
         */
        enrollment_threshold: function(schedule, rule, constraint) {
            // This would need enrollment data passed in
            // For now, return empty - can be enhanced later
            return [];
        },

        /**
         * Campus transition - check for back-to-back classes at different campuses
         */
        campus_transition: function(schedule, rule, constraint) {
            // This would need campus data on courses
            // For now, return empty - can be enhanced later
            return [];
        }
    };

    Object.entries(checkers).forEach(([id, detect]) => {
        const metadata = DEFAULT_RULE_PLUGIN_METADATA[id] || {};
        registerRule({
            id,
            name: metadata.name || id,
            tier: metadata.tier || 'suggestion',
            detect
        });
    });

    /**
     * Calculate available room resolutions for a course
     */
    function calculateRoomResolutions(schedule, course, context = {}) {
        const resolutions = [];
        const usedRooms = schedule
            .filter(c => c.day === course.day && c.time === course.time)
            .map(c => c.room);

        ROOMS.forEach(room => {
            if (!usedRooms.includes(room) && room !== course.room) {
                const roomFit = evaluateRoomFitForCourse(course, room, context);
                if (roomFit.status === 'blocked') return;
                const warningPenalty = roomFit.status === 'warning' ? 6 : 0;
                const recommendationScore = 40 - warningPenalty;
                const roomFitSummary = roomFit.reasons.length > 0
                    ? `Room fit: ${roomFit.reasons.join(' ')}`
                    : 'Room fit: valid';

                resolutions.push({
                    action: 'move_room',
                    target_room: room,
                    roomFitStatus: roomFit.status,
                    roomFitReasons: roomFit.reasons,
                    roomFitSummary,
                    recommendationScore,
                    recommendationScoreBreakdown: {
                        base: 40,
                        warningPenalty
                    },
                    reason: `Room ${room} is available at this time. ${roomFitSummary}`
                });
            }
        });

        return resolutions
            .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
            .slice(0, 3);
    }

    /**
     * Calculate available time slot resolutions for moving a course
     */
    function calculateSlotResolutions(schedule, course, currentDay, currentTime, context = {}) {
        const resolutions = [];
        const validTimeSlots = deriveResolutionTimeSlots(schedule, context);
        const normalizedCurrentTime = resolveTimeSlotToValidLabel(currentTime, validTimeSlots)
            || normalizeTimeSlotLabel(currentTime);

        DAY_PATTERNS.forEach(day => {
            validTimeSlots.forEach(time => {
                if (day === currentDay && time === normalizedCurrentTime) return;

                // Count courses in this slot
                const coursesInSlot = schedule.filter((c) => {
                    if (c.day !== day) return false;
                    const normalizedCourseTime = resolveTimeSlotToValidLabel(c.time, validTimeSlots)
                        || normalizeTimeSlotLabel(c.time);
                    return normalizedCourseTime === time;
                });
                const usedRooms = coursesInSlot.map(c => c.room);
                const availableRooms = ROOMS.filter(r => !usedRooms.includes(r));
                const roomFitCandidates = availableRooms.map((room) => ({
                    room,
                    roomFit: evaluateRoomFitForCourse(course, room, context)
                }));
                const roomFitSummary = summarizeRoomFitCandidates(roomFitCandidates);

                if (roomFitSummary.placeable.length >= 1) {
                    const dayName = getDayPatternLabel(day);
                    const recommendationScore = (roomFitSummary.validCount * 12)
                        + (roomFitSummary.warningCount * 6)
                        - (roomFitSummary.blockedCount * 3)
                        + (coursesInSlot.length <= 2 ? 6 : 2);
                    const roomFitReason = `Room fit: ${roomFitSummary.summaryText}`;
                    resolutions.push({
                        action: 'move_course',
                        target_slot: `${day} ${time}`,
                        dayName: dayName,
                        time: time,
                        availableRooms: roomFitSummary.placeable.length,
                        roomFitValidRooms: roomFitSummary.validCount,
                        roomFitWarningRooms: roomFitSummary.warningCount,
                        roomFitBlockedRooms: roomFitSummary.blockedCount,
                        roomFitSummary: roomFitSummary.summaryText,
                        recommendationScore,
                        recommendationScoreBreakdown: {
                            validRooms: roomFitSummary.validCount,
                            warningRooms: roomFitSummary.warningCount,
                            blockedRooms: roomFitSummary.blockedCount,
                            occupancyPressure: coursesInSlot.length
                        },
                        currentCourses: coursesInSlot.map(c => `${c.code} (${c.room})`).join(', ') || 'None',
                        reason: `${coursesInSlot.length <= 2 ? 'Minimal impact, plenty of space' : 'Moderate impact'}. ${roomFitReason}`
                    });
                }
            });
        });

        // Sort by recommendation score first, then room availability
        return resolutions.sort((a, b) => {
            const scoreDelta = (b.recommendationScore || 0) - (a.recommendationScore || 0);
            if (scoreDelta !== 0) return scoreDelta;
            return (b.availableRooms || 0) - (a.availableRooms || 0);
        });
    }

    /**
     * Calculate time-based resolutions for a course
     */
    function calculateTimeResolutions(schedule, course, context = {}) {
        return calculateSlotResolutions(schedule, course, course.day, course.time, context).slice(0, 4);
    }

    /**
     * Format time for display (24hr to AM/PM)
     */
    function formatTime(time) {
        if (!time) return '';
        
        if (time.includes('-')) {
            const [start, end] = time.split('-');
            return `${formatSingleTime(start)} - ${formatSingleTime(end)}`;
        }
        return formatSingleTime(time);
    }
    
    function formatSingleTime(t) {
        if (!t) return '';
        const match = t.match(/(\d{1,2}):(\d{2})/);
        if (!match) return t;
        
        let hour = parseInt(match[1]);
        const min = match[2];
        const ampm = hour >= 12 ? 'PM' : 'AM';
        
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;
        
        return `${hour}:${min} ${ampm}`;
    }
    
    /**
     * Estimate number of students affected by a conflict
     */
    function estimateAffectedStudents(courses) {
        const uniqueCourses = courses.length;
        if (uniqueCourses >= 4) return 'Very High (15-25 students)';
        if (uniqueCourses >= 3) return 'High (10-20 students)';
        return 'Moderate (5-15 students)';
    }

    // Public API
    return {
        evaluate,
        findIssues,
        checkers,
        COMMON_PAIRINGS,
        evaluateAySetup,
        ruleRegistry: CONFLICT_RULE_REGISTRY,
        registerRule,
        enableRule,
        disableRule,
        setWeight,
        listRules: listRegisteredRules
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConflictEngine;
}
