/**
 * Login page controller
 */
(function() {
    'use strict';

    const SESSION_RECOVERY_DRAFT_KEY = 'pc_session_recovery_draft_v1';
    const LINK_MODE = 'link';

    function getParams() {
        return new URLSearchParams(window.location.search);
    }

    function normalizeNextPath(nextValue) {
        const next = String(nextValue || '').trim();
        if (!next) return 'index.html';
        if (/^https?:\/\//i.test(next) || next.startsWith('//')) {
            return 'index.html';
        }
        return next;
    }

    function getNextPath() {
        const params = getParams();
        return normalizeNextPath(params.get('next'));
    }

    function getMode() {
        const params = getParams();
        const mode = String(params.get('mode') || '').toLowerCase();
        return mode === LINK_MODE ? LINK_MODE : 'signin';
    }

    function isLinkMode() {
        return getMode() === LINK_MODE;
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

    function setSubmitting(isSubmitting) {
        const button = document.getElementById('loginButton');
        if (!button) return;
        button.disabled = isSubmitting;
        button.textContent = isSubmitting ? 'Signing in...' : 'Sign in';
    }

    function setOAuthBusy(isBusy, provider = null) {
        const buttons = Array.from(document.querySelectorAll('.oauth-button'));
        buttons.forEach((button) => {
            if (!button.dataset.defaultLabel) {
                button.dataset.defaultLabel = button.textContent;
            }
            button.disabled = isBusy;
            if (!isBusy) {
                button.textContent = button.dataset.defaultLabel;
                return;
            }

            const buttonProvider = String(button.getAttribute('data-provider') || '').toLowerCase();
            if (provider && buttonProvider === provider) {
                button.textContent = 'Redirecting...';
            } else {
                button.textContent = button.dataset.defaultLabel;
            }
        });
    }

    function maybeShowTimeoutMessage() {
        const params = getParams();
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

    function renderLinkedProviders(identities) {
        const list = document.getElementById('linkedProvidersList');
        if (!list) return;
        list.innerHTML = '';
        const providers = Array.isArray(identities) ? identities : [];
        if (!providers.length) {
            const li = document.createElement('li');
            li.textContent = 'No linked providers yet';
            list.appendChild(li);
            return;
        }

        providers.forEach((identity) => {
            const li = document.createElement('li');
            const provider = String(identity?.provider || '').trim();
            if (!provider) return;
            li.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
            list.appendChild(li);
        });
    }

    function applyLinkModeUi() {
        const heading = document.getElementById('loginHeading');
        const subtitle = document.querySelector('.login-subtitle');
        const form = document.getElementById('loginForm');
        const panel = document.getElementById('linkingPanel');

        if (heading) heading.textContent = 'Connect login provider';
        if (subtitle) subtitle.textContent = 'Add Google, GitHub, or Apple to your signed-in account.';
        if (form) form.style.display = 'none';
        if (panel) panel.classList.add('visible');
    }

    function attachOAuthHandlers(mode) {
        const buttons = Array.from(document.querySelectorAll('.oauth-button'));
        buttons.forEach((button) => {
            button.addEventListener('click', async () => {
                clearError();
                const provider = String(button.getAttribute('data-provider') || '').trim().toLowerCase();
                if (!provider) {
                    showError('Missing OAuth provider.');
                    return;
                }

                try {
                    setOAuthBusy(true, provider);
                    if (mode === LINK_MODE) {
                        await window.AuthService.beginOAuthLink(provider, { nextPath: getNextPath() });
                    } else {
                        await window.AuthService.beginOAuthSignIn(provider, { nextPath: getNextPath() });
                    }
                } catch (error) {
                    setOAuthBusy(false);
                    const message = error?.message || 'OAuth sign-in failed. Try again.';
                    showError(message);
                }
            });
        });
    }

    async function completeOAuthIfNeeded() {
        if (!window.AuthService || typeof window.AuthService.completeOAuthRedirect !== 'function') {
            return false;
        }

        const result = await window.AuthService.completeOAuthRedirect();
        if (!result?.handled) {
            return false;
        }

        if (!result.success) {
            const message = result.error || 'OAuth sign-in failed. Please try again.';
            showError(message);
            return true;
        }

        if (result.mode !== LINK_MODE) {
            handleRecoveryDraftPreference();
        }

        const destination = normalizeNextPath(result.nextPath || getNextPath());
        window.location.replace(destination);
        return true;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        clearError();
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
        attachOAuthHandlers(getMode());

        const oauthHandled = await completeOAuthIfNeeded();
        if (oauthHandled) {
            return;
        }

        const session = await window.AuthService.getSession();

        if (isLinkMode()) {
            if (!session?.user?.id) {
                showError('Sign in with your existing account first, then use Link login.');
            } else {
                applyLinkModeUi();
                try {
                    const identities = await window.AuthService.getLinkedIdentities();
                    renderLinkedProviders(identities);
                } catch (error) {
                    showError(error?.message || 'Unable to load linked providers.');
                }
            }
        } else if (session) {
            window.location.replace(getNextPath());
            return;
        }

        const form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', handleSubmit);
        }
    }

    document.addEventListener('DOMContentLoaded', initLoginPage);
})();
