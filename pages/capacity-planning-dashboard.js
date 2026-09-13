const CapacityDashboard = (function () {
    'use strict';
    let workload = null;
    let history = null;
    let calendar = null;
    let term = null;
    let bound = false;
    let ready = false;
    let models = [];
    const byId = id => document.getElementById(id);
    const text = (id, value) => { byId(id).textContent = value; };
    const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    const format = value => value === null || value === undefined ? '—' : number.format(value);
    const yearLabel = year => year.replace('-', '–');
    const sourceLabel = kind => ({ draft: 'Saved planning draft', historical: 'Historical workload', details: 'Faculty detail entries', missing: 'No workload records' }[kind] || 'No workload records');
    const quarters = ['Fall', 'Winter', 'Spring', 'Summer'];

    function element(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value !== undefined) node.textContent = value;
        return node;
    }
    function cell(row, value, className = '') {
        const node = element('td', className, value);
        row.appendChild(node);
        return node;
    }
    function metric(index, label, value, note) {
        text(`metric${index}Label`, label);
        text(`metric${index}Value`, value);
        text(`metric${index}Note`, note);
    }
    async function fetchJson(path) {
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Unable to read ${path}`);
        return response.json();
    }
    function period() {
        const selected = byId('quarterFilter').value;
        return selected === 'current' ? quarters.find(q => q.toLowerCase() === term.quarter) : selected;
    }
    function recordYears() {
        return [...new Set([
            ...WorkloadIntegration.getAcademicYearOptions(workload || {}),
            ...Object.keys(history?.capacityPlanning || {}), term.academicYear
        ])].filter(year => /^\d{4}-\d{2}$/.test(year)).sort().reverse();
    }
    function populateYears() {
        const previous = byId('academicYearFilter').value;
        const options = [element('option', '', 'All recorded years')];
        options[0].value = 'all';
        const current = element('option', '', `Automatic · ${yearLabel(term.academicYear)}`);
        current.value = 'current';
        options.push(current);
        recordYears().forEach(year => {
            const option = element('option', '', yearLabel(year));
            option.value = year;
            options.push(option);
        });
        byId('academicYearFilter').replaceChildren(...options);
        byId('academicYearFilter').value = options.some(option => option.value === previous) ? previous : 'all';
    }
    function buildModels() {
        const quarter = period();
        return recordYears().map(year => {
            const source = CapacityViewModel.exactYearSource(workload || {}, year);
            const integrated = WorkloadIntegration.buildIntegratedWorkloadYearData(source, year);
            return CapacityViewModel.build(integrated, {
                year, quarter, includeAppliedLearning: byId('includeAppliedLearning').value === 'yes',
                recordedTargets: history?.capacityPlanning?.[year]?.fullTimeFaculty || []
            });
        });
    }
    function updateTerm() {
        term = EnrollmentViewModel.currentTerm(new Date(), calendar);
        const label = term.status === 'upcoming' ? 'Upcoming quarter' : term.status === 'estimated' ? 'Estimated current quarter' : 'Current quarter';
        text('currentTermLabel', `${label}: ${term.label} · Academic year ${yearLabel(term.academicYear)}`);
    }
    function sourceInfo(selected) {
        const views = selected ? [selected] : models;
        const draftYears = views.filter(model => model.sourceKind === 'draft').length;
        text('sourceCoverage', draftYears ? 'Saved planning records · completeness unverified' : 'Recorded targets and workload coverage');
        text('sourceDate', workload?.generatedAt && Number.isFinite(Date.parse(workload.generatedAt))
            ? `Historical file: ${new Date(workload.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })}` : 'Historical file date unavailable');
        text('sourceDescription', `${draftYears ? 'Saved schedule/import records take precedence over the historical courses for that academic year, even when only one quarter is entered. ' : ''}Planning records come from this browser’s saved Workload sources. No saved-draft timestamp or completeness guarantee is available. Historical target configurations may lack verified release credits.`);
        const assumptions = new Set(views.flatMap(model => model.assumptions || []));
        byId('sourceAssumptions').replaceChildren(...[...assumptions].map(value => element('li', '', value)));
    }
    function setReading(title, detail, state = '') {
        text('readingHeading', title);
        text('readingDetail', detail);
        byId('readingStatus').className = `capacity-reading ${state}`;
    }
    function renderAllYears() {
        const recorded = models.filter(model => model.hasWorkload);
        const targets = models.filter(model => (model.totals.grossTarget !== null || model.totals.recordedTarget !== null));
        metric(1, 'Academic years shown', format(models.length), 'Each year has its own teaching target');
        metric(2, 'Years with workload', format(recorded.length), 'At least one workload record');
        metric(3, 'Years with targets', format(targets.length), 'Recorded or planned annual targets');
        metric(4, 'Automatic quarter', quarters.find(q => q.toLowerCase() === term.quarter), `${term.label} · ${term.status === 'upcoming' ? 'upcoming' : term.status === 'estimated' ? 'estimated' : 'current'}`);
        setReading(recorded.length ? 'Start with coverage, then compare assignments.' : targets.length ? 'Teaching targets are recorded. Workload is not yet available.' : 'No teaching targets or workload records are available.',
            recorded.length ? `${recorded.length} of ${models.length} years have workload records. Select a year to see its faculty assignments, release credits and missing quarters. Draft totals are not a complete measure of annual demand.` : 'No workload records are available from the loaded sources. Available capacity and utilization cannot be determined from targets alone.', recorded.length ? '' : 'is-missing');
        text('yearsScope', `${period() === 'annual' ? 'All recorded quarters' : `${period()} workload in each academic year`} · ${byId('includeAppliedLearning').value === 'yes' ? 'Including applied learning' : 'Scheduled courses only'}`);
        text('yearWorkloadHeading', period() === 'annual' ? 'Recorded workload' : `${period()} workload`);
        byId('yearTableBody').replaceChildren(...models.map(model => {
            const row = element('tr');
            const link = element('button', 'year-action', `${yearLabel(model.year)} →`);
            link.type = 'button';
            link.setAttribute('aria-label', `Inspect academic year ${yearLabel(model.year)}`);
            link.addEventListener('click', () => { byId('academicYearFilter').value = model.year; render(); byId('academicYearFilter').focus(); });
            const first = cell(row, '');
            first.append(link);
            if (model.year === term.academicYear) first.append(element('span', 'year-source', 'Current planning year'));
            const target = cell(row, format(model.totals.netTarget ?? model.totals.grossTarget ?? model.totals.recordedTarget), 'numeric');
            target.append(element('span', 'year-source', model.totals.netTarget !== null ? 'Net annual target' : (model.totals.grossTarget !== null || model.totals.recordedTarget !== null) ? 'Recorded target · releases unverified' : 'No target recorded'));
            cell(row, format(model.totals.totalWorkload), 'numeric');
            cell(row, format(model.totals.unassignedWorkload), 'numeric');
            cell(row, model.quarters.filter(q => q.recorded).map(q => q.name).join(' · ') || 'Not recorded');
            cell(row, sourceLabel(model.sourceKind));
            return row;
        }));
    }
    function renderBreakdown(model) {
        const entries = [
            ['Full-time faculty', model.totals.fullTimeWorkload, ''],
            ['Adjunct faculty', model.totals.adjunctWorkload, 'adjunct'],
            ['Other assigned teaching', model.totals.otherWorkload, 'other'],
            ['Unassigned sections', model.totals.unassignedWorkload, 'unassigned']
        ];
        const maximum = Math.max(1, ...entries.map(entry => entry[1] || 0));
        byId('assignmentBreakdown').replaceChildren(...entries.map(([label, value, color]) => {
            const row = element('div');
            const top = element('div', 'assignment-topline');
            top.append(element('span', '', label), element('strong', '', format(value)));
            const track = element('div', 'capacity-track');
            track.setAttribute('aria-hidden', 'true');
            const fill = element('span', `capacity-fill ${color}`);
            fill.style.width = `${(value || 0) / maximum * 100}%`;
            track.append(fill); row.append(top, track);
            return row;
        }));
        text('assignmentScope', `${period() === 'annual' ? 'Annual records' : period()} · ${yearLabel(model.year)}`);
        text('assignmentNote', model.scopeHasWorkload ? `${format(model.totals.sections)} workload records contribute ${format(model.totals.totalWorkload)} workload credits. Records include course assignments and faculty detail entries. Other assigned teaching includes inactive or former faculty.` : 'No workload records are available for this period. Empty sources are not counted as zero demand.');
        text('grossTargetLabel', model.totals.recordedTarget !== null ? 'Recorded annual target' : 'Annual target before releases');
        text('grossTarget', format(model.totals.grossTarget ?? model.totals.recordedTarget));
        text('releaseCredits', format(model.totals.release));
        text('netTarget', format(model.totals.netTarget));
        text('targetNote', model.targetKnown ? `${format(model.totals.fullTimeCount)} active full-time faculty with targets. ${model.rows.some(row => row.targetInferred) ? 'Some targets use inferred planning rules; verify them in Workload.' : 'Targets and recorded releases follow the saved faculty plan.'} Roster completeness is not verified.` : (model.totals.grossTarget !== null || model.totals.recordedTarget !== null) ? 'Recorded annual target values may already include adjustments. Release credits are not verified, so net teaching capacity is unavailable.' : 'No complete set of full-time teaching targets is recorded for this year.');
    }
    function role(row) {
        if (row.active === false) return 'Inactive · assigned teaching retained';
        return row.category === 'fullTime' ? 'Full-time faculty' : row.category === 'adjunct' ? 'Adjunct faculty' : 'Other / former faculty';
    }
    function reading(row) {
        if (row.workload === null) return 'No workload records';
        if (row.category !== 'fullTime' || !row.active) return 'Assigned teaching · outside full-time target';
        if (row.netTarget === null) return 'Annual net target unavailable';
        if (period() !== 'annual') return 'Quarter workload · annual target for context';
        if (row.overTarget > 0) return `${format(row.overTarget)} credits above annual target`;
        return 'Recorded workload within annual target · completeness unverified';
    }
    function renderFaculty(model) {
        const rows = model.rows;
        text('facultyScope', `${yearLabel(model.year)} · ${period() === 'annual' ? 'Annual' : period()} workload credits`);
        text('facultyReading', !model.hasWorkload ? 'Recorded annual targets are shown where available. Teaching assignments and the release basis are unverified; no workload or utilization can be calculated.' : period() === 'annual' ? 'Bars show recorded workload. The dark marker is the net annual teaching target. Missing records stay blank; a short bar does not establish available capacity.' : 'Bars show the selected quarter’s workload. The dark marker remains the annual teaching target; no quarter capacity or utilization is inferred.');
        text('facultyWorkloadHeading', period() === 'annual' ? 'Annual workload' : `${period()} workload`);
        byId('facultyEmpty').hidden = rows.length > 0;
        const maximum = Math.max(1, ...rows.map(row => Math.max(row.workload || 0, row.netTarget || 0))) * 1.05;
        byId('facultyBars').replaceChildren(...rows.map(row => {
            const card = element('article', `faculty-bar ${row.overTarget > 0 ? 'is-over' : ''}`);
            const top = element('div', 'faculty-topline');
            top.append(element('h3', '', row.name));
            const values = element('span', 'faculty-values', row.workload === null && row.recordedTarget !== null ? format(row.recordedTarget) : format(row.workload));
            values.append(element('small', '', row.workload === null && row.recordedTarget !== null ? ' recorded target' : row.category === 'fullTime' && row.active ? ` / ${format(row.netTarget)} annual` : ' credits'));
            top.append(values);
            const track = element('div', 'capacity-track'); track.setAttribute('aria-hidden', 'true');
            track.hidden = row.workload === null && row.netTarget === null;
            const fill = element('span', 'capacity-fill'); fill.style.width = `${(row.workload || 0) / maximum * 100}%`; track.append(fill);
            if (row.netTarget !== null && row.category === 'fullTime' && row.active) {
                const marker = element('span', 'capacity-target'); marker.style.left = `${row.netTarget / maximum * 100}%`; track.append(marker);
            }
            card.append(top, element('span', 'faculty-role', `${role(row)}${row.targetInferred ? ' · target requires review' : ''}`), track, element('p', `faculty-status ${row.overTarget > 0 ? 'over' : ''}`, reading(row)));
            return card;
        }));
        byId('facultyTableBody').replaceChildren(...rows.map(row => {
            const tr = element('tr'); cell(tr, row.name); cell(tr, role(row));
            [row.grossTarget ?? row.recordedTarget, row.release, row.netTarget, row.workload].forEach(value => cell(tr, format(value), 'numeric'));
            cell(tr, `${reading(row)}${row.targetSource === 'recorded' ? ' · recorded target; release basis unverified' : ''}`); return tr;
        }));
    }
    function renderQuarterCoverage(model) {
        byId('quarterCards').replaceChildren(...model.quarters.map(quarter => {
            const card = element('div', `capacity-quarter ${quarter.name === period() ? 'is-selected' : ''}`);
            card.append(element('h3', '', quarter.name), element('strong', '', format(quarter.workload)), element('span', '', quarter.recorded ? `credits · ${format(quarter.sections)} workload records` : 'No workload records'));
            return card;
        }));
        byId('unassignedPanel').hidden = !model.unassigned.length;
        byId('unassignedTableBody').replaceChildren(...model.unassigned.map(course => {
            const row = element('tr'); cell(row, course.courseCode || 'Course not recorded'); cell(row, course.section || '—'); cell(row, course.quarter || 'Not recorded'); cell(row, format(course.workloadCredits), 'numeric'); return row;
        }));
    }
    function renderYear(model) {
        const annual = period() === 'annual';
        metric(1, model.totals.recordedTarget !== null ? 'Recorded annual target' : 'Annual teaching target', format(model.totals.netTarget ?? model.totals.recordedTarget), model.totals.recordedTarget !== null ? 'Workload credits · release basis unverified' : 'Net workload credits · active full-time faculty');
        metric(2, `${annual ? 'Recorded' : period()} workload`, format(model.totals.totalWorkload), 'Workload credits · including unassigned teaching');
        metric(3, 'Unassigned teaching', format(model.totals.unassignedWorkload), 'Workload credits needing an instructor');
        metric(4, annual ? 'Above individual targets' : 'Workload records', format(annual ? model.totals.overTarget : model.totals.sections), annual ? 'Full-time excess workload credits · annual' : `Course / faculty detail entries · ${period()}`);
        if (!model.scopeHasWorkload) {
            setReading(`No workload records for ${annual ? yearLabel(model.year) : `${period()} · ${yearLabel(model.year)}`}.`, 'Teaching targets alone cannot establish demand, utilization or available capacity. Review saved assignments in Workload or select a year with workload records.', 'is-missing');
        } else {
            const missing = model.quarters.filter(q => !q.recorded && q.name !== 'Summer').map(q => q.name);
            setReading(`${format(model.totals.totalWorkload)} workload credits are recorded${annual ? ' for the year' : ` for ${period()}`}.`, `${sourceLabel(model.sourceKind)}. ${missing.length ? `No ${missing.join(' or ')} workload records for this year. ` : ''}${annual && model.totals.overTarget > 0 ? `${format(model.totals.overTarget)} credits exceed individual full-time annual targets. ` : ''}Recorded assignments may be incomplete; remaining annual capacity is not confirmed.`, 'is-caution');
        }
        renderBreakdown(model); renderFaculty(model); renderQuarterCoverage(model);
    }
    function render() {
        if (!ready) return;
        updateTerm(); populateYears(); models = buildModels();
        const value = byId('academicYearFilter').value;
        const selected = value === 'all' ? null : models.find(model => model.year === (value === 'current' ? term.academicYear : value));
        byId('allYearsPanel').hidden = Boolean(selected);
        byId('yearDetail').hidden = !selected;
        if (selected) renderYear(selected); else renderAllYears();
        sourceInfo(selected);
    }
    function bindEvents() {
        if (bound) return;
        bound = true;
        document.querySelectorAll('.filters select').forEach(select => select.addEventListener('change', render));
        window.addEventListener('focus', () => {
            if (DepartmentProfileManager.getStoredProfileId() !== DepartmentProfileManager.getActiveProfileId()) init({ forceProfileReload: true });
            else render();
        });
        window.addEventListener('storage', event => {
            if (event.key === null || [DepartmentProfileManager.ACTIVE_PROFILE_STORAGE_KEY, DepartmentProfileManager.CUSTOM_PROFILES_STORAGE_KEY].includes(event.key)) {
                return init({ forceProfileReload: true });
            } else render();
        });
        window.addEventListener('department-profile-change', render);
        // Update automatic selections after a Pacific date boundary, even in a long-lived tab.
        window.setInterval(() => {
            if (ready && EnrollmentViewModel.currentTerm(new Date(), calendar).today !== term.today) render();
        }, 60000);
    }
    async function init(options = {}) {
        ready = false;
        byId('main').setAttribute('aria-busy', 'true');
        byId('dashboardContent').hidden = true;
        byId('loadStatus').hidden = false;
        byId('loadStatus').className = 'load-status';
        text('loadStatus', 'Loading workload and teaching targets…');
        document.querySelectorAll('.filters select').forEach(select => { select.disabled = true; });
        try {
            const results = await Promise.all([
                fetchJson('../workload-data.json').catch(() => null),
                fetchJson('../enrollment-dashboard-data.json').catch(() => null),
                fetchJson('../data/academic-calendar.json').catch(() => null),
                DepartmentProfileManager.initialize({ forceReload: options.forceProfileReload === true })
            ]);
            [workload, history, calendar] = results;
            updateTerm(); populateYears(); models = buildModels();
            if (!workload && !history && !models.some(model => model.hasWorkload || model.targetKnown)) throw new Error('No sources available');
            byId('sourceWarning').hidden = Boolean(workload && history);
            text('sourceWarning', 'Some historical sources could not be loaded. Available saved planning records are shown; source gaps remain unavailable.');
            ready = true; bindEvents(); render();
            byId('loadStatus').hidden = true;
            byId('dashboardContent').hidden = false;
            document.querySelectorAll('.filters select').forEach(select => { select.disabled = false; });
        } catch (error) {
            console.error('Capacity dashboard could not load:', error);
            byId('loadStatus').className = 'load-status error';
            text('loadStatus', 'Capacity sources could not be loaded. No totals are shown.');
            const retry = element('button', '', 'Try again'); retry.type = 'button'; retry.addEventListener('click', init); byId('loadStatus').append(retry);
        } finally { byId('main').setAttribute('aria-busy', 'false'); }
    }
    return { init };
})();
window.addEventListener('DOMContentLoaded', CapacityDashboard.init);
