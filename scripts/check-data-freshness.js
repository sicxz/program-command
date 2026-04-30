#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TABLE_CONFIG = [
  { table: 'academic_years', scope: 'department', timestampColumn: 'created_at' },
  { table: 'rooms', scope: 'department', timestampColumn: 'created_at' },
  { table: 'courses', scope: 'department', timestampColumn: 'created_at', fingerprint: 'courses' },
  { table: 'faculty', scope: 'department', timestampColumn: 'created_at' },
  { table: 'scheduling_constraints', scope: 'department', timestampColumn: 'created_at' },
  { table: 'scheduled_courses', scope: 'academic_year', timestampColumn: 'updated_at', fingerprint: 'scheduled_courses' },
  { table: 'release_time', scope: 'academic_year', timestampColumn: 'created_at' }
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function envOrArg(args, argKey, envKey, fallback = '') {
  const fromArg = args[argKey];
  if (typeof fromArg === 'string' && fromArg.trim()) return fromArg.trim();
  const fromEnv = process.env[envKey];
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return fallback;
}

function usage() {
  console.log(`\nUsage: node scripts/check-data-freshness.js [options]\n\nRequired (live mode):\n  --prod-url <url>             or PROD_SUPABASE_URL\n  --prod-key <key>             or PROD_SUPABASE_KEY\n  --dev-url <url>              or DEV_SUPABASE_URL\n  --dev-key <key>              or DEV_SUPABASE_KEY\n\nOptional:\n  --department <code>          Default: DESN\n  --year <YYYY-YY>             Default: active year in each environment\n  --prod-label <name>          Default: production\n  --dev-label <name>           Default: dev\n  --prod-snapshot <file.json>  Load production snapshot from file instead of live query\n  --dev-snapshot <file.json>   Load dev snapshot from file instead of live query\n  --output <file.json>         Write full comparison JSON\n\nExamples:\n  PROD_SUPABASE_URL=... PROD_SUPABASE_KEY=... DEV_SUPABASE_URL=... DEV_SUPABASE_KEY=... \\\n  node scripts/check-data-freshness.js --department DESN --year 2026-27\n\n  node scripts/check-data-freshness.js \\\n    --prod-snapshot output/prod.json --dev-snapshot output/dev.json\n`);
}

function fail(message, code = 1) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(code);
}

function withScopeFilter(query, scope, scopeIds) {
  if (scope === 'department') {
    return query.eq('department_id', scopeIds.departmentId);
  }
  if (scope === 'academic_year') {
    return query.eq('academic_year_id', scopeIds.academicYearId);
  }
  return query;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function pickEmbeddedRow(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function hashContent(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function fetchCourseFingerprint(client, scopeIds) {
  const { data, error } = await client
    .from('courses')
    .select('code,title,default_credits,typical_cap,level')
    .eq('department_id', scopeIds.departmentId)
    .order('code');

  if (error) throw new Error(`courses fingerprint failed: ${error.message}`);

  const rows = (data || []).map((row) => ({
    code: normalizeText(row.code).toUpperCase(),
    title: normalizeText(row.title),
    defaultCredits: Number(row.default_credits) || 0,
    typicalCap: Number(row.typical_cap) || 0,
    level: normalizeNullableText(row.level)
  }));

  return {
    contentHash: hashContent(rows),
    contentRows: rows.length
  };
}

async function fetchScheduledCoursesFingerprint(client, scopeIds) {
  const { data, error } = await client
    .from('scheduled_courses')
    .select(`
      quarter,
      day_pattern,
      time_slot,
      section,
      projected_enrollment,
      course:courses(code,title,default_credits),
      faculty:faculty(name),
      room:rooms(room_code)
    `)
    .eq('academic_year_id', scopeIds.academicYearId)
    .order('quarter')
    .order('day_pattern')
    .order('time_slot')
    .order('section');

  if (error) throw new Error(`scheduled_courses fingerprint failed: ${error.message}`);

  const rows = (data || []).map((row) => {
    const course = pickEmbeddedRow(row.course);
    const faculty = pickEmbeddedRow(row.faculty);
    const room = pickEmbeddedRow(row.room);

    return {
      quarter: normalizeText(row.quarter).toLowerCase(),
      dayPattern: normalizeNullableText(row.day_pattern),
      timeSlot: normalizeNullableText(row.time_slot),
      section: normalizeNullableText(row.section),
      projectedEnrollment: Number(row.projected_enrollment) || 0,
      courseCode: normalizeText(course?.code).toUpperCase(),
      courseTitle: normalizeText(course?.title),
      courseCredits: Number(course?.default_credits) || 0,
      facultyName: normalizeNullableText(faculty?.name),
      roomCode: normalizeNullableText(room?.room_code)
    };
  });

  return {
    contentHash: hashContent(rows),
    contentRows: rows.length
  };
}

async function fetchContentFingerprint(client, config, scopeIds) {
  if (config.fingerprint === 'courses') {
    return fetchCourseFingerprint(client, scopeIds);
  }
  if (config.fingerprint === 'scheduled_courses') {
    return fetchScheduledCoursesFingerprint(client, scopeIds);
  }
  return {};
}

async function getDepartment(client, departmentCode) {
  const result = await client
    .from('departments')
    .select('id,code,name,created_at')
    .eq('code', departmentCode)
    .maybeSingle();
  if (result.error) throw new Error(`departments lookup failed: ${result.error.message}`);
  if (!result.data) throw new Error(`department ${departmentCode} not found`);
  return result.data;
}

async function resolveAcademicYear(client, departmentId, explicitYear = '') {
  let query = client
    .from('academic_years')
    .select('id,year,is_active,created_at')
    .eq('department_id', departmentId);

  if (explicitYear) {
    const result = await query.eq('year', explicitYear).maybeSingle();
    if (result.error) throw new Error(`academic_year ${explicitYear} lookup failed: ${result.error.message}`);
    if (!result.data) throw new Error(`academic_year ${explicitYear} not found for department`);
    return result.data;
  }

  const active = await query.eq('is_active', true).order('created_at', { ascending: false }).limit(1);
  if (!active.error && Array.isArray(active.data) && active.data.length > 0) {
    return active.data[0];
  }

  const latest = await client
    .from('academic_years')
    .select('id,year,is_active,created_at')
    .eq('department_id', departmentId)
    .order('year', { ascending: false })
    .limit(1);
  if (latest.error) throw new Error(`academic_year fallback lookup failed: ${latest.error.message}`);
  if (!Array.isArray(latest.data) || latest.data.length === 0) throw new Error('no academic_year records found');
  return latest.data[0];
}

async function fetchTableDigest(client, config, scopeIds) {
  let countQuery = client
    .from(config.table)
    .select('id', { count: 'exact', head: true });
  countQuery = withScopeFilter(countQuery, config.scope, scopeIds);
  const countResult = await countQuery;
  if (countResult.error) throw new Error(`${config.table} count failed: ${countResult.error.message}`);

  let latestChangeAt = null;
  if (config.timestampColumn) {
    let latestQuery = client
      .from(config.table)
      .select(config.timestampColumn)
      .not(config.timestampColumn, 'is', null)
      .order(config.timestampColumn, { ascending: false })
      .limit(1);
    latestQuery = withScopeFilter(latestQuery, config.scope, scopeIds);
    const latestResult = await latestQuery;
    if (!latestResult.error && Array.isArray(latestResult.data) && latestResult.data.length > 0) {
      latestChangeAt = latestResult.data[0][config.timestampColumn] || null;
    }
  }

  const fingerprint = config.fingerprint
    ? await fetchContentFingerprint(client, config, scopeIds)
    : {};

  return {
    count: Number(countResult.count) || 0,
    latestChangeAt,
    timestampColumn: config.timestampColumn || null,
    ...fingerprint
  };
}

async function fetchEnvironmentSnapshot({ label, url, key, departmentCode, explicitYear }) {
  const client = createClient(url, key);
  const department = await getDepartment(client, departmentCode);
  const academicYear = await resolveAcademicYear(client, department.id, explicitYear);

  const tables = {};
  for (const tableConfig of TABLE_CONFIG) {
    tables[tableConfig.table] = await fetchTableDigest(client, tableConfig, {
      departmentId: department.id,
      academicYearId: academicYear.id
    });
  }

  const checksumSeed = JSON.stringify({
    departmentCode,
    year: academicYear.year,
    tables
  });
  const checksum = crypto.createHash('sha256').update(checksumSeed).digest('hex');

  return {
    label,
    generatedAt: new Date().toISOString(),
    department: {
      code: department.code,
      id: department.id,
      name: department.name
    },
    academicYear: {
      id: academicYear.id,
      year: academicYear.year,
      isActive: Boolean(academicYear.is_active)
    },
    tables,
    checksum
  };
}

function parseDate(value) {
  const d = value ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

function compareSnapshots(prod, dev) {
  const allTables = [...new Set([
    ...Object.keys(prod.tables || {}),
    ...Object.keys(dev.tables || {})
  ])].sort();

  const rows = allTables.map((table) => {
    const p = prod.tables?.[table] || { count: 0, latestChangeAt: null };
    const d = dev.tables?.[table] || { count: 0, latestChangeAt: null };
    const prodDate = parseDate(p.latestChangeAt);
    const devDate = parseDate(d.latestChangeAt);
    const countDelta = (d.count || 0) - (p.count || 0);

    let freshness = 'in-sync';
    if ((p.count || 0) !== (d.count || 0)) {
      freshness = countDelta > 0 ? 'dev-has-more' : 'prod-has-more';
    } else if (p.contentHash && d.contentHash && p.contentHash !== d.contentHash) {
      freshness = 'content-diff';
    } else if ((p.latestChangeAt || '') !== (d.latestChangeAt || '')) {
      if (prodDate && devDate) {
        freshness = prodDate > devDate ? 'prod-newer' : 'dev-newer';
      } else {
        freshness = 'timestamp-diff';
      }
    }

    const inSync = freshness === 'in-sync';
    return {
      table,
      production: p,
      dev: d,
      countDelta,
      contentMatch: p.contentHash && d.contentHash ? p.contentHash === d.contentHash : null,
      freshness,
      inSync
    };
  });

  const driftTables = rows.filter((row) => !row.inSync);
  return {
    generatedAt: new Date().toISOString(),
    departmentCode: prod.department?.code || dev.department?.code || '',
    production: {
      label: prod.label,
      academicYear: prod.academicYear,
      checksum: prod.checksum
    },
    dev: {
      label: dev.label,
      academicYear: dev.academicYear,
      checksum: dev.checksum
    },
    summary: {
      totalTables: rows.length,
      driftTables: driftTables.length,
      inSync: driftTables.length === 0
    },
    rows
  };
}

function fmtDate(value) {
  if (!value) return '—';
  const d = parseDate(value);
  return d ? d.toISOString().replace('T', ' ').replace('Z', ' UTC') : String(value);
}

function printComparison(comparison, prodLabel, devLabel) {
  console.log('\n=== Supabase Data Freshness Check ===');
  console.log(`Department: ${comparison.departmentCode}`);
  console.log(`Production (${prodLabel}) year: ${comparison.production.academicYear?.year || '—'}`);
  console.log(`Dev (${devLabel}) year: ${comparison.dev.academicYear?.year || '—'}`);
  console.log('');

  const header = [
    'Table'.padEnd(24),
    `${prodLabel} count`.padStart(12),
    `${devLabel} count`.padStart(12),
    'Content'.padStart(10),
    'Freshness'.padStart(14),
    `${prodLabel} latest`.padStart(24),
    `${devLabel} latest`.padStart(24)
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  comparison.rows.forEach((row) => {
    const line = [
      row.table.padEnd(24),
      String(row.production.count ?? 0).padStart(12),
      String(row.dev.count ?? 0).padStart(12),
      (row.contentMatch === null ? '-' : row.contentMatch ? 'match' : 'diff').padStart(10),
      row.freshness.padStart(14),
      fmtDate(row.production.latestChangeAt).padStart(24),
      fmtDate(row.dev.latestChangeAt).padStart(24)
    ].join(' | ');
    console.log(line);
  });

  console.log('\nSummary:');
  if (comparison.summary.inSync) {
    console.log('  ✅ Dev and production snapshots are in sync for tracked tables.');
  } else {
    console.log(`  ⚠️  Drift detected in ${comparison.summary.driftTables}/${comparison.summary.totalTables} tables.`);
    console.log('  Tables needing carry-over review:');
    comparison.rows
      .filter((row) => !row.inSync)
      .forEach((row) => console.log(`   - ${row.table}: ${row.freshness}`));
  }
}

function readSnapshotFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

function writeJsonFile(filePath, value) {
  const resolved = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const departmentCode = envOrArg(args, 'department', 'DEPARTMENT_CODE', 'DESN');
  const explicitYear = envOrArg(args, 'year', 'ACADEMIC_YEAR', '');
  const prodLabel = envOrArg(args, 'prod-label', 'PROD_LABEL', 'production');
  const devLabel = envOrArg(args, 'dev-label', 'DEV_LABEL', 'dev');

  let prodSnapshot;
  let devSnapshot;

  if (args['prod-snapshot']) {
    prodSnapshot = readSnapshotFile(args['prod-snapshot']);
  } else {
    const prodUrl = envOrArg(args, 'prod-url', 'PROD_SUPABASE_URL');
    const prodKey = envOrArg(args, 'prod-key', 'PROD_SUPABASE_KEY');
    if (!prodUrl || !prodKey) fail('Missing production credentials (--prod-url/--prod-key or PROD_SUPABASE_URL/PROD_SUPABASE_KEY).');
    prodSnapshot = await fetchEnvironmentSnapshot({
      label: prodLabel,
      url: prodUrl,
      key: prodKey,
      departmentCode,
      explicitYear
    });
  }

  if (args['dev-snapshot']) {
    devSnapshot = readSnapshotFile(args['dev-snapshot']);
  } else {
    const devUrl = envOrArg(args, 'dev-url', 'DEV_SUPABASE_URL');
    const devKey = envOrArg(args, 'dev-key', 'DEV_SUPABASE_KEY');
    if (!devUrl || !devKey) fail('Missing dev credentials (--dev-url/--dev-key or DEV_SUPABASE_URL/DEV_SUPABASE_KEY).');
    devSnapshot = await fetchEnvironmentSnapshot({
      label: devLabel,
      url: devUrl,
      key: devKey,
      departmentCode,
      explicitYear
    });
  }

  const comparison = compareSnapshots(prodSnapshot, devSnapshot);
  printComparison(comparison, prodLabel, devLabel);

  if (args.output) {
    writeJsonFile(args.output, comparison);
    console.log(`\nWrote report: ${path.resolve(process.cwd(), args.output)}`);
  }

  if (!comparison.summary.inSync) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
