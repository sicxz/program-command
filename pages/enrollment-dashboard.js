const EnrollmentDashboard = (function () {
    'use strict';
    let source = null;
    let catalog = null;
    let calendar = null;
    let snapshots = null;
    let captures = [];
    let term = null;
    let chart = null;
    let listenersBound = false;
    const number = new Intl.NumberFormat('en-US');
    const byId = id => document.getElementById(id);
    const text = (id, value) => { byId(id).textContent = value; };
    const yearLabel = value => value === 'all' ? 'All recorded years' : value.replace('-', '–');
    const format = value => value === null || value === undefined ? '—' : number.format(value);
    const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
    const captureDate = value => new Date(value).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
        timeZone: 'America/Los_Angeles', timeZoneName: 'short'
    });
    const quarterLabel = quarter => `${quarter.label}${quarter.provisional ? ' · provisional' : ''}`;

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function cell(row, content, className = '') {
        const node = element('td', className, content);
        row.appendChild(node);
        return node;
    }

    function changeClass(value) {
        return value > 0 ? 'positive' : value < 0 ? 'negative' : '';
    }

    async function fetchJson(url) {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Unable to read ${url} (${response.status})`);
        return response.json();
    }

    async function init() {
        byId('main').setAttribute('aria-busy', 'true');
        byId('loadStatus').hidden = false;
        byId('periodStatus').hidden = true;
        byId('loadStatus').className = 'load-status';
        text('loadStatus', 'Loading enrollment records…');
        byId('dashboardContent').hidden = true;
        document.querySelectorAll('.filters select, #quarterFocus').forEach(select => { select.disabled = true; });
        try {
            const results = await Promise.all([
                fetchJson('enrollment-dashboard-data.json'),
                fetchJson('data/course-catalog.json').catch(() => null),
                fetchJson('data/academic-calendar.json').catch(() => null),
                fetchJson('data/enrollment-registration-snapshots.json').catch(() => null)
            ]);
            source = results[0];
            catalog = results[1];
            calendar = results[2];
            snapshots = results[3];
            byId('snapshotWarning').hidden = snapshots !== null;
            const meta = window.EnrollmentViewModel.create(source, catalog, snapshots);
            captures = meta.captures;
            if (!meta.years.length) throw new Error('The source contains no valid quarterly enrollment records.');
            const select = byId('academicYearFilter');
            select.replaceChildren();
            const current = element('option', '', 'Automatic · current academic year');
            current.value = 'current';
            select.appendChild(current);
            const all = element('option', '', 'All recorded years');
            all.value = 'all';
            select.appendChild(all);
            meta.years.forEach(year => {
                const option = element('option', '', year.label);
                option.value = year.value;
                select.appendChild(option);
            });
            select.value = 'all';
            const date = meta.sourceDate ? new Date(meta.sourceDate).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
            }) : null;
            text('sourceCoverage', `Records through ${meta.lastQuarter}${meta.lastQuarterProvisional ? ' · provisional' : ''}`);
            text('sourceDate', captures.length ? `Registration capture ${captureDate(captures[captures.length - 1].observedAt)}` : date ? `Source generated ${date}` : 'Source generation date unavailable');
            text('sourceDescription', `${meta.firstQuarter} through ${meta.lastQuarter}. Historical dataset ${date ? `generated ${date}` : 'generation date unavailable'}. ${captures.length ? 'The 2026 counts are dated EagleNET registration search captures. Winter and Spring are completed terms, not certified census counts. Fall is provisional and remains so until a new capture replaces it. These are saved snapshots, not an automatic live feed. ' : ''}A source gap is not a forecast or proof that a course had no students.`);
            renderSnapshots();
            if (!listenersBound) {
                ['academicYearFilter', 'courseFilter', 'trendFilter', 'quarterFocus'].forEach(id => {
                    byId(id).addEventListener('change', render);
                });
                byId('snapshotTerm').addEventListener('change', renderSnapshotTable);
                window.addEventListener('focus', refreshAutomaticPeriod);
                document.addEventListener('visibilitychange', refreshAutomaticPeriod);
                window.setInterval(refreshAutomaticPeriod, 60000);
                listenersBound = true;
            }
            document.querySelectorAll('.filters select, #quarterFocus').forEach(control => { control.disabled = false; });
            byId('dashboardContent').hidden = false;
            byId('loadStatus').hidden = true;
            render();
        } catch (error) {
            console.error('Enrollment dashboard could not load:', error);
            if (chart) { chart.destroy(); chart = null; }
            byId('dashboardContent').hidden = true;
            byId('loadStatus').hidden = false;
            document.querySelectorAll('.filters select, #quarterFocus').forEach(control => { control.disabled = true; });
            byId('loadStatus').className = 'load-status error';
            text('loadStatus', 'Enrollment records could not be loaded. No totals are shown.');
            const retry = element('button', '', 'Try again');
            retry.type = 'button';
            retry.addEventListener('click', init);
            byId('loadStatus').appendChild(retry);
            text('sourceCoverage', 'Source unavailable');
            text('sourceDate', '');
        } finally {
            byId('main').setAttribute('aria-busy', 'false');
        }
    }

    function renderSnapshots() {
        byId('registrationSnapshots').hidden = captures.length === 0;
        const cards = byId('snapshotCards');
        const select = byId('snapshotTerm');
        cards.replaceChildren();
        select.replaceChildren();
        if (!captures.length) return;
        text('snapshotAsOf', 'Saved counts from the complete Design subject search. All sections; independent of the filters above.');
        captures.forEach(capture => {
            const card = element('article', `snapshot-card${capture.provisional ? ' provisional' : ''}`);
            card.appendChild(element('h3', '', capture.label));
            card.appendChild(element('p', 'snapshot-status', capture.provisional ? 'Provisional · registration underway' : 'Completed term · registration snapshot'));
            const count = element('p', 'snapshot-count');
            count.append(element('strong', '', format(capture.total)), document.createTextNode(' registrations'));
            card.append(count, element('p', 'snapshot-capacity', `${format(capture.sections.length)} sections · ${format(capture.capacity)} recorded seat capacity`));
            card.appendChild(element('p', 'snapshot-waitlist', `${format(capture.waitlisted)} displayed waitlist entries · ${format(capture.missingWaitlists)} sections do not show waitlists`));
            card.appendChild(element('p', 'snapshot-date', `Captured ${captureDate(capture.observedAt)}`));
            cards.appendChild(card);
            const option = element('option', '', quarterLabel(capture));
            option.value = capture.key;
            select.appendChild(option);
        });
        const current = window.EnrollmentViewModel.currentTerm(new Date(), calendar);
        select.value = captures.find(capture => capture.key === current.key)?.key || captures[captures.length - 1].key;
        renderSnapshotTable();
    }

    function renderSnapshotTable() {
        const capture = captures.find(item => item.key === byId('snapshotTerm').value);
        const body = byId('snapshotTableBody');
        body.replaceChildren();
        if (!capture) return;
        text('snapshotTableCaption', `${quarterLabel(capture)} · captured ${captureDate(capture.observedAt)} · all ${capture.sections.length} Design sections`);
        capture.sections.forEach(section => {
            const row = element('tr');
            const label = cell(row, `${section.course} · ${section.section}`);
            label.appendChild(element('span', 'table-course-title', section.title));
            cell(row, section.crn);
            [section.enrolled, section.capacity, section.available, section.waitlisted].forEach(value => cell(row, format(value), 'numeric'));
            body.appendChild(row);
        });
    }

    function refreshAutomaticPeriod() {
        if (!source || !byId('loadStatus').hidden || document.hidden) return;
        const next = window.EnrollmentViewModel.currentTerm(new Date(), calendar);
        if (!term || next.key !== term.key || next.status !== term.status) render();
    }

    function renderTerm(view) {
        term = view.term;
        byId('academicYearFilter').querySelector('[value="current"]').textContent = `Automatic · ${yearLabel(term.academicYear)}`;
        byId('quarterFocus').querySelector('[value="current"]').textContent = `Automatic · ${term.season}`;
        const startDate = term.start && new Date(`${term.start}T12:00:00Z`).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles'
        });
        const context = term.status === 'upcoming' ? `Upcoming quarter · ${term.label} starts ${startDate}` :
            term.isApproximate ? `Seasonal estimate · ${term.label}` : `Current quarter · ${term.label}`;
        text('currentTermLabel', context);
        const note = term.isApproximate ? 'Published term dates are unavailable for today; the automatic focus uses a seasonal estimate. ' : '';
        const capture = view.currentTermCapture;
        text('periodStatus', note + (capture ? `${term.label}: ${format(capture.total)} registrations captured ${captureDate(capture.observedAt)}. ${capture.provisional ? 'Provisional registration counts; changes from completed quarters are not calculated.' : 'Completed term registration snapshot.'}` : view.currentTermHasRecords ? `The source includes records for ${term.label}. Counts reflect the enrollment snapshot shown above.` : `No enrollment records for ${term.label} are available in this snapshot. Historical comparisons below use recorded data only.`));
        byId('periodStatus').hidden = false;
        if (!view.hasData) text('emptyState', `No matching records for ${yearLabel(view.selection.year)}. Choose a recorded academic year above to see its totals.`);
    }

    function render() {
        const view = window.EnrollmentViewModel.build(source, catalog, {
            year: byId('academicYearFilter').value,
            level: byId('courseFilter').value,
            trend: byId('trendFilter').value,
            quarter: byId('quarterFocus').value,
            calendar, snapshots
        });
        renderTerm(view);
        text('registrationCount', view.hasData ? format(view.totalRegistrations) : '—');
        text('totalCourses', format(view.courseCount));
        text('quarterCount', format(view.coverage.quarterCount));
        text('coverageLabel', view.coverage.label);
        const provisional = view.provisionalQuarters.length > 0;
        byId('provisionalNote').hidden = !provisional;
        text('provisionalNote', `Selected totals include provisional ${view.provisionalQuarters.join(', ')} registrations. Quarter coverage indicates available records, not final enrollment.`);
        text('courseCoverage', `In ${yearLabel(view.selection.year)}`);
        const comparison = view.comparison;
        text('periodChange', comparison ? (comparison.percent === null ? signed(comparison.delta) : `${comparison.percent > 0 ? '+' : comparison.percent < 0 ? '−' : ''}${Math.abs(comparison.percent).toFixed(1)}%`) : '—');
        byId('periodChange').className = comparison ? changeClass(comparison.delta) : '';
        text('periodComparison', comparison ? `${signed(comparison.delta)} registrations · same quarters of ${yearLabel(comparison.previousYear)}` : view.selection.year === 'all' ? 'Choose an academic year for comparison' : provisional ? 'Comparison withheld · provisional registrations' : 'No comparable prior period in source');
        byId('periodOverview').hidden = !view.hasData;
        byId('courseDetails').hidden = !view.hasData;
        byId('emptyState').hidden = view.hasData;
        if (chart) { chart.destroy(); chart = null; }
        renderHistory(view.history);
        if (!view.hasData) return;
        renderQuarter(view);
        renderLevels(view);
        renderCourses(view);
    }

    function renderQuarter(view) {
        const comparison = view.comparison;
        text('quarterScope', `${yearLabel(view.selection.year)} · registrations across all sections`);
        const peak = view.quarters.filter(quarter => quarter.total !== null).sort((a, b) => b.total - a.total)[0];
        let takeaway = `${peak.label} has the most recorded registrations in this period (${format(peak.total)}).`;
        if (comparison) {
            const movement = comparison.delta > 0 ? 'rose' : comparison.delta < 0 ? 'fell' : 'held steady';
            takeaway = comparison.delta === 0
                ? `Registrations ${movement} across the same quarters of the prior year.`
                : `Registrations ${movement} by ${format(Math.abs(comparison.delta))}${comparison.percent === null ? '' : ` (${Math.abs(comparison.percent).toFixed(1)}%)`} compared with the same quarters of ${yearLabel(comparison.previousYear)}.`;
        }
        if (view.provisionalQuarters.length) takeaway += ` ${view.provisionalQuarters.join(', ')} is a provisional capture, shown as an amber point without a connecting trend line.`;
        text('quarterTakeaway', takeaway);
        const currentName = yearLabel(view.selection.year);
        const labels = comparison ? comparison.quarters.map(q => q.season) : view.quarters.map(q => q.provisional ? `${q.label}*` : q.label);
        const legend = byId('quarterLegend');
        legend.replaceChildren();
        [currentName, comparison && yearLabel(comparison.previousYear)].filter(Boolean).forEach((label, index) => {
            const item = element('span');
            item.appendChild(element('i', `legend-rule${index ? ' previous' : ''}`));
            item.appendChild(document.createTextNode(label));
            legend.appendChild(item);
        });
        if (view.provisionalQuarters.length) legend.appendChild(element('span', 'provisional-key', '* Provisional registration snapshot'));
        const table = byId('quarterTableBody');
        table.replaceChildren();
        view.quarters.forEach((quarter, index) => {
            const row = element('tr');
            cell(row, quarterLabel(quarter));
            cell(row, format(quarter.total), 'numeric');
            cell(row, comparison ? format(comparison.quarters[index].previous) : '—', 'numeric');
            table.appendChild(row);
        });
        const canvas = byId('overallTrendChart');
        canvas.setAttribute('aria-label', `${currentName} course registrations: ${view.quarters.map(q => `${quarterLabel(q)}, ${q.total === null ? 'no matching records' : q.total}`).join('; ')}. ${takeaway}`);
        canvas.hidden = typeof window.Chart !== 'function';
        byId('chartUnavailable').hidden = !canvas.hidden;
        if (canvas.hidden) return;
        const datasets = [{
            label: currentName, data: view.quarters.map(q => q.total),
            borderColor: '#a10022', backgroundColor: 'rgba(161,0,34,.045)',
            borderWidth: 2.5, pointBackgroundColor: '#fff', pointBorderWidth: 2,
            pointRadius: 4, pointHoverRadius: 6, tension: 0, fill: true, spanGaps: false
        }];
        if (view.provisionalQuarters.length) {
            datasets[0].pointBorderColor = view.quarters.map(q => q.provisional ? '#946018' : '#a10022');
            datasets[0].pointStyle = view.quarters.map(q => q.provisional ? 'rectRot' : 'circle');
            datasets[0].segment = { borderColor: context => view.quarters[context.p0DataIndex].provisional || view.quarters[context.p1DataIndex].provisional ? 'transparent' : '#a10022' };
            datasets[0].fill = false;
        }
        if (comparison) datasets.push({
            label: yearLabel(comparison.previousYear), data: comparison.quarters.map(q => q.previous),
            borderColor: '#929ca7', borderDash: [5, 5], borderWidth: 1.5,
            pointBackgroundColor: '#fff', pointRadius: 3, tension: 0, fill: false
        });
        const directLabels = {
            id: 'enrollmentDirectLabels',
            afterDatasetsDraw(chartInstance) {
                const ctx = chartInstance.ctx;
                ctx.save();
                ctx.font = '500 12px "IBM Plex Sans", sans-serif';
                ctx.fillStyle = '#6f0018';
                ctx.textAlign = 'center';
                chartInstance.getDatasetMeta(0).data.forEach((point, index) => {
                    if (datasets[0].data[index] === null) return;
                    ctx.fillText(format(datasets[0].data[index]), point.x, point.y - 12);
                });
                ctx.restore();
            }
        };
        chart = new window.Chart(canvas, {
            type: 'line', data: { labels, datasets }, plugins: [directLabels],
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                layout: { padding: { top: 24, right: 18, left: 6 } },
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: '#252b33', padding: 12, displayColors: true, callbacks: { label: context => `${context.dataset.label}: ${format(context.parsed.y)} registrations${view.quarters[context.dataIndex]?.provisional ? ' · provisional' : ''}` } } },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#65707b', font: { family: 'IBM Plex Sans', size: 12 }, maxRotation: 0, autoSkip: true } },
                    y: { beginAtZero: true, grace: '12%', border: { display: false }, grid: { color: '#edf0f3' }, ticks: { color: '#7c858f', precision: 0, maxTicksLimit: 5, font: { family: 'IBM Plex Sans', size: 11 } } }
                }
            }
        });
    }

    function renderLevels(view) {
        const container = byId('levelBreakdown');
        container.replaceChildren();
        view.levelTotals.forEach(level => {
            const item = element('div', 'level-item');
            const top = element('div', 'level-topline');
            const label = element('span', '', level.label.split(' · ')[0]);
            label.appendChild(element('small', '', `${level.label.split(' · ')[1]} level`));
            top.append(label, element('strong', '', format(level.total)));
            const track = element('div', 'level-track');
            track.setAttribute('aria-hidden', 'true');
            const bar = element('span');
            const share = view.totalRegistrations ? level.total / view.totalRegistrations * 100 : 0;
            bar.style.width = `${share}%`;
            track.appendChild(bar);
            item.append(top, track, element('p', 'level-share', `${share.toFixed(0)}% of selected registrations`));
            container.appendChild(item);
        });
        const largest = [...view.levelTotals].sort((a, b) => b.total - a.total)[0];
        text('levelTakeaway', view.totalRegistrations ? `${largest.label.split(' · ')[0]} courses account for ${(largest.total / view.totalRegistrations * 100).toFixed(0)}% of registrations. Counts reflect seats across sections, not how many individual students are in each level.` : 'The matching records contain zero registrations. No registration shares can be calculated.');
    }

    function svgNode(tag, attributes, content) {
        const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function historyChart(course, years, ceiling, season, provisional) {
        const width = 264, height = 126, left = 38, right = 14, top = 23, bottom = 27;
        const plotHeight = height - top - bottom;
        const x = index => years.length < 2 ? width / 2 : left + index * (width - left - right) / (years.length - 1);
        const y = value => top + plotHeight * (1 - value / ceiling);
        const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${course.code}. ${years.map((year, index) => `${season} ${year}${provisional[index] ? ' provisional' : ''}: ${course.values[index] === null ? 'no record' : `${course.values[index]} registrations`}`).join('. ')}` });
        [0, ceiling / 2, ceiling].forEach(value => {
            svg.appendChild(svgNode('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), stroke: '#e9ecef', 'stroke-width': 1 }));
            if (value !== ceiling / 2) svg.appendChild(svgNode('text', { x: 16, y: y(value) + 3, 'text-anchor': 'end', fill: '#89929b', 'font-size': 9 }, value));
        });
        for (let index = 1; index < years.length; index++) {
            if (!provisional[index - 1] && !provisional[index] && course.values[index - 1] !== null && course.values[index] !== null) {
                svg.appendChild(svgNode('line', { x1: x(index - 1), y1: y(course.values[index - 1]), x2: x(index), y2: y(course.values[index]), stroke: '#a10022', 'stroke-width': 2 }));
            }
        }
        years.forEach((year, index) => {
            const value = course.values[index];
            svg.appendChild(svgNode('text', { x: x(index), y: height - 8, 'text-anchor': 'middle', fill: '#7b858e', 'font-size': 11 }, `${year}${provisional[index] ? '*' : ''}`));
            if (value === null) {
                svg.appendChild(svgNode('text', { x: x(index), y: y(0) - 8, 'text-anchor': 'middle', fill: '#7b858e', 'font-size': 13 }, '—'));
                return;
            }
            svg.appendChild(svgNode('circle', { cx: x(index), cy: y(value), r: 3.5, fill: provisional[index] ? '#fff5df' : '#fff', stroke: provisional[index] ? '#946018' : '#a10022', 'stroke-width': 1.8 }));
            svg.appendChild(svgNode('text', { x: x(index), y: y(value) - 10, 'text-anchor': 'middle', fill: '#252b33', 'font-size': 12, 'font-weight': 500 }, format(value)));
        });
        return svg;
    }

    function historyChange(course, first, season) {
        if (course.delta === null) return 'A comparison needs records in both years';
        if (course.delta === 0) return `Unchanged from ${season} ${first}`;
        return `${format(Math.abs(course.delta))} ${course.delta > 0 ? 'more' : 'fewer'} than ${season} ${first}`;
    }

    function renderHistory(history) {
        const season = history.season;
        text('historyHeading', `${season} enrollment, course by course`);
        text('historyEmpty', `No ${season} records match the selected course level and trend.`);
        text('historyCaption', `All recorded ${season} course counts. A dash means no record.`);
        const provisional = history.provisional.some(Boolean);
        const lastIndex = history.years.length - 1;
        const endpointProvisional = !history.comparableEndpoints;
        const recentProvisional = history.provisional[lastIndex] || history.provisional[lastIndex - 1];
        const rows = [...history.rows].sort((a, b) => (b.values[b.values.length - 1] ?? -1) - (a.values[a.values.length - 1] ?? -1) || a.code.localeCompare(b.code));
        const ceiling = Math.max(10, Math.ceil(Math.max(0, ...rows.flatMap(row => row.values.filter(value => value !== null))) / 10) * 10);
        const cards = byId('historySmallMultiples');
        cards.replaceChildren();
        byId('historyEmpty').hidden = rows.length > 0;
        byId('historyDetails').hidden = !rows.length;
        text('historyScope', history.years.length ? `${season} ${history.first}–${history.last} · all recorded years, independent of the academic-year filter` : `No recorded ${season} quarters`);
        if (history.years.length > 1 && rows.length) {
            const lastIndex = history.years.length - 1;
            const observed = index => rows.some(row => row.values[index] !== null);
            const last = history.totals[lastIndex];
            const previous = history.totals[lastIndex - 1];
            const previousYear = history.years[history.years.length - 2];
            const delta = last - previous;
            const amount = previous ? ` (${(Math.abs(delta) / previous * 100).toFixed(1)}%)` : '';
            let takeaway;
            if (!observed(lastIndex)) {
                takeaway = `No matching course records are available for ${season} ${history.last}. Earlier recorded counts are shown below.`;
            } else if (!observed(lastIndex - 1)) {
                takeaway = `${format(last)} registrations are recorded in ${season} ${history.last}. No matching records are available for ${season} ${previousYear}, so a change cannot be calculated.`;
            } else takeaway = delta === 0
                ? `${season} registrations held at ${format(last)} in ${history.last}, unchanged from ${previousYear}.`
                : `${season} registrations ${delta > 0 ? 'rose' : 'fell'} from ${format(previous)} in ${previousYear} to ${format(last)} in ${history.last}, ${delta > 0 ? 'up' : 'down'} ${format(Math.abs(delta))}${amount}.`;
            if (history.years.length > 2 && observed(lastIndex) && observed(0)) {
                const difference = last - history.totals[0];
                takeaway += difference === 0 ? ` That matches ${history.first}.` : ` That is ${format(Math.abs(difference))} ${difference > 0 ? 'above' : 'below'} ${history.first}.`;
            }
            text('historyTakeaway', takeaway);
        } else text('historyTakeaway', rows.length ? `Only one ${season} quarter is recorded. A year-to-year comparison is not available.` : `Select another quarter, course level, or trend to see recorded counts.`);
        if (recentProvisional && rows.length && history.totals[lastIndex] !== null) {
            text('historyTakeaway', `${format(history.totals[lastIndex])} registrations are recorded for ${season} ${history.last}. ${season} ${history.years.filter((year, index) => history.provisional[index]).join(', ')} is provisional; changes from completed quarters are withheld.`);
        }
        const visible = rows.slice(0, 12);
        text('historyDisplayNote', rows.length ? `${visible.length < rows.length ? `The ${visible.length} largest` : 'All'} courses by recorded ${season} ${history.last} registrations. Common scale: 0–${ceiling}.` : '');
        if (provisional) byId('historyDisplayNote').appendChild(document.createTextNode(` * Amber points are provisional captures (${history.observedAt.filter((date, index) => history.provisional[index]).map(captureDate).join('; ')}), with no connecting trend line.`));
        visible.forEach(course => {
            const card = element('article', 'history-course');
            const heading = element('h3', '', course.code);
            heading.appendChild(element('span', 'course-name', course.title || 'Course title unavailable'));
            card.append(heading, historyChart(course, history.years, ceiling, season, history.provisional), element('p', `course-change ${changeClass(course.delta)}`, endpointProvisional ? 'Provisional counts · change withheld' : historyChange(course, history.first, season)));
            cards.appendChild(card);
        });
        text('historyTableSummary', `Read all ${format(rows.length)} ${season} courses as a table`);
        const head = element('tr');
        ['Course', ...history.years.map((year, index) => `${season} ${year}${history.provisional[index] ? ' · provisional' : ''}`), endpointProvisional ? 'Change withheld' : `Change since ${history.first || `first ${season}`}`].forEach(label => {
            const th = element('th', '', label); th.scope = 'col'; head.appendChild(th);
        });
        byId('historyTableHead').replaceChildren(head);
        const body = byId('historyTableBody');
        body.replaceChildren();
        rows.forEach(course => {
            const row = element('tr');
            const label = cell(row, course.code);
            if (course.title) label.appendChild(element('span', 'table-course-title', course.title));
            course.values.forEach(value => cell(row, format(value), 'numeric'));
            cell(row, course.delta === null ? '—' : signed(course.delta), 'numeric');
            body.appendChild(row);
        });
    }

    function renderCourses(view) {
        text('courseTableScope', `${yearLabel(view.selection.year)} · registrations across all sections, highest first`);
        text('courseTableCount', `${format(view.courseCount)} courses`);
        const body = byId('courseTableBody');
        body.replaceChildren();
        view.courses.forEach(course => {
            const row = element('tr');
            const label = cell(row, '');
            label.appendChild(element('strong', '', course.code));
            if (course.title) label.appendChild(element('span', 'table-course-title', course.title));
            cell(row, format(course.periodTotal), 'numeric');
            cell(row, `${Object.values(course.quarterly).filter(value => value !== null).length} / ${view.quarters.length}`, 'numeric');
            const trend = cell(row, '');
            trend.appendChild(element('span', `trend-label ${course.trend}`, course.trend[0].toUpperCase() + course.trend.slice(1)));
            if (course.registering) trend.appendChild(element('span', 'trend-label registering', 'Registering'));
            body.appendChild(row);
        });
    }

    return { init };
})();
window.addEventListener('DOMContentLoaded', EnrollmentDashboard.init);
