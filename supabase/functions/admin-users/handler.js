(function initializeAdminUsersHandler(root) {
    'use strict';

    const DEFAULT_ALLOWED_ORIGINS = [
        'https://sicxz.github.io',
        'http://127.0.0.1:8080',
        'http://localhost:8080'
    ];
    const SELF_CHANGE_ERROR = 'You cannot change or remove your own administrator account.';

    class HttpError extends Error {
        constructor(status, message) {
            super(message);
            this.status = status;
        }
    }

    function responseHeaders(request, allowedOrigins, includeJson = true) {
        const headers = new Headers({
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Vary': 'Origin'
        });
        const origin = request.headers.get('Origin');
        if (origin && allowedOrigins.includes(origin)) {
            headers.set('Access-Control-Allow-Origin', origin);
        }
        if (includeJson) headers.set('Content-Type', 'application/json; charset=utf-8');
        return headers;
    }

    function jsonResponse(request, allowedOrigins, status, payload) {
        return new Response(JSON.stringify(payload), {
            status,
            headers: responseHeaders(request, allowedOrigins)
        });
    }

    function normalizeEmail(value) {
        const email = String(value || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new HttpError(400, 'Enter a valid email address.');
        }
        return email;
    }

    function normalizeRole(value) {
        if (value === 'admin' || value === 'participant') return value;
        throw new HttpError(400, 'Role must be admin or participant.');
    }

    function normalizeUserId(value) {
        const userId = String(value || '').trim();
        if (!userId) throw new HttpError(400, 'A user id is required.');
        return userId;
    }

    function resultError(result, fallbackMessage, status = 502) {
        if (result?.error) {
            throw new HttpError(status, result.error.message || fallbackMessage);
        }
        return result?.data;
    }

    function bearerToken(request) {
        const authorization = request.headers.get('Authorization') || '';
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        return match ? match[1].trim() : '';
    }

    async function requireAdministrator(request, deps) {
        const token = bearerToken(request);
        if (!token) throw new HttpError(401, 'Authentication is required.');

        let callerResult;
        try {
            callerResult = await deps.getCaller(token);
        } catch (_error) {
            throw new HttpError(401, 'Authentication is required.');
        }
        const caller = callerResult?.user || callerResult?.data?.user || callerResult;
        if (!caller?.id) throw new HttpError(401, 'Authentication is required.');

        const profileResult = await deps.adminClient
            .from('user_profiles')
            .select('role')
            .eq('id', caller.id)
            .maybeSingle();
        if (profileResult?.error || profileResult?.data?.role !== 'admin') {
            throw new HttpError(403, 'Administrator access is required.');
        }
        return caller;
    }

    async function syncEditors(adminClient, user, role, callerId) {
        if (role === 'admin') {
            const editorResult = await adminClient.from('editors').upsert({
                user_id: user.id,
                email: user.email || '',
                role: 'editor',
                added_by: callerId
            }, { onConflict: 'user_id' });
            resultError(editorResult, 'The editor access list could not be updated.');
            return;
        }

        const editorResult = await adminClient
            .from('editors')
            .delete()
            .eq('user_id', user.id);
        resultError(editorResult, 'The editor access list could not be updated.');
    }

    async function listUsers(adminClient) {
        const [authResult, profileResult] = await Promise.all([
            adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
            adminClient.from('user_profiles').select('id, email, role')
        ]);
        const authData = resultError(authResult, 'Users could not be loaded.');
        const profiles = resultError(profileResult, 'User profiles could not be loaded.') || [];
        const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

        return (authData?.users || []).map((user) => {
            const profile = profileById.get(user.id);
            return {
                id: user.id,
                email: user.email || profile?.email || '',
                role: profile?.role === 'admin' || profile?.role === 'participant'
                    ? profile.role
                    : 'none',
                status: user.email_confirmed_at || user.confirmed_at ? 'active' : 'invited',
                lastSignInAt: user.last_sign_in_at || null
            };
        }).sort((left, right) => left.email.localeCompare(right.email));
    }

    async function inviteUser(adminClient, caller, body, inviteRedirectUrl) {
        const email = normalizeEmail(body.email);
        const role = normalizeRole(body.role);
        const invitationResult = await adminClient.auth.admin.inviteUserByEmail(email, {
            redirectTo: inviteRedirectUrl
        });
        const invitation = resultError(invitationResult, 'The invitation could not be sent.', 400);
        const invitedUser = invitation?.user;
        if (!invitedUser?.id) {
            throw new HttpError(502, 'Supabase did not return the invited user.');
        }

        const profile = {
            id: invitedUser.id,
            email,
            role,
            invited_by: caller.id
        };
        const profileResult = await adminClient
            .from('user_profiles')
            .upsert(profile, { onConflict: 'id' });
        resultError(profileResult, 'The invitation was sent, but its role could not be saved.');
        await syncEditors(adminClient, { id: invitedUser.id, email }, role, caller.id);

        return {
            id: invitedUser.id,
            email,
            role,
            status: invitedUser.email_confirmed_at || invitedUser.confirmed_at ? 'active' : 'invited',
            lastSignInAt: invitedUser.last_sign_in_at || null
        };
    }

    async function setRole(adminClient, caller, body) {
        const userId = normalizeUserId(body.userId);
        if (userId === caller.id) throw new HttpError(400, SELF_CHANGE_ERROR);
        const role = normalizeRole(body.role);
        const updateResult = await adminClient
            .from('user_profiles')
            .update({ role })
            .eq('id', userId)
            .select('id, email, role')
            .single();
        const profile = resultError(updateResult, 'User not found.', 404);
        if (!profile) throw new HttpError(404, 'User not found.');
        await syncEditors(adminClient, profile, role, caller.id);
        return profile;
    }

    async function removeUser(adminClient, caller, body) {
        const userId = normalizeUserId(body.userId);
        if (userId === caller.id) throw new HttpError(400, SELF_CHANGE_ERROR);
        const deleteResult = await adminClient.auth.admin.deleteUser(userId);
        resultError(deleteResult, 'The user could not be removed.', 400);
    }

    async function handle(request, suppliedDeps = {}) {
        const allowedOrigins = Array.isArray(suppliedDeps.allowedOrigins)
            ? suppliedDeps.allowedOrigins
            : DEFAULT_ALLOWED_ORIGINS;

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: responseHeaders(request, allowedOrigins, false)
            });
        }
        if (request.method !== 'POST') {
            return jsonResponse(request, allowedOrigins, 405, { error: 'Method not allowed.' });
        }

        try {
            if (!suppliedDeps.adminClient || typeof suppliedDeps.getCaller !== 'function') {
                throw new HttpError(500, 'The user administration service is not configured.');
            }
            const caller = await requireAdministrator(request, suppliedDeps);
            let body;
            try {
                body = await request.json();
            } catch (_error) {
                throw new HttpError(400, 'A valid JSON body is required.');
            }

            if (body?.action === 'list') {
                return jsonResponse(request, allowedOrigins, 200, {
                    users: await listUsers(suppliedDeps.adminClient)
                });
            }
            if (body?.action === 'invite') {
                const user = await inviteUser(
                    suppliedDeps.adminClient,
                    caller,
                    body,
                    suppliedDeps.inviteRedirectUrl
                );
                return jsonResponse(request, allowedOrigins, 201, { user });
            }
            if (body?.action === 'setRole') {
                const user = await setRole(suppliedDeps.adminClient, caller, body);
                return jsonResponse(request, allowedOrigins, 200, { user });
            }
            if (body?.action === 'remove') {
                await removeUser(suppliedDeps.adminClient, caller, body);
                return jsonResponse(request, allowedOrigins, 200, { success: true });
            }
            throw new HttpError(400, 'Unknown action.');
        } catch (error) {
            const status = Number.isInteger(error?.status) ? error.status : 500;
            const message = status === 500
                ? 'The user administration request could not be completed.'
                : (error?.message || 'The user administration request could not be completed.');
            return jsonResponse(request, allowedOrigins, status, { error: message });
        }
    }

    const api = { handle };
    root.AdminUsersHandler = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
