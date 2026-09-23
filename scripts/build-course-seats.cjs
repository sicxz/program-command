#!/usr/bin/env node

// Seats offered per course per quarter, for the fill-rate trend comparison.
// Output keys match enrollment-dashboard-data.json courseStats[code].quarterly
// ('fall-2025', 'winter-2026'): the season plus the calendar year the term falls in.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const csvRelative = 'enrollment-data/processed/corrected-all-quarters.csv';
const csvPath = path.join(repoRoot, csvRelative);
const outPath = path.join(repoRoot, 'data', 'course-seats-by-quarter.json');
const seasonOrder = ['winter', 'spring', 'summer', 'fall'];

function quarterKey(academicYear, quarter) {
    const match = /^(\d{4})-\d{2}$/.exec(academicYear);
    const season = String(quarter).trim().toLowerCase();
    if (!match || !seasonOrder.includes(season)) {
        throw new Error(`Unrecognized term: ${academicYear} ${quarter}`);
    }
    const startYear = Number(match[1]);
    return `${season}-${season === 'fall' ? startYear : startYear + 1}`;
}

function keyOrder(key) {
    const [season, year] = key.split('-');
    return Number(year) * 4 + seasonOrder.indexOf(season);
}

function build() {
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(line => line.trim());
    const header = lines.shift().split(',');
    const column = name => {
        const index = header.indexOf(name);
        if (index < 0) throw new Error(`Missing column ${name} in ${csvRelative}`);
        return index;
    };
    const cols = {
        year: column('AcademicYear'), quarter: column('Quarter'),
        code: column('CourseCode'), capacity: column('Capacity')
    };
    const totals = {};
    lines.forEach(line => {
        const cells = line.split(',');
        const code = cells[cols.code].trim();
        const capacity = Number(cells[cols.capacity]);
        if (!/^DESN \d{3}$/.test(code) || !Number.isInteger(capacity) || capacity < 0) {
            throw new Error(`Bad row in ${csvRelative}: ${line}`);
        }
        const key = quarterKey(cells[cols.year].trim(), cells[cols.quarter]);
        const course = totals[code] || (totals[code] = {});
        const term = course[key] || (course[key] = { seats: 0, sections: 0 });
        term.seats += capacity;
        term.sections += 1;
    });
    const courses = {};
    Object.keys(totals).sort().forEach(code => {
        courses[code] = {};
        Object.keys(totals[code]).sort((a, b) => keyOrder(a) - keyOrder(b))
            .forEach(key => { courses[code][key] = totals[code][key]; });
    });
    return { generatedFrom: csvRelative, courses };
}

fs.writeFileSync(outPath, JSON.stringify(build(), null, 2) + '\n');
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
