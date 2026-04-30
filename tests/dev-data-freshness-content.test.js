const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function writeSnapshot(dir, name, tableDigest) {
    const filePath = path.join(dir, name);
    const snapshot = {
        label: name.replace('.json', ''),
        generatedAt: '2026-04-30T00:00:00.000Z',
        department: { code: 'DESN', id: 'dept-1', name: 'Design' },
        academicYear: { id: 'ay-1', year: '2026-27', isActive: true },
        checksum: name,
        tables: {
            courses: tableDigest
        }
    };
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    return filePath;
}

describe('dev data freshness content comparison', () => {
    test('flags content drift when counts and timestamps still match', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-freshness-'));
        const prodSnapshot = writeSnapshot(dir, 'prod.json', {
            count: 44,
            latestChangeAt: '2026-04-01T00:00:00.000Z',
            timestampColumn: 'created_at',
            contentHash: 'prod-course-title-hash',
            contentRows: 44
        });
        const devSnapshot = writeSnapshot(dir, 'dev.json', {
            count: 44,
            latestChangeAt: '2026-04-01T00:00:00.000Z',
            timestampColumn: 'created_at',
            contentHash: 'dev-course-title-hash',
            contentRows: 44
        });
        const reportPath = path.join(dir, 'report.json');

        const result = spawnSync(process.execPath, [
            'scripts/check-data-freshness.js',
            '--prod-snapshot',
            prodSnapshot,
            '--dev-snapshot',
            devSnapshot,
            '--output',
            reportPath
        ], {
            cwd: path.resolve(__dirname, '..'),
            encoding: 'utf8'
        });

        expect(result.status).toBe(2);
        expect(result.stdout).toContain('content-diff');
        expect(result.stdout).toContain('diff');

        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0]).toMatchObject({
            table: 'courses',
            freshness: 'content-diff',
            contentMatch: false,
            inSync: false
        });
    });
});
