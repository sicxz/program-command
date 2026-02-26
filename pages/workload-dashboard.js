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
let jsZipLoadPromise = null;
let workloadExportTemplateBufferPromise = null;

const WORKLOAD_EXPORT_TEMPLATE_PATH = '../docs/examples/workload/MasingaleT_Wkld_2526_20May2025.xlsx';
const WORKLOAD_EXPORT_TEMPLATE_SHEET = 'Sheet1';
const WORKLOAD_EXPORT_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const WORKLOAD_EXPORT_JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const WORKLOAD_PLAN_STORAGE_KEY = 'programCommandAySetup';
const WORKLOAD_PLAN_ROLE_OPTIONS = [
    'Full Professor',
    'Associate Professor',
    'Assistant Professor',
    'Tenure/Tenure-track',
    'Senior Lecturer',
    'Lecturer',
    'Adjunct',
    'Staff/Other'
];
const WORKLOAD_PLAN_ROLE_TARGET_DEFAULTS = {
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
const workloadPlanningUiState = {
    modalOpen: false,
    editingRecordId: null,
    editingFacultyName: '',
    statusMessage: '',
    statusLevel: 'info'
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
        <p class="prelim-workload-note prelim-workload-mini">Use AY Setup + Release Time dashboards to replace fallback assumptions with final targets/release allocations. Use the ⬇️ button in each faculty row to export an <strong>Export Workload Sheet (.xlsx)</strong> draft.</p>
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
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function cloneWorkloadPlanValue(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
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
    if (globalThis.crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `ayplan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    const releaseCredits = Number(existingPlanRecord?.releaseCredits);
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
        isChair: chair
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

function ensureWorkloadPlanningStyles() {
    if (document.getElementById('workloadPlanningDashboardStyles')) return;
    const style = document.createElement('style');
    style.id = 'workloadPlanningDashboardStyles';
    style.textContent = `
        .workload-plan-panel {
            margin: 0 0 18px;
            padding: 16px;
            border-radius: 14px;
            border: 1px solid rgba(15, 23, 42, 0.12);
            background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
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
            color: #0f172a;
        }
        .workload-plan-header p {
            margin: 4px 0 0;
            font-size: 0.86rem;
            color: #475569;
        }
        .workload-plan-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .workload-plan-btn {
            border: 1px solid rgba(15, 23, 42, 0.15);
            background: #ffffff;
            color: #0f172a;
            border-radius: 8px;
            padding: 7px 10px;
            font-size: 0.82rem;
            cursor: pointer;
        }
        .workload-plan-btn.primary {
            background: #0f766e;
            border-color: #0f766e;
            color: #ffffff;
        }
        .workload-plan-btn:hover {
            filter: brightness(0.98);
        }
        .workload-plan-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 10px;
            margin: 8px 0 12px;
        }
        .workload-plan-summary-card {
            border-radius: 10px;
            border: 1px solid rgba(15, 23, 42, 0.09);
            background: rgba(255,255,255,0.9);
            padding: 10px;
        }
        .workload-plan-summary-card .label {
            font-size: 0.75rem;
            color: #64748b;
            display: block;
        }
        .workload-plan-summary-card .value {
            font-size: 1rem;
            font-weight: 700;
            color: #0f172a;
        }
        .workload-plan-statusline {
            min-height: 20px;
            margin: 4px 0 10px;
            font-size: 0.82rem;
            color: #475569;
        }
        .workload-plan-statusline.success { color: #065f46; }
        .workload-plan-statusline.warn { color: #92400e; }
        .workload-plan-table-wrap {
            overflow: auto;
            border: 1px solid rgba(15, 23, 42, 0.08);
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
            background: #f8fafc;
            color: #334155;
            font-size: 0.76rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .workload-plan-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .workload-plan-table td.name {
            min-width: 180px;
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
        .workload-plan-row-actions {
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }
        .workload-plan-row-btn {
            border: 1px solid rgba(15, 23, 42, 0.12);
            background: #fff;
            color: #0f172a;
            border-radius: 7px;
            padding: 5px 8px;
            font-size: 0.75rem;
            cursor: pointer;
        }
        .workload-plan-row-btn.edit {
            background: #0f172a;
            color: #fff;
            border-color: #0f172a;
        }
        .workload-plan-note {
            margin-top: 8px;
            color: #64748b;
            font-size: 0.78rem;
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
            .workload-plan-derived-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
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
    return panel;
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
                    </div>
                    <div class="workload-plan-field full">
                        <label for="workloadPlanReleaseReason">Release Reason</label>
                        <input id="workloadPlanReleaseReason" type="text" placeholder="Chair, leave, scholarship, etc.">
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
        }
    });

    overlay.querySelector('#workloadPlanEditorForm').addEventListener('submit', handleWorkloadPlanEditorSubmit);
    overlay.querySelector('#workloadPlanChair').addEventListener('change', handleWorkloadPlanChairToggle);
    overlay.querySelector('#workloadPlanRole').addEventListener('change', handleWorkloadPlanRoleChange);
    overlay.querySelector('#workloadPlanTargetCredits').addEventListener('input', updateWorkloadPlanDerivedPreview);
    overlay.querySelector('#workloadPlanReleaseCredits').addEventListener('input', updateWorkloadPlanDerivedPreview);

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
        const ayUtilization = netTarget > 0 ? Number(((ayTotal / netTarget) * 100).toFixed(1)) : 0;
        const gap = Number((netTarget - ayTotal).toFixed(2));
        const active = planRecord ? (planRecord.active !== false) : true;
        const chair = Boolean(defaults.isChair);

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
            fallUtilization: inferQuarterUtilization(fall, netTarget),
            winterUtilization: inferQuarterUtilization(winter, netTarget),
            springUtilization: inferQuarterUtilization(spring, netTarget),
            gap,
            notes: defaults.notes || '',
            releaseReason: defaults.releaseReason || ''
        };

        row.status = getPlanningRowStatus(row);
        return row;
    });

    return rows.sort((a, b) => {
        const aInactive = a.status === 'inactive' ? 1 : 0;
        const bInactive = b.status === 'inactive' ? 1 : 0;
        if (aInactive !== bInactive) return aInactive - bInactive;
        return a.facultyName.localeCompare(b.facultyName);
    });
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

    const tableRowsHtml = rows.length
        ? rows.map((row) => {
            const planLabel = row.hasAyPlan ? 'AY Plan' : 'Fallback';
            const chairTag = row.chair ? '<span class="workload-plan-sub">Chair</span>' : '';
            const fallbackTag = row.hasAyPlan ? '' : '<span class="workload-plan-sub">Using fallback assumptions</span>';
            const releaseTag = row.releaseReason ? `<span class="workload-plan-sub">${escapeWorkloadPlanHtml(row.releaseReason)}</span>` : '';
            return `
                <tr data-faculty-name="${escapeWorkloadPlanHtml(row.facultyName)}">
                    <td class="name">
                        <strong>${escapeWorkloadPlanHtml(row.facultyName)}</strong>
                        ${chairTag}
                        ${fallbackTag}
                    </td>
                    <td>${escapeWorkloadPlanHtml(row.role || '—')}</td>
                    <td>${row.chair ? 'Yes' : '—'}</td>
                    <td class="num">${formatWorkloadPlanNumber(row.fall)}</td>
                    <td class="num">${formatWorkloadPlanNumber(row.winter)}</td>
                    <td class="num">${formatWorkloadPlanNumber(row.spring)}</td>
                    <td class="num">
                        ${formatWorkloadPlanNumber(row.ayTotal)}
                        <span class="workload-plan-sub">${formatWorkloadPlanNumber(row.ayUtilization)}% AY util</span>
                    </td>
                    <td class="num">${formatWorkloadPlanNumber(row.target)}</td>
                    <td class="num">
                        ${formatWorkloadPlanNumber(row.release)}
                        ${releaseTag}
                    </td>
                    <td class="num">${formatWorkloadPlanNumber(row.netTarget)}</td>
                    <td class="num">
                        F ${formatWorkloadPlanNumber(row.fallUtilization)}%
                        <span class="workload-plan-sub">W ${formatWorkloadPlanNumber(row.winterUtilization)}% · S ${formatWorkloadPlanNumber(row.springUtilization)}%</span>
                    </td>
                    <td class="num">${escapeWorkloadPlanHtml(getPlanningGapLabel(row.gap))}</td>
                    <td>
                        <span class="workload-plan-badge ${row.status}">${getPlanningStatusBadgeLabel(row.status)}</span>
                        <span class="workload-plan-sub">${planLabel}</span>
                    </td>
                    <td>
                        <div class="workload-plan-row-actions">
                            <button type="button" class="workload-plan-row-btn edit" data-action="edit-plan" data-faculty="${escapeWorkloadPlanHtml(row.facultyName)}">Edit Plan</button>
                            <button type="button" class="workload-plan-row-btn" data-action="export-plan-sheet" data-faculty="${escapeWorkloadPlanHtml(row.facultyName)}">Export</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('')
        : '<tr><td colspan="14">No faculty workload rows found for this year yet. Add schedule assignments or seed/import an AY faculty plan.</td></tr>';

    const statusClass = workloadPlanningUiState.statusMessage
        ? (workloadPlanningUiState.statusLevel === 'warn' ? 'warn' : workloadPlanningUiState.statusLevel === 'success' ? 'success' : '')
        : '';
    const previousAy = getPreviousAcademicYearValue(currentFilters.year);

    panel.hidden = false;
    panel.innerHTML = `
        <div class="workload-plan-header">
            <div>
                <h3>Workload Planning Dashboard (AY ${escapeWorkloadPlanHtml(currentFilters.year)})</h3>
                <p>Chair-editable workload settings for target credits, chair/release time, and AY plan coverage. This feeds preliminary workload calculations and export sheets.</p>
            </div>
            <div class="workload-plan-actions">
                <button type="button" class="workload-plan-btn primary" data-action="batch-export-plan-sheets">Export All Workload Sheets (.zip)</button>
                <button type="button" class="workload-plan-btn" data-action="seed-plan-from-current">Seed Missing Faculty From Current AY Schedule</button>
                <button type="button" class="workload-plan-btn" data-action="copy-prev-plan"${previousAy ? '' : ' disabled'}>Copy ${escapeWorkloadPlanHtml(previousAy || 'Previous AY')} Plan</button>
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
        <div class="workload-plan-statusline ${statusClass}">${escapeWorkloadPlanHtml(workloadPlanningUiState.statusMessage || '')}</div>
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
        <p class="workload-plan-note">Quarter utilization uses a provisional denominator of one-third of the AY net target. Update AY plan records (role/chair/release/target) to replace fallback assumptions before final exports.</p>
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

    overlay.dataset.facultyName = row.facultyName;
    overlay.classList.add('active');
    updateWorkloadPlanDerivedPreview();
}

function closeWorkloadPlanEditorModal() {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    workloadPlanningUiState.modalOpen = false;
    workloadPlanningUiState.editingRecordId = null;
    workloadPlanningUiState.editingFacultyName = '';
}

function getWorkloadPlanEditorValues() {
    const overlay = document.getElementById('workloadPlanEditorOverlay');
    if (!overlay) return null;

    const target = Number(overlay.querySelector('#workloadPlanTargetCredits').value);
    const release = Number(overlay.querySelector('#workloadPlanReleaseCredits').value);
    const safeTarget = Number.isFinite(target) && target >= 0 ? target : 0;
    const safeRelease = Number.isFinite(release) && release >= 0 ? release : 0;
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
        active: overlay.querySelector('#workloadPlanActive').checked
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
    const net = Math.max(0, (Number(values.annualTargetCredits) || 0) - (Number(values.releaseCredits) || 0));
    const ayUtil = net > 0 ? (ayTotal / net) * 100 : 0;

    overlay.querySelector('#workloadPlanDerivedFall').textContent = `${formatWorkloadPlanNumber(fall)} (${formatWorkloadPlanNumber(inferQuarterUtilization(fall, net))}%)`;
    overlay.querySelector('#workloadPlanDerivedWinter').textContent = `${formatWorkloadPlanNumber(winter)} (${formatWorkloadPlanNumber(inferQuarterUtilization(winter, net))}%)`;
    overlay.querySelector('#workloadPlanDerivedSpring').textContent = `${formatWorkloadPlanNumber(spring)} (${formatWorkloadPlanNumber(inferQuarterUtilization(spring, net))}%)`;
    overlay.querySelector('#workloadPlanDerivedAy').textContent = `${formatWorkloadPlanNumber(ayTotal)} (${formatWorkloadPlanNumber(ayUtil)}%)`;
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

    if (checked) {
        if (!reasonInput.value.trim()) {
            reasonInput.value = 'Chair';
        }
        if (!release && target >= 18) {
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

    const values = getWorkloadPlanEditorValues();
    if (!values || !values.name) {
        alert('Faculty name is required.');
        return;
    }

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
        active: values.active
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
            active: true
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
    if (action === 'open-ay-setup') {
        window.location.href = 'academic-year-setup.html';
    }
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
