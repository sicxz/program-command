/**
 * Auth Guard + Session Indicator
 * Protects pages that require authentication and renders a persistent user/session control.
 */
(function() {
    'use strict';

    let activePresencePageId = null;
    let unsubscribePresenceChange = null;
    let presenceScriptPromise = null;

    function getCurrentPathWithQuery() {
        return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }

    function isLoginPage() {
        return /\/login\.html$/i.test(window.location.pathname);
    }

    function loginUrl() {
        return window.location.pathname.includes('/pages/')
            ? '../login.html'
            : 'login.html';
    }

    function homeUrl() {
        return window.location.pathname.includes('/pages/')
            ? '../index.html'
            : 'index.html';
    }

    function redirectToLogin() {
        const next = encodeURIComponent(getCurrentPathWithQuery());
        window.location.replace(`${loginUrl()}?next=${next}`);
    }

    function getNextPath() {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        if (!next) return homeUrl();
        return next;
    }

    function roleLabel(role) {
        if (!role) return 'Chair';
        const normalized = String(role).toLowerCase();
        if (normalized === 'admin') return 'Admin';
        return 'Chair';
    }

    function presenceScriptUrl() {
        return window.location.pathname.includes('/pages/')
            ? '../js/presence-service.js'
            : 'js/presence-service.js';
    }

    async function ensurePresenceService() {
        if (window.PresenceService) {
            return window.PresenceService;
        }

        if (presenceScriptPromise) {
            return presenceScriptPromise;
        }

        presenceScriptPromise = new Promise((resolve) => {
            const existing = document.querySelector(`script[src=\"${presenceScriptUrl()}\"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve(window.PresenceService || null), { once: true });
                existing.addEventListener('error', () => resolve(null), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = presenceScriptUrl();
            script.onload = () => resolve(window.PresenceService || null);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        });

        return presenceScriptPromise;
    }

    function getPresencePageId() {
        return window.location.pathname || '/';
    }

    function updatePresenceIndicator(text, titleText = '') {
        const node = document.getElementById('authSessionPresence');
        if (!node) return;
        node.textContent = text;
        node.title = titleText || text;
    }

    function leavePresencePage() {
        if (!window.PresenceService || !activePresencePageId) return;

        try {
            window.PresenceService.leavePage(activePresencePageId);
        } catch (error) {
            // ignore cleanup failures during unload/logout
        }

        if (typeof unsubscribePresenceChange === 'function') {
            unsubscribePresenceChange();
            unsubscribePresenceChange = null;
        }
        activePresencePageId = null;
    }

    async function bindPresenceIndicator(user) {
        const presenceService = await ensurePresenceService();
        if (!presenceService) {
            updatePresenceIndicator('Presence offline');
            return;
        }

        const pageId = getPresencePageId();
        activePresencePageId = pageId;

        await presenceService.joinPage(pageId);

        if (typeof unsubscribePresenceChange === 'function') {
            unsubscribePresenceChange();
        }

        unsubscribePresenceChange = presenceService.onPresenceChange(pageId, (editors) => {
            const others = (editors || []).filter((editor) => editor.userId !== user?.id);
            if (!others.length) {
                updatePresenceIndicator('Only you editing');
                return;
            }

            const names = others.map((editor) => editor.user || 'Authenticated user');
            const label = `${others.length} active editor${others.length === 1 ? '' : 's'}`;
            updatePresenceIndicator(label, names.join(', '));
        });
    }

    function ensureSessionStyles() {
        if (document.getElementById('authSessionStyles')) return;
        const style = document.createElement('style');
        style.id = 'authSessionStyles';
        style.textContent = `
            .auth-session-indicator {
                position: fixed;
                top: 14px;
                right: 14px;
                z-index: 9999;
                display: inline-flex;
                align-items: center;
                gap: 10px;
                background: #ffffff;
                border: 1px solid #d0d7de;
                border-radius: 999px;
                padding: 8px 12px;
                box-shadow: 0 6px 20px rgba(31, 35, 40, 0.12);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                color: #1f2328;
            }
            .auth-session-email {
                font-size: 12px;
                font-weight: 600;
                max-width: 220px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .auth-session-role {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                color: #0b5394;
                background: #e7f0ff;
                border: 1px solid #b6d3ff;
                border-radius: 999px;
                padding: 2px 8px;
            }
            .auth-session-presence {
                font-size: 11px;
                font-weight: 600;
                color: #1f6feb;
                background: #eef6ff;
                border: 1px solid #b6d3ff;
                border-radius: 999px;
                padding: 2px 8px;
                max-width: 170px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .auth-session-logout {
                border: 1px solid #d0d7de;
                border-radius: 999px;
                background: #f6f8fa;
                color: #1f2328;
                font-size: 12px;
                font-weight: 600;
                padding: 4px 10px;
                cursor: pointer;
            }
            .auth-session-logout:hover {
                background: #eef2f6;
            }
        `;
        document.head.appendChild(style);
    }

    function renderSessionIndicator(user) {
        if (isLoginPage()) return;

        let indicator = document.getElementById('authSessionIndicator');
        if (!indicator) {
            ensureSessionStyles();
            indicator = document.createElement('div');
            indicator.id = 'authSessionIndicator';
            indicator.className = 'auth-session-indicator';
            document.body.appendChild(indicator);
        }

        const email = user?.email || 'Authenticated User';
        const role = roleLabel(user?.role);

        indicator.innerHTML = `
            <span class="auth-session-email" title="${email}">${email}</span>
            <span class="auth-session-role">${role}</span>
            <span class="auth-session-presence" id="authSessionPresence">Presence offline</span>
            <button type="button" class="auth-session-logout" id="authSessionLogout">Logout</button>
        `;

        const logoutButton = document.getElementById('authSessionLogout');
        logoutButton.addEventListener('click', async () => {
            leavePresencePage();
            try {
                await window.AuthService.signOut();
            } catch (error) {
                console.error('Auth sign-out failed:', error);
            } finally {
                window.location.replace(loginUrl());
            }
        });
    }

    async function handleLoginPage() {
        const session = await window.AuthService.getSession();
        if (session) {
            window.location.replace(getNextPath());
        }
    }

    async function handleProtectedPage() {
        const session = await window.AuthService.getSession();
        if (!session) {
            redirectToLogin();
            return;
        }

        const user = (await window.AuthService.getUser()) || session.user || null;
        renderSessionIndicator(user);
        await bindPresenceIndicator(user);
    }

    async function initGuard() {
        if (typeof window.AuthService === 'undefined') {
            console.warn('Auth guard skipped: AuthService is not available.');
            return;
        }

        try {
            if (isLoginPage()) {
                await handleLoginPage();
                return;
            }

            await handleProtectedPage();
        } catch (error) {
            console.error('Auth guard failed:', error);
            if (!isLoginPage()) {
                redirectToLogin();
            }
        }
    }

    document.addEventListener('DOMContentLoaded', initGuard);
    window.addEventListener('beforeunload', () => {
        leavePresencePage();
    });
})();
