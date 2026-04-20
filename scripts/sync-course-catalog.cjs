#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(repoRoot, 'data', 'course-catalog.json');
const graphPath = path.join(repoRoot, 'data', 'prerequisite-graph.json');
const courseIndexPath = path.join(repoRoot, 'ewu-design-catalog', 'COURSE-INDEX.md');
const enrollmentCsvPath = path.join(repoRoot, 'enrollment-data', 'processed', 'corrected-all-quarters.csv');
const quarterOrder = ['Fall', 'Winter', 'Spring', 'Summer'];

const fallbackQuartersByCode = {
    'DESN 210': ['Fall', 'Winter', 'Spring'],
    'DESN 213': ['Fall', 'Winter', 'Spring'],
    'DESN 214': ['Fall', 'Winter', 'Spring'],
    'DESN 215': ['Fall', 'Winter', 'Spring'],
    'DESN 217': ['Fall', 'Winter', 'Spring'],
    'DESN 375': ['Fall', 'Winter', 'Spring'],
    'DESN 398': ['Fall', 'Winter', 'Spring'],
    'DESN 446': ['Spring'],
    'DESN 469': ['Fall'],
    'DESN 497': ['Fall', 'Winter', 'Spring'],
    'DESN 498': ['Fall', 'Winter', 'Spring']
};

const specialMetadataByCode = {
    'DESN 399': { isVariable: true, workloadMultiplier: 0.2, typicalEnrollmentCap: 5 },
    'DESN 491': { isVariable: true, workloadMultiplier: 0.2, typicalEnrollmentCap: 10 },
    'DESN 495': { isVariable: true, workloadMultiplier: 0.1, typicalEnrollmentCap: 15 },
    'DESN 499': { isVariable: true, workloadMultiplier: 0.2, typicalEnrollmentCap: 10 },
    'DESN 396': { isVariable: true },
    'DESN 398': { isVariable: true },
    'DESN 496': { isVariable: true },
    'DESN 497': { isVariable: true },
    'DESN 498': { isVariable: true }
};

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeCourseCode(code) {
    return String(code || '')
        .trim()
        .toUpperCase()
        .replace(/-/g, ' ');
}

function mergeNotes(...values) {
    const unique = [];
    const seen = new Set();

    values.flat().forEach((value) => {
        String(value || '')
            .split('|')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach((normalized) => {
                const key = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '');
                if (!normalized || seen.has(key)) return;
                seen.add(key);
                unique.push(normalized);
            });
    });

    return unique.join(' | ') || null;
}

function deriveLevelFromCode(code) {
    const match = String(code || '').match(/\b(\d)\d{2}\b/);
    return match ? `${match[1]}00` : '';
}

function parseCatalogIndex(markdown) {
    const byLevelSection = markdown.split('## By Track')[0];

    return byLevelSection
        .split(/\r?\n/)
        .map((line) => line.match(/^- \*\*(DESN-\d{3})\*\*\s+(.+?)(?:\s+\(([^)]*)\))?(?:\s+\*\[.*)?$/))
        .filter(Boolean)
        .map((match) => ({
            dashCode: match[1],
            code: normalizeCourseCode(match[1]),
            title: String(match[2] || '').trim(),
            metaText: String(match[3] || '').trim()
        }));
}

function buildHistoricalQuarterMap(csvText) {
    const quarterMap = new Map();
    const rows = csvText.trim().split(/\r?\n/).slice(1);

    rows.forEach((row) => {
        const columns = row.split(',');
        const quarter = String(columns[1] || '').trim();
        const code = normalizeCourseCode(columns[3] || '');

        if (!/^DESN \d{3}$/.test(code)) return;
        if (!['Fall', 'Winter', 'Spring', 'Summer'].includes(quarter)) return;

        if (!quarterMap.has(code)) {
            quarterMap.set(code, new Set());
        }

        quarterMap.get(code).add(quarter);
    });

    return quarterMap;
}

function orderQuarters(quarters = []) {
    return Array.from(new Set(quarters))
        .sort((left, right) => quarterOrder.indexOf(left) - quarterOrder.indexOf(right));
}

function parseCreditMetadata(metaText) {
    const meta = String(metaText || '').trim();
    if (!meta) {
        return { creditRange: null, exactCredits: null, derivedNotes: null };
    }

    const creditMatch = meta.match(/(\d+(?:-\d+)?)\s*cr/i);
    const creditRange = creditMatch ? creditMatch[1] : null;
    const exactCredits = creditRange && !creditRange.includes('-') ? Number(creditRange) : null;
    const notesText = creditMatch
        ? meta.replace(creditMatch[0], '').replace(/^[,\s]+|[,\s]+$/g, '')
        : meta;

    return {
        creditRange,
        exactCredits,
        derivedNotes: notesText || null
    };
}

function syncCourseCatalog() {
    const existingCatalog = readJson(catalogPath);
    const prerequisiteGraph = readJson(graphPath);
    const courseIndex = fs.readFileSync(courseIndexPath, 'utf8');
    const historicalQuarterMap = buildHistoricalQuarterMap(fs.readFileSync(enrollmentCsvPath, 'utf8'));

    const existingCourseMap = new Map(
        (existingCatalog.courses || []).map((course) => [normalizeCourseCode(course.code), course])
    );

    const canonicalCourses = parseCatalogIndex(courseIndex).map((courseEntry) => {
        const existingCourse = existingCourseMap.get(courseEntry.code) || {};
        const graphCourse = prerequisiteGraph.courses?.[courseEntry.dashCode] || {};
        const specialMetadata = specialMetadataByCode[courseEntry.code] || {};
        const creditMeta = parseCreditMetadata(courseEntry.metaText);
        const graphCredits = graphCourse.credits;
        const offeredQuarters = Array.isArray(existingCourse.offeredQuarters) && existingCourse.offeredQuarters.length > 0
            ? existingCourse.offeredQuarters.slice()
            : historicalQuarterMap.has(courseEntry.code)
                ? Array.from(historicalQuarterMap.get(courseEntry.code))
                : (fallbackQuartersByCode[courseEntry.code] || ['Fall', 'Winter', 'Spring']).slice();

        const catalogCourse = {
            code: courseEntry.code,
            title: courseEntry.title,
            defaultCredits: Number.isFinite(Number(graphCredits))
                ? Number(graphCredits)
                : Number.isFinite(creditMeta.exactCredits)
                    ? creditMeta.exactCredits
                    : Number(existingCourse.defaultCredits) || 5,
            typicalEnrollmentCap: Number(existingCourse.typicalEnrollmentCap)
                || Number(specialMetadata.typicalEnrollmentCap)
                || 24,
            level: String(graphCourse.level || existingCourse.level || deriveLevelFromCode(courseEntry.code)),
            offeredQuarters: orderQuarters(offeredQuarters)
        };

        const prerequisites = Array.isArray(graphCourse.prerequisites)
            ? graphCourse.prerequisites.map((value) => normalizeCourseCode(value))
            : Array.isArray(existingCourse.prerequisites)
                ? existingCourse.prerequisites.slice()
                : [];
        if (prerequisites.length > 0) {
            catalogCourse.prerequisites = prerequisites;
        }

        if (graphCourse.isRequired || existingCourse.required === true) {
            catalogCourse.required = true;
        }

        const standingRequired = String(graphCourse.standingRequired || existingCourse.standingRequired || '').trim();
        if (standingRequired) {
            catalogCourse.standingRequired = standingRequired;
        }

        if (existingCourse.defaultModality) {
            catalogCourse.defaultModality = existingCourse.defaultModality;
        }

        const mergedNotes = mergeNotes(graphCourse.notes, existingCourse.notes, creditMeta.derivedNotes);
        if (mergedNotes) {
            catalogCourse.notes = mergedNotes;
        }

        const effectiveCreditRange = String(graphCredits || creditMeta.creditRange || '');
        if (effectiveCreditRange.includes('-')) {
            catalogCourse.creditRange = effectiveCreditRange;
        }

        if (specialMetadata.isVariable || existingCourse.isVariable === true) {
            catalogCourse.isVariable = true;
        }

        const workloadMultiplier = Number(
            specialMetadata.workloadMultiplier ?? existingCourse.workloadMultiplier
        );
        if (Number.isFinite(workloadMultiplier) && workloadMultiplier > 0 && workloadMultiplier !== 1) {
            catalogCourse.workloadMultiplier = workloadMultiplier;
        }

        return catalogCourse;
    });

    const syncedCatalog = {
        version: existingCatalog.version || '1.0',
        lastModified: new Date().toISOString().slice(0, 10),
        department: existingCatalog.department || 'Design',
        courses: canonicalCourses
    };

    writeJson(catalogPath, syncedCatalog);

    console.log(`Synced ${canonicalCourses.length} courses into ${path.relative(repoRoot, catalogPath)}`);
}

syncCourseCatalog();
