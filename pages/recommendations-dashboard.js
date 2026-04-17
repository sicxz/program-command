(function recommendationsDashboardModule(global) {
    'use strict';

    let workloadData = null;
    let enrollmentData = null;
    const runtimeSources = {};

    function qs(id) {
        return document.getElementById(id);
    }

    function setRuntimeDataSourceStatus(key, status = {}) {
        runtimeSources[key] = {
            key,
            label: status.label || key,
            source: status.source || 'unknown',
            canonical: status.canonical === true,
            fallback: status.fallback !== undefined ? Boolean(status.fallback) : status.canonical !== true,
            detail: status.detail || null,
            count: Number.isFinite(status.count) ? status.count : null,
            message: status.message || null
        };
    }

    function syncRuntimeSourcesFromDbService() {
        if (!global.dbService || typeof global.dbService.getRuntimeSourceStatus !== 'function') return;
        const snapshot = global.dbService.getRuntimeSourceStatus();
        const entries = snapshot && snapshot.entries ? snapshot.entries : {};
        Object.values(entries).forEach((entry) => {
            if (!entry || !entry.key) return;
            runtimeSources[entry.key] = entry;
        });
    }

    function renderRuntimeDataSourceBanner() {
        const banner = qs('runtimeDataSourceBanner');
        if (!banner) return;

        const entries = Object.values(runtimeSources);
        if (!entries.length) {
            banner.hidden = true;
            banner.textContent = '';
            banner.className = 'runtime-source-banner';
            return;
        }

        const degraded = entries.filter((entry) => entry.canonical !== true);
        if (!degraded.length) {
            banner.className = 'runtime-source-banner runtime-source-banner-success';
            banner.innerHTML = `<strong>Canonical runtime data</strong>${entries.length} tracked inputs are loading from the canonical database-backed runtime.`;
            banner.hidden = false;
            return;
        }

        const degradedSummary = degraded
            .map((entry) => {
                const suffix = entry.detail ? ` (${entry.detail})` : '';
                return `${entry.label}${suffix}`;
            })
            .join(', ');

        banner.className = 'runtime-source-banner runtime-source-banner-warning';
        banner.innerHTML = `<strong>Mixed runtime data</strong>This dashboard is still relying on non-canonical or partial inputs for: ${degradedSummary}.`;
        banner.hidden = false;
    }

    function applyDepartmentHeading() {
        if (typeof global.getActiveDepartmentIdentity !== 'function') return;
        const identity = global.getActiveDepartmentIdentity();
        const heading = document.querySelector('header h1');
        const subtitle = document.querySelector('header .subtitle');

        if (heading) {
            heading.textContent = `💡 ${identity.name} Recommendations Dashboard`;
        }
        if (subtitle) {
            subtitle.textContent = `${identity.displayName} recommendations from workload, schedule, and projected enrollment signals`;
        }
        document.title = `Recommendations - ${identity.displayName}`;
    }

    async function loadProfileSnapshot() {
        if (!global.ProfileLoader || typeof global.ProfileLoader.init !== 'function') {
            return null;
        }

        try {
            return await global.ProfileLoader.init();
        } catch (error) {
            console.warn('Could not initialize profile loader for recommendations dashboard:', error);
            return null;
        }
    }

    function resolvePreferredAcademicYear(academicYears = []) {
        const years = Array.isArray(academicYears) ? academicYears : [];
        return years.find((entry) => entry && entry.is_active)
            || years[0]
            || null;
    }

    async function loadCanonicalData() {
        const profileSnapshot = await loadProfileSnapshot();
        const [academicYears, courses, faculty] = await Promise.all([
            global.dbService.getAcademicYears(),
            global.dbService.getCourses(),
            global.dbService.getFaculty()
        ]);

        const activeYear = resolvePreferredAcademicYear(academicYears);
        if (!activeYear || !activeYear.id) {
            setRuntimeDataSourceStatus('savedSchedule', {
                label: 'Saved schedule',
                source: 'missing-academic-year',
                canonical: false,
                fallback: false,
                detail: 'No academic year row available',
                count: 0
            });
            syncRuntimeSourcesFromDbService();
            return null;
        }

        const scheduleRows = await global.dbService.getSchedule(activeYear.id);
        syncRuntimeSourcesFromDbService();

        if (!Array.isArray(scheduleRows) || scheduleRows.length === 0) {
            setRuntimeDataSourceStatus('savedSchedule', {
                label: 'Saved schedule',
                source: 'empty-database',
                canonical: false,
                fallback: false,
                detail: `No saved sections for ${activeYear.year}`,
                count: 0
            });
            return null;
        }

        const canonicalData = global.CanonicalDashboardData.buildCanonicalDashboardData({
            academicYear: activeYear.year,
            scheduleRows,
            courses,
            faculty,
            profile: profileSnapshot?.profile || null
        });

        const missingProjectedEnrollmentCount = Number(canonicalData?.metadata?.missingProjectedEnrollmentCount || 0);
        setRuntimeDataSourceStatus('projectedEnrollment', missingProjectedEnrollmentCount > 0
            ? {
                label: 'Projected enrollment coverage',
                source: 'partial-database',
                canonical: false,
                fallback: false,
                detail: `${missingProjectedEnrollmentCount} saved section${missingProjectedEnrollmentCount === 1 ? '' : 's'} missing projected enrollment`,
                count: missingProjectedEnrollmentCount
            }
            : {
                label: 'Projected enrollment coverage',
                source: 'database',
                canonical: true,
                fallback: false,
                detail: `Complete coverage for ${activeYear.year}`,
                count: Number(canonicalData?.metadata?.totalScheduledSections || 0)
            });

        return {
            workloadData: canonicalData.workloadData,
            enrollmentData: canonicalData.enrollmentData
        };
    }

    async function loadFallbackJson(path) {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${path}`);
        }
        return response.json();
    }

    async function loadFallbackData(reason = null) {
        const [workload, enrollment] = await Promise.all([
            loadFallbackJson('../workload-data.json'),
            loadFallbackJson('../enrollment-dashboard-data.json')
        ]);

        setRuntimeDataSourceStatus('historicalWorkload', {
            label: 'Historical workload baseline',
            source: 'local-file',
            canonical: false,
            fallback: true,
            detail: '../workload-data.json',
            count: Object.keys(workload?.facultyWorkload || {}).length,
            message: reason || null
        });
        setRuntimeDataSourceStatus('historicalEnrollment', {
            label: 'Historical enrollment baseline',
            source: 'local-file',
            canonical: false,
            fallback: true,
            detail: '../enrollment-dashboard-data.json',
            count: Object.keys(enrollment?.courseStats || {}).length,
            message: reason || null
        });

        return {
            workloadData: workload,
            enrollmentData: enrollment
        };
    }

    async function initDashboard() {
        applyDepartmentHeading();

        try {
            let data = null;
            let fallbackReason = null;

            if (global.dbService && typeof global.dbService.resetRuntimeSourceStatus === 'function') {
                global.dbService.resetRuntimeSourceStatus();
            }
            Object.keys(runtimeSources).forEach((key) => delete runtimeSources[key]);

            if (global.isSupabaseConfigured && global.isSupabaseConfigured() && global.dbService && global.CanonicalDashboardData) {
                try {
                    data = await loadCanonicalData();
                    if (!data) {
                        fallbackReason = 'Recommendations are falling back to local JSON because the canonical database does not yet have a usable saved academic-year schedule.';
                    }
                } catch (error) {
                    console.warn('Canonical recommendations data failed, using fallback JSON:', error);
                    fallbackReason = 'Recommendations are falling back to local JSON because canonical database reads failed.';
                }
            }

            if (!data) {
                data = await loadFallbackData(fallbackReason);
            }

            workloadData = data.workloadData;
            enrollmentData = data.enrollmentData;

            renderRuntimeDataSourceBanner();
            qs('loadingMessage').style.display = 'none';
            qs('dashboardContent').style.display = 'block';
            generateRecommendations();
        } catch (error) {
            console.error('Failed to initialize recommendations dashboard:', error);
            qs('loadingMessage').innerHTML = `
                <p style="color: #ff6b6b;">⚠️ Unable to load recommendation data.</p>
                <p style="margin-top: 10px;">${error.message}</p>
            `;
            renderRuntimeDataSourceBanner();
        }
    }

    function generateRecommendations() {
        const recommendations = {
            workload: analyzeWorkload(),
            enrollment: analyzeEnrollment(),
            scheduling: analyzeScheduling(),
            strategic: generateStrategicRecommendations()
        };

        updateSummary(recommendations);
        renderRecommendations(recommendations.workload, 'workloadRecommendations');
        renderRecommendations(recommendations.enrollment, 'enrollmentRecommendations');
        renderRecommendations(recommendations.scheduling, 'schedulingRecommendations');
        renderRecommendations(recommendations.strategic, 'strategicRecommendations');
    }

    function analyzeWorkload() {
        const faculty = workloadData?.facultyWorkload || {};
        const recommendations = [];

        const overloaded = Object.entries(faculty)
            .filter(([, data]) => data?.status === 'overloaded')
            .sort((a, b) => Number(b[1]?.utilizationRate || 0) - Number(a[1]?.utilizationRate || 0));

        overloaded.forEach(([name, data]) => {
            recommendations.push({
                title: `Address ${name}'s workload (${data.utilizationRate}% utilization)`,
                priority: data.utilizationRate > 150 ? 'critical' : 'high',
                description: `${name} is carrying ${data.totalCredits} credits (${data.totalWorkloadCredits.toFixed(1)} workload credits), above their target of ${data.maxWorkload} workload credits.`,
                impact: `Affects ${data.totalStudents || 0} projected students across ${data.sections || 0} section${Number(data.sections) === 1 ? '' : 's'}.`,
                actions: [
                    `Redistribute ${Math.max(1, Math.ceil(data.totalWorkloadCredits - data.maxWorkload))} workload credits`,
                    data.appliedLearningCredits > 0 ? `Review applied-learning supervision (${data.appliedLearningCredits} credits)` : null,
                    'Consider adjunct or reassigned coverage for one section',
                    'Check the next planning cycle for better section balance'
                ].filter(Boolean),
                faculty: name,
                students: data.totalStudents || 0
            });
        });

        const trendSummary = workloadData?.appliedLearningTrends?.summary;
        if (trendSummary?.latestWorkload > 6) {
            recommendations.push({
                title: 'Applied learning supervision is becoming a meaningful workload bucket',
                priority: 'medium',
                description: `The current saved schedule includes ${trendSummary.latestWorkload.toFixed(1)} workload credits of applied-learning supervision.`,
                impact: 'Applied learning can quietly consume workload capacity if it is not planned alongside scheduled sections.',
                actions: [
                    'Review applied-learning rates in the department profile',
                    'Decide whether this supervision should be distributed differently across faculty',
                    'Treat applied-learning supervision as an explicit AY setup input'
                ]
            });
        }

        return recommendations;
    }

    function analyzeEnrollment() {
        const courses = enrollmentData?.courseStats || {};
        const recommendations = [];

        Object.entries(courses).forEach(([code, data]) => {
            if (!data || data.sections <= 0) return;

            if (data.average > 24) {
                recommendations.push({
                    title: `Capacity pressure in ${code}`,
                    priority: 'high',
                    description: `${code} is averaging ${data.average} projected students across ${data.sections} saved section${data.sections === 1 ? '' : 's'}.`,
                    impact: 'Projected demand is above a typical 24-seat cap and may create capacity pressure.',
                    actions: [
                        'Review whether an additional section is needed',
                        'Check room sizing and instructor coverage',
                        'Confirm projected enrollment values are current'
                    ],
                    students: Math.round(data.average * data.sections)
                });
            } else if (data.average > 0 && data.average < 10) {
                recommendations.push({
                    title: `Low projected enrollment in ${code}`,
                    priority: 'medium',
                    description: `${code} is averaging ${data.average} projected students across saved sections.`,
                    impact: 'Very small projected sections may indicate scheduling, sequencing, or demand issues.',
                    actions: [
                        'Review whether the course should run this year',
                        'Check prerequisite flow and timing against nearby courses',
                        'Verify projected enrollment inputs before making a final cut'
                    ],
                    students: Math.round(data.average * data.sections)
                });
            }
        });

        return recommendations.sort((a, b) => {
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9);
        });
    }

    function analyzeScheduling() {
        const courses = enrollmentData?.courseStats || {};
        const recommendations = [];

        const highPressureCourses = Object.entries(courses)
            .filter(([, data]) => Number(data?.average || 0) >= 20)
            .sort((a, b) => Number(b[1]?.average || 0) - Number(a[1]?.average || 0))
            .slice(0, 3);

        if (highPressureCourses.length > 0) {
            recommendations.push({
                title: 'Protect room and faculty fit for high-demand sections',
                priority: 'medium',
                description: `The most pressure-sensitive saved offerings are ${highPressureCourses.map(([code]) => code).join(', ')}.`,
                impact: 'These sections are the likeliest to break the schedule if room fit or instructor availability is weak.',
                actions: [
                    'Review room assignments for the highest-demand sections first',
                    'Double-check faculty coverage and backup options',
                    'Prefer canonical saved-schedule edits over local what-if copies for release-gated decisions'
                ]
            });
        }

        const missingProjectedEnrollment = Number(enrollmentData?.metadata?.missingProjectedEnrollmentCount || 0);
        if (missingProjectedEnrollment > 0) {
            recommendations.push({
                title: 'Complete projected enrollment coverage',
                priority: 'high',
                description: `${missingProjectedEnrollment} saved section${missingProjectedEnrollment === 1 ? '' : 's'} do not yet have projected enrollment values.`,
                impact: 'Recommendation quality drops when saved sections lack projected demand data.',
                actions: [
                    'Fill in projected enrollment for every saved section',
                    'Re-run this dashboard after the schedule save baseline is complete'
                ]
            });
        }

        return recommendations;
    }

    function generateStrategicRecommendations() {
        const recommendations = [];
        const faculty = workloadData?.facultyWorkload || {};
        const overloadedCount = Object.values(faculty).filter((entry) => entry?.status === 'overloaded').length;

        if (overloadedCount > 0) {
            recommendations.push({
                title: 'Plan coverage before overload becomes structural',
                priority: overloadedCount >= 2 ? 'high' : 'medium',
                description: `${overloadedCount} faculty member${overloadedCount === 1 ? '' : 's'} are already overloaded in the saved schedule baseline.`,
                impact: 'Repeated overload in the canonical baseline is a planning problem, not just a one-off schedule quirk.',
                actions: [
                    'Review whether the AY plan is missing release time or staffing assumptions',
                    'Capture accepted overload risk explicitly if you choose to keep it',
                    'Use this dashboard as part of the release-gate evidence set'
                ]
            });
        }

        if (!recommendations.length) {
            recommendations.push({
                title: 'Keep the canonical baseline fresh',
                priority: 'low',
                description: 'The saved schedule baseline is not currently signaling urgent strategic issues.',
                impact: 'Recommendation quality depends on keeping saved schedule and projected enrollment data current.',
                actions: [
                    'Refresh projected enrollment whenever the schedule materially changes',
                    'Treat local fallback data as import/backfill support, not release evidence'
                ]
            });
        }

        return recommendations;
    }

    function updateSummary(recommendations) {
        const all = [
            ...recommendations.workload,
            ...recommendations.enrollment,
            ...recommendations.scheduling,
            ...recommendations.strategic
        ];

        const critical = all.filter((entry) => entry.priority === 'critical').length;
        const totalFaculty = new Set(all.filter((entry) => entry.faculty).map((entry) => entry.faculty)).size;
        const totalStudents = all.reduce((sum, entry) => sum + (entry.students || 0), 0);

        qs('totalRecommendations').textContent = `${all.length} Total Recommendations`;
        qs('criticalIssues').textContent = `${critical} Critical Issues`;
        qs('facultyImpact').textContent = `${totalFaculty} Faculty Impacted`;
        qs('studentImpact').textContent = `${totalStudents} Students Affected`;
    }

    function renderRecommendations(recommendations, containerId) {
        const container = qs(containerId);

        if (!recommendations.length) {
            container.innerHTML = '<p style="color: #166534; font-weight: 600;">No current recommendations in this category.</p>';
            return;
        }

        container.innerHTML = recommendations.map((rec) => `
            <div class="recommendation-card ${rec.priority}">
                <div class="rec-header">
                    <div class="rec-title">${rec.title}</div>
                    <span class="priority-badge ${rec.priority}">${rec.priority}</span>
                </div>
                <div class="rec-description">${rec.description}</div>
                ${rec.impact ? `
                    <div class="rec-impact">
                        <div class="rec-impact-label">Impact</div>
                        <div>${rec.impact}</div>
                    </div>
                ` : ''}
                <div style="font-weight: 600; margin-top: 15px; margin-bottom: 10px;">Recommended actions</div>
                <div class="rec-actions">
                    ${(rec.actions || []).map((action) => `<div class="action-item">${action}</div>`).join('')}
                </div>
            </div>
        `).join('');
    }

    function refreshRecommendations() {
        initDashboard();
    }

    function exportRecommendations() {
        global.alert('Export report is still a follow-on slice. The current focus is making runtime data canonical.');
    }

    global.refreshRecommendations = refreshRecommendations;
    global.exportRecommendations = exportRecommendations;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            resolvePreferredAcademicYear
        };
    }

    if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', initDashboard);
    }
})(typeof window !== 'undefined' ? window : globalThis);
