/**
 * Login page controller
 */
(function() {
    'use strict';

    const SESSION_RECOVERY_DRAFT_KEY = 'pc_session_recovery_draft_v1';

    function getNextPath() {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        return next || 'index.html';
    }

    function showError(message) {
        const errorBox = document.getElementById('loginError');
        errorBox.textContent = message;
        errorBox.style.display = 'block';
    }

    function clearError() {
        const errorBox = document.getElementById('loginError');
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    function setSubmitting(isSubmitting) {
        const button = document.getElementById('loginButton');
        if (!button) return;
        button.disabled = isSubmitting;
        button.textContent = isSubmitting ? 'Signing in...' : 'Sign in';
    }

    async function redirectIfAlreadyAuthenticated() {
        if (!window.AuthService) return;
        const session = await window.AuthService.getSession();
        if (session) {
            window.location.replace(getNextPath());
        }
    }

    function maybeShowTimeoutMessage() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('timeout') === '1') {
            showError('Your session expired due to inactivity. Sign in to continue.');
        }
    }

    function handleRecoveryDraftPreference() {
        let draft = null;
        try {
            const raw = localStorage.getItem(SESSION_RECOVERY_DRAFT_KEY);
            draft = raw ? JSON.parse(raw) : null;
        } catch (error) {
            draft = null;
        }

        if (!draft || !draft.scheduleData) return;

        const savedAt = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : 'a previous session';
        const shouldRestore = window.confirm(`You have unsaved changes from ${savedAt}. Restore them after login?`);

        if (shouldRestore) {
            const payload = {
                academicYear: draft.academicYear || '2025-26',
                generatedAt: draft.savedAt || new Date().toISOString(),
                scheduleData: draft.scheduleData,
                source: 'session-recovery-draft'
            };
            localStorage.setItem('importedScheduleData', JSON.stringify(payload));
        }

        localStorage.removeItem(SESSION_RECOVERY_DRAFT_KEY);
    }

    async function handleSubmit(event) {
        event.preventDefault();
        clearError();
        setSubmitting(true);

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            await window.AuthService.signIn(email, password);
            handleRecoveryDraftPreference();
            window.location.replace(getNextPath());
        } catch (error) {
            const message = error?.message || 'Login failed. Please verify your email and password.';
            showError(message);
        } finally {
            setSubmitting(false);
        }
    }

    async function initLoginPage() {
        if (!window.AuthService) {
            showError('Authentication service is unavailable.');
            return;
        }

        maybeShowTimeoutMessage();
        await redirectIfAlreadyAuthenticated();
        const form = document.getElementById('loginForm');
        form.addEventListener('submit', handleSubmit);
    }

    document.addEventListener('DOMContentLoaded', initLoginPage);
})();
