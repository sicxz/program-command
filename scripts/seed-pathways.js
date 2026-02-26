/**
 * EWU Design Schedule Analyzer - Seed Pathways Script
 * 
 * Migrates local hardcoded student tracks and minors into the new Supabase
 * 'pathways' and 'pathway_courses' tables.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. UPDATE THESE CREDENTIALS
// We'll extract these from the migrate-to-supabase.js file to ensure we use the correct keys
const SUPABASE_URL = 'https://ohnrhjxcjkrdtudpzjgn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9obnJoanhjamtyZHR1ZHB6amduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDQ2NzAsImV4cCI6MjA4MDUyMDY3MH0.XN1CC0xC5dizIhF4cIEkv90TApJHXRBYTC7a6AXPvtU'; // I will replace this before running using sed

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

import { minors, studentTracks } from '../js/data-models.js';

async function seedPathways() {
    console.log('🌱 Starting Pathways Database Migration...');

    // 1. Get the Design Department ID
    const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id')
        .eq('code', 'DESN')
        .single();

    if (deptError || !deptData) {
        console.error('❌ Could not find Design department. Did you run the schema script?');
        return;
    }
    const departmentId = deptData.id;

    // 2. Fetch all courses to get their UUIDs for the join table
    const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('id, code');

    if (coursesError || !coursesData) {
        console.error('❌ Could not fetch courses pipeline.');
        return;
    }

    const courseMap = new Map();
    coursesData.forEach(c => courseMap.set(c.code, c.id));

    // Helper to insert a pathway and its courses
    async function insertPathway(key, data, type) {
        const payload = {
            department_id: departmentId,
            name: type === 'minor' ? data.name : data.name || key,
            type: type,
            color: data.color || '#3498db',
            typical: data.typical !== undefined ? data.typical : true,
            notes: data.note || null
        };

        // Insert Pathway
        const { data: pathwayRes, error: pathwayErr } = await supabase
            .from('pathways')
            .insert(payload)
            .select()
            .single();

        if (pathwayErr) {
            console.error(`❌ Failed to insert ${type}: ${key}`, pathwayErr);
            return null;
        }

        console.log(`✅ Inserted ${type}: ${payload.name}`);
        const pathwayId = pathwayRes.id;

        // Insert Join Records (For Minors only currently, as Tracks rely on minor groupings)
        if (type === 'minor' && data.courses && Array.isArray(data.courses)) {
            const joinRecords = [];
            for (const courseCode of data.courses) {
                const normalizedCode = courseCode.toUpperCase().trim();
                const courseId = courseMap.get(normalizedCode);

                if (courseId) {
                    joinRecords.push({
                        pathway_id: pathwayId,
                        course_id: courseId
                    });
                } else {
                    console.warn(`   ⚠️ Warning: Course ${normalizedCode} not found in DB for minor ${key}`);
                }
            }

            if (joinRecords.length > 0) {
                const { error: joinErr } = await supabase
                    .from('pathway_courses')
                    .insert(joinRecords);

                if (joinErr) {
                    console.error(`   ❌ Failed to insert courses for ${key}`, joinErr);
                } else {
                    console.log(`   └─ Linked ${joinRecords.length} courses.`);
                }
            }
        }

        return pathwayId;
    }

    console.log('\n--- Migrating Minors ---');
    for (const [key, minor] of Object.entries(minors)) {
        await insertPathway(key, minor, 'minor');
    }

    console.log('\n--- Migrating Tracks ---');
    for (const [key, track] of Object.entries(studentTracks)) {
        await insertPathway(key, track, 'track');
    }

    console.log('\n🎉 Pathway Migration Complete!');
}

seedPathways().catch(console.error);
