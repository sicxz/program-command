/**
 * Faculty workload dashboard
 * Handles data loading, filtering, and visualization.
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
let jsZipLoadPromise = null;
let workloadExportTemplateBufferPromise = null;

const WORKLOAD_EXPORT_TEMPLATE_PATH = '../docs/examples/workload/MasingaleT_Wkld_2526_20May2025.xlsx';
const WORKLOAD_EXPORT_TEMPLATE_SHEET = 'Sheet1';
const WORKLOAD_EXPORT_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const WORKLOAD_EXPORT_JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const WORKLOAD_PLAN_STORAGE_KEY = 'programCommandAySetup';
const WORKLOAD_PLAN_UI_STORAGE_KEY = 'programCommandAyPlanningUi';
const WORKLOAD_DETAIL_STORAGE_KEY = 'programCommandFacultyWorkloadDetails';
const CLSS_WORKLOAD_IMPORT_STORAGE_KEY = 'programCommandClssWorkloadImport';
let activeDepartmentProfile = null;
let SCHEDULE_STORAGE_PREFIX = 'designSchedulerData_';
let PRODUCTION_RESET_DEFAULT_SCHEDULE_YEAR = '2026-27';
let WORKLOAD_DASHBOARD_SUBTITLE_BASE = 'EWU Design Department - Academic Workload Analysis';
let WORKLOAD_DASHBOARD_TITLE = '👥 Faculty Workload Dashboard';
let WORKLOAD_PLAN_DEPARTMENT_LABEL = 'Design';
let WORKLOAD_PLAN_ROLE_OPTIONS = [
    'Full Professor',
    'Associate Professor',
    'Assistant Professor',
    'Tenure/Tenure-track',
    'Senior Lecturer',
    'Lecturer',
    'Adjunct',
    'Staff/Other'
];
let WORKLOAD_PLAN_ROLE_TARGET_DEFAULTS = {
    'Full Professor': 36,
    'Associate Professor': 36,
    'Assistant Professor': 36,
    'Tenure/Tenure-track': 36,
    'Senior Lecturer': 45,
    Lecturer: 45,
    Adjunct: 15
};
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
const WORKLOAD_PLAN_RELEASE_ALLOCATION_QUARTERS = ['Fall', 'Winter', 'Spring', 'Summer'];
let WORKLOAD_PLAN_RELEASE_ALLOCATION_PRESETS = [
    {
        id: 'chair',
        label: 'Chair',
        category: 'chair',
        defaultLabel: 'Chair',
        defaultQuarters: ['Fall', 'Winter', 'Spring']
    },
    {
        id: 'desn_499',
        label: 'DESN 499',
        category: 'independent_study',
        defaultLabel: 'DESN 499',
        defaultQuarters: ['Fall']
    },
    {
        id: 'desn_495',
        label: 'DESN 495',
        category: 'applied_learning',
        defaultLabel: 'DESN 495',
        defaultQuarters: ['Fall']
    },
    {
        id: 'university_service',
        label: 'University Service',
        category: 'committee',
        defaultLabel: 'University Service',
        defaultQuarters: ['Fall', 'Winter', 'Spring']
    },
    {
        id: 'advising',
        label: 'Advising',
        category: 'advising',
        defaultLabel: 'Advising',
        defaultQuarters: ['Fall', 'Winter', 'Spring']
    },
    {
        id: 'other',
        label: 'Other',
        category: 'other',
        defaultLabel: 'Other',
        defaultQuarters: ['Fall']
    }
];
let WORKLOAD_PLAN_RELEASE_CATEGORY_OPTIONS = [
    { id: 'chair', label: 'Chair Duties' },
    { id: 'independent_study', label: 'DESN 499 / Independent Study' },
    { id: 'applied_learning', label: 'DESN 495 / Applied Learning' },
    { id: 'committee', label: 'University Service / Committee Work' },
    { id: 'advising', label: 'Advising' },
    { id: 'research', label: 'Research / Grants' },
    { id: 'course_release', label: 'Course Release' },
    { id: 'sabbatical', label: 'Sabbatical' },
    { id: 'other', label: 'Other' }
];
const WORKLOAD_PLAN_SORT_OPTIONS = [
    { id: 'triage', label: 'Needs Plan / Status (Default)' },
    { id: 'role', label: 'Role / Rank' },
    { id: 'status', label: 'Status' },
    { id: 'name', label: 'Faculty Name' },
    { id: 'utilization', label: 'AY Utilization' },
    { id: 'gap', label: 'Gap' },
    { id: 'release', label: 'Release Credits' },
    { id: 'ay_total', label: 'AY Total Workload' }
];
const WORKLOAD_PLAN_GROUP_OPTIONS = [
    { id: 'none', label: 'No Grouping' },
    { id: 'role', label: 'Group by Role' },
    { id: 'status', label: 'Group by Status' },
    { id: 'chair', label: 'Group Chairs First' }
];

function getWorkloadIntegrationApi() {
    return typeof WorkloadIntegration !== 'undefined' ? WorkloadIntegration : null;
}

function getAppliedLearningCoursesForDashboard() {
    const integration = getWorkloadIntegrationApi();
    if (integration?.getAppliedLearningCourses) {
        const rows = integration.getAppliedLearningCourses();
        return Array.isArray(rows) ? rows : [];
    }
    return [];
}

function getAppliedLearningSummaryConfig() {
    const configured = getAppliedLearningCoursesForDashboard()
        .map((entry) => ({
            code: String(entry?.code || '').trim(),
            title: String(entry?.title || entry?.code || '').trim(),
            rate: Number(entry?.rate) || 0
        }))
        .filter((entry) => entry.code);

    if (configured.length > 0) {
        return configured;
    }

    return [
        { code: 'DESN 399', title: 'Independent Study', rate: 0.2 },
        { code: 'DESN 491', title: 'Senior Project', rate: 0.2 },
        { code: 'DESN 499', title: 'Independent Study', rate: 0.2 },
        { code: 'DESN 495', title: 'Internship', rate: 0.1 }
    ];
}
const workloadPlanningUiState = {
    modalOpen: false,
    editingRecordId: null,
    editingFacultyName: '',
    statusMessage: '',
    statusLevel: 'info',
    sortKey: 'triage',
    sortDirection: 'asc',
    groupBy: 'none',
    modalReleaseAllocations: [],
    lockStateByYear: {},
    lastScheduleRefreshDiffByYear: {}
};

// Chart instances
let charts = {};

function getDepartmentIdentity() {
    const identity = activeDepartmentProfile && activeDepartmentProfile.identity
        ? activeDepartmentProfile.identity
        : {};
    return {
        name: String(identity.name || 'Design').trim() || 'Design',
        code: String(identity.code || 'DESN').trim().toUpperCase() || 'DESN',
        displayName: String(identity.displayName || identity.name || 'EWU Design').trim() || 'EWU Design'
    };
}

function applyDepartmentProfileToDashboardHeader() {
    const identity = getDepartmentIdentity();
    WORKLOAD_PLAN_DEPARTMENT_LABEL = identity.name;
    const titleEl = document.getElementById('workloadDashboardTitle');
    const subtitleEl = document.getElementById('workloadDashboardSubtitle');
    if (titleEl) {
        titleEl.textContent = WORKLOAD_DASHBOARD_TITLE;
    }
    if (subtitleEl) {
        subtitleEl.textContent = WORKLOAD_DASHBOARD_SUBTITLE_BASE;
    }
    updateProductionResetButton();
}

function updateProductionResetButton() {
    const label = document.getElementById('productionResetYearLabel');
    if (label) {
        label.textContent = PRODUCTION_RESET_DEFAULT_SCHEDULE_YEAR;
    }
}

async function initializeDepartmentProfileContext() {
    const manager = window.DepartmentProfileManager;
    if (!manager || typeof manager.initialize !== 'function') {
        applyDepartmentProfileToDashboardHeader();
        return null;
    }

    try {
        const snapshot = await manager.initialize();
        activeDepartmentProfile = snapshot && snapshot.profile ? snapshot.profile : null;
        const profileScheduler = activeDepartmentProfile && activeDepartmentProfile.scheduler
            ? activeDepartmentProfile.scheduler
            : {};
        const profileWorkload = activeDepartmentProfile && activeDepartmentProfile.workload
            ? activeDepartmentProfile.workload
            : {};

        if (profileScheduler.storageKeyPrefix) {
            SCHEDULE_STORAGE_PREFIX = String(profileScheduler.storageKeyPrefix);
        }
        if (profileWorkload.productionResetDefaultScheduleYear) {
            PRODUCTION_RESET_DEFAULT_SCHEDULE_YEAR = String(profileWorkload.productionResetDefaultScheduleYear);
        }
        if (profileWorkload.dashboardSubtitleBase) {
            WORKLOAD_DASHBOARD_SUBTITLE_BASE = String(profileWorkload.dashboardSubtitleBase);
        } else {
            const identity = getDepartmentIdentity();
            WORKLOAD_DASHBOARD_SUBTITLE_BASE = `${identity.displayName} Department - Academic Workload Analysis`;
        }
        if (profileWorkload.defaultAnnualTargets
            && typeof profileWorkload.defaultAnnualTargets === 'object'
            && !Array.isArray(profileWorkload.defaultAnnualTargets)
        ) {
            WORKLOAD_PLAN_ROLE_TARGET_DEFAULTS = {
                ...WORKLOAD_PLAN_ROLE_TARGET_DEFAULTS,
                ...profileWorkload.defaultAnnualTargets
            };
        }
        if (Array.isArray(profileWorkload.roleOptions) && profileWorkload.roleOptions.length > 0) {
            WORKLOAD_PLAN_ROLE_OPTIONS = profileWorkload.roleOptions
                .map((value) => String(value || '').trim())
                .filter(Boolean);
        }
        if (Array.isArray(profileWorkload.releaseAllocationPresets) && profileWorkload.releaseAllocationPresets.length > 0) {
            WORKLOAD_PLAN_RELEASE_ALLOCATION_PRESETS = profileWorkload.releaseAllocationPresets
                .map((preset, index) => {
                    if (!preset || typeof preset !== 'object') return null;
                    const id = String(preset.id || `preset_${index}`).trim();
                    const label = String(preset.label || preset.defaultLabel || '').trim();
                    if (!id || !label) return null;
                    const defaultQuarters = Array.isArray(preset.defaultQuarters)
                        ? preset.defaultQuarters.map((value) => String(value || '').trim()).filter(Boolean)
                        : ['Fall'];
                    return {
                        id,
                        label,
                        category: String(preset.category || 'other').trim() || 'other',
                        defaultLabel: String(preset.defaultLabel || label).trim() || label,
                        defaultQuarters
                    };
                })
                .filter(Boolean);
        }
        if (Array.isArray(profileWorkload.releaseCategoryOptions) && profileWorkload.releaseCategoryOptions.length > 0) {
            WORKLOAD_PLAN_RELEASE_CATEGORY_OPTIONS = profileWorkload.releaseCategoryOptions
                .map((option) => {
                    if (!option || typeof option !== 'object') return null;
                    const id = String(option.id || '').trim();
                    const label = String(option.label || '').trim();
                    if (!id || !label) return null;
                    return { id, label };
                })
                .filter(Boolean);
        }
        if (profileWorkload.dashboardTitle) {
            WORKLOAD_DASHBOARD_TITLE = String(profileWorkload.dashboardTitle);
        }

        const identity = getDepartmentIdentity();
        WORKLOAD_PLAN_DEPARTMENT_LABEL = identity.name;
        document.title = `${WORKLOAD_DASHBOARD_TITLE.replace(/^👥\s*/, '')} - ${identity.displayName}`;
        applyDepartmentProfileToDashboardHeader();

        if (Array.isArray(snapshot && snapshot.warnings) && snapshot.warnings.length) {
            console.warn('Department profile warnings:', snapshot.warnings);
        }
        return activeDepartmentProfile;
    } catch (error) {
        console.warn('Could not initialize department profile on workload dashboard:', error);
        applyDepartmentProfileToDashboardHeader();
        return null;
    }
}

function refreshWorkloadDashboardAfterProductionReset() {
    try {
        augmentYearFilterOptions();
    } catch (error) {
        console.warn('Could not refresh year options after production reset:', error);
    }

    if (!workloadData) return;

    const year = currentFilters.year || 'all';
    currentYearData = loadIntegratedYearData(year);
    if (currentYearData) {
        updateYearSubtitle(year, WORKLOAD_DASHBOARD_SUBTITLE_BASE);
        updateWorkloadSubtitleForYear(currentYearData);
        refreshDashboard();
    }
}

function clearAllProductionWorkloads() {
    const keysToRemove = [
        WORKLOAD_PLAN_STORAGE_KEY,
        WORKLOAD_PLAN_UI_STORAGE_KEY,
        WORKLOAD_DETAIL_STORAGE_KEY,
        CLSS_WORKLOAD_IMPORT_STORAGE_KEY
    ];
    const scheduleKeysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SCHEDULE_STORAGE_PREFIX)) {
            scheduleKeysToRemove.push(key);
        }
    }

    const summary = [
        'Clear ALL locally stored workload data for production cleanup?',
        '',
        'This removes local browser data for:',
        '• AY workload planning store',
        '• workload planning UI preferences',
        '• faculty workload detail entries',
        '• staged CLSS workload import payload',
        `• all scheduler draft years (${scheduleKeysToRemove.length} key${scheduleKeysToRemove.length === 1 ? '' : 's'})`,
        '',
        'This DOES NOT clear release time allocations.',
        '',
        'Type OK in the next confirmation only if you want to continue.'
    ].join('\n');

    if (!window.confirm(summary)) {
        return;
    }

    const typed = window.prompt('Confirm workload reset by typing: CLEAR WORKLOADS');
    if (typed !== 'CLEAR WORKLOADS') {
        alert('Workload reset canceled. Confirmation text did not match.');
        return;
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    scheduleKeysToRemove.forEach((key) => localStorage.removeItem(key));

    // Reset in-memory planning UI state so the page reflects storage deletion without a reload.
    workloadPlanningUiState.lockStateByYear = {};
    workloadPlanningUiState.lastScheduleRefreshDiffByYear = {};
    workloadPlanningUiState.statusMessage = '';
    workloadPlanningUiState.statusLevel = 'info';

    refreshWorkloadDashboardAfterProductionReset();
    alert(`Production reset complete: workload data and ${scheduleKeysToRemove.length} scheduler year key${scheduleKeysToRemove.length === 1 ? '' : 's'} cleared.`);
}

function clearProductionScheduleYear(year = PRODUCTION_RESET_DEFAULT_SCHEDULE_YEAR) {
    const normalizedYear = String(year || '').trim();
    if (!/^\d{4}-\d{2}$/.test(normalizedYear)) {
        alert('Invalid academic year format for schedule reset.');
        return;
    }

    const storageKey = `${SCHEDULE_STORAGE_PREFIX}${normalizedYear}`;
    const promptLabel = `CLEAR SCHEDULE ${normalizedYear}`;
    const summary = [
        `Clear scheduler data for AY ${normalizedYear}?`,
        '',
        `This removes localStorage key: ${storageKey}`,
        'Only the scheduler draft for that academic year will be cleared.',
        'Workload planning/detail data is not changed by this button.'
    ].join('\n');

    if (!window.confirm(summary)) {
        return;
    }

    const typed = window.prompt(`Confirm scheduler reset by typing: ${promptLabel}`);
    if (typed !== promptLabel) {
        alert('Scheduler reset canceled. Confirmation text did not match.');
        return;
    }

    localStorage.removeItem(storageKey);
    refreshWorkloadDashboardAfterProductionReset();
    alert(`Scheduler AY ${normalizedYear} cleared from local browser storage.`);
}

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
            padding: 16px;
            border-radius: 12px;
            border: 1px solid #d0d7de;
            background: #ffffff;
            color: #24292f;
            box-shadow: 0 1px 0 rgba(27, 31, 36, 0.04);
        }
        .prelim-workload-notice[hidden] {
            display: none !important;
        }
        .prelim-workload-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 12px;
        }
        .prelim-workload-eyebrow-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
            margin-bottom: 6px;
        }
        .prelim-workload-label {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid #d0d7de;
            background: #f6f8fa;
            color: #57606a;
            font-size: 0.75rem;
            font-weight: 600;
            line-height: 1;
            padding: 5px 10px;
        }
        .prelim-workload-state {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid transparent;
            font-size: 0.75rem;
            font-weight: 600;
            line-height: 1;
            padding: 5px 10px;
        }
        .prelim-workload-state.warn {
            color: #9a6700;
            border-color: #d4a72c;
            background: #fff8c5;
        }
        .prelim-workload-state.info {
            color: #0969da;
            border-color: #54aeff;
            background: #ddf4ff;
        }
        .prelim-workload-state.success {
            color: #1a7f37;
            border-color: #4ac26b;
            background: #dafbe1;
        }
        .prelim-workload-notice h3 {
            margin: 0;
            font-size: 1.05rem;
            line-height: 1.3;
            color: #24292f;
            letter-spacing: -0.01em;
        }
        .prelim-workload-lead {
            margin: 6px 0 0;
            font-size: 0.88rem;
            line-height: 1.45;
            color: #57606a;
            max-width: 72ch;
        }
        .prelim-workload-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
            min-width: 0;
        }
        .prelim-workload-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            min-height: 32px;
            padding: 0 12px;
            border-radius: 8px;
            border: 1px solid #d0d7de;
            background: #f6f8fa;
            color: #24292f;
            font-size: 0.82rem;
            font-weight: 600;
            text-decoration: none;
            white-space: nowrap;
        }
        .prelim-workload-action-btn:hover {
            background: #eef2f6;
            border-color: #afb8c1;
        }
        .prelim-workload-action-btn.primary {
            background: #0969da;
            border-color: #0969da;
            color: #ffffff;
        }
        .prelim-workload-action-btn.primary:hover {
            background: #0860ca;
            border-color: #0860ca;
        }
        .prelim-workload-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
            margin-bottom: 12px;
        }
        .prelim-workload-stat {
            background: #f6f8fa;
            border: 1px solid #d8dee4;
            border-radius: 8px;
            padding: 10px;
        }
        .prelim-workload-stat-label {
            display: block;
            font-size: 0.74rem;
            color: #57606a;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            font-weight: 600;
        }
        .prelim-workload-stat-value {
            display: block;
            font-size: 1.05rem;
            font-weight: 700;
            color: #24292f;
            line-height: 1.2;
        }
        .prelim-workload-stat-meta {
            display: block;
            margin-top: 3px;
            font-size: 0.72rem;
            color: #656d76;
        }
        .prelim-workload-banner {
            margin: 8px 0 0;
            border-radius: 8px;
            border: 1px solid #d8dee4;
            background: #f6f8fa;
            color: #24292f;
            padding: 9px 10px;
            font-size: 0.84rem;
            line-height: 1.4;
        }
        .prelim-workload-banner strong {
            color: inherit;
        }
        .prelim-workload-banner.warn {
            background: #fff8c5;
            border-color: #d4a72c;
            color: #7d4e00;
        }
        .prelim-workload-banner.info {
            background: #ddf4ff;
            border-color: #54aeff;
            color: #0550ae;
        }
        .prelim-workload-stack {
            display: grid;
            gap: 8px;
            margin-top: 10px;
        }
        .prelim-workload-note {
            margin: 0;
            font-size: 0.84rem;
            color: #57606a;
            line-height: 1.45;
        }
        .prelim-workload-details {
            margin: 0;
            border: 1px solid #d8dee4;
            border-radius: 8px;
            background: #ffffff;
        }
        .prelim-workload-details > summary {
            cursor: pointer;
            list-style: none;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            font-weight: 600;
            font-size: 0.83rem;
            color: #24292f;
        }
        .prelim-workload-details > summary::-webkit-details-marker {
            display: none;
        }
        .prelim-workload-details > summary::before {
            content: "▸";
            color: #57606a;
            transition: transform 120ms ease;
        }
        .prelim-workload-details[open] > summary::before {
            transform: rotate(90deg);
        }
        .prelim-workload-details-body {
            border-top: 1px solid #eaeef2;
            padding: 8px 12px 10px;
        }
        .prelim-workload-list {
            margin: 0 0 0 18px;
            padding: 0;
            color: #57606a;
            font-size: 0.82rem;
            line-height: 1.4;
        }
        .prelim-workload-list li {
            margin: 4px 0;
        }
        .prelim-workload-footnote {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #eaeef2;
            font-size: 0.78rem;
            color: #656d76;
            line-height: 1.45;
        }
        .prelim-workload-footnote strong {
            color: #24292f;
        }
        @media (max-width: 860px) {
            .prelim-workload-header {
                flex-direction: column;
            }
            .prelim-workload-actions {
                justify-content: flex-start;
            }
            .prelim-workload-action-btn {
                width: 100%;
                justify-content: center;
            }
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

    const base = `${WORKLOAD_DASHBOARD_SUBTITLE_BASE} · AY ${currentFilters.year}`;
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
    const assignedCoveragePercent = totalScheduleCount > 0
        ? Number(((assignedCount / totalScheduleCount) * 100).toFixed(1))
        : 0;

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

    const escapedUnresolvedQuarterText = escapeWorkloadPlanHtml(unresolvedQuarterText);
    const unresolvedPreviewHtml = unresolvedPreview.length
        ? unresolvedPreview.map((item) => `<li>${escapeWorkloadPlanHtml(item)}</li>`).join('')
        : '';
    const fallbackRuleListHtml = fallbackRules.length
        ? fallbackRules.map((rule) => {
            const matched = Array.isArray(rule.matchedFaculty) && rule.matchedFaculty.length
                ? ` (${rule.matchedFaculty.join(', ')})`
                : '';
            const text = `${rule.role} -> ${rule.netTargetCredits} target${rule.specialRole ? `, ${rule.specialRole}` : ''}${matched}`;
            return `<li>${escapeWorkloadPlanHtml(text)}</li>`;
        }).join('')
        : '';
    const assumptionListHtml = assumptionItems.length
        ? assumptionItems.map((item) => `<li>${escapeWorkloadPlanHtml(item)}</li>`).join('')
        : '';
    const unresolvedStateHtml = unresolvedCount > 0
        ? `<span class="prelim-workload-state warn">${unresolvedCount} unresolved section${unresolvedCount === 1 ? '' : 's'}</span>`
        : '<span class="prelim-workload-state success">No unresolved sections</span>';
    const fallbackStateHtml = fallbackRules.length
        ? `<span class="prelim-workload-state warn">${fallbackRules.length} fallback target rule${fallbackRules.length === 1 ? '' : 's'}</span>`
        : '<span class="prelim-workload-state info">No fallback target rules applied</span>';
    const unresolvedBannerHtml = unresolvedCount > 0
        ? `<div class="prelim-workload-banner warn"><strong>Unresolved sections are excluded from faculty totals.</strong>${escapedUnresolvedQuarterText ? ` ${escapedUnresolvedQuarterText}` : ''}</div>`
        : '';
    const fallbackBannerHtml = fallbackText
        ? `<div class="prelim-workload-banner info"><strong>Fallback target assumptions applied.</strong> Review AY Setup before treating utilization/gaps as final.</div>`
        : '';
    const unresolvedDetailsHtml = unresolvedPreview.length > 0
        ? `<details class="prelim-workload-details">
                <summary>Unresolved section examples (showing ${unresolvedPreview.length} of ${unresolvedCount})</summary>
                <div class="prelim-workload-details-body">
                    <ul class="prelim-workload-list">${unresolvedPreviewHtml}</ul>
                </div>
            </details>`
        : '';
    const fallbackDetailsHtml = fallbackRules.length
        ? `<details class="prelim-workload-details">
                <summary>Fallback target rules in use</summary>
                <div class="prelim-workload-details-body">
                    <ul class="prelim-workload-list">${fallbackRuleListHtml}</ul>
                </div>
            </details>`
        : '';
    const assumptionsDetailsHtml = assumptionItems.length
        ? `<details class="prelim-workload-details"${unresolvedCount === 0 ? ' open' : ''}>
                <summary>Preliminary workload assumptions</summary>
                <div class="prelim-workload-details-body">
                    <ul class="prelim-workload-list">${assumptionListHtml}</ul>
                </div>
            </details>`
        : '';
    const hasAppliedLearningRateAssumption = assumptionItems.some((item) => /workload multiplier|applied-learning/i.test(String(item || '')));
    const appliedLearningCourses = getAppliedLearningCoursesForDashboard();
    const appliedLearningRateText = appliedLearningCourses.length
        ? appliedLearningCourses
            .map((entry) => `${entry.code} (${formatWorkloadPlanNumber(entry.rate, 3)})`)
            .join(', ')
        : '';
    const appliedLearningRateNoteHtml = hasAppliedLearningRateAssumption || !appliedLearningRateText
        ? ''
        : `<p class="prelim-workload-note">Applied-learning workload multipliers: ${escapeWorkloadPlanHtml(appliedLearningRateText)}.</p>`;

    notice.innerHTML = `
        <div class="prelim-workload-header">
            <div>
                <div class="prelim-workload-eyebrow-row">
                    <span class="prelim-workload-label">Scheduler Draft</span>
                    ${unresolvedStateHtml}
                    ${fallbackStateHtml}
                </div>
                <h3>Preliminary Workload (Scheduler Draft)</h3>
                <p class="prelim-workload-lead">Teaching workload values below are derived from the current scheduler draft for AY ${escapeWorkloadPlanHtml(currentFilters.year)}. Non-teaching assigned time (release, service, advising, leave) should be finalized in AY workload planning before using the dashboard as a decision-ready workload report.</p>
            </div>
            <div class="prelim-workload-actions">
                <a class="prelim-workload-action-btn primary" href="academic-year-setup.html">Open AY Setup</a>
                <a class="prelim-workload-action-btn" href="release-time-dashboard.html">Open Release Time</a>
            </div>
        </div>
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
            <div class="prelim-workload-stat">
                <span class="prelim-workload-stat-label">Assigned Coverage</span>
                <span class="prelim-workload-stat-value">${formatWorkloadPlanNumber(assignedCoveragePercent)}%</span>
                <span class="prelim-workload-stat-meta">${assignedCount} of ${totalScheduleCount} sections assigned</span>
            </div>
        </div>
        ${unresolvedBannerHtml}
        ${fallbackBannerHtml}
        <div class="prelim-workload-stack">
            ${unresolvedDetailsHtml}
            ${fallbackDetailsHtml}
            ${assumptionsDetailsHtml}
            ${appliedLearningRateNoteHtml}
        </div>
        <p class="prelim-workload-footnote">Use AY Setup + Release Time dashboards to replace fallback assumptions with final targets/release allocations. Use the export button in each faculty row to produce an <strong>Export Workload Sheet (.xlsx)</strong> draft for review.</p>
    `;
}

function escapeWorkloadPlanHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatWorkloadPlanNumber(value, decimals = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    const fixed = Number(numeric.toFixed(decimals));
    return Number.isInteger(fixed) ? String(fixed) : String(fixed);
}

function normalizeWorkloadPlanNameKey(name) {
    const integration = getWorkloadIntegrationApi();
    if (integration?.normalizeNameKey) {
        return integration.normalizeNameKey(name);
    }

    const cleaned = String(name || '')
        .replace(/\u00a0/g, ' ')
        .trim()
        .replace(/^([A-Za-z])\.\s*(PAS|IND)([A-Za-z]{2,})$/i, '$1.$3')
        .replace(/^([A-Za-z])\s+(PAS|IND)\s+([A-Za-z]{2,})$/i, '$1.$3')
        .replace(/^([A-Za-z])\s+(PAS|IND)([A-Za-z]{2,})$/i, '$1.$3')
        .replace(/^([A-Za-z]+)\s+(PAS|IND)([A-Za-z]{2,})$/i, '$1 $3')
        .split(/\s+/)
        .map((token) => token.replace(/^(PAS|IND)([A-Za-z]{3,})$/i, '$2'))
        .join(' ')
        .trim();

    const compact = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
    return compact
        .replace(/^([a-z])(pas|ind)([a-z]{3,})$/, '$1$3')
        .replace(/^(pas|ind)([a-z]{3,})$/, '$2');
}

function cloneWorkloadPlanValue(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
}

function createWorkloadPlanUuid(prefix = 'id') {
    if (globalThis.crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readWorkloadPlanUiPreferences() {
    try {
        const raw = localStorage.getItem(WORKLOAD_PLAN_UI_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('Could not parse AY planning UI preferences:', error);
        return {};
    }
}

function writeWorkloadPlanUiPreferences() {
    const next = {
        sortKey: workloadPlanningUiState.sortKey,
        sortDirection: workloadPlanningUiState.sortDirection,
        groupBy: workloadPlanningUiState.groupBy,
        lockStateByYear: workloadPlanningUiState.lockStateByYear
    };
    localStorage.setItem(WORKLOAD_PLAN_UI_STORAGE_KEY, JSON.stringify(next));
}

function loadWorkloadPlanUiPreferences() {
    const prefs = readWorkloadPlanUiPreferences();
    const sortKey = String(prefs?.sortKey || '').trim();
    const sortDirection = String(prefs?.sortDirection || '').trim();
    const groupBy = String(prefs?.groupBy || '').trim();

    if (WORKLOAD_PLAN_SORT_OPTIONS.some((option) => option.id === sortKey)) {
        workloadPlanningUiState.sortKey = sortKey;
    }
    if (sortDirection === 'asc' || sortDirection === 'desc') {
        workloadPlanningUiState.sortDirection = sortDirection;
    }
    if (WORKLOAD_PLAN_GROUP_OPTIONS.some((option) => option.id === groupBy)) {
        workloadPlanningUiState.groupBy = groupBy;
    }
    if (prefs?.lockStateByYear && typeof prefs.lockStateByYear === 'object' && !Array.isArray(prefs.lockStateByYear)) {
        workloadPlanningUiState.lockStateByYear = { ...prefs.lockStateByYear };
    }
}

function isWorkloadPlanningLockedForYear(year = currentFilters.year) {
    const ay = String(year || '').trim();
    if (!ay || ay === 'all') return true;
    const explicit = workloadPlanningUiState.lockStateByYear[ay];
    // Secure-by-default for review: locked unless explicitly unlocked.
    return explicit !== false;
}

function setWorkloadPlanningLockedForYear(locked, year = currentFilters.year) {
    const ay = String(year || '').trim();
    if (!ay || ay === 'all') return;
    workloadPlanningUiState.lockStateByYear[ay] = Boolean(locked);
    writeWorkloadPlanUiPreferences();
}

function normalizeWorkloadPlanReleaseQuarter(value) {
    const normalized = String(value || '').trim();
    return WORKLOAD_PLAN_RELEASE_ALLOCATION_QUARTERS.includes(normalized) ? normalized : '';
}

function normalizeWorkloadPlanReleaseCategory(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return 'other';
    return WORKLOAD_PLAN_RELEASE_CATEGORY_OPTIONS.some((option) => option.id === normalized)
        ? normalized
        : 'other';
}

function getWorkloadPlanReleasePresetById(presetId) {
    return WORKLOAD_PLAN_RELEASE_ALLOCATION_PRESETS.find((preset) => preset.id === presetId) || null;
}

function getWorkloadPlanReleaseCategoryLabel(categoryId) {
    const option = WORKLOAD_PLAN_RELEASE_CATEGORY_OPTIONS.find((entry) => entry.id === categoryId);
    return option ? option.label : 'Other';
}

function sanitizeWorkloadPlanReleaseAllocation(allocation, index = 0) {
    if (!allocation || typeof allocation !== 'object') return null;
    const category = normalizeWorkloadPlanReleaseCategory(allocation.category);
    const credits = Number(allocation.credits);
    const numericCredits = Number.isFinite(credits) && credits >= 0 ? Number(credits.toFixed(2)) : 0;
    const quarters = Array.isArray(allocation.quarters)
        ? Array.from(new Set(allocation.quarters.map(normalizeWorkloadPlanReleaseQuarter).filter(Boolean)))
        : [];
    const label = String(allocation.label || '').trim() || getWorkloadPlanReleaseCategoryLabel(category);
    const description = String(allocation.description || allocation.notes || '').trim();
    const source = String(allocation.source || '').trim() || 'custom';

    return {
        id: String(allocation.id || createWorkloadPlanUuid(`release_${index}`)),
        category,
        label,
        credits: numericCredits,
        quarters,
        description,
        source,
        createdAt: allocation.createdAt || new Date().toISOString(),
        updatedAt: allocation.updatedAt || new Date().toISOString()
    };
}

function sanitizeWorkloadPlanReleaseAllocations(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((entry, index) => sanitizeWorkloadPlanReleaseAllocation(entry, index))
        .filter(Boolean);
}

function summarizeWorkloadPlanReleaseAllocations(allocations) {
    const rows = sanitizeWorkloadPlanReleaseAllocations(allocations);
    const perQuarter = Object.fromEntries(WORKLOAD_PLAN_RELEASE_ALLOCATION_QUARTERS.map((quarter) => [quarter, 0]));
    let annualTotal = 0;

    rows.forEach((row) => {
        const rowCredits = Number(row.credits) || 0;
        const rowQuarterCount = row.quarters.length || 0;
        annualTotal += rowCredits * rowQuarterCount;
        row.quarters.forEach((quarter) => {
            perQuarter[quarter] = Number(((perQuarter[quarter] || 0) + rowCredits).toFixed(2));
        });
    });

    return {
        rows,
        perQuarter,
        annualTotal: Number(annualTotal.toFixed(2))
    };
}

function getWorkloadPlanQuarterReleaseCredits(allocations, quarter) {
    const summary = summarizeWorkloadPlanReleaseAllocations(allocations);
    return Number(summary.perQuarter[quarter] || 0);
}

function inferQuarterUtilizationWithRelease(quarterWorkload, annualTargetCredits, quarterReleaseCredits, annualNetTargetFallback = 0) {
    const workload = Number(quarterWorkload) || 0;
    const annualTarget = Number(annualTargetCredits) || 0;
    const quarterRelease = Number(quarterReleaseCredits) || 0;

    if (annualTarget > 0) {
        const quarterTarget = Math.max(0, (annualTarget / 3) - quarterRelease);
        if (quarterTarget > 0) {
            return Number(((workload / quarterTarget) * 100).toFixed(1));
        }
    }

    return inferQuarterUtilization(workload, annualNetTargetFallback);
}

function buildWorkloadPlanReleaseAllocationFromPreset(presetId) {
    const preset = getWorkloadPlanReleasePresetById(presetId);
    const now = new Date().toISOString();
    if (!preset) {
        return {
            id: createWorkloadPlanUuid('release'),
            category: 'other',
            label: 'Other',
            credits: 0,
            quarters: ['Fall'],
            description: '',
            source: 'custom',
            createdAt: now,
            updatedAt: now
        };
    }

    return {
        id: createWorkloadPlanUuid(`release_${preset.id}`),
        category: preset.category,
        label: preset.defaultLabel || preset.label,
        credits: 0,
        quarters: [...(preset.defaultQuarters || ['Fall'])],
        description: '',
        source: 'preset',
        createdAt: now,
        updatedAt: now
    };
}

function validateWorkloadPlanReleaseAllocations(allocations) {
    const rows = sanitizeWorkloadPlanReleaseAllocations(allocations);
    const errors = [];

    rows.forEach((row, index) => {
        if ((Number(row.credits) || 0) > 0 && (!Array.isArray(row.quarters) || row.quarters.length === 0)) {
            errors.push(`Release allocation row ${index + 1} (${row.label || getWorkloadPlanReleaseCategoryLabel(row.category)}) has credits but no quarter selected.`);
        }
        if ((Number(row.credits) || 0) < 0) {
            errors.push(`Release allocation row ${index + 1} has a negative credit value.`);
        }
        if (!String(row.category || '').trim()) {
            errors.push(`Release allocation row ${index + 1} is missing a category.`);
        }
    });

    return { valid: errors.length === 0, errors, rows };
}

function parseWorkloadPlanStore() {
    try {
        const raw = localStorage.getItem(WORKLOAD_PLAN_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('Could not parse AY workload plan store:', error);
        return {};
    }
}

function writeWorkloadPlanStore(store) {
    localStorage.setItem(WORKLOAD_PLAN_STORAGE_KEY, JSON.stringify(store || {}));
}

function ensureWorkloadPlanYearRecord(store, academicYear) {
    if (!store[academicYear]) {
        store[academicYear] = {
            adjunctTargets: { fall: 0, winter: 0, spring: 0 },
            notes: '',
            faculty: [],
            updatedAt: new Date().toISOString()
        };
    }
    if (!Array.isArray(store[academicYear].faculty)) {
        store[academicYear].faculty = [];
    }
    if (!store[academicYear].adjunctTargets || typeof store[academicYear].adjunctTargets !== 'object') {
        store[academicYear].adjunctTargets = { fall: 0, winter: 0, spring: 0 };
    }
    return store[academicYear];
}

function createWorkloadPlanRecordId() {
    return createWorkloadPlanUuid('ayplan');
}

function getPreviousAcademicYearValue(year) {
    const match = String(year || '').match(/^(\d{4})-\d{2}$/);
    if (!match) return '';
    const start = Number(match[1]) - 1;
    return `${start}-${String(start + 1).slice(-2)}`;
}

function getWorkloadPlanRoleDefault(role, fallback = 36) {
    return Object.prototype.hasOwnProperty.call(WORKLOAD_PLAN_ROLE_TARGET_DEFAULTS, role)
        ? WORKLOAD_PLAN_ROLE_TARGET_DEFAULTS[role]
        : fallback;
}

function inferWorkloadPlanRoleFromFacultyRecord(record) {
    const role = String(record?.ayRole || record?.rank || '').trim();
    if (role) return role;
    if (record?.category === 'adjunct') return 'Adjunct';
    return 'Lecturer';
}

function isChairFromPlanRecord(planRecord, workloadRecord) {
    if (planRecord && typeof planRecord.isChair === 'boolean') return planRecord.isChair;
    const releaseReason = String(planRecord?.releaseReason || '').toLowerCase();
    if (releaseReason.includes('chair')) return true;
    return String(workloadRecord?.specialRole || '').toLowerCase() === 'chair';
}

function inferPlanRecordDefaults(facultyName, workloadRecord, existingPlanRecord = null) {
    const role = String(existingPlanRecord?.role || inferWorkloadPlanRoleFromFacultyRecord(workloadRecord)).trim() || 'Lecturer';
    const annualTargetCredits = Number(existingPlanRecord?.annualTargetCredits);
    const releaseAllocations = sanitizeWorkloadPlanReleaseAllocations(existingPlanRecord?.releaseAllocations);
    const allocationSummary = summarizeWorkloadPlanReleaseAllocations(releaseAllocations);
    const hasStructuredReleaseAllocations = allocationSummary.rows.length > 0;
    const releaseCredits = hasStructuredReleaseAllocations
        ? allocationSummary.annualTotal
        : Number(existingPlanRecord?.releaseCredits);
    const targetFallback = Number(workloadRecord?.ayTargetCredits) || Number(workloadRecord?.maxWorkload) || getWorkloadPlanRoleDefault(role, 36);
    const releaseFallback = Number(workloadRecord?.ayReleaseCredits) || 0;
    const target = Number.isFinite(annualTargetCredits) ? annualTargetCredits : targetFallback;
    const release = Number.isFinite(releaseCredits) ? releaseCredits : releaseFallback;
    const chair = isChairFromPlanRecord(existingPlanRecord, workloadRecord);

    return {
        id: existingPlanRecord?.id || '',
        name: String(existingPlanRecord?.name || facultyName || workloadRecord?.facultyName || '').trim(),
        role,
        ftePercent: Number(existingPlanRecord?.ftePercent ?? 100),
        annualTargetCredits: target,
        releaseCredits: release,
        releasePercent: target > 0 ? (release / target) * 100 : 0,
        releaseReason: String(existingPlanRecord?.releaseReason || (chair ? 'Chair' : '')).trim(),
        notes: String(existingPlanRecord?.notes || '').trim(),
        active: existingPlanRecord?.active !== false,
        isChair: chair,
        releaseAllocations: allocationSummary.rows
    };
}

function readCurrentYearPlanData(createIfMissing = false) {
    if (!currentFilters.year || currentFilters.year === 'all') {
        return { store: parseWorkloadPlanStore(), yearData: null };
    }
    const store = parseWorkloadPlanStore();
    const yearData = createIfMissing
        ? ensureWorkloadPlanYearRecord(store, currentFilters.year)
        : (store[currentFilters.year] || null);
    return { store, yearData };
}

function touchWorkloadPlanYear(yearData) {
    if (yearData && typeof yearData === 'object') {
        yearData.updatedAt = new Date().toISOString();
    }
}

function buildAyPlanRecordIndex(yearData) {
    const byId = new Map();
    const byNameKey = new Map();
    const faculty = Array.isArray(yearData?.faculty) ? yearData.faculty : [];
    faculty.forEach((record) => {
        if (record?.id) byId.set(String(record.id), record);
        const nameKey = normalizeWorkloadPlanNameKey(record?.name);
        if (nameKey && !byNameKey.has(nameKey)) {
            byNameKey.set(nameKey, record);
        }
    });
    return { byId, byNameKey };
}

function inferQuarterUtilization(quarterWorkload, netTargetCredits) {
    const net = Number(netTargetCredits) || 0;
    if (net <= 0) return 0;
    const quarterTarget = net / 3;
    if (quarterTarget <= 0) return 0;
    return Number(((Number(quarterWorkload) || 0) / quarterTarget * 100).toFixed(1));
}

function getPlanningGapLabel(gap) {
    const value = Number(gap) || 0;
    if (Math.abs(value) < 0.05) return 'Balanced';
    if (value > 0) return `${formatWorkloadPlanNumber(value)} under`;
    return `${formatWorkloadPlanNumber(Math.abs(value))} over`;
}

function getPlanningRowStatus(row) {
    if (!row.active) return 'inactive';
    if (!row.hasAyPlan) return 'needs-plan';
    if (row.ayUtilization > 100.5) return 'over';
    if (row.ayUtilization < 60) return 'under';
    return 'planned';
}

function getPlanningStatusBadgeLabel(status) {
    switch (status) {
        case 'inactive': return 'Inactive';
        case 'needs-plan': return 'Needs Plan';
        case 'over': return 'Over';
        case 'under': return 'Under';
        default: return 'Planned';
    }
}

function getPlanningStatusSortRank(status) {
    switch (status) {
        case 'needs-plan': return 0;
        case 'over': return 1;
        case 'under': return 2;
        case 'planned': return 3;
        case 'inactive': return 4;
        default: return 5;
    }
}

function getPlanningRoleSortValue(row) {
    return String(row?.role || '').trim().toLowerCase() || 'zzzz';
}

function getWorkloadPlanningSortComparable(row, sortKey) {
    switch (sortKey) {
        case 'role':
            return getPlanningRoleSortValue(row);
        case 'status':
            return getPlanningStatusSortRank(row?.status);
        case 'name':
            return String(row?.facultyName || '').toLowerCase();
        case 'utilization':
            return Number(row?.ayUtilization) || 0;
        case 'gap':
            return Number(row?.gap) || 0;
        case 'release':
            return Number(row?.release) || 0;
        case 'ay_total':
            return Number(row?.ayTotal) || 0;
        case 'triage':
        default:
            return getPlanningStatusSortRank(row?.status);
    }
}

function compareWorkloadPlanningRows(a, b) {
    const sortKey = workloadPlanningUiState.sortKey || 'triage';
    const sortDirection = workloadPlanningUiState.sortDirection === 'desc' ? -1 : 1;
    const groupBy = workloadPlanningUiState.groupBy || 'none';

    const comparePrimitive = (left, right) => {
        if (typeof left === 'number' && typeof right === 'number') {
            return left === right ? 0 : (left < right ? -1 : 1);
        }
        return String(left).localeCompare(String(right), undefined, { sensitivity: 'base' });
    };

    if (groupBy === 'chair') {
        const chairCompare = (a.chair === b.chair) ? 0 : (a.chair ? -1 : 1);
        if (chairCompare !== 0) return chairCompare;
    }

    if (groupBy === 'role') {
        const roleCompare = comparePrimitive(getPlanningRoleSortValue(a), getPlanningRoleSortValue(b));
        if (roleCompare !== 0) return roleCompare;
    } else if (groupBy === 'status') {
        const statusCompare = comparePrimitive(getPlanningStatusSortRank(a.status), getPlanningStatusSortRank(b.status));
        if (statusCompare !== 0) return statusCompare;
    }

    const aValue = getWorkloadPlanningSortComparable(a, sortKey);
    const bValue = getWorkloadPlanningSortComparable(b, sortKey);
    const primaryCompare = comparePrimitive(aValue, bValue);
    if (primaryCompare !== 0) return primaryCompare * sortDirection;

    if (sortKey !== 'status') {
        const statusCompare = comparePrimitive(getPlanningStatusSortRank(a.status), getPlanningStatusSortRank(b.status));
        if (statusCompare !== 0 && sortKey === 'triage') return statusCompare;
    }

    return String(a.facultyName || '').localeCompare(String(b.facultyName || ''), undefined, { sensitivity: 'base' });
}

function getWorkloadPlanningGroupLabel(row, groupBy) {
    if (!row || !groupBy || groupBy === 'none') return '';
    if (groupBy === 'role') return row.role || 'Unspecified Role';
    if (groupBy === 'status') return getPlanningStatusBadgeLabel(row.status);
    if (groupBy === 'chair') return row.chair ? 'Chairs' : 'Non-Chairs';
    return '';
}

function createWorkloadPlanningRowSnapshot(rows) {
    const byKey = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = normalizeWorkloadPlanNameKey(row?.facultyName);
        if (!key) return;
        byKey.set(key, {
            facultyName: String(row.facultyName || '').trim(),
            hasWorkloadRecord: Boolean(row.workloadRecord),
            fall: Number(row.fall) || 0,
            winter: Number(row.winter) || 0,
            spring: Number(row.spring) || 0,
            ayTotal: Number(row.ayTotal) || 0
        });
    });
    return byKey;
}

function buildWorkloadPlanningScheduleRefreshDiff(beforeRows, afterRows) {
    const before = createWorkloadPlanningRowSnapshot(beforeRows);
    const after = createWorkloadPlanningRowSnapshot(afterRows);
    const allKeys = new Set([...before.keys(), ...after.keys()]);
    const changesByKey = {};
    let added = 0;
    let removed = 0;
    let modified = 0;

    const hasMetricChange = (a, b) => {
        const epsilon = 0.01;
        return (
            Math.abs((Number(a.fall) || 0) - (Number(b.fall) || 0)) > epsilon ||
            Math.abs((Number(a.winter) || 0) - (Number(b.winter) || 0)) > epsilon ||
            Math.abs((Number(a.spring) || 0) - (Number(b.spring) || 0)) > epsilon ||
            Math.abs((Number(a.ayTotal) || 0) - (Number(b.ayTotal) || 0)) > epsilon ||
            Boolean(a.hasWorkloadRecord) !== Boolean(b.hasWorkloadRecord)
        );
    };

    allKeys.forEach((key) => {
        const prev = before.get(key);
        const next = after.get(key);
        if (!prev && next) {
            changesByKey[key] = {
                type: 'added',
                facultyName: next.facultyName,
                before: null,
                after: next
            };
            added += 1;
            return;
        }
        if (prev && !next) {
            changesByKey[key] = {
                type: 'removed',
                facultyName: prev.facultyName,
                before: prev,
                after: null
            };
            removed += 1;
            return;
        }
        if (!prev || !next) return;
        if (!hasMetricChange(prev, next)) return;

        let type = 'modified';
        if (prev.hasWorkloadRecord && !next.hasWorkloadRecord) {
            type = 'removed';
        } else if (!prev.hasWorkloadRecord && next.hasWorkloadRecord) {
            type = 'added';
        }

        changesByKey[key] = {
            type,
            facultyName: next.facultyName || prev.facultyName,
            before: prev,
            after: next
        };
        if (type === 'added') added += 1;
        else if (type === 'removed') removed += 1;
        else modified += 1;
    });

    return {
        generatedAt: new Date().toISOString(),
        totalChanged: added + removed + modified,
        added,
        removed,
        modified,
        changesByKey
    };
}

function getWorkloadPlanningRefreshDiffForYear(year = currentFilters.year) {
    const ay = String(year || '').trim();
    if (!ay || ay === 'all') return null;
    return workloadPlanningUiState.lastScheduleRefreshDiffByYear[ay] || null;
}

function clearWorkloadPlanningRefreshDiffForYear(year = currentFilters.year) {
    const ay = String(year || '').trim();
    if (!ay || ay === 'all') return;
    delete workloadPlanningUiState.lastScheduleRefreshDiffByYear[ay];
}

function getWorkloadPlanningRowChangeInfo(row, year = currentFilters.year) {
    const diff = getWorkloadPlanningRefreshDiffForYear(year);
    if (!diff?.changesByKey) return null;
    const key = normalizeWorkloadPlanNameKey(row?.facultyName);
    if (!key) return null;
    return diff.changesByKey[key] || null;
}

function ensureWorkloadPlanningStyles() {
    if (document.getElementById('workloadPlanningDashboardStyles')) return;
    const style = document.createElement('style');
    style.id = 'workloadPlanningDashboardStyles';
    style.textContent = `
        .workload-plan-panel {
            margin: 0 0 18px;
            padding: 16px;
            border-radius: 12px;
            border: 1px solid #d0d7de;
            background: #ffffff;
            box-shadow: 0 1px 0 rgba(27, 31, 36, 0.04);
        }
        .workload-plan-panel[hidden] { display: none !important; }
        .workload-plan-header {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 10px;
        }
        .workload-plan-header h3 {
            margin: 0;
            font-size: 1rem;
            line-height: 1.35;
            color: #24292f;
            letter-spacing: -0.01em;
        }
        .workload-plan-header p {
            margin: 4px 0 0;
            font-size: 0.84rem;
            line-height: 1.45;
            color: #57606a;
            max-width: 72ch;
        }
        .workload-plan-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .workload-plan-lock-indicator {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid rgba(15, 23, 42, 0.12);
            background: #ffffff;
            font-size: 0.75rem;
            color: #334155;
            font-weight: 600;
        }
        .workload-plan-lock-indicator.locked {
            color: #92400e;
            background: #fffbeb;
            border-color: #fde68a;
        }
        .workload-plan-lock-indicator.unlocked {
            color: #065f46;
            background: #ecfdf5;
            border-color: #a7f3d0;
        }
        .workload-plan-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin: 6px 0 10px;
            flex-wrap: wrap;
        }
        .workload-plan-sort-controls {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: flex-end;
        }
        .workload-plan-sort-controls label {
            display: grid;
            gap: 3px;
            font-size: 0.73rem;
            color: #57606a;
            font-weight: 600;
        }
        .workload-plan-sort-controls select {
            min-width: 150px;
            border: 1px solid #d0d7de;
            border-radius: 8px;
            background: #fff;
            color: #24292f;
            padding: 6px 8px;
            font-size: 0.8rem;
        }
        .workload-plan-btn {
            border: 1px solid #d0d7de;
            background: #f6f8fa;
            color: #24292f;
            border-radius: 8px;
            padding: 7px 10px;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
        }
        .workload-plan-btn.primary {
            background: #0969da;
            border-color: #0969da;
            color: #ffffff;
        }
        .workload-plan-btn:hover {
            background: #eef2f6;
            border-color: #afb8c1;
            filter: none;
        }
        .workload-plan-btn.primary:hover {
            background: #0860ca;
            border-color: #0860ca;
        }
        .workload-plan-btn:focus-visible,
        .workload-plan-row-btn:focus-visible {
            outline: 2px solid #0969da;
            outline-offset: 2px;
        }
        .workload-plan-btn[disabled],
        .workload-plan-row-btn[disabled] {
            opacity: 0.55;
            cursor: not-allowed;
            filter: none !important;
        }
        .workload-plan-btn.warn {
            background: #fff8c5;
            border-color: #d4a72c;
            color: #7d4e00;
        }
        .workload-plan-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 10px;
            margin: 8px 0 12px;
        }
        .workload-plan-summary-card {
            border-radius: 10px;
            border: 1px solid #d8dee4;
            background: #f6f8fa;
            padding: 10px;
        }
        .workload-plan-summary-card .label {
            font-size: 0.75rem;
            color: #656d76;
            display: block;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            font-weight: 600;
        }
        .workload-plan-summary-card .value {
            font-size: 1rem;
            font-weight: 700;
            color: #24292f;
        }
        .workload-plan-statusline {
            min-height: 0;
            margin: 4px 0 10px;
            font-size: 0.82rem;
            color: #57606a;
        }
        .workload-plan-statusline:empty {
            margin: 0;
        }
        .workload-plan-statusline:not(:empty) {
            padding: 9px 10px;
            border-radius: 8px;
            border: 1px solid #d8dee4;
            background: #f6f8fa;
        }
        .workload-plan-statusline.success {
            color: #1a7f37;
            border-color: #4ac26b;
            background: #dafbe1;
        }
        .workload-plan-statusline.warn {
            color: #7d4e00;
            border-color: #d4a72c;
            background: #fff8c5;
        }
        .workload-plan-refresh-summary {
            margin: 0 0 10px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid #54aeff;
            background: #ddf4ff;
            color: #0550ae;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
            font-size: 0.8rem;
        }
        .workload-plan-refresh-summary strong {
            color: #0550ae;
        }
        .workload-plan-table-wrap {
            overflow: auto;
            border: 1px solid #d8dee4;
            border-radius: 10px;
            background: #fff;
        }
        .workload-plan-table {
            width: 100%;
            min-width: 1320px;
            border-collapse: collapse;
            font-size: 0.84rem;
        }
        .workload-plan-table th,
        .workload-plan-table td {
            border-bottom: 1px solid rgba(15, 23, 42, 0.06);
            padding: 8px 10px;
            text-align: left;
            vertical-align: middle;
            white-space: nowrap;
        }
        .workload-plan-table thead th {
            position: sticky;
            top: 0;
            z-index: 1;
            background: #f6f8fa;
            color: #57606a;
            font-size: 0.76rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .workload-plan-table tbody tr:hover td {
            background-image: linear-gradient(rgba(9, 105, 218, 0.03), rgba(9, 105, 218, 0.03));
        }
        .workload-plan-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .workload-plan-table tr.workload-plan-group-row td {
            background: #f8fafc;
            color: #334155;
            font-weight: 700;
            font-size: 0.76rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            border-top: 1px solid rgba(15, 23, 42, 0.08);
            border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        }
        .workload-plan-table tr.workload-plan-row-changed td {
            background: rgba(219, 234, 254, 0.22);
        }
        .workload-plan-table tr.workload-plan-row-change-added td {
            background: rgba(220, 252, 231, 0.22);
        }
        .workload-plan-table tr.workload-plan-row-change-removed td {
            background: rgba(254, 242, 242, 0.22);
        }
        .workload-plan-table td.name {
            min-width: 180px;
        }
        .workload-plan-name-link {
            border: 0;
            padding: 0;
            margin: 0;
            background: transparent;
            color: #0f172a;
            font: inherit;
            font-weight: 700;
            text-align: left;
            cursor: pointer;
            line-height: 1.2;
        }
        .workload-plan-name-link:hover {
            color: #0969da;
            text-decoration: underline;
        }
        .workload-plan-sub {
            display: block;
            margin-top: 2px;
            color: #64748b;
            font-size: 0.72rem;
        }
        .workload-plan-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            border-radius: 999px;
            padding: 2px 8px;
            font-size: 0.72rem;
            font-weight: 600;
            border: 1px solid transparent;
        }
        .workload-plan-badge.planned {
            background: #ecfdf5;
            color: #065f46;
            border-color: #a7f3d0;
        }
        .workload-plan-badge.needs-plan {
            background: #fffbeb;
            color: #92400e;
            border-color: #fde68a;
        }
        .workload-plan-badge.over {
            background: #fef2f2;
            color: #991b1b;
            border-color: #fecaca;
        }
        .workload-plan-badge.under {
            background: #eff6ff;
            color: #1d4ed8;
            border-color: #bfdbfe;
        }
        .workload-plan-badge.inactive {
            background: #f1f5f9;
            color: #475569;
            border-color: #cbd5e1;
        }
        .workload-plan-change-tag {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            padding: 2px 8px;
            border: 1px solid transparent;
            font-size: 0.68rem;
            font-weight: 700;
            margin-top: 4px;
        }
        .workload-plan-change-tag.modified {
            background: #eff6ff;
            color: #1d4ed8;
            border-color: #bfdbfe;
        }
        .workload-plan-change-tag.added {
            background: #ecfdf5;
            color: #065f46;
            border-color: #a7f3d0;
        }
        .workload-plan-change-tag.removed {
            background: #fef2f2;
            color: #991b1b;
            border-color: #fecaca;
        }
        .workload-plan-row-actions {
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }
        .workload-plan-row-btn {
            border: 1px solid #d0d7de;
            background: #f6f8fa;
            color: #24292f;
            border-radius: 7px;
            padding: 5px 8px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
        }
        .workload-plan-row-btn.edit {
            background: #0969da;
            color: #fff;
            border-color: #0969da;
        }
        .workload-plan-note {
            margin-top: 8px;
            color: #656d76;
            font-size: 0.78rem;
            line-height: 1.45;
        }
        .workload-plan-table td.workload-plan-empty-cell {
            padding: 20px 16px;
            color: #57606a;
            line-height: 1.5;
            white-space: normal;
            background: #f6f8fa;
        }
        .workload-plan-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 23, 0.45);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            z-index: 1000;
        }
        .workload-plan-modal-overlay.active { display: flex; }
        .workload-plan-modal {
            width: min(760px, 100%);
            max-height: min(90vh, 900px);
            overflow: auto;
            background: #fff;
            border-radius: 14px;
            border: 1px solid rgba(15, 23, 42, 0.12);
            box-shadow: 0 18px 60px rgba(15, 23, 42, 0.25);
            padding: 16px;
        }
        .workload-plan-modal-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
        }
        .workload-plan-modal-head h4 {
            margin: 0;
            font-size: 1rem;
            color: #0f172a;
        }
        .workload-plan-modal-close {
            border: 0;
            background: transparent;
            color: #64748b;
            font-size: 1.2rem;
            cursor: pointer;
            line-height: 1;
        }
        .workload-plan-form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px 12px;
        }
        .workload-plan-field {
            display: grid;
            gap: 4px;
        }
        .workload-plan-field.full {
            grid-column: 1 / -1;
        }
        .workload-plan-field label {
            font-size: 0.78rem;
            color: #334155;
            font-weight: 600;
        }
        .workload-plan-field input,
        .workload-plan-field select,
        .workload-plan-field textarea {
            width: 100%;
            border: 1px solid rgba(15, 23, 42, 0.14);
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 0.86rem;
            box-sizing: border-box;
            background: #fff;
        }
        .workload-plan-checkbox-row {
            display: flex;
            gap: 16px;
            align-items: center;
            margin: 2px 0 4px;
            flex-wrap: wrap;
        }
        .workload-plan-checkbox-row label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 0.82rem;
            color: #334155;
        }
        .workload-plan-field-help {
            font-size: 0.72rem;
            color: #64748b;
        }
        .workload-plan-allocations {
            margin-top: 10px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            border-radius: 10px;
            background: #fcfdff;
            padding: 10px;
        }
        .workload-plan-allocations-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 8px;
        }
        .workload-plan-allocations-head h5 {
            margin: 0;
            font-size: 0.82rem;
            color: #0f172a;
        }
        .workload-plan-allocations-head p {
            margin: 2px 0 0;
            font-size: 0.72rem;
            color: #64748b;
        }
        .workload-plan-preset-buttons {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            align-items: center;
        }
        .workload-plan-preset-btn {
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 999px;
            background: #fff;
            color: #0f172a;
            padding: 5px 9px;
            font-size: 0.74rem;
            cursor: pointer;
        }
        .workload-plan-preset-btn:hover {
            background: #f8fafc;
        }
        .workload-plan-allocation-list {
            display: grid;
            gap: 8px;
        }
        .workload-plan-allocation-empty {
            border: 1px dashed rgba(15, 23, 42, 0.15);
            border-radius: 8px;
            padding: 10px;
            font-size: 0.76rem;
            color: #64748b;
            background: rgba(255,255,255,0.8);
        }
        .workload-plan-allocation-row {
            border: 1px solid rgba(15, 23, 42, 0.08);
            border-radius: 10px;
            padding: 8px;
            background: #fff;
            display: grid;
            gap: 8px;
        }
        .workload-plan-allocation-row-top {
            display: grid;
            grid-template-columns: minmax(0, 1.5fr) 120px auto;
            gap: 8px;
            align-items: center;
        }
        .workload-plan-allocation-row-top input,
        .workload-plan-allocation-row-top select,
        .workload-plan-allocation-row-body input {
            width: 100%;
            border: 1px solid rgba(15, 23, 42, 0.14);
            border-radius: 8px;
            padding: 7px 9px;
            font-size: 0.8rem;
            box-sizing: border-box;
            background: #fff;
        }
        .workload-plan-allocation-row-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
            gap: 8px;
            align-items: start;
        }
        .workload-plan-allocation-quarters {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            align-items: center;
        }
        .workload-plan-allocation-quarters label {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 999px;
            padding: 4px 8px;
            background: #f8fafc;
            color: #334155;
            font-size: 0.74rem;
            cursor: pointer;
        }
        .workload-plan-allocation-remove {
            border: 1px solid rgba(127, 29, 29, 0.18);
            background: #fff5f5;
            color: #991b1b;
            border-radius: 8px;
            padding: 6px 8px;
            font-size: 0.75rem;
            cursor: pointer;
            white-space: nowrap;
        }
        .workload-plan-allocation-summary {
            margin-top: 8px;
            border-top: 1px solid rgba(15, 23, 42, 0.08);
            padding-top: 8px;
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 8px;
        }
        .workload-plan-allocation-summary-card {
            border: 1px solid rgba(15, 23, 42, 0.08);
            border-radius: 8px;
            padding: 7px 8px;
            background: rgba(255,255,255,0.9);
        }
        .workload-plan-allocation-summary-card .label {
            display: block;
            color: #64748b;
            font-size: 0.68rem;
        }
        .workload-plan-allocation-summary-card .value {
            display: block;
            color: #0f172a;
            font-size: 0.82rem;
            font-weight: 700;
        }
        .workload-plan-derived-card {
            margin-top: 10px;
            border-radius: 10px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            background: #f8fafc;
            padding: 10px;
            font-size: 0.82rem;
            color: #334155;
        }
        .workload-plan-derived-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
        }
        .workload-plan-derived-grid strong {
            display: block;
            color: #0f172a;
            font-size: 0.9rem;
        }
        .workload-plan-worksheet-card {
            margin-top: 10px;
            border-radius: 10px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            background: #fff;
            padding: 10px;
        }
        .workload-plan-worksheet-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 8px;
        }
        .workload-plan-worksheet-head h5 {
            margin: 0;
            color: #0f172a;
            font-size: 0.9rem;
        }
        .workload-plan-worksheet-sub {
            color: #64748b;
            font-size: 0.75rem;
            line-height: 1.35;
        }
        .workload-plan-worksheet-meta {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 8px;
        }
        .workload-plan-worksheet-meta-item {
            border: 1px solid rgba(15, 23, 42, 0.07);
            border-radius: 8px;
            background: #f8fafc;
            padding: 7px 8px;
        }
        .workload-plan-worksheet-meta-item .label {
            display: block;
            color: #64748b;
            font-size: 0.68rem;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .workload-plan-worksheet-meta-item .value {
            display: block;
            color: #0f172a;
            font-size: 0.85rem;
            font-weight: 700;
            margin-top: 2px;
        }
        .workload-plan-worksheet-summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 8px;
        }
        .workload-plan-worksheet-summary-card {
            border: 1px solid rgba(15, 23, 42, 0.08);
            border-radius: 8px;
            padding: 8px;
            background: #f8fafc;
        }
        .workload-plan-worksheet-summary-card .label {
            display: block;
            color: #64748b;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .workload-plan-worksheet-summary-card .value {
            display: block;
            color: #0f172a;
            font-size: 0.95rem;
            font-weight: 700;
            margin-top: 2px;
        }
        .workload-plan-worksheet-summary-card .sub {
            display: block;
            color: #64748b;
            font-size: 0.7rem;
            margin-top: 2px;
            line-height: 1.25;
        }
        .workload-plan-quarter-course-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        .workload-plan-quarter-card {
            border: 1px solid rgba(15, 23, 42, 0.08);
            border-radius: 8px;
            background: #fff;
            overflow: hidden;
        }
        .workload-plan-quarter-card-head {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 6px;
            padding: 8px 8px 6px;
            border-bottom: 1px solid rgba(15, 23, 42, 0.06);
            background: #f8fafc;
        }
        .workload-plan-quarter-card-head strong {
            color: #0f172a;
            font-size: 0.82rem;
        }
        .workload-plan-quarter-card-head span {
            color: #64748b;
            font-size: 0.72rem;
        }
        .workload-plan-quarter-course-list {
            list-style: none;
            margin: 0;
            padding: 0;
            max-height: 180px;
            overflow: auto;
        }
        .workload-plan-quarter-course-item {
            padding: 7px 8px;
            border-bottom: 1px solid rgba(15, 23, 42, 0.05);
            display: grid;
            gap: 2px;
        }
        .workload-plan-quarter-course-item:last-child {
            border-bottom: 0;
        }
        .workload-plan-quarter-course-main {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            font-size: 0.76rem;
            color: #0f172a;
        }
        .workload-plan-quarter-course-code {
            font-weight: 700;
        }
        .workload-plan-quarter-course-item .sub {
            color: #64748b;
            font-size: 0.69rem;
            line-height: 1.25;
        }
        .workload-plan-quarter-empty {
            padding: 10px 8px;
            color: #64748b;
            font-size: 0.74rem;
        }
        .workload-plan-modal-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-top: 12px;
        }
        .workload-plan-modal-actions .left,
        .workload-plan-modal-actions .right {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        @media (max-width: 760px) {
            .workload-plan-form-grid {
                grid-template-columns: 1fr;
            }
            .workload-plan-allocation-row-top,
            .workload-plan-allocation-row-body {
                grid-template-columns: 1fr;
            }
            .workload-plan-allocation-summary {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .workload-plan-derived-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .workload-plan-worksheet-meta,
            .workload-plan-worksheet-summary-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .workload-plan-quarter-course-grid {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(style);
}

function ensureWorkloadPlanningPanel() {
    ensureWorkloadPlanningStyles();
    const dashboardContent = document.getElementById('dashboardContent');
    if (!dashboardContent) return null;

    let panel = document.getElementById('workloadPlanningPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'workloadPlanningPanel';
    panel.className = 'workload-plan-panel';
    panel.hidden = true;
    panel.innerHTML = '';

    const notice = document.getElementById('preliminaryWorkloadNotice');
    if (notice && notice.parentNode === dashboardContent) {
        dashboardContent.insertBefore(panel, notice.nextSibling);
    } else {
        const firstChild = dashboardContent.firstElementChild;
        dashboardContent.insertBefore(panel, firstChild || null);
    }

    panel.addEventListener('click', handleWorkloadPlanningPanelClick);
    panel.addEventListener('change', handleWorkloadPlanningPanelChange);
    return panel;
}

function getWorkloadPlanModalOverlay() {
    return document.getElementById('workloadPlanEditorOverlay');
}

function getWorkloadPlanReleaseAllocationsState() {
    return sanitizeWorkloadPlanReleaseAllocations(workloadPlanningUiState.modalReleaseAllocations);
}

function setWorkloadPlanReleaseAllocationsState(nextAllocations) {
    workloadPlanningUiState.modalReleaseAllocations = sanitizeWorkloadPlanReleaseAllocations(nextAllocations);
}

function renderWorkloadPlanReleaseAllocationRows() {
    const overlay = getWorkloadPlanModalOverlay();
    if (!overlay) return;

    const list = overlay.querySelector('#workloadPlanReleaseAllocationList');
    if (!list) return;

    const allocations = getWorkloadPlanReleaseAllocationsState();
    if (!allocations.length) {
        list.innerHTML = '<div class="workload-plan-allocation-empty">No structured allocations yet. Use the preset buttons or add a custom row. If this remains empty, the manual annual release total field is used.</div>';
        return;
    }

    const categoryOptionsHtml = WORKLOAD_PLAN_RELEASE_CATEGORY_OPTIONS
        .map((option) => `<option value="${escapeWorkloadPlanHtml(option.id)}">${escapeWorkloadPlanHtml(option.label)}</option>`)
        .join('');

    list.innerHTML = allocations.map((allocation, index) => {
        const quartersHtml = WORKLOAD_PLAN_RELEASE_ALLOCATION_QUARTERS
            .map((quarter) => {
                const checked = allocation.quarters.includes(quarter) ? ' checked' : '';
                return `
                    <label>
                        <input type="checkbox" data-field="quarter" data-index="${index}" data-quarter="${escapeWorkloadPlanHtml(quarter)}"${checked}>
                        ${escapeWorkloadPlanHtml(quarter)}
                    </label>
                `;
            })
            .join('');

        return `
            <div class="workload-plan-allocation-row" data-index="${index}">
                <div class="workload-plan-allocation-row-top">
                    <select data-field="category" data-index="${index}" aria-label="Allocation category">
                        ${categoryOptionsHtml}
                    </select>
                    <input type="number" min="0" step="0.5" data-field="credits" data-index="${index}" value="${escapeWorkloadPlanHtml(formatWorkloadPlanNumber(allocation.credits, 2))}" aria-label="Credits per selected quarter">
                    <button type="button" class="workload-plan-allocation-remove" data-action="remove-release-row" data-index="${index}">Remove</button>
                </div>
                <div class="workload-plan-allocation-row-body">
                    <input type="text" data-field="label" data-index="${index}" value="${escapeWorkloadPlanHtml(allocation.label || '')}" placeholder="Display label (e.g., DESN 499)">
                    <input type="text" data-field="description" data-index="${index}" value="${escapeWorkloadPlanHtml(allocation.description || '')}" placeholder="Optional row note / reason detail">
                </div>
                <div class="workload-plan-allocation-quarters">
                    ${quartersHtml}
                </div>
            </div>
        `;
    }).join('');

    allocations.forEach((allocation, index) => {
        const select = list.querySelector(`select[data-field="category"][data-index="${index}"]`);
        if (select) select.value = allocation.category;
    });
}

function updateWorkloadPlanReleaseAllocationSummary() {
    const overlay = getWorkloadPlanModalOverlay();
    if (!overlay) return;
    const summaryEl = overlay.querySelector('#workloadPlanReleaseAllocationSummary');
    if (!summaryEl) return;

    const summary = summarizeWorkloadPlanReleaseAllocations(workloadPlanningUiState.modalReleaseAllocations);
    const orderedQuarters = ['Fall', 'Winter', 'Spring', 'Summer'];
    summaryEl.innerHTML = [
        ...orderedQuarters.map((quarter) => `
            <div class="workload-plan-allocation-summary-card">
                <span class="label">${escapeWorkloadPlanHtml(quarter)} Release</span>
                <span class="value">${escapeWorkloadPlanHtml(formatWorkloadPlanNumber(summary.perQuarter[quarter] || 0, 2))}</span>
            </div>
        `),
        `
            <div class="workload-plan-allocation-summary-card">
                <span class="label">AY Release (Derived)</span>
                <span class="value">${escapeWorkloadPlanHtml(formatWorkloadPlanNumber(summary.annualTotal, 2))}</span>
            </div>
        `
    ].join('');
}

function updateWorkloadPlanReleaseCreditsFieldMode() {
    const overlay = getWorkloadPlanModalOverlay();
    if (!overlay) return;
    const releaseCreditsInput = overlay.querySelector('#workloadPlanReleaseCredits');
    const releaseCreditsHelp = overlay.querySelector('#workloadPlanReleaseCreditsHelp');
    if (!releaseCreditsInput || !releaseCreditsHelp) return;

    const hasStructuredAllocations = getWorkloadPlanReleaseAllocationsState().length > 0;
    releaseCreditsInput.readOnly = hasStructuredAllocations;
    releaseCreditsInput.setAttribute('aria-readonly', hasStructuredAllocations ? 'true' : 'false');
    releaseCreditsInput.style.background = hasStructuredAllocations ? '#f8fafc' : '#fff';
    releaseCreditsHelp.textContent = hasStructuredAllocations
        ? 'Auto-calculated from the structured allocation rows below (credits × selected quarters). Remove allocation rows to edit this field manually.'
        : 'Enter an annual total, or add structured allocations below to auto-calculate this field.';
}

function syncWorkloadPlanReleaseCreditsFromAllocations() {
    const overlay = getWorkloadPlanModalOverlay();
    if (!overlay) return;
    const releaseCreditsInput = overlay.querySelector('#workloadPlanReleaseCredits');
    if (!releaseCreditsInput) return;

    const summary = summarizeWorkloadPlanReleaseAllocations(workloadPlanningUiState.modalReleaseAllocations);
    if (summary.rows.length > 0) {
        releaseCreditsInput.value = formatWorkloadPlanNumber(summary.annualTotal, 2);
    }
    updateWorkloadPlanReleaseCreditsFieldMode();
}

function refreshWorkloadPlanReleaseAllocationUi() {
    renderWorkloadPlanReleaseAllocationRows();
    updateWorkloadPlanReleaseAllocationSummary();
    syncWorkloadPlanReleaseCreditsFromAllocations();
    updateWorkloadPlanDerivedPreview();
}

function addWorkloadPlanReleaseAllocationRow(presetId = '') {
    const next = getWorkloadPlanReleaseAllocationsState();
    next.push(buildWorkloadPlanReleaseAllocationFromPreset(presetId));
    setWorkloadPlanReleaseAllocationsState(next);
    refreshWorkloadPlanReleaseAllocationUi();
}

function removeWorkloadPlanReleaseAllocationRow(index) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) return;
    const next = getWorkloadPlanReleaseAllocationsState();
    if (!next[idx]) return;
    next.splice(idx, 1);
    setWorkloadPlanReleaseAllocationsState(next);
    refreshWorkloadPlanReleaseAllocationUi();
}

function updateWorkloadPlanReleaseAllocationField(index, field, rawValue) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) return;
    const next = getWorkloadPlanReleaseAllocationsState();
    const current = next[idx];
    if (!current) return;

    if (field === 'category') {
        current.category = normalizeWorkloadPlanReleaseCategory(rawValue);
        if (!String(current.label || '').trim() || current.source === 'preset') {
            current.label = getWorkloadPlanReleaseCategoryLabel(current.category);
        }
    } else if (field === 'credits') {
        const credits = Number(rawValue);
        current.credits = Number.isFinite(credits) && credits >= 0 ? Number(credits.toFixed(2)) : 0;
    } else if (field === 'label') {
        current.label = String(rawValue || '').trim();
    } else if (field === 'description') {
        current.description = String(rawValue || '').trim();
    }

    current.updatedAt = new Date().toISOString();
    setWorkloadPlanReleaseAllocationsState(next);
    updateWorkloadPlanReleaseAllocationSummary();
    syncWorkloadPlanReleaseCreditsFromAllocations();
    updateWorkloadPlanDerivedPreview();
}

function toggleWorkloadPlanReleaseAllocationQuarter(index, quarter, checked) {
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) return;
    const normalizedQuarter = normalizeWorkloadPlanReleaseQuarter(quarter);
    if (!normalizedQuarter) return;

    const next = getWorkloadPlanReleaseAllocationsState();
    const current = next[idx];
    if (!current) return;

    const quarters = new Set(Array.isArray(current.quarters) ? current.quarters : []);
    if (checked) {
        quarters.add(normalizedQuarter);
    } else {
        quarters.delete(normalizedQuarter);
    }
    current.quarters = Array.from(quarters).sort((a, b) => WORKLOAD_PLAN_RELEASE_ALLOCATION_QUARTERS.indexOf(a) - WORKLOAD_PLAN_RELEASE_ALLOCATION_QUARTERS.indexOf(b));
    current.updatedAt = new Date().toISOString();

    setWorkloadPlanReleaseAllocationsState(next);
    updateWorkloadPlanReleaseAllocationSummary();
    syncWorkloadPlanReleaseCreditsFromAllocations();
    updateWorkloadPlanDerivedPreview();
}

function handleWorkloadPlanReleaseAllocationInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const field = target.dataset?.field;
    const index = target.dataset?.index;
    if (!field || typeof index === 'undefined') return;

    if (field === 'quarter' && target instanceof HTMLInputElement) {
        toggleWorkloadPlanReleaseAllocationQuarter(index, target.dataset.quarter, target.checked);
        return;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
        updateWorkloadPlanReleaseAllocationField(index, field, target.value);
    }
}

function applyWorkloadPlanEditorLockState() {
    const overlay = getWorkloadPlanModalOverlay();
    if (!overlay) return;

    const locked = isWorkloadPlanningLockedForYear();
    const form = overlay.querySelector('#workloadPlanEditorForm');
    if (!form) return;

    const controls = form.querySelectorAll('input, select, textarea, button');
    controls.forEach((control) => {
        if (!(control instanceof HTMLElement)) return;
        const action = control.dataset?.action || '';
        const isClose = action === 'close-plan-modal';
        const isExportLike = false;
        if (isClose || isExportLike) return;
        if (control.id === 'workloadPlanRecordId' || control.id === 'workloadPlanOriginalName') return;

        if (control instanceof HTMLButtonElement) {
            // Keep only close enabled when locked.
            if (!isClose) {
                control.disabled = locked;
            }
            return;
        }
        if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) {
            control.disabled = locked;
        }
    });

    const subtitle = overlay.querySelector('#workloadPlanEditorSubtitle');
    if (subtitle) {
        const base = `AY ${currentFilters.year} planning settings used for workload targets, release time, and export assumptions.`;
        subtitle.textContent = locked ? `${base} (Locked: unlock editing in the planning dashboard to make changes.)` : base;
    }
}

function assertWorkloadPlanningUnlocked(actionLabel = 'make changes') {
    if (!isWorkloadPlanningLockedForYear()) return true;
    setWorkloadPlanningStatus(`Workload planning is locked for AY ${currentFilters.year}. Unlock editing to ${actionLabel}.`, 'warn');
    renderWorkloadPlanningPanel(currentYearData);
    alert(`Workload planning is locked for AY ${currentFilters.year}. Unlock editing to ${actionLabel}.`);
    return false;
}

function toggleWorkloadPlanningLock() {
    if (!currentFilters.year || currentFilters.year === 'all') {
        alert('Select a single academic year first.');
        return;
    }
    const currentlyLocked = isWorkloadPlanningLockedForYear();
    const nextLocked = !currentlyLocked;
    setWorkloadPlanningLockedForYear(nextLocked);
    setWorkloadPlanningStatus(
        nextLocked
            ? `Locked AY workload planning for ${currentFilters.year}.`
            : `Unlocked AY workload planning for ${currentFilters.year}.`,
        nextLocked ? 'info' : 'success'
    );

    if (workloadPlanningUiState.modalOpen) {
        applyWorkloadPlanEditorLockState();
    }
    renderWorkloadPlanningPanel(currentYearData);
}

function resetCurrentAyWorkloadPlanEdits() {
    if (!currentFilters.year || currentFilters.year === 'all') return;
    if (!assertWorkloadPlanningUnlocked('reset AY workload plan edits')) return;

    const { store, yearData } = readCurrentYearPlanData(false);
    if (!yearData) {
        setWorkloadPlanningStatus(`No AY workload plan records exist yet for ${currentFilters.year}.`, 'info');
        renderWorkloadPlanningPanel(currentYearData);
        return;
    }

    const facultyRecords = Array.isArray(yearData.faculty) ? yearData.faculty : [];
    if (facultyRecords.length === 0) {
        setWorkloadPlanningStatus(`AY workload plan is already using fallback assumptions for ${currentFilters.year}.`, 'info');
        renderWorkloadPlanningPanel(currentYearData);
        return;
    }

    const ok = confirm(
        `Reset AY workload plan edits for ${currentFilters.year}? This removes ${facultyRecords.length} faculty planning record(s) and returns the workload planning panel to fallback assumptions. AY adjunct targets and year notes will be preserved.`
    );
    if (!ok) return;

    yearData.faculty = [];
    touchWorkloadPlanYear(yearData);
    writeWorkloadPlanStore(store);
    clearWorkloadPlanningRefreshDiffForYear(currentFilters.year);

    setWorkloadPlanningStatus(`Reset AY workload plan edits for ${currentFilters.year}. Fallback assumptions are active again.`, 'warn');
    reloadCurrentYearWorkloadFromIntegration();
}

function refreshCurrentAyWorkloadFromScheduleWithDiff() {
    if (!currentFilters.year || currentFilters.year === 'all') {
        alert('Select a single academic year first.');
        return;
    }

    const beforeRows = currentYearData ? buildWorkloadPlanningRows(currentYearData) : [];
    currentYearData = loadIntegratedYearData(currentFilters.year);
    const afterRows = currentYearData ? buildWorkloadPlanningRows(currentYearData) : [];
    const diff = buildWorkloadPlanningScheduleRefreshDiff(beforeRows, afterRows);

    workloadPlanningUiState.lastScheduleRefreshDiffByYear[currentFilters.year] = diff;

    if (diff.totalChanged > 0) {
        setWorkloadPlanningStatus(
            `Refreshed from current scheduler draft: ${diff.totalChanged} faculty changed (${diff.added} added, ${diff.removed} removed, ${diff.modified} modified).`,
            'success'
        );
    } else {
        setWorkloadPlanningStatus('Refreshed from current scheduler draft: no faculty workload changes detected.', 'info');
    }

    refreshDashboard();
}

function ensureWorkloadPlanEditorModal() {
    ensureWorkloadPlanningStyles();
    let overlay = document.getElementById('workloadPlanEditorOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'workloadPlanEditorOverlay';
    overlay.className = 'workload-plan-modal-overlay';
    overlay.innerHTML = `
        <div class="workload-plan-modal" role="dialog" aria-modal="true" aria-labelledby="workloadPlanEditorTitle">
            <div class="workload-plan-modal-head">
                <div>
                    <h4 id="workloadPlanEditorTitle">Edit Workload Plan</h4>
                    <div id="workloadPlanEditorSubtitle" class="workload-plan-note">AY workload settings drive target/release calculations and exports.</div>
                </div>
                <button type="button" class="workload-plan-modal-close" data-action="close-plan-modal" aria-label="Close">×</button>
            </div>
            <form id="workloadPlanEditorForm">
                <input type="hidden" id="workloadPlanRecordId">
                <input type="hidden" id="workloadPlanOriginalName">
                <div class="workload-plan-form-grid">
                    <div class="workload-plan-field full">
                        <label for="workloadPlanFacultyName">Faculty Name</label>
                        <input id="workloadPlanFacultyName" type="text" required>
                    </div>
                    <div class="workload-plan-field">
                        <label for="workloadPlanRole">Role / Rank</label>
                        <select id="workloadPlanRole"></select>
                    </div>
                    <div class="workload-plan-field">
                        <label for="workloadPlanFte">FTE (%)</label>
                        <input id="workloadPlanFte" type="number" min="0" max="100" step="1" value="100">
                    </div>
                    <div class="workload-plan-field">
                        <label for="workloadPlanTargetCredits">Annual Target Credits</label>
                        <input id="workloadPlanTargetCredits" type="number" min="0" step="0.5" value="36">
                    </div>
                    <div class="workload-plan-field">
                        <label for="workloadPlanReleaseCredits">Release / Assigned-Time Credits</label>
                        <input id="workloadPlanReleaseCredits" type="number" min="0" step="0.5" value="0">
                        <div id="workloadPlanReleaseCreditsHelp" class="workload-plan-field-help">Enter an annual total, or add structured allocations below to auto-calculate this field.</div>
                    </div>
                    <div class="workload-plan-field full">
                        <label for="workloadPlanReleaseReason">Release Reason</label>
                        <input id="workloadPlanReleaseReason" type="text" placeholder="Chair, leave, scholarship, etc.">
                    </div>
                    <div class="workload-plan-field full">
                        <div class="workload-plan-allocations">
                            <div class="workload-plan-allocations-head">
                                <div>
                                    <h5>Release / Assigned-Time Allocations</h5>
                                    <p>Track quarter-scoped assignments (credits are per selected quarter). This drives the AY release total when rows are present.</p>
                                </div>
                                <div class="workload-plan-preset-buttons" aria-label="Quick add release allocation presets">
                                    ${WORKLOAD_PLAN_RELEASE_ALLOCATION_PRESETS.map((preset) => `<button type="button" class="workload-plan-preset-btn" data-action="add-release-preset" data-preset="${escapeWorkloadPlanHtml(preset.id)}">${escapeWorkloadPlanHtml(preset.label)}</button>`).join('')}
                                    <button type="button" class="workload-plan-preset-btn" data-action="add-release-row">+ Custom Row</button>
                                </div>
                            </div>
                            <div id="workloadPlanReleaseAllocationList" class="workload-plan-allocation-list"></div>
                            <div id="workloadPlanReleaseAllocationSummary" class="workload-plan-allocation-summary"></div>
                        </div>
                    </div>
                    <div class="workload-plan-field full">
                        <div class="workload-plan-checkbox-row">
                            <label><input id="workloadPlanChair" type="checkbox"> Chair</label>
                            <label><input id="workloadPlanActive" type="checkbox" checked> Active for this AY</label>
                        </div>
                    </div>
                    <div class="workload-plan-field full">
                        <label for="workloadPlanNotes">Notes</label>
                        <textarea id="workloadPlanNotes" rows="3" placeholder="Optional chair-facing workload notes."></textarea>
                    </div>
                </div>
                <div class="workload-plan-derived-card">
                    <div class="workload-plan-derived-grid">
                        <div><span class="label">Fall (workload)</span><strong id="workloadPlanDerivedFall">0</strong></div>
                        <div><span class="label">Winter (workload)</span><strong id="workloadPlanDerivedWinter">0</strong></div>
                        <div><span class="label">Spring (workload)</span><strong id="workloadPlanDerivedSpring">0</strong></div>
                        <div><span class="label">AY Total / Utilization</span><strong id="workloadPlanDerivedAy">0 (0%)</strong></div>
                    </div>
                </div>
                <div class="workload-plan-worksheet-card" id="workloadPlanWorksheetCard">
                    <div class="workload-plan-worksheet-head">
                        <div>
                            <h5>Workload Worksheet Snapshot (Teaching + AY Summary)</h5>
                            <div class="workload-plan-worksheet-sub">Chair-facing view of Fall/Winter/Spring workload and teaching assignments for the selected AY. Scholarship/service worksheet fields are still finalized outside this modal.</div>
                        </div>
                    </div>
                    <div class="workload-plan-worksheet-meta" id="workloadPlanWorksheetMeta"></div>
                    <div class="workload-plan-worksheet-summary-grid" id="workloadPlanWorksheetSummary"></div>
                    <div class="workload-plan-quarter-course-grid" id="workloadPlanWorksheetCourses"></div>
                </div>
                <div class="workload-plan-modal-actions">
                    <div class="left">
                        <button type="button" class="workload-plan-btn" data-action="remove-plan-record">Remove AY Plan</button>
                    </div>
                    <div class="right">
                        <button type="button" class="workload-plan-btn" data-action="close-plan-modal">Cancel</button>
                        <button type="submit" class="workload-plan-btn primary">Save Workload Plan</button>
                    </div>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    const roleSelect = overlay.querySelector('#workloadPlanRole');
    roleSelect.innerHTML = WORKLOAD_PLAN_ROLE_OPTIONS
        .map((role) => `<option value="${escapeWorkloadPlanHtml(role)}">${escapeWorkloadPlanHtml(role)}</option>`)
        .join('');

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeWorkloadPlanEditorModal();
            return;
        }
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.action;
        if (action === 'close-plan-modal') {
            closeWorkloadPlanEditorModal();
        } else if (action === 'remove-plan-record') {
            removeCurrentWorkloadPlanRecord();
        } else if (action === 'add-release-preset') {
            addWorkloadPlanReleaseAllocationRow(actionTarget.dataset.preset || '');
        } else if (action === 'add-release-row') {
            addWorkloadPlanReleaseAllocationRow('');
        } else if (action === 'remove-release-row') {
            removeWorkloadPlanReleaseAllocationRow(actionTarget.dataset.index);
        }
    });

    overlay.querySelector('#workloadPlanEditorForm').addEventListener('submit', handleWorkloadPlanEditorSubmit);
    overlay.querySelector('#workloadPlanChair').addEventListener('change', handleWorkloadPlanChairToggle);
    overlay.querySelector('#workloadPlanRole').addEventListener('change', handleWorkloadPlanRoleChange);
    overlay.querySelector('#workloadPlanFacultyName').addEventListener('input', updateWorkloadPlanDerivedPreview);
    overlay.querySelector('#workloadPlanFte').addEventListener('input', updateWorkloadPlanDerivedPreview);
    overlay.querySelector('#workloadPlanTargetCredits').addEventListener('input', updateWorkloadPlanDerivedPreview);
    overlay.querySelector('#workloadPlanReleaseCredits').addEventListener('input', updateWorkloadPlanDerivedPreview);
    overlay.querySelector('#workloadPlanReleaseAllocationList').addEventListener('input', handleWorkloadPlanReleaseAllocationInput);
    overlay.querySelector('#workloadPlanReleaseAllocationList').addEventListener('change', handleWorkloadPlanReleaseAllocationInput);

    return overlay;
}

function setWorkloadPlanningStatus(message, level = 'info') {
    workloadPlanningUiState.statusMessage = String(message || '').trim();
    workloadPlanningUiState.statusLevel = level;
}

function clearWorkloadPlanningStatus() {
    workloadPlanningUiState.statusMessage = '';
    workloadPlanningUiState.statusLevel = 'info';
}

function reloadCurrentYearWorkloadFromIntegration() {
    if (!currentFilters.year || currentFilters.year === 'all') return;
    currentYearData = loadIntegratedYearData(currentFilters.year);
    refreshDashboard();
}

function buildWorkloadPlanningRows(yearData) {
    const allRecords = yearData?.all || {};
    const { yearData: planYearData } = readCurrentYearPlanData(false);
    const planIndex = buildAyPlanRecordIndex(planYearData);

    const names = new Set(Object.keys(allRecords));
    (Array.isArray(planYearData?.faculty) ? planYearData.faculty : []).forEach((record) => {
        const recordName = String(record?.name || '').trim();
        if (recordName) names.add(recordName);
    });

    const rows = Array.from(names).map((facultyName) => {
        const workloadRecord = allRecords[facultyName] || null;
        const planRecord = planIndex.byNameKey.get(normalizeWorkloadPlanNameKey(facultyName)) || null;
        const defaults = inferPlanRecordDefaults(facultyName, workloadRecord, planRecord);

        const fall = Number(workloadRecord?.byQuarter?.Fall?.workload) || 0;
        const winter = Number(workloadRecord?.byQuarter?.Winter?.workload) || 0;
        const spring = Number(workloadRecord?.byQuarter?.Spring?.workload) || 0;
        const ayTotal = Number(workloadRecord?.totalWorkloadCredits) || 0;
        const target = Number(defaults.annualTargetCredits) || 0;
        const release = Number(defaults.releaseCredits) || 0;
        const netTarget = Math.max(0, target - release);
        const ayUtilization = target > 0 ? Number(((ayTotal / target) * 100).toFixed(1)) : 0;
        const ayUtilizationNet = netTarget > 0 ? Number(((ayTotal / netTarget) * 100).toFixed(1)) : 0;
        const gap = Number((netTarget - ayTotal).toFixed(2));
        const active = planRecord ? (planRecord.active !== false) : true;
        const chair = Boolean(defaults.isChair);
        const releaseAllocations = Array.isArray(defaults.releaseAllocations) ? defaults.releaseAllocations : [];
        const releaseSummary = summarizeWorkloadPlanReleaseAllocations(releaseAllocations);
        const fallQuarterRelease = Number(releaseSummary.perQuarter.Fall || 0);
        const winterQuarterRelease = Number(releaseSummary.perQuarter.Winter || 0);
        const springQuarterRelease = Number(releaseSummary.perQuarter.Spring || 0);
        const hasStructuredQuarterRelease = releaseSummary.rows.length > 0;
        const hasAnyRelease = release > 0;
        const fallUtilization = inferQuarterUtilization(fall, target);
        const winterUtilization = inferQuarterUtilization(winter, target);
        const springUtilization = inferQuarterUtilization(spring, target);
        const fallUtilizationAdjusted = hasStructuredQuarterRelease
            ? inferQuarterUtilizationWithRelease(fall, target, fallQuarterRelease, netTarget)
            : inferQuarterUtilization(fall, netTarget);
        const winterUtilizationAdjusted = hasStructuredQuarterRelease
            ? inferQuarterUtilizationWithRelease(winter, target, winterQuarterRelease, netTarget)
            : inferQuarterUtilization(winter, netTarget);
        const springUtilizationAdjusted = hasStructuredQuarterRelease
            ? inferQuarterUtilizationWithRelease(spring, target, springQuarterRelease, netTarget)
            : inferQuarterUtilization(spring, netTarget);

        const row = {
            facultyName,
            workloadRecord,
            planRecord,
            hasAyPlan: Boolean(planRecord),
            role: defaults.role || '',
            chair,
            active,
            fall,
            winter,
            spring,
            ayTotal,
            target,
            release,
            netTarget,
            ayUtilization,
            ayUtilizationNet,
            fallUtilization,
            winterUtilization,
            springUtilization,
            fallUtilizationAdjusted,
            winterUtilizationAdjusted,
            springUtilizationAdjusted,
            hasAnyRelease,
            hasStructuredQuarterRelease,
            gap,
            notes: defaults.notes || '',
            releaseReason: defaults.releaseReason || ''
        };

        row.status = getPlanningRowStatus(row);
        return row;
    });

    return rows.sort(compareWorkloadPlanningRows);
}

function renderWorkloadPlanningPanel(yearData) {
    const panel = ensureWorkloadPlanningPanel();
    if (!panel) return;

    const showPanel = currentFilters.year !== 'all' && Boolean(yearData);
    if (!showPanel) {
        panel.hidden = true;
        panel.innerHTML = '';
        return;
    }

    const rows = buildWorkloadPlanningRows(yearData);
    const configuredRows = rows.filter((row) => row.hasAyPlan);
    const fallbackRows = rows.filter((row) => !row.hasAyPlan);
    const inactiveRows = rows.filter((row) => !row.active);
    const unresolvedCount = Number(yearData?.meta?.unresolvedScheduleCourses?.count) || 0;
    const planningLocked = isWorkloadPlanningLockedForYear(currentFilters.year);
    const refreshDiff = getWorkloadPlanningRefreshDiffForYear(currentFilters.year);

    const activeSortOption = WORKLOAD_PLAN_SORT_OPTIONS.find((option) => option.id === workloadPlanningUiState.sortKey) || WORKLOAD_PLAN_SORT_OPTIONS[0];
    const groupByValue = workloadPlanningUiState.groupBy || 'none';
    let previousGroupLabel = '';

    const tableRowsHtml = rows.length
        ? rows.map((row) => {
            const rowGroupLabel = getWorkloadPlanningGroupLabel(row, groupByValue);
            const groupRowHtml = rowGroupLabel && rowGroupLabel !== previousGroupLabel
                ? `<tr class="workload-plan-group-row"><td colspan="14">${escapeWorkloadPlanHtml(rowGroupLabel)}</td></tr>`
                : '';
            previousGroupLabel = rowGroupLabel || previousGroupLabel;
            const planLabel = row.hasAyPlan ? 'AY Plan' : 'Fallback';
            const chairTag = row.chair ? '<span class="workload-plan-sub">Chair</span>' : '';
            const fallbackTag = row.hasAyPlan ? '' : '<span class="workload-plan-sub">Using fallback assumptions</span>';
            const releaseTag = row.releaseReason ? `<span class="workload-plan-sub">${escapeWorkloadPlanHtml(row.releaseReason)}</span>` : '';
            const changeInfo = getWorkloadPlanningRowChangeInfo(row, currentFilters.year);
            const changeTag = changeInfo
                ? `<span class="workload-plan-change-tag ${escapeWorkloadPlanHtml(changeInfo.type)}">${
                    changeInfo.type === 'added' ? 'Added / Changed' : changeInfo.type === 'removed' ? 'Removed from schedule' : 'Changed'
                }</span>`
                : '';
            const rowChangeClass = changeInfo
                ? ` workload-plan-row-changed workload-plan-row-change-${escapeWorkloadPlanHtml(changeInfo.type)}`
                : '';
            const ayUtilSubtext = row.hasAnyRelease && Math.abs((Number(row.ayUtilizationNet) || 0) - (Number(row.ayUtilization) || 0)) > 0.05
                ? `${formatWorkloadPlanNumber(row.ayUtilization)}% AY util · adj ${formatWorkloadPlanNumber(row.ayUtilizationNet)}%`
                : `${formatWorkloadPlanNumber(row.ayUtilization)}% AY util`;
            const quarterUtilSubtext = row.hasAnyRelease && (
                Math.abs((Number(row.winterUtilizationAdjusted) || 0) - (Number(row.winterUtilization) || 0)) > 0.05 ||
                Math.abs((Number(row.springUtilizationAdjusted) || 0) - (Number(row.springUtilization) || 0)) > 0.05 ||
                Math.abs((Number(row.fallUtilizationAdjusted) || 0) - (Number(row.fallUtilization) || 0)) > 0.05
            )
                ? `Adj F ${formatWorkloadPlanNumber(row.fallUtilizationAdjusted)}% · W ${formatWorkloadPlanNumber(row.winterUtilizationAdjusted)}% · S ${formatWorkloadPlanNumber(row.springUtilizationAdjusted)}%`
                : `W ${formatWorkloadPlanNumber(row.winterUtilization)}% · S ${formatWorkloadPlanNumber(row.springUtilization)}%`;
            return `${groupRowHtml}
                <tr class="${rowChangeClass.trim()}" data-faculty-name="${escapeWorkloadPlanHtml(row.facultyName)}">
                    <td class="name">
                        <button type="button" class="workload-plan-name-link" data-action="edit-plan" data-faculty="${escapeWorkloadPlanHtml(row.facultyName)}" title="Open workload plan for ${escapeWorkloadPlanHtml(row.facultyName)}">${escapeWorkloadPlanHtml(row.facultyName)}</button>
                        ${chairTag}
                        ${fallbackTag}
                        ${changeTag}
                    </td>
                    <td>${escapeWorkloadPlanHtml(row.role || '—')}</td>
                    <td>${row.chair ? 'Yes' : '—'}</td>
                    <td class="num">${formatWorkloadPlanNumber(row.fall)}</td>
                    <td class="num">${formatWorkloadPlanNumber(row.winter)}</td>
                    <td class="num">${formatWorkloadPlanNumber(row.spring)}</td>
                    <td class="num">
                        ${formatWorkloadPlanNumber(row.ayTotal)}
                        <span class="workload-plan-sub">${ayUtilSubtext}</span>
                    </td>
                    <td class="num">${formatWorkloadPlanNumber(row.target)}</td>
                    <td class="num">
                        ${formatWorkloadPlanNumber(row.release)}
                        ${releaseTag}
                    </td>
                    <td class="num">${formatWorkloadPlanNumber(row.netTarget)}</td>
                    <td class="num">
                        F ${formatWorkloadPlanNumber(row.fallUtilization)}%
                        <span class="workload-plan-sub">${quarterUtilSubtext}</span>
                    </td>
                    <td class="num">${escapeWorkloadPlanHtml(getPlanningGapLabel(row.gap))}</td>
                    <td>
                        <span class="workload-plan-badge ${row.status}">${getPlanningStatusBadgeLabel(row.status)}</span>
                        <span class="workload-plan-sub">${planLabel}</span>
                    </td>
                    <td>
                        <div class="workload-plan-row-actions">
                            <button type="button" class="workload-plan-row-btn edit" data-action="edit-plan" data-faculty="${escapeWorkloadPlanHtml(row.facultyName)}"${planningLocked ? ' disabled title="Unlock editing to change AY plans"' : ''}>Edit Plan</button>
                            <button type="button" class="workload-plan-row-btn" data-action="export-plan-sheet" data-faculty="${escapeWorkloadPlanHtml(row.facultyName)}">Export</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('')
        : '<tr><td colspan="14" class="workload-plan-empty-cell">No faculty workload rows found for this year yet. Refresh from the scheduler draft to confirm there are no assignments, then seed or import an AY workload plan to replace fallback assumptions.</td></tr>';

    const statusClass = workloadPlanningUiState.statusMessage
        ? (workloadPlanningUiState.statusLevel === 'warn' ? 'warn' : workloadPlanningUiState.statusLevel === 'success' ? 'success' : '')
        : '';
    const previousAy = getPreviousAcademicYearValue(currentFilters.year);
    const lockIndicatorClass = planningLocked ? 'locked' : 'unlocked';
    const lockIndicatorText = planningLocked ? 'Locked' : 'Unlocked';
    const lockButtonText = planningLocked ? 'Unlock Editing' : 'Lock Editing';
    const refreshSummaryHtml = refreshDiff
        ? `<div class="workload-plan-refresh-summary">
                <div>
                    <strong>Last refresh diff:</strong>
                    ${refreshDiff.totalChanged} faculty changed (${refreshDiff.added} added, ${refreshDiff.removed} removed, ${refreshDiff.modified} modified)
                    <span class="workload-plan-sub">Generated ${escapeWorkloadPlanHtml(new Date(refreshDiff.generatedAt).toLocaleString())}</span>
                </div>
                <div class="workload-plan-actions">
                    <button type="button" class="workload-plan-btn" data-action="clear-refresh-diff-highlights">Clear Highlights</button>
                </div>
            </div>`
        : '';

    panel.hidden = false;
    panel.innerHTML = `
        <div class="workload-plan-header">
            <div>
                <h3>Workload Planning Dashboard (AY ${escapeWorkloadPlanHtml(currentFilters.year)})</h3>
                <p>Chair-editable workload settings for target credits, chair/release time, and AY plan coverage. This feeds preliminary workload calculations and export sheets.</p>
            </div>
            <div class="workload-plan-actions">
                <span class="workload-plan-lock-indicator ${lockIndicatorClass}">${planningLocked ? '🔒' : '🔓'} ${lockIndicatorText}</span>
                <button type="button" class="workload-plan-btn" data-action="toggle-plan-lock">${lockButtonText}</button>
                <button type="button" class="workload-plan-btn" data-action="refresh-plan-from-schedule">Refresh From Current Schedule</button>
                <button type="button" class="workload-plan-btn primary" data-action="batch-export-plan-sheets">Export All Workload Sheets (.zip)</button>
                <button type="button" class="workload-plan-btn" data-action="seed-plan-from-current"${planningLocked ? ' disabled title="Unlock editing to seed records"' : ''}>Seed Missing Faculty From Current AY Schedule</button>
                <button type="button" class="workload-plan-btn" data-action="copy-prev-plan"${previousAy ? '' : ' disabled'}${planningLocked ? ' disabled title="Unlock editing to copy a plan"' : ''}>Copy ${escapeWorkloadPlanHtml(previousAy || 'Previous AY')} Plan</button>
                <button type="button" class="workload-plan-btn warn" data-action="reset-current-ay-plan"${planningLocked ? ' disabled title="Unlock editing to reset AY plan records"' : ''}>Start Over (Reset AY Plan)</button>
                <button type="button" class="workload-plan-btn" data-action="open-ay-setup">Open AY Setup</button>
            </div>
        </div>
        <div class="workload-plan-summary">
            <div class="workload-plan-summary-card">
                <span class="label">Faculty Rows</span>
                <span class="value">${rows.length}</span>
            </div>
            <div class="workload-plan-summary-card">
                <span class="label">AY Plan Configured</span>
                <span class="value">${configuredRows.length}</span>
            </div>
            <div class="workload-plan-summary-card">
                <span class="label">Using Fallback Assumptions</span>
                <span class="value">${fallbackRows.length}</span>
            </div>
            <div class="workload-plan-summary-card">
                <span class="label">Inactive Faculty (AY Plan)</span>
                <span class="value">${inactiveRows.length}</span>
            </div>
            <div class="workload-plan-summary-card">
                <span class="label">TBD / Unassigned Sections</span>
                <span class="value">${unresolvedCount}</span>
            </div>
        </div>
        <div class="workload-plan-toolbar">
            <div class="workload-plan-sort-controls">
                <label for="workloadPlanSortKey">Sort by
                    <select id="workloadPlanSortKey" data-action="planning-sort">
                        ${WORKLOAD_PLAN_SORT_OPTIONS.map((option) => `<option value="${escapeWorkloadPlanHtml(option.id)}"${option.id === workloadPlanningUiState.sortKey ? ' selected' : ''}>${escapeWorkloadPlanHtml(option.label)}</option>`).join('')}
                    </select>
                </label>
                <label for="workloadPlanSortDirection">Direction
                    <select id="workloadPlanSortDirection" data-action="planning-sort-direction">
                        <option value="asc"${workloadPlanningUiState.sortDirection === 'asc' ? ' selected' : ''}>Ascending</option>
                        <option value="desc"${workloadPlanningUiState.sortDirection === 'desc' ? ' selected' : ''}>Descending</option>
                    </select>
                </label>
                <label for="workloadPlanGroupBy">Grouping
                    <select id="workloadPlanGroupBy" data-action="planning-group">
                        ${WORKLOAD_PLAN_GROUP_OPTIONS.map((option) => `<option value="${escapeWorkloadPlanHtml(option.id)}"${option.id === workloadPlanningUiState.groupBy ? ' selected' : ''}>${escapeWorkloadPlanHtml(option.label)}</option>`).join('')}
                    </select>
                </label>
            </div>
            <div class="workload-plan-note">Sorted by ${escapeWorkloadPlanHtml(activeSortOption.label)}${workloadPlanningUiState.groupBy !== 'none' ? ` · ${escapeWorkloadPlanHtml((WORKLOAD_PLAN_GROUP_OPTIONS.find((option) => option.id === workloadPlanningUiState.groupBy) || { label: '' }).label)}` : ''}</div>
        </div>
        <div class="workload-plan-statusline ${statusClass}">${escapeWorkloadPlanHtml(workloadPlanningUiState.statusMessage || '')}</div>
        ${refreshSummaryHtml}
        <div class="workload-plan-table-wrap">
            <table class="workload-plan-table">
                <thead>
                    <tr>
                        <th>Faculty</th>
                        <th>Role</th>
                        <th>Chair</th>
                        <th>Fall</th>
                        <th>Winter</th>
                        <th>Spring</th>
                        <th>AY Total</th>
                        <th>Target</th>
                        <th>Release</th>
                        <th>Net Target</th>
                        <th>Utilization (Quarter + AY)</th>
                        <th>Gap</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
            </table>
        </div>
        <p class="workload-plan-note">Quarter and AY utilization percentages are shown against the baseline annual target. Release/assigned-time impact is shown in the Release + Net Target columns, and adjusted utilization is shown as a secondary note when it differs.</p>
    `;
}

function findPlanningRowByFacultyName(facultyName) {
    const rows = buildWorkloadPlanningRows(currentYearData);
    const key = normalizeWorkloadPlanNameKey(facultyName);
    return rows.find((row) => normalizeWorkloadPlanNameKey(row.facultyName) === key) || null;
}

function openWorkloadPlanEditorForFaculty(facultyName) {
    const row = findPlanningRowByFacultyName(facultyName);
    if (!row) {
        alert(`Could not find workload row for ${facultyName}.`);
        return;
    }

    const overlay = ensureWorkloadPlanEditorModal();
    const defaults = inferPlanRecordDefaults(row.facultyName, row.workloadRecord, row.planRecord);

    workloadPlanningUiState.modalOpen = true;
    workloadPlanningUiState.editingRecordId = defaults.id || null;
    workloadPlanningUiState.editingFacultyName = row.facultyName;

    overlay.querySelector('#workloadPlanEditorTitle').textContent = `Edit Workload Plan · ${row.facultyName}`;
    overlay.querySelector('#workloadPlanEditorSubtitle').textContent = `AY ${currentFilters.year} planning settings used for workload targets, release time, and export assumptions.`;
    overlay.querySelector('#workloadPlanRecordId').value = defaults.id || '';
    overlay.querySelector('#workloadPlanOriginalName').value = row.facultyName;
    overlay.querySelector('#workloadPlanFacultyName').value = defaults.name || row.facultyName;
    overlay.querySelector('#workloadPlanRole').value = WORKLOAD_PLAN_ROLE_OPTIONS.includes(defaults.role) ? defaults.role : 'Lecturer';
    overlay.querySelector('#workloadPlanFte').value = String(Number.isFinite(Number(defaults.ftePercent)) ? Number(defaults.ftePercent) : 100);
    overlay.querySelector('#workloadPlanTargetCredits').value = formatWorkloadPlanNumber(defaults.annualTargetCredits, 2);
    overlay.querySelector('#workloadPlanReleaseCredits').value = formatWorkloadPlanNumber(defaults.releaseCredits, 2);
    overlay.querySelector('#workloadPlanReleaseReason').value = defaults.releaseReason || '';
    overlay.querySelector('#workloadPlanNotes').value = defaults.notes || '';
    overlay.querySelector('#workloadPlanChair').checked = Boolean(defaults.isChair);
    overlay.querySelector('#workloadPlanActive').checked = defaults.active !== false;
    overlay.querySelector('[data-action="remove-plan-record"]').disabled = !row.planRecord;
    setWorkloadPlanReleaseAllocationsState(defaults.releaseAllocations || []);

    overlay.dataset.facultyName = row.facultyName;
    overlay.classList.add('active');
    refreshWorkloadPlanReleaseAllocationUi();
    applyWorkloadPlanEditorLockState();
    updateWorkloadPlanDerivedPreview();
}

function closeWorkloadPlanEditorModal() {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    workloadPlanningUiState.modalOpen = false;
    workloadPlanningUiState.editingRecordId = null;
    workloadPlanningUiState.editingFacultyName = '';
    workloadPlanningUiState.modalReleaseAllocations = [];
}

function getWorkloadPlanEditorValues() {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay) return null;

    const releaseAllocations = getWorkloadPlanReleaseAllocationsState();
    const releaseAllocationSummary = summarizeWorkloadPlanReleaseAllocations(releaseAllocations);
    const target = Number(overlay.querySelector('#workloadPlanTargetCredits').value);
    const release = Number(overlay.querySelector('#workloadPlanReleaseCredits').value);
    const safeTarget = Number.isFinite(target) && target >= 0 ? target : 0;
    const safeReleaseManual = Number.isFinite(release) && release >= 0 ? release : 0;
    const safeRelease = releaseAllocationSummary.rows.length > 0
        ? releaseAllocationSummary.annualTotal
        : safeReleaseManual;
    const safeName = overlay.querySelector('#workloadPlanFacultyName').value.trim();

    return {
        id: overlay.querySelector('#workloadPlanRecordId').value.trim(),
        originalName: overlay.querySelector('#workloadPlanOriginalName').value.trim(),
        name: safeName,
        role: overlay.querySelector('#workloadPlanRole').value,
        ftePercent: Math.max(0, Number(overlay.querySelector('#workloadPlanFte').value) || 0),
        annualTargetCredits: safeTarget,
        releaseCredits: safeRelease,
        releasePercent: safeTarget > 0 ? Number(((safeRelease / safeTarget) * 100).toFixed(1)) : 0,
        releaseReason: overlay.querySelector('#workloadPlanReleaseReason').value.trim(),
        notes: overlay.querySelector('#workloadPlanNotes').value.trim(),
        isChair: overlay.querySelector('#workloadPlanChair').checked,
        active: overlay.querySelector('#workloadPlanActive').checked,
        releaseAllocations: releaseAllocationSummary.rows
    };
}

function updateWorkloadPlanDerivedPreview() {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;

    const values = getWorkloadPlanEditorValues();
    if (!values) return;
    const baseRow = findPlanningRowByFacultyName(values.originalName || values.name);
    const fall = Number(baseRow?.fall) || 0;
    const winter = Number(baseRow?.winter) || 0;
    const spring = Number(baseRow?.spring) || 0;
    const ayTotal = Number(baseRow?.ayTotal) || 0;
    const releaseAllocations = Array.isArray(values.releaseAllocations) ? values.releaseAllocations : [];
    const releaseSummary = summarizeWorkloadPlanReleaseAllocations(releaseAllocations);
    const annualTarget = Number(values.annualTargetCredits) || 0;
    const net = Math.max(0, (Number(values.annualTargetCredits) || 0) - (Number(values.releaseCredits) || 0));
    const ayUtil = annualTarget > 0 ? (ayTotal / annualTarget) * 100 : 0;
    const ayUtilAdjusted = net > 0 ? (ayTotal / net) * 100 : 0;
    const fallRelease = Number(releaseSummary.perQuarter.Fall || 0);
    const winterRelease = Number(releaseSummary.perQuarter.Winter || 0);
    const springRelease = Number(releaseSummary.perQuarter.Spring || 0);
    const hasRelease = Number(values.releaseCredits) > 0;
    const fallUtil = inferQuarterUtilization(fall, annualTarget);
    const winterUtil = inferQuarterUtilization(winter, annualTarget);
    const springUtil = inferQuarterUtilization(spring, annualTarget);
    const fallUtilAdjusted = releaseSummary.rows.length > 0
        ? inferQuarterUtilizationWithRelease(fall, annualTarget, fallRelease, net)
        : inferQuarterUtilization(fall, net);
    const winterUtilAdjusted = releaseSummary.rows.length > 0
        ? inferQuarterUtilizationWithRelease(winter, annualTarget, winterRelease, net)
        : inferQuarterUtilization(winter, net);
    const springUtilAdjusted = releaseSummary.rows.length > 0
        ? inferQuarterUtilizationWithRelease(spring, annualTarget, springRelease, net)
        : inferQuarterUtilization(spring, net);

    const quarterWithReleaseText = (workload, util, utilAdjusted, quarterRelease) => {
        const base = `${formatWorkloadPlanNumber(workload)} (${formatWorkloadPlanNumber(util)}%)`;
        if (!hasRelease) return base;
        const adjustedDiffers = Math.abs((Number(utilAdjusted) || 0) - (Number(util) || 0)) > 0.05;
        const releasePart = releaseSummary.rows.length > 0 ? ` · rel ${formatWorkloadPlanNumber(quarterRelease, 2)}` : '';
        const adjustedPart = adjustedDiffers ? ` · adj ${formatWorkloadPlanNumber(utilAdjusted)}%` : '';
        return `${base}${releasePart}${adjustedPart}`;
    };

    overlay.querySelector('#workloadPlanDerivedFall').textContent = quarterWithReleaseText(fall, fallUtil, fallUtilAdjusted, fallRelease);
    overlay.querySelector('#workloadPlanDerivedWinter').textContent = quarterWithReleaseText(winter, winterUtil, winterUtilAdjusted, winterRelease);
    overlay.querySelector('#workloadPlanDerivedSpring').textContent = quarterWithReleaseText(spring, springUtil, springUtilAdjusted, springRelease);
    const ayAdjustedPart = hasRelease && Math.abs((Number(ayUtilAdjusted) || 0) - (Number(ayUtil) || 0)) > 0.05
        ? ` · adj ${formatWorkloadPlanNumber(ayUtilAdjusted)}%`
        : '';
    overlay.querySelector('#workloadPlanDerivedAy').textContent = `${formatWorkloadPlanNumber(ayTotal)} (${formatWorkloadPlanNumber(ayUtil)}%)${ayAdjustedPart}`;

    renderWorkloadPlanWorksheetSnapshot(overlay, baseRow, values);
}

function getWorkloadPlanEditorQuarterCourseBuckets(workloadRecord) {
    const buckets = {
        Fall: [],
        Winter: [],
        Spring: []
    };
    const courses = Array.isArray(workloadRecord?.courses) ? workloadRecord.courses : [];
    courses.forEach((course) => {
        const quarter = String(course?.quarter || '').trim();
        if (!Object.prototype.hasOwnProperty.call(buckets, quarter)) return;
        buckets[quarter].push({
            courseCode: String(course?.courseCode || '').trim(),
            section: String(course?.section || '').trim() || '001',
            workloadCredits: Number(course?.workloadCredits) || 0,
            credits: Number(course?.credits) || 0,
            source: String(course?.source || '').trim(),
            type: String(course?.type || '').trim()
        });
    });
    Object.values(buckets).forEach((items) => {
        items.sort((a, b) => {
            if (a.courseCode === b.courseCode) return a.section.localeCompare(b.section);
            return a.courseCode.localeCompare(b.courseCode);
        });
    });
    return buckets;
}

function renderWorkloadPlanWorksheetSnapshot(overlay, baseRow, values) {
    if (!overlay) return;
    const metaEl = overlay.querySelector('#workloadPlanWorksheetMeta');
    const summaryEl = overlay.querySelector('#workloadPlanWorksheetSummary');
    const coursesEl = overlay.querySelector('#workloadPlanWorksheetCourses');
    if (!metaEl || !summaryEl || !coursesEl) return;

    const row = baseRow || null;
    const workloadRecord = row?.workloadRecord || null;
    const annualTarget = Number(values?.annualTargetCredits) || Number(row?.target) || 0;
    const releaseCredits = Number(values?.releaseCredits) || Number(row?.release) || 0;
    const netTarget = Math.max(0, annualTarget - releaseCredits);
    const fte = Number(values?.ftePercent);
    const releasePercent = annualTarget > 0 ? Number(((releaseCredits / annualTarget) * 100).toFixed(1)) : 0;
    const chairPercent = values?.isChair ? releasePercent : 0;
    const role = String(values?.role || row?.role || '').trim() || '—';
    const facultyName = String(values?.name || row?.facultyName || '').trim() || '—';
    const fall = Number(row?.fall) || 0;
    const winter = Number(row?.winter) || 0;
    const spring = Number(row?.spring) || 0;
    const ayTotal = Number(row?.ayTotal) || 0;
    const ayUtil = annualTarget > 0 ? Number(((ayTotal / annualTarget) * 100).toFixed(1)) : 0;
    const ayUtilNet = netTarget > 0 ? Number(((ayTotal / netTarget) * 100).toFixed(1)) : 0;
    const fallUtil = inferQuarterUtilization(fall, annualTarget);
    const winterUtil = inferQuarterUtilization(winter, annualTarget);
    const springUtil = inferQuarterUtilization(spring, annualTarget);
    const courseBuckets = getWorkloadPlanEditorQuarterCourseBuckets(workloadRecord);

    const metaItems = [
        { label: 'AY', value: currentFilters.year || '—' },
        { label: 'Name', value: facultyName },
        { label: 'Classification', value: role },
        { label: 'Department', value: WORKLOAD_PLAN_DEPARTMENT_LABEL || getDepartmentIdentity().name || 'Design' },
        { label: 'FTE', value: `${Number.isFinite(fte) ? formatWorkloadPlanNumber(fte, 1) : '100'}%` },
        { label: 'Expected Workload', value: `${formatWorkloadPlanNumber(annualTarget)} credits` },
        { label: 'Assigned / Release', value: `${formatWorkloadPlanNumber(releaseCredits)} credits (${formatWorkloadPlanNumber(releasePercent)}%)` },
        { label: 'Chair (%)', value: `${formatWorkloadPlanNumber(chairPercent)}%` }
    ];

    metaEl.innerHTML = metaItems.map((item) => `
        <div class="workload-plan-worksheet-meta-item">
            <span class="label">${escapeWorkloadPlanHtml(item.label)}</span>
            <span class="value">${escapeWorkloadPlanHtml(item.value)}</span>
        </div>
    `).join('');

    const summaryItems = [
        {
            label: 'Fall (workload)',
            value: formatWorkloadPlanNumber(fall),
            sub: `${formatWorkloadPlanNumber(fallUtil)}% of annual target`
        },
        {
            label: 'Winter (workload)',
            value: formatWorkloadPlanNumber(winter),
            sub: `${formatWorkloadPlanNumber(winterUtil)}% of annual target`
        },
        {
            label: 'Spring (workload)',
            value: formatWorkloadPlanNumber(spring),
            sub: `${formatWorkloadPlanNumber(springUtil)}% of annual target`
        },
        {
            label: 'AY Total / Utilization',
            value: `${formatWorkloadPlanNumber(ayTotal)} (${formatWorkloadPlanNumber(ayUtil)}%)`,
            sub: netTarget > 0 ? `Net target ${formatWorkloadPlanNumber(netTarget)} · adj ${formatWorkloadPlanNumber(ayUtilNet)}%` : 'No net target after release'
        }
    ];

    summaryEl.innerHTML = summaryItems.map((item) => `
        <div class="workload-plan-worksheet-summary-card">
            <span class="label">${escapeWorkloadPlanHtml(item.label)}</span>
            <span class="value">${escapeWorkloadPlanHtml(item.value)}</span>
            <span class="sub">${escapeWorkloadPlanHtml(item.sub)}</span>
        </div>
    `).join('');

    const quarterLabels = ['Fall', 'Winter', 'Spring'];
    coursesEl.innerHTML = quarterLabels.map((quarter) => {
        const items = courseBuckets[quarter] || [];
        const totalQuarterWorkload = items.reduce((sum, item) => sum + (Number(item.workloadCredits) || 0), 0);
        const listHtml = items.length
            ? `<ul class="workload-plan-quarter-course-list">${items.map((item) => `
                    <li class="workload-plan-quarter-course-item">
                        <div class="workload-plan-quarter-course-main">
                            <span><span class="workload-plan-quarter-course-code">${escapeWorkloadPlanHtml(item.courseCode || 'Course')}</span> · ${escapeWorkloadPlanHtml(item.section || '001')}</span>
                            <span>WL ${escapeWorkloadPlanHtml(formatWorkloadPlanNumber(item.workloadCredits))}</span>
                        </div>
                        <div class="sub">${escapeWorkloadPlanHtml(formatWorkloadPlanNumber(item.credits))} SCH${item.type === 'applied-learning' ? ' · Applied learning weighted' : ''}</div>
                    </li>
                `).join('')}</ul>`
            : '<div class="workload-plan-quarter-empty">No teaching assignments found for this quarter in the current schedule-derived workload data.</div>';

        return `
            <div class="workload-plan-quarter-card">
                <div class="workload-plan-quarter-card-head">
                    <strong>${escapeWorkloadPlanHtml(quarter)}</strong>
                    <span>${escapeWorkloadPlanHtml(String(items.length))} course${items.length === 1 ? '' : 's'} · WL ${escapeWorkloadPlanHtml(formatWorkloadPlanNumber(totalQuarterWorkload))}</span>
                </div>
                ${listHtml}
            </div>
        `;
    }).join('');
}

function handleWorkloadPlanChairToggle(event) {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay) return;
    const checked = Boolean(event.target.checked);
    const reasonInput = overlay.querySelector('#workloadPlanReleaseReason');
    const targetInput = overlay.querySelector('#workloadPlanTargetCredits');
    const releaseInput = overlay.querySelector('#workloadPlanReleaseCredits');
    const target = Number(targetInput.value) || 0;
    const release = Number(releaseInput.value) || 0;
    const hasStructuredAllocations = getWorkloadPlanReleaseAllocationsState().length > 0;

    if (checked) {
        if (!reasonInput.value.trim()) {
            reasonInput.value = 'Chair';
        }
        if (!hasStructuredAllocations && !release && target >= 18) {
            releaseInput.value = formatWorkloadPlanNumber(Math.min(18, target), 1);
        }
    } else if (reasonInput.value.trim().toLowerCase() === 'chair') {
        reasonInput.value = '';
    }

    updateWorkloadPlanDerivedPreview();
}

function handleWorkloadPlanRoleChange(event) {
    const role = String(event.target.value || '');
    const targetInput = document.getElementById('workloadPlanTargetCredits');
    if (!targetInput) return;
    const current = Number(targetInput.value);
    const defaultTarget = getWorkloadPlanRoleDefault(role, null);
    if (defaultTarget === null) return;
    if (!Number.isFinite(current) || current <= 0) {
        targetInput.value = formatWorkloadPlanNumber(defaultTarget, 1);
    }
    updateWorkloadPlanDerivedPreview();
}

function handleWorkloadPlanEditorSubmit(event) {
    event.preventDefault();
    if (!currentFilters.year || currentFilters.year === 'all') {
        alert('Select a single academic year first.');
        return;
    }
    if (!assertWorkloadPlanningUnlocked('save AY workload plan changes')) return;

    const values = getWorkloadPlanEditorValues();
    if (!values || !values.name) {
        alert('Faculty name is required.');
        return;
    }

    const allocationValidation = validateWorkloadPlanReleaseAllocations(values.releaseAllocations);
    if (!allocationValidation.valid) {
        alert(allocationValidation.errors.join('\n'));
        return;
    }
    values.releaseAllocations = allocationValidation.rows;

    if (values.isChair && !values.releaseReason) {
        values.releaseReason = 'Chair';
    }

    const { store, yearData } = readCurrentYearPlanData(true);
    const index = buildAyPlanRecordIndex(yearData);
    const nameKey = normalizeWorkloadPlanNameKey(values.originalName || values.name);
    const existingByName = index.byNameKey.get(nameKey);

    let recordId = values.id || existingByName?.id || '';
    if (!recordId) {
        recordId = createWorkloadPlanRecordId();
    }

    const nextRecord = {
        id: recordId,
        name: values.name,
        role: values.role,
        ftePercent: values.ftePercent,
        annualTargetCredits: values.annualTargetCredits,
        releaseCredits: values.releaseCredits,
        releasePercent: values.releasePercent,
        releaseReason: values.releaseReason,
        notes: values.notes,
        isChair: values.isChair,
        active: values.active,
        releaseAllocations: values.releaseAllocations
    };

    const faculty = Array.isArray(yearData.faculty) ? yearData.faculty : [];
    const existingIndex = faculty.findIndex((record) => String(record.id) === recordId);
    if (existingIndex >= 0) {
        faculty[existingIndex] = { ...faculty[existingIndex], ...nextRecord };
    } else {
        const duplicateNameIndex = faculty.findIndex((record) => normalizeWorkloadPlanNameKey(record?.name) === normalizeWorkloadPlanNameKey(values.name));
        if (duplicateNameIndex >= 0) {
            faculty[duplicateNameIndex] = { ...faculty[duplicateNameIndex], ...nextRecord };
        } else {
            faculty.push(nextRecord);
        }
    }
    yearData.faculty = faculty;
    touchWorkloadPlanYear(yearData);
    writeWorkloadPlanStore(store);

    setWorkloadPlanningStatus(`Saved AY workload plan for ${values.name}.`, 'success');
    closeWorkloadPlanEditorModal();
    reloadCurrentYearWorkloadFromIntegration();
}

function removeCurrentWorkloadPlanRecord() {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay || !currentFilters.year || currentFilters.year === 'all') return;
    if (!assertWorkloadPlanningUnlocked('remove an AY workload plan record')) return;
    const values = getWorkloadPlanEditorValues();
    if (!values) return;

    const ok = confirm(`Remove AY workload plan for ${values.originalName || values.name}? Fallback assumptions will be used again.`);
    if (!ok) return;

    const { store, yearData } = readCurrentYearPlanData(true);
    const originalKey = normalizeWorkloadPlanNameKey(values.originalName || values.name);
    yearData.faculty = (Array.isArray(yearData.faculty) ? yearData.faculty : []).filter((record) => {
        const sameId = values.id && String(record?.id) === String(values.id);
        const sameName = normalizeWorkloadPlanNameKey(record?.name) === originalKey;
        return !(sameId || sameName);
    });
    touchWorkloadPlanYear(yearData);
    writeWorkloadPlanStore(store);

    setWorkloadPlanningStatus(`Removed AY workload plan for ${values.originalName || values.name}. Fallback assumptions are active.`, 'warn');
    closeWorkloadPlanEditorModal();
    reloadCurrentYearWorkloadFromIntegration();
}

function isWorkloadPlanPlaceholderFacultyName(name) {
    const value = String(name || '').trim().toLowerCase();
    return !value || value === 'tbd' || value === 'staff' || value === 'staff/other';
}

function getSeedFacultyCandidatesForCurrentYear() {
    const rowsByName = currentYearData?.all || {};
    const byName = new Map();
    let source = 'integrated workload roster';

    if (typeof WorkloadIntegration !== 'undefined' && typeof WorkloadIntegration.getProgramCommandScheduleCourses === 'function') {
        const scheduleCourses = WorkloadIntegration.getProgramCommandScheduleCourses(currentFilters.year);
        const assigned = Array.isArray(scheduleCourses)
            ? scheduleCourses.filter((course) => !isWorkloadPlanPlaceholderFacultyName(course?.assignedFaculty || course?.instructor))
            : [];

        if (assigned.length > 0) {
            source = 'current AY schedule';
            assigned.forEach((course) => {
                const facultyName = String(course.assignedFaculty || course.instructor || '').trim();
                const key = normalizeWorkloadPlanNameKey(facultyName);
                if (!key || byName.has(key)) return;
                byName.set(key, {
                    facultyName,
                    workloadRecord: rowsByName[facultyName] || null
                });
            });
        }
    }

    if (byName.size === 0) {
        Object.entries(rowsByName).forEach(([facultyName, workloadRecord]) => {
            if (!facultyName || isWorkloadPlanPlaceholderFacultyName(facultyName)) return;
            const key = normalizeWorkloadPlanNameKey(facultyName);
            if (!key || byName.has(key)) return;
            byName.set(key, { facultyName, workloadRecord });
        });
    }

    return {
        source,
        items: Array.from(byName.values())
    };
}

function seedMissingAyPlanRecordsFromCurrentWorkload() {
    if (!currentFilters.year || currentFilters.year === 'all') return;
    if (!assertWorkloadPlanningUnlocked('seed missing AY workload plan records')) return;
    const { store, yearData } = readCurrentYearPlanData(true);
    const faculty = Array.isArray(yearData.faculty) ? yearData.faculty : [];
    const existingKeys = new Set(faculty.map((record) => normalizeWorkloadPlanNameKey(record?.name)));
    let added = 0;
    const { source, items } = getSeedFacultyCandidatesForCurrentYear();

    items.forEach(({ facultyName, workloadRecord }) => {
        if (!facultyName) return;
        const key = normalizeWorkloadPlanNameKey(facultyName);
        if (!key || existingKeys.has(key)) return;

        const defaults = inferPlanRecordDefaults(facultyName, workloadRecord, null);
        faculty.push({
            id: createWorkloadPlanRecordId(),
            name: defaults.name || facultyName,
            role: defaults.role,
            ftePercent: defaults.ftePercent,
            annualTargetCredits: defaults.annualTargetCredits,
            releaseCredits: defaults.releaseCredits,
            releasePercent: defaults.releasePercent,
            releaseReason: defaults.releaseReason,
            notes: defaults.notes || '',
            isChair: defaults.isChair,
            active: true,
            releaseAllocations: defaults.releaseAllocations || []
        });
        existingKeys.add(key);
        added += 1;
    });

    yearData.faculty = faculty;
    touchWorkloadPlanYear(yearData);
    writeWorkloadPlanStore(store);

    setWorkloadPlanningStatus(added > 0
        ? `Added ${added} missing faculty to the AY workload plan from the ${source}.`
        : `No missing faculty to add. AY workload plan already covers the ${source}.`,
    added > 0 ? 'success' : 'info');
    reloadCurrentYearWorkloadFromIntegration();
}

function copyPreviousAyPlanIntoCurrentYear() {
    if (!currentFilters.year || currentFilters.year === 'all') return;
    if (!assertWorkloadPlanningUnlocked('copy a previous AY plan into the current year')) return;
    const previousYear = getPreviousAcademicYearValue(currentFilters.year);
    if (!previousYear) {
        alert('Select a valid academic year first.');
        return;
    }

    const store = parseWorkloadPlanStore();
    const previousData = store[previousYear];
    if (!previousData) {
        alert(`No AY setup data found for ${previousYear}.`);
        return;
    }

    const currentData = store[currentFilters.year];
    const currentHasFaculty = Array.isArray(currentData?.faculty) && currentData.faculty.length > 0;
    const promptText = currentHasFaculty
        ? `Replace existing ${currentFilters.year} AY workload plan with ${previousYear} data?`
        : `Copy ${previousYear} AY workload plan into ${currentFilters.year}?`;
    if (!confirm(promptText)) return;

    const cloned = cloneWorkloadPlanValue(previousData) || {};
    if (Array.isArray(cloned.faculty)) {
        cloned.faculty = cloned.faculty.map((record) => ({
            ...record,
            id: createWorkloadPlanRecordId()
        }));
    } else {
        cloned.faculty = [];
    }
    cloned.updatedAt = new Date().toISOString();
    store[currentFilters.year] = cloned;
    writeWorkloadPlanStore(store);

    setWorkloadPlanningStatus(`Copied AY workload plan from ${previousYear} to ${currentFilters.year}.`, 'success');
    reloadCurrentYearWorkloadFromIntegration();
}

function handleWorkloadPlanningPanelClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    const facultyName = actionTarget.dataset.faculty;

    if (action === 'edit-plan' && facultyName) {
        openWorkloadPlanEditorForFaculty(facultyName);
        return;
    }
    if (action === 'export-plan-sheet' && facultyName) {
        exportFacultyWorkloadSheet(facultyName);
        return;
    }
    if (action === 'batch-export-plan-sheets') {
        exportAllFacultyWorkloadSheetsZip();
        return;
    }
    if (action === 'seed-plan-from-current') {
        seedMissingAyPlanRecordsFromCurrentWorkload();
        return;
    }
    if (action === 'copy-prev-plan') {
        copyPreviousAyPlanIntoCurrentYear();
        return;
    }
    if (action === 'toggle-plan-lock') {
        toggleWorkloadPlanningLock();
        return;
    }
    if (action === 'refresh-plan-from-schedule') {
        refreshCurrentAyWorkloadFromScheduleWithDiff();
        return;
    }
    if (action === 'reset-current-ay-plan') {
        resetCurrentAyWorkloadPlanEdits();
        return;
    }
    if (action === 'clear-refresh-diff-highlights') {
        clearWorkloadPlanningRefreshDiffForYear(currentFilters.year);
        writeWorkloadPlanUiPreferences();
        renderWorkloadPlanningPanel(currentYearData);
        return;
    }
    if (action === 'open-ay-setup') {
        window.location.href = 'academic-year-setup.html';
    }
}

function handleWorkloadPlanningPanelChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    let changed = false;
    if (action === 'planning-sort') {
        const value = target.value;
        if (WORKLOAD_PLAN_SORT_OPTIONS.some((option) => option.id === value) && workloadPlanningUiState.sortKey !== value) {
            workloadPlanningUiState.sortKey = value;
            changed = true;
        }
    } else if (action === 'planning-sort-direction') {
        const value = target.value === 'desc' ? 'desc' : 'asc';
        if (workloadPlanningUiState.sortDirection !== value) {
            workloadPlanningUiState.sortDirection = value;
            changed = true;
        }
    } else if (action === 'planning-group') {
        const value = target.value;
        if (WORKLOAD_PLAN_GROUP_OPTIONS.some((option) => option.id === value) && workloadPlanningUiState.groupBy !== value) {
            workloadPlanningUiState.groupBy = value;
            changed = true;
        }
    }

    if (!changed) return;
    writeWorkloadPlanUiPreferences();
    renderWorkloadPlanningPanel(currentYearData);
}

/**
 * Initialize dashboard
 */
async function initDashboard() {
    console.log('🚀 Initializing Faculty Workload Dashboard');
    await initializeDepartmentProfileContext();
    loadWorkloadPlanUiPreferences();

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
    updateYearSubtitle(year, WORKLOAD_DASHBOARD_SUBTITLE_BASE);
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
    renderWorkloadPlanningPanel(currentYearData);
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
function ensureAdjunctNeedReportStyles() {
    if (document.getElementById('adjunctNeedReportStyles')) return;
    const style = document.createElement('style');
    style.id = 'adjunctNeedReportStyles';
    style.textContent = `
        .adjunct-need-report {
            margin-bottom: 12px;
            border: 1px solid #d8dee4;
            border-radius: 12px;
            background: #ffffff;
            box-shadow: 0 1px 0 rgba(27, 31, 36, 0.04);
            overflow: hidden;
        }
        .adjunct-need-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 14px 10px;
            border-bottom: 1px solid #eaeef2;
            background: #f6f8fa;
        }
        .adjunct-need-head h3 {
            margin: 0;
            font-size: 0.95rem;
            line-height: 1.35;
            color: #24292f;
            letter-spacing: -0.01em;
        }
        .adjunct-need-head p {
            margin: 4px 0 0;
            color: #57606a;
            font-size: 0.8rem;
            line-height: 1.45;
            max-width: 72ch;
        }
        .adjunct-need-chip-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .adjunct-need-chip {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            padding: 4px 10px;
            border: 1px solid #d0d7de;
            background: #ffffff;
            color: #57606a;
            font-size: 0.73rem;
            font-weight: 600;
            line-height: 1;
            white-space: nowrap;
        }
        .adjunct-need-chip.warn {
            border-color: #d4a72c;
            background: #fff8c5;
            color: #7d4e00;
        }
        .adjunct-need-chip.info {
            border-color: #54aeff;
            background: #ddf4ff;
            color: #0550ae;
        }
        .adjunct-need-chip.success {
            border-color: #4ac26b;
            background: #dafbe1;
            color: #1a7f37;
        }
        .adjunct-need-banner {
            margin: 10px 12px 0;
            padding: 9px 10px;
            border-radius: 8px;
            border: 1px solid #54aeff;
            background: #ddf4ff;
            color: #0550ae;
            font-size: 0.8rem;
            line-height: 1.4;
        }
        .adjunct-need-banner.warn {
            border-color: #d4a72c;
            background: #fff8c5;
            color: #7d4e00;
        }
        .adjunct-need-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 10px;
            padding: 12px;
        }
        .adjunct-need-card {
            border: 1px solid #d8dee4;
            background: #f6f8fa;
            border-radius: 10px;
            padding: 10px;
        }
        .adjunct-need-card .label {
            display: block;
            color: #656d76;
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            font-weight: 600;
        }
        .adjunct-need-card .value {
            display: block;
            margin-top: 4px;
            color: #24292f;
            font-size: 1rem;
            font-weight: 700;
            line-height: 1.2;
        }
        .adjunct-need-card .sub {
            display: block;
            margin-top: 4px;
            color: #57606a;
            font-size: 0.75rem;
            line-height: 1.35;
        }
        .adjunct-need-card .value.warn { color: #7d4e00; }
        .adjunct-need-card .value.success { color: #1a7f37; }
        .adjunct-need-card .value.overfill { color: #9a6700; }
        .adjunct-need-quarter-wrap {
            padding: 0 12px 12px;
            overflow: auto;
        }
        .adjunct-need-quarter-table {
            width: 100%;
            min-width: 760px;
            border-collapse: collapse;
            border: 1px solid #d8dee4;
            border-radius: 10px;
            overflow: hidden;
        }
        .adjunct-need-quarter-table th,
        .adjunct-need-quarter-table td {
            border-bottom: 1px solid #eaeef2;
            padding: 8px 10px;
            text-align: left;
            vertical-align: top;
            font-size: 0.8rem;
            color: #24292f;
            white-space: nowrap;
        }
        .adjunct-need-quarter-table thead th {
            background: #f6f8fa;
            color: #57606a;
            font-size: 0.73rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .adjunct-need-quarter-table td.num {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        .adjunct-need-quarter-table tbody tr:last-child td {
            border-bottom: none;
        }
        .adjunct-need-quarter-table tr.total-row td {
            background: #f6f8fa;
            font-weight: 600;
        }
        .adjunct-need-sub {
            display: block;
            margin-top: 2px;
            color: #656d76;
            font-size: 0.72rem;
            line-height: 1.35;
            white-space: normal;
        }
        .adjunct-need-muted {
            color: #656d76;
        }
        .adjunct-need-gap {
            color: #7d4e00;
            font-weight: 600;
        }
        .adjunct-need-gap.good {
            color: #1a7f37;
        }
        .adjunct-need-overfill {
            color: #9a6700;
            font-weight: 600;
        }
        .adjunct-need-note {
            margin: 0;
            padding: 0 12px 12px;
            color: #656d76;
            font-size: 0.76rem;
            line-height: 1.45;
        }
        .adjunct-need-course-list {
            color: #57606a;
            font-size: 0.76rem;
            line-height: 1.35;
            white-space: normal;
            max-width: 280px;
        }
        .adjunct-need-empty {
            color: #57606a;
            background: #f6f8fa;
            white-space: normal !important;
            line-height: 1.45;
            padding: 14px 12px !important;
        }
        @media (max-width: 860px) {
            .adjunct-need-head {
                flex-direction: column;
            }
            .adjunct-need-chip-row {
                width: 100%;
            }
        }
    `;
    document.head.appendChild(style);
}

function getAdjunctNeedTargetValuesForCurrentYear() {
    if (!currentFilters.year || currentFilters.year === 'all') {
        return { fall: 0, winter: 0, spring: 0, total: 0, hasTargets: false, hasYearPlan: false };
    }
    const { yearData } = readCurrentYearPlanData(false);
    const adjunctTargets = yearData?.adjunctTargets || {};
    const fall = Number(adjunctTargets.fall) || 0;
    const winter = Number(adjunctTargets.winter) || 0;
    const spring = Number(adjunctTargets.spring) || 0;
    const total = Number((fall + winter + spring).toFixed(3));
    return {
        fall,
        winter,
        spring,
        total,
        hasTargets: total > 0,
        hasYearPlan: Boolean(yearData)
    };
}

function buildAdjunctNeedReportMetrics(yearData, adjunctData) {
    const quarterDefs = [
        { key: 'fall', label: 'Fall', sourceKey: 'Fall' },
        { key: 'winter', label: 'Winter', sourceKey: 'Winter' },
        { key: 'spring', label: 'Spring', sourceKey: 'Spring' }
    ];
    const targets = getAdjunctNeedTargetValuesForCurrentYear();
    const adjunctEntries = Object.entries(adjunctData || {});
    const unresolved = yearData?.meta?.unresolvedScheduleCourses || {};
    const unresolvedByQuarter = unresolved.byQuarter || {};

    const facultyRows = adjunctEntries.map(([name, data]) => {
        const byQuarter = data?.byQuarter || {};
        const fallWorkload = Number(byQuarter?.Fall?.workload) || 0;
        const winterWorkload = Number(byQuarter?.Winter?.workload) || 0;
        const springWorkload = Number(byQuarter?.Spring?.workload) || 0;
        const fallSections = Number(byQuarter?.Fall?.sections) || 0;
        const winterSections = Number(byQuarter?.Winter?.sections) || 0;
        const springSections = Number(byQuarter?.Spring?.sections) || 0;
        const coursePreview = (Array.isArray(data?.courses) ? data.courses : [])
            .slice(0, 4)
            .map((course) => `${course.quarter || '—'} ${course.courseCode || 'Course'}`)
            .join(' · ');
        const extraCourseCount = Math.max(0, (Array.isArray(data?.courses) ? data.courses.length : 0) - 4);

        return {
            facultyName: name,
            data,
            fallWorkload,
            winterWorkload,
            springWorkload,
            fallSections,
            winterSections,
            springSections,
            ayAssignedWorkload: Number(data?.totalWorkloadCredits) || 0,
            ayAssignedCredits: Number(data?.totalCredits) || 0,
            aySections: Number(data?.sections) || 0,
            coursePreview,
            extraCourseCount
        };
    }).sort((a, b) => b.ayAssignedWorkload - a.ayAssignedWorkload);

    const assignedByQuarter = {
        fall: facultyRows.reduce((sum, row) => sum + row.fallWorkload, 0),
        winter: facultyRows.reduce((sum, row) => sum + row.winterWorkload, 0),
        spring: facultyRows.reduce((sum, row) => sum + row.springWorkload, 0)
    };
    const assignedSectionsByQuarter = {
        fall: facultyRows.reduce((sum, row) => sum + row.fallSections, 0),
        winter: facultyRows.reduce((sum, row) => sum + row.winterSections, 0),
        spring: facultyRows.reduce((sum, row) => sum + row.springSections, 0)
    };
    const assignedCreditsByQuarter = {
        fall: facultyRows.reduce((sum, row) => sum + (Number(row.data?.byQuarter?.Fall?.credits) || 0), 0),
        winter: facultyRows.reduce((sum, row) => sum + (Number(row.data?.byQuarter?.Winter?.credits) || 0), 0),
        spring: facultyRows.reduce((sum, row) => sum + (Number(row.data?.byQuarter?.Spring?.credits) || 0), 0)
    };

    const quarterRows = quarterDefs.map((quarter) => {
        const target = Number(targets[quarter.key]) || 0;
        const assigned = Number(assignedByQuarter[quarter.key]) || 0;
        const assignedCredits = Number(assignedCreditsByQuarter[quarter.key]) || 0;
        const assignedSections = Number(assignedSectionsByQuarter[quarter.key]) || 0;
        const unresolvedBucket = unresolvedByQuarter[quarter.sourceKey] || {};
        const unresolvedWorkload = Number(unresolvedBucket.workload) || 0;
        const unresolvedSections = Number(unresolvedBucket.sections) || 0;
        const remainingNeed = targets.hasTargets ? Math.max(0, target - assigned) : null;
        const overfill = targets.hasTargets ? Math.max(0, assigned - target) : null;
        const coveragePercent = target > 0 ? Number(((assigned / target) * 100).toFixed(1)) : null;

        return {
            ...quarter,
            target,
            assigned,
            assignedCredits,
            assignedSections,
            unresolvedWorkload,
            unresolvedSections,
            remainingNeed,
            overfill,
            coveragePercent
        };
    });

    const totals = {
        target: Number((quarterRows.reduce((sum, row) => sum + row.target, 0)).toFixed(3)),
        assigned: Number((facultyRows.reduce((sum, row) => sum + row.ayAssignedWorkload, 0)).toFixed(3)),
        assignedCredits: Number((facultyRows.reduce((sum, row) => sum + row.ayAssignedCredits, 0)).toFixed(3)),
        assignedSections: facultyRows.reduce((sum, row) => sum + row.aySections, 0),
        unresolvedWorkload: Number(unresolved.totalWorkloadCredits) || 0,
        unresolvedCredits: Number(unresolved.totalCredits) || 0,
        unresolvedSections: Number(unresolved.count) || 0
    };
    totals.remainingNeed = targets.hasTargets ? Number(Math.max(0, totals.target - totals.assigned).toFixed(3)) : null;
    totals.overfill = targets.hasTargets ? Number(Math.max(0, totals.assigned - totals.target).toFixed(3)) : null;
    totals.coveragePercent = totals.target > 0 ? Number(((totals.assigned / totals.target) * 100).toFixed(1)) : null;

    return {
        targets,
        facultyRows,
        quarterRows,
        totals,
        unresolved,
        hasAdjunctAssignments: facultyRows.length > 0,
        hasTargetGap: totals.remainingNeed !== null && totals.remainingNeed > 0.01,
        hasOverfill: totals.overfill !== null && totals.overfill > 0.01
    };
}

function ensureAdjunctNeedReportContainer() {
    const table = document.getElementById('adjunctTable');
    if (!table) return null;
    const wrapper = table.closest('.chart-container') || table.parentElement;
    if (!wrapper) return null;

    let report = document.getElementById('adjunctNeedReport');
    if (!report) {
        report = document.createElement('div');
        report.id = 'adjunctNeedReport';
        report.className = 'adjunct-need-report';
        wrapper.insertBefore(report, table);
    }
    return { wrapper, table, report };
}

function renderAdjunctNeedSummaryReport(yearData, adjunctData) {
    ensureAdjunctNeedReportStyles();
    const refs = ensureAdjunctNeedReportContainer();
    if (!refs) return null;

    const metrics = buildAdjunctNeedReportMetrics(yearData, adjunctData);
    const { report } = refs;
    const isAllYearsView = currentFilters.year === 'all';
    const fallbackAdjunctDefaults = Array.isArray(yearData?.meta?.adjunctAssignedDefaultsApplied)
        ? yearData.meta.adjunctAssignedDefaultsApplied.length
        : 0;
    const targetChip = isAllYearsView
        ? '<span class="adjunct-need-chip info">Select a single AY for target comparisons</span>'
        : metrics.targets.hasTargets
        ? `<span class="adjunct-need-chip success">AY targets set (${formatWorkloadPlanNumber(metrics.targets.total)} workload cr)</span>`
        : '<span class="adjunct-need-chip warn">AY adjunct targets not set</span>';
    const unresolvedChip = metrics.totals.unresolvedSections > 0
        ? `<span class="adjunct-need-chip warn">TBD risk: ${metrics.totals.unresolvedSections} section${metrics.totals.unresolvedSections === 1 ? '' : 's'}</span>`
        : '<span class="adjunct-need-chip success">No TBD / unassigned sections</span>';
    const fallbackChip = fallbackAdjunctDefaults > 0
        ? `<span class="adjunct-need-chip info">${fallbackAdjunctDefaults} adjunct default target${fallbackAdjunctDefaults === 1 ? '' : 's'} derived from assigned load</span>`
        : '';
    const targetBanner = isAllYearsView
        ? `<div class="adjunct-need-banner">Quarter target comparisons are only available in a single academic-year view. The table below still shows current adjunct assignments and unresolved staffing risk for the displayed data.</div>`
        : metrics.targets.hasTargets
        ? ''
        : `<div class="adjunct-need-banner warn"><strong>Adjunct targets are not set for AY ${escapeWorkloadPlanHtml(currentFilters.year)}.</strong> Need/gap and coverage percentages are hidden until quarter targets are entered in AY Setup (interpreted as <strong>workload credits</strong>).</div>`;
    const unitsBanner = `<div class="adjunct-need-banner">Adjunct need metrics use <strong>workload credits</strong> (weighted workload units), with schedule credits and section counts shown as supporting context. TBD / unassigned sections are shown as staffing risk and are not counted as assigned adjunct coverage.</div>`;

    const gapValueClass = metrics.hasOverfill ? 'overfill' : (metrics.hasTargetGap ? 'warn' : 'success');
    const gapValueText = !metrics.targets.hasTargets
        ? 'Target not set'
        : metrics.hasOverfill
            ? `${formatWorkloadPlanNumber(metrics.totals.overfill)} overfill`
            : metrics.hasTargetGap
                ? `${formatWorkloadPlanNumber(metrics.totals.remainingNeed)} remaining`
                : 'Balanced';
    const gapSubText = !metrics.targets.hasTargets
        ? 'Set AY adjunct targets to compute remaining need'
        : metrics.hasOverfill
            ? `${formatWorkloadPlanNumber(metrics.totals.assigned)} assigned vs ${formatWorkloadPlanNumber(metrics.totals.target)} target`
            : metrics.hasTargetGap
                ? `${formatWorkloadPlanNumber(metrics.totals.target)} target vs ${formatWorkloadPlanNumber(metrics.totals.assigned)} assigned`
                : 'Assigned adjunct coverage matches the AY target';

    const quarterRowsHtml = metrics.quarterRows.map((row) => {
        const gapLabel = !metrics.targets.hasTargets
            ? '<span class="adjunct-need-muted">Target not set</span>'
            : row.remainingNeed > 0.01
                ? `<span class="adjunct-need-gap">${formatWorkloadPlanNumber(row.remainingNeed)}</span>`
                : '<span class="adjunct-need-gap good">0</span>';
        const overfillLabel = !metrics.targets.hasTargets
            ? '<span class="adjunct-need-muted">—</span>'
            : row.overfill > 0.01
                ? `<span class="adjunct-need-overfill">${formatWorkloadPlanNumber(row.overfill)}</span>`
                : '<span class="adjunct-need-muted">0</span>';
        const coverageLabel = row.coveragePercent === null
            ? '<span class="adjunct-need-muted">—</span>'
            : `${formatWorkloadPlanNumber(row.coveragePercent)}%`;

        return `
            <tr>
                <td><strong>${escapeWorkloadPlanHtml(row.label)}</strong></td>
                <td class="num">${formatWorkloadPlanNumber(row.target)}</td>
                <td class="num">
                    ${formatWorkloadPlanNumber(row.assigned)}
                    <span class="adjunct-need-sub">${formatWorkloadPlanNumber(row.assignedCredits)} sched cr · ${row.assignedSections} section${row.assignedSections === 1 ? '' : 's'}</span>
                </td>
                <td class="num">${gapLabel}</td>
                <td class="num">${overfillLabel}</td>
                <td class="num">
                    ${formatWorkloadPlanNumber(row.unresolvedWorkload)}
                    <span class="adjunct-need-sub">${row.unresolvedSections} TBD section${row.unresolvedSections === 1 ? '' : 's'}</span>
                </td>
                <td class="num">${coverageLabel}</td>
            </tr>
        `;
    }).join('');

    const totalCoverageLabel = metrics.totals.coveragePercent === null
        ? '<span class="adjunct-need-muted">—</span>'
        : `${formatWorkloadPlanNumber(metrics.totals.coveragePercent)}%`;
    const totalGapLabel = !metrics.targets.hasTargets
        ? '<span class="adjunct-need-muted">Target not set</span>'
        : metrics.totals.remainingNeed > 0.01
            ? `<span class="adjunct-need-gap">${formatWorkloadPlanNumber(metrics.totals.remainingNeed)}</span>`
            : '<span class="adjunct-need-gap good">0</span>';
    const totalOverfillLabel = !metrics.targets.hasTargets
        ? '<span class="adjunct-need-muted">—</span>'
        : metrics.totals.overfill > 0.01
            ? `<span class="adjunct-need-overfill">${formatWorkloadPlanNumber(metrics.totals.overfill)}</span>`
            : '<span class="adjunct-need-muted">0</span>';

    report.innerHTML = `
        <div class="adjunct-need-head">
            <div>
                <h3>Projected Adjunct Need (Quarter + AY)</h3>
                <p>Adjunct planning is reported as <strong>need / assigned coverage / remaining gap</strong>, not full-time utilization. ${isAllYearsView ? 'Select a single academic year to compare against AY Setup quarter targets.' : 'Targets come from AY Setup adjunct targets (quarter workload-credit goals) when configured.'}</p>
            </div>
            <div class="adjunct-need-chip-row">
                ${targetChip}
                ${unresolvedChip}
                ${fallbackChip}
            </div>
        </div>
        ${targetBanner}
        ${unitsBanner}
        <div class="adjunct-need-summary">
            <div class="adjunct-need-card">
                <span class="label">Projected Adjunct Need (AY Target)</span>
                <span class="value">${metrics.targets.hasTargets ? `${formatWorkloadPlanNumber(metrics.totals.target)} workload cr` : 'Not set'}</span>
                <span class="sub">AY Setup targets: F ${formatWorkloadPlanNumber(metrics.targets.fall)} · W ${formatWorkloadPlanNumber(metrics.targets.winter)} · S ${formatWorkloadPlanNumber(metrics.targets.spring)}</span>
            </div>
            <div class="adjunct-need-card">
                <span class="label">Assigned Adjunct Coverage</span>
                <span class="value">${formatWorkloadPlanNumber(metrics.totals.assigned)} workload cr</span>
                <span class="sub">${metrics.facultyRows.length} adjunct faculty · ${metrics.totals.assignedSections} section${metrics.totals.assignedSections === 1 ? '' : 's'} · ${formatWorkloadPlanNumber(metrics.totals.assignedCredits)} sched cr</span>
            </div>
            <div class="adjunct-need-card">
                <span class="label">Remaining Need / Overfill</span>
                <span class="value ${gapValueClass}">${gapValueText}</span>
                <span class="sub">${gapSubText}</span>
            </div>
            <div class="adjunct-need-card">
                <span class="label">TBD / Unassigned Staffing Risk</span>
                <span class="value ${metrics.totals.unresolvedSections > 0 ? 'warn' : 'success'}">${metrics.totals.unresolvedSections} section${metrics.totals.unresolvedSections === 1 ? '' : 's'}</span>
                <span class="sub">${formatWorkloadPlanNumber(metrics.totals.unresolvedWorkload)} workload cr · ${formatWorkloadPlanNumber(metrics.totals.unresolvedCredits)} sched cr (not counted as assigned)</span>
            </div>
            <div class="adjunct-need-card">
                <span class="label">Coverage vs AY Target</span>
                <span class="value">${metrics.targets.hasTargets && metrics.totals.coveragePercent !== null ? `${formatWorkloadPlanNumber(metrics.totals.coveragePercent)}%` : '—'}</span>
                <span class="sub">${metrics.targets.hasTargets ? 'Assigned adjunct workload as % of AY adjunct target' : 'Hidden until targets are entered'}</span>
            </div>
        </div>
        <div class="adjunct-need-quarter-wrap">
            <table class="adjunct-need-quarter-table">
                <thead>
                    <tr>
                        <th>Quarter</th>
                        <th>Target (Workload Cr)</th>
                        <th>Assigned Adjunct Coverage</th>
                        <th>Remaining Need</th>
                        <th>Overfill</th>
                        <th>TBD Risk</th>
                        <th>Coverage %</th>
                    </tr>
                </thead>
                <tbody>
                    ${quarterRowsHtml}
                    <tr class="total-row">
                        <td><strong>AY Total</strong></td>
                        <td class="num">${formatWorkloadPlanNumber(metrics.totals.target)}</td>
                        <td class="num">
                            ${formatWorkloadPlanNumber(metrics.totals.assigned)}
                            <span class="adjunct-need-sub">${formatWorkloadPlanNumber(metrics.totals.assignedCredits)} sched cr · ${metrics.totals.assignedSections} section${metrics.totals.assignedSections === 1 ? '' : 's'}</span>
                        </td>
                        <td class="num">${totalGapLabel}</td>
                        <td class="num">${totalOverfillLabel}</td>
                        <td class="num">
                            ${formatWorkloadPlanNumber(metrics.totals.unresolvedWorkload)}
                            <span class="adjunct-need-sub">${metrics.totals.unresolvedSections} TBD section${metrics.totals.unresolvedSections === 1 ? '' : 's'}</span>
                        </td>
                        <td class="num">${totalCoverageLabel}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="adjunct-need-note">Adjunct targets are interpreted as <strong>workload credits</strong> (the same weighted workload units used throughout this dashboard). Schedule credits and section counts are included as supporting context for staffing decisions.</p>
    `;

    return metrics;
}

function renderAdjunctFaculty(adjunctData) {
    const faculty = Object.entries(adjunctData || {});
    const headerTitle = document.querySelector('#adjunctBadge')?.previousElementSibling;
    if (headerTitle) {
        headerTitle.textContent = 'Projected Adjunct Need';
    }

    const metrics = renderAdjunctNeedSummaryReport(currentYearData, adjunctData || {});

    // Update badge
    const badge = document.getElementById('adjunctBadge');
    if (badge) {
        const assignedCount = faculty.length;
        const targetText = metrics?.targets?.hasTargets
            ? ` · ${formatWorkloadPlanNumber(metrics.totals.coveragePercent || 0)}% target covered`
            : ' · target not set';
        badge.textContent = `${assignedCount} Assigned Adjunct${assignedCount === 1 ? '' : 's'}${targetText}`;
    }

    const table = document.getElementById('adjunctTable');
    if (!table) return;

    const thead = table.querySelector('thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Adjunct Faculty</th>
                <th>Fall (wl)</th>
                <th>Winter (wl)</th>
                <th>Spring (wl)</th>
                <th>AY Assigned (wl)</th>
                <th>AY Credits</th>
                <th>Sections</th>
                <th>Course Preview</th>
                <th>Actions</th>
            </tr>
        `;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    const rows = metrics?.facultyRows || [];
    if (!rows.length) {
        const emptyRow = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.className = 'adjunct-need-empty';
        cell.textContent = 'No adjunct assignments are currently in the scheduler draft for this AY. Use the quarter targets above to plan need, and monitor TBD / unassigned sections as staffing risk.';
        emptyRow.appendChild(cell);
        tbody.appendChild(emptyRow);
        return;
    }

    const ayTargetTotal = Number(metrics?.totals?.target) || 0;
    rows.forEach((rowData) => {
        const row = document.createElement('tr');

        const nameCell = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = rowData.facultyName;
        nameCell.appendChild(strong);
        const nameSub = document.createElement('span');
        nameSub.className = 'adjunct-need-sub';
        nameSub.textContent = 'Assigned adjunct coverage';
        nameCell.appendChild(nameSub);
        row.appendChild(nameCell);

        ['fall', 'winter', 'spring'].forEach((quarterKey) => {
            const qCell = document.createElement('td');
            qCell.className = 'num';
            const workloadValue = quarterKey === 'fall'
                ? rowData.fallWorkload
                : quarterKey === 'winter'
                    ? rowData.winterWorkload
                    : rowData.springWorkload;
            const sectionCount = quarterKey === 'fall'
                ? rowData.fallSections
                : quarterKey === 'winter'
                    ? rowData.winterSections
                    : rowData.springSections;
            qCell.textContent = formatWorkloadPlanNumber(workloadValue);
            const sub = document.createElement('span');
            sub.className = 'adjunct-need-sub';
            sub.textContent = `${sectionCount} section${sectionCount === 1 ? '' : 's'}`;
            qCell.appendChild(sub);
            row.appendChild(qCell);
        });

        const ayAssignedCell = document.createElement('td');
        ayAssignedCell.className = 'num';
        const ayAssignedStrong = document.createElement('strong');
        ayAssignedStrong.textContent = formatWorkloadPlanNumber(rowData.ayAssignedWorkload);
        ayAssignedCell.appendChild(ayAssignedStrong);
        const coverageSub = document.createElement('span');
        coverageSub.className = 'adjunct-need-sub';
        if (ayTargetTotal > 0) {
            const pct = Number(((rowData.ayAssignedWorkload / ayTargetTotal) * 100).toFixed(1));
            coverageSub.textContent = `${formatWorkloadPlanNumber(pct)}% of AY target`;
        } else {
            coverageSub.textContent = 'AY target not set';
        }
        ayAssignedCell.appendChild(coverageSub);
        row.appendChild(ayAssignedCell);

        const creditsCell = document.createElement('td');
        creditsCell.className = 'num';
        creditsCell.textContent = formatWorkloadPlanNumber(rowData.ayAssignedCredits);
        row.appendChild(creditsCell);

        const sectionsCell = document.createElement('td');
        sectionsCell.className = 'num';
        sectionsCell.textContent = String(rowData.aySections);
        row.appendChild(sectionsCell);

        const courseCell = document.createElement('td');
        courseCell.className = 'adjunct-need-course-list';
        if (rowData.coursePreview) {
            courseCell.textContent = rowData.coursePreview + (rowData.extraCourseCount > 0 ? ` · +${rowData.extraCourseCount} more` : '');
        } else {
            courseCell.textContent = 'No course detail available';
        }
        row.appendChild(courseCell);

        row.appendChild(createActionsCell(rowData.facultyName));
        tbody.appendChild(row);
    });
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
            row.appendChild(createFacultyNameActionCell(name, formatFacultyName(name, data)));
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
            row.appendChild(createFacultyNameActionCell(name, name));

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

function openWorkloadPlanEditorFromFacultyNameClick(facultyName) {
    if (!currentFilters.year || currentFilters.year === 'all') {
        alert('Select a single academic year first to view/edit an AY workload plan.');
        return;
    }
    openWorkloadPlanEditorForFaculty(facultyName);
}

function createFacultyNameActionCell(facultyName, label) {
    const td = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workload-plan-name-link';
    button.title = `Open AY workload plan for ${facultyName}`;
    button.textContent = String(label || facultyName || '');
    button.onclick = () => openWorkloadPlanEditorFromFacultyNameClick(facultyName);
    td.appendChild(button);
    return td;
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
    exportBtn.title = 'Export Workload Sheet (.xlsx)';
    exportBtn.setAttribute('aria-label', 'Export Workload Sheet (.xlsx)');
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
    const cards = document.getElementById('appliedLearningCards');
    const badge = document.getElementById('appliedLearningBadge');
    if (!cards) return;

    const configuredCourses = getAppliedLearningSummaryConfig();
    const summaryByCode = new Map(
        configuredCourses.map((entry) => [
            entry.code,
            {
                ...entry,
                credits: 0,
                workload: 0,
                sections: 0
            }
        ])
    );

    let totalCredits = 0;
    let totalWorkload = 0;

    Object.values(facultyData || {}).forEach((faculty) => {
        totalCredits += Number(faculty?.appliedLearningCredits) || 0;
        totalWorkload += Number(faculty?.appliedLearningWorkload) || 0;

        Object.entries(faculty?.appliedLearning || {}).forEach(([code, details]) => {
            const bucket = summaryByCode.get(code);
            if (!bucket) return;
            bucket.credits += Number(details?.credits) || 0;
            bucket.workload += Number(details?.workload) || 0;
            bucket.sections += Number(details?.sections) || 0;
        });
    });

    if (badge) {
        badge.textContent = configuredCourses.map((entry) => entry.code).join(' / ');
    }

    cards.innerHTML = '';

    summaryByCode.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-label">${escapeWorkloadPlanHtml(entry.code)} (${escapeWorkloadPlanHtml(entry.title)})</div>
            <div class="stat-value">${formatWorkloadPlanNumber(entry.credits)} credits</div>
            <div class="stat-subtitle">${formatWorkloadPlanNumber(entry.workload)} workload credits (${entry.sections} sections)</div>
        `;
        cards.appendChild(card);
    });

    const totalCard = document.createElement('div');
    totalCard.className = 'stat-card';
    totalCard.innerHTML = `
        <div class="stat-label">Total Applied Learning</div>
        <div class="stat-value">${formatWorkloadPlanNumber(totalCredits)} credits</div>
        <div class="stat-subtitle">${formatWorkloadPlanNumber(totalWorkload)} workload credits</div>
    `;
    cards.appendChild(totalCard);
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
    if (!normalized) return false;
    const appliedLearningCodes = new Set(
        getAppliedLearningCoursesForDashboard()
            .map((entry) => String(entry?.code || '').replace(/\s+/g, ' ').trim().toUpperCase())
            .filter(Boolean)
    );
    return appliedLearningCodes.has(normalized);
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
    if (typeof window !== 'undefined' && window.WorkloadExportMapping && window.WorkloadExportMapping.buildQuarterExportRows) {
        return window.WorkloadExportMapping.buildQuarterExportRows(facultyRecord, {
            getDepartmentIdentity,
            isAppliedLearningCode,
            roundToTenths
        });
    }
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
            label: code || (getDepartmentIdentity().code || 'COURSE'),
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
                label: `${getDepartmentIdentity().code || 'DEPT'} X95/99`,
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

async function ensureJsZipLoaded() {
    if (typeof window.JSZip !== 'undefined') {
        return window.JSZip;
    }
    if (jsZipLoadPromise) {
        return jsZipLoadPromise;
    }

    jsZipLoadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-jszip="workload-export"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.JSZip));
            existing.addEventListener('error', () => reject(new Error('Failed to load JSZip library.')));
            return;
        }

        const script = document.createElement('script');
        script.src = WORKLOAD_EXPORT_JSZIP_URL;
        script.async = true;
        script.dataset.jszip = 'workload-export';
        script.onload = () => {
            if (typeof window.JSZip === 'undefined') {
                reject(new Error('JSZip loaded but global object was not available.'));
                return;
            }
            resolve(window.JSZip);
        };
        script.onerror = () => reject(new Error('Failed to load JSZip library from CDN.'));
        document.head.appendChild(script);
    }).finally(() => {
        if (typeof window.JSZip === 'undefined') {
            jsZipLoadPromise = null;
        }
    });

    return jsZipLoadPromise;
}

async function getWorkloadExportTemplateBuffer() {
    if (workloadExportTemplateBufferPromise) {
        return workloadExportTemplateBufferPromise;
    }

    workloadExportTemplateBufferPromise = fetch(WORKLOAD_EXPORT_TEMPLATE_PATH, { cache: 'no-store' })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Template workbook not found (${response.status}).`);
            }
            return response.arrayBuffer();
        })
        .catch((error) => {
            workloadExportTemplateBufferPromise = null;
            throw error;
        });

    return workloadExportTemplateBufferPromise;
}

function getFacultyRecordForExport(facultyName) {
    const all = currentYearData?.all || {};
    return all?.[facultyName] || null;
}

function getQuarterColumnMap() {
    if (typeof window !== 'undefined' && window.WorkloadExportMapping && window.WorkloadExportMapping.getQuarterColumnMap) {
        return window.WorkloadExportMapping.getQuarterColumnMap();
    }
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

function buildWorkloadBatchZipFilename(academicYear) {
    const { compact } = getAcademicYearYears(academicYear);
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `WorkloadSheets_${compact}_${y}${m}${d}.zip`;
}

function getBatchWorkloadExportFacultyNames() {
    const rows = buildWorkloadPlanningRows(currentYearData)
        .filter((row) => row && row.active !== false)
        .map((row) => String(row.facultyName || '').trim())
        .filter(Boolean);
    const unique = Array.from(new Set(rows));
    return unique.sort((a, b) => a.localeCompare(b));
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

async function buildFacultyWorkloadExportArtifact(facultyName, options = {}) {
    const academicYear = String(options.academicYear || currentFilters.year || '').trim();
    if (!academicYear || academicYear === 'all') {
        throw new Error('Select a single academic year before exporting workload sheets.');
    }

    const facultyRecord = getFacultyRecordForExport(facultyName);
    if (!facultyRecord) {
        throw new Error(`Could not find workload data for ${facultyName} in AY ${academicYear}.`);
    }

    const quarterRowsByQuarter = buildQuarterExportRows(facultyRecord);
    const ExcelJS = options.ExcelJS || await ensureExcelJsLoaded();
    const templateBuffer = options.templateBuffer || await getWorkloadExportTemplateBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer.slice(0));

    const ws = workbook.getWorksheet(WORKLOAD_EXPORT_TEMPLATE_SHEET) || workbook.worksheets?.[0];
    if (!ws) {
        throw new Error('Template worksheet not found.');
    }

    const years = getAcademicYearYears(academicYear);
    ws.getCell('A1').value = inferFacultyWorkloadExportRole(facultyRecord);
    ws.getCell('A2').value = getTemplateFacultyName(facultyName);
    ws.getCell('B1').value = `Fall Quarter, ${years.startYear}`;
    ws.getCell('E1').value = `Winter Quarter, ${years.endYear}`;
    ws.getCell('H1').value = `Spring Quarter, ${years.endYear}`;

    applyQuarterRowsToWorksheet(ws, quarterRowsByQuarter);
    applyWorkloadSummaryAssumptions(ws, facultyRecord, quarterRowsByQuarter);

    const fileBuffer = await workbook.xlsx.writeBuffer();
    const filename = buildWorkloadExportFilename(facultyName, academicYear);

    return {
        facultyName,
        academicYear,
        filename,
        fileBuffer,
        facultyRecord
    };
}

async function exportFacultyWorkloadSheet(facultyName) {
    try {
        const artifact = await buildFacultyWorkloadExportArtifact(facultyName);
        triggerBlobDownload(
            new Blob([artifact.fileBuffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }),
            artifact.filename
        );

        console.log(`📤 Exported workload sheet for ${facultyName}: ${artifact.filename}`);
    } catch (error) {
        console.error('Workload export failed:', error);
        alert(`Workload export failed: ${error.message}`);
    }
}

async function exportAllFacultyWorkloadSheetsZip() {
    try {
        if (!currentFilters.year || currentFilters.year === 'all') {
            alert('Select a single academic year before running batch export.');
            return;
        }

        const facultyNames = getBatchWorkloadExportFacultyNames();
        if (!facultyNames.length) {
            alert(`No faculty workload rows found for AY ${currentFilters.year} to export.`);
            return;
        }

        setWorkloadPlanningStatus(`Starting batch workload export for ${facultyNames.length} faculty...`, 'info');

        const [ExcelJS, JSZip, templateBuffer] = await Promise.all([
            ensureExcelJsLoaded(),
            ensureJsZipLoaded(),
            getWorkloadExportTemplateBuffer()
        ]);

        const zip = new JSZip();
        const rootFolder = `${currentFilters.year}`;
        const report = {
            academicYear: currentFilters.year,
            generatedAt: new Date().toISOString(),
            totalRequested: facultyNames.length,
            exportedCount: 0,
            failedCount: 0,
            successes: [],
            failures: []
        };

        for (const facultyName of facultyNames) {
            try {
                const artifact = await buildFacultyWorkloadExportArtifact(facultyName, {
                    academicYear: currentFilters.year,
                    ExcelJS,
                    templateBuffer
                });
                zip.file(`${rootFolder}/${artifact.filename}`, artifact.fileBuffer);
                report.successes.push({ facultyName, filename: artifact.filename });
            } catch (error) {
                console.error(`Batch workload export failed for ${facultyName}:`, error);
                report.failures.push({
                    facultyName,
                    error: String(error?.message || error || 'Unknown error')
                });
            }
        }

        report.exportedCount = report.successes.length;
        report.failedCount = report.failures.length;
        zip.file(`${rootFolder}/batch-export-report.json`, JSON.stringify(report, null, 2));

        if (!report.exportedCount) {
            throw new Error(`Batch export failed for all ${facultyNames.length} faculty. See console for details.`);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFilename = buildWorkloadBatchZipFilename(currentFilters.year);
        triggerBlobDownload(zipBlob, zipFilename);

        if (report.failedCount > 0) {
            setWorkloadPlanningStatus(`Batch export complete: ${report.exportedCount} exported, ${report.failedCount} failed (downloaded ${zipFilename}).`, 'warn');
            alert(`Batch export completed with warnings.\n\nExported: ${report.exportedCount}\nFailed: ${report.failedCount}\n\nA report is included in ${zipFilename}.`);
        } else {
            setWorkloadPlanningStatus(`Batch export complete: ${report.exportedCount} workload sheets exported to ${zipFilename}.`, 'success');
        }
        console.log('📦 Batch workload export report:', report);
    } catch (error) {
        console.error('Batch workload export failed:', error);
        setWorkloadPlanningStatus(`Batch workload export failed: ${error.message}`, 'warn');
        alert(`Batch workload export failed: ${error.message}`);
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
