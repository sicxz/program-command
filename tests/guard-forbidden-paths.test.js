const { findForbidden, FORBIDDEN_RULES } = require('../scripts/check-forbidden-paths.cjs');

describe('forbidden-path guard', () => {
  test('flags any file under .github/workflows/, including newly created ones', () => {
    expect(findForbidden(['.github/workflows/deploy-pages.yml'])).toHaveLength(1);
    // The "add a new auto-deploy workflow" bypass must also be caught.
    expect(findForbidden(['.github/workflows/sneaky-autodeploy.yml'])).toHaveLength(1);
  });

  test('flags ci.yml wherever it lives', () => {
    expect(findForbidden(['.github/workflows/ci.yml'])).toHaveLength(1);
    expect(findForbidden(['ci.yml'])).toHaveLength(1);
  });

  test('flags the Supabase config', () => {
    expect(findForbidden(['js/supabase-config.js'])).toHaveLength(1);
  });

  test('flags env files', () => {
    expect(findForbidden(['.env'])).toHaveLength(1);
    expect(findForbidden(['.env.production'])).toHaveLength(1);
    expect(findForbidden(['.env.local'])).toHaveLength(1);
  });

  test('flags Supabase policy / SQL files', () => {
    expect(findForbidden(['scripts/phase0-policy-hardening.sql'])).toHaveLength(1);
    expect(findForbidden(['scripts/supabase-public-schedule-read.sql'])).toHaveLength(1);
  });

  test('allows ordinary application code and docs', () => {
    expect(
      findForbidden([
        'js/db-service.js',
        'pages/schedule-builder.js',
        'docs/ORIENT.html',
        'css/docs.css',
        'README.md',
      ])
    ).toEqual([]);
  });

  test('normalizes a leading ./ so it cannot be used to evade matching', () => {
    expect(findForbidden(['./js/supabase-config.js'])).toHaveLength(1);
    expect(findForbidden(['./.github/workflows/ci.yml'])).toHaveLength(1);
  });

  test('reports the matched rule name for each offender', () => {
    const hits = findForbidden(['js/supabase-config.js', '.env']);
    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      expect(typeof hit.path).toBe('string');
      expect(typeof hit.rule).toBe('string');
      expect(hit.rule.length).toBeGreaterThan(0);
    }
  });

  test('ignores blank lines and whitespace in the changed-file list', () => {
    expect(findForbidden(['', '   ', 'js/db-service.js'])).toEqual([]);
  });

  test('exposes the rule set for documentation/inspection', () => {
    expect(Array.isArray(FORBIDDEN_RULES)).toBe(true);
    expect(FORBIDDEN_RULES.length).toBeGreaterThan(0);
  });
});
