/**
 * Supabase Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create a free account
 * 2. Create a new project (e.g., "ewu-schedule")
 * 3. Go to Project Settings > API
 * 4. Copy your Project URL and paste below
 * 5. Copy your anon/public key and paste below
 */

// Supabase project credentials
const SUPABASE_URL = 'https://ohnrhjxcjkrdtudpzjgn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9obnJoanhjamtyZHR1ZHB6amduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDQ2NzAsImV4cCI6MjA4MDUyMDY3MH0.XN1CC0xC5dizIhF4cIEkv90TApJHXRBYTC7a6AXPvtU';

// Current department code (for multi-department support)
const CURRENT_DEPARTMENT_CODE = 'DESN';
const CURRENT_DEPARTMENT_NAME = 'Design';

// Capture the CDN SDK namespace before legacy pages alias `supabase` to the client.
const supabaseSdkNamespace =
    (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function')
        ? window.supabase
        : null;

// Initialize Supabase client (only if credentials are configured)
let supabaseClient = null;
var supabase = null; // Global reference for legacy scripts.

function isSupabaseConfigured() {
    return SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' &&
           SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

function initSupabase() {
    if (supabaseClient) {
        return supabaseClient;
    }

    if (!isSupabaseConfigured()) {
        console.warn('Supabase not configured. Using local JSON files as fallback.');
        return null;
    }

    const supabaseLibrary =
        (supabaseSdkNamespace && typeof supabaseSdkNamespace.createClient === 'function')
            ? supabaseSdkNamespace
            : ((typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function')
                ? window.supabase
                : null);

    if (!supabaseLibrary) {
        console.error('Supabase JS library not loaded. Add the script tag before this file.');
        return null;
    }

    supabaseClient = supabaseLibrary.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabase = supabaseClient; // Set global reference
    if (typeof window !== 'undefined') {
        window.supabaseClient = supabaseClient;
        window.getSupabaseClient = getSupabaseClient;
        window.isSupabaseConfigured = isSupabaseConfigured;
        window.getActiveDepartmentIdentity = getActiveDepartmentIdentity;
        window.initSupabase = initSupabase;
    }
    console.log('Supabase client initialized successfully');
    return supabaseClient;
}

function getSupabaseClient() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

function getActiveDepartmentProfile() {
    if (typeof globalThis !== 'undefined' && globalThis.__PROGRAM_COMMAND_ACTIVE_PROFILE__) {
        return globalThis.__PROGRAM_COMMAND_ACTIVE_PROFILE__;
    }
    if (typeof window !== 'undefined' && window.activeDepartmentProfile) {
        return window.activeDepartmentProfile;
    }
    return null;
}

function getActiveDepartmentIdentity() {
    const identity = getActiveDepartmentProfile()?.identity || {};
    const code = String(identity.code || CURRENT_DEPARTMENT_CODE).trim().toUpperCase() || CURRENT_DEPARTMENT_CODE;
    const name = String(identity.name || identity.shortName || CURRENT_DEPARTMENT_NAME).trim() || CURRENT_DEPARTMENT_NAME;
    const displayName = String(identity.displayName || identity.name || `EWU ${name}`).trim() || `EWU ${name}`;

    return { code, name, displayName };
}

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});

if (typeof window !== 'undefined') {
    window.getSupabaseClient = getSupabaseClient;
    window.isSupabaseConfigured = isSupabaseConfigured;
    window.getActiveDepartmentIdentity = getActiveDepartmentIdentity;
    window.initSupabase = initSupabase;
}
