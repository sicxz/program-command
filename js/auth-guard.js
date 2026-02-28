/**
 * Auth Guard + Session Indicator
 * Protects pages that require authentication and renders a persistent user/session control.
 */
(function() {
    'use strict';

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
            <button type="button" class="auth-session-logout" id="authSessionLogout">Logout</button>
        `;

        const logoutButton = document.getElementById('authSessionLogout');
        logoutButton.addEventListener('click', async () => {
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
})();
