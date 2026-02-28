/**
 * Auth Guard + Session Indicator
 * Protects pages that require authentication and renders a persistent user/session control.
 */
(function() {
    'use strict';

    let activePresencePageId = null;
    let unsubscribePresenceChange = null;
    let unsubscribeSaveNotice = null;
    let presenceScriptPromise = null;
    let hasConcurrentEditors = false;
    let conflictChoice = 'unset';

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

    function can(action, resource, user) {
        if (window.AuthService && typeof window.AuthService.can === 'function') {
            return window.AuthService.can(action, resource, user);
        }
        const role = String(user?.role || '').toLowerCase();
        return role === 'admin';
    }

    function getRoutePolicy() {
        if (/\/pages\/department-onboarding\.html$/i.test(window.location.pathname)) {
            return {
                action: 'manage',
                resource: 'system-config',
                message: 'Insufficient permissions: only admins can access Department Onboarding.'
            };
        }
        return null;
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

    function formatSince(isoString) {
        if (!isoString) return 'just now';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return 'just now';
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    function showConflictNotice(message) {
        let node = document.getElementById('editConflictNotice');
        if (!node) {
            node = document.createElement('div');
            node.id = 'editConflictNotice';
            node.className = 'edit-conflict-notice';
            document.body.appendChild(node);
        }

        node.textContent = message;
        node.classList.add('visible');

        if (node._hideTimer) {
            clearTimeout(node._hideTimer);
        }
        node._hideTimer = setTimeout(() => {
            node.classList.remove('visible');
        }, 4500);
    }

    function setPageReadOnlyMode(enabled) {
        const controls = document.querySelectorAll('button, input, select, textarea, [contenteditable=\"true\"]');
        controls.forEach((control) => {
            if (control.closest('#authSessionIndicator') || control.closest('#editLockWarningBanner')) {
                return;
            }

            if (enabled) {
                if (control.dataset.editLockApplied === '1') return;

                control.dataset.editLockApplied = '1';
                if ('disabled' in control) {
                    control.dataset.editLockWasDisabled = control.disabled ? '1' : '0';
                    control.disabled = true;
                }

                if (control.hasAttribute('contenteditable')) {
                    control.dataset.editLockContenteditable = control.getAttribute('contenteditable') || 'true';
                    control.setAttribute('contenteditable', 'false');
                }

                control.classList.add('edit-lock-readonly');
                return;
            }

            if (control.dataset.editLockApplied !== '1') return;

            if ('disabled' in control) {
                control.disabled = control.dataset.editLockWasDisabled === '1';
            }

            if (control.dataset.editLockContenteditable) {
                control.setAttribute('contenteditable', control.dataset.editLockContenteditable);
                delete control.dataset.editLockContenteditable;
            }

            delete control.dataset.editLockApplied;
            delete control.dataset.editLockWasDisabled;
            control.classList.remove('edit-lock-readonly');
        });
    }

    function hideEditLockBanner() {
        const banner = document.getElementById('editLockWarningBanner');
        if (!banner) return;
        banner.style.display = 'none';
    }

    function renderEditLockBanner(editors) {
        let banner = document.getElementById('editLockWarningBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'editLockWarningBanner';
            banner.className = 'edit-lock-warning-banner';
            banner.innerHTML = `
                <div class=\"edit-lock-warning-message\" id=\"editLockWarningMessage\"></div>
                <div class=\"edit-lock-warning-actions\">
                    <button type=\"button\" class=\"edit-lock-btn\" id=\"editLockViewOnlyBtn\">View only</button>
                    <button type=\"button\" class=\"edit-lock-btn danger\" id=\"editLockEditAnywayBtn\">Edit anyway</button>
                </div>
            `;
            document.body.appendChild(banner);

            const viewOnlyButton = document.getElementById('editLockViewOnlyBtn');
            const editAnywayButton = document.getElementById('editLockEditAnywayBtn');

            viewOnlyButton.addEventListener('click', () => {
                conflictChoice = 'view';
                setPageReadOnlyMode(true);
                showConflictNotice('View-only mode enabled while another editor is active.');
            });

            editAnywayButton.addEventListener('click', () => {
                conflictChoice = 'edit';
                setPageReadOnlyMode(false);
                showConflictNotice('Editing while another user is active. Last write wins if both save.');
            });
        }

        const primaryEditor = editors[0] || {};
        const editorLabel = primaryEditor.user || 'Another editor';
        const editorSince = formatSince(primaryEditor.since);
        const extraEditors = editors.length > 1 ? ` (+${editors.length - 1} more)` : '';

        const message = document.getElementById('editLockWarningMessage');
        message.textContent = `${editorLabel} is currently editing this page (since ${editorSince})${extraEditors}.`;

        banner.style.display = 'flex';
    }

    function installSaveConflictHooks(presenceService, pageId, user) {
        const saveHandlers = ['saveScheduleToDatabase', 'saveToDatabase'];
        saveHandlers.forEach((handlerName) => {
            const original = window[handlerName];
            if (typeof original !== 'function' || original.__editLockWrapped) {
                return;
            }

            const wrapped = async function(...args) {
                const result = await original.apply(this, args);
                if (hasConcurrentEditors && conflictChoice === 'edit') {
                    showConflictNotice('Saved while another editor is active. Last write wins.');
                    if (presenceService && typeof presenceService.announceSave === 'function') {
                        presenceService.announceSave(pageId, {
                            user_id: user?.id || null,
                            user_label: user?.email || 'Authenticated user'
                        }).catch(() => {});
                    }
                }
                return result;
            };

            wrapped.__editLockWrapped = true;
            window[handlerName] = wrapped;
        });
    }

    function leavePresencePage() {
        if (window.PresenceService && activePresencePageId) {
            try {
                window.PresenceService.leavePage(activePresencePageId);
            } catch (error) {
                // ignore cleanup failures during unload/logout
            }
        }

        if (typeof unsubscribePresenceChange === 'function') {
            unsubscribePresenceChange();
            unsubscribePresenceChange = null;
        }
        if (typeof unsubscribeSaveNotice === 'function') {
            unsubscribeSaveNotice();
            unsubscribeSaveNotice = null;
        }
        activePresencePageId = null;
        hasConcurrentEditors = false;
        conflictChoice = 'unset';
        setPageReadOnlyMode(false);
        hideEditLockBanner();
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
            hasConcurrentEditors = others.length > 0;
            if (!others.length) {
                updatePresenceIndicator('Only you editing');
                hideEditLockBanner();
                setPageReadOnlyMode(false);
                conflictChoice = 'unset';
                return;
            }

            const names = others.map((editor) => editor.user || 'Authenticated user');
            const label = `${others.length} active editor${others.length === 1 ? '' : 's'}`;
            updatePresenceIndicator(label, names.join(', '));

            renderEditLockBanner(others);
            if (conflictChoice !== 'edit') {
                conflictChoice = 'view';
                setPageReadOnlyMode(true);
            }
        });

        if (typeof unsubscribeSaveNotice === 'function') {
            unsubscribeSaveNotice();
        }

        if (typeof presenceService.onSaveNotice === 'function') {
            unsubscribeSaveNotice = presenceService.onSaveNotice(pageId, (notice) => {
                if (!notice || notice.user_id === user?.id) return;
                const editorLabel = notice.user_label || 'Another editor';
                showConflictNotice(`${editorLabel} just saved changes. Reload if your draft is stale.`);
            });
        }

        installSaveConflictHooks(presenceService, pageId, user);
        setTimeout(() => installSaveConflictHooks(presenceService, pageId, user), 1000);
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
            .edit-lock-warning-banner {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 9998;
                display: none;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 10px 14px;
                background: #fff7d6;
                border-bottom: 1px solid #e5c95c;
                color: #7a4b00;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                box-shadow: 0 4px 12px rgba(31, 35, 40, 0.12);
            }
            .edit-lock-warning-message {
                font-size: 13px;
                font-weight: 600;
            }
            .edit-lock-warning-actions {
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            .edit-lock-btn {
                border: 1px solid #d5b03f;
                border-radius: 999px;
                background: #fff;
                color: #7a4b00;
                font-size: 12px;
                font-weight: 700;
                padding: 4px 10px;
                cursor: pointer;
            }
            .edit-lock-btn.danger {
                border-color: #b45309;
                background: #fff8e1;
            }
            .edit-lock-readonly {
                opacity: 0.62;
                cursor: not-allowed !important;
            }
            .edit-conflict-notice {
                position: fixed;
                top: 52px;
                right: 14px;
                z-index: 9999;
                background: #7a4b00;
                color: #fff;
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 600;
                box-shadow: 0 8px 20px rgba(31, 35, 40, 0.2);
                opacity: 0;
                transform: translateY(-8px);
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
            }
            .edit-conflict-notice.visible {
                opacity: 1;
                transform: translateY(0);
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

    function renderPermissionDenied(message) {
        if (isLoginPage()) return;
        document.body.innerHTML = `
            <main style="
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: linear-gradient(180deg, #f6f8fa 0%, #ffffff 100%);
                padding: 24px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            ">
                <section style="
                    width: min(560px, 100%);
                    background: #fff;
                    border: 1px solid #f1b0b7;
                    border-radius: 12px;
                    padding: 22px;
                    box-shadow: 0 16px 36px rgba(31, 35, 40, 0.12);
                ">
                    <h1 style="margin: 0 0 8px; font-size: 24px; color: #cf222e;">Access Denied</h1>
                    <p style="margin: 0 0 16px; color: #57606a; line-height: 1.45;">
                        ${message || 'You do not have permission to access this page.'}
                    </p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <a href="${homeUrl()}" style="
                            display: inline-block;
                            padding: 10px 14px;
                            border-radius: 8px;
                            background: #a10022;
                            color: #fff;
                            text-decoration: none;
                            font-weight: 700;
                            font-size: 14px;
                        ">Return to Home</a>
                        <a href="${loginUrl()}" style="
                            display: inline-block;
                            padding: 10px 14px;
                            border-radius: 8px;
                            border: 1px solid #d0d7de;
                            background: #fff;
                            color: #1f2328;
                            text-decoration: none;
                            font-weight: 600;
                            font-size: 14px;
                        ">Switch Account</a>
                    </div>
                </section>
            </main>
        `;
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
        const routePolicy = getRoutePolicy();
        if (routePolicy && !can(routePolicy.action, routePolicy.resource, user)) {
            renderPermissionDenied(routePolicy.message);
            return;
        }

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
