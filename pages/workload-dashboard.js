/**
 * EWU Design Faculty Workload Dashboard
 * Handles data loading, filtering, and visualization
 */

// Global state
let workloadData = null;
let currentYearData = null;
let currentFilters = {
    year: getCurrentAcademicYear(),
    status: 'all',
    category: 'all'
};
let excelJsLoadPromise = null;

const WORKLOAD_EXPORT_TEMPLATE_PATH = '../docs/examples/workload/MasingaleT_Wkld_2526_20May2025.xlsx';
const WORKLOAD_EXPORT_TEMPLATE_SHEET = 'Sheet1';
const WORKLOAD_EXPORT_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const WORKLOAD_EXPORT_FACULTY_NAME_OVERRIDES = {
    'mindy breen': 'Breen Mindy',
    'm.breen': 'Breen Mindy',
    'travis masingale': 'Masingale Travis',
    't.masingale': 'Masingale Travis',
    'ginelle hustrulid': 'Hustrulid Ginelle',
    'g.hustrulid': 'Hustrulid Ginelle',
    'colin manikoth': 'Manikoth Colin',
    'c.manikoth': 'Manikoth Colin',
    'sonja durr': 'Durr Sonja',
    's.durr': 'Durr Sonja',
    'simeon mills': 'Mills Simeon',
    'sam mills': 'Mills Simeon',
    's.mills': 'Mills Simeon',
    'meg lybbert': 'Lybbert Meg',
    'meg lybert': 'Lybbert Meg',
    'm.lybbert': 'Lybbert Meg',
    'm.lybert': 'Lybbert Meg',
    'ariel sopu': 'Sopu Ariel',
    'a.sopu': 'Sopu Ariel'
};

// Chart instances
let charts = {};

function getCurrentAcademicYear() {
    const now = new Date();
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function getPreferredYear() {
    const dynamicYear = getCurrentAcademicYear();
    if (dynamicYear) return dynamicYear;
    return '2025-26';
}

function getYearFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const year = String(params.get('year') || '').trim();
    return /^\d{4}-\d{2}$/.test(year) ? year : '';
}

function augmentYearFilterOptions() {
    const select = document.getElementById('academicYearFilter');
    if (!select || typeof WorkloadIntegration === 'undefined') return;

    const yearOptions = WorkloadIntegration.getAcademicYearOptions(workloadData);
    const existing = new Set(Array.from(select.options).map((option) => option.value));

    yearOptions.forEach((year) => {
        if (existing.has(year)) return;
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        select.appendChild(option);
    });

    const firstOption = select.options[0];
    const yearValues = Array.from(select.options)
        .slice(1)
        .map((option) => option.value)
        .sort();

    while (select.options.length > 1) {
        select.remove(1);
    }

    yearValues.forEach((year) => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        select.appendChild(option);
    });

    if (firstOption) {
        firstOption.text = firstOption.text || 'All Years';
    }
}

function loadIntegratedYearData(year) {
    if (typeof WorkloadIntegration !== 'undefined' && year !== 'all') {
        return WorkloadIntegration.buildIntegratedWorkloadYearData(workloadData, year);
    }
    return getYearData(workloadData, year);
}

function ensurePreliminaryNoticeStyles() {
    if (document.getElementById('preliminaryWorkloadNoticeStyles')) return;
    const style = document.createElement('style');
    style.id = 'preliminaryWorkloadNoticeStyles';
    style.textContent = `
        .prelim-workload-notice {
            margin: 0 0 16px;
            padding: 14px 16px;
            border-radius: 12px;
            border: 1px solid #f59e0b;
            background: linear-gradient(180deg, #fff8e6 0%, #fffdf7 100%);
            color: #5b3a00;
        }
        .prelim-workload-notice[hidden] {
            display: none !important;
        }
        .prelim-workload-notice h3 {
            margin: 0 0 8px;
            font-size: 1rem;
            color: #7c2d12;
        }
        .prelim-workload-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 8px 12px;
            margin-bottom: 10px;
        }
        .prelim-workload-stat {
            background: rgba(255,255,255,0.7);
            border: 1px solid rgba(245, 158, 11, 0.2);
            border-radius: 8px;
            padding: 8px 10px;
        }
        .prelim-workload-stat-label {
            display: block;
            font-size: 0.8rem;
            color: #92400e;
            margin-bottom: 2px;
        }
        .prelim-workload-stat-value {
            font-weight: 700;
            color: #78350f;
        }
        .prelim-workload-note {
            margin: 8px 0 0;
            font-size: 0.9rem;
            color: #78350f;
        }
        .prelim-workload-list {
            margin: 8px 0 0 18px;
            padding: 0;
            color: #78350f;
            font-size: 0.88rem;
        }
        .prelim-workload-list li {
            margin: 3px 0;
        }
        .prelim-workload-mini {
            font-size: 0.82rem;
            color: #92400e;
        }
    `;
    document.head.appendChild(style);
}

function ensurePreliminaryNoticeContainer() {
    ensurePreliminaryNoticeStyles();
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return null;

    let notice = document.getElementById('preliminaryWorkloadNotice');
    if (notice) return notice;

    notice = document.createElement('section');
    notice.id = 'preliminaryWorkloadNotice';
    notice.className = 'prelim-workload-notice';
    notice.hidden = true;

    const firstChild = dashboardContent.firstElementChild;
    dashboardContent.insertBefore(notice, firstChild || null);
    return notice;
}

function summarizeQuarterSectionCounts(byQuarter) {
    const source = byQuarter || {};
    return ['Fall', 'Winter', 'Spring', 'Summer']
        .map((quarter) => {
            const sections = Number(source?.[quarter]?.sections) || 0;
            return sections > 0 ? `${quarter}: ${sections}` : null;
        })
        .filter(Boolean)
        .join(' · ');
}

function updateWorkloadSubtitleForYear(yearData) {
    const subtitle = document.querySelector('.subtitle');
    if (!subtitle) return;

    const meta = yearData?.meta || {};
    if (currentFilters.year === 'all') {
        return;
    }

    const base = `EWU Design Department - Academic Workload Analysis · AY ${currentFilters.year}`;
    if (meta.source === 'integrated' && meta.hasLiveSchedule) {
        subtitle.textContent = `${base} (Preliminary from Scheduler Draft)`;
    } else {
        subtitle.textContent = base;
    }
}

function renderPreliminaryPlanningNotice(yearData) {
    const notice = ensurePreliminaryNoticeContainer();
    if (!notice) return;

    const meta = yearData?.meta || {};
    const unresolved = meta.unresolvedScheduleCourses || {};
    const showNotice = currentFilters.year !== 'all' && meta.source === 'integrated';

    if (!showNotice) {
        notice.hidden = true;
        notice.innerHTML = '';
        return;
    }

    const fallbackRules = Array.isArray(meta.fallbackTargetRulesApplied) ? meta.fallbackTargetRulesApplied : [];
    const assumptionItems = Array.isArray(meta.preliminaryAssumptions) ? meta.preliminaryAssumptions : [];
    const unresolvedCourses = Array.isArray(unresolved.courses) ? unresolved.courses : [];
    const unresolvedCount = Number(unresolved.count) || 0;
    const assignedCount = Number(meta.assignedScheduleCourses) || 0;
    const totalScheduleCount = Number(meta.scheduleCourses) || 0;

    notice.hidden = false;

    const unresolvedQuarterText = summarizeQuarterSectionCounts(unresolved.byQuarter);
    const fallbackText = fallbackRules.length
        ? fallbackRules
            .map((rule) => {
                const matched = Array.isArray(rule.matchedFaculty) && rule.matchedFaculty.length
                    ? ` (${rule.matchedFaculty.join(', ')})`
                    : '';
                return `${rule.role} ${rule.netTargetCredits} target${rule.specialRole ? `, ${rule.specialRole}` : ''}${matched}`;
            })
            .join('; ')
        : '';

    const unresolvedPreview = unresolvedCourses.slice(0, 6)
        .map((course) => `${course.quarter}: ${course.courseCode} (${course.credits} cr, ${course.instructor})`);

    notice.innerHTML = `
        <h3>Preliminary Workload (Scheduler Draft)</h3>
        <div class="prelim-workload-grid">
            <div class="prelim-workload-stat">
                <span class="prelim-workload-stat-label">Selected AY</span>
                <span class="prelim-workload-stat-value">${currentFilters.year}</span>
            </div>
            <div class="prelim-workload-stat">
                <span class="prelim-workload-stat-label">Scheduler Sections</span>
                <span class="prelim-workload-stat-value">${totalScheduleCount}</span>
            </div>
            <div class="prelim-workload-stat">
                <span class="prelim-workload-stat-label">Assigned to Faculty</span>
                <span class="prelim-workload-stat-value">${assignedCount}</span>
            </div>
            <div class="prelim-workload-stat">
                <span class="prelim-workload-stat-label">TBD / Unassigned</span>
                <span class="prelim-workload-stat-value">${unresolvedCount}</span>
            </div>
        </div>
        ${unresolvedCount > 0 ? `<p class="prelim-workload-note"><strong>Unresolved sections are excluded from faculty totals.</strong>${unresolvedQuarterText ? ` ${unresolvedQuarterText}` : ''}</p>` : ''}
        ${unresolvedPreview.length > 0 ? `<ul class="prelim-workload-list">${unresolvedPreview.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}
        ${fallbackText ? `<p class="prelim-workload-note"><strong>Fallback target assumptions applied:</strong> ${fallbackText}</p>` : ''}
        ${assumptionItems.length ? `<ul class="prelim-workload-list">${assumptionItems.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}
        <p class="prelim-workload-note prelim-workload-mini">Use AY Setup + Release Time dashboards to replace fallback assumptions with final targets/release allocations.</p>
    `;
}

/**
 * Initialize dashboard
 */
async function initDashboard() {
    console.log('🚀 Initializing Faculty Workload Dashboard');

    // Load workload data
    workloadData = await loadWorkloadData('../');

    if (!workloadData) {
        showError('Failed to load workload data.');
        return;
    }

    // Initialize ReleaseTimeManager if available
    if (typeof ReleaseTimeManager !== 'undefined') {
        ReleaseTimeManager.init();
        console.log('📋 ReleaseTimeManager initialized');
    }

    // Initialize ScheduleManager if available
    if (typeof ScheduleManager !== 'undefined') {
        await ScheduleManager.init();
        // Import workload data into ScheduleManager
        if (workloadData) {
            ScheduleManager.importFromWorkloadData(workloadData);
        }
        console.log('📝 ScheduleManager initialized');
    }

    // Setup year filter with callback
    setupYearFilter(workloadData, onYearChange);
    augmentYearFilterOptions();

    const yearSelect = document.getElementById('academicYearFilter');
    const requestedYear = getYearFromQuery();
    const preferredYear = requestedYear || getPreferredYear();
    if (yearSelect && Array.from(yearSelect.options).some((option) => option.value === preferredYear)) {
        yearSelect.value = preferredYear;
        yearSelect.dispatchEvent(new Event('change'));
    }

    // Setup other filters
    document.getElementById('statusFilter').addEventListener('change', onFilterChange);
    document.getElementById('categoryFilter').addEventListener('change', onFilterChange);

    // Hide loading and show content
    hideLoadingShowContent();

    console.log('✅ Dashboard initialized');
}

/**
 * Handle year filter change
 * THIS IS THE KEY FIX - accessing .all property correctly
 */
function onYearChange(year) {
    console.log(`📅 Year changed to: ${year}`);

    currentFilters.year = year;

    // Get year-specific data using utility function
    currentYearData = loadIntegratedYearData(year);

    // Update subtitle
    updateYearSubtitle(year, 'EWU Design Department - Academic Workload Analysis');
    updateWorkloadSubtitleForYear(currentYearData);

    // Refresh all visualizations
    refreshDashboard();
}

/**
 * Handle status/category filter change
 */
function onFilterChange() {
    currentFilters.status = document.getElementById('statusFilter').value;
    currentFilters.category = document.getElementById('categoryFilter').value;

    console.log('🔍 Filters changed:', currentFilters);

    refreshDashboard();
}

/**
 * Refresh all dashboard sections
 */
function refreshDashboard() {
    if (!currentYearData) {
        console.warn('⚠️ No year data available');
        return;
    }

    // Get faculty data based on category filter
    let facultyData = getFacultyByCategory(currentYearData, currentFilters.category);

    // Apply release time adjustments if ReleaseTimeManager is available
    if (typeof applyReleaseTimeToFacultyData === 'function' && currentYearData?.meta?.source !== 'integrated') {
        facultyData = applyReleaseTimeToFacultyData(facultyData, currentFilters.year);
    }

    // Apply status filter if needed
    if (currentFilters.status !== 'all') {
        const filtered = {};
        Object.entries(facultyData).forEach(([name, data]) => {
            // Use effective status if available, otherwise original status
            const statusToCheck = data.effectiveStatus || data.status;
            if (statusToCheck === currentFilters.status) {
                filtered[name] = data;
            }
        });
        facultyData = filtered;
    }

    // Update all sections
    updateStatistics(currentYearData);
    renderPreliminaryPlanningNotice(currentYearData);
    renderWorkloadChart(facultyData);
    renderUtilizationPie(currentYearData);
    renderFullTimeFaculty(currentYearData.fullTime || {});
    renderAdjunctFaculty(currentYearData.adjunct || {});
    renderReleaseTimeStats(currentFilters.year, currentYearData);
    renderAppliedLearningStats(currentYearData.all || {});
}

/**
 * Update statistics cards
 */
function updateStatistics(yearData) {
    const stats = getYearStatistics(yearData);

    document.getElementById('totalFaculty').textContent = stats.total;
    document.getElementById('facultyBreakdown').textContent =
        `${stats.fullTime} Full-Time, ${stats.adjunct} Adjunct`;
    document.getElementById('overloadedFaculty').textContent = stats.overloaded;
    document.getElementById('optimalFaculty').textContent = stats.optimal;
    document.getElementById('underutilizedFaculty').textContent = stats.underutilized;
}

/**
 * Render workload distribution chart
 */
function renderWorkloadChart(facultyData) {
    const topFaculty = getTopFacultyByWorkload(facultyData, 15);

    // Destroy existing chart
    if (charts.workload) {
        destroyChart(charts.workload);
    }

    const canvas = document.getElementById('workloadDistributionChart');
    const datasets = createWorkloadDatasets(topFaculty);

    charts.workload = createStackedBarChart(canvas, {
        data: datasets,
        options: {
            plugins: {
                title: {
                    display: true,
                    text: 'Scheduled Classes + Applied Learning (Weighted)'
                },
                tooltip: createWorkloadTooltip()
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Workload Credits'
                    }
                }
            }
        }
    });
}

/**
 * Render utilization pie chart
 */
function renderUtilizationPie(yearData) {
    const stats = getYearStatistics(yearData);

    // Destroy existing chart
    if (charts.utilization) {
        destroyChart(charts.utilization);
    }

    const canvas = document.getElementById('utilizationPieChart');
    const data = createUtilizationPieData(stats);

    charts.utilization = createPieChart(canvas, {
        data: data,
        options: {
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    }, 'doughnut');
}

/**
 * Render full-time faculty section
 */
function renderFullTimeFaculty(fullTimeData) {
    const faculty = Object.entries(fullTimeData);

    // Update badge
    document.getElementById('fullTimeBadge').textContent = `${faculty.length} Faculty`;

    // Render chart
    if (charts.fullTime) {
        destroyChart(charts.fullTime);
    }

    const topFaculty = faculty
        .sort((a, b) => b[1].totalWorkloadCredits - a[1].totalWorkloadCredits)
        .slice(0, 15);

    const canvas = document.getElementById('fullTimeChart');
    const datasets = createWorkloadDatasets(topFaculty);

    charts.fullTime = createStackedBarChart(canvas, {
        data: datasets,
        options: {
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: true
                }
            }
        }
    });

    // Render table
    renderFacultyTable(fullTimeData, 'fullTimeTable', true);
}

/**
 * Render adjunct faculty section
 */
function renderAdjunctFaculty(adjunctData) {
    const faculty = Object.entries(adjunctData);

    // Update badge
    document.getElementById('adjunctBadge').textContent = `${faculty.length} Faculty`;

    // Render table
    renderFacultyTable(adjunctData, 'adjunctTable', false);
}

/**
 * Render faculty table using safe DOM methods
 */
function renderFacultyTable(facultyData, tableId, includeRank) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    // Clear existing rows
    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }

    const faculty = Object.entries(facultyData)
        .sort((a, b) => b[1].totalWorkloadCredits - a[1].totalWorkloadCredits);

    faculty.forEach(([name, data]) => {
        const row = document.createElement('tr');

        if (includeRank) {
            // Full-time faculty row with rank
            row.appendChild(createTableCell(formatFacultyName(name, data)));
            row.appendChild(createTableCell(data.rank || 'N/A'));
            row.appendChild(createTableCell(data.scheduledCredits || 0));

            // Applied learning cell with small text
            const alCell = document.createElement('td');
            alCell.textContent = (data.appliedLearningCredits || 0) + ' ';
            const small = document.createElement('small');
            small.textContent = '(' + (data.appliedLearningWorkload || 0).toFixed(1) + ' weighted)';
            alCell.appendChild(small);
            row.appendChild(alCell);

            // Total workload (bold)
            const totalCell = document.createElement('td');
            const strong = document.createElement('strong');
            strong.textContent = (data.totalWorkloadCredits || 0).toFixed(1);
            totalCell.appendChild(strong);
            row.appendChild(totalCell);

            row.appendChild(createTableCell(data.maxWorkload || 0));

            // Progress bar cell
            row.appendChild(createProgressCell(data.utilizationRate || 0, data.status));

            // Status badge cell
            const statusCell = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'status-badge ' + (data.status || '');
            badge.textContent = data.status || 'N/A';
            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            // Actions cell
            row.appendChild(createActionsCell(name));
        } else {
            // Adjunct faculty row (simpler)
            row.appendChild(createTableCell(name));

            const totalCell = document.createElement('td');
            const strong = document.createElement('strong');
            strong.textContent = (data.totalWorkloadCredits || 0).toFixed(1);
            totalCell.appendChild(strong);
            row.appendChild(totalCell);

            row.appendChild(createTableCell((data.maxWorkload || 15) + ' (Adjunct limit)'));

            // Progress bar cell
            row.appendChild(createProgressCell(data.utilizationRate || 0, data.status));

            row.appendChild(createTableCell(data.sections || 0));

            // Actions cell
            row.appendChild(createActionsCell(name));
        }

        tbody.appendChild(row);
    });
}

/**
 * Helper to create actions cell with edit button
 */
function createActionsCell(facultyName) {
    const td = document.createElement('td');

    const detailBtn = document.createElement('button');
    detailBtn.className = 'btn-icon btn-add-course';
    detailBtn.title = 'Manage workload detail courses';
    detailBtn.textContent = '📄';
    detailBtn.onclick = () => openFacultyWorkloadDetail(facultyName);
    td.appendChild(detailBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-icon';
    exportBtn.title = 'Export workload sheet (.xlsx)';
    exportBtn.textContent = '⬇️';
    exportBtn.onclick = () => exportFacultyWorkloadSheet(facultyName);
    td.appendChild(exportBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon btn-edit';
    editBtn.title = 'Edit courses';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => openFacultyEditModal(facultyName);

    td.appendChild(editBtn);
    return td;
}

/**
 * Helper to create a simple table cell
 */
function createTableCell(content) {
    const td = document.createElement('td');
    td.textContent = String(content);
    return td;
}

/**
 * Helper to create a progress bar cell
 */
function createProgressCell(utilizationRate, status) {
    const td = document.createElement('td');

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill ' + getUtilizationColorClass(status);
    progressFill.style.width = Math.min(100, utilizationRate) + '%';
    progressFill.textContent = utilizationRate.toFixed(1) + '%';

    progressBar.appendChild(progressFill);
    td.appendChild(progressBar);

    return td;
}

/**
 * Render applied learning statistics
 */
function renderAppliedLearningStats(facultyData) {
    const summary = calculateAppliedLearningSummary(facultyData);

    document.getElementById('desn399Credits').textContent =
        `${summary.desn399.credits} credits`;
    document.getElementById('desn399Workload').textContent =
        `${summary.desn399.workload.toFixed(1)} workload credits (${summary.desn399.sections} sections)`;

    document.getElementById('desn491Credits').textContent =
        `${summary.desn491.credits} credits`;
    document.getElementById('desn491Workload').textContent =
        `${summary.desn491.workload.toFixed(1)} workload credits (${summary.desn491.sections} sections)`;

    document.getElementById('desn499Credits').textContent =
        `${summary.desn499.credits} credits`;
    document.getElementById('desn499Workload').textContent =
        `${summary.desn499.workload.toFixed(1)} workload credits (${summary.desn499.sections} sections)`;

    document.getElementById('desn495Credits').textContent =
        `${summary.desn495.credits} credits`;
    document.getElementById('desn495Workload').textContent =
        `${summary.desn495.workload.toFixed(1)} workload credits (${summary.desn495.sections} sections)`;

    document.getElementById('totalAppliedCredits').textContent =
        `${summary.totalCredits} credits`;
    document.getElementById('totalAppliedWorkload').textContent =
        `${summary.totalWorkload.toFixed(1)} workload credits`;
}

/**
 * Render release time statistics section
 */
function renderReleaseTimeStats(academicYear, yearData) {
    // Get release time summary
    const releaseTimeSummary = calculateDepartmentReleaseTimeSummary(academicYear);

    // Calculate full-time capacity for impact percentage
    let fullTimeCapacity = 0;
    if (yearData && yearData.fullTime) {
        Object.values(yearData.fullTime).forEach(f => {
            fullTimeCapacity += f.maxWorkload || 0;
        });
    }

    // Update stats
    document.getElementById('totalReleaseCredits').textContent = releaseTimeSummary.totalCredits;

    document.getElementById('facultyWithRelease').textContent = releaseTimeSummary.totalFaculty;

    // Build breakdown text from categories
    const breakdownParts = [];
    if (releaseTimeSummary.byCategory) {
        Object.entries(releaseTimeSummary.byCategory).forEach(([cat, data]) => {
            if (data.credits > 0) {
                breakdownParts.push(`${cat}: ${data.credits}`);
            }
        });
    }
    document.getElementById('releaseBreakdown').textContent =
        breakdownParts.length > 0 ? breakdownParts.slice(0, 3).join(', ') : 'No allocations';

    // Calculate capacity impact percentage
    const impactPercent = fullTimeCapacity > 0
        ? Math.round((releaseTimeSummary.totalCredits / fullTimeCapacity) * 100 * 10) / 10
        : 0;
    document.getElementById('capacityImpact').textContent = impactPercent + '%';
}

function openFacultyWorkloadDetail(facultyName) {
    const params = new URLSearchParams({
        faculty: facultyName,
        year: currentFilters.year
    });
    window.location.href = `faculty-workload-detail.html?${params.toString()}`;
}

function normalizeFacultyExportKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}

function getTemplateFacultyName(facultyName) {
    const raw = String(facultyName || '').trim();
    const normalized = normalizeFacultyExportKey(raw);
    const exactOverride = Object.entries(WORKLOAD_EXPORT_FACULTY_NAME_OVERRIDES)
        .find(([key]) => normalizeFacultyExportKey(key) === normalized);
    if (exactOverride) {
        return exactOverride[1];
    }

    // Fallback: convert "First Last" => "Last First" when possible, leave initials as-is.
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && !parts[0].includes('.')) {
        return `${parts.slice(1).join(' ')} ${parts[0]}`;
    }
    return raw;
}

function getAcademicYearYears(academicYear) {
    const match = String(academicYear || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        const current = new Date().getFullYear();
        return { startYear: current, endYear: current + 1, compact: `${String(current).slice(-2)}${String(current + 1).slice(-2)}` };
    }
    const startYear = Number(match[1]);
    const endYear = Number(`${String(startYear).slice(0, 2)}${match[2]}`);
    return {
        startYear,
        endYear,
        compact: `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`
    };
}

function roundToTenths(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10) / 10;
}

function isAppliedLearningCode(code) {
    const normalized = String(code || '').replace(/\s+/g, ' ').trim().toUpperCase();
    return normalized === 'DESN 399'
        || normalized === 'DESN 491'
        || normalized === 'DESN 495'
        || normalized === 'DESN 499';
}

function sortQuarterRows(rows) {
    return rows.sort((a, b) => {
        if ((a.sortOrder || 0) !== (b.sortOrder || 0)) {
            return (a.sortOrder || 0) - (b.sortOrder || 0);
        }
        return String(a.label || '').localeCompare(String(b.label || ''));
    });
}

function buildQuarterExportRows(facultyRecord) {
    const quarters = { Fall: [], Winter: [], Spring: [] };
    const appliedTotals = {
        Fall: { credits: 0, count: 0, codes: new Set() },
        Winter: { credits: 0, count: 0, codes: new Set() },
        Spring: { credits: 0, count: 0, codes: new Set() }
    };

    const courses = Array.isArray(facultyRecord?.courses) ? facultyRecord.courses : [];
    courses.forEach((course, index) => {
        const quarter = ['Fall', 'Winter', 'Spring'].includes(course?.quarter) ? course.quarter : null;
        if (!quarter) return;

        const code = String(course?.courseCode || '').trim();
        const workloadCredits = Number.isFinite(Number(course?.workloadCredits))
            ? Number(course.workloadCredits)
            : Number(course?.credits) || 0;

        if (isAppliedLearningCode(code) || course?.type === 'applied-learning') {
            appliedTotals[quarter].credits += workloadCredits;
            appliedTotals[quarter].count += 1;
            if (code) appliedTotals[quarter].codes.add(code);
            return;
        }

        quarters[quarter].push({
            label: code || 'DESN',
            note: course?.section ? `Sec ${course.section}` : '',
            credits: roundToTenths(workloadCredits || course?.credits || 0),
            sortOrder: index
        });
    });

    ['Fall', 'Winter', 'Spring'].forEach((quarter) => {
        const applied = appliedTotals[quarter];
        if (applied.credits > 0) {
            const codeList = Array.from(applied.codes).sort().join('/');
            quarters[quarter].push({
                label: 'DESN X95/99',
                note: codeList || 'Applied learning',
                credits: roundToTenths(applied.credits),
                sortOrder: 10_000
            });
        }
        quarters[quarter] = sortQuarterRows(quarters[quarter]);
        if (quarters[quarter].length > 6) {
            throw new Error(`${quarter} has ${quarters[quarter].length} workload rows after aggregation (template supports 6).`);
        }
        while (quarters[quarter].length < 6) {
            quarters[quarter].push({ label: '', note: '', credits: null, sortOrder: 99_999 });
        }
    });

    return quarters;
}

function inferFacultyWorkloadExportRole(record) {
    const role = String(record?.ayRole || record?.rank || '').trim();
    if (role) {
        if (record?.specialRole) return `${role} (${record.specialRole})`;
        return role;
    }
    if (record?.category === 'adjunct') return 'Adjunct';
    return 'Faculty';
}

function isLecturerLikeRole(record) {
    const role = String(record?.ayRole || record?.rank || '').toLowerCase();
    return role.includes('lecturer');
}

async function ensureExcelJsLoaded() {
    if (typeof window.ExcelJS !== 'undefined') {
        return window.ExcelJS;
    }
    if (excelJsLoadPromise) {
        return excelJsLoadPromise;
    }

    excelJsLoadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-exceljs="workload-export"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.ExcelJS));
            existing.addEventListener('error', () => reject(new Error('Failed to load ExcelJS library.')));
            return;
        }

        const script = document.createElement('script');
        script.src = WORKLOAD_EXPORT_EXCELJS_URL;
        script.async = true;
        script.dataset.exceljs = 'workload-export';
        script.onload = () => {
            if (typeof window.ExcelJS === 'undefined') {
                reject(new Error('ExcelJS loaded but global object was not available.'));
                return;
            }
            resolve(window.ExcelJS);
        };
        script.onerror = () => reject(new Error('Failed to load ExcelJS library from CDN.'));
        document.head.appendChild(script);
    }).finally(() => {
        // Allow retry after a failed load.
        if (typeof window.ExcelJS === 'undefined') {
            excelJsLoadPromise = null;
        }
    });

    return excelJsLoadPromise;
}

function getFacultyRecordForExport(facultyName) {
    const all = currentYearData?.all || {};
    return all?.[facultyName] || null;
}

function getQuarterColumnMap() {
    return {
        Fall: { course: 'B', note: 'C', credits: 'D' },
        Winter: { course: 'E', note: 'F', credits: 'G' },
        Spring: { course: 'H', note: 'I', credits: 'J' }
    };
}

function applyQuarterRowsToWorksheet(ws, quarterRowsByQuarter) {
    const colMap = getQuarterColumnMap();
    ['Fall', 'Winter', 'Spring'].forEach((quarter) => {
        const rows = quarterRowsByQuarter[quarter] || [];
        const cols = colMap[quarter];
        for (let i = 0; i < 6; i += 1) {
            const sheetRow = i + 2;
            const rowData = rows[i] || { label: '', note: '', credits: null };
            const hasCreditValue = rowData.credits !== null
                && rowData.credits !== undefined
                && rowData.credits !== ''
                && Number.isFinite(Number(rowData.credits));
            ws.getCell(`${cols.course}${sheetRow}`).value = rowData.label || null;
            ws.getCell(`${cols.note}${sheetRow}`).value = rowData.note || null;
            ws.getCell(`${cols.credits}${sheetRow}`).value = hasCreditValue ? Number(rowData.credits) : null;
        }
    });
}

function applyWorkloadSummaryAssumptions(ws, facultyRecord, quarterRowsByQuarter) {
    const expectedTeaching = Number.isFinite(Number(facultyRecord?.ayNetTargetCredits))
        ? Number(facultyRecord.ayNetTargetCredits)
        : (Number.isFinite(Number(facultyRecord?.maxWorkload)) ? Number(facultyRecord.maxWorkload) : 0);
    const explicitRelease = Number.isFinite(Number(facultyRecord?.ayReleaseCredits))
        ? Number(facultyRecord.ayReleaseCredits)
        : 0;

    const assignedTeaching = ['Fall', 'Winter', 'Spring']
        .flatMap((quarter) => quarterRowsByQuarter[quarter] || [])
        .reduce((sum, row) => sum + (Number(row?.credits) || 0), 0);

    const impliedReleaseShortfall = Math.max(0, expectedTeaching - assignedTeaching);
    const assignedRelease = roundToTenths(Math.max(explicitRelease, impliedReleaseShortfall));

    ws.getCell('P2').value = roundToTenths(expectedTeaching);
    ws.getCell('P8').value = roundToTenths(explicitRelease);
    ws.getCell('O8').value = assignedRelease;

    if (isLecturerLikeRole(facultyRecord)) {
        ['O4', 'P4', 'O6', 'P6'].forEach((cell) => {
            ws.getCell(cell).value = 0;
        });
    }
}

function buildWorkloadExportFilename(facultyName, academicYear) {
    const { compact } = getAcademicYearYears(academicYear);
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const templateName = getTemplateFacultyName(facultyName)
        .replace(/\s+/g, '')
        .replace(/[^A-Za-z]/g, '') || 'Faculty';
    return `${templateName}_Wkld_${compact}_${y}${m}${d}.xlsx`;
}

function triggerBlobDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function exportFacultyWorkloadSheet(facultyName) {
    try {
        if (!currentFilters.year || currentFilters.year === 'all') {
            alert('Select a single academic year before exporting a workload sheet.');
            return;
        }

        const facultyRecord = getFacultyRecordForExport(facultyName);
        if (!facultyRecord) {
            alert(`Could not find workload data for ${facultyName} in AY ${currentFilters.year}.`);
            return;
        }

        const quarterRowsByQuarter = buildQuarterExportRows(facultyRecord);
        const ExcelJS = await ensureExcelJsLoaded();

        const templateResponse = await fetch(WORKLOAD_EXPORT_TEMPLATE_PATH, { cache: 'no-store' });
        if (!templateResponse.ok) {
            throw new Error(`Template workbook not found (${templateResponse.status}).`);
        }

        const templateBuffer = await templateResponse.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(templateBuffer);

        const ws = workbook.getWorksheet(WORKLOAD_EXPORT_TEMPLATE_SHEET) || workbook.worksheets?.[0];
        if (!ws) {
            throw new Error('Template worksheet not found.');
        }

        const years = getAcademicYearYears(currentFilters.year);
        ws.getCell('A1').value = inferFacultyWorkloadExportRole(facultyRecord);
        ws.getCell('A2').value = getTemplateFacultyName(facultyName);
        ws.getCell('B1').value = `Fall Quarter, ${years.startYear}`;
        ws.getCell('E1').value = `Winter Quarter, ${years.endYear}`;
        ws.getCell('H1').value = `Spring Quarter, ${years.endYear}`;

        applyQuarterRowsToWorksheet(ws, quarterRowsByQuarter);
        applyWorkloadSummaryAssumptions(ws, facultyRecord, quarterRowsByQuarter);

        const fileBuffer = await workbook.xlsx.writeBuffer();
        const filename = buildWorkloadExportFilename(facultyName, currentFilters.year);
        triggerBlobDownload(
            new Blob([fileBuffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }),
            filename
        );

        console.log(`📤 Exported workload sheet for ${facultyName}: ${filename}`);
    } catch (error) {
        console.error('Workload export failed:', error);
        alert(`Workload export failed: ${error.message}`);
    }
}

// Initialize dashboard when page loads
window.addEventListener('load', initDashboard);


// ============================================
// INLINE EDITING FUNCTIONS
// ============================================

/**
 * Open faculty edit modal
 */
function openFacultyEditModal(facultyName) {
    const modal = document.getElementById('facultyEditModal');
    const titleEl = document.getElementById('editModalTitle');
    const hiddenInput = document.getElementById('editFacultyName');

    titleEl.textContent = `Edit Courses - ${facultyName}`;
    hiddenInput.value = facultyName;

    // Populate current courses
    renderCurrentCourses(facultyName);

    // Populate add course dropdown
    populateAddCourseDropdown();

    modal.classList.add('active');
}

/**
 * Close faculty edit modal
 */
function closeFacultyEditModal() {
    const modal = document.getElementById('facultyEditModal');
    modal.classList.remove('active');
    document.getElementById('newCourseDetails').style.display = 'none';
}

/**
 * Render current courses for faculty in modal
 */
function renderCurrentCourses(facultyName) {
    const container = document.getElementById('currentCoursesList');

    // Get faculty's courses from ScheduleManager
    let courses = [];
    if (typeof ScheduleManager !== 'undefined') {
        courses = ScheduleManager.getFacultySchedule(facultyName, currentFilters.year);
    }

    // If no ScheduleManager data, fall back to workload data
    if (courses.length === 0 && currentYearData) {
        const facultyData = currentYearData.all?.[facultyName];
        if (facultyData && facultyData.courses) {
            courses = facultyData.courses.map(c => ({
                id: c.courseCode + '-' + (c.section || '001'),
                courseCode: c.courseCode,
                section: c.section || '001',
                credits: c.credits,
                quarter: c.quarter || 'Fall'
            }));
        }
    }

    if (courses.length === 0) {
        container.innerHTML = '<div style="color: #6b7280; text-align: center; padding: 20px;">No courses assigned</div>';
        return;
    }

    container.innerHTML = courses.map(course => `
        <div class="course-edit-item" data-course-id="${course.id}">
            <div class="course-edit-info">
                <span class="course-edit-code">${course.courseCode}</span>
                <span class="course-edit-credits">${course.credits} cr - ${course.quarter}</span>
            </div>
            <button type="button" class="btn-remove-course" onclick="removeCourseFromFaculty('${course.id}')" title="Remove">×</button>
        </div>
    `).join('');
}

/**
 * Populate add course dropdown
 */
function populateAddCourseDropdown() {
    const select = document.getElementById('addCourseSelect');
    select.innerHTML = '<option value="">Select a course to add...</option>';

    if (typeof ScheduleManager !== 'undefined') {
        const catalog = ScheduleManager.getCourseCatalog();
        catalog.forEach(course => {
            const option = document.createElement('option');
            option.value = course.code;
            option.textContent = `${course.code} - ${course.title} (${course.defaultCredits} cr)`;
            option.dataset.credits = course.defaultCredits;
            select.appendChild(option);
        });
    }

    // Show/hide new course details when selection changes
    select.addEventListener('change', function() {
        const detailsDiv = document.getElementById('newCourseDetails');
        if (this.value) {
            detailsDiv.style.display = 'block';
            const selectedOption = this.options[this.selectedIndex];
            document.getElementById('newCourseCredits').value = selectedOption.dataset.credits || 5;
            document.getElementById('newCourseSection').value = '001';
        } else {
            detailsDiv.style.display = 'none';
        }
    });
}

/**
 * Add course to faculty
 */
function addCourseToFaculty() {
    const facultyName = document.getElementById('editFacultyName').value;
    const courseCode = document.getElementById('addCourseSelect').value;
    const section = document.getElementById('newCourseSection').value || '001';
    const credits = parseInt(document.getElementById('newCourseCredits').value) || 5;

    if (!courseCode) {
        alert('Please select a course');
        return;
    }

    if (typeof ScheduleManager !== 'undefined') {
        // Add to Fall quarter by default (can be changed in full editor)
        const result = ScheduleManager.addCourseAssignment(currentFilters.year, 'Fall', {
            courseCode,
            section,
            credits,
            assignedFaculty: facultyName
        });

        if (result.success) {
            renderCurrentCourses(facultyName);
            document.getElementById('addCourseSelect').value = '';
            document.getElementById('newCourseDetails').style.display = 'none';
            refreshDashboard();
        } else {
            alert('Error adding course: ' + result.errors.join(', '));
        }
    } else {
        alert('Schedule Manager not available. Use the full Schedule Editor.');
    }
}

/**
 * Remove course from faculty
 */
function removeCourseFromFaculty(courseId) {
    const facultyName = document.getElementById('editFacultyName').value;

    if (typeof ScheduleManager !== 'undefined') {
        // Try to find and remove from each quarter
        ['Fall', 'Winter', 'Spring', 'Summer'].forEach(quarter => {
            ScheduleManager.unassignFromFaculty(currentFilters.year, quarter, courseId);
        });

        renderCurrentCourses(facultyName);
        refreshDashboard();
    }
}

/**
 * Open schedule editor page
 */
function openScheduleEditor() {
    window.location.href = 'schedule-editor.html';
}
