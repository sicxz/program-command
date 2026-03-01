(function eaglenetComparePage(globalScope) {
    'use strict';

    const state = {
        lastDiff: null,
        lastYear: '',
        lastSchedulerRows: [],
        lastEagleNetRows: []
    };

    const FRIENDLY_FIELD_LABELS = {
        credits: 'Credits',
        instructorKey: 'Instructor',
        days: 'Days',
        timeRange: 'Time',
        roomKey: 'Room',
        modalityKey: 'Modality',
        campusKey: 'Campus',
        titleKey: 'Course Title'
    };

    function qs(id) {
        if (typeof document === 'undefined') return null;
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setStatus(message, kind = 'info') {
        const node = qs('compareStatus');
        if (!node) return;
        node.className = 'status';
        if (kind === 'error') {
            node.classList.add('error');
        } else if (kind === 'ok') {
            node.classList.add('ok');
        }
        node.textContent = String(message || '');
    }

    function parseAcademicYearStart(academicYear) {
        const match = String(academicYear || '').match(/^(\d{4})-(\d{2})$/);
        return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
    }

    function formatAcademicYear(startYear) {
        const next = String((startYear + 1) % 100).padStart(2, '0');
        return `${startYear}-${next}`;
    }

    function getCurrentAcademicYear() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const startYear = month >= 6 ? year : year - 1;
        return formatAcademicYear(startYear);
    }

    function getNeighborAcademicYears(baseYear) {
        const parsed = parseAcademicYearStart(baseYear);
        if (!Number.isFinite(parsed)) return [];
        return [formatAcademicYear(parsed - 1), formatAcademicYear(parsed + 1)];
    }

    function getAcademicYearOptions() {
        const years = new Set();
        try {
            if (globalScope.WorkloadIntegration && typeof globalScope.WorkloadIntegration.getAcademicYearOptions === 'function') {
                const options = globalScope.WorkloadIntegration.getAcademicYearOptions();
                (options || []).forEach((year) => years.add(String(year)));
            }
        } catch (error) {
            console.warn('Could not load academic year options from workload integration:', error);
        }

        const currentYear = getCurrentAcademicYear();
        years.add(currentYear);
        getNeighborAcademicYears(currentYear).forEach((year) => years.add(year));

        return [...years]
            .filter((year) => /^\d{4}-\d{2}$/.test(year))
            .sort((a, b) => parseAcademicYearStart(a) - parseAcademicYearStart(b));
    }

    function populateYearSelect() {
        const select = qs('compareYear');
        if (!select) return '';

        const years = getAcademicYearOptions();
        select.innerHTML = '';
        years.forEach((year) => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            select.appendChild(option);
        });

        const preferred = years.includes(getCurrentAcademicYear())
            ? getCurrentAcademicYear()
            : years[years.length - 1];
        if (preferred) {
            select.value = preferred;
        }

        return select.value || '';
    }

    function parseCsvRows(text) {
        const input = String(text || '').replace(/\r\n?/g, '\n');
        const records = [];
        let row = [];
        let cell = '';
        let inQuotes = false;

        for (let i = 0; i < input.length; i += 1) {
            const char = input[i];
            const next = input[i + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                row.push(cell);
                cell = '';
                continue;
            }

            if (char === '\n' && !inQuotes) {
                row.push(cell);
                records.push(row);
                row = [];
                cell = '';
                continue;
            }

            cell += char;
        }

        if (cell !== '' || row.length > 0) {
            row.push(cell);
            records.push(row);
        }

        if (!records.length) return [];

        const headers = records[0].map((value) => normalizeHeaderKey(value));
        const rows = [];
        for (let i = 1; i < records.length; i += 1) {
            const values = records[i];
            if (!values.some((value) => String(value || '').trim() !== '')) continue;

            const rowObj = {};
            headers.forEach((header, index) => {
                if (!header) return;
                rowObj[header] = String(values[index] == null ? '' : values[index]).trim();
            });
            rows.push(rowObj);
        }
        return rows;
    }

    function normalizeHeaderKey(value) {
        const raw = String(value || '')
            .replace(/^\uFEFF/, '')
            .trim();
        if (!raw) return '';

        const cleaned = raw
            .replace(/[_-]+/g, ' ')
            .replace(/[^A-Za-z0-9 ]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        if (!cleaned) return '';
        const parts = cleaned.split(' ');
        return parts[0] + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
    }

    function parseRowsInput(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return [];

        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.rows)) return parsed.rows;
                if (Array.isArray(parsed.data)) return parsed.data;
            }
            throw new Error('JSON input must be an array of row objects.');
        }

        return parseCsvRows(trimmed);
    }

    function withAcademicYear(rows, academicYear) {
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            ...(row && typeof row === 'object' ? row : {}),
            academicYear: row && row.academicYear ? row.academicYear : academicYear
        }));
    }

    function filterRowsForYear(rows, academicYear) {
        const compare = globalScope.EagleNetCompare;
        const targetYear = compare && typeof compare.normalizeAcademicYear === 'function'
            ? compare.normalizeAcademicYear(academicYear)
            : String(academicYear || '').trim();

        return (Array.isArray(rows) ? rows : []).filter((row) => {
            const rowYear = row && row.academicYear
                ? row.academicYear
                : academicYear;
            const normalizedRowYear = compare && typeof compare.normalizeAcademicYear === 'function'
                ? compare.normalizeAcademicYear(rowYear)
                : String(rowYear || '').trim();
            return normalizedRowYear === targetYear;
        });
    }

    function readSchedulerRows(academicYear) {
        if (!globalScope.WorkloadIntegration || typeof globalScope.WorkloadIntegration.getProgramCommandScheduleCourses !== 'function') {
            throw new Error('WorkloadIntegration.getProgramCommandScheduleCourses() is unavailable.');
        }

        const courses = globalScope.WorkloadIntegration.getProgramCommandScheduleCourses(academicYear);
        return (Array.isArray(courses) ? courses : []).map((course) => ({
            academicYear,
            quarter: course?.quarter || '',
            courseCode: course?.courseCode || course?.code || '',
            section: course?.section || course?.sectionNumber || '',
            crn: course?.crn || '',
            title: course?.title || course?.name || '',
            instructor: course?.assignedFaculty || course?.instructor || '',
            days: course?.days || course?.day || '',
            startTime: course?.startTime || '',
            endTime: course?.endTime || '',
            time: course?.time || '',
            room: course?.room || '',
            building: course?.building || '',
            credits: course?.credits,
            modality: course?.modality || '',
            campus: course?.campus || ''
        }));
    }

    function renderSummary(diff) {
        const node = qs('summaryGrid');
        if (!node) return;

        if (!diff || !diff.summary) {
            node.innerHTML = '<div class="metric"><span>No data yet.</span></div>';
            return;
        }

        const summary = diff.summary;
        const metrics = [
            ['Scheduler Rows', summary.leftRows],
            ['EagleNet Rows', summary.rightRows],
            ['Exact Matches', summary.exactMatches],
            ['Field Mismatches', summary.fieldMismatchRows],
            ['Missing In EagleNet', summary.missingInRight],
            ['Extra In EagleNet', summary.extraInRight],
            ['Total Differences', summary.totalDifferences]
        ];

        node.innerHTML = metrics
            .map(([label, value]) => `
                <div class="metric">
                    <strong>${escapeHtml(value)}</strong>
                    <span>${escapeHtml(label)}</span>
                </div>
            `)
            .join('');
    }

    function renderCatalogSummary(snapshot) {
        const node = qs('catalogOutput');
        if (!node) return;

        const catalog = snapshot?.catalog;
        const programs = Array.isArray(catalog?.programs) ? catalog.programs : [];
        if (!catalog || !programs.length) {
            node.className = 'empty';
            node.textContent = 'EECS catalog is unavailable.';
            return;
        }

        const inventoryCount = Number(catalog.summary?.roomInventoryCount) || programs.reduce((sum, program) => sum + (Array.isArray(program.roomInventory) ? program.roomInventory.length : 0), 0);
        const nonRoomCount = Number(catalog.summary?.nonRoomInventoryCount) || programs.reduce((sum, program) => sum + (Array.isArray(program.nonRoomInventory) ? program.nonRoomInventory.length : 0), 0);

        node.className = '';
        node.innerHTML = `
            <div class="summary-grid">
                <div class="metric">
                    <strong>${escapeHtml(catalog.department?.code || '')}</strong>
                    <span>Department</span>
                </div>
                <div class="metric">
                    <strong>${escapeHtml(programs.length)}</strong>
                    <span>Programs</span>
                </div>
                <div class="metric">
                    <strong>${escapeHtml((catalog.terms || []).length)}</strong>
                    <span>Terms</span>
                </div>
                <div class="metric">
                    <strong>${escapeHtml(inventoryCount)}</strong>
                    <span>Schedulable room entries</span>
                </div>
                <div class="metric">
                    <strong>${escapeHtml(nonRoomCount)}</strong>
                    <span>Location exceptions</span>
                </div>
            </div>
            <div class="catalog-grid">
                ${programs.map((program) => {
                    const rooms = Array.isArray(program.roomInventory) ? program.roomInventory : [];
                    const nonRoomInventory = Array.isArray(program.nonRoomInventory) ? program.nonRoomInventory : [];
                    const roomPreview = rooms.slice(0, 5).map((entry) => `<span class="catalog-chip">${escapeHtml(globalScope.EECSDepartmentCatalog?.formatRoomInventoryEntry(entry) || '')}</span>`).join('');
                    const overflow = rooms.length > 5
                        ? `<span class="catalog-chip">+${rooms.length - 5} more</span>`
                        : '';
                    const nonRoomPreview = nonRoomInventory.slice(0, 4)
                        .map((entry) => `<span class="catalog-chip">${escapeHtml(globalScope.EECSDepartmentCatalog?.formatNonRoomInventoryEntry(entry) || '')}</span>`)
                        .join('');
                    const nonRoomOverflow = nonRoomInventory.length > 4
                        ? `<span class="catalog-chip">+${nonRoomInventory.length - 4} more</span>`
                        : '';
                    return `
                        <article class="catalog-card">
                            <h3>${escapeHtml(program.code)} · ${escapeHtml(program.displayName || program.subjectDescription || '')}</h3>
                            <p class="catalog-meta">
                                ${escapeHtml((program.terms || []).join(' · '))}
                                · ${escapeHtml(rooms.length)} schedulable rooms
                                · ${escapeHtml(nonRoomInventory.length)} location exceptions
                                · ${escapeHtml((program.sourceFiles || []).length)} source files
                            </p>
                            <div class="catalog-inventory">
                                ${roomPreview}
                                ${overflow}
                            </div>
                            ${nonRoomInventory.length ? `
                                <p class="catalog-meta">Location exceptions</p>
                                <div class="catalog-inventory">
                                    ${nonRoomPreview}
                                    ${nonRoomOverflow}
                                </div>
                            ` : ''}
                        </article>
                    `;
                }).join('')}
            </div>
        `;
    }

    function recordValue(record, field) {
        const normalized = record && record.normalized ? record.normalized : {};
        const value = normalized[field];
        if (value == null || value === '') return '';
        return String(value);
    }

    function renderRecordTable(items, typeLabel) {
        if (!Array.isArray(items) || items.length === 0) {
            return '<div class="empty">No rows.</div>';
        }

        const rows = items.map((item) => {
            const record = item.record || {};
            const normalized = record.normalized || {};
            return `
                <tr>
                    <td>${escapeHtml(normalized.quarter || '')}</td>
                    <td>${escapeHtml(normalized.courseCode || '')}</td>
                    <td>${escapeHtml(normalized.section || '')}</td>
                    <td>${escapeHtml(normalized.instructor || '')}</td>
                    <td>${escapeHtml([normalized.days, normalized.timeRange].filter(Boolean).join(' '))}</td>
                    <td>${escapeHtml(normalized.room || '')}</td>
                    <td>${escapeHtml(typeLabel)}</td>
                </tr>
            `;
        }).join('');

        return `
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Quarter</th>
                        <th>Course</th>
                        <th>Section</th>
                        <th>Instructor</th>
                        <th>Meeting</th>
                        <th>Room</th>
                        <th>Type</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function getFriendlyFieldName(field) {
        return FRIENDLY_FIELD_LABELS[field] || field;
    }

    function renderFieldMismatchGroups(fieldMismatches) {
        if (!Array.isArray(fieldMismatches) || fieldMismatches.length === 0) {
            return '<div class="empty">No field mismatches.</div>';
        }

        const grouped = new Map();
        fieldMismatches.forEach((rowMismatch) => {
            (rowMismatch.mismatches || []).forEach((entry) => {
                const key = entry.field;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push({
                    rowMismatch,
                    entry
                });
            });
        });

        return [...grouped.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([field, entries]) => {
                const mismatchRows = entries.map(({ rowMismatch, entry }) => `
                    <tr>
                        <td>${escapeHtml(rowMismatch.label || '')}</td>
                        <td>${escapeHtml(recordValue(rowMismatch.leftRecord, 'quarter'))}</td>
                        <td>${escapeHtml(recordValue(rowMismatch.leftRecord, 'courseCode'))}</td>
                        <td>${escapeHtml(entry.left)}</td>
                        <td>${escapeHtml(entry.right)}</td>
                    </tr>
                `).join('');

                return `
                    <details>
                        <summary>${escapeHtml(getFriendlyFieldName(field))} (${entries.length})</summary>
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th>Row</th>
                                    <th>Quarter</th>
                                    <th>Course</th>
                                    <th>Scheduler</th>
                                    <th>EagleNet</th>
                                </tr>
                            </thead>
                            <tbody>${mismatchRows}</tbody>
                        </table>
                    </details>
                `;
            })
            .join('');
    }

    function renderReport(diff) {
        const node = qs('reportOutput');
        if (!node) return;

        if (!diff || !diff.summary) {
            node.className = 'empty';
            node.textContent = 'Run comparison to view categorized differences.';
            return;
        }

        if (diff.summary.totalDifferences === 0) {
            node.className = 'status ok';
            node.textContent = 'No discrepancies found for selected year after normalization.';
            return;
        }

        node.className = '';
        node.innerHTML = `
            <details open>
                <summary>Missing in EagleNet (${diff.summary.missingInRight})</summary>
                ${renderRecordTable(diff.missingInRight, 'Scheduler only')}
            </details>
            <details open>
                <summary>Extra in EagleNet (${diff.summary.extraInRight})</summary>
                ${renderRecordTable(diff.extraInRight, 'EagleNet only')}
            </details>
            <details open>
                <summary>Field Mismatches (${diff.summary.fieldMismatchRows})</summary>
                ${renderFieldMismatchGroups(diff.fieldMismatches)}
            </details>
        `;
    }

    function buildDiscrepancyRows(diff, academicYear) {
        if (!diff || !diff.summary) return [];

        const rows = [];
        (diff.missingInRight || []).forEach((item) => {
            const n = item.record?.normalized || {};
            rows.push({
                academicYear,
                mismatchType: 'missing_in_eaglenet',
                quarter: n.quarter || '',
                courseCode: n.courseCode || '',
                section: n.section || '',
                label: item.label || '',
                field: '',
                schedulerValue: 'Present',
                eaglenetValue: 'Missing'
            });
        });

        (diff.extraInRight || []).forEach((item) => {
            const n = item.record?.normalized || {};
            rows.push({
                academicYear,
                mismatchType: 'extra_in_eaglenet',
                quarter: n.quarter || '',
                courseCode: n.courseCode || '',
                section: n.section || '',
                label: item.label || '',
                field: '',
                schedulerValue: 'Missing',
                eaglenetValue: 'Present'
            });
        });

        (diff.fieldMismatches || []).forEach((rowMismatch) => {
            (rowMismatch.mismatches || []).forEach((entry) => {
                rows.push({
                    academicYear,
                    mismatchType: 'field_mismatch',
                    quarter: recordValue(rowMismatch.leftRecord, 'quarter'),
                    courseCode: recordValue(rowMismatch.leftRecord, 'courseCode'),
                    section: recordValue(rowMismatch.leftRecord, 'section'),
                    label: rowMismatch.label || '',
                    field: getFriendlyFieldName(entry.field),
                    schedulerValue: entry.left == null ? '' : String(entry.left),
                    eaglenetValue: entry.right == null ? '' : String(entry.right)
                });
            });
        });

        return rows;
    }

    function escapeCsvValue(value) {
        const text = String(value == null ? '' : value);
        if (/[,"\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function toCsv(rows, columns) {
        const safeRows = Array.isArray(rows) ? rows : [];
        const safeColumns = Array.isArray(columns) && columns.length
            ? columns
            : Object.keys(safeRows[0] || {});

        const lines = [];
        lines.push(safeColumns.map((column) => escapeCsvValue(column)).join(','));
        safeRows.forEach((row) => {
            lines.push(safeColumns.map((column) => escapeCsvValue(row?.[column])).join(','));
        });

        return `${lines.join('\n')}\n`;
    }

    function downloadTextFile(filename, content, mimeType) {
        if (typeof document === 'undefined') return;
        const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function readSelectedYear() {
        return String(qs('compareYear')?.value || '').trim();
    }

    function runComparison() {
        try {
            if (!globalScope.EagleNetCompare || typeof globalScope.EagleNetCompare.diffNormalizedSchedules !== 'function') {
                throw new Error('EagleNet comparison utilities are unavailable.');
            }

            const academicYear = readSelectedYear();
            if (!academicYear) {
                throw new Error('Select an academic year before running comparison.');
            }

            const sourceText = String(qs('eaglenetDataInput')?.value || '').trim();
            if (!sourceText) {
                throw new Error('Provide EagleNet JSON or CSV data first.');
            }

            const eagleRowsInput = parseRowsInput(sourceText);
            const schedulerRows = filterRowsForYear(withAcademicYear(readSchedulerRows(academicYear), academicYear), academicYear);
            const eagleRows = filterRowsForYear(withAcademicYear(eagleRowsInput, academicYear), academicYear);

            const diff = globalScope.EagleNetCompare.diffNormalizedSchedules(schedulerRows, eagleRows, {
                leftSource: 'scheduler',
                rightSource: 'eaglenet'
            });

            state.lastDiff = diff;
            state.lastYear = academicYear;
            state.lastSchedulerRows = schedulerRows;
            state.lastEagleNetRows = eagleRows;

            renderSummary(diff);
            renderReport(diff);

            setStatus(
                `Compared ${diff.summary.leftRows} scheduler rows vs ${diff.summary.rightRows} EagleNet rows. `
                + `Differences: ${diff.summary.totalDifferences}.`,
                'ok'
            );
        } catch (error) {
            state.lastDiff = null;
            renderSummary(null);
            renderReport(null);
            setStatus(error?.message || String(error), 'error');
        }
    }

    function exportDiscrepancies() {
        try {
            if (!state.lastDiff || !state.lastYear) {
                throw new Error('Run a comparison before exporting discrepancies.');
            }

            const rows = buildDiscrepancyRows(state.lastDiff, state.lastYear);
            if (!rows.length) {
                throw new Error('No discrepancies to export for the current comparison.');
            }

            const columns = [
                'academicYear',
                'mismatchType',
                'quarter',
                'courseCode',
                'section',
                'label',
                'field',
                'schedulerValue',
                'eaglenetValue'
            ];
            const csv = toCsv(rows, columns);
            const dateTag = new Date().toISOString().slice(0, 10);
            const filename = `eaglenet-discrepancies-${state.lastYear}-${dateTag}.csv`;
            downloadTextFile(filename, csv, 'text/csv;charset=utf-8');

            setStatus(`Exported ${rows.length} discrepancy rows to ${filename}.`, 'ok');
        } catch (error) {
            setStatus(error?.message || String(error), 'error');
        }
    }

    function loadSample() {
        const academicYear = readSelectedYear() || getCurrentAcademicYear();
        const sampleRows = [
            {
                academicYear,
                quarter: 'Fall',
                courseCode: 'DESN 101',
                section: '001',
                title: 'Design Foundations I',
                instructor: 'Travis Masingale',
                days: 'MW',
                time: '09:00-10:50',
                room: 'CEB 102',
                credits: 5
            },
            {
                academicYear,
                quarter: 'Fall',
                courseCode: 'DESN 202',
                section: '001',
                title: 'Interaction Design',
                instructor: 'Mindy Breen',
                days: 'TR',
                time: '13:00-14:50',
                room: 'CEB 206',
                credits: 5
            }
        ];

        const textarea = qs('eaglenetDataInput');
        if (textarea) {
            textarea.value = JSON.stringify(sampleRows, null, 2);
        }
        setStatus('Sample EagleNet dataset loaded. Review and click Run Comparison.', 'ok');
    }

    function handleFileInputChange(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;

        file.text()
            .then((text) => {
                const textarea = qs('eaglenetDataInput');
                if (textarea) {
                    textarea.value = text;
                }
                setStatus(`Loaded file: ${file.name}.`, 'ok');
            })
            .catch((error) => {
                setStatus(`Could not read file: ${error?.message || String(error)}`, 'error');
            });
    }

    async function initializePage() {
        if (typeof document === 'undefined') return;
        if (!qs('compareYear')) return;

        if (!globalScope.EagleNetCompare) {
            setStatus('EagleNet compare runtime failed to load.', 'error');
            return;
        }
        if (!globalScope.EECSDepartmentCatalog || typeof globalScope.EECSDepartmentCatalog.load !== 'function') {
            setStatus('EECS catalog runtime failed to load.', 'error');
            return;
        }

        populateYearSelect();
        renderSummary(null);
        renderReport(null);
        renderCatalogSummary({ catalog: null });

        try {
            const snapshot = await globalScope.EECSDepartmentCatalog.load();
            renderCatalogSummary(snapshot);
            if (globalScope.WorkloadIntegration) {
                setStatus('Ready. Select year, provide EagleNet data, and run comparison.');
            } else {
                setStatus('EECS catalog loaded. Workload integration is unavailable, so comparison is disabled.');
            }
        } catch (error) {
            renderCatalogSummary({ catalog: null });
            setStatus(`EECS catalog load failed: ${error?.message || String(error)}`, 'error');
        }

        const runButton = qs('runCompareButton');
        const exportButton = qs('exportDiscrepanciesButton');
        const sampleButton = qs('loadSampleButton');
        const fileInput = qs('eaglenetFile');

        if (runButton) runButton.addEventListener('click', runComparison);
        if (exportButton) exportButton.addEventListener('click', exportDiscrepancies);
        if (sampleButton) sampleButton.addEventListener('click', loadSample);
        if (fileInput) fileInput.addEventListener('change', handleFileInputChange);
    }

    const EagleNetComparePage = {
        parseCsvRows,
        parseRowsInput,
        toCsv,
        buildDiscrepancyRows,
        getAcademicYearOptions
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EagleNetComparePage;
    }
    if (globalScope) {
        globalScope.EagleNetComparePage = EagleNetComparePage;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializePage);
        } else {
            initializePage();
        }
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
