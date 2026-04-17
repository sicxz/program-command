import fs from 'fs';
import path from 'path';

const DEFAULT_TARGETS = [
    'index.html',
    'js/supabase-config.js',
    'js/db-service.js',
    'js/department-profile.js',
    'js/profile-loader.js',
    'js/schedule-manager.js',
    'pages/schedule-builder.js',
    'pages/workload-dashboard.js',
    'pages/department-onboarding.js',
    'pages/constraints-dashboard.js',
    'pages/release-time-dashboard.js',
    'pages/login.js',
    'pages/recommendations-dashboard.html',
    'pages/course-optimizer-dashboard.html'
];

const DESIGN_DEFAULT_PATTERN = /\bDESN\b|\bDesign\b|design-v1|programCommandActiveDepartmentProfileId/;
const FALLBACK_PATTERN = /\bfallback\b|hardcoded|embedded default|using local|using fallback|keep hardcoded/i;
const LOCAL_STORAGE_PATTERN = /\blocalStorage\b/;
const STATIC_DATA_PATTERN = /fetch\s*\([^)]*['"`]([^'"`]+\.(?:json|csv|md))['"`][^)]*\)/i;

function resolveTargetPath(targetPath) {
    return path.resolve(process.cwd(), targetPath);
}

function makeMatch(lineNumber, snippet, detail = null) {
    return {
        line: lineNumber,
        snippet: String(snippet || '').trim(),
        detail
    };
}

function scanFileContents(text) {
    const results = {
        localJsonFetches: [],
        localStorageUsages: [],
        fallbackMarkers: [],
        designDefaults: []
    };

    const lines = String(text || '').split(/\r?\n/);

    lines.forEach((line, index) => {
        const lineNumber = index + 1;

        if (LOCAL_STORAGE_PATTERN.test(line)) {
            results.localStorageUsages.push(makeMatch(lineNumber, line));
        }

        if (FALLBACK_PATTERN.test(line)) {
            results.fallbackMarkers.push(makeMatch(lineNumber, line));
        }

        if (DESIGN_DEFAULT_PATTERN.test(line)) {
            results.designDefaults.push(makeMatch(lineNumber, line));
        }

        const staticDataMatch = line.match(STATIC_DATA_PATTERN);
        if (staticDataMatch) {
            const assetPath = staticDataMatch[1];
            if (!/^https?:\/\//i.test(assetPath)) {
                results.localJsonFetches.push(makeMatch(lineNumber, line, assetPath));
            }
        }
    });

    return results;
}

function countMatches(fileResult) {
    return Object.values(fileResult.matches).reduce((sum, entries) => sum + entries.length, 0);
}

function buildSummary(fileResults, failures) {
    const summary = {
        filesScanned: fileResults.length,
        filesWithMatches: 0,
        failures: failures.length,
        counts: {
            localJsonFetches: 0,
            localStorageUsages: 0,
            fallbackMarkers: 0,
            designDefaults: 0
        }
    };

    fileResults.forEach((fileResult) => {
        const fileMatchCount = countMatches(fileResult);
        if (fileMatchCount > 0) {
            summary.filesWithMatches += 1;
        }

        Object.keys(summary.counts).forEach((category) => {
            summary.counts[category] += fileResult.matches[category].length;
        });
    });

    return summary;
}

function scanTargets(targets) {
    const fileResults = [];
    const failures = [];

    targets.forEach((targetPath) => {
        const absolutePath = resolveTargetPath(targetPath);

        try {
            const text = fs.readFileSync(absolutePath, 'utf8');
            fileResults.push({
                path: targetPath,
                matches: scanFileContents(text)
            });
        } catch (error) {
            failures.push({
                path: targetPath,
                code: error.code || 'UNKNOWN',
                message: error.message
            });
        }
    });

    return {
        generatedAt: new Date().toISOString(),
        targetsUsed: targets,
        files: fileResults,
        failures,
        summary: buildSummary(fileResults, failures)
    };
}

const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_TARGETS;
const report = scanTargets(targets);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
