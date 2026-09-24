/**
 * Email links arrive here first so mail scanners cannot consume one-time tokens on page load.
 * Only a person's button click loads Supabase and verifies the link.
 */
(function() {
    'use strict';

    const AUTH_TYPES = new Set(['recovery', 'invite']);
    const DEFAULT_BUTTON_TEXT = 'Continue to create password';

    function loadScript(source) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = source;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Authentication scripts could not be loaded.'));
            document.head.appendChild(script);
        });
    }

    async function getClient() {
        if (typeof window.getSupabaseClient !== 'function') {
            await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
            await loadScript('js/supabase-config.js');
        }

        const client = window.getSupabaseClient?.();
        if (!client) throw new Error('Authentication is unavailable.');
        return client;
    }

    function init() {
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type');
        const tokenHash = params.get('token_hash');
        const heading = document.getElementById('confirmHeading');
        const description = document.getElementById('confirmDescription');
        const button = document.getElementById('confirmButton');
        const errorBox = document.getElementById('confirmError');

        // Keep the one-time token only in memory, away from the address bar and referrers.
        window.history.replaceState(null, '', window.location.pathname);

        if (!AUTH_TYPES.has(type) || !tokenHash) {
            button.disabled = true;
            errorBox.textContent = 'This email link is incomplete. Request a new link and try again.';
            errorBox.hidden = false;
            return;
        }

        heading.textContent = type === 'invite' ? 'Accept your invitation' : 'Reset your password';
        description.textContent = type === 'invite'
            ? 'Select Continue to accept your invitation and create a password.'
            : 'Select Continue to confirm this reset and create a new password.';

        button.addEventListener('click', async () => {
            if (button.disabled) return;
            button.disabled = true;
            button.textContent = 'Confirming...';
            errorBox.hidden = true;

            try {
                const client = await getClient();
                const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
                if (error) throw error;
                if (!data?.session) throw new Error('No session was created.');
                window.location.replace(`login.html?type=${type}`);
            } catch (error) {
                errorBox.textContent = 'We could not confirm this link. Try again or request a new one.';
                errorBox.hidden = false;
                button.disabled = false;
                button.textContent = DEFAULT_BUTTON_TEXT;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
