#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_AUTH_KEY = process.env.SUPABASE_AUTH_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_CLEANUP_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_AUTH_KEY;
const TARGET_DEPARTMENT_CODE = (process.env.SUPABASE_DEPARTMENT_CODE || 'DESN').trim();

const checks = [];

function logPass(name, detail = '') {
    checks.push({ name, status: 'PASS', detail });
}

function logFail(name, detail = '') {
    checks.push({ name, status: 'FAIL', detail });
}

function printSummary() {
    console.log('\nSupabase RLS Smoke Check Results');
    console.log('--------------------------------');
    checks.forEach((check) => {
        const icon = check.status === 'PASS' ? 'PASS' : 'FAIL';
        const detail = check.detail ? ` - ${check.detail}` : '';
        console.log(`${icon} ${check.name}${detail}`);
    });

    const failures = checks.filter((check) => check.status === 'FAIL').length;
    if (failures === 0) {
        console.log('\nResult: PASS');
    } else {
        console.log(`\nResult: FAIL (${failures} failing checks)`);
    }

    return failures;
}

function requireEnv(name, value) {
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
}

function createSupabaseClient(url, key) {
    return createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
}

function hasPermissionError(error) {
    if (!error) return false;
    const code = String(error.code || '').trim();
    const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    return (
        code === '42501' ||
        text.includes('permission denied') ||
        text.includes('row-level security') ||
        text.includes('violates row-level security')
    );
}

function makeSmokeYear() {
    // academic_years.year is VARCHAR(10) in schema
    const suffix = Date.now().toString().slice(-7);
    return `RLS${suffix}`;
}

async function main() {
    try {
        requireEnv('SUPABASE_URL', SUPABASE_URL);
        requireEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
        requireEnv('SUPABASE_AUTH_KEY or SUPABASE_SERVICE_ROLE_KEY', SUPABASE_AUTH_KEY);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    const anonClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const authorizedClient = createSupabaseClient(SUPABASE_URL, SUPABASE_AUTH_KEY);
    const cleanupClient = SUPABASE_CLEANUP_KEY
        ? createSupabaseClient(SUPABASE_URL, SUPABASE_CLEANUP_KEY)
        : authorizedClient;

    let departmentId = null;
    let insertedYearId = null;

    try {
        const { data: deptRow, error: deptError } = await anonClient
            .from('departments')
            .select('id, code')
            .eq('code', TARGET_DEPARTMENT_CODE)
            .maybeSingle();

        if (deptError || !deptRow?.id) {
            logFail('resolve target department', deptError?.message || `department ${TARGET_DEPARTMENT_CODE} not found`);
            const failures = printSummary();
            process.exit(failures > 0 ? 1 : 0);
        }

        departmentId = deptRow.id;
        logPass('resolve target department', `${TARGET_DEPARTMENT_CODE} -> ${departmentId}`);

        const smokeYear = makeSmokeYear();

        // Anonymous insert should fail.
        {
            const { error } = await anonClient
                .from('academic_years')
                .insert({ department_id: departmentId, year: smokeYear, is_active: false })
                .select('id')
                .maybeSingle();

            if (hasPermissionError(error)) {
                logPass('anon insert denied');
            } else {
                logFail('anon insert denied', error?.message || 'insert succeeded unexpectedly');
            }
        }

        // Authorized insert should succeed.
        {
            const { data, error } = await authorizedClient
                .from('academic_years')
                .insert({ department_id: departmentId, year: smokeYear, is_active: false })
                .select('id')
                .single();

            if (error || !data?.id) {
                logFail('authorized insert allowed', error?.message || 'no id returned');
            } else {
                insertedYearId = data.id;
                logPass('authorized insert allowed', `created id=${insertedYearId}`);
            }
        }

        if (!insertedYearId) {
            const failures = printSummary();
            process.exit(failures > 0 ? 1 : 0);
        }

        // Anonymous update should be denied (permission error or zero affected rows).
        {
            const { data, error } = await anonClient
                .from('academic_years')
                .update({ is_active: true })
                .eq('id', insertedYearId)
                .select('id');

            const updatedRows = Array.isArray(data) ? data.length : 0;
            if (hasPermissionError(error) || updatedRows === 0) {
                logPass('anon update denied');
            } else {
                logFail('anon update denied', 'row updated unexpectedly');
            }
        }

        // Authorized update should succeed.
        {
            const { data, error } = await authorizedClient
                .from('academic_years')
                .update({ is_active: true })
                .eq('id', insertedYearId)
                .select('id')
                .single();

            if (error || !data?.id) {
                logFail('authorized update allowed', error?.message || 'row not updated');
            } else {
                logPass('authorized update allowed');
            }
        }

        // Anonymous delete should be denied (permission error or zero affected rows).
        {
            const { data, error } = await anonClient
                .from('academic_years')
                .delete()
                .eq('id', insertedYearId)
                .select('id');

            const deletedRows = Array.isArray(data) ? data.length : 0;
            if (hasPermissionError(error) || deletedRows === 0) {
                logPass('anon delete denied');
            } else {
                logFail('anon delete denied', 'row deleted unexpectedly');
            }
        }

        // Authorized delete should succeed and cleanup the smoke row.
        {
            const { data, error } = await authorizedClient
                .from('academic_years')
                .delete()
                .eq('id', insertedYearId)
                .select('id')
                .single();

            if (error || !data?.id) {
                logFail('authorized delete allowed', error?.message || 'row not deleted');
            } else {
                logPass('authorized delete allowed');
                insertedYearId = null;
            }
        }

        const failures = printSummary();
        process.exit(failures > 0 ? 1 : 0);
    } finally {
        if (insertedYearId) {
            await cleanupClient
                .from('academic_years')
                .delete()
                .eq('id', insertedYearId);
        }
    }
}

main().catch((error) => {
    console.error('Smoke check failed unexpectedly:', error.message);
    process.exit(1);
});
