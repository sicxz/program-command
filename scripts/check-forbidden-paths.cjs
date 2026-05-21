#!/usr/bin/env node
'use strict';

/**
 * Forbidden-path guard (Forward Operating Model plan, Unit 5).
 *
 * Fails when a pull request adds or modifies a "safety" file that agents
 * must never touch. The override is human-applied (a PR label surfaced to
 * the CLI as ALLOW_FORBIDDEN_PATHS) — an agent cannot self-clear the gate.
 *
 * Logic lives here (not inline in YAML) so it is unit-testable:
 * see tests/guard-forbidden-paths.test.js.
 *
 * CLI usage:
 *   node scripts/check-forbidden-paths.cjs <changed-file> [<changed-file> ...]
 *   ALLOW_FORBIDDEN_PATHS=true node scripts/check-forbidden-paths.cjs <files...>
 */

const FORBIDDEN_RULES = [
  {
    name: '.github/workflows/** (incl. new files)',
    test: (p) => p.startsWith('.github/workflows/'),
  },
  {
    name: 'ci.yml',
    test: (p) => p === 'ci.yml' || p.endsWith('/ci.yml'),
  },
  {
    name: 'js/supabase-config.js',
    test: (p) => p === 'js/supabase-config.js',
  },
  {
    name: '.env*',
    test: (p) => /(^|\/)\.env(\..+)?$/.test(p),
  },
  {
    name: 'Supabase policy / SQL',
    test: (p) => p.endsWith('.sql'),
  },
];

function normalize(p) {
  return String(p).trim().replace(/^\.\//, '');
}

function findForbidden(paths) {
  const hits = [];
  for (const raw of paths) {
    const path = normalize(raw);
    if (!path) continue;
    const rule = FORBIDDEN_RULES.find((r) => r.test(path));
    if (rule) hits.push({ path, rule: rule.name });
  }
  return hits;
}

function isOverridden() {
  const v = String(process.env.ALLOW_FORBIDDEN_PATHS || '').toLowerCase();
  return v === 'true' || v === '1';
}

module.exports = { findForbidden, FORBIDDEN_RULES };

if (require.main === module) {
  const files = process.argv.slice(2);
  const hits = findForbidden(files);

  if (hits.length === 0) {
    console.log('guard-forbidden-paths: OK — no safety files touched.');
    process.exit(0);
  }

  console.log('guard-forbidden-paths: this PR touches protected safety files:');
  for (const hit of hits) {
    console.log(`  - ${hit.path}  (rule: ${hit.rule})`);
  }

  if (isOverridden()) {
    console.log(
      '\nguard-forbidden-paths: human override label present — allowing.'
    );
    process.exit(0);
  }

  console.error(
    '\nguard-forbidden-paths: FAILED. These paths are off-limits to autopilot.\n' +
      'A human must review and apply the "allow-forbidden-paths" label to merge.'
  );
  process.exit(1);
}
