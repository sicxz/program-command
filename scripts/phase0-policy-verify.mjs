#!/usr/bin/env node
/**
 * Phase 0 / Path B verification.
 *
 * Reads:
 *   SUPABASE_DB_URL                (postgres connection, for admin steps)
 *   SUPABASE_SERVICE_ROLE_KEY      (service role, for admin user create/delete)
 *   SUPABASE_SMOKE_EMAIL / PASSWORD (a real editor account to sign in as)
 *
 * Anon key is read from js/supabase-config.js (it is public by design).
 *
 * Checks (each must PASS):
 *   1. anon read of public.courses returns rows (Public read policy unchanged)
 *   2. anon insert into academic_years is denied
 *   3. get_public_schedule RPC returns rows for 2026-27 (public surface healthy)
 *   4. authenticated-editor insert into academic_years is allowed (and cleaned up)
 *   5. authenticated-NON-editor insert into academic_years is denied
 *   6. authenticated-editor read of public.courses is allowed
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const SUPABASE_URL = 'https://ohnrhjxcjkrdtudpzjgn.supabase.co';

function readAnonKey() {
  const src = readFileSync(new URL('../js/supabase-config.js', import.meta.url), 'utf8');
  // production block, anonKey: 'eyJ...'
  const m = src.match(/projectRef:\s*'ohnrhjxcjkrdtudpzjgn'[\s\S]{0,400}?anonKey:\s*'([^']+)'/);
  if (!m) throw new Error('Could not extract production anon key from js/supabase-config.js');
  return m[1];
}

const results = [];
const fail = (name, detail) => results.push({ name, status: 'FAIL', detail });
const pass = (name, detail = '') => results.push({ name, status: 'PASS', detail });

function isRlsDenial(error) {
  if (!error) return false;
  const code = String(error.code || '').trim();
  const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return code === '42501' || text.includes('row-level security') || text.includes('permission denied') || text.includes('violates row-level security');
}

async function getDepartmentId(client) {
  const { data, error } = await client.from('departments').select('id, code').eq('code', 'DESN').maybeSingle();
  if (error || !data?.id) throw new Error('DESN department not found via anon read: ' + (error?.message || 'no row'));
  return data.id;
}

function sentinelYear(tag) {
  return `V${tag}${Date.now().toString().slice(-6)}`.slice(0, 10);
}

async function main() {
  const anonKey = readAnonKey();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const smokeEmail = process.env.SUPABASE_SMOKE_EMAIL;
  const smokePass  = process.env.SUPABASE_SMOKE_PASSWORD;
  if (!serviceKey || !smokeEmail || !smokePass) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SMOKE_EMAIL / SUPABASE_SMOKE_PASSWORD');
    process.exit(1);
  }

  const anon  = createClient(SUPABASE_URL, anonKey,    { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Confirm smoke account is on the editor allowlist via DB (postgres role bypasses RLS).
  const pgc = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await pgc.connect();
  const isEditorRow = await pgc.query('SELECT 1 FROM public.editors WHERE email = $1', [smokeEmail]);
  if (isEditorRow.rowCount === 0) {
    console.error(`SUPABASE_SMOKE_EMAIL (${smokeEmail}) is not in public.editors — cannot run editor-write check.`);
    await pgc.end();
    process.exit(1);
  }

  let departmentId, throwawayUserId, editorInsertedId, nonEditorInsertedId;
  try {
    // 1) anon read
    {
      const { data, error } = await anon.from('courses').select('id').limit(1);
      if (error) fail('anon read courses', error.message);
      else if (!Array.isArray(data) || data.length === 0) fail('anon read courses', 'returned no rows');
      else pass('anon read courses');
    }

    departmentId = await getDepartmentId(anon);

    // 2) anon insert denied
    {
      const y = sentinelYear('A');
      const { data, error } = await anon.from('academic_years')
        .insert({ department_id: departmentId, year: y, is_active: false })
        .select('id').maybeSingle();
      if (isRlsDenial(error)) pass('anon insert denied');
      else {
        if (data?.id) nonEditorInsertedId = data.id; // shouldn't happen but track for cleanup
        fail('anon insert denied', error?.message || 'insert unexpectedly succeeded');
      }
    }

    // 3) public-schedule RPC
    {
      const { data, error } = await anon.rpc('get_public_schedule', { p_academic_year: '2026-27' });
      if (error) fail('get_public_schedule rpc', error.message);
      else if (!Array.isArray(data) || data.length === 0) fail('get_public_schedule rpc', 'returned 0 rows for 2026-27');
      else pass('get_public_schedule rpc', `${data.length} rows`);
    }

    // 4 & 6) authenticated editor
    const editor = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    {
      const { error: signErr } = await editor.auth.signInWithPassword({ email: smokeEmail, password: smokePass });
      if (signErr) {
        fail('editor signIn', signErr.message);
      } else {
        pass('editor signIn', smokeEmail);

        // 6) editor can still read
        const { data: rdata, error: rerr } = await editor.from('courses').select('id').limit(1);
        if (rerr) fail('editor read courses', rerr.message);
        else if (!rdata?.length) fail('editor read courses', '0 rows');
        else pass('editor read courses');

        // 4) editor insert allowed
        const y = sentinelYear('E');
        const { data, error } = await editor.from('academic_years')
          .insert({ department_id: departmentId, year: y, is_active: false })
          .select('id').single();
        if (error || !data?.id) fail('editor insert allowed', error?.message || 'no id returned');
        else { editorInsertedId = data.id; pass('editor insert allowed', `created id=${editorInsertedId}`); }
      }
      await editor.auth.signOut().catch(() => {});
    }

    // 5) authenticated non-editor (created on the fly, NOT seeded into editors)
    const tempEmail = `phase0-verify-${Date.now()}@example.invalid`;
    const tempPass  = `Pv-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: tempEmail, password: tempPass, email_confirm: true
    });
    if (createErr) {
      fail('non-editor user create', createErr.message);
    } else {
      throwawayUserId = created.user.id;
      const ne = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: signErr } = await ne.auth.signInWithPassword({ email: tempEmail, password: tempPass });
      if (signErr) {
        fail('non-editor signIn', signErr.message);
      } else {
        const y = sentinelYear('N');
        const { data, error } = await ne.from('academic_years')
          .insert({ department_id: departmentId, year: y, is_active: false })
          .select('id').maybeSingle();
        if (isRlsDenial(error)) pass('non-editor insert denied');
        else {
          if (data?.id) nonEditorInsertedId = data.id;
          fail('non-editor insert denied', error?.message || 'insert unexpectedly succeeded');
        }
      }
      await ne.auth.signOut().catch(() => {});
    }
  } finally {
    // Cleanup: DB-level via postgres role (bypasses RLS).
    if (editorInsertedId)    await pgc.query('DELETE FROM public.academic_years WHERE id = $1', [editorInsertedId]).catch(() => {});
    if (nonEditorInsertedId) await pgc.query('DELETE FROM public.academic_years WHERE id = $1', [nonEditorInsertedId]).catch(() => {});
    if (throwawayUserId)     await admin.auth.admin.deleteUser(throwawayUserId).catch(() => {});
    await pgc.end();
  }

  console.log('\nPhase 0 / Path B verification');
  console.log('-----------------------------');
  for (const r of results) console.log(`${r.status === 'PASS' ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  const failures = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nResult: ${failures === 0 ? 'PASS' : `FAIL (${failures} failing)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Verification crashed:', e.message); process.exit(1); });
