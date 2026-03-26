/**
 * Applied Learning Dashboard
 * Renders profile-aware supervision trends from integrated workload data.
 */

let workloadData = null;
let currentYear = 'all';
let activeDepartmentProfile = null;
let charts = {};

const APPLIED_LEARNING_CHART_COLORS = [
    { border: '#667eea', fill: 'rgba(102, 126, 234, 0.14)' },
    { border: '#51cf66', fill: 'rgba(81, 207, 102, 0.14)' },
    { border: '#ffa726', fill: 'rgba(255, 167, 38, 0.16)' },
    { border: '#ef4444', fill: 'rgba(239, 68, 68, 0.14)' },
    { border: '#14b8a6', fill: 'rgba(20, 184, 166, 0.14)' },
    { border: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.14)' }
];

function getDepartmentIdentity() {
    const identity = activeDepartmentProfile && activeDepartmentProfile.identity
        ? activeDepartmentProfile.identity
        : {};
    return {
        code: String(identity.code || 'DESN').trim().toUpperCase() || 'DESN',
        displayName: String(identity.displayName || identity.name || 'EWU Design').trim() || 'EWU Design'
    };
}

function getAppliedLearningCourses() {
    if (typeof WorkloadIntegration === 'undefined' || typeof WorkloadIntegration.getAppliedLearningCourses !== 'function') {
        return [];
    }

    return WorkloadIntegration.getAppliedLearningCourses()
        .map((course) => ({
            code: String(course?.code || '').trim(),
            title: String(course?.title || course?.code || '').trim(),
            rate: Number(course?.rate) || 0
        }))
        .filter((course) => course.code)
        .sort((a, b) => a.code.localeCompare(b.code));
}

function formatNumber(value, decimals = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    const fixed = Number(numeric.toFixed(decimals));
    return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

function getColor(index) {
    return APPLIED_LEARNING_CHART_COLORS[index % APPLIED_LEARNING_CHART_COLORS.length];
}

function getAvailableYears() {
    if (!workloadData || typeof WorkloadIntegration === 'undefined' || typeof WorkloadIntegration.getAcademicYearOptions !== 'function') {
        return [];
    }

    return WorkloadIntegration.getAcademicYearOptions(workloadData)
        .filter((year) => year && year !== 'all')
        .sort();
}

function getIntegratedYearData(year) {
    if (!workloadData || !year || typeof WorkloadIntegration === 'undefined' || typeof WorkloadIntegration.buildIntegratedWorkloadYearData !== 'function') {
        return null;
    }

    return WorkloadIntegration.buildIntegratedWorkloadYearData(workloadData, year);
}

function createEmptyCourseSummary(courses) {
    const byCode = {};
    courses.forEach((course) => {
        byCode[course.code] = {
            ...course,
            students: 0,
            credits: 0,
            workload: 0,
            sections: 0,
            supervisors: {}
        };
    });

    return {
        byCode,
        totals: {
            students: 0,
            credits: 0,
            workload: 0,
            sections: 0
        }
    };
}

function buildYearSummary(year) {
    const courses = getAppliedLearningCourses();
    const summary = createEmptyCourseSummary(courses);
    const yearData = getIntegratedYearData(year);
    const facultyData = yearData && yearData.all ? yearData.all : {};

    Object.entries(facultyData).forEach(([facultyName, facultyRecord]) => {
        Object.entries(facultyRecord?.appliedLearning || {}).forEach(([code, details]) => {
            const bucket = summary.byCode[code];
            if (!bucket) return;

            const students = Number(details?.students) || 0;
            const credits = Number(details?.credits) || 0;
            const workload = Number(details?.workload) || 0;
            const sections = Number(details?.sections) || 0;
            if ((students + credits + workload + sections) <= 0) return;

            bucket.students += students;
            bucket.credits += credits;
            bucket.workload += workload;
            bucket.sections += sections;

            if (!bucket.supervisors[facultyName]) {
                bucket.supervisors[facultyName] = { students: 0, credits: 0, workload: 0, sections: 0 };
            }
            bucket.supervisors[facultyName].students += students;
            bucket.supervisors[facultyName].credits += credits;
            bucket.supervisors[facultyName].workload += workload;
            bucket.supervisors[facultyName].sections += sections;

            summary.totals.students += students;
            summary.totals.credits += credits;
            summary.totals.workload += workload;
            summary.totals.sections += sections;
        });
    });

    return summary;
}

function buildSummaryForScope() {
    const years = getAvailableYears();
    if (currentYear !== 'all') {
        return buildYearSummary(currentYear);
    }

    const combined = createEmptyCourseSummary(getAppliedLearningCourses());
    years.forEach((year) => {
        const yearSummary = buildYearSummary(year);
        Object.entries(yearSummary.byCode).forEach(([code, details]) => {
            const bucket = combined.byCode[code];
            if (!bucket) return;

            bucket.students += details.students;
            bucket.credits += details.credits;
            bucket.workload += details.workload;
            bucket.sections += details.sections;

            Object.entries(details.supervisors || {}).forEach(([facultyName, supervisor]) => {
                if (!bucket.supervisors[facultyName]) {
                    bucket.supervisors[facultyName] = { students: 0, credits: 0, workload: 0, sections: 0 };
                }
                bucket.supervisors[facultyName].students += supervisor.students;
                bucket.supervisors[facultyName].credits += supervisor.credits;
                bucket.supervisors[facultyName].workload += supervisor.workload;
                bucket.supervisors[facultyName].sections += supervisor.sections;
            });
        });

        combined.totals.students += yearSummary.totals.students;
        combined.totals.credits += yearSummary.totals.credits;
        combined.totals.workload += yearSummary.totals.workload;
        combined.totals.sections += yearSummary.totals.sections;
    });

    return combined;
}

function hideLoadingShowContent() {
    const loading = document.getElementById('loadingMessage');
    const content = document.getElementById('dashboardContent');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
}

function showError(message) {
    const loading = document.getElementById('loadingMessage');
    if (loading) {
        loading.textContent = message;
        loading.classList.add('error');
    }
}

function applyDepartmentProfileCopy() {
    const identity = getDepartmentIdentity();
    const courses = getAppliedLearningCourses();
    const subtitle = document.getElementById('dashboardSubtitle');
    const note = document.getElementById('multiplierNote');
    const yearSelect = document.getElementById('academicYearFilter');

    document.title = `Applied Learning - ${identity.displayName}`;

    if (subtitle) {
        const codes = courses.map((course) => course.code).join(', ');
        subtitle.textContent = codes
            ? `${codes} supervision tracking and trends`
            : `${identity.code} applied-learning supervision tracking and trends`;
    }

    if (note) {
        const parts = courses
            .filter((course) => course.rate > 0)
            .map((course) => `${course.code} multiplier = ${formatNumber(course.rate, 2)}x`);
        note.textContent = parts.length
            ? parts.join(' | ')
            : 'Applied-learning workload multipliers are profile-driven.';
    }

    if (yearSelect) {
        yearSelect.setAttribute('aria-label', `${identity.displayName} academic year`);
    }
}

function populateYearFilter() {
    const select = document.getElementById('academicYearFilter');
    if (!select) return;

    const years = getAvailableYears();
    const currentAcademicYear = (() => {
        const now = new Date();
        const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        return `${startYear}-${String(startYear + 1).slice(-2)}`;
    })();

    select.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = years.length ? `All Years (${years[0]} to ${years[years.length - 1]})` : 'All Years';
    select.appendChild(allOption);

    years.forEach((year) => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentAcademicYear) {
            option.textContent = `${year} (Current)`;
        }
        select.appendChild(option);
    });

    if (years.includes(currentAcademicYear)) {
        currentYear = currentAcademicYear;
    } else if (years.length) {
        currentYear = years[years.length - 1];
    } else {
        currentYear = 'all';
    }

    select.value = currentYear;
}

function onYearChange(event) {
    if (event && event.target) {
        currentYear = event.target.value;
    }

    const badgeText = currentYear === 'all' ? 'All Years' : currentYear;
    const yearBadge = document.getElementById('yearBadge');
    const currentYearBadge = document.getElementById('currentYearBadge');
    if (yearBadge) yearBadge.textContent = badgeText;
    if (currentYearBadge) currentYearBadge.textContent = badgeText;

    refreshDashboard();
}

function renderSummaryCards() {
    const container = document.getElementById('summaryCards');
    if (!container) return;

    const summary = buildSummaryForScope();
    container.innerHTML = '';

    Object.values(summary.byCode).forEach((course) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-label">${course.code} (${course.title})</div>
            <div class="stat-value">${formatNumber(course.students, 0)} students</div>
            <div class="stat-subtitle">
                <span>${formatNumber(course.credits, 1)} credits</span> •
                <span>${formatNumber(course.sections, 0)} sections</span> •
                <span>${formatNumber(course.workload, 1)} workload</span>
            </div>
        `;
        container.appendChild(card);
    });

    const totalCard = document.createElement('div');
    totalCard.className = 'stat-card';
    totalCard.innerHTML = `
        <div class="stat-label">Total Students Served</div>
        <div class="stat-value">${formatNumber(summary.totals.students, 0)}</div>
        <div class="stat-subtitle">
            <span>${formatNumber(summary.totals.credits, 1)} credits</span> •
            <span>${formatNumber(summary.totals.sections, 0)} sections</span> •
            <span>${formatNumber(summary.totals.workload, 1)} workload equivalent</span>
        </div>
    `;
    container.appendChild(totalCard);
}

function renderCumulativeTrendChart() {
    if (charts.cumulative) {
        destroyChart(charts.cumulative);
    }

    const canvas = document.getElementById('cumulativeTrendChart');
    const years = getAvailableYears();
    const courses = getAppliedLearningCourses();
    if (!canvas || !years.length || !courses.length) return;

    charts.cumulative = createLineChart(canvas, {
        data: {
            labels: years,
            datasets: courses.map((course, index) => {
                const color = getColor(index);
                return {
                    label: `${course.code} (${course.title})`,
                    data: years.map((year) => buildYearSummary(year).byCode[course.code]?.credits || 0),
                    borderColor: color.border,
                    backgroundColor: color.fill,
                    borderWidth: 3,
                    fill: true
                };
            })
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: 'Applied Learning Credits by Year'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total Credits'
                    }
                }
            }
        }
    });
}

function renderInstructorSummaryChart() {
    if (charts.instructorSummary) {
        destroyChart(charts.instructorSummary);
    }

    const canvas = document.getElementById('instructorSummaryChart');
    const courses = getAppliedLearningCourses();
    const years = currentYear === 'all' ? getAvailableYears() : [currentYear];
    if (!canvas || !courses.length || !years.length) return;

    const byInstructor = {};
    years.forEach((year) => {
        const summary = buildYearSummary(year);
        Object.values(summary.byCode).forEach((course) => {
            Object.entries(course.supervisors || {}).forEach(([facultyName, details]) => {
                if (!byInstructor[facultyName]) {
                    byInstructor[facultyName] = { total: 0, byCode: {} };
                }
                byInstructor[facultyName].byCode[course.code] = (byInstructor[facultyName].byCode[course.code] || 0) + details.credits;
                byInstructor[facultyName].total += details.credits;
            });
        });
    });

    const rows = Object.entries(byInstructor)
        .map(([name, details]) => ({ name, ...details }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);

    charts.instructorSummary = createStackedBarChart(canvas, {
        data: {
            labels: rows.map((row) => row.name),
            datasets: courses.map((course, index) => {
                const color = getColor(index);
                return {
                    label: course.code,
                    data: rows.map((row) => row.byCode[course.code] || 0),
                    backgroundColor: color.fill.replace('0.14', '0.8').replace('0.16', '0.8'),
                    borderColor: color.border,
                    borderWidth: 2
                };
            })
        },
        options: {
            indexAxis: 'y',
            plugins: {
                title: {
                    display: true,
                    text: currentYear === 'all'
                        ? 'Applied Learning Credits by Faculty'
                        : `Applied Learning Credits by Faculty (${currentYear})`
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Total Credits'
                    }
                }
            }
        }
    });
}

function renderAnnualBreakdownTable() {
    const table = document.getElementById('annualBreakdownTable');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    const years = getAvailableYears();
    const courses = getAppliedLearningCourses();
    if (!years.length || !courses.length) return;

    const headerRow = document.createElement('tr');
    const headerName = document.createElement('th');
    headerName.rowSpan = 2;
    headerName.textContent = 'Instructor';
    headerRow.appendChild(headerName);

    years.forEach((year) => {
        const th = document.createElement('th');
        th.colSpan = courses.length;
        th.textContent = year;
        headerRow.appendChild(th);
    });

    const totalHeader = document.createElement('th');
    totalHeader.rowSpan = 2;
    totalHeader.textContent = 'Total';
    headerRow.appendChild(totalHeader);
    thead.appendChild(headerRow);

    const courseRow = document.createElement('tr');
    years.forEach(() => {
        courses.forEach((course) => {
            const th = document.createElement('th');
            th.textContent = course.code;
            courseRow.appendChild(th);
        });
    });
    thead.appendChild(courseRow);

    const instructors = new Set();
    years.forEach((year) => {
        const summary = buildYearSummary(year);
        Object.values(summary.byCode).forEach((course) => {
            Object.keys(course.supervisors || {}).forEach((name) => instructors.add(name));
        });
    });

    Array.from(instructors).sort().forEach((instructor) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = instructor;
        nameCell.appendChild(strong);
        row.appendChild(nameCell);

        let totalCredits = 0;
        years.forEach((year) => {
            const summary = buildYearSummary(year);
            courses.forEach((course) => {
                const credits = summary.byCode[course.code]?.supervisors?.[instructor]?.credits || 0;
                totalCredits += credits;
                const td = document.createElement('td');
                td.textContent = credits ? formatNumber(credits, 1) : '-';
                row.appendChild(td);
            });
        });

        const totalCell = document.createElement('td');
        const totalStrong = document.createElement('strong');
        totalStrong.textContent = formatNumber(totalCredits, 1);
        totalCell.appendChild(totalStrong);
        row.appendChild(totalCell);
        tbody.appendChild(row);
    });
}

function renderCurrentYearDetails() {
    const container = document.getElementById('currentYearCards');
    if (!container) return;

    container.innerHTML = '';

    if (currentYear === 'all') {
        const message = document.createElement('p');
        message.textContent = 'Select a specific year to view course-level detail.';
        container.appendChild(message);
        return;
    }

    const summary = buildYearSummary(currentYear);
    Object.values(summary.byCode).forEach((course) => {
        const card = document.createElement('div');
        card.className = 'card';

        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `
            <h3 class="card-title">${course.code}</h3>
            <span class="health-score good">${course.title}</span>
        `;
        card.appendChild(header);

        const content = document.createElement('div');
        content.className = 'card-content';
        content.appendChild(createMetric('Total Students:', formatNumber(course.students, 0)));
        content.appendChild(createMetric('Total Credits:', formatNumber(course.credits, 1)));
        content.appendChild(createMetric('Sections:', formatNumber(course.sections, 0)));
        content.appendChild(createMetric('Workload Equivalent:', `${formatNumber(course.workload, 1)} (${formatNumber(course.rate, 2)}x multiplier)`));

        const supervisorEntries = Object.entries(course.supervisors || {}).sort((a, b) => b[1].credits - a[1].credits);
        if (supervisorEntries.length) {
            const heading = document.createElement('h4');
            heading.style.marginTop = '15px';
            heading.style.marginBottom = '10px';
            heading.textContent = 'Supervisors:';
            content.appendChild(heading);

            supervisorEntries.forEach(([name, details]) => {
                content.appendChild(createMetric(
                    `${name}:`,
                    `${formatNumber(details.credits, 1)} credits (${formatNumber(details.sections, 0)} sections)`
                ));
            });
        } else {
            const empty = document.createElement('p');
            empty.style.marginTop = '15px';
            empty.style.color = '#6c757d';
            empty.textContent = `No ${course.code} data available for this year.`;
            content.appendChild(empty);
        }

        card.appendChild(content);
        container.appendChild(card);
    });
}

function createMetric(label, value) {
    const div = document.createElement('div');
    div.className = 'card-metric';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'card-metric-label';
    labelSpan.textContent = label;
    div.appendChild(labelSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'card-metric-value';
    valueSpan.textContent = value;
    div.appendChild(valueSpan);

    return div;
}

function refreshDashboard() {
    renderSummaryCards();
    renderCumulativeTrendChart();
    renderInstructorSummaryChart();
    renderAnnualBreakdownTable();
    renderCurrentYearDetails();
}

async function initializeDepartmentProfileContext() {
    const manager = window.DepartmentProfileManager;
    if (!manager || typeof manager.initialize !== 'function') return;

    const snapshot = await manager.initialize();
    activeDepartmentProfile = snapshot && snapshot.profile ? snapshot.profile : null;
}

async function initDashboard() {
    try {
        await initializeDepartmentProfileContext();
        workloadData = await loadWorkloadData('../');

        if (!workloadData) {
            showError('Failed to load applied learning data.');
            return;
        }

        applyDepartmentProfileCopy();
        populateYearFilter();
        document.getElementById('academicYearFilter')?.addEventListener('change', onYearChange);
        onYearChange({ target: { value: currentYear } });
        hideLoadingShowContent();
    } catch (error) {
        console.error('Failed to initialize applied learning dashboard:', error);
        showError(error?.message || 'Could not initialize applied learning dashboard.');
    }
}

window.addEventListener('load', initDashboard);
