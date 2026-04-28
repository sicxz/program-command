(function programCommandImportModule(globalScope) {
    'use strict';

    const PENDING_ONBOARDING_IMPORT_STORAGE_KEY = 'programCommandOnboardingImportV1';
    const EXCELJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    const CLSS_IMPORT_QUARTERS = Object.freeze(['fall', 'winter', 'spring']);
    const ENROLLMENT_FIELD_ALIASES = [
        'enrollment',
        'enrolled',
        'registered',
        'registeredCount',
        'studentCount',
        'actualEnrollment',
        'enrollmentActual',
        'currentEnrollment',
        'censusEnrollment',
        'headcount'
    ];

    let excelJsLoadPromise = null;
    let tesseractLoadPromise = null;

    function getCompareApi() {
        if (globalScope.EagleNetCompare) {
            return globalScope.EagleNetCompare;
        }
        if (typeof require === 'function') {
            try {
                return require('./eaglenet-compare.js');
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    function safeLocalStorage() {
        try {
            return globalScope.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    function readJsonStorage(key) {
        const storage = safeLocalStorage();
        if (!storage) return null;
        try {
            const raw = storage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function writeJsonStorage(key, value) {
        const storage = safeLocalStorage();
        if (!storage) return;
        try {
            storage.setItem(key, JSON.stringify(value));
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function clearStorageKey(key) {
        const storage = safeLocalStorage();
        if (!storage) return;
        try {
            storage.removeItem(key);
        } catch (error) {
            // Ignore storage failures.
        }
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

    function isScreenshotFile(file) {
        const name = String(file?.name || '').trim().toLowerCase();
        const type = String(file?.type || '').trim().toLowerCase();
        return Boolean(
            name
            && !name.startsWith('.')
            && (type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name))
        );
    }

    function parseCsvRows(text) {
        const input = String(text || '').replace(/\r\n?/g, '\n');
        const records = [];
        let row = [];
        let cell = '';
        let inQuotes = false;

        for (let index = 0; index < input.length; index += 1) {
            const char = input[index];
            const next = input[index + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    cell += '"';
                    index += 1;
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
        return records.slice(1)
            .filter((values) => values.some((value) => String(value || '').trim() !== ''))
            .map((values) => {
                const rowObject = {};
                headers.forEach((header, index) => {
                    if (!header) return;
                    rowObject[header] = String(values[index] == null ? '' : values[index]).trim();
                });
                return rowObject;
            });
    }

    function dedupe(values) {
        return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
    }

    function buildRecognizedHeaderKeySet(compareApi) {
        const aliases = compareApi?.DEFAULT_FIELD_ALIASES || {};
        const keys = new Set();
        Object.values(aliases).forEach((list) => {
            (Array.isArray(list) ? list : []).forEach((value) => {
                const normalized = normalizeHeaderKey(value);
                if (normalized) keys.add(normalized);
            });
        });
        ENROLLMENT_FIELD_ALIASES.forEach((value) => {
            const normalized = normalizeHeaderKey(value);
            if (normalized) keys.add(normalized);
        });
        return keys;
    }

    function normalizeWorksheetCellValue(cell) {
        if (!cell) return '';

        const value = cell.value;
        if (value == null) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return String(value).trim();
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (typeof value === 'object') {
            if (Array.isArray(value.richText)) {
                return value.richText.map((entry) => String(entry?.text || '')).join('').trim();
            }
            if (typeof value.text === 'string' && value.text.trim()) {
                return value.text.trim();
            }
            if (typeof value.result !== 'undefined' && value.result != null) {
                return String(value.result).trim();
            }
            if (typeof value.formula === 'string' && typeof cell.text === 'string' && cell.text.trim()) {
                return cell.text.trim();
            }
        }
        if (typeof cell.text === 'string' && cell.text.trim()) {
            return cell.text.trim();
        }
        return String(value).trim();
    }

    function selectWorksheetHeaderRow(matrix, recognizedHeaders) {
        let firstNonEmpty = null;

        for (let index = 0; index < matrix.length; index += 1) {
            const row = matrix[index];
            const values = row.values.filter(Boolean);
            if (!values.length) continue;
            if (firstNonEmpty == null) {
                firstNonEmpty = index;
            }

            const normalized = values.map((value) => normalizeHeaderKey(value)).filter(Boolean);
            const recognizedCount = normalized.filter((value) => recognizedHeaders.has(value)).length;
            if (recognizedCount >= 2) {
                return index;
            }
        }

        return firstNonEmpty;
    }

    async function ensureExcelJsLoaded(options = {}) {
        if (options.ExcelJS) {
            return options.ExcelJS;
        }
        if (globalScope.ExcelJS) {
            return globalScope.ExcelJS;
        }
        if (!globalScope.document) {
            throw new Error('ExcelJS is required to parse .xlsx files in this environment.');
        }

        if (!excelJsLoadPromise) {
            excelJsLoadPromise = new Promise((resolve, reject) => {
                const existing = globalScope.document.querySelector('script[data-program-command-exceljs="import"]');
                if (existing) {
                    existing.addEventListener('load', () => resolve(globalScope.ExcelJS), { once: true });
                    existing.addEventListener('error', () => reject(new Error('Failed to load ExcelJS library.')), { once: true });
                    return;
                }

                const script = globalScope.document.createElement('script');
                script.src = EXCELJS_CDN_URL;
                script.async = true;
                script.dataset.programCommandExceljs = 'import';
                script.onload = () => {
                    if (globalScope.ExcelJS) {
                        resolve(globalScope.ExcelJS);
                        return;
                    }
                    reject(new Error('ExcelJS loaded without a global runtime.'));
                };
                script.onerror = () => reject(new Error('Failed to load ExcelJS library from CDN.'));
                globalScope.document.head.appendChild(script);
            }).catch((error) => {
                excelJsLoadPromise = null;
                throw error;
            });
        }

        return excelJsLoadPromise;
    }

    async function ensureTesseractLoaded(options = {}) {
        if (options.Tesseract?.recognize) {
            return options.Tesseract;
        }
        if (globalScope.Tesseract?.recognize) {
            return globalScope.Tesseract;
        }
        if (!globalScope.document) {
            throw new Error('Tesseract OCR is required to parse screenshot uploads in this environment.');
        }

        if (!tesseractLoadPromise) {
            tesseractLoadPromise = new Promise((resolve, reject) => {
                const existing = globalScope.document.querySelector('script[data-program-command-tesseract="import"]');
                if (existing) {
                    existing.addEventListener('load', () => resolve(globalScope.Tesseract), { once: true });
                    existing.addEventListener('error', () => reject(new Error('Failed to load Tesseract OCR library.')), { once: true });
                    return;
                }

                const script = globalScope.document.createElement('script');
                script.src = TESSERACT_CDN_URL;
                script.async = true;
                script.dataset.programCommandTesseract = 'import';
                script.onload = () => {
                    if (globalScope.Tesseract?.recognize) {
                        resolve(globalScope.Tesseract);
                        return;
                    }
                    reject(new Error('Tesseract OCR loaded without a browser recognize API.'));
                };
                script.onerror = () => reject(new Error('Failed to load Tesseract OCR library from CDN.'));
                globalScope.document.head.appendChild(script);
            }).catch((error) => {
                tesseractLoadPromise = null;
                throw error;
            });
        }

        return tesseractLoadPromise;
    }

    function extractWorkbookRows(workbook, options = {}) {
        const compareApi = getCompareApi();
        const recognizedHeaders = buildRecognizedHeaderKeySet(compareApi);
        const rows = [];
        const warnings = [];
        const sheetSummaries = [];

        (Array.isArray(workbook?.worksheets) ? workbook.worksheets : []).forEach((worksheet) => {
            const matrix = [];
            worksheet.eachRow({ includeEmpty: false }, (row) => {
                const values = [];
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    values[colNumber - 1] = normalizeWorksheetCellValue(cell);
                });
                matrix.push({
                    rowNumber: row.number,
                    values
                });
            });

            const headerIndex = selectWorksheetHeaderRow(matrix, recognizedHeaders);
            if (headerIndex == null) {
                return;
            }

            const headerRow = matrix[headerIndex];
            const headers = headerRow.values.map((value) => normalizeHeaderKey(value));
            const recognizedCount = headers.filter((value) => recognizedHeaders.has(value)).length;
            if (recognizedCount < 2) {
                warnings.push(`${worksheet.name}: skipped worksheet without recognizable EagleNET headers.`);
                return;
            }

            let sheetRowCount = 0;
            matrix.slice(headerIndex + 1).forEach((entry) => {
                const hasContent = entry.values.some((value) => String(value || '').trim() !== '');
                if (!hasContent) return;

                const rowObject = {};
                headers.forEach((header, index) => {
                    if (!header) return;
                    const value = entry.values[index];
                    rowObject[header] = String(value == null ? '' : value).trim();
                });
                rowObject.__sheetName = worksheet.name;
                rowObject.__rowNumber = entry.rowNumber;
                rows.push(rowObject);
                sheetRowCount += 1;
            });

            sheetSummaries.push({
                sheetName: worksheet.name,
                rowCount: sheetRowCount
            });
        });

        if (!rows.length && !warnings.length) {
            warnings.push('No spreadsheet rows matched the EagleNET header pattern.');
        }

        return {
            rows,
            meta: {
                format: String(options.format || 'xlsx'),
                sheetSummaries,
                warnings
            }
        };
    }

    async function readTabularRowsFromFile(file, options = {}) {
        if (!file) {
            throw new Error('Choose a spreadsheet file first.');
        }

        const name = String(file.name || '').trim() || 'import';
        const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
        const format = extension || (String(file.type || '').toLowerCase().includes('csv') ? 'csv' : 'xlsx');

        if (format === 'csv' || format === 'tsv' || String(file.type || '').toLowerCase().includes('csv')) {
            const text = typeof file.text === 'function'
                ? await file.text()
                : '';
            const rows = parseCsvRows(text);
            return {
                rows,
                meta: {
                    format: 'csv',
                    fileName: name,
                    rowCount: rows.length,
                    sheetSummaries: [],
                    warnings: rows.length ? [] : ['CSV file did not contain any data rows.']
                }
            };
        }

        if (format === 'xls') {
            throw new Error('Legacy .xls files are not supported in this MVP yet. Save the export as .xlsx or .csv and try again.');
        }

        const ExcelJS = await ensureExcelJsLoaded(options);
        const workbook = new ExcelJS.Workbook();
        const buffer = typeof file.arrayBuffer === 'function'
            ? await file.arrayBuffer()
            : null;
        if (!buffer) {
            throw new Error('Could not read spreadsheet data from the selected file.');
        }

        await workbook.xlsx.load(buffer.slice(0));
        const extracted = extractWorkbookRows(workbook, { format: 'xlsx' });
        return {
            rows: extracted.rows,
            meta: {
                ...extracted.meta,
                fileName: name,
                rowCount: extracted.rows.length
            }
        };
    }

    function normalizeLookupKey(value) {
        return String(value || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
    }

    function inferQuarterKey(...values) {
        const compareApi = getCompareApi();
        for (const value of values) {
            const normalized = compareApi?.normalizeQuarter
                ? compareApi.normalizeQuarter(value)
                : String(value || '').trim();
            const lookup = String(normalized || '').trim().toLowerCase();
            if (lookup === 'fall') return 'fall';
            if (lookup === 'winter') return 'winter';
            if (lookup === 'spring') return 'spring';
            if (lookup === 'summer') return 'summer';
        }
        return '';
    }

    function detectClssQuarterKeyword(value) {
        const normalized = String(value || '').toLowerCase();
        const hits = [];

        if (/\bfall\b|\bautumn\b|\bfa(?:ll)?[-_\s]?\d{2,4}\b/.test(normalized)) hits.push('fall');
        if (/\bwinter\b|\bwi(?:nter)?[-_\s]?\d{2,4}\b/.test(normalized)) hits.push('winter');
        if (/\bspring\b|\bsp(?:ring)?[-_\s]?\d{2,4}\b/.test(normalized)) hits.push('spring');

        return hits.length === 1 ? hits[0] : '';
    }

    function inferClssQuarterFromOcrPayload(fileName, text) {
        return detectClssQuarterKeyword(fileName) || detectClssQuarterKeyword(String(text || '').slice(0, 1200));
    }

    function pickFirstPresentValue(row, keys) {
        const source = row && typeof row === 'object' ? row : {};
        for (const key of Array.isArray(keys) ? keys : []) {
            if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null && String(source[key]).trim() !== '') {
                return source[key];
            }
        }
        return '';
    }

    function resolveDayPattern(days, dayPatterns) {
        const lookup = normalizeLookupKey(days);
        if (!lookup) {
            return { dayPattern: '', singleDay: false, note: 'Meeting pattern not found' };
        }

        const patterns = Array.isArray(dayPatterns) ? dayPatterns : [];
        const matched = patterns.find((pattern) => {
            const aliases = [pattern?.id, ...(Array.isArray(pattern?.aliases) ? pattern.aliases : [])];
            return aliases.some((alias) => normalizeLookupKey(alias) === lookup);
        });
        if (matched?.id) {
            return { dayPattern: String(matched.id).trim(), singleDay: false, note: '' };
        }

        if (lookup.length === 1 && 'MTWRFSU'.includes(lookup)) {
            return { dayPattern: '', singleDay: true, note: `Single-day pattern (${lookup})` };
        }

        return { dayPattern: '', singleDay: false, note: `Unsupported day pattern (${days})` };
    }

    function parseClockToMinutes(value) {
        const compareApi = getCompareApi();
        const normalized = compareApi?.normalizeTimeRange
            ? compareApi.normalizeTimeRange('', '', value)
            : String(value || '').trim();

        const rangeMatch = String(normalized || '').match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
        if (rangeMatch) {
            return {
                startMinutes: parseClockTokenToMinutes(rangeMatch[1]),
                endMinutes: parseClockTokenToMinutes(rangeMatch[2])
            };
        }

        return {
            startMinutes: parseClockTokenToMinutes(value),
            endMinutes: null
        };
    }

    function parseClockTokenToMinutes(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const match = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return null;
        }
        return (hours * 60) + minutes;
    }

    function resolveTimeSlot(timeRange, timeSlots) {
        const raw = String(timeRange || '').trim();
        if (!raw) {
            return { timeSlot: '', note: 'Meeting time not found' };
        }

        const slots = Array.isArray(timeSlots) ? timeSlots : [];
        const lookup = normalizeLookupKey(raw);
        const aliasMatch = slots.find((slot) => {
            const aliases = [slot?.id, ...(Array.isArray(slot?.aliases) ? slot.aliases : [])];
            return aliases.some((alias) => normalizeLookupKey(alias) === lookup);
        });
        if (aliasMatch?.id) {
            return { timeSlot: String(aliasMatch.id).trim(), note: '' };
        }

        const range = parseClockToMinutes(raw);
        const exact = slots.find((slot) =>
            Number.isFinite(slot?.startMinutes)
            && Number.isFinite(slot?.endMinutes)
            && slot.startMinutes === range.startMinutes
            && slot.endMinutes === range.endMinutes
        );
        if (exact?.id) {
            return { timeSlot: String(exact.id).trim(), note: '' };
        }

        const startMatch = slots.find((slot) =>
            Number.isFinite(slot?.startMinutes)
            && slot.startMinutes === range.startMinutes
        );
        if (startMatch?.id) {
            return { timeSlot: String(startMatch.id).trim(), note: '' };
        }

        return { timeSlot: '', note: `Unsupported time (${raw})` };
    }

    function resolveRoom(roomValue, roomOptions) {
        const source = String(roomValue || '').trim();
        if (!source) {
            return { raw: '', mappedRoom: '', note: '' };
        }

        const rooms = dedupe(roomOptions);
        const lookup = normalizeLookupKey(source);
        const matched = rooms.find((room) => {
            const normalizedRoom = normalizeLookupKey(room);
            return normalizedRoom && (normalizedRoom === lookup || lookup.includes(normalizedRoom));
        });

        return {
            raw: source,
            mappedRoom: matched || '',
            note: matched ? '' : 'Room not detected; import will auto-assign an open room'
        };
    }

    function buildRawRowSummary(rawRow) {
        const entries = Object.entries(rawRow || {})
            .filter(([key, value]) => !String(key || '').startsWith('__') && String(value || '').trim() !== '')
            .slice(0, 12)
            .map(([key, value]) => `${key}: ${value}`);
        return entries.join(' | ');
    }

    function buildMeetingLabel(normalized, rawRow) {
        const pieces = [];
        if (normalized.days) pieces.push(normalized.days);
        if (normalized.timeRange) pieces.push(normalized.timeRange);
        if (pieces.length) return pieces.join(' ');

        const rawMeeting = pickFirstPresentValue(rawRow, ['meetingTime', 'meetingPattern', 'time']);
        return String(rawMeeting || '').trim() || '—';
    }

    function normalizeAllowedCoursePrefixes(values) {
        return dedupe((Array.isArray(values) ? values : [])
            .map((value) => String(value || '').trim().toUpperCase())
            .filter(Boolean));
    }

    function courseCodeMatchesAllowedPrefixes(courseCode, allowedPrefixes) {
        const normalizedCode = String(courseCode || '').trim().toUpperCase();
        const prefixes = normalizeAllowedCoursePrefixes(allowedPrefixes);
        if (!prefixes.length) return true;
        if (!normalizedCode) return false;
        return prefixes.some((prefix) => normalizedCode.startsWith(`${prefix} `) || normalizedCode === prefix);
    }

    function splitScreenshotOcrBlocks(rawText) {
        const input = String(rawText || '');
        const headerRegex = /^===== (.+?) =====$/gm;
        const blocks = [];
        let match = headerRegex.exec(input);

        if (!match) {
            const text = input.trim();
            return text ? [{ name: null, text }] : [];
        }

        while (match) {
            const name = String(match[1] || '').trim() || null;
            const start = match.index + match[0].length;
            const nextMatch = headerRegex.exec(input);
            const end = nextMatch ? nextMatch.index : input.length;
            const text = input.slice(start, end).trim();
            if (text) {
                blocks.push({ name, text });
            }
            match = nextMatch;
        }

        return blocks;
    }

    function cleanScreenshotCourseTitle(value) {
        return String(value || '')
            .replace(/Search Results[^A-Z]*/gi, ' ')
            .replace(/Term:\s+(Fall|Winter|Spring)[^A-Z]*/gi, ' ')
            .replace(/Title\s+[^A-Z]+Attribute/gi, ' ')
            .replace(/State Support Funding/gi, ' ')
            .replace(/\b\d+\s+of\s+\d+\s+(?:seats|waitlist)[^A-Z]*/gi, ' ')
            .replace(/\bFULL:\s*0\s*of\s*\d+[^A-Z]*/gi, ' ')
            .replace(/Page\s+\w+\s+of\s+\w+[^A-Z]*/gi, ' ')
            .replace(/[|~]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function inferSubjectCodeFromDescriptor(value) {
        const source = String(value || '').toLowerCase();
        if (source.includes('cyber')) return 'CYBR';
        if (source.includes('computer')) return 'CSCD';
        return '';
    }

    function extractInstructorFromOcrRemainder(value) {
        const source = String(value || '').replace(/\([^)]*\)/g, ' ');
        const match = source.match(/([A-Z][A-Za-z'`.\-]+,\s*[A-Z][A-Za-z'`.\-]+(?:\s+[A-Z][A-Za-z'`.\-]+)?)/);
        return match ? match[1].replace(/\s+/g, ' ').trim() : '';
    }

    function extractCampusFromOcrRemainder(value) {
        const source = String(value || '');
        if (/\bCheney\b/i.test(source)) return 'Cheney';
        if (/\bSpoka(?:ne)?\.{0,3}\b/i.test(source)) return 'Spokane';
        return '';
    }

    function normalizeOcrClockToken(value) {
        const match = String(value || '')
            .replace(/\./g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .match(/^(\d{1,2}:\d{2})\s*([AP]M)$/i);
        if (!match) return '';
        return `${match[1]} ${match[2].toUpperCase()}`;
    }

    function buildScreenshotTabularRowsFromOcrText(rawText, options = {}) {
        const screenshotRows = [];
        const blocks = splitScreenshotOcrBlocks(rawText);
        const rowRegex = /([A-Z0-9/&+',().\- ]{4,}?)\s+(Computer\s+Sci\.\.\.|Cybersecurity)\s+(\d{3}L?)\s+(\d{3})\s+(\d{1,2})\s+(\d{5})\s+(Fall|Winter|Spring)[A-Za-z.]*\s+(.+?)(?=(?:[A-Z0-9/&+',().\- ]{4,}?\s+(?:Computer\s+Sci\.\.\.|Cybersecurity)\s+\d{3}L?\s+\d{3}\s+\d{1,2}\s+\d{5}\s+(?:Fall|Winter|Spring)|$))/gis;

        blocks.forEach((block, blockIndex) => {
            const compact = String(block.text || '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!compact) return;

            let match;
            while ((match = rowRegex.exec(compact)) !== null) {
                const rawTitle = cleanScreenshotCourseTitle(match[1]);
                const subjectCode = inferSubjectCodeFromDescriptor(match[2]);
                const catalogNumber = String(match[3] || '').trim().toUpperCase();
                const section = String(match[4] || '').trim().padStart(3, '0');
                const credits = String(match[5] || '').trim();
                const quarter = inferQuarterKey(match[7], options.defaultQuarter) || 'spring';
                const remainder = String(match[8] || '').replace(/\s+/g, ' ').trim();
                const instructor = extractInstructorFromOcrRemainder(remainder);
                const timeMatch = remainder.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
                const arranged = /Building:\s*Arrang|Type:\s*Class\s+Building:\s*Arrang|\bIndependent\b/i.test(remainder);
                const online = /\b(online|async|asynchronous|web)\b/i.test(remainder);

                if (!rawTitle || !subjectCode || !catalogNumber || !section) {
                    continue;
                }

                screenshotRows.push({
                    term: quarter,
                    quarter,
                    subject: subjectCode,
                    catalogNumber,
                    section,
                    credits,
                    courseTitle: rawTitle,
                    faculty: instructor,
                    meetingDays: '',
                    startTime: timeMatch ? normalizeOcrClockToken(timeMatch[1]) : '',
                    endTime: timeMatch ? normalizeOcrClockToken(timeMatch[2]) : '',
                    meetingTime: timeMatch ? `${normalizeOcrClockToken(timeMatch[1])}-${normalizeOcrClockToken(timeMatch[2])}` : '',
                    meetingPattern: arranged ? 'Arranged' : (online ? 'Online' : ''),
                    location: arranged ? 'ARRANGED' : extractCampusFromOcrRemainder(remainder),
                    comments: remainder,
                    instructionMode: arranged ? 'Arranged' : (online ? 'Online' : ''),
                    __sheetName: `${CLSS_IMPORT_QUARTERS.includes(quarter) ? `${quarter.charAt(0).toUpperCase()}${quarter.slice(1)}` : 'Screenshot'} OCR`,
                    __sourceBlock: block.name || `Screenshot ${blockIndex + 1}`
                });
            }
        });

        return screenshotRows;
    }

    function buildClssPreviewRowsFromTabularRows(rows, options = {}) {
        const compareApi = getCompareApi();
        if (!compareApi || typeof compareApi.createNormalizedScheduleRecord !== 'function') {
            throw new Error('EagleNet compare helpers are unavailable.');
        }

        const dayPatterns = Array.isArray(options.dayPatterns) ? options.dayPatterns : [];
        const timeSlots = Array.isArray(options.timeSlots) ? options.timeSlots : [];
        const roomOptions = Array.isArray(options.roomOptions) ? options.roomOptions : [];
        const resolveCourseCode = typeof options.resolveCourseCode === 'function'
            ? options.resolveCourseCode
            : (value) => String(value || '').trim();
        const resolveFacultyName = typeof options.resolveFacultyName === 'function'
            ? options.resolveFacultyName
            : (value) => String(value || '').trim() || 'TBD';
        const defaultQuarter = inferQuarterKey(options.defaultQuarter) || 'spring';
        const allowedCoursePrefixes = normalizeAllowedCoursePrefixes(options.allowedCoursePrefixes);

        const warnings = [];
        const quarterCounts = {
            fall: 0,
            winter: 0,
            spring: 0,
            summer: 0
        };

        const previewRows = (Array.isArray(rows) ? rows : []).map((rawRow, index) => {
            const record = compareApi.createNormalizedScheduleRecord(rawRow, index, { source: 'spreadsheet' });
            const normalized = record.normalized || {};
            const notes = [];

            const inferredQuarter = inferQuarterKey(
                normalized.quarter,
                rawRow?.quarter,
                rawRow?.term,
                rawRow?.session,
                rawRow?.__sheetName
            ) || defaultQuarter;
            quarterCounts[inferredQuarter] = (quarterCounts[inferredQuarter] || 0) + 1;

            if (!inferQuarterKey(normalized.quarter, rawRow?.quarter, rawRow?.term, rawRow?.session, rawRow?.__sheetName)) {
                notes.push(`Quarter not detected; defaulted to ${inferredQuarter}`);
            }

            const sourceText = buildRawRowSummary(rawRow);
            const courseCode = resolveCourseCode(normalized.courseCode || '');
            const title = String(normalized.title || pickFirstPresentValue(rawRow, ['title', 'courseTitle', 'classTitle']) || '').trim();
            const section = String(normalized.section || '').trim();
            const credits = Number.isFinite(normalized.credits) ? normalized.credits : 5;
            const instructor = resolveFacultyName(normalized.instructor || 'TBD');
            const meetingLabel = buildMeetingLabel(normalized, rawRow);
            const roomValue = String(normalized.room || pickFirstPresentValue(rawRow, ['room', 'location', 'buildingRoom']) || '').trim();
            const roomInfo = resolveRoom(roomValue, roomOptions);
            if (roomInfo.note) {
                notes.push(roomInfo.note);
            }

            const dayInfo = resolveDayPattern(normalized.days, dayPatterns);
            if (dayInfo.note) {
                notes.push(dayInfo.note);
            }

            const timeInfo = resolveTimeSlot(normalized.timeRange, timeSlots);
            if (timeInfo.note) {
                notes.push(timeInfo.note);
            }

            const enrollmentRaw = pickFirstPresentValue(rawRow, ENROLLMENT_FIELD_ALIASES);
            const enrollment = enrollmentRaw === '' ? null : Number(enrollmentRaw);
            if (Number.isFinite(enrollment)) {
                notes.push(`Enrollment ${enrollment}`);
            }

            const keywordSource = [
                normalized.modality,
                normalized.room,
                normalized.timeRange,
                rawRow?.meetingTime,
                rawRow?.meetingPattern,
                rawRow?.comments,
                rawRow?.instructionMode
            ].map((value) => String(value || '')).join(' ');

            const onlineHint = normalized.modalityKey === 'online'
                || /\bonline|web|async|asynch|asynchronous\b/i.test(keywordSource);
            const arrangedHint = /\barranged|does not meet|independent\b/i.test(keywordSource);

            let status = 'needs-review';
            let schedulerDay = '';
            let schedulerTime = '';
            let schedulerRoom = '';
            let schedulerSlotLabel = '';
            let requiresAutoRoomAssignment = false;

            if (onlineHint && !normalized.days) {
                status = 'online';
                schedulerRoom = 'ONLINE';
                schedulerSlotLabel = 'ONLINE / async';
            } else if (arrangedHint && !normalized.days) {
                status = 'arranged';
                schedulerRoom = 'ARRANGED';
                schedulerSlotLabel = 'ARRANGED';
            } else if (dayInfo.dayPattern) {
                schedulerDay = dayInfo.dayPattern;
                schedulerTime = timeInfo.timeSlot || '';
                if (roomInfo.mappedRoom) {
                    schedulerRoom = roomInfo.mappedRoom;
                } else {
                    requiresAutoRoomAssignment = true;
                }

                if (schedulerDay && schedulerTime) {
                    status = 'ready';
                    schedulerSlotLabel = `${schedulerDay} ${schedulerTime} • ${schedulerRoom || 'Auto room'}`;
                }
            }

            if (dayInfo.singleDay) {
                status = 'needs-review';
                schedulerDay = '';
                schedulerTime = '';
                schedulerRoom = '';
                schedulerSlotLabel = '';
            }

            if (!courseCode || !title) {
                status = 'error';
                if (!courseCode) notes.push('Course code missing');
                if (!title) notes.push('Course title missing');
            }

            if (String(rawRow?.__sheetName || '').trim()) {
                notes.push(`Sheet: ${String(rawRow.__sheetName).trim()}`);
            }

            return {
                status,
                code: courseCode,
                title,
                section,
                credits,
                instructor,
                meetingLabel,
                roomLabel: roomInfo.raw || roomValue || '—',
                schedulerDay,
                schedulerTime,
                schedulerRoom,
                requiresAutoRoomAssignment,
                schedulerSlotLabel,
                targetQuarter: inferredQuarter,
                reviewQuarter: inferredQuarter,
                reviewPlacement: '',
                reviewDay: schedulerDay || '',
                reviewTime: schedulerTime || '',
                reviewRoom: status === 'online' || status === 'arranged'
                    ? ''
                    : (schedulerRoom || (requiresAutoRoomAssignment ? 'AUTO' : '')),
                notes: dedupe(notes),
                rawText: sourceText || `Spreadsheet row ${index + 1}`,
                enrollment: Number.isFinite(enrollment) ? enrollment : null,
                sourceSheet: String(rawRow?.__sheetName || '').trim() || null
            };
        });

        const filteredPreviewRows = allowedCoursePrefixes.length
            ? previewRows.filter((row) => courseCodeMatchesAllowedPrefixes(row.code, allowedCoursePrefixes))
            : previewRows;
        const omittedCount = previewRows.length - filteredPreviewRows.length;
        if (omittedCount > 0) {
            warnings.push(`Omitted ${omittedCount} row${omittedCount === 1 ? '' : 's'} outside the selected program code (${allowedCoursePrefixes.join(', ')}).`);
        }

        if (!filteredPreviewRows.length) {
            warnings.push('No importable rows were found in the spreadsheet.');
        }

        return {
            rows: filteredPreviewRows,
            meta: {
                source: 'spreadsheet',
                fileName: String(options.fileName || '').trim() || null,
                rowCount: filteredPreviewRows.length,
                quarterCounts,
                omittedCount,
                warnings
            }
        };
    }

    function buildClssPreviewRowsFromScreenshotImport(payload, options = {}) {
        const screenshotImport = payload && typeof payload === 'object' ? payload : {};
        const scope = screenshotImport.scope === 'single' ? 'single' : 'all';
        const blocks = [];

        if (scope === 'single') {
            const singleText = String(screenshotImport.singleText || '').trim();
            if (singleText) {
                blocks.push({
                    quarter: inferQuarterKey(screenshotImport.targetQuarter, options.defaultQuarter) || inferQuarterKey(options.defaultQuarter) || 'spring',
                    text: singleText
                });
            }
        } else {
            const quarterTexts = screenshotImport.quarterTexts && typeof screenshotImport.quarterTexts === 'object'
                ? screenshotImport.quarterTexts
                : {};
            CLSS_IMPORT_QUARTERS.forEach((quarter) => {
                const text = String(quarterTexts[quarter] || '').trim();
                if (text) {
                    blocks.push({ quarter, text });
                }
            });
        }

        const rows = blocks.flatMap((block) => buildScreenshotTabularRowsFromOcrText(block.text, {
            defaultQuarter: block.quarter
        }));

        const preview = buildClssPreviewRowsFromTabularRows(rows, {
            ...options,
            fileName: String(options.fileName || screenshotImport?.meta?.fileName || '').trim() || null
        });
        const warnings = Array.isArray(screenshotImport?.meta?.warnings)
            ? screenshotImport.meta.warnings.slice()
            : [];
        return {
            rows: preview.rows,
            meta: {
                ...preview.meta,
                source: 'screenshot',
                warnings: dedupe([...(preview.meta?.warnings || []), ...warnings]),
                ocrFileCount: Number(screenshotImport?.meta?.fileCount) || 0,
                extractedTextCount: Number(screenshotImport?.meta?.extractedTextCount) || 0
            }
        };
    }

    async function readScreenshotTextImportFromFiles(files, options = {}) {
        const screenshotFiles = Array.from(files || []).filter((file) => isScreenshotFile(file));
        if (!screenshotFiles.length) {
            throw new Error('Choose one or more screenshot files first.');
        }

        const recognize = typeof options.recognize === 'function'
            ? options.recognize
            : null;
        const Tesseract = recognize ? null : await ensureTesseractLoaded(options);
        const runRecognize = recognize || ((file) => Tesseract.recognize(file, 'eng'));

        const quarterTexts = {
            fall: '',
            winter: '',
            spring: ''
        };
        const quarterFileCounts = {
            fall: 0,
            winter: 0,
            spring: 0
        };
        const warnings = [];
        const unassignedFiles = [];
        const ocrResults = [];
        const textByPath = new Map();

        for (let index = 0; index < screenshotFiles.length; index += 1) {
            const file = screenshotFiles[index];
            const relativePath = String(file.webkitRelativePath || file.relativePath || file.name || `screenshot-${index + 1}`).trim()
                || `screenshot-${index + 1}`;
            if (typeof options.onProgress === 'function') {
                options.onProgress({
                    index,
                    total: screenshotFiles.length,
                    fileName: relativePath
                });
            }

            const result = await runRecognize(file);
            const text = String(result?.data?.text || result?.text || '').trim();
            const inferredQuarter = inferClssQuarterFromOcrPayload(relativePath, text);
            textByPath.set(relativePath, text);

            ocrResults.push({
                name: String(file.name || relativePath).trim() || relativePath,
                relativePath,
                quarter: inferredQuarter || '',
                textLength: text.length,
                hasText: Boolean(text)
            });

            if (!text) {
                warnings.push(`${relativePath}: OCR did not detect any text.`);
                unassignedFiles.push(relativePath);
                continue;
            }

            if (CLSS_IMPORT_QUARTERS.includes(inferredQuarter)) {
                const header = `===== ${relativePath} =====\n${text}`;
                quarterTexts[inferredQuarter] = quarterTexts[inferredQuarter]
                    ? `${quarterTexts[inferredQuarter]}\n\n${header}`
                    : header;
                quarterFileCounts[inferredQuarter] += 1;
                continue;
            }

            warnings.push(`${relativePath}: OCR text could not be assigned to Fall/Winter/Spring automatically.`);
            unassignedFiles.push(relativePath);
        }

        const assignedQuarters = CLSS_IMPORT_QUARTERS.filter((quarter) => quarterTexts[quarter]);
        const extractedTextCount = ocrResults.filter((entry) => entry.hasText).length;
        const defaultQuarter = inferQuarterKey(options.defaultQuarter) || 'spring';
        let scope = 'all';
        let targetQuarter = assignedQuarters[0] || defaultQuarter;
        let singleText = '';
        let shouldAutoParse = assignedQuarters.length > 0;

        if (assignedQuarters.length === 1 && unassignedFiles.length === 0) {
            scope = 'single';
            targetQuarter = assignedQuarters[0];
            singleText = quarterTexts[targetQuarter];
        } else if (!assignedQuarters.length && extractedTextCount > 0) {
            scope = 'single';
            targetQuarter = defaultQuarter;
            singleText = ocrResults
                .filter((entry) => entry.hasText)
                .map((entry) => `===== ${entry.relativePath} =====\n${textByPath.get(entry.relativePath) || ''}`)
                .filter(Boolean)
                .join('\n\n');
            shouldAutoParse = false;
            warnings.push(`Quarter inference failed for the screenshot batch. Review the default quarter (${targetQuarter}) before building.`);
        }

        return {
            scope,
            targetQuarter,
            singleText,
            quarterTexts,
            meta: {
                source: 'screenshot',
                fileCount: screenshotFiles.length,
                extractedTextCount,
                quarterFileCounts,
                assignedQuarterCount: assignedQuarters.length,
                unassignedFiles,
                warnings,
                shouldAutoParse
            },
            ocrResults
        };
    }

    function writePendingOnboardingImport(payload) {
        writeJsonStorage(PENDING_ONBOARDING_IMPORT_STORAGE_KEY, payload);
    }

    function readPendingOnboardingImport() {
        return readJsonStorage(PENDING_ONBOARDING_IMPORT_STORAGE_KEY);
    }

    function clearPendingOnboardingImport() {
        clearStorageKey(PENDING_ONBOARDING_IMPORT_STORAGE_KEY);
    }

    const api = {
        PENDING_ONBOARDING_IMPORT_STORAGE_KEY,
        normalizeHeaderKey,
        parseCsvRows,
        ensureExcelJsLoaded,
        ensureTesseractLoaded,
        readTabularRowsFromFile,
        detectClssQuarterKeyword,
        inferClssQuarterFromOcrPayload,
        readScreenshotTextImportFromFiles,
        buildClssPreviewRowsFromTabularRows,
        buildClssPreviewRowsFromScreenshotImport,
        writePendingOnboardingImport,
        readPendingOnboardingImport,
        clearPendingOnboardingImport
    };

    globalScope.ProgramCommandImport = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
