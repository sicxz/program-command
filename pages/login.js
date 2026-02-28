/**
 * Login page controller
 */
(function() {
    'use strict';

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

    async function handleSubmit(event) {
        event.preventDefault();
        clearError();
        setSubmitting(true);

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            await window.AuthService.signIn(email, password);
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

        await redirectIfAlreadyAuthenticated();
        const form = document.getElementById('loginForm');
        form.addEventListener('submit', handleSubmit);
    }

    document.addEventListener('DOMContentLoaded', initLoginPage);
})();
