
// Faculty color mapping
const facultyColors = {
    'T.Masingale': { class: 'faculty-masingale', color: '#667eea', name: 'T.Masingale' },
    'T. Masingale': { class: 'faculty-masingale', color: '#667eea', name: 'T.Masingale' },
    'S.Durr': { class: 'faculty-durr', color: '#e67e22', name: 'S.Durr' },
    'C.Manikoth': { class: 'faculty-manikoth', color: '#27ae60', name: 'C.Manikoth' },
    'Manikoth': { class: 'faculty-manikoth', color: '#27ae60', name: 'C.Manikoth' },
    'S.Mills': { class: 'faculty-mills', color: '#9b59b6', name: 'S.Mills' },
    'M.Lybbert': { class: 'faculty-lybbert', color: '#e74c3c', name: 'M.Lybbert' },
    'G.Hustrulid': { class: 'faculty-hustrulid', color: '#f39c12', name: 'G.Hustrulid' },
    'A.Sopu': { class: 'faculty-sopu', color: '#3498db', name: 'A.Sopu' },
    'E.Norris': { class: 'faculty-norris', color: '#1abc9c', name: 'E.Norris' },
    'J.Braukmann': { class: 'faculty-braukmann', color: '#34495e', name: 'J.Braukmann' },
    'S.Allison': { class: 'faculty-allison', color: '#d35400', name: 'S.Allison' },
    'Barton/Pettigrew': { class: 'faculty-online', color: '#7f8c8d', name: 'Barton/Pettigrew' },
    'Adjunct': { class: 'faculty-adjunct', color: '#95a5a6', name: 'Adjunct' },
    'TBD': { class: 'faculty-tbd', color: '#bdc3c7', name: 'TBD' }
};

const AY_SETUP_STORAGE_KEY = 'programCommandAySetup';

function buildFacultyAliasMap() {
    const aliasMap = {};
    for (const [alias, info] of Object.entries(facultyColors)) {
        const canonical = info?.name || alias;
        aliasMap[alias] = canonical;
        aliasMap[canonical] = canonical;
    }
    aliasMap.Online = 'Barton/Pettigrew';
    return aliasMap;
}

const facultyAliasMap = buildFacultyAliasMap();

function getCanonicalFacultyName(name) {
    const raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) return 'TBD';

    const directMatch = facultyAliasMap[raw];
    if (directMatch) return directMatch;

    const lower = raw.toLowerCase();
    if (lower.includes('adjunct')) return 'Adjunct';
    if (lower.includes('online') || lower.includes('barton') || lower.includes('pettigrew')) return 'Barton/Pettigrew';
    if (lower.includes('tbd')) return 'TBD';

    // Alias fallback that ignores punctuation/spacing.
    const compactRaw = lower.replace(/[^a-z0-9]/g, '');
    for (const [alias, canonical] of Object.entries(facultyAliasMap)) {
        const compactAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (compactRaw === compactAlias) return canonical;
    }

    return raw;
}

function getFacultyClass(instructor) {
    const canonical = getCanonicalFacultyName(instructor);
    return facultyColors[canonical]?.class || facultyColors[instructor]?.class || 'faculty-tbd';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readAySetupDataForYear(year) {
    try {
        const raw = localStorage.getItem(AY_SETUP_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.[year] || null;
    } catch (error) {
        console.warn('Could not parse academic year setup data:', error);
        return null;
    }
}

function getFacultySetupRecord(name, year = currentAcademicYear) {
    const yearData = readAySetupDataForYear(year);
    const faculty = Array.isArray(yearData?.faculty) ? yearData.faculty : [];
    const canonicalTarget = getCanonicalFacultyName(name);
    return faculty.find((entry) => getCanonicalFacultyName(entry.name) === canonicalTarget) || null;
}

function getFacultyLegendEntries() {
    const summaries = new Map();
    const quarters = ['fall', 'winter', 'spring'];

    quarters.forEach((quarter) => {
        const quarterCourses = flattenQuarterData(scheduleData[quarter] || {});
        quarterCourses.forEach((course) => {
            const canonical = getCanonicalFacultyName(course.instructor || 'TBD');
            const facultyInfo = facultyColors[canonical] || {
                color: '#6b7280',
                name: canonical
            };

            if (!summaries.has(canonical)) {
                summaries.set(canonical, {
                    lookupName: canonical,
                    displayName: facultyInfo.name || canonical,
                    color: facultyInfo.color || '#6b7280',
                    sections: 0,
                    credits: 0
                });
            }

            const summary = summaries.get(canonical);
            summary.sections += 1;
            summary.credits += Number(course.credits) || 5;
        });
    });

    return Array.from(summaries.values()).sort((a, b) => {
        if (b.sections !== a.sections) return b.sections - a.sections;
        return a.displayName.localeCompare(b.displayName);
    });
}

function renderFacultyLegend() {
    const legendEl = document.getElementById('facultyLegend');
    if (!legendEl) return;

    const entries = getFacultyLegendEntries();
    const totalSections = entries.reduce((sum, entry) => sum + entry.sections, 0);

    if (!entries.length) {
        legendEl.innerHTML = `
                    <div class="faculty-legend-header">
                        <strong>Faculty Key</strong>
                        <span>${escapeHtml(currentAcademicYear)}</span>
                    </div>
                    <div class="faculty-legend-empty">No sections assigned for this academic year yet.</div>
                `;
        return;
    }

    const chips = entries.map((entry) => `
                <button class="faculty-legend-item" type="button" data-faculty="${escapeHtml(entry.lookupName)}" onclick="showFacultyModal(this.dataset.faculty)">
                    <span class="faculty-color-bar" style="background:${escapeHtml(entry.color)};"></span>
                    <span class="faculty-legend-name">${escapeHtml(entry.displayName)}</span>
                    <span class="faculty-legend-meta">${entry.sections} sec | ${entry.credits} cr</span>
                </button>
            `).join('');

    legendEl.innerHTML = `
                <div class="faculty-legend-header">
                    <strong>Faculty Key</strong>
                    <span>${entries.length} faculty | ${totalSections} sections | ${escapeHtml(currentAcademicYear)}</span>
                </div>
                <div class="faculty-legend-list">${chips}</div>
            `;
}

// Navigation accordion toggle
function toggleNavAccordion() {
    const toggle = document.querySelector('.nav-accordion-toggle');
    const content = document.getElementById('navAccordionContent');
    toggle.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}



// Listen for the custom event from the AppHeader component
document.addEventListener('header-action', (e) => {
    const action = e.detail.action;
    if (action === 'save') {
        saveScheduleChanges();
    } else if (action === 'conflicts') {
        runConflictDetection();
    } else if (action === 'ai') {
        evaluateScheduleWithAI();
    } else if (action === 'print') {
        openPrintDialog();
    } else if (action === 'sheets') {
        exportToGoogleSheets();
    } else if (action === 'rules') {
        openConstraintsModal();
    } else if (action === 'api') {
        openApiSettingsModal();
    } else if (action === 'accounts') {
        showToast('Users & accounts is the next build step: add Supabase Auth + role-based permissions.', 'success');
    }
});

// Listen for quarter-nav component events
document.addEventListener('quarter-change', (e) => {
    console.log('quarter-change EVENT CAUGHT:', e.detail);
    currentQuarter = e.detail.quarter;

    // Update main state manager (now a signal)
    if (window.StateManager) {
        window.StateManager.set('currentQuarter', currentQuarter);
    }

    // Update schedule grid title visually
    const quarterTitle = document.getElementById('quarterTitle');
    console.log('quarterTitle Element exists:', !!quarterTitle);

    if (quarterTitle) {
        try {
            const navComponent = document.getElementById('mainQuarterNav');
            const academicYear = navComponent ? navComponent.currentYear : (window.StateManager?.get('currentAcademicYear') || '2025-26');
            console.log('Academic Year string:', academicYear);
            const [startYear, endYear] = academicYear.split('-');
            const fullStartYear = startYear.length === 4 ? startYear : '20' + startYear;
            const fullEndYear = endYear.length === 4 ? endYear : '20' + endYear;
            const qYear = currentQuarter === 'fall' ? fullStartYear : fullEndYear;

            console.log('Computed qYear:', qYear);
            quarterTitle.textContent = currentQuarter.charAt(0).toUpperCase() + currentQuarter.slice(1) + ' ' + qYear;
        } catch (err) {
            console.error('Error updating Title:', err);
        }
    }

    // Re-render schedule UI
    try {
        console.log('Calling renderSchedule...');
        if (typeof renderSchedule === 'function') {
            renderSchedule(currentQuarter);
            console.log('renderSchedule FINISHED.');
        }
    } catch (err) {
        console.error('Error rendering schedule:', err);
    }
});

document.addEventListener('year-change', (e) => {
    if (typeof switchAcademicYear === 'function') {
        switchAcademicYear(e.detail.year);
    }
});

document.addEventListener('copy-year', () => {
    if (typeof copyToNextYear === 'function') {
        copyToNextYear();
    }
});

// Listen for lens-filters component events
document.addEventListener('filter-change', (e) => {
    currentTrack = e.detail.track;
    currentMinor = e.detail.minor;

    if (window.StateManager) {
        window.StateManager.set('currentTrack', currentTrack);
        window.StateManager.set('currentMinor', currentMinor);
    }

    // Re-render schedule UI and update URL hash
    if (typeof renderSchedule === 'function') {
        renderSchedule();
    }
    if (typeof updateUrlState === 'function') {
        updateUrlState();
    }
});

document.addEventListener('clear-lens', () => {
    if (typeof resetLensFilters === 'function') {
        resetLensFilters();
    }
});

// Faculty modal functions
function showFacultyModal(facultyName) {
    const overlay = document.getElementById('facultyModalOverlay');
    const nameEl = document.getElementById('facultyModalName');
    const scheduleEl = document.getElementById('facultyModalSchedule');
    const statsEl = document.getElementById('facultyModalStats');
    const prefsEl = document.getElementById('facultyModalPreferences');

    // Set faculty name with color
    const canonicalName = getCanonicalFacultyName(facultyName);
    const facultyInfo = facultyColors[canonicalName] || facultyColors[facultyName] || { color: '#6b7280', name: canonicalName };
    nameEl.textContent = facultyInfo.name || canonicalName;
    nameEl.style.color = facultyInfo.color;

    // Get current schedule from scheduleData
    const facultyCourses = [];
    if (typeof scheduleData !== 'undefined') {
        const quarters = ['fall', 'winter', 'spring'];
        quarters.forEach(quarter => {
            const quarterCourses = flattenQuarterData(scheduleData[quarter] || {});
            quarterCourses.forEach(course => {
                if (getCanonicalFacultyName(course.instructor) === canonicalName) {
                    facultyCourses.push({
                        ...course,
                        quarter: quarter.charAt(0).toUpperCase() + quarter.slice(1)
                    });
                }
            });
        });
    }

    // Populate schedule
    if (facultyCourses.length > 0) {
        scheduleEl.innerHTML = facultyCourses.map(course => `
                    <div class="faculty-course-item">
                        <span class="course-code">${course.code}</span>
                        <span class="course-title">${course.title || course.name || ''}</span>
                        <span class="course-details">${course.quarter} | ${course.day || course.days || ''} ${course.time || ''}</span>
                    </div>
                `).join('');
    } else {
        scheduleEl.innerHTML = '<p style="color: #6b7280; font-style: italic;">No scheduled courses found</p>';
    }

    // Calculate workload stats
    const totalCredits = facultyCourses.reduce((sum, c) => sum + (parseInt(c.credits) || 5), 0);
    const sectionCount = facultyCourses.length;
    const setupRecord = getFacultySetupRecord(canonicalName, currentAcademicYear);
    statsEl.innerHTML = `
                <div class="stat-item"><span class="stat-label">Total Sections:</span> <span class="stat-value">${sectionCount}</span></div>
                <div class="stat-item"><span class="stat-label">Total Credits:</span> <span class="stat-value">${totalCredits}</span></div>
                <div class="stat-item"><span class="stat-label">Role:</span> <span class="stat-value">${escapeHtml(setupRecord?.role || 'Not set')}</span></div>
            `;

    if (setupRecord) {
        prefsEl.innerHTML = `
                    <div class="faculty-tags">
                        <span class="pref-tag">FTE: ${escapeHtml(setupRecord.ftePercent || '100')}%</span>
                        <span class="pref-tag">Annual Target: ${escapeHtml(setupRecord.annualTargetCredits || '45')} cr</span>
                        <span class="pref-tag">Release: ${escapeHtml(setupRecord.releaseCredits || '0')} cr${setupRecord.releasePercent !== undefined && setupRecord.releasePercent !== null ? ` (${escapeHtml(setupRecord.releasePercent)}%)` : ''}</span>
                        ${setupRecord.releaseReason ? `<span class="pref-tag">${escapeHtml(setupRecord.releaseReason)}</span>` : ''}
                    </div>
                    <a href="pages/academic-year-setup.html" class="pref-link">Edit Academic Year Inputs →</a>
                `;
    } else {
        prefsEl.innerHTML = `
                    <div class="faculty-tags">
                        <span class="pref-tag">No AY setup record found for ${escapeHtml(currentAcademicYear)}</span>
                    </div>
                    <a href="pages/academic-year-setup.html" class="pref-link">Add Faculty Inputs →</a>
                `;
    }

    overlay.classList.add('visible');
}

function closeFacultyModal(event) {
    if (event && event.target !== document.getElementById('facultyModalOverlay')) return;
    document.getElementById('facultyModalOverlay').classList.remove('visible');
}

// Minor data structure
const minors = {
    ux: {
        name: 'UX/Interaction Design Minor',
        courses: ['DESN 338', 'DESN 348', 'DESN 458', 'DESN 366'],
        tracks: ['ux', 'interaction-design', 'web-development'],
        color: '#e74c3c',
        typical: true
    },
    animation: {
        name: 'Animation Minor',
        courses: ['DESN 326', 'DESN 355', 'DESN 365', 'DESN 336'],
        tracks: ['animation', 'motion'],
        color: '#f39c12',
        typical: false, // UX/Interaction/Web Dev typically don't pursue this
        note: 'UX, Interaction Design, and Web Dev students typically don\'t pursue this minor'
    },
    gameDesign: {
        name: 'Game Design Minor',
        courses: ['DESN 335', 'DESN 345', 'DESN 369', 'DESN 379'],
        tracks: ['animation', 'game-design'],
        color: '#27ae60',
        typical: true,
        note: 'Animation and Game Design students may pursue this minor'
    },
    graphicDesign: {
        name: 'Graphic Design Minor',
        courses: ['DESN 243', 'DESN 263', 'DESN 360', 'DESN 463'],
        tracks: ['all'],
        color: '#3498db',
        typical: true,
        note: 'Can be picked up along the way by any track'
    },
    photography: {
        name: 'Photography Minor',
        courses: ['DESN 350', 'DESN 301'],
        tracks: ['photography', 'visual-storytelling'],
        color: '#9b59b6',
        typical: true,
        note: 'PHOTO 350 only offered in Spring',
        seasonal: { 'DESN 350': 'spring' }
    },
    webDevelopment: {
        name: 'Web Development Minor',
        courses: ['DESN 368', 'DESN 369', 'DESN 379', 'DESN 468'],
        tracks: ['web-development', 'code-design'],
        color: '#667eea',
        typical: true
    }
};

// Student track definitions
const studentTracks = {
    'ux': { name: 'UX Design', suggestedMinors: ['ux', 'graphicDesign', 'webDevelopment'] },
    'interaction-design': { name: 'Interaction Design', suggestedMinors: ['ux', 'graphicDesign', 'webDevelopment'] },
    'web-development': { name: 'Web Development', suggestedMinors: ['webDevelopment', 'graphicDesign', 'ux'] },
    'animation': { name: 'Animation', suggestedMinors: ['animation', 'gameDesign', 'graphicDesign'] },
    'game-design': { name: 'Game Design', suggestedMinors: ['gameDesign', 'animation', 'graphicDesign'] },
    'motion': { name: 'Motion Design', suggestedMinors: ['animation', 'graphicDesign'] },
    'photography': { name: 'Photography', suggestedMinors: ['photography', 'graphicDesign'] },
    'visual-storytelling': { name: 'Visual Storytelling', suggestedMinors: ['photography', 'graphicDesign'] },
    'code-design': { name: 'Code + Design', suggestedMinors: ['webDevelopment', 'gameDesign', 'graphicDesign'] }
};

// Load dynamic enrollment data from JSON file
let enrollmentData = {};
let enrollmentDataByCode = {};
const NEW_COURSE_CODES = new Set(
    ['DESN 345', 'DESN 369', 'DESN 379'].map((code) => normalizeCourseCode(code))
);

function rebuildEnrollmentLookup() {
    enrollmentDataByCode = {};
    Object.entries(enrollmentData || {}).forEach(([code, stats]) => {
        enrollmentDataByCode[normalizeCourseCode(code)] = stats;
    });
}

async function loadEnrollmentData() {
    try {
        const response = await fetch('./enrollment-dashboard-data.json');
        if (response.ok) {
            const data = await response.json();
            enrollmentData = {
                ...fallbackEnrollmentData,
                ...(data.courseStats || {})
            };
            rebuildEnrollmentLookup();
            console.log('✅ Loaded dynamic enrollment data');
            console.log(`   Total courses: ${Object.keys(enrollmentData).length}`);
            return true;
        }
    } catch (error) {
        console.warn('⚠️ Could not load enrollment-dashboard-data.json, using fallback data');
    }
    // Fallback to hardcoded data if JSON fails
    enrollmentData = fallbackEnrollmentData;
    rebuildEnrollmentLookup();
    return false;
}

// Fallback enrollment data (used if JSON file is not available)
const fallbackEnrollmentData = {
    "DESN 100": {
        average: 35,
        peak: 48,
        trend: "declining",
        peakQuarter: "fall-2022",
        quarterly: {
            "winter-2023": 38,
            "winter-2024": 24,
            "winter-2025": 22
        }
    },
    "DESN 200": { average: 26, peak: 44, trend: "growing", peakQuarter: "fall-2024" },
    "DESN 216": {
        average: 52,
        peak: 73,
        trend: "declining",
        peakQuarter: "fall-2022",
        quarterly: {
            "winter-2023": { total: 38, online: 19, inPerson: 19 },
            "winter-2024": { total: 25, online: 13, inPerson: 12 },
            "winter-2025": { total: 22, online: 11, inPerson: 11 }
        }
    },
    "DESN 243": { average: 17, peak: 25, trend: "stable", peakQuarter: "spring-2023" },
    "DESN 263": { average: 18, peak: 25, trend: "stable", peakQuarter: "spring-2023" },
    "DESN 301": { average: 21, peak: 25, trend: "growing", peakQuarter: "fall-2024" },
    "DESN 305": { average: 22, peak: 23, trend: "stable", peakQuarter: "spring-2024" },
    "DESN 326": { average: 25, peak: 25, trend: "stable", peakQuarter: "fall-2023" },
    "DESN 335": { average: 24, peak: 24, trend: "stable", peakQuarter: "winter-2025" },
    "DESN 336": { average: 18, peak: 21, trend: "growing", peakQuarter: "spring-2025" },
    "DESN 338": { average: 20, peak: 30, trend: "declining", peakQuarter: "fall-2022" },
    "DESN 345": { average: 0, peak: 0, trend: "new", peakQuarter: "never-offered", isNew: true, note: "New course - Digital Game Design (Spring 2026)" },
    "DESN 348": { average: 16, peak: 20, trend: "stable", peakQuarter: "winter-2024" },
    "DESN 350": { average: 10, peak: 10, trend: "stable", peakQuarter: "spring" },
    "DESN 355": { average: 19, peak: 22, trend: "stable", peakQuarter: "winter-2024" },
    "DESN 359": { average: 19, peak: 24, trend: "growing", peakQuarter: "winter-2024" },
    "DESN 360": { average: 17, peak: 19, trend: "stable", peakQuarter: "winter-2025" },
    "DESN 365": { average: 15, peak: 16, trend: "stable", peakQuarter: "spring-2024" },
    "DESN 366": { average: 12, peak: 18, trend: "declining", peakQuarter: "spring-2023" },
    "DESN 368": { average: 18, peak: 20, trend: "stable", peakQuarter: "fall" },
    "DESN 369": { average: 0, peak: 0, trend: "new", peakQuarter: "never-offered", isNew: true, note: "New course - Web Dev 1 (Winter 2026)" },
    "DESN 374": { average: 22, peak: 25, trend: "stable", peakQuarter: "fall" },
    "DESN 378": { average: 15, peak: 16, trend: "stable", peakQuarter: "winter" },
    "DESN 379": { average: 0, peak: 0, trend: "new", peakQuarter: "never-offered", isNew: true, note: "New course - Web Dev 2 (Spring 2026)" },
    "DESN 384": { average: 19, peak: 24, trend: "stable", peakQuarter: "winter-2023" },
    "DESN 401": { average: 16, peak: 21, trend: "growing", peakQuarter: "winter-2025" },
    "DESN 458": { average: 12, peak: 15, trend: "stable", peakQuarter: "spring-2024" },
    "DESN 463": { average: 16, peak: 24, trend: "growing", peakQuarter: "spring-2025" },
    "DESN 468": { average: 12, peak: 13, trend: "stable", peakQuarter: "spring-2024" },
    "DESN 480": { average: 15, peak: 20, trend: "stable", peakQuarter: "winter-2023" },
    "DESN 490": { average: 15, peak: 25, trend: "growing", peakQuarter: "spring-2025" }
};

function getEnrollmentLevel(average) {
    if (average >= 30) return 'high';
    if (average >= 15) return 'medium';
    return 'low';
}

function getEnrollmentData(courseCode) {
    const normalizedCode = normalizeCourseCode(courseCode);
    return enrollmentDataByCode[normalizedCode]
        || enrollmentData[courseCode]
        || { average: 0, peak: 0, trend: "unknown", peakQuarter: "" };
}

const scheduleData = {
    fall: {
        'MW': {
            '10:00-12:20': [
                { code: 'DESN 368', name: 'Code + Design 1', room: '206', instructor: 'T.Masingale', credits: 5 },
                { code: 'DESN 243', name: 'Typography', room: '209', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 490', name: 'Capstone', room: '210', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 100', name: 'Drawing Com.', room: 'CEB 104', instructor: 'A.Sopu', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 338', name: 'UX 1', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 463', name: 'Community Dr.', room: '209', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 301', name: 'Visual Storyte.', room: '210', instructor: 'S.Mills', credits: 5 },
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'CEB 102', instructor: 'A.Sopu', credits: 5 },
                { code: 'DESN 100', name: 'Drawing Com.', room: 'CEB 104', instructor: 'S.Allison', credits: 5 }
            ],
            '16:00-18:20': [
                { code: 'DESN 366', name: 'Production Des.', room: '206', instructor: 'M.Lybbert', credits: 5 }
            ]
        },
        'TR': {
            '10:00-12:20': [
                { code: 'DESN 374', name: 'AI + Design', room: '209', instructor: 'T.Masingale', credits: 5 },
                { code: 'DESN 200', name: 'Visual Thinking', room: '210', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 359', name: 'Histories of Des.', room: 'CEB 102', instructor: 'S.Durr', credits: 5 },
                { code: 'ITGS 110', name: 'FYE: Humanities', room: 'CEB 104', instructor: 'S.Mills', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 480', name: 'Pro. Practice', room: '206', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 326', name: 'Intro to Anim.', room: '209', instructor: 'G.Hustrulid', credits: 5 },
                { code: 'DESN 263', name: 'VCD 1', room: '210', instructor: 'A.Sopu', credits: 5 },
                { code: 'DESN 200', name: 'Visual Thinking', room: 'CEB 104', instructor: 'S.Mills', credits: 5 }
            ]
        },
        'ONLINE': {
            'async': [
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'ONLINE', instructor: 'Barton/Pettigrew', credits: 5 }
            ]
        }
    },
    winter: {
        'MW': {
            '10:00-12:20': [
                { code: 'DESN 335', name: 'Board Game', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 243', name: 'Typography', room: '209', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'CEB 102', instructor: 'A.Sopu', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 348', name: 'UX 2', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 360', name: 'Zine Pubic.', room: '209', instructor: 'S.Mills', credits: 5 },
                { code: 'DESN 480', name: 'Pro. Practice', room: '210', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 100', name: 'Drawing Com.', room: 'CEB 104', instructor: 'A.Sopu', credits: 5 }
            ],
            '16:00-18:20': [
                { code: 'DESN 338', name: 'UX 1', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 378', name: 'Code + Design 2', room: '209', instructor: 'T. Masingale', credits: 5 }
            ]
        },
        'TR': {
            '10:00-12:20': [
                { code: 'DESN 369', name: 'Web Dev. 1', room: '206', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 490', name: 'Capstone', room: '209', instructor: 'TBD', credits: 5 },
                { code: 'DESN 359', name: 'Histories of Des.', room: '210', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 200', name: 'Visual Thinking', room: 'CEB 102', instructor: 'S.Mills', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 374', name: 'AI + Design', room: '206', instructor: 'T. Masingale', credits: 5 },
                { code: 'DESN 355', name: 'Motion Design', room: '209', instructor: 'G.Hustrulid', credits: 5 },
                { code: 'DESN 263', name: 'VCD 1', room: '210', instructor: 'A.Sopu', credits: 5 },
                { code: 'DESN 100', name: 'Drawing Com.', room: 'CEB 104', instructor: 'S.Allison', credits: 5 }
            ],
            '16:00-18:20': [
                { code: 'DESN 336', name: '3D Animation', room: '209', instructor: 'Adjunct', credits: 5 }
            ]
        },
        'ONLINE': {
            'async': [
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'ONLINE', instructor: 'Barton/Pettigrew', credits: 5 }
            ]
        },
        'ARRANGED': {
            'arranged': [
                { code: 'DESN 396', name: 'Japan Study Ab.', room: 'ARRANGED', instructor: 'M.Lybbert', credits: 5 }
            ]
        }
    },
    spring: {
        'MW': {
            '10:00-12:20': [
                { code: 'DESN 305', name: 'Social Media', room: '206', instructor: 'E.Norris', credits: 5 },
                { code: 'DESN 374', name: 'AI + Design', room: '209', instructor: 'T. Masingale', credits: 5 },
                { code: 'DESN 490', name: 'Capstone', room: '210', instructor: 'TBD', credits: 5 },
                { code: 'DESN 359', name: 'Histories of Des.', room: 'CEB 102', instructor: 'S.Durr', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 338', name: 'UX 1', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 345', name: 'Digital Game', room: '209', instructor: 'Manikoth', credits: 5 },
                { code: 'DESN 263', name: 'VCD 1', room: '210', instructor: 'A.Sopu', credits: 5 },
                { code: 'DESN 200', name: 'Visual Thinking', room: 'CEB 102', instructor: 'S.Mills', credits: 5 }
            ],
            '16:00-18:20': [
                { code: 'DESN 458', name: 'UX 3', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 350', name: 'Digital Photo', room: '209', instructor: 'Adjunct', credits: 5 }
            ]
        },
        'TR': {
            '10:00-12:20': [
                { code: 'DESN 379', name: 'Web Dev. 2', room: '206', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 401', name: 'Imaginary Ws.', room: '209', instructor: 'S.Mills', credits: 5 },
                { code: 'DESN 463', name: 'Community Dr.', room: '210', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'CEB 102', instructor: 'A.Sopu', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 468', name: 'Code + Design 3', room: '206', instructor: 'T. Masingale', credits: 5 },
                { code: 'DESN 365', name: 'Motion Des. 2', room: '209', instructor: 'G.Hustrulid', credits: 5 },
                { code: 'DESN 243', name: 'Typography', room: '210', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 384', name: 'Digital Sound', room: 'CEB 102', instructor: 'J.Braukmann', credits: 5 },
                { code: 'DESN 100', name: 'Drawing Com.', room: 'CEB 104', instructor: 'A.Sopu', credits: 5 }
            ]
        },
        'ONLINE': {
            'async': [
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'ONLINE', instructor: 'Barton/Pettigrew', credits: 5 }
            ]
        }
    },
    spring: {
        'MW': {
            '10:00-12:20': [
                { code: 'DESN 305', name: 'Social Media', room: '206', instructor: 'E.Norris', credits: 5 },
                { code: 'DESN 374', name: 'AI + Design', room: '209', instructor: 'T. Masingale', credits: 5 },
                { code: 'DESN 490', name: 'Capstone', room: '210', instructor: 'TBD', credits: 5 },
                { code: 'DESN 359', name: 'Histories of Des.', room: 'CEB 102', instructor: 'S.Durr', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 338', name: 'UX 1', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 345', name: 'Digital Game', room: '209', instructor: 'Manikoth', credits: 5 },
                { code: 'DESN 263', name: 'VCD 1', room: '210', instructor: 'A.Sopu', credits: 5 },
                { code: 'DESN 200', name: 'Visual Thinking', room: 'CEB 102', instructor: 'S.Mills', credits: 5 }
            ],
            '16:00-18:20': [
                { code: 'DESN 458', name: 'UX 3', room: '206', instructor: 'M.Lybbert', credits: 5 },
                { code: 'DESN 350', name: 'Digital Photo', room: '209', instructor: 'Adjunct', credits: 5 }
            ]
        },
        'TR': {
            '10:00-12:20': [
                { code: 'DESN 379', name: 'Web Dev. 2', room: '206', instructor: 'C.Manikoth', credits: 5 },
                { code: 'DESN 401', name: 'Imaginary Ws.', room: '209', instructor: 'S.Mills', credits: 5 },
                { code: 'DESN 463', name: 'Community Dr.', room: '210', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'CEB 102', instructor: 'A.Sopu', credits: 5 }
            ],
            '13:00-15:20': [
                { code: 'DESN 468', name: 'Code + Design 3', room: '206', instructor: 'T. Masingale', credits: 5 },
                { code: 'DESN 365', name: 'Motion Des. 2', room: '209', instructor: 'G.Hustrulid', credits: 5 },
                { code: 'DESN 243', name: 'Typography', room: '210', instructor: 'S.Durr', credits: 5 },
                { code: 'DESN 384', name: 'Digital Sound', room: 'CEB 102', instructor: 'J.Braukmann', credits: 5 },
                { code: 'DESN 100', name: 'Drawing Com.', room: 'CEB 104', instructor: 'A.Sopu', credits: 5 }
            ]
        },
        'ONLINE': {
            'async': [
                { code: 'DESN 216', name: 'Digital Fdns.', room: 'ONLINE', instructor: 'Barton/Pettigrew', credits: 5 }
            ]
        }
    }
};

let conflictData = {
    fall: [],
    winter: [],
    spring: []
};
let annualConflictInsights = [];

const recommendations = {
    spring: [
        {
            priority: 'high',
            title: 'Move DESN 463 to Monday/Wednesday 1-3 PM',
            description: 'Relocating Community Design eliminates the critical three-way conflict and S. Durr has no conflicts at this time.'
        }
    ],
    fall: [
        {
            priority: 'medium',
            title: 'Monitor Capstone Distribution Across Quarters',
            description: 'DESN 490 can be completed across Fall, Winter, or Spring. Keep section placement balanced so seniors can sequence code-track courses without bottlenecks.'
        }
    ],
    winter: [
        {
            priority: 'critical',
            title: 'URGENT: Resolve DESN 348/480 Senior Graduation Conflict',
            description: 'DESN 348 (UX 2 - UX minor requirement) conflicts with DESN 480 (Professional Practice - required to graduate). Seniors cannot complete UX minor and graduate on time. Recommendation: Move DESN 480 to TR 13:00-15:00 or offer additional DESN 348 section at different time (MW 16:00-18:00 or TR time slot).'
        },
        {
            priority: 'high',
            title: 'Optimize DESN 100 Winter Sections',
            description: 'DESN 100 winter enrollment has declined from 38 (2023) to 22 (2025) students. Currently offering 2 sections, but only 1 section is needed. Consider consolidating to a single section.'
        },
        {
            priority: 'high',
            title: 'Review DESN 216 Winter Capacity',
            description: 'DESN 216 winter shows declining enrollment (38→25→22 students, split 50/50 between online and in-person). The in-person section now has only ~11 students. Consider consolidating to online-only or offering in-person every other year.'
        }
    ]
};

/**
 * Check for imported schedule data from schedule builder
 */
function checkForImportedSchedule() {
    // Check URL params for import flag
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.get('import')) return;

    const importedData = localStorage.getItem('importedScheduleData');
    if (!importedData) {
        console.log('No imported schedule data found');
        return;
    }

    try {
        const parsed = JSON.parse(importedData);
        if (parsed.source !== 'schedule-builder') return;

        console.log('Importing schedule from schedule builder:', parsed);

        // Merge imported schedule data into scheduleData
        ['fall', 'winter', 'spring'].forEach(quarter => {
            if (parsed.scheduleData[quarter]) {
                // Replace schedule data for this quarter
                scheduleData[quarter] = parsed.scheduleData[quarter];
            }
        });

        // Show import notification
        showImportNotification(parsed.academicYear, parsed.generatedAt);

        // Clear the import flag from URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);

        // Clear localStorage after import
        localStorage.removeItem('importedScheduleData');

    } catch (error) {
        console.error('Error importing schedule:', error);
    }
}

/**
 * Show notification about imported schedule
 */
function showImportNotification(year, generatedAt) {
    const notification = document.createElement('div');
    notification.className = 'import-notification';
    notification.innerHTML = `
                <div class="import-notification-content">
                    <span class="import-icon">✓</span>
                    <span>Schedule imported for ${year} (generated ${new Date(generatedAt).toLocaleString()})</span>
                    <button onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
            `;
    notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                animation: slideIn 0.3s ease;
            `;
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => notification.remove(), 5000);
}

function renderSchedule(quarter) {
    const grid = document.getElementById('scheduleGrid');
    const data = scheduleData[quarter];

    // Clear grid safely
    while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
    }

    // Header row - create elements safely
    const headers = ['Time', '206 UX Lab', '207 Media Lab', '209 Mac Lab', '210 Mac Lab', '212 Project Lab', 'CEB 102', 'CEB 104'];
    headers.forEach(text => {
        const header = document.createElement('div');
        header.className = 'grid-header';
        header.textContent = text;
        grid.appendChild(header);
    });

    const times = ['10:00-12:20', '13:00-15:20', '16:00-18:20'];
    const days = ['MW', 'TR'];
    const rooms = ['206', '207', '209', '210', '212', 'CEB 102', 'CEB 104'];

    days.forEach((day, dayIndex) => {
        // Add divider for each day section
        const divider = document.createElement('div');
        divider.className = 'day-divider ' + (dayIndex === 0 ? 'mw' : 'tr');
        grid.appendChild(divider);

        times.forEach(time => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            timeSlot.textContent = day;
            timeSlot.appendChild(document.createElement('br'));
            timeSlot.appendChild(document.createTextNode(time));
            grid.appendChild(timeSlot);

            rooms.forEach(room => {
                const courses = data[day] && data[day][time] ?
                    data[day][time].filter(c => c.room === room) : [];

                const cell = document.createElement('div');
                cell.className = 'schedule-cell drop-zone';
                cell.dataset.day = day;
                cell.dataset.time = time;
                cell.dataset.room = room;

                courses.forEach(course => {
                    const conflictLevel = courses.length > 2 ? 0 : courses.length > 1 ? 1 : 2;
                    const facultyClass = getFacultyClass(course.instructor);
                    const enrollment = getEnrollmentData(course.code);

                    // Get quarter-specific enrollment from previous year instead of overall average
                    const prevYearQuarter = quarter === 'fall' ? 'fall-2025' :
                        quarter === 'winter' ? 'winter-2025' :
                            quarter === 'spring' ? 'spring-2025' : null;

                    let displayEnrollment = enrollment.average; // fallback
                    let tooltipText = 'Avg enrollment: ' + enrollment.average;
                    let showYearIndicator = false;
                    const hasPriorQuarterSample = Boolean(
                        prevYearQuarter
                        && enrollment.quarterly
                        && enrollment.quarterly[prevYearQuarter] !== undefined
                    );
                    const treatAsNewCourse = Boolean(
                        NEW_COURSE_CODES.has(normalizeCourseCode(course.code))
                        ||
                        enrollment.isNew
                        || enrollment.trend === 'new'
                        || (!hasPriorQuarterSample
                            && Number(enrollment.average) === 0
                            && Number(enrollment.peak) === 0)
                    );

                    if (hasPriorQuarterSample) {
                        const prevYearData = enrollment.quarterly[prevYearQuarter];
                        displayEnrollment = typeof prevYearData === 'object' ? prevYearData.total : prevYearData;
                        tooltipText = quarter.charAt(0).toUpperCase() + quarter.slice(1) + ' 2025: ' + displayEnrollment + ' students';
                        showYearIndicator = true;
                    } else if (treatAsNewCourse) {
                        displayEnrollment = 'NEW';
                        tooltipText = 'New course - no historical data';
                    }

                    const enrollmentLevel = typeof displayEnrollment === 'number' ? getEnrollmentLevel(displayEnrollment) : 'medium';
                    const trendClass = 'trend-' + enrollment.trend;

                    // Generate a course ID for editing
                    const courseId = '2025-26-' + quarter + '-' + course.code.replace(/\s+/g, '').toLowerCase() + '-001';

                    const block = document.createElement('div');
                    block.className = 'course-block conflict-' + conflictLevel + ' ' + facultyClass + ' ' + trendClass;
                    block.dataset.courseId = courseId;
                    block.dataset.quarter = quarter;
                    block.dataset.courseCode = course.code;
                    block.dataset.day = day;
                    block.dataset.time = time;
                    block.dataset.room = room;
                    block.draggable = true;
                    block.title = tooltipText + ' | Peak: ' + enrollment.peak + ' | Trend: ' + enrollment.trend + ' | Drag to move';
                    block.onclick = function (e) {
                        // Don't trigger click if we're dragging
                        if (!block.classList.contains('dragging')) {
                            showCourseDetails(course.code, course.name, course.instructor, course.credits, course.room, courseId, quarter, day, time);
                        }
                    };

                    if (courses.length > 1) {
                        const badge = document.createElement('span');
                        badge.className = 'conflict-badge';
                        badge.textContent = courses.length;
                        block.appendChild(badge);
                    }

                    // Add delete button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.innerHTML = '&times;';
                    deleteBtn.title = 'Click to delete, Shift+Click to move to tray';
                    deleteBtn.onclick = function (e) {
                        e.stopPropagation();
                        deleteCourse(course.code, day, time, course.room, e.shiftKey);
                    };
                    block.appendChild(deleteBtn);

                    const nameDiv = document.createElement('div');
                    nameDiv.className = 'course-name';
                    nameDiv.textContent = course.code + ' ';
                    const enrollBadge = document.createElement('span');
                    enrollBadge.className = 'enrollment-badge';
                    enrollBadge.textContent = '(' + displayEnrollment + (showYearIndicator ? "'" : '') + ')';
                    nameDiv.appendChild(enrollBadge);

                    const titleDiv = document.createElement('div');
                    titleDiv.className = 'course-details';
                    titleDiv.textContent = course.name;

                    const instructorDiv = document.createElement('div');
                    instructorDiv.className = 'course-details';
                    instructorDiv.textContent = course.instructor;

                    block.appendChild(nameDiv);
                    block.appendChild(titleDiv);
                    block.appendChild(instructorDiv);
                    cell.appendChild(block);
                });

                grid.appendChild(cell);
            });
        });
    });

    // Setup drag-and-drop after grid is rendered
    setupDragAndDrop();
    renderFacultyLegend();
}

// ============================================
// DRAG AND DROP FUNCTIONALITY
// ============================================

let draggedCourse = null;

function setupDragAndDrop() {
    // Setup draggable course blocks
    document.querySelectorAll('.course-block[draggable="true"]').forEach(block => {
        block.addEventListener('dragstart', handleDragStart);
        block.addEventListener('dragend', handleDragEnd);
    });

    // Setup drop zones (schedule cells)
    document.querySelectorAll('.schedule-cell.drop-zone').forEach(cell => {
        cell.addEventListener('dragover', handleDragOver);
        cell.addEventListener('dragleave', handleDragLeave);
        cell.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedCourse = {
        element: this,
        courseId: this.dataset.courseId,
        courseCode: this.dataset.courseCode,
        quarter: this.dataset.quarter,
        originalDay: this.dataset.day,
        originalTime: this.dataset.time,
        originalRoom: this.dataset.room
    };

    this.classList.add('dragging');

    // Set transfer data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
        courseId: draggedCourse.courseId,
        courseCode: draggedCourse.courseCode,
        quarter: draggedCourse.quarter
    }));

    // Show drop indicator
    const indicator = document.getElementById('dropIndicator');
    document.getElementById('dropIndicatorText').textContent =
        'Dragging ' + draggedCourse.courseCode + ' - Drop on any time slot to move';
    indicator.classList.add('active');

    // Highlight all drop zones
    document.querySelectorAll('.schedule-cell.drop-zone').forEach(cell => {
        cell.style.opacity = '1';
    });
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedCourse = null;

    // Hide drop indicator
    document.getElementById('dropIndicator').classList.remove('active');

    // Remove all drag-over classes
    document.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.classList.remove('drag-over');
        cell.style.opacity = '';
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!this.classList.contains('drag-over')) {
        // Remove highlight from other cells
        document.querySelectorAll('.schedule-cell.drag-over').forEach(cell => {
            cell.classList.remove('drag-over');
        });
        this.classList.add('drag-over');

        // Update indicator with target info
        const day = this.dataset.day;
        const time = this.dataset.time;
        const room = this.dataset.room;
        document.getElementById('dropIndicatorText').textContent =
            'Drop to move to ' + day + ' ' + time + ' in Room ' + room;
    }
}

function handleDragLeave(e) {
    // Only remove if we're actually leaving this cell
    if (!this.contains(e.relatedTarget)) {
        this.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    if (!draggedCourse) return;

    const targetDay = this.dataset.day;
    const targetTime = this.dataset.time;
    const targetRoom = this.dataset.room;
    const quarter = window.StateManager?.get('currentQuarter') || 'spring';
    const data = scheduleData[quarter];

    // Check if dropping from displaced tray
    if (draggedCourse.isFromDisplacedTray) {
        // Check if target cell has existing courses with same room
        if (data[targetDay] && data[targetDay][targetTime]) {
            const existingInRoom = data[targetDay][targetTime].filter(c => c.room === targetRoom);
            // Move existing courses to displaced tray
            existingInRoom.forEach(existing => {
                addToDisplacedTray({
                    code: existing.code,
                    name: existing.name,
                    instructor: existing.instructor,
                    credits: existing.credits,
                    originalDay: targetDay,
                    originalTime: targetTime,
                    originalRoom: targetRoom
                });
                const idx = data[targetDay][targetTime].findIndex(c => c.code === existing.code && c.room === existing.room);
                if (idx > -1) data[targetDay][targetTime].splice(idx, 1);
            });
        }

        // Add course from displaced tray to schedule
        if (!data[targetDay]) data[targetDay] = {};
        if (!data[targetDay][targetTime]) data[targetDay][targetTime] = [];
        data[targetDay][targetTime].push({
            code: draggedCourse.courseCode,
            name: draggedCourse.courseName,
            instructor: draggedCourse.instructor || 'TBD',
            credits: draggedCourse.credits || 5,
            room: targetRoom
        });

        // Remove from displaced tray
        removeFromDisplacedTray(draggedCourse.displacedIndex);

        saveScheduleData(); // Persist changes
        renderSchedule(quarter);
        renderConflicts(quarter);
        updateStats(quarter);
        showToast('Placed ' + draggedCourse.courseCode + ' at ' + targetDay + ' ' + targetTime);
        return;
    }

    // Don't do anything if dropped in the same cell (for regular drag)
    if (targetDay === draggedCourse.originalDay &&
        targetTime === draggedCourse.originalTime &&
        targetRoom === draggedCourse.originalRoom) {
        showToast('Course already in this slot');
        return;
    }

    // Move the course (handles displacement)
    moveCourse(draggedCourse, targetDay, targetTime, targetRoom);
}

function moveCourse(course, newDay, newTime, newRoom) {
    const quarter = window.StateManager?.get('currentQuarter') || 'spring';

    // Update local schedule data
    const data = scheduleData[quarter];

    // Find and remove from original location
    if (data[course.originalDay] && data[course.originalDay][course.originalTime]) {
        const originalCourses = data[course.originalDay][course.originalTime];
        const courseIndex = originalCourses.findIndex(c => c.code === course.courseCode);

        if (courseIndex > -1) {
            const movedCourse = originalCourses.splice(courseIndex, 1)[0];

            // Update course with new location
            movedCourse.room = newRoom;

            // Check for existing courses in target room and displace them
            if (!data[newDay]) data[newDay] = {};
            if (!data[newDay][newTime]) data[newDay][newTime] = [];

            const existingInRoom = data[newDay][newTime].filter(c => c.room === newRoom);
            const hasExisting = existingInRoom.length > 0;
            let swappedCourse = null;

            if (hasExisting) {
                if (swapMode) {
                    // SWAP MODE: Move existing course to the original location
                    existingInRoom.forEach(existing => {
                        swappedCourse = { ...existing }; // Copy for toast message

                        // First, remove from target location (before changing room)
                        const idx = data[newDay][newTime].findIndex(c => c.code === existing.code && c.room === newRoom);
                        if (idx > -1) {
                            const removedCourse = data[newDay][newTime].splice(idx, 1)[0];
                            // Update the removed course's room to original room
                            removedCourse.room = course.originalRoom;
                            // Add to original location
                            if (!data[course.originalDay]) data[course.originalDay] = {};
                            if (!data[course.originalDay][course.originalTime]) data[course.originalDay][course.originalTime] = [];
                            data[course.originalDay][course.originalTime].push(removedCourse);
                        }
                    });
                } else {
                    // DISPLACE MODE: Move existing course to displaced tray
                    existingInRoom.forEach(existing => {
                        addToDisplacedTray({
                            code: existing.code,
                            name: existing.name,
                            instructor: existing.instructor,
                            credits: existing.credits,
                            originalDay: newDay,
                            originalTime: newTime,
                            originalRoom: newRoom
                        });
                        // Remove from schedule
                        const idx = data[newDay][newTime].findIndex(c => c.code === existing.code && c.room === existing.room);
                        if (idx > -1) data[newDay][newTime].splice(idx, 1);
                    });
                }
            }

            // Add to new location
            data[newDay][newTime].push(movedCourse);

            // Also update ScheduleManager if available
            if (typeof ScheduleManager !== 'undefined') {
                const updates = {
                    room: newRoom,
                    days: newDay === 'MW' ? ['M', 'W'] : ['T', 'Th'],
                    startTime: convertTimeSlotToStart(newTime),
                    endTime: convertTimeSlotToEnd(newTime)
                };

                ScheduleManager.updateCourseAssignment('2025-26', quarter, course.courseId, updates);
            }

            // Save and re-render the schedule
            saveScheduleData(); // Persist changes
            renderSchedule(quarter);
            renderConflicts(quarter);
            renderConflictSolver(quarter);
            updateStats(quarter);

            let toastMsg = 'Moved ' + course.courseCode + ' to ' + newDay + ' ' + newTime + ' Room ' + newRoom;
            if (hasExisting) {
                if (swapMode && swappedCourse) {
                    toastMsg += ' (swapped with ' + swappedCourse.code + ')';
                } else {
                    toastMsg += ' (' + existingInRoom.length + ' course' + (existingInRoom.length > 1 ? 's' : '') + ' displaced)';
                }
            }
            showToast(toastMsg);
        } else {
            showToast('Could not find course to move', 'error');
        }
    } else {
        showToast('Could not find original course location', 'error');
    }
}

function convertTimeSlotToStart(timeSlot) {
    const start = timeSlot.split('-')[0];
    return start + ':00';
}

function convertTimeSlotToEnd(timeSlot) {
    const end = timeSlot.split('-')[1];
    return end + ':00';
}

function renderOnlineCourses(quarter) {
    const onlineSection = document.getElementById('onlineSection');
    const data = scheduleData[quarter];

    // Clear section safely
    while (onlineSection.firstChild) {
        onlineSection.removeChild(onlineSection.firstChild);
    }

    if (!data || !data['ONLINE']) {
        return;
    }

    const onlineCourses = data['ONLINE']['async'] || [];

    if (onlineCourses.length === 0) {
        return;
    }

    const section = document.createElement('div');
    section.className = 'online-section';

    const heading = document.createElement('h4');
    heading.textContent = 'Online / Asynchronous';
    section.appendChild(heading);

    const coursesList = document.createElement('div');
    coursesList.className = 'online-courses-list';

    onlineCourses.forEach((course, index) => {
        const item = document.createElement('div');
        item.className = 'online-course-item';

        const courseInfo = document.createElement('span');
        courseInfo.innerHTML = `<strong>${course.code}</strong> <span style="color:#57606a">${course.name}</span> <span style="color:#8b949e">- ${course.instructor}</span>`;
        courseInfo.style.cursor = 'pointer';
        courseInfo.onclick = () => {
            showCourseDetails(course.code, course.name, course.instructor, course.credits, 'ONLINE', null, quarter, 'ONLINE', 'async');
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete this online course';
        deleteBtn.style.cssText = 'background: none; border: none; color: #cf222e; font-size: 1.2em; cursor: pointer; padding: 0 4px; margin-left: 8px; line-height: 1;';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete ${course.code} - ${course.name}?`)) {
                deleteOnlineCourse(quarter, index);
            }
        };

        item.appendChild(courseInfo);
        item.appendChild(deleteBtn);
        coursesList.appendChild(item);
    });

    section.appendChild(coursesList);
    onlineSection.appendChild(section);
}

function deleteOnlineCourse(quarter, index) {
    const data = scheduleData[quarter];
    if (data && data['ONLINE'] && data['ONLINE']['async']) {
        data['ONLINE']['async'].splice(index, 1);
        saveScheduleData();
        renderOnlineCourses(quarter);
        updateStats(quarter);
        showToast('Online course deleted');
    }
}

function renderArrangedCourses(quarter) {
    const arrangedSection = document.getElementById('arrangedSection');
    const data = scheduleData[quarter];

    // Clear section safely
    while (arrangedSection.firstChild) {
        arrangedSection.removeChild(arrangedSection.firstChild);
    }

    if (!data['ARRANGED']) {
        return;
    }

    const arrangedCourses = data['ARRANGED']['arranged'] || [];

    if (arrangedCourses.length === 0) {
        return;
    }

    const section = document.createElement('div');
    section.className = 'arranged-section';

    const heading = document.createElement('h3');
    heading.textContent = '✈️ Arranged Courses (Study Abroad & Independent Study)';
    section.appendChild(heading);

    const coursesContainer = document.createElement('div');
    coursesContainer.className = 'arranged-courses';

    arrangedCourses.forEach(course => {
        const facultyClass = getFacultyClass(course.instructor);
        const block = document.createElement('div');
        block.className = 'arranged-course-block ' + facultyClass;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'course-name';
        nameDiv.style.cssText = 'color: white; font-size: 1em; margin-bottom: 5px;';
        nameDiv.textContent = course.code;

        const titleDiv = document.createElement('div');
        titleDiv.className = 'course-details';
        titleDiv.style.color = 'rgba(255,255,255,0.9)';
        titleDiv.textContent = course.name;

        const instructorDiv = document.createElement('div');
        instructorDiv.className = 'course-details';
        instructorDiv.style.color = 'rgba(255,255,255,0.9)';
        instructorDiv.textContent = course.instructor;

        const creditsDiv = document.createElement('div');
        creditsDiv.className = 'course-details';
        creditsDiv.style.cssText = 'color: rgba(255,255,255,0.9); margin-top: 5px;';
        creditsDiv.textContent = course.credits + ' credits';

        block.appendChild(nameDiv);
        block.appendChild(titleDiv);
        block.appendChild(instructorDiv);
        block.appendChild(creditsDiv);
        coursesContainer.appendChild(block);
    });

    section.appendChild(coursesContainer);
    arrangedSection.appendChild(section);
}

// Helper: Create quarter data cell content
function createQuarterCell(data, isNew) {
    const cell = document.createElement('td');
    if (isNew) {
        const span = document.createElement('span');
        span.style.cssText = 'color: #9b59b6; font-weight: 600;';
        span.textContent = 'NEW';
        cell.appendChild(span);
    } else if (!data) {
        cell.textContent = '-';
    } else if (typeof data === 'object' && data.total !== undefined) {
        const numSpan = document.createElement('span');
        numSpan.className = 'enrollment-number';
        numSpan.textContent = data.total;
        cell.appendChild(numSpan);
        cell.appendChild(document.createElement('br'));
        const splitSpan = document.createElement('span');
        splitSpan.className = 'enrollment-split';
        splitSpan.textContent = '(' + (data.online || '-') + ' online, ' + (data.inPerson || '-') + ' in-person)';
        cell.appendChild(splitSpan);
    } else {
        const numSpan = document.createElement('span');
        numSpan.className = 'enrollment-number';
        numSpan.textContent = data;
        cell.appendChild(numSpan);
    }
    return cell;
}

// Helper: Create enrollment category section
function createEnrollmentCategory(title, subtitle, courses, type, formatFn) {
    const section = document.createElement('div');
    section.className = 'enrollment-category';

    const h3 = document.createElement('h3');
    h3.textContent = title;

    const p = document.createElement('p');
    p.style.cssText = 'color: #666; font-size: 0.9em; margin-bottom: 10px;';
    p.textContent = subtitle;

    const list = document.createElement('div');
    list.className = 'enrollment-course-list';

    courses.forEach(c => {
        const tag = document.createElement('div');
        tag.className = 'enrollment-course-tag ' + type;
        const strong = document.createElement('strong');
        strong.textContent = c.code;
        tag.appendChild(strong);
        tag.appendChild(document.createTextNode(' - ' + formatFn(c)));
        list.appendChild(tag);
    });

    section.appendChild(h3);
    section.appendChild(p);
    section.appendChild(list);
    return section;
}

function renderEnrollmentAnalytics(quarter) {
    const analyticsPanel = document.getElementById('enrollmentAnalytics');
    const data = scheduleData[quarter];

    // Clear safely
    while (analyticsPanel.firstChild) {
        analyticsPanel.removeChild(analyticsPanel.firstChild);
    }

    // Collect all courses from the quarter
    let allCourses = [];
    ['MW', 'TR'].forEach(day => {
        if (data[day]) {
            ['10:00-12:20', '13:00-15:20', '16:00-18:20'].forEach(time => {
                if (data[day][time]) {
                    allCourses = allCourses.concat(data[day][time]);
                }
            });
        }
    });

    if (data['ONLINE'] && data['ONLINE']['async']) {
        allCourses = allCourses.concat(data['ONLINE']['async']);
    }

    // Categorize courses
    const highEnrollment = [];
    const lowEnrollment = [];
    const decliningTrend = [];

    allCourses.forEach(course => {
        const enrollment = getEnrollmentData(course.code);
        if (enrollment.average >= 30) highEnrollment.push({ ...course, enrollment });
        if (enrollment.average < 15 && enrollment.average > 0) lowEnrollment.push({ ...course, enrollment });
        if (enrollment.trend === 'declining') decliningTrend.push({ ...course, enrollment });
    });

    const coursesWithHistory = allCourses
        .reduce((unique, course) => {
            if (!unique.find(c => c.code === course.code)) unique.push(course);
            return unique;
        }, [])
        .sort((a, b) => {
            const aMatch = normalizeCourseCode(a.code).match(/\d{3}[A-Z]?/);
            const bMatch = normalizeCourseCode(b.code).match(/\d{3}[A-Z]?/);
            const aValue = parseInt(aMatch ? aMatch[0] : '0', 10);
            const bValue = parseInt(bMatch ? bMatch[0] : '0', 10);
            return aValue - bValue;
        });

    const quarterName = quarter.charAt(0).toUpperCase() + quarter.slice(1);
    const q2023Key = quarter + '-2023';
    const q2024Key = quarter + '-2024';
    const q2025Key = quarter + '-2025';

    // Main container
    const container = document.createElement('div');
    container.className = 'enrollment-analytics';

    const mainTitle = document.createElement('h2');
    mainTitle.textContent = '📊 Enrollment Analytics - ' + quarterName + ' 2026';
    container.appendChild(mainTitle);

    // Per-Class Enrollment History (collapsible)
    if (coursesWithHistory.length > 0) {
        const historySection = document.createElement('div');
        historySection.className = 'quarterly-enrollment';

        const accordionHeader = document.createElement('h3');
        accordionHeader.style.cssText = 'cursor: pointer; user-select: none; padding: 10px; background: #f8f9fa; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;';

        const headerText = document.createElement('span');
        headerText.textContent = '📈 Per-Class Enrollment History ';
        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'font-size: 0.8em; color: #666; font-weight: normal;';
        countSpan.textContent = '(' + coursesWithHistory.length + ' courses)';
        headerText.appendChild(countSpan);

        const arrow = document.createElement('span');
        arrow.className = 'accordion-arrow';
        arrow.style.fontSize = '0.8em';
        arrow.textContent = '▶';

        accordionHeader.appendChild(headerText);
        accordionHeader.appendChild(arrow);

        const contentDiv = document.createElement('div');
        contentDiv.style.display = 'none';

        accordionHeader.onclick = function () {
            if (contentDiv.style.display === 'none') {
                contentDiv.style.display = 'block';
                arrow.textContent = '▼';
            } else {
                contentDiv.style.display = 'none';
                arrow.textContent = '▶';
            }
        };

        const historyDesc = document.createElement('p');
        historyDesc.style.cssText = 'color: #666; font-size: 0.9em; margin-bottom: 15px;';
        historyDesc.textContent = 'Historical enrollment data for ' + quarterName + ' quarter courses';

        const table = document.createElement('table');
        table.className = 'enrollment-history-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Course', 'Course Name', 'Instructor', quarterName + ' 2023', quarterName + ' 2024', quarterName + ' 2025', 'Trend'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        const tbody = document.createElement('tbody');
        coursesWithHistory.forEach(c => {
            const enrollment = getEnrollmentData(c.code);
            const isNewCourse = Boolean(
                enrollment.isNew
                || enrollment.trend === 'new'
                || NEW_COURSE_CODES.has(normalizeCourseCode(c.code))
            );
            const quarterly = enrollment.quarterly || {};
            const row = document.createElement('tr');

            // Course code cell
            const codeCell = document.createElement('td');
            const codeStrong = document.createElement('strong');
            codeStrong.textContent = c.code;
            codeCell.appendChild(codeStrong);
            if (isNewCourse) {
                const badge = document.createElement('span');
                badge.className = 'course-note-badge';
                badge.textContent = 'NEW';
                codeCell.appendChild(badge);
            }

            const nameCell = document.createElement('td');
            nameCell.textContent = c.name;

            const instructorCell = document.createElement('td');
            instructorCell.textContent = c.instructor;

            const trendCell = document.createElement('td');
            const trendValue = isNewCourse ? 'new' : enrollment.trend;
            const trendIcon = trendValue === 'declining' ? '📉' : trendValue === 'growing' ? '📈' : trendValue === 'new' ? '✨' : '➡️';
            trendCell.textContent = trendIcon + ' ' + trendValue;

            row.appendChild(codeCell);
            row.appendChild(nameCell);
            row.appendChild(instructorCell);
            row.appendChild(createQuarterCell(quarterly[q2023Key], isNewCourse));
            row.appendChild(createQuarterCell(quarterly[q2024Key], isNewCourse));
            row.appendChild(createQuarterCell(quarterly[q2025Key], isNewCourse));
            row.appendChild(trendCell);
            tbody.appendChild(row);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        contentDiv.appendChild(historyDesc);
        contentDiv.appendChild(table);
        historySection.appendChild(accordionHeader);
        historySection.appendChild(contentDiv);
        container.appendChild(historySection);
    }

    // High Demand section
    if (highEnrollment.length > 0) {
        container.appendChild(createEnrollmentCategory(
            '🔴 High Demand Courses (30+ students)',
            'These courses may need larger rooms or additional sections',
            highEnrollment,
            'high',
            c => 'Avg: ' + c.enrollment.average + ' | Peak: ' + c.enrollment.peak
        ));
    }

    // Low Enrollment section
    if (lowEnrollment.length > 0) {
        container.appendChild(createEnrollmentCategory(
            '🟢 Low Enrollment Courses (<15 students)',
            'Consider consolidation or review offering frequency',
            lowEnrollment,
            'low',
            c => 'Avg: ' + c.enrollment.average + ' | Instructor: ' + c.instructor
        ));
    }

    // Declining Trend section
    if (decliningTrend.length > 0) {
        container.appendChild(createEnrollmentCategory(
            '⚠️ Declining Enrollment Trends',
            'Courses showing declining enrollment patterns',
            decliningTrend,
            'declining',
            c => 'Avg: ' + c.enrollment.average + ' | Trend: ' + c.enrollment.trend + ' ↘'
        ));
    }

    analyticsPanel.appendChild(container);
}

const CONFLICT_QUARTERS = ['fall', 'winter', 'spring'];
const CONFLICT_QUARTER_LABELS = {
    fall: 'Fall',
    winter: 'Winter',
    spring: 'Spring'
};
const CONFLICT_SEVERITY_RANK = {
    critical: 3,
    high: 2,
    medium: 1
};

function getConflictSeverityRank(severity) {
    return CONFLICT_SEVERITY_RANK[String(severity || '').toLowerCase()] || 0;
}

function extractConflictCourseCode(courseLabel) {
    const match = String(courseLabel || '').match(/[A-Z]{2,5}\s\d{3}[A-Z]?/);
    return match ? match[0] : null;
}

function getConflictPatternLabel(conflict) {
    const codes = (conflict.courses || [])
        .map(extractConflictCourseCode)
        .filter(Boolean);

    if (codes.length) {
        return [...new Set(codes)].sort().join(' + ');
    }

    return conflict.time || 'Unlabeled conflict pattern';
}

function normalizeCourseCode(courseCode) {
    const upper = String(courseCode || '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();

    return upper.replace(/^([A-Z]{2,5})\s*(\d)/, '$1 $2');
}

function normalizeScheduleCourseCodes(data) {
    const quarters = ['fall', 'winter', 'spring'];

    quarters.forEach((quarter) => {
        const quarterData = data?.[quarter];
        if (!quarterData || typeof quarterData !== 'object') return;

        Object.values(quarterData).forEach((timeBucket) => {
            if (!timeBucket || typeof timeBucket !== 'object') return;

            Object.values(timeBucket).forEach((courses) => {
                if (!Array.isArray(courses)) return;
                courses.forEach((course) => {
                    if (course && typeof course === 'object') {
                        course.code = normalizeCourseCode(course.code);
                    }
                });
            });
        });
    });

    return data;
}

function getCourseDisplayLabel(course) {
    const code = normalizeCourseCode(course.code);
    const title = String(course.name || course.title || '').trim();
    return title ? `${code} - ${title}` : code;
}

function isSchedulableDay(day) {
    return day === 'MW' || day === 'TR';
}

function getQuarterCourses(quarter) {
    return flattenQuarterData(scheduleData[quarter] || {}).map((course) => ({
        ...course,
        code: normalizeCourseCode(course.code),
        credits: Number(course.credits) || 5
    }));
}

function formatConflictSlot(day, time) {
    const dayLabel = day === 'MW'
        ? 'Monday & Wednesday'
        : day === 'TR'
            ? 'Tuesday & Thursday'
            : day;
    return `${dayLabel}, ${formatTime(time)}`;
}

function createConflictEntry({
    severity = 'medium',
    time = '',
    courses = [],
    impact = '',
    affected = 'Medium',
    source = 'computed',
    meta = {}
}) {
    return {
        severity: String(severity || 'medium').toLowerCase(),
        time,
        courses,
        impact,
        affected,
        source,
        ...meta
    };
}

function dedupeConflicts(conflicts) {
    const seen = new Set();
    const deduped = [];

    conflicts.forEach((conflict) => {
        const key = [
            conflict.source || '',
            conflict.severity || '',
            conflict.title || '',
            conflict.time || '',
            (conflict.courses || []).slice().sort().join('|'),
            conflict.impact || '',
            conflict.description || ''
        ].join('::');

        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(conflict);
    });

    return deduped;
}

function sortConflicts(conflicts) {
    return [...conflicts].sort((a, b) => {
        const severityDelta = getConflictSeverityRank(b.severity) - getConflictSeverityRank(a.severity);
        if (severityDelta !== 0) return severityDelta;
        const timeA = a.time || '';
        const timeB = b.time || '';
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        const detailA = a.impact || a.description || a.title || '';
        const detailB = b.impact || b.description || b.title || '';
        return detailA.localeCompare(detailB);
    });
}

function buildPairingConflicts(quarterCourses) {
    const conflicts = [];
    const slotMap = new Map();
    const commonPairings = (typeof ConflictEngine !== 'undefined' && Array.isArray(ConflictEngine.COMMON_PAIRINGS))
        ? ConflictEngine.COMMON_PAIRINGS
        : [];

    quarterCourses
        .filter((course) => isSchedulableDay(course.day) && course.time)
        .forEach((course) => {
            const key = `${course.day}|${course.time}`;
            if (!slotMap.has(key)) slotMap.set(key, []);
            slotMap.get(key).push(course);
        });

    slotMap.forEach((slotCourses, slotKey) => {
        if (slotCourses.length < 2) return;

        const codesInSlot = new Set(slotCourses.map((course) => normalizeCourseCode(course.code)));
        const pairMatches = commonPairings.filter(([first, second]) =>
            codesInSlot.has(normalizeCourseCode(first)) && codesInSlot.has(normalizeCourseCode(second))
        );

        if (!pairMatches.length) return;

        const matchedCodes = new Set(pairMatches.flat().map(normalizeCourseCode));
        const matchedCourses = slotCourses.filter((course) => matchedCodes.has(normalizeCourseCode(course.code)));

        const has400Level = Array.from(matchedCodes).some((code) => {
            const match = code.match(/\b(\d{3})\b/);
            return match ? Number(match[1]) >= 400 : false;
        });

        const [day, time] = slotKey.split('|');
        const pairText = pairMatches
            .map(([first, second]) => `${normalizeCourseCode(first)} + ${normalizeCourseCode(second)}`)
            .join('; ');

        conflicts.push(createConflictEntry({
            severity: has400Level ? 'critical' : pairMatches.length > 1 ? 'high' : 'medium',
            time: formatConflictSlot(day, time),
            courses: matchedCourses.map(getCourseDisplayLabel),
            impact: `Courses commonly taken together overlap in one slot: ${pairText}.`,
            affected: pairMatches.length > 1 ? 'High' : 'Medium',
            source: 'pathway-pairing',
            meta: {
                dayPattern: day,
                timeSlot: time
            }
        }));
    });

    return conflicts;
}

function buildFacultyDoubleBookConflicts(quarterCourses) {
    const conflicts = [];
    const byInstructorSlot = new Map();

    quarterCourses
        .filter((course) =>
            isSchedulableDay(course.day)
            && course.time
            && course.instructor
            && getCanonicalFacultyName(course.instructor) !== 'TBD'
        )
        .forEach((course) => {
            const instructor = getCanonicalFacultyName(course.instructor);
            const key = `${instructor}|${course.day}|${course.time}`;
            if (!byInstructorSlot.has(key)) byInstructorSlot.set(key, []);
            byInstructorSlot.get(key).push(course);
        });

    byInstructorSlot.forEach((slotCourses, key) => {
        if (slotCourses.length < 2) return;
        const rooms = new Set(slotCourses.map((course) => course.room));
        if (rooms.size < 2) return;

        const [instructor, day, time] = key.split('|');
        conflicts.push(createConflictEntry({
            severity: 'critical',
            time: formatConflictSlot(day, time),
            courses: slotCourses.map(getCourseDisplayLabel),
            impact: `${instructor} is double-booked in different rooms at the same time.`,
            affected: 'High',
            source: 'faculty-double-book',
            meta: {
                dayPattern: day,
                timeSlot: time,
                instructor
            }
        }));
    });

    return conflicts;
}

function buildRoomDoubleBookConflicts(quarterCourses) {
    const conflicts = [];
    const byRoomSlot = new Map();

    quarterCourses
        .filter((course) =>
            isSchedulableDay(course.day)
            && course.time
            && course.room
            && course.room !== 'ONLINE'
            && course.room !== 'ARRANGED'
        )
        .forEach((course) => {
            const key = `${course.room}|${course.day}|${course.time}`;
            if (!byRoomSlot.has(key)) byRoomSlot.set(key, []);
            byRoomSlot.get(key).push(course);
        });

    byRoomSlot.forEach((slotCourses, key) => {
        if (slotCourses.length < 2) return;
        const [room, day, time] = key.split('|');
        conflicts.push(createConflictEntry({
            severity: 'critical',
            time: formatConflictSlot(day, time),
            courses: slotCourses.map(getCourseDisplayLabel),
            impact: `Room ${room} is double-booked for the same time slot.`,
            affected: 'High',
            source: 'room-double-book',
            meta: {
                dayPattern: day,
                timeSlot: time,
                room
            }
        }));
    });

    return conflicts;
}

function buildAySetupConflicts(quarterCoursesMap) {
    const empty = {
        byQuarter: { fall: [], winter: [], spring: [] },
        annualIssues: []
    };

    if (typeof ConflictEngine === 'undefined' || typeof ConflictEngine.evaluateAySetup !== 'function') {
        return empty;
    }

    const analysis = ConflictEngine.evaluateAySetup(
        quarterCoursesMap,
        readAySetupDataForYear(currentAcademicYear),
        {
            academicYear: currentAcademicYear,
            canonicalizeFacultyName: getCanonicalFacultyName
        }
    );

    const mapIssueToConflictEntry = (issue, quarter) => {
        const displaySeverity = issue.severity === 'critical'
            ? 'critical'
            : issue.priority === 'high'
                ? 'high'
                : 'medium';
        const mappedCourses = (issue.courses || []).map((course) => {
            if (typeof course === 'string') return course;
            return getCourseDisplayLabel({
                code: course.code,
                name: course.title
            });
        }).filter(Boolean);

        return createConflictEntry({
            severity: displaySeverity,
            time: issue.title || `${CONFLICT_QUARTER_LABELS[quarter]} AY setup`,
            courses: mappedCourses,
            impact: issue.description || 'Detected an AY setup mismatch.',
            affected: issue.priority === 'high' || issue.severity === 'critical' ? 'High' : 'Medium',
            source: 'ay-setup'
        });
    };

    const byQuarter = {
        fall: [],
        winter: [],
        spring: []
    };
    CONFLICT_QUARTERS.forEach((quarter) => {
        byQuarter[quarter] = (analysis.byQuarter?.[quarter] || []).map((issue) =>
            mapIssueToConflictEntry(issue, quarter)
        );
    });

    const annualIssues = (analysis.annualIssues || []).map((issue) => ({
        severity: issue.severity === 'critical'
            ? 'critical'
            : issue.priority === 'high'
                ? 'high'
                : 'medium',
        title: issue.title || 'AY Setup Check',
        description: issue.description || 'Detected an AY setup mismatch.',
        source: 'ay-setup'
    }));

    return {
        byQuarter,
        annualIssues: sortConflicts(dedupeConflicts(annualIssues))
    };
}

function refreshConflictData() {
    const generated = {
        fall: [],
        winter: [],
        spring: []
    };
    const quarterCoursesMap = {};

    CONFLICT_QUARTERS.forEach((quarter) => {
        const quarterCourses = getQuarterCourses(quarter);
        quarterCoursesMap[quarter] = quarterCourses;

        generated[quarter].push(...buildPairingConflicts(quarterCourses));
        generated[quarter].push(...buildFacultyDoubleBookConflicts(quarterCourses));
        generated[quarter].push(...buildRoomDoubleBookConflicts(quarterCourses));
    });

    const ayChecks = buildAySetupConflicts(quarterCoursesMap);
    CONFLICT_QUARTERS.forEach((quarter) => {
        generated[quarter].push(...(ayChecks.byQuarter[quarter] || []));
        generated[quarter] = sortConflicts(dedupeConflicts(generated[quarter]));
    });

    conflictData = generated;
    annualConflictInsights = ayChecks.annualIssues || [];
}

function getAnnualConflictPatterns() {
    const patterns = new Map();

    CONFLICT_QUARTERS.forEach((quarter) => {
        const quarterConflicts = (conflictData[quarter] || []).filter((conflict) => conflict.source !== 'ay-setup');
        quarterConflicts.forEach((conflict) => {
            const patternLabel = getConflictPatternLabel(conflict);
            if (!patterns.has(patternLabel)) {
                patterns.set(patternLabel, {
                    label: patternLabel,
                    quarters: new Set(),
                    count: 0,
                    severity: (conflict.severity || 'medium').toLowerCase(),
                    impact: conflict.impact || ''
                });
            }

            const pattern = patterns.get(patternLabel);
            pattern.quarters.add(quarter);
            pattern.count += 1;

            if (getConflictSeverityRank(conflict.severity) > getConflictSeverityRank(pattern.severity)) {
                pattern.severity = (conflict.severity || 'medium').toLowerCase();
            }
        });
    });

    return Array.from(patterns.values()).sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const severityDelta = getConflictSeverityRank(b.severity) - getConflictSeverityRank(a.severity);
        if (severityDelta !== 0) return severityDelta;
        return a.label.localeCompare(b.label);
    });
}

function renderAnnualConflictSummary(activeQuarter) {
    const summaryEl = document.getElementById('annualConflictSummary');
    if (!summaryEl) return;

    const totalYearConflicts = CONFLICT_QUARTERS.reduce(
        (sum, quarterKey) => sum + ((conflictData[quarterKey] || []).length),
        0
    );
    const quarterConflicts = (conflictData[activeQuarter] || []).length;
    const patterns = getAnnualConflictPatterns();
    const recurringPatterns = patterns.filter((pattern) => pattern.quarters.size > 1).length;

    while (summaryEl.firstChild) {
        summaryEl.removeChild(summaryEl.firstChild);
    }

    const header = document.createElement('div');
    header.className = 'annual-conflict-header';

    const title = document.createElement('strong');
    title.textContent = 'Whole-Year Conflict Patterns';
    header.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'annual-conflict-stats';
    [
        `${totalYearConflicts} annual conflicts`,
        `${patterns.length} unique patterns`,
        `${recurringPatterns} recurring`,
        `${annualConflictInsights.length} AY setup issues`,
        `${quarterConflicts} in ${CONFLICT_QUARTER_LABELS[activeQuarter] || activeQuarter}`
    ].forEach((label) => {
        const chip = document.createElement('span');
        chip.className = 'annual-conflict-stat';
        chip.textContent = label;
        stats.appendChild(chip);
    });
    header.appendChild(stats);
    summaryEl.appendChild(header);

    if (patterns.length === 0 && annualConflictInsights.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'no-conflicts-quarter';
        empty.textContent = 'No major conflict patterns across the academic year.';
        summaryEl.appendChild(empty);
        return;
    }

    const patternList = document.createElement('div');
    patternList.className = 'annual-pattern-list';

    patterns.slice(0, 5).forEach((pattern) => {
        const item = document.createElement('div');
        item.className = `annual-pattern-item ${pattern.severity}`;

        const itemTitle = document.createElement('div');
        itemTitle.className = 'annual-pattern-title';
        itemTitle.textContent = pattern.label;

        const itemMeta = document.createElement('div');
        itemMeta.className = 'annual-pattern-meta';
        const quarterLabels = Array.from(pattern.quarters)
            .map((quarterKey) => CONFLICT_QUARTER_LABELS[quarterKey] || quarterKey)
            .sort()
            .join(', ');
        itemMeta.textContent = `Quarters: ${quarterLabels} | Frequency: ${pattern.count}`;

        item.appendChild(itemTitle);
        item.appendChild(itemMeta);
        patternList.appendChild(item);
    });

    annualConflictInsights.forEach((issue) => {
        const item = document.createElement('div');
        item.className = `annual-pattern-item ${issue.severity || 'medium'}`;

        const itemTitle = document.createElement('div');
        itemTitle.className = 'annual-pattern-title';
        itemTitle.textContent = issue.title;

        const itemMeta = document.createElement('div');
        itemMeta.className = 'annual-pattern-meta';
        itemMeta.textContent = issue.description;

        item.appendChild(itemTitle);
        item.appendChild(itemMeta);
        patternList.appendChild(item);
    });

    summaryEl.appendChild(patternList);
}

function createConflictItem(conflict) {
    const item = document.createElement('div');
    item.className = 'conflict-item ' + conflict.severity;

    const header = document.createElement('div');
    header.className = 'conflict-header';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'conflict-time';
    timeSpan.textContent = conflict.time;

    const severityBadge = document.createElement('span');
    severityBadge.className = 'severity-badge ' + conflict.severity;
    severityBadge.textContent = conflict.severity;

    header.appendChild(timeSpan);
    header.appendChild(severityBadge);

    const impactP = document.createElement('p');
    impactP.style.cssText = 'margin: 10px 0; color: #495057;';
    impactP.textContent = conflict.impact;

    const affectedP = document.createElement('p');
    affectedP.style.cssText = 'margin: 10px 0; color: #6c757d; font-size: 0.9em;';
    const affectedStrong = document.createElement('strong');
    affectedStrong.textContent = 'Students Affected:';
    affectedP.appendChild(affectedStrong);
    affectedP.appendChild(document.createTextNode(' ' + conflict.affected));

    const coursesDiv = document.createElement('div');
    coursesDiv.className = 'conflict-courses';
    (conflict.courses || []).forEach(course => {
        const tag = document.createElement('span');
        tag.className = 'conflict-course-tag';
        tag.textContent = course;
        coursesDiv.appendChild(tag);
    });

    item.appendChild(header);
    item.appendChild(impactP);
    item.appendChild(affectedP);
    item.appendChild(coursesDiv);
    return item;
}

function renderConflicts(quarter) {
    const conflictsList = document.getElementById('conflictsList');
    const activeQuarter = CONFLICT_QUARTERS.includes(quarter) ? quarter : 'spring';
    const quarterOrder = [activeQuarter, ...CONFLICT_QUARTERS.filter((key) => key !== activeQuarter)];

    refreshConflictData();
    renderAnnualConflictSummary(activeQuarter);

    while (conflictsList.firstChild) {
        conflictsList.removeChild(conflictsList.firstChild);
    }

    quarterOrder.forEach((quarterKey) => {
        const group = document.createElement('section');
        group.className = 'conflict-quarter-group';

        const title = document.createElement('h3');
        title.className = 'conflict-quarter-title';
        title.textContent = `${CONFLICT_QUARTER_LABELS[quarterKey]} Quarter`;

        if (quarterKey === activeQuarter) {
            const currentTag = document.createElement('span');
            currentTag.className = 'current-quarter-tag';
            currentTag.textContent = 'Current View';
            title.appendChild(currentTag);
        }

        group.appendChild(title);

        const conflicts = conflictData[quarterKey] || [];
        if (!conflicts.length) {
            const noConflicts = document.createElement('p');
            noConflicts.className = 'no-conflicts-quarter';
            noConflicts.textContent = `No major conflicts detected in ${CONFLICT_QUARTER_LABELS[quarterKey]}.`;
            group.appendChild(noConflicts);
        } else {
            conflicts.forEach((conflict) => {
                group.appendChild(createConflictItem(conflict));
            });
        }

        conflictsList.appendChild(group);
    });
}

function renderConflictSolver(quarter) {
    const solverList = document.getElementById('conflictSolverList');
    const data = scheduleData[quarter] || {};
    const days = ['MW', 'TR'];
    const times = ['10:00-12:20', '13:00-15:20', '16:00-18:20'];
    const rooms = ['206', '209', '210', '212', 'CEB 102', 'CEB 104'];

    refreshConflictData();

    // Clear safely
    while (solverList.firstChild) {
        solverList.removeChild(solverList.firstChild);
    }

    // Build slot map for recommendation analysis
    const scheduleMatrix = {};
    days.forEach((day) => {
        times.forEach((time) => {
            const key = `${day} ${time}`;
            const courses = data[day]?.[time] || [];
            scheduleMatrix[key] = courses.map((course) => ({ ...course, day, time }));
        });
    });

    const quarterCourses = flattenQuarterData(data).map((course) => ({
        ...course,
        code: normalizeCourseCode(course.code)
    }));

    const conflictsToSolve = (conflictData[quarter] || [])
        .filter((conflict) =>
            conflict.source !== 'ay-setup'
            && (conflict.severity === 'critical' || conflict.severity === 'high')
            && conflict.dayPattern
            && conflict.timeSlot
        )
        .map((conflict) => {
            const slotKey = `${conflict.dayPattern} ${conflict.timeSlot}`;
            const slotCourses = scheduleMatrix[slotKey] || [];
            const firstCourseCode = extractConflictCourseCode((conflict.courses || [])[0]);

            const moveCandidate = slotCourses.find((course) =>
                normalizeCourseCode(course.code) === normalizeCourseCode(firstCourseCode)
            ) || slotCourses[0] || quarterCourses.find((course) =>
                normalizeCourseCode(course.code) === normalizeCourseCode(firstCourseCode)
            ) || null;

            if (!moveCandidate) return null;

            const sourceLabelMap = {
                'pathway-pairing': 'Pathway conflict',
                'faculty-double-book': 'Faculty double-booking',
                'room-double-book': 'Room double-booking'
            };

            return {
                conflict,
                dayPattern: conflict.dayPattern,
                timeSlot: conflict.timeSlot,
                slotKey,
                slotCourses,
                moveCandidate,
                sourceLabel: sourceLabelMap[conflict.source] || 'Schedule conflict'
            };
        })
        .filter(Boolean);

    if (conflictsToSolve.length === 0) {
        const noConflicts = document.createElement('p');
        noConflicts.style.cssText = 'color: #51cf66; font-weight: 600;';
        noConflicts.textContent = '✓ No urgent conflicts requiring automated resolution for this quarter.';
        solverList.appendChild(noConflicts);
        return;
    }

    conflictsToSolve.forEach((entry) => {
        const movingInstructor = getCanonicalFacultyName(entry.moveCandidate.instructor || 'TBD');
        const solutions = [];

        days.forEach((day) => {
            times.forEach((time) => {
                if (day === entry.dayPattern && time === entry.timeSlot) return;

                const slotKey = `${day} ${time}`;
                const existingCourses = scheduleMatrix[slotKey] || [];
                const usedRooms = new Set(existingCourses.map((course) => course.room).filter(Boolean));
                const availableRooms = rooms.filter((room) => !usedRooms.has(room));
                const instructorConflict = movingInstructor !== 'TBD' && existingCourses.some((course) =>
                    getCanonicalFacultyName(course.instructor || 'TBD') === movingInstructor
                );

                let status = 'viable';
                let recommendation = '✅ RECOMMENDED';
                if (instructorConflict) {
                    status = 'blocked';
                    recommendation = '❌ Instructor conflict';
                } else if (availableRooms.length === 0) {
                    status = 'blocked';
                    recommendation = '❌ No rooms available';
                } else if (existingCourses.length >= 4) {
                    status = 'warning';
                    recommendation = '⚠️ Dense slot, review impact';
                } else if (existingCourses.length <= 2) {
                    recommendation = '✅ BEST OPTION';
                }

                solutions.push({
                    slotKey,
                    slotLabel: `${day} ${time}`,
                    existingCourses,
                    roomsAvailable: availableRooms.length,
                    status,
                    recommendation,
                    instructorConflict
                });
            });
        });

        const statusRank = { viable: 3, warning: 2, blocked: 1 };
        solutions.sort((a, b) => {
            const rankDelta = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
            if (rankDelta !== 0) return rankDelta;
            return b.roomsAvailable - a.roomsAvailable;
        });

        const card = document.createElement('div');
        card.className = 'conflict-solution-card';

        const title = document.createElement('h3');
        title.textContent = `${entry.sourceLabel}: ${formatConflictSlot(entry.dayPattern, entry.timeSlot)}`;

        const infoP = document.createElement('p');
        infoP.style.cssText = 'color: #666; margin-bottom: 15px;';
        infoP.innerHTML = `
                    <strong>Issue:</strong> ${escapeHtml(entry.conflict.impact || 'Conflict detected')}<br>
                    <strong>Students Affected:</strong> ${escapeHtml(entry.conflict.affected || 'Medium')}<br>
                    <strong>Current Slot:</strong> ${escapeHtml(entry.slotKey)}
                `;

        const analysisH4 = document.createElement('h4');
        analysisH4.style.cssText = 'margin-top: 15px; margin-bottom: 10px; color: #495057;';
        analysisH4.textContent = 'Automated Solutions Analysis:';

        const matrixP = document.createElement('p');
        matrixP.style.cssText = 'font-size: 0.9em; color: #666; margin-bottom: 15px;';
        matrixP.innerHTML = `Matrix analysis for moving <strong>${escapeHtml(getCourseDisplayLabel(entry.moveCandidate))}</strong> (${escapeHtml(entry.moveCandidate.instructor || 'TBD')}):`;

        card.appendChild(title);
        card.appendChild(infoP);
        card.appendChild(analysisH4);
        card.appendChild(matrixP);

        solutions.slice(0, 6).forEach((solution) => {
            const option = document.createElement('div');
            option.className = 'solution-option' + (solution.status === 'blocked' ? ' creates-conflict' : solution.status === 'warning' ? ' warning' : '');

            const recDiv = document.createElement('div');
            recDiv.className = 'solution-recommendation';
            recDiv.textContent = `${solution.recommendation} Move to ${solution.slotLabel}`;

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'solution-details';
            const existingText = solution.existingCourses.length > 0
                ? solution.existingCourses.map((course) => `${normalizeCourseCode(course.code)} (${course.room || 'TBD'})`).join(', ')
                : 'EMPTY SLOT';
            detailsDiv.innerHTML = `
                        <strong>Currently scheduled:</strong> ${escapeHtml(existingText)}<br>
                        <strong>Rooms available:</strong> ${solution.roomsAvailable} of ${rooms.length}
                    `;

            if (solution.instructorConflict) {
                const warnSpan = document.createElement('span');
                warnSpan.style.color = '#ff6b6b';
                warnSpan.textContent = ' ⚠️ Instructor already teaching at this time';
                detailsDiv.appendChild(warnSpan);
            } else if (solution.status === 'viable' && solution.roomsAvailable >= 4) {
                const okSpan = document.createElement('span');
                okSpan.style.color = '#51cf66';
                okSpan.textContent = ' ✓ Minimal impact, ample room capacity';
                detailsDiv.appendChild(okSpan);
            }

            option.appendChild(recDiv);
            option.appendChild(detailsDiv);
            card.appendChild(option);
        });

        solverList.appendChild(card);
    });
}

function renderRecommendations(quarter) {
    const recList = document.getElementById('recommendationsList');
    refreshConflictData();
    const quarterConflicts = conflictData[quarter] || [];
    const dynamicRecs = [];

    quarterConflicts.forEach((conflict) => {
        if (conflict.source === 'ay-setup') {
            dynamicRecs.push({
                priority: conflict.severity === 'critical' ? 'critical' : 'high',
                title: `Align AY Setup: ${conflict.time}`,
                description: `${conflict.impact} Update AY setup targets or rebalance assignments to match planned workload.`
            });
            return;
        }

        const sourceAction = conflict.source === 'room-double-book'
            ? 'Adjust room assignments to remove overlap.'
            : conflict.source === 'faculty-double-book'
                ? 'Reassign instructor or move one section to an open slot.'
                : 'Move one of the overlapping pathway courses to an alternate slot.';

        dynamicRecs.push({
            priority: conflict.severity === 'critical' ? 'critical' : conflict.severity === 'high' ? 'high' : 'medium',
            title: `Resolve ${conflict.time}`,
            description: `${conflict.impact} ${sourceAction}`
        });
    });

    annualConflictInsights.forEach((issue) => {
        dynamicRecs.push({
            priority: issue.severity === 'critical' ? 'critical' : issue.severity === 'high' ? 'high' : 'medium',
            title: issue.title,
            description: `${issue.description} Address this in Academic Year Setup to keep yearly assignments aligned.`
        });
    });

    const seen = new Set();
    const recs = dynamicRecs.filter((rec) => {
        const key = `${rec.title}::${rec.description}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Clear safely
    while (recList.firstChild) {
        recList.removeChild(recList.firstChild);
    }

    if (recs.length === 0) {
        const noRecs = document.createElement('p');
        noRecs.textContent = 'No specific recommendations for this quarter.';
        recList.appendChild(noRecs);
        return;
    }

    recs.forEach(rec => {
        const item = document.createElement('div');
        let className = 'recommendation-item';
        if (rec.priority === 'critical') className += ' priority-critical';
        else if (rec.priority === 'high') className += ' priority-high';
        item.className = className;

        const title = document.createElement('h3');
        title.textContent = rec.title;

        const desc = document.createElement('p');
        desc.textContent = rec.description;

        item.appendChild(title);
        item.appendChild(desc);
        recList.appendChild(item);
    });
}

const UTILIZATION_ROOMS = ['206', '209', '210', '212', 'CEB 102', 'CEB 104'];
const UTILIZATION_DAYS = ['MW', 'TR'];
const UTILIZATION_TIMES = ['10:00-12:20', '13:00-15:20', '16:00-18:20'];
const CHENEY_ONLY_COURSES = new Set(['DESN 100', 'DESN 200', 'DESN 216']);
const ROOM_212_ONLY_COURSES = new Set(['DESN 301', 'DESN 359', 'DESN 401']);
const ROOM_212_OVERFLOW_COURSES = new Set(['DESN 100', 'DESN 200']);

function getQuarterSchedulableCourses(data) {
    return flattenQuarterData(data || {})
        .filter((course) =>
            isSchedulableDay(course.day)
            && UTILIZATION_TIMES.includes(course.time)
            && UTILIZATION_ROOMS.includes(String(course.room || '').trim())
        )
        .map((course) => ({
            ...course,
            code: normalizeCourseCode(course.code),
            credits: Number(course.credits) || 5
        }));
}

function isRoomPlacementCompatible(course) {
    const code = normalizeCourseCode(course.code);
    const room = String(course.room || '').trim();
    const time = String(course.time || '').trim();
    const isEvening = time.startsWith('16:');

    if (!UTILIZATION_ROOMS.includes(room)) return false;

    if (code.startsWith('ITGS')) {
        return (room === 'CEB 102' || room === 'CEB 104') && !isEvening;
    }

    if (ROOM_212_ONLY_COURSES.has(code)) {
        return room === '212';
    }

    if (room === '212') {
        return ROOM_212_ONLY_COURSES.has(code) || ROOM_212_OVERFLOW_COURSES.has(code);
    }

    if (CHENEY_ONLY_COURSES.has(code)) {
        return room === 'CEB 102' || room === 'CEB 104' || room === '212';
    }

    return true;
}

function buildCapacityUtilizationSnapshot(quarter, data) {
    const aySetup = readAySetupDataForYear(currentAcademicYear) || {};
    const facultyRecords = Array.isArray(aySetup.faculty) ? aySetup.faculty : [];
    const adjunctTarget = Number(aySetup?.adjunctTargets?.[quarter]) || 0;

    const capacityByFaculty = new Map();
    const adjunctFacultyNames = new Set();
    let fullTimeCapacityCredits = 0;
    let adjunctRosterCapacityCredits = 0;

    facultyRecords.forEach((record) => {
        const canonicalName = getCanonicalFacultyName(record.name || '');
        if (!canonicalName || canonicalName === 'TBD') return;

        const annualTarget = Number(record.annualTargetCredits) || 0;
        const releaseCredits = Number(record.releaseCredits) || 0;
        const ftePercent = Number(record.ftePercent);
        const fteFactor = Number.isFinite(ftePercent) && ftePercent > 0 ? Math.min(1, ftePercent / 100) : 1;
        const quarterlyCapacity = Math.max(0, (annualTarget - releaseCredits) / 3) * fteFactor;
        const roleText = String(record.role || '').toLowerCase();
        const isAdjunct = canonicalName === 'Adjunct' || roleText.includes('adjunct');

        capacityByFaculty.set(canonicalName, {
            quarterlyCapacity,
            isAdjunct
        });

        if (isAdjunct) {
            adjunctFacultyNames.add(canonicalName);
            adjunctRosterCapacityCredits += quarterlyCapacity;
        } else {
            fullTimeCapacityCredits += quarterlyCapacity;
        }
    });

    const allQuarterCourses = flattenQuarterData(data || {}).map((course) => ({
        ...course,
        instructor: getCanonicalFacultyName(course.instructor || 'TBD'),
        credits: Number(course.credits) || 5
    }));

    let totalAssignedTeachingCredits = 0;
    let assignedAdjunctCredits = 0;
    let implicitUnknownFacultyCapacity = 0;

    allQuarterCourses.forEach((course) => {
        if (!course.instructor || course.instructor === 'TBD') return;
        totalAssignedTeachingCredits += course.credits;

        const knownFaculty = capacityByFaculty.get(course.instructor);
        if (course.instructor === 'Adjunct' || knownFaculty?.isAdjunct || adjunctFacultyNames.has(course.instructor)) {
            assignedAdjunctCredits += course.credits;
            return;
        }

        if (!knownFaculty) {
            // Neutral treatment for instructors missing from AY setup to reduce hidden bias.
            implicitUnknownFacultyCapacity += course.credits;
        }
    });

    const schedulableCourses = getQuarterSchedulableCourses(data);
    const compatiblePlacements = schedulableCourses.filter(isRoomPlacementCompatible).length;
    const roomFitRate = schedulableCourses.length > 0 ? compatiblePlacements / schedulableCourses.length : 1;

    const usedRoomSlots = new Set(
        schedulableCourses.map((course) => `${course.day}|${course.time}|${course.room}`)
    ).size;
    const totalRoomSlots = UTILIZATION_ROOMS.length * UTILIZATION_DAYS.length * UTILIZATION_TIMES.length;
    const roomUtilizationRate = totalRoomSlots > 0 ? usedRoomSlots / totalRoomSlots : 0;

    const adjunctCapacityCredits = Math.max(adjunctTarget, adjunctRosterCapacityCredits, assignedAdjunctCredits);
    const totalFacultyCapacityCredits =
        fullTimeCapacityCredits + adjunctCapacityCredits + implicitUnknownFacultyCapacity;
    const facultyUtilizationRate = totalFacultyCapacityCredits > 0
        ? totalAssignedTeachingCredits / totalFacultyCapacityCredits
        : 0;

    const compositeRate =
        (Math.min(1.2, facultyUtilizationRate) * 0.55)
        + (roomUtilizationRate * 0.30)
        + (roomFitRate * 0.15);

    return {
        utilizationPercent: Math.max(0, Math.round(compositeRate * 100)),
        facultyUtilizationRate,
        roomUtilizationRate,
        roomFitRate,
        totalAssignedTeachingCredits,
        totalFacultyCapacityCredits,
        assignedAdjunctCredits,
        adjunctTarget,
        usedRoomSlots,
        totalRoomSlots,
        implicitUnknownFacultyCapacity
    };
}

function updateStats(quarter) {
    const data = scheduleData[quarter];
    refreshConflictData();
    const conflicts = conflictData[quarter] || [];

    let totalCourses = 0;
    Object.values(data).forEach(dayData => {
        Object.values(dayData).forEach(timeSlot => {
            totalCourses += timeSlot.length;
        });
    });

    const criticalConflicts = conflicts.filter(c => c.severity === 'critical').length;
    const snapshot = buildCapacityUtilizationSnapshot(quarter, data);
    const utilizationRate = snapshot.utilizationPercent;

    document.getElementById('criticalConflicts').textContent = criticalConflicts;
    document.getElementById('totalConflicts').textContent = conflicts.length;
    document.getElementById('totalCourses').textContent = totalCourses;
    document.getElementById('utilizationRate').textContent = utilizationRate + '%';

    const utilizationEl = document.getElementById('utilizationRate');
    if (utilizationEl) {
        utilizationEl.title =
            `Capacity-aware utilization\n`
            + `Faculty load: ${snapshot.totalAssignedTeachingCredits.toFixed(1)} / ${snapshot.totalFacultyCapacityCredits.toFixed(1)} credits `
            + `(${Math.round(snapshot.facultyUtilizationRate * 100)}%)\n`
            + `Room slots used: ${snapshot.usedRoomSlots} / ${snapshot.totalRoomSlots} `
            + `(${Math.round(snapshot.roomUtilizationRate * 100)}%)\n`
            + `Room fit score: ${Math.round(snapshot.roomFitRate * 100)}%\n`
            + `Adjunct assigned/target: ${snapshot.assignedAdjunctCredits.toFixed(1)} / ${snapshot.adjunctTarget.toFixed(1)} credits`
            + (snapshot.implicitUnknownFacultyCapacity > 0
                ? `\nImplicit capacity from non-AY faculty: ${snapshot.implicitUnknownFacultyCapacity.toFixed(1)} credits`
                : '');
    }
}

function isCourseInMinor(courseCode, minorKey) {
    const normalizedCode = normalizeCourseCode(courseCode);
    return (minors[minorKey]?.courses || [])
        .some((code) => normalizeCourseCode(code) === normalizedCode);
}

function displayMinorInfo(minorKey) {
    const panel = document.getElementById('minorInfoPanel');

    // Clear safely
    while (panel.firstChild) {
        panel.removeChild(panel.firstChild);
    }

    if (minorKey === 'all') {
        return;
    }

    const minor = minors[minorKey];

    const infoPanel = document.createElement('div');
    infoPanel.className = 'minor-info-panel';

    const title = document.createElement('h3');
    title.textContent = minor.name;

    const reqText = document.createElement('p');
    reqText.textContent = 'Required Courses:';

    const coursesDiv = document.createElement('div');
    coursesDiv.className = 'minor-courses';
    minor.courses.forEach(course => {
        const tag = document.createElement('div');
        tag.className = 'minor-course-tag';
        tag.textContent = course;
        coursesDiv.appendChild(tag);
    });

    infoPanel.appendChild(title);
    infoPanel.appendChild(reqText);
    infoPanel.appendChild(coursesDiv);

    if (minor.note) {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'minor-note';
        noteDiv.textContent = minor.note;
        infoPanel.appendChild(noteDiv);
    }

    panel.appendChild(infoPanel);
}

function displayTrackSuggestions(trackKey) {
    const panel = document.getElementById('trackSuggestionsPanel');

    // Clear safely
    while (panel.firstChild) {
        panel.removeChild(panel.firstChild);
    }

    if (trackKey === 'all') {
        return;
    }

    const track = studentTracks[trackKey];
    const suggestedMinors = track.suggestedMinors.map(minorKey => {
        const minor = minors[minorKey];
        return {
            key: minorKey,
            name: minor.name,
            typical: minor.typical
        };
    });

    const container = document.createElement('div');
    container.className = 'suggested-minors';

    const title = document.createElement('h3');
    title.textContent = 'Suggested Minors for ' + track.name + ' Students';

    const list = document.createElement('div');
    list.className = 'minor-list';

    suggestedMinors.forEach(m => {
        const chip = document.createElement('div');
        chip.className = 'minor-chip' + (!m.typical ? ' not-typical' : '');
        chip.textContent = m.name;
        chip.onclick = function () { selectMinor(m.key); };
        list.appendChild(chip);
    });

    container.appendChild(title);
    container.appendChild(list);
    panel.appendChild(container);
}

function selectMinor(minorKey) {
    document.getElementById('minorFilter').value = minorKey;
    document.getElementById('minorFilter').dispatchEvent(new Event('change'));
}

function resetLensFilters() {
    const minorFilter = document.getElementById('minorFilter');
    const trackFilter = document.getElementById('trackFilter');
    if (minorFilter) minorFilter.value = 'all';
    if (trackFilter) trackFilter.value = 'all';

    displayMinorInfo('all');
    highlightMinorCourses('all');
    displayTrackSuggestions('all');
    updateLensStatus();
}

function updateLensStatus() {
    const status = document.getElementById('lensStatus');
    if (!status) return;

    const minorKey = document.getElementById('minorFilter')?.value || 'all';
    const trackKey = document.getElementById('trackFilter')?.value || 'all';
    const chips = [];

    if (trackKey !== 'all' && studentTracks[trackKey]) {
        chips.push(`<span class="lens-chip">Track: ${escapeHtml(studentTracks[trackKey].name)}</span>`);
    }

    if (minorKey !== 'all' && minors[minorKey]) {
        const highlightedCount = document.querySelectorAll('.course-block.minor-highlight').length;
        chips.push(`<span class="lens-chip">Minor: ${escapeHtml(minors[minorKey].name)}</span>`);
        chips.push(`<span class="lens-chip">${highlightedCount} highlighted sections</span>`);
    }

    if (!chips.length) {
        status.textContent = 'No advising lens active.';
        return;
    }

    status.innerHTML = chips.join('');
}

function highlightMinorCourses(minorKey) {
    const courseBlocks = document.querySelectorAll('.course-block');
    courseBlocks.forEach(block => {
        block.classList.remove('minor-highlight');
    });

    if (minorKey !== 'all') {
        courseBlocks.forEach(block => {
            const courseCode = normalizeCourseCode(
                block.dataset.courseCode || block.querySelector('.course-name')?.textContent || ''
            );
            if (isCourseInMinor(courseCode, minorKey)) {
                block.classList.add('minor-highlight');
            }
        });
    }

    updateLensStatus();
}

// Current course being viewed/edited
let currentCourseData = null;

function showCourseDetails(code, name, instructor, credits, room, courseId, quarter, day, time) {
    // Store course data for edit modal
    currentCourseData = { code, name, instructor, credits, room, courseId, quarter, day, time };

    // Format day/time for display
    const dayDisplay = day || 'TBD';
    const timeDisplay = time || 'TBD';

    // Build details content
    const content = document.getElementById('courseDetailsContent');
    content.innerHTML = `
                <p><strong>Course:</strong> ${code} - ${name || 'N/A'}</p>
                <p><strong>Instructor:</strong> ${instructor || 'TBD'}</p>
                <p><strong>Credits:</strong> ${credits || 'N/A'}</p>
                <p><strong>Days:</strong> ${dayDisplay}</p>
                <p><strong>Time:</strong> ${timeDisplay}</p>
                <p><strong>Room:</strong> ${room || 'TBD'}</p>
            `;

    document.getElementById('detailsModalTitle').textContent = code;
    document.getElementById('courseDetailsModal').classList.add('active');
}

function closeCourseDetailsModal() {
    document.getElementById('courseDetailsModal').classList.remove('active');
    currentCourseData = null;
}

function openEditModal() {
    if (!currentCourseData) return;

    // Close details modal
    document.getElementById('courseDetailsModal').classList.remove('active');

    // Fill edit form with current data
    document.getElementById('editCourseId').value = currentCourseData.courseId || '';
    document.getElementById('editCourseCode').value = currentCourseData.code || '';
    document.getElementById('editSection').value = '001';
    document.getElementById('editCredits').value = currentCourseData.credits || 5;

    // Set year and quarter
    document.getElementById('editYear').value = '2025-26'; // Current academic year
    document.getElementById('editQuarter').value = currentCourseData.quarter || 'spring';

    // Default enrollment cap is 24 for most courses
    const specialCaps = { 'DESN 399': 5, 'DESN 491': 10, 'DESN 495': 15, 'DESN 499': 10 };
    const defaultCap = specialCaps[currentCourseData.code] || 24;
    document.getElementById('editEnrollmentCap').value = defaultCap;
    document.getElementById('editRoom').value = currentCourseData.room || '';
    document.getElementById('editNotes').value = '';

    // Parse time slot (e.g., "10:00-12:00" -> start: "10:00", end: "12:00")
    let startTime = '';
    let endTime = '';
    if (currentCourseData.time) {
        const timeParts = currentCourseData.time.split('-');
        if (timeParts.length === 2) {
            startTime = timeParts[0];
            endTime = timeParts[1];
        }
    }
    document.getElementById('editStartTime').value = startTime;
    document.getElementById('editEndTime').value = endTime;

    // Clear day checkboxes first
    ['M', 'T', 'W', 'Th', 'F'].forEach(day => {
        const cb = document.getElementById('editDay' + day);
        if (cb) cb.checked = false;
    });

    // Set day checkboxes based on current day pattern (e.g., "MW" -> M, W checked)
    if (currentCourseData.day) {
        const dayPattern = currentCourseData.day;
        if (dayPattern === 'MW') {
            document.getElementById('editDayM').checked = true;
            document.getElementById('editDayW').checked = true;
        } else if (dayPattern === 'TR') {
            document.getElementById('editDayT').checked = true;
            document.getElementById('editDayTh').checked = true;
        } else {
            // Handle other patterns by checking matching days
            if (dayPattern.includes('M')) document.getElementById('editDayM').checked = true;
            if (dayPattern.includes('T') && !dayPattern.includes('Th')) document.getElementById('editDayT').checked = true;
            if (dayPattern.includes('W')) document.getElementById('editDayW').checked = true;
            if (dayPattern.includes('Th')) document.getElementById('editDayTh').checked = true;
            if (dayPattern.includes('F')) document.getElementById('editDayF').checked = true;
        }
    }

    // Set faculty dropdown - find matching option
    const facultySelect = document.getElementById('editFaculty');
    const instructorValue = currentCourseData.instructor || '';
    let facultyFound = false;

    // Helper to extract last name from various formats
    const getLastName = (name) => {
        if (!name) return '';
        // Handle "S.Durr" format
        if (name.includes('.')) {
            return name.split('.').pop().toLowerCase();
        }
        // Handle "Sam Durr" format
        return name.split(' ').pop().toLowerCase();
    };

    const instructorLastName = getLastName(instructorValue);

    for (let i = 0; i < facultySelect.options.length; i++) {
        const optionValue = facultySelect.options[i].value;

        // Try exact match first
        if (optionValue === instructorValue) {
            facultySelect.selectedIndex = i;
            facultyFound = true;
            break;
        }

        // Check if last names match (handles "S.Durr" matching to "S.Durr (Lecturer)")
        const optionLastName = getLastName(optionValue);
        if (instructorLastName && optionLastName && instructorLastName === optionLastName) {
            facultySelect.selectedIndex = i;
            facultyFound = true;
            break;
        }
    }

    // If still not found, set value directly (it may work if exact match exists)
    if (!facultyFound && instructorValue && instructorValue !== 'TBD') {
        facultySelect.value = instructorValue;
        if (facultySelect.value !== instructorValue) {
            // Value didn't stick, reset to placeholder
            facultySelect.selectedIndex = 0;
        }
    }

    // Try to get more data from ScheduleManager if available
    if (typeof ScheduleManager !== 'undefined' && currentCourseData.courseId) {
        const schedule = ScheduleManager.getQuarterSchedule('2025-26', currentCourseData.quarter);
        const course = schedule.find(c => c.id === currentCourseData.courseId);
        if (course) {
            document.getElementById('editSection').value = course.section || '001';
            // Only override enrollment cap if ScheduleManager has one set
            if (course.enrollmentCap) {
                document.getElementById('editEnrollmentCap').value = course.enrollmentCap;
            }
            document.getElementById('editNotes').value = course.notes || '';
            // Override with ScheduleManager data if available
            if (course.startTime) document.getElementById('editStartTime').value = course.startTime;
            if (course.endTime) document.getElementById('editEndTime').value = course.endTime;
            if (course.days && Array.isArray(course.days)) {
                // Clear and reset days
                ['M', 'T', 'W', 'Th', 'F'].forEach(day => {
                    const cb = document.getElementById('editDay' + day);
                    if (cb) cb.checked = false;
                });
                course.days.forEach(day => {
                    const cb = document.getElementById('editDay' + day);
                    if (cb) cb.checked = true;
                });
            }
        }
    }

    // Open edit modal
    document.getElementById('courseEditModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('courseEditModal').classList.remove('active');
}

function getEditSelectedDays() {
    const days = [];
    ['M', 'T', 'W', 'Th', 'F'].forEach(day => {
        const cb = document.getElementById('editDay' + day);
        if (cb && cb.checked) days.push(day);
    });
    return days;
}

function handleEditFormSubmit(e) {
    e.preventDefault();

    const courseId = document.getElementById('editCourseId').value;
    const year = document.getElementById('editYear').value;
    const quarterRaw = document.getElementById('editQuarter').value;
    const quarter = quarterRaw.charAt(0).toUpperCase() + quarterRaw.slice(1);
    const quarterLower = quarterRaw.toLowerCase();

    const newInstructor = document.getElementById('editFaculty').value || 'TBD';
    const newRoom = document.getElementById('editRoom').value || '';

    const updates = {
        section: document.getElementById('editSection').value,
        credits: parseInt(document.getElementById('editCredits').value) || 5,
        enrollmentCap: parseInt(document.getElementById('editEnrollmentCap').value) || 24,
        assignedFaculty: newInstructor,
        room: newRoom,
        days: getEditSelectedDays(),
        startTime: document.getElementById('editStartTime').value || null,
        endTime: document.getElementById('editEndTime').value || null,
        notes: document.getElementById('editNotes').value || null
    };

    // Track if we successfully saved
    let savedSuccessfully = false;

    // Update the scheduleData directly for immediate display (primary save path)
    if (currentCourseData) {
        const { day, time, room, code } = currentCourseData;
        const quarterData = scheduleData[quarterLower];

        if (quarterData && quarterData[day] && quarterData[day][time]) {
            const courses = quarterData[day][time];
            const courseIndex = courses.findIndex(c => c.code === code && c.room === room);

            if (courseIndex !== -1) {
                courses[courseIndex].instructor = newInstructor;
                if (newRoom) courses[courseIndex].room = newRoom;
                // Update other fields
                courses[courseIndex].credits = updates.credits;
                courses[courseIndex].enrollmentCap = updates.enrollmentCap;
                courses[courseIndex].section = updates.section;
                if (updates.notes) courses[courseIndex].notes = updates.notes;
                saveScheduleData();
                savedSuccessfully = true;
            }
        }
    }

    // Try ScheduleManager update as secondary sync (don't fail if it doesn't work)
    if (typeof ScheduleManager !== 'undefined' && courseId) {
        try {
            const result = ScheduleManager.updateCourseAssignment(year, quarter, courseId, updates);
            if (result.success) {
                savedSuccessfully = true;
            }
            // If ScheduleManager fails but direct save worked, that's still OK
        } catch (e) {
            console.log('ScheduleManager update skipped:', e.message);
        }
    }

    // Show result based on whether any save path succeeded
    if (savedSuccessfully) {
        showToast('Course updated successfully');
        closeEditModal();
        // Refresh the schedule view
        const currentQuarter = window.StateManager?.get('currentQuarter') || 'spring';
        renderSchedule(currentQuarter);
        renderOnlineCourses(currentQuarter);
        renderArrangedCourses(currentQuarter);
    } else {
        // No direct save path available - try just closing and refreshing
        showToast('Course updated');
        closeEditModal();
        const currentQuarter = window.StateManager?.get('currentQuarter') || 'spring';
        renderSchedule(currentQuarter);
        renderOnlineCourses(currentQuarter);
        renderArrangedCourses(currentQuarter);
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.style.background = type === 'error' ? '#dc3545' : '#1f2937';
    toast.classList.add('visible');
    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

function highlightConflicts() {
    alert('Conflicts are highlighted in red (3+ courses) and orange (2 courses) in the schedule grid!');
}

function exportReport() {
    alert('Export functionality would generate a PDF report with full conflict analysis and recommendations.');
}


document.getElementById('minorFilter').addEventListener('change', function () {
    const minorKey = this.value;
    displayMinorInfo(minorKey);
    highlightMinorCourses(minorKey);
});

document.getElementById('trackFilter').addEventListener('change', function () {
    const trackKey = this.value;
    displayTrackSuggestions(trackKey);
    updateLensStatus();
});

// ============================================
// DISPLACED COURSES TRAY
// ============================================

let displacedCourses = [];
let courseToDelete = null;
let swapMode = false; // false = displace, true = swap

// Update swap mode labels when toggle changes
function updateSwapModeLabels() {
    swapMode = document.getElementById('swapModeToggle').checked;
    document.getElementById('displaceLabel').classList.toggle('active', !swapMode);
    document.getElementById('swapLabel').classList.toggle('active', swapMode);
    // Save preference
    localStorage.setItem('swapMode', swapMode ? 'true' : 'false');
}

// Load swap mode preference
function loadSwapMode() {
    const saved = localStorage.getItem('swapMode');
    swapMode = saved === 'true';
    document.getElementById('swapModeToggle').checked = swapMode;
    updateSwapModeLabels();
}

// Load displaced courses from localStorage
function loadDisplacedCourses() {
    const saved = localStorage.getItem('displacedCourses');
    if (saved) {
        displacedCourses = JSON.parse(saved);
        updateDisplacedTray();
    }
}

// Save displaced courses to localStorage
function saveDisplacedCourses() {
    localStorage.setItem('displacedCourses', JSON.stringify(displacedCourses));
}

// Add a course to the displaced tray
function addToDisplacedTray(course) {
    displacedCourses.push(course);
    saveDisplacedCourses();
    updateDisplacedTray();
    openDisplacedTray();
}

// Remove a course from displaced tray
function removeFromDisplacedTray(index) {
    displacedCourses.splice(index, 1);
    saveDisplacedCourses();
    updateDisplacedTray();
}

// Clear all displaced courses
function clearAllDisplaced() {
    displacedCourses = [];
    saveDisplacedCourses();
    updateDisplacedTray();
    closeDisplacedTray();
}

// Update the displaced tray display
function updateDisplacedTray() {
    const content = document.getElementById('displacedContent');
    const countBadge = document.getElementById('displacedCount');
    const toggleCount = document.getElementById('toggleCount');
    const toggle = document.getElementById('displacedToggle');

    countBadge.textContent = displacedCourses.length;
    toggleCount.textContent = displacedCourses.length;

    // Show/hide toggle button
    if (displacedCourses.length > 0) {
        toggle.classList.add('visible');
    } else {
        toggle.classList.remove('visible');
    }

    if (displacedCourses.length === 0) {
        content.innerHTML = `
                    <div class="displaced-empty">
                        <div class="displaced-empty-icon">📦</div>
                        <p>No displaced courses</p>
                        <p style="font-size: 0.8rem;">Courses bumped from their slots will appear here</p>
                    </div>
                `;
        return;
    }

    content.innerHTML = displacedCourses.map((course, index) => `
                <div class="displaced-course-card" draggable="true"
                     data-displaced-index="${index}"
                     data-course-code="${course.code}"
                     ondragstart="handleDisplacedDragStart(event, ${index})"
                     ondragend="handleDisplacedDragEnd(event)">
                    <div class="displaced-course-header">
                        <span class="displaced-course-code">${course.code}</span>
                        <button class="displaced-course-remove" onclick="removeFromDisplacedTray(${index})" title="Remove">&times;</button>
                    </div>
                    <div class="displaced-course-name">${course.name || ''}</div>
                    <div class="displaced-course-origin">was at: ${course.originalDay} ${course.originalTime}, Room ${course.originalRoom}</div>
                </div>
            `).join('');
}

// Open displaced tray
function openDisplacedTray() {
    document.getElementById('displacedTray').classList.add('open');
    document.getElementById('displacedToggle').classList.remove('visible');
    document.body.classList.add('tray-open');
}

// Close displaced tray
function closeDisplacedTray() {
    document.getElementById('displacedTray').classList.remove('open');
    document.body.classList.remove('tray-open');
    if (displacedCourses.length > 0) {
        document.getElementById('displacedToggle').classList.add('visible');
    }
}

// Handle drag start from displaced tray
function handleDisplacedDragStart(e, index) {
    const course = displacedCourses[index];
    e.target.classList.add('dragging');

    draggedCourse = {
        element: e.target,
        courseCode: course.code,
        courseName: course.name,
        instructor: course.instructor,
        credits: course.credits,
        isFromDisplacedTray: true,
        displacedIndex: index,
        originalDay: course.originalDay,
        originalTime: course.originalTime,
        originalRoom: course.originalRoom
    };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedCourse));

    // Show drop indicator
    const indicator = document.getElementById('dropIndicator');
    document.getElementById('dropIndicatorText').textContent =
        'Dragging ' + course.code + ' - Drop on schedule to place';
    indicator.classList.add('active');
}

// Handle drag end from displaced tray
function handleDisplacedDragEnd(e) {
    e.target.classList.remove('dragging');
    document.getElementById('dropIndicator').classList.remove('active');
    document.querySelectorAll('.schedule-cell').forEach(cell => {
        cell.classList.remove('drag-over');
    });
}

// Handle drag over the displaced tray (to drop courses into it)
function handleTrayDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.getElementById('displacedTray').classList.add('drag-over');
    // Auto-open tray when dragging over
    openDisplacedTray();
}

// Handle drag leave from displaced tray
function handleTrayDragLeave(e) {
    // Only remove if leaving the tray entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
        document.getElementById('displacedTray').classList.remove('drag-over');
    }
}

// Handle drop onto displaced tray
function handleTrayDrop(e) {
    e.preventDefault();
    document.getElementById('displacedTray').classList.remove('drag-over');

    if (!draggedCourse || draggedCourse.isFromDisplacedTray) return;

    const quarter = window.StateManager?.get('currentQuarter') || 'spring';
    const data = scheduleData[quarter];

    // Remove course from schedule and add to tray
    if (data[draggedCourse.originalDay] && data[draggedCourse.originalDay][draggedCourse.originalTime]) {
        const courses = data[draggedCourse.originalDay][draggedCourse.originalTime];
        const courseIndex = courses.findIndex(c => c.code === draggedCourse.courseCode);

        if (courseIndex > -1) {
            const course = courses.splice(courseIndex, 1)[0];
            addToDisplacedTray({
                code: course.code,
                name: course.name,
                instructor: course.instructor,
                credits: course.credits,
                originalDay: draggedCourse.originalDay,
                originalTime: draggedCourse.originalTime,
                originalRoom: draggedCourse.originalRoom
            });

            renderSchedule(quarter);
            renderConflicts(quarter);
            updateStats(quarter);
            showToast(course.code + ' moved to displaced tray');
        }
    }

    // Clear dragged course
    draggedCourse = null;
    document.getElementById('dropIndicator').classList.remove('active');
}

// ============================================
// DELETE COURSE FUNCTIONALITY
// ============================================

function deleteCourse(courseCode, day, time, room, shiftKey) {
    if (shiftKey) {
        // Shift+Click: Move to displaced tray
        const data = scheduleData[window.StateManager?.get('currentQuarter') || 'spring'];
        if (data[day] && data[day][time]) {
            const courseIndex = data[day][time].findIndex(c => c.code === courseCode && c.room === room);
            if (courseIndex > -1) {
                const course = data[day][time][courseIndex];
                addToDisplacedTray({
                    code: course.code,
                    name: course.name,
                    instructor: course.instructor,
                    credits: course.credits,
                    originalDay: day,
                    originalTime: time,
                    originalRoom: room
                });
                data[day][time].splice(courseIndex, 1);
                saveScheduleData(); // Persist changes
                renderSchedule(window.StateManager?.get('currentQuarter') || 'spring');
                showToast(courseCode + ' moved to displaced tray');
            }
        }
    } else {
        // Regular click: Show confirmation dialog
        courseToDelete = { courseCode, day, time, room };
        document.getElementById('deleteConfirmText').textContent =
            'Are you sure you want to permanently remove ' + courseCode + ' from the schedule?';
        document.getElementById('deleteConfirmModal').classList.add('active');
    }
}

function confirmDelete() {
    if (!courseToDelete) return;

    const { courseCode, day, time, room } = courseToDelete;
    const quarter = window.StateManager?.get('currentQuarter') || 'spring';
    const data = scheduleData[quarter];

    if (data[day] && data[day][time]) {
        const courseIndex = data[day][time].findIndex(c => c.code === courseCode && c.room === room);
        if (courseIndex > -1) {
            data[day][time].splice(courseIndex, 1);
            saveScheduleData(); // Persist changes
            renderSchedule(quarter);
            renderConflicts(quarter);
            updateStats(quarter);
            showToast(courseCode + ' removed from schedule');
        }
    }

    closeDeleteConfirm();
}

function closeDeleteConfirm() {
    document.getElementById('deleteConfirmModal').classList.remove('active');
    courseToDelete = null;
}

// ============================================
// ADD COURSE FUNCTIONALITY
// ============================================

async function openAddCourseModal() {
    document.getElementById('addCourseForm').reset();
    document.getElementById('addDayM').checked = true;
    document.getElementById('addDayW').checked = true;
    document.getElementById('addOnlineSection').checked = false;
    toggleOnlineMode(false);
    document.getElementById('addCourseModal').classList.add('active');

    // Load courses from Supabase
    await loadCoursesFromSupabase();
    // Load faculty from Supabase
    await loadFacultyFromSupabase();
}

function toggleOnlineMode(isOnline) {
    const inPersonFields = document.getElementById('inPersonFields');
    const roomSelect = document.getElementById('addRoom');
    const startTime = document.getElementById('addStartTime');
    const endTime = document.getElementById('addEndTime');

    if (isOnline) {
        inPersonFields.style.display = 'none';
        roomSelect.value = 'ONLINE';
        roomSelect.disabled = true;
        startTime.required = false;
        endTime.required = false;
        roomSelect.required = false;
    } else {
        inPersonFields.style.display = 'block';
        roomSelect.value = '';
        roomSelect.disabled = false;
        startTime.required = true;
        endTime.required = true;
        roomSelect.required = true;
    }
}

async function loadCoursesFromSupabase() {
    const select = document.getElementById('addCourseCode');
    if (!supabase) return; // Keep hardcoded fallback if Supabase not configured

    try {
        const { data: courses, error } = await supabase
            .from('courses')
            .select('code, title')
            .order('code');

        if (error) throw error;

        if (courses && courses.length > 0) {
            // Clear existing options except the placeholder
            select.innerHTML = '<option value="">Select Course...</option>';

            // Add courses from database
            courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course.code;
                option.textContent = `${course.code} - ${course.title}`;
                select.appendChild(option);
            });
            console.log(`Loaded ${courses.length} courses from Supabase`);
        }
    } catch (err) {
        console.warn('Could not load courses from Supabase, using fallback:', err.message);
    }
}

async function loadFacultyFromSupabase() {
    const select = document.getElementById('addFaculty');
    if (!supabase) return; // Keep hardcoded fallback if Supabase not configured

    try {
        const { data: faculty, error } = await supabase
            .from('faculty')
            .select('name')
            .order('name');

        if (error) throw error;

        if (faculty && faculty.length > 0) {
            // Clear existing options except the placeholder
            select.innerHTML = '<option value="">Select Instructor...</option>';

            // Add faculty from database
            faculty.forEach(f => {
                const option = document.createElement('option');
                // Format name as "F.Lastname"
                const nameParts = f.name.split(', ');
                const shortName = nameParts.length > 1
                    ? `${nameParts[1].charAt(0)}.${nameParts[0]}`
                    : f.name;
                option.value = shortName;
                option.textContent = f.name;
                select.appendChild(option);
            });

            // Add TBD option
            const tbdOption = document.createElement('option');
            tbdOption.value = 'TBD';
            tbdOption.textContent = 'TBD';
            select.appendChild(tbdOption);

            console.log(`Loaded ${faculty.length} faculty from Supabase`);
        }
    } catch (err) {
        console.warn('Could not load faculty from Supabase, using fallback:', err.message);
    }
}

function closeAddCourseModal() {
    document.getElementById('addCourseModal').classList.remove('active');
}

function getAddSelectedDays() {
    const days = [];
    ['M', 'T', 'W', 'Th', 'F'].forEach(day => {
        const cb = document.getElementById('addDay' + day);
        if (cb && cb.checked) days.push(day);
    });
    return days;
}

function handleAddCourseSubmit(e) {
    e.preventDefault();

    const courseCode = normalizeCourseCode(document.getElementById('addCourseCode').value);
    const courseName = document.getElementById('addCourseCode').options[document.getElementById('addCourseCode').selectedIndex].text.split(' - ')[1] || '';
    const section = document.getElementById('addSection').value;
    const credits = parseInt(document.getElementById('addCredits').value);
    const instructor = document.getElementById('addFaculty').value || 'TBD';
    const isOnline = document.getElementById('addOnlineSection').checked;
    const room = document.getElementById('addRoom').value;

    const quarter = window.StateManager?.get('currentQuarter') || 'spring';
    const data = scheduleData[quarter];

    let dayPattern, timeSlot;

    if (isOnline || room === 'ONLINE') {
        dayPattern = 'ONLINE';
        timeSlot = 'async';
    } else {
        const days = getAddSelectedDays();
        const startTime = document.getElementById('addStartTime').value;
        dayPattern = (days.includes('M') || days.includes('W')) ? 'MW' : 'TR';
        timeSlot = startTime.replace(':', '') === '1000' ? '10:00-12:20' :
            startTime.replace(':', '') === '1300' ? '13:00-15:20' : '16:00-18:20';
    }

    // Ensure structure exists
    if (!data[dayPattern]) data[dayPattern] = {};
    if (!data[dayPattern][timeSlot]) data[dayPattern][timeSlot] = [];

    // Add the course
    data[dayPattern][timeSlot].push({
        code: courseCode,
        name: courseName,
        instructor: instructor,
        credits: credits,
        room: isOnline ? 'ONLINE' : room
    });

    closeAddCourseModal();
    saveScheduleData(); // Save to localStorage
    renderSchedule(quarter);
    renderConflicts(quarter);
    updateStats(quarter);
    showToast(courseCode + ' added to schedule');
}

// Current academic year
let currentAcademicYear = '2025-26';

// Schedule data persistence (year-aware)
function getStorageKey(year) {
    return 'designSchedulerData_' + (year || currentAcademicYear);
}

function saveScheduleData() {
    try {
        normalizeScheduleCourseCodes(scheduleData);
        localStorage.setItem(getStorageKey(), JSON.stringify(scheduleData));
        console.log('Schedule data saved for year:', currentAcademicYear);
    } catch (e) {
        console.warn('Could not save schedule data:', e);
    }
}

function migrateTimeSlots(data) {
    const timeMapping = {
        '10:00-12:00': '10:00-12:20',
        '13:00-15:00': '13:00-15:20',
        '16:00-18:00': '16:00-18:20'
    };
    let migrated = false;

    for (const quarter of ['fall', 'winter', 'spring']) {
        if (data[quarter]) {
            for (const day of ['MW', 'TR']) {
                if (data[quarter][day]) {
                    for (const oldTime of Object.keys(timeMapping)) {
                        if (data[quarter][day][oldTime]) {
                            const newTime = timeMapping[oldTime];
                            data[quarter][day][newTime] = data[quarter][day][oldTime];
                            delete data[quarter][day][oldTime];
                            migrated = true;
                        }
                    }
                }
            }
            // Ensure ONLINE structure exists if not present
            if (!data[quarter]['ONLINE']) {
                data[quarter]['ONLINE'] = { 'async': [] };
            }
        }
    }

    if (migrated) {
        console.log('Migrated time slots to 2h 20min format');
    }
    return data;
}

function loadScheduleData(year) {
    const targetYear = year || currentAcademicYear;
    try {
        const saved = localStorage.getItem(getStorageKey(targetYear));
        if (saved) {
            let parsed = JSON.parse(saved);
            parsed = migrateTimeSlots(parsed);
            parsed = normalizeScheduleCourseCodes(parsed);
            for (const quarter of ['fall', 'winter', 'spring']) {
                if (parsed[quarter] && Object.keys(parsed[quarter]).length > 0) {
                    scheduleData[quarter] = parsed[quarter];
                }
            }
            console.log('Schedule data loaded for year:', targetYear);
            saveScheduleData();
            return true;
        }
    } catch (e) {
        console.warn('Could not load schedule data:', e);
    }
    return false;
}

function clearScheduleData() {
    localStorage.removeItem(getStorageKey());
    showToast('Schedule data cleared - refresh to reset');
}

// Migrate old storage format to year-aware format
function migrateOldScheduleData() {
    const oldKey = 'designSchedulerData';
    const oldData = localStorage.getItem(oldKey);
    if (oldData && !localStorage.getItem(getStorageKey('2025-26'))) {
        localStorage.setItem(getStorageKey('2025-26'), oldData);
        localStorage.removeItem(oldKey);
        console.log('Migrated schedule data to year-aware format');
    }
}

// Switch academic year
function switchAcademicYear(newYear) {
    // Save current year's data first
    saveScheduleData();

    // Switch to new year
    currentAcademicYear = newYear;

    // Reset scheduleData to defaults
    scheduleData.fall = {};
    scheduleData.winter = {};
    scheduleData.spring = {};

    // Load the new year's data (if any)
    const hasData = loadScheduleData(newYear);

    // Update quarter tab labels
    updateQuarterTabLabels(newYear);

    // Re-render current quarter
    const navComponent = document.getElementById('mainQuarterNav');
    const quarter = navComponent ? navComponent.currentQuarter : (window.StateManager?.get('currentQuarter') || 'spring');

    renderSchedule(quarter);
    renderConflicts(quarter);
    updateStats(quarter);

    if (!hasData) {
        showToast('Viewing ' + newYear + ' schedule (empty - use Copy to populate)');
    } else {
        showToast('Switched to ' + newYear + ' schedule');
    }
}

function updateQuarterTabLabels(year) {
    const [startYear, endYear] = year.split('-');
    const fullStartYear = startYear.length === 4 ? startYear : '20' + startYear;
    const fullEndYear = endYear.length === 4 ? endYear : '20' + endYear;

    // Update schedule grid title
    const quarterTitle = document.getElementById('quarterTitle');
    if (quarterTitle) {
        const navComponent = document.getElementById('mainQuarterNav');
        const currentQuarter = navComponent ? navComponent.currentQuarter : window.StateManager?.get('currentQuarter') || 'spring';
        const qYear = currentQuarter === 'fall' ? fullStartYear : fullEndYear;
        quarterTitle.textContent = currentQuarter.charAt(0).toUpperCase() + currentQuarter.slice(1) + ' ' + qYear;
    }
}

// Copy current year's schedule to next year
function copyToNextYear() {
    const navComponent = document.getElementById('mainQuarterNav');
    const academicYear = navComponent ? navComponent.currentYear : (window.StateManager?.get('currentAcademicYear') || '2025-26');
    let nextYear = null;

    if (academicYear) {
        const parts = academicYear.split('-');
        if (parts.length === 2) {
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            nextYear = `${start + 1}-${end + 1}`;
        }
    }

    if (!nextYear) {
        showToast('Could not calculate next year.', 'critical');
        return;
    }

    if (confirm(`Are you sure you want to copy the ENTIRE ${academicYear} schedule to ${nextYear}? This will overwrite existing ${nextYear} data.`)) {

        // Deep copy current schedule data
        const copyData = JSON.parse(JSON.stringify(scheduleData));

        // Save copy to next year's storage
        localStorage.setItem(getStorageKey(nextYear), JSON.stringify(copyData));

        showToast(`Schedule copied to ${nextYear}!`);

        // Ask if user wants to switch
        if (confirm(`Schedule copied to ${nextYear}. Switch to that year now?`)) {
            if (navComponent) {
                // Add the new year to the component's internal list if it's not there
                if (!navComponent.availableYears.includes(nextYear)) {
                    navComponent.availableYears.push(nextYear);
                }
                // Tell component to switch visually and logically
                navComponent.changeYear(nextYear);
            } else {
                switchAcademicYear(nextYear);
            }
        }
    }
}

// Initialize app - load data then render
// Faculty data from workload-data.json
let facultyList = [];

async function loadFacultyData() {
    try {
        const response = await fetch('workload-data.json');
        if (response.ok) {
            const data = await response.json();
            if (data.facultyWorkload) {
                facultyList = Object.keys(data.facultyWorkload).sort();
                populateFacultyDropdowns();
            }
        }
    } catch (error) {
        console.warn('Could not load faculty data:', error);
    }
}

function populateFacultyDropdowns() {
    const addFacultySelect = document.getElementById('addFaculty');
    const editFacultySelect = document.getElementById('editFaculty');

    // Clear existing options except first placeholder
    [addFacultySelect, editFacultySelect].forEach(select => {
        if (!select) return;
        // Keep first option (placeholder)
        while (select.options.length > 1) {
            select.remove(1);
        }
        // Add faculty options
        facultyList.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        // Add TBD option at end
        const tbdOption = document.createElement('option');
        tbdOption.value = 'TBD';
        tbdOption.textContent = 'TBD';
        select.appendChild(tbdOption);
    });
}

// Custom faculty storage
let customFaculty = JSON.parse(localStorage.getItem('customFaculty') || '[]');
let pendingFacultySelectId = null;

// Default faculty roster
const defaultFaculty = {
    'Professors': [
        { name: 'T.Masingale', rank: 'Professor' },
        { name: 'G.Hustrulid', rank: 'Professor' },
        { name: 'M.Breen', rank: 'Professor' },
        { name: 'C.Manikoth', rank: 'Professor' }
    ],
    'Lecturers': [
        { name: 'S.Mills', rank: 'Lecturer' },
        { name: 'A.Sopu', rank: 'Lecturer' },
        { name: 'S.Durr', rank: 'Lecturer' }
    ],
    'Adjuncts': [
        { name: 'J.Braukmann', rank: 'Adjunct' }
    ]
};

function rebuildFacultyDropdowns() {
    const selects = [
        document.getElementById('addFaculty'),
        document.getElementById('editFaculty')
    ];

    selects.forEach(select => {
        if (!select) return;
        const currentValue = select.value;

        // Clear and rebuild
        select.innerHTML = '<option value="">Select Instructor...</option>';

        // Add default faculty by rank
        Object.entries(defaultFaculty).forEach(([groupLabel, members]) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupLabel;
            members.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.name + ' (' + f.rank + ')';
                optgroup.appendChild(opt);
            });
            select.appendChild(optgroup);
        });

        // Add custom faculty if any
        if (customFaculty.length > 0) {
            const customGroup = document.createElement('optgroup');
            customGroup.label = 'Custom Faculty';
            customFaculty.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.name + ' (' + f.rank + ')';
                customGroup.appendChild(opt);
            });
            select.appendChild(customGroup);
        }

        // Add TBD and Add New options
        const tbdOpt = document.createElement('option');
        tbdOpt.value = 'TBD';
        tbdOpt.textContent = 'TBD';
        select.appendChild(tbdOpt);

        const addNewOpt = document.createElement('option');
        addNewOpt.value = '__add_new__';
        addNewOpt.textContent = '+ Add New Faculty...';
        select.appendChild(addNewOpt);

        // Restore selection if possible
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

function handleFacultySelectChange(selectId) {
    const select = document.getElementById(selectId);
    if (select.value === '__add_new__') {
        pendingFacultySelectId = selectId;
        select.value = ''; // Reset selection
        openAddFacultyModal();
    }
}

function openAddFacultyModal() {
    document.getElementById('addFacultyForm').reset();
    document.getElementById('addFacultyModal').classList.add('active');
}

function closeAddFacultyModal() {
    document.getElementById('addFacultyModal').classList.remove('active');
    pendingFacultySelectId = null;
}

function handleAddFacultySubmit(e) {
    e.preventDefault();

    const name = document.getElementById('newFacultyName').value.trim();
    const rank = document.getElementById('newFacultyRank').value;

    if (!name || !rank) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    // Check for duplicates
    const allFaculty = [...Object.values(defaultFaculty).flat(), ...customFaculty];
    if (allFaculty.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        showToast('Faculty member already exists', 'error');
        return;
    }

    // Add to custom faculty
    customFaculty.push({ name, rank });
    localStorage.setItem('customFaculty', JSON.stringify(customFaculty));

    // Rebuild dropdowns
    rebuildFacultyDropdowns();

    // Select the new faculty in the pending dropdown
    if (pendingFacultySelectId) {
        const select = document.getElementById(pendingFacultySelectId);
        if (select) {
            select.value = name;
        }
    }

    closeAddFacultyModal();
    showToast('Faculty member added: ' + name);
}

async function init() {
    await loadEnrollmentData();
    await loadFacultyData();

    // Initialize custom faculty from localStorage
    customFaculty = JSON.parse(localStorage.getItem('customFaculty') || '[]');

    // Rebuild faculty dropdowns with current roster
    rebuildFacultyDropdowns();

    // Add change handlers to faculty selects
    document.getElementById('addFaculty')?.addEventListener('change', () => handleFacultySelectChange('addFaculty'));
    document.getElementById('editFaculty')?.addEventListener('change', () => handleFacultySelectChange('editFaculty'));

    // Migrate old schedule data format to year-aware format
    migrateOldScheduleData();

    // Load saved schedule data from localStorage
    loadScheduleData();

    // Check for imported schedule from schedule builder
    checkForImportedSchedule();

    // Initialize ScheduleManager for editing
    if (typeof ScheduleManager !== 'undefined') {
        await ScheduleManager.init({ catalogPath: 'data/course-catalog.json' });
        console.log('ScheduleManager initialized');
    }

    // Load displaced courses from localStorage
    loadDisplacedCourses();

    // Load swap mode preference
    loadSwapMode();

    const initialQuarter = (window.StateManager && window.StateManager.get('currentQuarter')) || 'spring';

    // Dispatch a quarter-change event to sync UI headers and render the schedule
    document.dispatchEvent(new CustomEvent('quarter-change', {
        detail: { quarter: initialQuarter }
    }));

    // Render non-grid UI sections
    renderOnlineCourses(initialQuarter);
    renderArrangedCourses(initialQuarter);
    renderEnrollmentAnalytics(initialQuarter);
    renderConflicts(initialQuarter);
    renderConflictSolver(initialQuarter);
    renderRecommendations(initialQuarter);
    updateStats(initialQuarter);
}

// Start the app when page loads
init();
