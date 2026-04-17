(function courseOptimizerDashboardModule(global) {
    'use strict';

    const runtimeSources = {};
    const chartInstances = {};
    const state = {
        canonicalYearMap: new Map(),
        isCanonical: false,
        enrollmentData: null,
        analyzedCourses: []
    };

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
            count: Number.isFinite(status.count) ? status.count : null
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
            banner.innerHTML = '<strong>Canonical course health inputs</strong>This optimizer is scoring courses from the saved schedule, course catalog, and projected enrollment data in Supabase.';
            banner.hidden = false;
            return;
        }

        banner.className = 'runtime-source-banner runtime-source-banner-warning';
        banner.innerHTML = `<strong>Mixed course health inputs</strong>This optimizer is still relying on non-canonical or partial inputs for: ${degraded.map((entry) => entry.label).join(', ')}.`;
        banner.hidden = false;
    }

    function applyDepartmentHeading() {
        if (typeof global.getActiveDepartmentIdentity !== 'function') return;
        const identity = global.getActiveDepartmentIdentity();
        const heading = document.querySelector('header h1');
        const subtitle = document.querySelector('header .subtitle');

        if (heading) {
            heading.textContent = `🎓 ${identity.name} Course Optimizer`;
        }
        if (subtitle) {
            subtitle.textContent = `${identity.displayName} course health from saved schedule and projected demand signals`;
        }
        document.title = `Course Optimizer - ${identity.displayName}`;
    }

    async function loadProfileSnapshot() {
        if (!global.ProfileLoader || typeof global.ProfileLoader.init !== 'function') {
            return null;
        }

        try {
            return await global.ProfileLoader.init();
        } catch (error) {
            console.warn('Could not initialize profile loader for course optimizer:', error);
            return null;
        }
    }

    function destroyChart(key) {
        if (chartInstances[key] && typeof chartInstances[key].destroy === 'function') {
            chartInstances[key].destroy();
        }
        delete chartInstances[key];
    }

    function resolvePreferredAcademicYear(academicYears, selectedYear = null) {
        const list = Array.isArray(academicYears) ? academicYears : [];
        if (!list.length) return null;
        if (selectedYear) {
            const matched = list.find((entry) => String(entry?.year || '').trim() === String(selectedYear).trim());
            if (matched) return matched;
        }
        return list.find((entry) => entry && entry.is_active) || list[0] || null;
    }

    function populateAcademicYearFilter(academicYears, selectedYear = null) {
        const select = qs('academicYearFilter');
        if (!select) return;

        const list = Array.isArray(academicYears) ? academicYears : [];
        if (!list.length) return;

        select.innerHTML = list.map((entry) => {
            const year = String(entry?.year || '').trim();
            if (!year) return '';
            return `<option value="${year}">${year}${entry?.is_active ? ' (Active)' : ''}</option>`;
        }).join('');

        const preferred = resolvePreferredAcademicYear(list, selectedYear);
        if (preferred?.year) {
            select.value = preferred.year;
        }
    }

    async function loadCanonicalData(selectedYear = null) {
        const profileSnapshot = await loadProfileSnapshot();
        const [academicYears, courses, faculty] = await Promise.all([
            global.dbService.getAcademicYears(),
            global.dbService.getCourses(),
            global.dbService.getFaculty()
        ]);

        state.canonicalYearMap = new Map(
            (Array.isArray(academicYears) ? academicYears : [])
                .filter((entry) => entry?.year && entry?.id)
                .map((entry) => [String(entry.year), entry])
        );

        const activeYear = resolvePreferredAcademicYear(academicYears, selectedYear);
        if (!activeYear || !activeYear.id) {
            return null;
        }

        populateAcademicYearFilter(academicYears, activeYear.year);

        const scheduleRows = await global.dbService.getSchedule(activeYear.id);
        syncRuntimeSourcesFromDbService();

        if (!Array.isArray(scheduleRows) || !scheduleRows.length) {
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
                detail: `${missingProjectedEnrollmentCount} saved sections missing projected enrollment`,
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

        return canonicalData.enrollmentData;
    }

    async function loadFallbackJson(path) {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${path}`);
        }
        return response.json();
    }

    async function loadFallbackData(reason = null) {
        const enrollmentData = await loadFallbackJson('../enrollment-dashboard-data.json');
        setRuntimeDataSourceStatus('historicalEnrollment', {
            label: 'Historical enrollment baseline',
            source: 'local-file',
            canonical: false,
            fallback: true,
            detail: '../enrollment-dashboard-data.json',
            count: Object.keys(enrollmentData?.courseStats || {}).length
        });
        if (reason) {
            setRuntimeDataSourceStatus('savedSchedule', {
                label: 'Saved schedule',
                source: 'fallback-only',
                canonical: false,
                fallback: true,
                detail: reason,
                count: 0
            });
        }
        return enrollmentData;
    }

    async function initDashboard(selectedYear = null) {
        applyDepartmentHeading();

        try {
            state.isCanonical = false;
            state.canonicalYearMap = new Map();

            if (global.dbService && typeof global.dbService.resetRuntimeSourceStatus === 'function') {
                global.dbService.resetRuntimeSourceStatus();
            }
            Object.keys(runtimeSources).forEach((key) => delete runtimeSources[key]);

            let enrollmentData = null;
            let fallbackReason = null;

            if (global.isSupabaseConfigured && global.isSupabaseConfigured() && global.dbService && global.CanonicalDashboardData) {
                try {
                    enrollmentData = await loadCanonicalData(selectedYear);
                    if (enrollmentData) {
                        state.isCanonical = true;
                    } else {
                        fallbackReason = 'No saved schedule baseline was available in the database for the selected academic year.';
                    }
                } catch (error) {
                    console.warn('Canonical optimizer data failed, using fallback JSON:', error);
                    fallbackReason = 'Canonical database reads failed.';
                }
            }

            if (!enrollmentData) {
                enrollmentData = await loadFallbackData(fallbackReason);
            }

            state.enrollmentData = enrollmentData;
            renderRuntimeDataSourceBanner();

            qs('loadingMessage').style.display = 'none';
            qs('dashboardContent').style.display = 'block';
            analyzeCourses();
            setupFilters();
        } catch (error) {
            console.error('Failed to initialize course optimizer dashboard:', error);
            qs('loadingMessage').innerHTML = `
                <p style="color: #ff6b6b;">⚠️ Unable to load course optimizer data.</p>
                <p style="margin-top: 10px;">${error.message}</p>
            `;
            renderRuntimeDataSourceBanner();
        }
    }

    function calculateHealthScore(course) {
        let score = 50;

        if (course.average > 0) {
            if (course.average >= 20) score += 30;
            else if (course.average >= 15) score += 20;
            else if (course.average >= 10) score += 10;
            else score += 5;
        }

        if (course.trend === 'growing') score += 30;
        else if (course.trend === 'stable') score += 20;
        else if (course.trend === 'declining') score += 5;

        const utilization = course.average > 0 ? (course.average / 24) * 100 : 0;
        if (utilization >= 75 && utilization <= 100) score += 20;
        else if (utilization >= 50 && utilization < 75) score += 15;
        else if (utilization > 100) score += 10;
        else score += 5;

        if (course.sections >= 8) score += 20;
        else if (course.sections >= 5) score += 15;
        else if (course.sections >= 3) score += 10;
        else score += 5;

        return Math.min(100, Math.max(0, score));
    }

    function getHealthRating(score) {
        if (score >= 90) return 'excellent';
        if (score >= 75) return 'good';
        if (score >= 60) return 'fair';
        if (score >= 40) return 'poor';
        return 'critical';
    }

    function getRecommendation(course, rating) {
        if (course.average < 10) {
            return `Below a healthy section floor at ${course.average} projected students. Re-check whether this course should run as currently planned.`;
        }

        if (rating === 'excellent') {
            return course.average > 20
                ? `Healthy and near capacity at ${course.average} projected students. Protect room and faculty fit.`
                : 'Healthy course. Maintain its current offering pattern unless other constraints change.';
        }
        if (rating === 'good') {
            return `Healthy course with ${course.average} projected students on average. Keep monitoring demand.`;
        }
        if (rating === 'fair') {
            return course.trend === 'declining'
                ? 'Moderate concern because the projected trend is declining. Review timing, prerequisites, and positioning.'
                : 'Moderate concern. Review demand and schedule fit before locking the year.';
        }
        if (rating === 'poor') {
            return 'Low projected demand. Review whether this section belongs in the release-gated baseline.';
        }
        return 'Critical health score. This offering likely needs restructuring, consolidation, or removal from the saved baseline.';
    }

    function analyzeCourses() {
        const courses = state.enrollmentData?.courseStats || {};
        state.analyzedCourses = Object.entries(courses)
            .filter(([, data]) => !data?.isNew && Number(data?.sections || 0) > 0)
            .map(([code, data]) => {
                const score = calculateHealthScore(data);
                const rating = getHealthRating(score);
                return {
                    code,
                    ...data,
                    score,
                    rating,
                    recommendation: getRecommendation(data, rating)
                };
            });

        renderAll(state.analyzedCourses);
    }

    function renderAll(courses) {
        renderHealthDistribution(courses);
        renderHealthByLevel(courses);
        renderCourseHealthChart(courses);
        renderCourseCards(courses);
    }

    function renderHealthDistribution(courses) {
        if (!global.Chart) return;
        destroyChart('healthDistribution');
        const ctx = qs('healthDistributionChart').getContext('2d');

        chartInstances.healthDistribution = new global.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'],
                datasets: [{
                    data: [
                        courses.filter((course) => course.rating === 'excellent').length,
                        courses.filter((course) => course.rating === 'good').length,
                        courses.filter((course) => course.rating === 'fair').length,
                        courses.filter((course) => course.rating === 'poor').length,
                        courses.filter((course) => course.rating === 'critical').length
                    ],
                    backgroundColor: [
                        'rgba(81, 207, 102, 0.8)',
                        'rgba(116, 192, 252, 0.8)',
                        'rgba(255, 217, 61, 0.8)',
                        'rgba(255, 167, 38, 0.8)',
                        'rgba(255, 107, 107, 0.8)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    function renderHealthByLevel(courses) {
        if (!global.Chart) return;
        destroyChart('healthByLevel');
        const ctx = qs('healthByLevelChart').getContext('2d');

        const buckets = {
            foundation: [],
            intermediate: [],
            advanced: []
        };

        courses.forEach((course) => {
            const level = parseInt(String(course.code || '').split(' ')[1], 10);
            if (!Number.isFinite(level)) return;
            if (level < 300) buckets.foundation.push(course.score);
            else if (level < 400) buckets.intermediate.push(course.score);
            else buckets.advanced.push(course.score);
        });

        chartInstances.healthByLevel = new global.Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Foundation (100-200)', 'Intermediate (300)', 'Advanced (400)'],
                datasets: [{
                    label: 'Average Health Score',
                    data: [
                        average(buckets.foundation),
                        average(buckets.intermediate),
                        average(buckets.advanced)
                    ],
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.8)',
                        'rgba(118, 75, 162, 0.8)',
                        'rgba(81, 207, 102, 0.8)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    function renderCourseHealthChart(courses) {
        if (!global.Chart) return;
        destroyChart('courseHealth');
        const ctx = qs('courseHealthChart').getContext('2d');
        const sorted = courses.slice().sort((a, b) => b.score - a.score);

        chartInstances.courseHealth = new global.Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map((course) => course.code),
                datasets: [{
                    label: 'Health Score',
                    data: sorted.map((course) => course.score),
                    backgroundColor: sorted.map((course) => {
                        if (course.rating === 'excellent') return 'rgba(81, 207, 102, 0.8)';
                        if (course.rating === 'good') return 'rgba(116, 192, 252, 0.8)';
                        if (course.rating === 'fair') return 'rgba(255, 217, 61, 0.8)';
                        if (course.rating === 'poor') return 'rgba(255, 167, 38, 0.8)';
                        return 'rgba(255, 107, 107, 0.8)';
                    })
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    function renderCourseCards(courses) {
        const grid = qs('courseGrid');
        const sorted = courses.slice().sort((a, b) => a.code.localeCompare(b.code));
        grid.innerHTML = sorted.map((course) => `
            <div class="course-card ${course.rating}">
                <div class="course-header">
                    <div class="course-code">${course.code}</div>
                    <div class="health-score ${course.rating}">${course.score}</div>
                </div>
                <div class="course-metrics">
                    <div class="metric">📊 <strong>${course.average}</strong> avg projected</div>
                    <div class="metric">📈 <strong>${course.trend}</strong></div>
                    <div class="metric">👥 <strong>${course.peak}</strong> peak</div>
                    <div class="metric">📚 <strong>${course.sections}</strong> sections</div>
                </div>
                <div class="course-recommendation">${course.recommendation}</div>
            </div>
        `).join('');
    }

    function setupFilters() {
        if (setupFilters.initialized) return;
        setupFilters.initialized = true;

        qs('courseLevel').addEventListener('change', filterCourses);
        qs('healthFilter').addEventListener('change', filterCourses);
        qs('academicYearFilter').addEventListener('change', async (event) => {
            if (!state.isCanonical) {
                filterCourses();
                return;
            }
            qs('loadingMessage').style.display = 'block';
            qs('dashboardContent').style.display = 'none';
            await initDashboard(event.target.value);
            filterCourses();
        });
    }

    function filterCourses() {
        const levelFilter = qs('courseLevel').value;
        const healthFilter = qs('healthFilter').value;

        let filtered = state.analyzedCourses.slice();

        if (levelFilter !== 'all') {
            filtered = filtered.filter((course) => {
                const level = parseInt(String(course.code || '').split(' ')[1], 10);
                if (!Number.isFinite(level)) return false;
                if (levelFilter === 'foundation') return level < 300;
                if (levelFilter === 'intermediate') return level >= 300 && level < 400;
                if (levelFilter === 'advanced') return level >= 400;
                return true;
            });
        }

        if (healthFilter !== 'all') {
            filtered = filtered.filter((course) => course.rating === healthFilter);
        }

        renderCourseCards(filtered);
    }

    function average(values) {
        if (!Array.isArray(values) || !values.length) return 0;
        return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            resolvePreferredAcademicYear,
            calculateHealthScore,
            getHealthRating
        };
    }

    if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', () => initDashboard());
    }
})(typeof window !== 'undefined' ? window : globalThis);
