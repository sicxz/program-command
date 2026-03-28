(function schedulerFormUtilsRuntime(globalScope) {
    'use strict';

    const WEEKDAY_ORDER = Object.freeze(['M', 'T', 'W', 'R', 'F', 'S', 'U']);

    function normalizeLookupKey(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/[^A-Z0-9:-]/g, '');
    }

    function normalizeWeekdayToken(value) {
        const token = String(value || '').trim().toUpperCase();
        if (token === 'TH') return 'R';
        return token;
    }

    function formatMinutesToClock(totalMinutes) {
        if (!Number.isFinite(totalMinutes)) return '';
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    function getDayPatternByAlias(dayPatterns, value) {
        const lookup = normalizeLookupKey(value);
        if (!lookup) return null;
        return (Array.isArray(dayPatterns) ? dayPatterns : []).find((pattern) => {
            const aliases = [pattern?.id, ...(Array.isArray(pattern?.aliases) ? pattern.aliases : [])];
            return aliases.some((alias) => normalizeLookupKey(alias) === lookup);
        }) || null;
    }

    function buildDayPatternId(selectedValues, dayPatterns) {
        const tokens = [...new Set(
            (Array.isArray(selectedValues) ? selectedValues : [])
                .map(normalizeWeekdayToken)
                .filter((token) => WEEKDAY_ORDER.includes(token))
        )];
        if (!tokens.length) return '';

        const combined = WEEKDAY_ORDER.filter((token) => tokens.includes(token)).join('');
        const match = getDayPatternByAlias(dayPatterns, combined);
        return match ? match.id : combined;
    }

    function getTimeSlotByAlias(timeSlots, value) {
        const lookup = normalizeLookupKey(value);
        if (!lookup) return null;
        return (Array.isArray(timeSlots) ? timeSlots : []).find((slot) => {
            const aliases = [slot?.id, ...(Array.isArray(slot?.aliases) ? slot.aliases : [])];
            return aliases.some((alias) => normalizeLookupKey(alias) === lookup);
        }) || null;
    }

    function getTimeSlotIdFromInputs(startValue, endValue, timeSlots) {
        const start = String(startValue || '').trim();
        const end = String(endValue || '').trim();
        if (!start || !end) return '';

        const combined = `${start}-${end}`;
        const match = getTimeSlotByAlias(timeSlots, combined);
        return match ? match.id : combined;
    }

    function getTimeSlotRangeForId(timeSlots, slotId) {
        const match = getTimeSlotByAlias(timeSlots, slotId);
        if (!match) return { start: '', end: '' };

        return {
            start: formatMinutesToClock(match.startMinutes),
            end: formatMinutesToClock(match.endMinutes)
        };
    }

    function buildRoomOptions(roomCodes, roomLabels, options = {}) {
        const {
            includeBlank = false,
            blankLabel = 'Select Room...',
            includeOnline = false,
            includeArranged = false,
            preserveValue = ''
        } = options;

        const list = [];
        const seen = new Set();

        function append(value, label) {
            const normalizedValue = String(value || '').trim();
            if (seen.has(normalizedValue)) return;
            seen.add(normalizedValue);
            list.push({
                value: normalizedValue,
                label: String(label || normalizedValue).trim() || normalizedValue
            });
        }

        if (includeBlank) append('', blankLabel);
        if (includeOnline) append('ONLINE', 'Online / Async');
        if (includeArranged) append('ARRANGED', 'Arranged');

        (Array.isArray(roomCodes) ? roomCodes : []).forEach((roomCode) => {
            const code = String(roomCode || '').trim();
            if (!code) return;
            append(code, roomLabels?.[code] || code);
        });

        const preserved = String(preserveValue || '').trim();
        if (preserved && !seen.has(preserved)) {
            append(preserved, roomLabels?.[preserved] || preserved);
        }

        return list;
    }

    const api = {
        normalizeWeekdayToken,
        buildDayPatternId,
        getDayPatternByAlias,
        getTimeSlotByAlias,
        getTimeSlotIdFromInputs,
        getTimeSlotRangeForId,
        buildRoomOptions
    };

    globalScope.SchedulerFormUtils = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
