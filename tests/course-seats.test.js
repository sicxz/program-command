const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const seatsPath = path.join(root, 'data', 'course-seats-by-quarter.json');

test('seats per course per quarter come from the corrected enrollment CSV', () => {
    const seats = JSON.parse(fs.readFileSync(seatsPath, 'utf8'));
    expect(seats.generatedFrom).toBe('enrollment-data/processed/corrected-all-quarters.csv');
    expect(seats.courses['DESN 100']['fall-2025']).toEqual({ seats: 48, sections: 2 });
    expect(seats.courses['DESN 338']['fall-2025']).toMatchObject({ seats: 22 });
    expect(seats.courses['DESN 100']).toHaveProperty('winter-2023');
    expect(seats.courses['DESN 100']).toHaveProperty('fall-2022');
});

test('the script reproduces the committed seats file byte for byte', () => {
    const committed = fs.readFileSync(seatsPath);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'course-seats-'));
    fs.mkdirSync(path.join(scratch, 'scripts'));
    fs.mkdirSync(path.join(scratch, 'data'));
    fs.mkdirSync(path.join(scratch, 'enrollment-data', 'processed'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'build-course-seats.cjs'), path.join(scratch, 'scripts', 'build-course-seats.cjs'));
    fs.copyFileSync(path.join(root, 'enrollment-data', 'processed', 'corrected-all-quarters.csv'),
        path.join(scratch, 'enrollment-data', 'processed', 'corrected-all-quarters.csv'));
    execFileSync(process.execPath, [path.join(scratch, 'scripts', 'build-course-seats.cjs')], { stdio: 'pipe' });
    expect(fs.readFileSync(path.join(scratch, 'data', 'course-seats-by-quarter.json')).equals(committed)).toBe(true);
    fs.rmSync(scratch, { recursive: true, force: true });
});
