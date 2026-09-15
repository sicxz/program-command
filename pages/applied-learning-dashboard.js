const AppliedLearningDashboard = (function () {
    'use strict';
    const byId = id => document.getElementById(id);
    const text = (id, value) => { byId(id).textContent = value; };
    const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    const format = value => value === null || value === undefined ? '—' : formatter.format(value);
    const yearLabel = value => value === 'all' ? 'All recorded years' : value.replace('-', '–');
    const sourceLabel = value => ({ 'program-command-schedule': 'Saved schedule / import', 'faculty-detail-entry': 'Faculty detail entry', 'unassigned-schedule': 'Unassigned schedule record' }[value] || 'Historical workload record');
    let source = null, workload = null, catalog = null, calendar = null, snapshots = null;
    let term = null, courses = [], captures = [], enrollmentView = null;
    let ready = false, bound = false, generation = 0;

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }
    function cell(row, content, className = '') {
        const node = element('td', className, content); row.append(node); return node;
    }
    function track(value, maximum, provisional = false) {
        const bar = element('div', 'applied-track'); bar.setAttribute('aria-hidden', 'true');
        const fill = element('span', `applied-fill${provisional ? ' provisional' : ''}`);
        fill.style.width = `${Math.max(0, value || 0) / Math.max(1, maximum) * 100}%`;
        bar.append(fill); return bar;
    }
    async function fetchJson(path) {
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Unable to read ${path}`);
        return response.json();
    }
    function updateTerm() {
        term = EnrollmentViewModel.currentTerm(new Date(), calendar);
        const description = term.status === 'upcoming' ? 'Upcoming quarter' : term.status === 'estimated' ? 'Estimated current quarter' : 'Current quarter';
        text('currentTermLabel', `${description}: ${term.label} · Academic year ${yearLabel(term.academicYear)}`);
    }
    function years() {
        const registered = EnrollmentViewModel.create(source, catalog, snapshots).years.map(year => year.value);
        return [...new Set([...registered, ...WorkloadIntegration.getAcademicYearOptions(workload || {}), term.academicYear])]
            .filter(year => /^\d{4}-\d{2}$/.test(year)).sort().reverse();
    }
    function option(value, label) { const node = element('option', '', label); node.value = value; return node; }
    function populateFilters() {
        const oldYear = byId('academicYearFilter').value;
        const yearOptions = [option('all', 'All recorded years'), option('current', `Automatic · ${yearLabel(term.academicYear)}`), ...years().map(year => option(year, yearLabel(year)))];
        byId('academicYearFilter').replaceChildren(...yearOptions);
        byId('academicYearFilter').value = yearOptions.some(item => item.value === oldYear) ? oldYear : 'current';
        const oldCourse = byId('courseFilter').value;
        const courseOptions = [option('all', 'All applied-learning courses'), ...courses.map(course => option(course.code, `${course.code} · ${course.title}`))];
        byId('courseFilter').replaceChildren(...courseOptions);
        byId('courseFilter').value = courseOptions.some(item => item.value === oldCourse) ? oldCourse : 'all';
    }
    function selection() {
        const year = byId('academicYearFilter').value;
        const quarter = byId('quarterFilter').value;
        return {
            year: year === 'current' ? term.academicYear : year,
            quarter: quarter === 'current' ? term.season : quarter,
            course: byId('courseFilter').value
        };
    }
    function buildView() {
        const integratedYears = {};
        const selected = selection();
        const includedYears = selected.year === 'all' ? years() : [selected.year];
        includedYears.forEach(year => {
            integratedYears[year] = WorkloadIntegration.buildIntegratedWorkloadYearData(CapacityViewModel.exactYearSource(workload || {}, year), year);
        });
        return AppliedLearningViewModel.build({ enrollment: enrollmentView, integratedYears, courses }, selected);
    }
    function renderRegistrations(view) {
        const registered = view.registrations;
        const selected = selection();
        const scope = `${yearLabel(selected.year)} · ${selected.quarter === 'annual' ? 'all recorded quarters' : selected.quarter}`;
        text('registrationCount', format(registered.total));
        text('registrationNote', registered.provisionalQuarters.length ? 'Includes provisional registrations' : 'Course seats, not unique students');
        text('courseCount', registered.total === null ? '—' : format(registered.courses.filter(course => course.total !== null).length));
        text('quarterCount', registered.total === null ? '—' : format(registered.recordedQuarterCount));
        text('quarterNote', selected.quarter === 'annual' ? yearLabel(selected.year) : `${selected.quarter} records in the selected years`);
        text('quarterScope', scope); text('courseScope', scope);
        text('scopeReading', registered.total === null ? 'No registration records match this selection. Choose another year, quarter or course to inspect participation.' : `${format(registered.total)} registrations are recorded across ${format(registered.recordedQuarterCount)} quarters for the selected applied-learning courses.`);
        byId('provisionalNote').hidden = !registered.provisionalQuarters.length;
        text('provisionalNote', `Includes provisional registration counts for ${registered.provisionalQuarters.join(', ')}. These are saved registration snapshots, not final census counts.`);
        const maximum = Math.max(1, ...registered.quarters.map(quarter => quarter.total || 0));
        byId('quarterBars').replaceChildren(...registered.quarters.map(quarter => {
            const row = element('div', 'applied-quarter-row');
            const label = element('span', 'applied-quarter-label', quarter.label);
            if (quarter.provisional) label.append(element('small', '', 'Provisional'));
            row.append(label, track(quarter.total, maximum, quarter.provisional), element('strong', '', format(quarter.total)));
            return row;
        }));
        byId('quarterEmpty').hidden = registered.total !== null;
        const courseMaximum = Math.max(1, ...registered.courses.map(course => course.total || 0));
        byId('courseCards').replaceChildren(...registered.courses.map(course => {
            const card = element('article', 'applied-course');
            const top = element('div', 'applied-course-heading'); top.append(element('h3', '', course.code), element('strong', '', format(course.total)));
            card.append(top, element('p', '', course.title), track(course.total, courseMaximum), element('small', '', course.total === null ? 'No matching registration record' : 'Course registrations'));
            return card;
        }));
    }
    function renderWorkload(view) {
        const supervision = view.workload;
        const selected = selection();
        text('workloadCount', format(supervision.total));
        text('workloadNote', supervision.rows.length ? supervision.missingMetricCount ? 'Some credit inputs are missing · inspect records' : 'Workload credits · saved records, coverage unverified' : 'No matching supervision records');
        text('supervisionScope', `${yearLabel(selected.year)} · ${selected.quarter === 'annual' ? 'all recorded quarters' : selected.quarter} · workload credits`);
        byId('supervisionEmpty').hidden = supervision.rows.length > 0;
        byId('supervisionContent').hidden = !supervision.rows.length;
        text('recordedCredits', format(supervision.total)); text('workloadRecords', format(supervision.recordCount));
        text('supervisorCount', format(supervision.supervisorCount)); text('unassignedCredits', format(supervision.unassignedWorkload));
        byId('courseFacultyDrilldown').replaceChildren(...view.byCourseFaculty.map(course => {
            const details = element('details', 'chart-data');
            details.append(element('summary', '', `${course.label} · ${format(course.sections)} sections · ${format(course.credits)} credits`));
            const region = element('div', 'table-scroll'); region.tabIndex = 0; region.setAttribute('role', 'region');
            region.setAttribute('aria-label', `${course.label} supervision by faculty`);
            const table = element('table');
            const caption = element('caption', 'sr-only', `${course.label} supervision grouped by faculty.`);
            const head = element('thead'); const headingRow = element('tr');
            [['Faculty', ''], ['Sections', 'numeric'], ['Credit input', 'numeric'], ['Workload credits', 'numeric']].forEach(([label, className]) => {
                const heading = element('th', className, label); heading.scope = 'col'; headingRow.append(heading);
            });
            head.append(headingRow);
            const body = element('tbody');
            course.faculty.forEach(faculty => {
                const row = element('tr'); cell(row, faculty.name); cell(row, format(faculty.sections), 'numeric');
                cell(row, format(faculty.credits), 'numeric'); cell(row, format(faculty.workload), 'numeric'); body.append(row);
            });
            table.append(caption, head, body); region.append(table); details.append(region); return details;
        }));
        const maximum = Math.max(1, ...supervision.faculty.map(faculty => faculty.workload || 0));
        byId('facultyBars').replaceChildren(...supervision.faculty.map(faculty => {
            const row = element('article', 'applied-faculty'); const top = element('div', 'applied-faculty-topline');
            top.append(element('h3', '', faculty.name), element('strong', '', format(faculty.workload)));
            row.append(top, track(faculty.workload, maximum), element('small', '', `${format(faculty.recordCount)} workload records`)); return row;
        }));
        byId('workloadTableBody').replaceChildren(...supervision.rows.map(record => {
            const row = element('tr'); [yearLabel(record.year), record.quarter || 'Not recorded', record.courseCode, record.faculty || 'Unassigned'].forEach(value => cell(row, value));
            cell(row, format(record.credits), 'numeric'); cell(row, format(record.workloadCredits), 'numeric'); cell(row, sourceLabel(record.source)); return row;
        }));
        text('workloadSource', supervision.rows.length ? `${format(supervision.recordCount)} matching saved workload records are shown. No completeness guarantee or saved-draft timestamp is available. Recorded workload is independent of enrollment coverage.` : 'No matching supervised workload records are present in the loaded historical file or this browser’s saved planning sources. Missing records do not mean zero supervision.');
    }
    function renderRates() {
        const selected = byId('courseFilter').value;
        byId('rateCards').replaceChildren(...courses.filter(course => selected === 'all' || selected === course.code).map(course => {
            const card = element('div', 'applied-rate');
            card.append(element('h3', '', course.code), element('strong', '', `${format(course.rate)}×`), element('p', '', `${format(5 * course.rate)} workload credits per 5 recorded credits`)); return card;
        }));
    }
    function render() {
        if (!ready) return;
        updateTerm(); courses = WorkloadIntegration.getAppliedLearningCourses(); populateFilters();
        const view = buildView(); renderRegistrations(view); renderWorkload(view); renderRates();
        const metadata = EnrollmentViewModel.create(source, catalog, snapshots);
        text('sourceCoverage', metadata.lastQuarter ? `Registration records through ${metadata.lastQuarter}` : 'Registration coverage unavailable');
        const latestCapture = captures[captures.length - 1];
        const sourceDate = latestCapture?.observedAt || metadata.sourceDate;
        text('sourceDate', sourceDate ? `${latestCapture ? 'Registration capture' : 'Historical file'}: ${new Date(sourceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })}` : 'Source date unavailable');
        text('registrationSource', metadata.firstQuarter ? `Available source coverage: ${metadata.firstQuarter} to ${metadata.lastQuarter}. Only the applied-learning courses configured in the active department profile are counted here.` : 'No registration source coverage is available.');
    }
    function bindEvents() {
        if (bound) return; bound = true;
        document.querySelectorAll('.filters select').forEach(select => select.addEventListener('change', render));
        window.addEventListener('storage', event => {
            if (event.key === null || [DepartmentProfileManager.ACTIVE_PROFILE_STORAGE_KEY, DepartmentProfileManager.CUSTOM_PROFILES_STORAGE_KEY].includes(event.key)) return init({ forceProfileReload: true });
            render();
        });
        window.addEventListener('focus', () => {
            if (DepartmentProfileManager.getStoredProfileId() !== DepartmentProfileManager.getActiveProfileId()) return init({ forceProfileReload: true });
            render();
        });
        window.addEventListener('department-profile-change', render);
        window.setInterval(() => { if (ready && EnrollmentViewModel.currentTerm(new Date(), calendar).today !== term.today) render(); }, 60000);
    }
    async function init(options = {}) {
        const request = ++generation;
        ready = false; byId('main').setAttribute('aria-busy', 'true'); byId('dashboardContent').hidden = true;
        byId('loadStatus').hidden = false; byId('loadStatus').className = 'load-status'; text('loadStatus', 'Loading applied learning records…');
        byId('sourceWarning').hidden = true;
        document.querySelectorAll('.filters select').forEach(select => { select.disabled = true; });
        try {
            const result = await Promise.all([
                fetchJson('../enrollment-dashboard-data.json').catch(() => null), fetchJson('../workload-data.json').catch(() => null),
                fetchJson('../data/course-catalog.json').catch(() => null), fetchJson('../data/academic-calendar.json').catch(() => null),
                fetchJson('../data/enrollment-registration-snapshots.json').catch(() => null),
                DepartmentProfileManager.initialize({ forceReload: options.forceProfileReload === true })
            ]);
            if (request !== generation) return;
            [source, workload, catalog, calendar, snapshots] = result;
            try { captures = EnrollmentViewModel.readSnapshots(snapshots); }
            catch { snapshots = null; captures = []; }
            courses = WorkloadIntegration.getAppliedLearningCourses(); updateTerm(); populateFilters();
            enrollmentView = EnrollmentViewModel.build(source, catalog, { year: 'all', snapshots, calendar });
            const view = buildView();
            if (!source && !captures.length && !view.workload.rows.length) throw new Error('No sources available');
            const warnings = [];
            if (!source) warnings.push('Historical registrations could not be loaded.');
            if (!snapshots || captures.length !== snapshots.terms?.length) warnings.push('Some recent registration captures could not be loaded.');
            if (!workload) warnings.push('Historical workload could not be loaded; available saved planning records are shown.');
            byId('sourceWarning').hidden = warnings.length === 0; text('sourceWarning', warnings.join(' '));
            ready = true; bindEvents(); render(); byId('dashboardContent').hidden = false; byId('loadStatus').hidden = true;
            document.querySelectorAll('.filters select').forEach(select => { select.disabled = false; });
        } catch (error) {
            if (request !== generation) return;
            console.error('Applied learning sources could not load:', error);
            byId('loadStatus').className = 'load-status error'; text('loadStatus', 'Applied learning sources could not be loaded. No totals are shown.');
            const retry = element('button', '', 'Try again'); retry.type = 'button'; retry.addEventListener('click', init); byId('loadStatus').append(retry);
        } finally { if (request === generation) byId('main').setAttribute('aria-busy', 'false'); }
    }
    return { init };
})();
window.addEventListener('DOMContentLoaded', AppliedLearningDashboard.init);
