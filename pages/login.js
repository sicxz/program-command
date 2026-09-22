/**
 * Login page controller
 */
(function() {
    'use strict';

    const SESSION_RECOVERY_DRAFT_KEY = 'pc_session_recovery_draft_v1';

    function getParams() {
        return new URLSearchParams(window.location.search);
    }

    function normalizeNextPath(nextValue) {
        const next = String(nextValue || '').trim();
        if (!next) return 'program-command.html';
        if (/^https?:\/\//i.test(next) || next.startsWith('//')) {
            return 'program-command.html';
        }
        return next;
    }

    function getNextPath() {
        return normalizeNextPath(getParams().get('next'));
    }

    function showError(message) {
        const errorBox = document.getElementById('loginError');
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.style.display = 'block';
    }

    function clearError() {
        const errorBox = document.getElementById('loginError');
        if (!errorBox) return;
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    function showMessage(message) {
        const messageBox = document.getElementById('loginMessage');
        if (!messageBox) return;
        messageBox.textContent = message;
        messageBox.style.display = 'block';
    }

    function clearMessage() {
        const messageBox = document.getElementById('loginMessage');
        if (!messageBox) return;
        messageBox.textContent = '';
        messageBox.style.display = 'none';
    }

    function setButtonBusy(buttonId, isBusy, busyLabel, defaultLabel) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.disabled = isBusy;
        button.textContent = isBusy ? busyLabel : defaultLabel;
    }

    function setSubmitting(isSubmitting) {
        setButtonBusy('loginButton', isSubmitting, 'Signing in...', 'Sign in');
    }

    function showView(view) {
        const heading = document.getElementById('loginHeading');
        const subtitle = document.querySelector('.login-subtitle');
        const forms = {
            signin: document.getElementById('loginForm'),
            reset: document.getElementById('resetForm'),
            password: document.getElementById('setPasswordForm')
        };
        const headings = {
            signin: 'Sign in',
            reset: 'Reset your password',
            password: 'Create your password'
        };

        Object.entries(forms).forEach(([name, form]) => {
            if (form) form.hidden = name !== view;
        });
        if (heading) heading.textContent = headings[view] || headings.signin;
        if (subtitle) subtitle.hidden = view !== 'signin';
        clearError();
        clearMessage();
    }

    function maybeShowTimeoutMessage() {
        if (getParams().get('timeout') === '1') {
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

    async function handleSignIn(event) {
        event.preventDefault();
        clearError();
        clearMessage();
        setSubmitting(true);

        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        try {
            await window.AuthService.signIn(email, password);
            handleRecoveryDraftPreference();
            window.location.replace(getNextPath());
        } catch (error) {
            showError(error?.message || 'Login failed. Please verify your email and password.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleResetRequest(event) {
        event.preventDefault();
        clearError();
        clearMessage();
        setButtonBusy('resetButton', true, 'Sending...', 'Send reset link');

        const emailInput = document.getElementById('resetEmail');
        const email = emailInput ? emailInput.value.trim() : '';

        try {
            await window.AuthService.requestPasswordReset(email);
        } catch (error) {
            // Deliberately show the same response for every result to avoid account discovery.
        } finally {
            setButtonBusy('resetButton', false, 'Sending...', 'Send reset link');
            showMessage('If that address has an account, a reset link is on its way.');
        }
    }

    async function handleSetPassword(event) {
        event.preventDefault();
        clearError();
        clearMessage();

        const passwordInput = document.getElementById('newPassword');
        const confirmInput = document.getElementById('confirmPassword');
        const password = passwordInput ? passwordInput.value : '';
        const confirmation = confirmInput ? confirmInput.value : '';

        if (password.length < 12) {
            showError('Use at least 12 characters.');
            return;
        }
        if (password !== confirmation) {
            showError('The passwords do not match.');
            return;
        }

        setButtonBusy('setPasswordButton', true, 'Saving...', 'Save password and continue');
        try {
            await window.AuthService.updatePassword(password);
            window.location.replace(getNextPath());
        } catch (error) {
            showError(error?.message || 'Unable to save your password. Request a new link and try again.');
        } finally {
            setButtonBusy('setPasswordButton', false, 'Saving...', 'Save password and continue');
        }
    }

    function attachHandlers() {
        const signInForm = document.getElementById('loginForm');
        if (signInForm) signInForm.addEventListener('submit', handleSignIn);

        const resetForm = document.getElementById('resetForm');
        if (resetForm) resetForm.addEventListener('submit', handleResetRequest);

        const passwordForm = document.getElementById('setPasswordForm');
        if (passwordForm) passwordForm.addEventListener('submit', handleSetPassword);

        const showResetButton = document.getElementById('showResetButton');
        if (showResetButton) {
            showResetButton.addEventListener('click', () => {
                const loginEmail = document.getElementById('loginEmail');
                const resetEmail = document.getElementById('resetEmail');
                if (loginEmail && resetEmail) resetEmail.value = loginEmail.value;
                showView('reset');
                if (resetEmail) resetEmail.focus();
            });
        }

        const backButton = document.getElementById('backToSignInButton');
        if (backButton) {
            backButton.addEventListener('click', () => {
                showView('signin');
                document.getElementById('loginEmail')?.focus();
            });
        }
    }

    async function initLoginPage() {
        if (!window.AuthService) {
            showError('Authentication service is unavailable.');
            return;
        }

        attachHandlers();
        maybeShowTimeoutMessage();

        const redirectType = typeof window.AuthService.getAuthRedirectType === 'function'
            ? window.AuthService.getAuthRedirectType()
            : '';
        const session = await window.AuthService.getSession();

        if (redirectType && session) {
            showView('password');
            document.getElementById('newPassword')?.focus();
            return;
        }

        if (session) {
            window.location.replace(getNextPath());
            return;
        }

        if (redirectType) {
            showError('This password link is invalid or expired. Request a new reset link.');
        }
    }

    document.addEventListener('DOMContentLoaded', initLoginPage);
})();
