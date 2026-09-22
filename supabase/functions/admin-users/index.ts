import { createClient } from 'npm:@supabase/supabase-js@2';
import './handler.js';

const DEFAULT_ALLOWED_ORIGINS = [
    'https://sicxz.github.io',
    'http://127.0.0.1:8080',
    'http://localhost:8080'
];
const configuredOrigins = Deno.env.get('ALLOWED_ORIGINS');
const allowedOrigins = configuredOrigins
    ? configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
const inviteRedirectUrl = Deno.env.get('INVITE_REDIRECT_URL')
    ?? 'https://sicxz.github.io/program-command/login.html';
const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

type AdminUsersGlobal = typeof globalThis & {
    AdminUsersHandler: {
        handle: (request: Request, deps: Record<string, unknown>) => Promise<Response>;
    };
};

Deno.serve((request) => (globalThis as AdminUsersGlobal).AdminUsersHandler.handle(request, {
    adminClient,
    getCaller: async (token: string) => {
        const { data, error } = await adminClient.auth.getUser(token);
        if (error) return null;
        return data.user;
    },
    inviteRedirectUrl,
    allowedOrigins
}));
