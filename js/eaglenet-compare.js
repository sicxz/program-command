(function (globalScope) {
    'use strict';

    const DEFAULT_FIELD_ALIASES = {
        academicYear: ['academicYear', 'academic_year', 'ay', 'year'],
        quarter: ['quarter', 'term', 'session', 'qtr'],
        subject: ['subject', 'dept', 'department'],
        catalogNumber: ['catalogNumber', 'catalog_number', 'courseNumber', 'course_number', 'number'],
        courseCode: ['courseCode', 'course_code', 'course', 'class', 'catalog'],
        section: ['section', 'sec', 'sectionNumber', 'section_number'],
        crn: ['crn', 'courseReferenceNumber'],
        title: ['title', 'courseTitle', 'course_title', 'classTitle', 'class_title'],
        instructor: ['instructor', 'faculty', 'assignedFaculty', 'assigned_faculty', 'teacher'],
        days: ['days', 'meetingDays', 'meeting_days'],
        startTime: ['startTime', 'start_time', 'beginTime', 'begin_time'],
        endTime: ['endTime', 'end_time', 'stopTime', 'stop_time'],
        time: ['time', 'meetingTime', 'meeting_time'],
        room: ['room', 'location', 'buildingRoom', 'building_room'],
        building: ['building'],
        credits: ['credits', 'creditHours', 'credit_hours'],
        modality: ['modality', 'deliveryMode', 'delivery_mode', 'instructionMode', 'instruction_mode'],
        campus: ['campus', 'site']
    };

    const QUARTER_ALIASES = new Map([
        ['fall', 'Fall'], ['fa', 'Fall'], ['autumn', 'Fall'],
        ['winter', 'Winter'], ['wi', 'Winter'], ['win', 'Winter'],
        ['spring', 'Spring'], ['sp', 'Spring'], ['spr', 'Spring'],
        ['summer', 'Summer'], ['su', 'Summer'], ['sum', 'Summer']
    ]);

    const PLACEHOLDER_INSTRUCTORS = new Set(['', 'TBD', 'STAFF', 'STAFF/OTHER', 'TBA']);
    const DEFAULT_COMPARE_FIELDS = [
        'credits',
        'instructorKey',
        'days',
        'timeRange',
        'roomKey',
        'modalityKey',
        'campusKey',
        'titleKey'
    ];

    function pickField(row, aliases) {
        const source = row || {};
        for (const key of aliases || []) {
            if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null && source[key] !== '') {
                return source[key];
            }
        }
        return '';
    }

    function normalizeWhitespace(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeAcademicYear(value) {
        const raw = normalizeWhitespace(value);
        if (!raw) return '';
        const match = raw.match(/(\d{4})\D+(\d{2,4})/);
        if (!match) return raw;
        const start = Number(match[1]);
        let end = String(match[2]);
        if (end.length === 4) {
            end = end.slice(-2);
        } else if (end.length === 2) {
            end = end.padStart(2, '0');
        }
        return `${start}-${end}`;
    }

    function normalizeQuarter(value) {
        const raw = normalizeWhitespace(value).toLowerCase();
        if (!raw) return '';
        const compact = raw.replace(/[^a-z]/g, '');
        if (QUARTER_ALIASES.has(compact)) return QUARTER_ALIASES.get(compact);
        const word = compact.match(/fall|autumn|winter|spring|summer/);
        if (word && QUARTER_ALIASES.has(word[0])) return QUARTER_ALIASES.get(word[0]);
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    function normalizeCourseCode(courseCode, subject, catalogNumber) {
        const combined = normalizeWhitespace(courseCode);
        if (combined) {
            const match = combined.toUpperCase().match(/([A-Z]{2,6})\s*[- ]?\s*([0-9]{2,4}[A-Z]?)/);
            if (match) return `${match[1]} ${match[2]}`;
            return combined.toUpperCase();
        }

        const subj = normalizeWhitespace(subject).toUpperCase();
        const num = normalizeWhitespace(catalogNumber).toUpperCase();
        if (subj && num) return `${subj} ${num}`;
        return (subj || num || '').trim();
    }

    function normalizeSection(value) {
        const raw = normalizeWhitespace(value).toUpperCase();
        if (!raw) return '';
        const match = raw.match(/^0*([0-9]{1,3})([A-Z]?)$/);
        if (!match) return raw;
        return `${match[1].padStart(3, '0')}${match[2] || ''}`;
    }

    function normalizeRoom(room, building) {
        const roomValue = normalizeWhitespace(room);
        const buildingValue = normalizeWhitespace(building);
        const combined = roomValue || buildingValue ? `${buildingValue} ${roomValue}` : '';
        const raw = normalizeWhitespace(combined || roomValue || buildingValue).toUpperCase();
        if (!raw) return { display: '', key: '' };
        const key = raw
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return { display: key, key };
    }

    function normalizeTitle(value) {
        const display = normalizeWhitespace(value);
        const key = display.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        return { display, key };
    }

    function normalizeModality(value) {
        const raw = normalizeWhitespace(value).toLowerCase();
        if (!raw) return { display: '', key: '' };
        let key = raw.replace(/[^a-z0-9]+/g, '');
        if (/(online|web|asynch|async)/.test(key)) key = 'online';
        else if (/(hybrid|hyflex)/.test(key)) key = 'hybrid';
        else if (/(inperson|campus|face2face|f2f)/.test(key)) key = 'inperson';
        return { display: normalizeWhitespace(value), key };
    }

    function normalizeCampus(value) {
        const display = normalizeWhitespace(value);
        const key = display.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        return { display, key };
    }

    function normalizeCredits(value) {
        const n = Number(value);
        return Number.isFinite(n) ? Number(n.toFixed(3)) : null;
    }

    function normalizeDays(value) {
        let raw = normalizeWhitespace(value).toUpperCase();
        if (!raw) return '';
        raw = raw
            .replace(/THURSDAY|THURS|THU/g, ' R ')
            .replace(/TH/g, ' R ')
            .replace(/TUESDAY|TUES|TUE|TU/g, ' T ')
            .replace(/MONDAY|MON|MO/g, ' M ')
            .replace(/WEDNESDAY|WED/g, ' W ')
            .replace(/FRIDAY|FRI/g, ' F ')
            .replace(/SATURDAY|SAT|SA/g, ' S ')
            .replace(/SUNDAY|SUN|SU/g, ' U ')
            .replace(/[,&+/.-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!raw) return '';

        const compact = raw.replace(/\s+/g, '');
        const letters = compact.split('').filter((char) => 'MTWRFSU'.includes(char));
        if (!letters.length) return compact;

        const seen = new Set();
        const ordered = [];
        const order = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
        letters.forEach((char) => {
            if (!seen.has(char)) {
                seen.add(char);
                ordered.push(char);
            }
        });

        ordered.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        return ordered.join('');
    }

    function parseClockToMinutes(value) {
        const raw = normalizeWhitespace(value).toUpperCase().replace(/\./g, '');
        if (!raw) return null;

        if (/^\d{3,4}$/.test(raw)) {
            const padded = raw.length === 3 ? `0${raw}` : raw;
            const hours = Number(padded.slice(0, 2));
            const minutes = Number(padded.slice(2, 4));
            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                return hours * 60 + minutes;
            }
        }

        const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)?$/);
        if (!match) return null;
        let hours = Number(match[1]);
        const minutes = Number(match[2] || 0);
        const meridian = match[3] || '';
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;

        if (meridian) {
            if (hours < 1 || hours > 12) return null;
            if (hours === 12) hours = 0;
            if (meridian === 'PM') hours += 12;
        } else if (hours > 23) {
            return null;
        }

        return hours * 60 + minutes;
    }

    function formatMinutes(minutes) {
        if (!Number.isFinite(minutes)) return '';
        const total = Math.max(0, Math.round(minutes));
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    function normalizeTimeRange(startTime, endTime, combinedTime) {
        const combined = normalizeWhitespace(combinedTime);
        let start = normalizeWhitespace(startTime);
        let end = normalizeWhitespace(endTime);

        if ((!start || !end) && combined) {
            const parts = combined.split(/\s*(?:-|–|—|to)\s*/i);
            if (parts.length >= 2) {
                start = start || parts[0];
                end = end || parts[1];
            }
        }

        const startMinutes = parseClockToMinutes(start);
        const endMinutes = parseClockToMinutes(end);

        if (startMinutes != null && endMinutes != null) {
            return `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)}`;
        }
        if (combined) {
            return combined
                .toUpperCase()
                .replace(/\s+/g, ' ')
                .replace(/\s*[-–—]\s*/g, '-')
                .trim();
        }
        return '';
    }

    function normalizeInstructorName(value) {
        const displayRaw = normalizeWhitespace(value);
        const upper = displayRaw.toUpperCase();
        if (PLACEHOLDER_INSTRUCTORS.has(upper)) {
            return { display: displayRaw || 'TBD', key: 'TBD' };
        }
        if (!displayRaw) return { display: '', key: '' };

        const cleaned = displayRaw
            .replace(/\b(PROF|PROFESSOR|DR|MR|MS|MRS)\.?\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        let first = '';
        let last = '';

        if (cleaned.includes(',')) {
            const [lastPart, firstPart] = cleaned.split(',').map((part) => normalizeWhitespace(part));
            last = lastPart || '';
            first = (firstPart || '').split(/\s+/)[0] || '';
        } else {
            const parts = cleaned.split(/\s+/).filter(Boolean);
            if (parts.length === 1) {
                last = parts[0];
            } else {
                first = parts[0];
                last = parts[parts.length - 1];
            }
        }

        const firstNorm = normalizeWhitespace(first).replace(/[^A-Za-z]/g, '');
        const lastNorm = normalizeWhitespace(last).replace(/[^A-Za-z]/g, '');
        const firstInitial = firstNorm ? firstNorm.charAt(0).toUpperCase() : '';
        const key = [lastNorm.toUpperCase(), firstInitial].filter(Boolean).join('|') || upper;
        const display = normalizeWhitespace(`${firstNorm} ${lastNorm}`) || cleaned;

        return { display, key };
    }

    function buildComparisonKey(normalized) {
        const year = normalized.academicYear || '';
        const quarter = normalized.quarter || '';
        const courseCode = normalized.courseCode || '';
        const section = normalized.section || '';
        const crn = normalized.crn || '';
        const campus = normalized.campusKey || '';

        let identity = '';
        if (courseCode && section) {
            identity = `${courseCode}|${section}`;
        } else if (crn) {
            identity = `CRN|${crn}`;
        } else if (courseCode) {
            identity = `${courseCode}|NOSEC`;
        } else {
            identity = `${normalized.titleKey || 'UNTITLED'}|${normalized.timeRange || 'NOTIME'}`;
        }

        return [year, quarter, identity, campus].join('|');
    }

    function createNormalizedScheduleRecord(row, index, options = {}) {
        const aliases = { ...DEFAULT_FIELD_ALIASES, ...(options.fieldAliases || {}) };

        const academicYear = normalizeAcademicYear(pickField(row, aliases.academicYear));
        const quarter = normalizeQuarter(pickField(row, aliases.quarter));
        const subject = pickField(row, aliases.subject);
        const catalogNumber = pickField(row, aliases.catalogNumber);
        const courseCode = normalizeCourseCode(pickField(row, aliases.courseCode), subject, catalogNumber);
        const section = normalizeSection(pickField(row, aliases.section));
        const crn = normalizeWhitespace(pickField(row, aliases.crn));
        const title = normalizeTitle(pickField(row, aliases.title));
        const instructor = normalizeInstructorName(pickField(row, aliases.instructor));
        const days = normalizeDays(pickField(row, aliases.days));
        const timeRange = normalizeTimeRange(
            pickField(row, aliases.startTime),
            pickField(row, aliases.endTime),
            pickField(row, aliases.time)
        );
        const room = normalizeRoom(pickField(row, aliases.room), pickField(row, aliases.building));
        const credits = normalizeCredits(pickField(row, aliases.credits));
        const modality = normalizeModality(pickField(row, aliases.modality));
        const campus = normalizeCampus(pickField(row, aliases.campus));

        const normalized = {
            academicYear,
            quarter,
            courseCode,
            section,
            crn,
            title: title.display,
            titleKey: title.key,
            instructor: instructor.display,
            instructorKey: instructor.key,
            days,
            timeRange,
            room: room.display,
            roomKey: room.key,
            credits,
            modality: modality.display,
            modalityKey: modality.key,
            campus: campus.display,
            campusKey: campus.key
        };

        const comparisonKey = buildComparisonKey(normalized);
        const duplicateSortKey = [
            normalized.instructorKey,
            normalized.days,
            normalized.timeRange,
            normalized.roomKey,
            normalized.modalityKey,
            normalized.credits == null ? '' : String(normalized.credits),
            normalized.titleKey
        ].join('|');

        return {
            index,
            source: options.source || 'unknown',
            raw: row,
            normalized,
            comparisonKey,
            duplicateSortKey,
            matchKey: '',
            duplicateIndex: 0,
            duplicateCount: 1
        };
    }

    function normalizeScheduleDataset(rows, options = {}) {
        const records = (Array.isArray(rows) ? rows : []).map((row, index) => createNormalizedScheduleRecord(row, index, options));
        const buckets = new Map();
        records.forEach((record) => {
            if (!buckets.has(record.comparisonKey)) buckets.set(record.comparisonKey, []);
            buckets.get(record.comparisonKey).push(record);
        });

        const normalizedRecords = [];
        Array.from(buckets.keys()).sort().forEach((key) => {
            const bucket = buckets.get(key) || [];
            bucket.sort((a, b) => {
                if (a.duplicateSortKey !== b.duplicateSortKey) {
                    return a.duplicateSortKey.localeCompare(b.duplicateSortKey, undefined, { sensitivity: 'base' });
                }
                return a.index - b.index;
            });
            const duplicateCount = bucket.length;
            bucket.forEach((record, idx) => {
                record.duplicateCount = duplicateCount;
                record.duplicateIndex = idx + 1;
                record.matchKey = duplicateCount > 1 ? `${record.comparisonKey}::${idx + 1}` : record.comparisonKey;
                normalizedRecords.push(record);
            });
        });

        const byMatchKey = new Map(normalizedRecords.map((record) => [record.matchKey, record]));
        return {
            source: options.source || 'unknown',
            rows: normalizedRecords,
            byMatchKey
        };
    }

    function getRecordLabel(record) {
        const n = record.normalized || {};
        const primary = [n.quarter, n.courseCode, n.section].filter(Boolean).join(' ');
        if (primary) return primary;
        return record.matchKey || `row-${record.index}`;
    }

    function diffNormalizedSchedules(leftInput, rightInput, options = {}) {
        const leftDataset = Array.isArray(leftInput) ? normalizeScheduleDataset(leftInput, { ...options.leftOptions, source: options.leftSource || 'left' }) : leftInput;
        const rightDataset = Array.isArray(rightInput) ? normalizeScheduleDataset(rightInput, { ...options.rightOptions, source: options.rightSource || 'right' }) : rightInput;
        const compareFields = Array.isArray(options.compareFields) && options.compareFields.length
            ? options.compareFields.slice()
            : DEFAULT_COMPARE_FIELDS.slice();

        const allKeys = Array.from(new Set([
            ...Array.from(leftDataset.byMatchKey.keys()),
            ...Array.from(rightDataset.byMatchKey.keys())
        ])).sort();

        const missingInRight = [];
        const extraInRight = [];
        const fieldMismatches = [];
        let matchedCount = 0;

        allKeys.forEach((key) => {
            const leftRecord = leftDataset.byMatchKey.get(key) || null;
            const rightRecord = rightDataset.byMatchKey.get(key) || null;

            if (leftRecord && !rightRecord) {
                missingInRight.push({
                    matchKey: key,
                    label: getRecordLabel(leftRecord),
                    side: 'left',
                    record: leftRecord
                });
                return;
            }
            if (!leftRecord && rightRecord) {
                extraInRight.push({
                    matchKey: key,
                    label: getRecordLabel(rightRecord),
                    side: 'right',
                    record: rightRecord
                });
                return;
            }
            if (!leftRecord || !rightRecord) return;

            matchedCount += 1;
            const mismatches = [];
            compareFields.forEach((field) => {
                const leftValue = leftRecord.normalized[field];
                const rightValue = rightRecord.normalized[field];
                const leftComparable = leftValue == null ? '' : String(leftValue);
                const rightComparable = rightValue == null ? '' : String(rightValue);
                if (leftComparable === rightComparable) return;
                mismatches.push({
                    field,
                    left: leftValue,
                    right: rightValue,
                    leftRaw: leftRecord.raw,
                    rightRaw: rightRecord.raw
                });
            });

            if (mismatches.length > 0) {
                fieldMismatches.push({
                    matchKey: key,
                    label: getRecordLabel(leftRecord),
                    leftRecord,
                    rightRecord,
                    mismatches
                });
            }
        });

        return {
            leftSource: leftDataset.source,
            rightSource: rightDataset.source,
            summary: {
                leftRows: leftDataset.rows.length,
                rightRows: rightDataset.rows.length,
                compared: matchedCount,
                exactMatches: matchedCount - fieldMismatches.length,
                fieldMismatchRows: fieldMismatches.length,
                missingInRight: missingInRight.length,
                extraInRight: extraInRight.length,
                totalDifferences: missingInRight.length + extraInRight.length + fieldMismatches.length
            },
            compareFields,
            missingInRight,
            extraInRight,
            fieldMismatches,
            normalizedLeft: leftDataset,
            normalizedRight: rightDataset
        };
    }

    function summarizeDiff(diff) {
        if (!diff || !diff.summary) return 'No diff summary available.';
        const s = diff.summary;
        return [
            `leftRows=${s.leftRows}`,
            `rightRows=${s.rightRows}`,
            `compared=${s.compared}`,
            `exact=${s.exactMatches}`,
            `mismatchRows=${s.fieldMismatchRows}`,
            `missingInRight=${s.missingInRight}`,
            `extraInRight=${s.extraInRight}`
        ].join(' ');
    }

    const EagleNetCompare = {
        DEFAULT_FIELD_ALIASES,
        DEFAULT_COMPARE_FIELDS,
        normalizeAcademicYear,
        normalizeQuarter,
        normalizeCourseCode,
        normalizeSection,
        normalizeDays,
        normalizeTimeRange,
        normalizeInstructorName,
        normalizeScheduleDataset,
        createNormalizedScheduleRecord,
        diffNormalizedSchedules,
        summarizeDiff
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EagleNetCompare;
    }
    if (globalScope) {
        globalScope.EagleNetCompare = EagleNetCompare;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
