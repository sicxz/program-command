(function eecsDepartmentCatalogRuntime(globalScope) {
    'use strict';

    const DEFAULT_CATALOG_PATH = '../data/eecs-department-catalog.json';

    const state = {
        loaded: false,
        loadingPromise: null,
        source: 'unloaded',
        catalog: null,
        warnings: [],
        errors: []
    };

    function deepClone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeTermLabel(value) {
        return normalizeText(value)
            .replace(/\bQuarter\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function termSortKey(value) {
        const normalized = normalizeTermLabel(value);
        const match = normalized.match(/^(Fall|Winter|Spring)\s+(\d{4})$/i);
        if (!match) return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
        const seasonOrder = {
            Fall: 0,
            Winter: 1,
            Spring: 2
        };
        const season = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        return [Number(match[2]), seasonOrder[season] ?? Number.POSITIVE_INFINITY];
    }

    function normalizeInventoryEntry(entry) {
        if (!isObject(entry)) return null;
        const campus = normalizeText(entry.campus);
        const building = normalizeText(entry.building);
        const room = normalizeText(entry.room);
        const count = Number(entry.count);

        return {
            campus,
            building,
            room,
            count: Number.isFinite(count) && count > 0 ? count : 0
        };
    }

    function inventoryEntryKey(entry) {
        return [
            normalizeText(entry?.campus),
            normalizeText(entry?.building),
            normalizeText(entry?.room)
        ].join(' :: ');
    }

    function normalizeProgram(program) {
        if (!isObject(program)) return null;

        const code = normalizeText(program.code).toUpperCase();
        const subjectDescription = normalizeText(program.subjectDescription || program.displayName || program.name);
        const displayName = normalizeText(program.displayName || subjectDescription || code);
        const aliases = Array.isArray(program.aliases)
            ? [...new Set(program.aliases.map(normalizeText).filter(Boolean))]
            : [];
        const terms = Array.isArray(program.terms)
            ? [...new Set(program.terms.map(normalizeTermLabel).filter(Boolean))]
            : [];
        const roomMap = new Map();

        (Array.isArray(program.roomInventory) ? program.roomInventory : [])
            .map(normalizeInventoryEntry)
            .filter(Boolean)
            .forEach((entry) => {
                const key = inventoryEntryKey(entry);
                if (!key.trim()) return;
                const existing = roomMap.get(key);
                if (existing) {
                    existing.count += entry.count;
                    return;
                }
                roomMap.set(key, entry);
            });

        return {
            code,
            subjectDescription,
            displayName,
            aliases,
            terms,
            sourceFiles: Array.isArray(program.sourceFiles)
                ? [...new Set(program.sourceFiles.map(normalizeText).filter(Boolean))]
                : [],
            roomInventory: [...roomMap.values()]
        };
    }

    function normalizeCatalog(rawCatalog) {
        const raw = isObject(rawCatalog) ? rawCatalog : {};
        const department = isObject(raw.department) ? raw.department : {};
        const programs = [];
        const programMap = new Map();

        (Array.isArray(raw.programs) ? raw.programs : [])
            .map(normalizeProgram)
            .filter(Boolean)
            .forEach((program) => {
                if (!program.code) return;
                programMap.set(program.code, program);
            });

        [...programMap.values()].sort((left, right) => left.code.localeCompare(right.code)).forEach((program) => {
            programs.push(program);
        });

        const terms = [...new Set((Array.isArray(raw.terms) ? raw.terms : []).map(normalizeTermLabel).filter(Boolean))]
            .sort((left, right) => {
                const [leftYear, leftSeason] = termSortKey(left);
                const [rightYear, rightSeason] = termSortKey(right);
                if (leftYear !== rightYear) return leftYear - rightYear;
                if (leftSeason !== rightSeason) return leftSeason - rightSeason;
                return left.localeCompare(right);
            });

        const inventoryCount = programs.reduce((sum, program) => sum + program.roomInventory.length, 0);

        return {
            version: normalizeText(raw.version) || '1.0',
            sourceType: normalizeText(raw.sourceType) || 'EagleNET classroom view with enrollments',
            sourceFolder: normalizeText(raw.sourceFolder) || null,
            department: {
                code: normalizeText(department.code || raw.departmentCode).toUpperCase() || 'EECS',
                name: normalizeText(department.name || raw.departmentName || department.displayName || raw.departmentDisplayName || 'EECS'),
                displayName: normalizeText(department.displayName || raw.departmentDisplayName || department.name || raw.departmentName || 'EECS'),
                aliases: Array.isArray(department.aliases)
                    ? [...new Set(department.aliases.map(normalizeText).filter(Boolean))]
                    : []
            },
            terms,
            programs,
            summary: {
                programCount: programs.length,
                termCount: terms.length,
                roomInventoryCount: inventoryCount
            }
        };
    }

    async function fetchJson(path) {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}` };
            }
            return { ok: true, value: await response.json() };
        } catch (error) {
            return { ok: false, error: error?.message || 'fetch failed' };
        }
    }

    async function load(path = DEFAULT_CATALOG_PATH, options = {}) {
        const config = isObject(options) ? options : {};
        const forceReload = Boolean(config.forceReload);
        const requestedPath = normalizeText(path) || DEFAULT_CATALOG_PATH;

        if (!forceReload && state.loaded && state.source === requestedPath) {
            return getSnapshot();
        }

        if (!forceReload && state.loadingPromise) {
            return state.loadingPromise;
        }

        state.loadingPromise = (async () => {
            const warnings = [];
            const errors = [];
            const response = await fetchJson(requestedPath);

            if (!response.ok) {
                warnings.push(`Could not load EECS catalog at ${requestedPath} (${response.error || 'unknown error'}).`);
                state.catalog = normalizeCatalog(null);
                state.source = 'fallback';
                state.warnings = warnings;
                state.errors = errors;
                state.loaded = true;
                return getSnapshot();
            }

            const catalog = normalizeCatalog(response.value);
            state.catalog = catalog;
            state.source = requestedPath;
            state.warnings = warnings;
            state.errors = errors;
            state.loaded = true;
            return getSnapshot();
        })();

        try {
            return await state.loadingPromise;
        } finally {
            state.loadingPromise = null;
        }
    }

    function getSnapshot() {
        return {
            loaded: state.loaded,
            source: state.source,
            catalog: deepClone(state.catalog),
            warnings: state.warnings.slice(),
            errors: state.errors.slice()
        };
    }

    function getCatalog() {
        return deepClone(state.catalog);
    }

    function getDepartment() {
        return deepClone(state.catalog?.department || null);
    }

    function getPrograms() {
        return deepClone(state.catalog?.programs || []);
    }

    function getProgram(programId) {
        const normalizedId = normalizeText(programId).toUpperCase();
        if (!normalizedId || !state.catalog) return null;
        const programs = Array.isArray(state.catalog.programs) ? state.catalog.programs : [];
        return deepClone(programs.find((program) => {
            if (normalizeText(program.code).toUpperCase() === normalizedId) return true;
            const aliases = Array.isArray(program.aliases) ? program.aliases : [];
            return aliases.some((alias) => normalizeText(alias).toUpperCase() === normalizedId);
        }) || null);
    }

    function getProgramRoomInventory(programId) {
        const program = getProgram(programId);
        return Array.isArray(program?.roomInventory) ? program.roomInventory : [];
    }

    function getDepartmentSummary() {
        const catalog = state.catalog || normalizeCatalog(null);
        return {
            department: deepClone(catalog.department),
            terms: catalog.terms.slice(),
            summary: deepClone(catalog.summary),
            programs: (catalog.programs || []).map((program) => ({
                code: program.code,
                displayName: program.displayName,
                subjectDescription: program.subjectDescription,
                aliases: program.aliases.slice(),
                terms: program.terms.slice(),
                roomInventoryCount: Array.isArray(program.roomInventory) ? program.roomInventory.length : 0,
                sourceFiles: program.sourceFiles.slice()
            }))
        };
    }

    function formatRoomInventoryEntry(entry) {
        if (!isObject(entry)) return '';
        const pieces = [entry.campus, entry.building, entry.room].map(normalizeText).filter(Boolean);
        const label = pieces.join(' / ') || 'Unspecified location';
        const count = Number(entry.count) || 0;
        return count > 0 ? `${label} (${count})` : label;
    }

    const api = {
        DEFAULT_CATALOG_PATH,
        load,
        getSnapshot,
        getCatalog,
        getDepartment,
        getPrograms,
        getProgram,
        getProgramRoomInventory,
        getDepartmentSummary,
        formatRoomInventoryEntry
    };

    if (globalScope) {
        globalScope.EECSDepartmentCatalog = api;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
