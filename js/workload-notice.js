/** Temporary Workload navigation gate. Re-enable after the dashboard follow-up. */
const WorkloadNotice = (function () {
    'use strict';
    let dialog = null;
    let opener = null;

    function show(trigger = document.activeElement) {
        opener = trigger;
        if (!dialog) {
            const style = document.createElement('style');
            style.textContent = `
                .workload-notice { width: min(420px, calc(100vw - 40px)); padding: 28px; border: 1px solid #dfe3e7; border-radius: 8px; color: #252b33; background: white; font: 15px/1.5 var(--font, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); box-shadow: 0 20px 70px #18222d26; }
                .workload-notice::backdrop { background: #17212d66; }
                .workload-notice h2 { margin: 0 0 10px; font: 600 23px/1.25 var(--font, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); letter-spacing: -.4px; }
                .workload-notice p { margin: 0 0 24px; color: #65707b; }
                .workload-notice button { display: block; margin-left: auto; padding: 9px 20px; border: 0; border-radius: 5px; background: #a10022; color: white; cursor: pointer; font: inherit; }
                .workload-notice button:focus-visible { outline: 3px solid #2463ad; outline-offset: 3px; }
            `;
            document.head.append(style);
            dialog = document.createElement('dialog');
            dialog.className = 'workload-notice';
            dialog.setAttribute('aria-labelledby', 'workload-notice-title');
            dialog.setAttribute('aria-describedby', 'workload-notice-description');
            const title = document.createElement('h2');
            title.id = 'workload-notice-title'; title.textContent = 'Under development';
            const description = document.createElement('p');
            description.id = 'workload-notice-description';
            description.textContent = 'The Workload dashboard is under development and is temporarily unavailable.';
            const close = document.createElement('button');
            close.type = 'button'; close.textContent = 'Close'; close.autofocus = true;
            close.addEventListener('click', () => dialog.close());
            dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
            dialog.append(title, description, close);
            document.body.append(dialog);
        }
        if (!dialog.open) dialog.showModal();
    }

    function workloadTarget(event) {
        return event.composedPath().find(node => {
            if (!(node instanceof Element)) return false;
            if (node.hasAttribute('data-workload-unavailable')) return true;
            if (!node.matches('a[href]')) return false;
            const destination = new URL(node.getAttribute('href'), document.baseURI);
            return destination.origin === window.location.origin && destination.pathname.endsWith('/workload-dashboard.html');
        });
    }

    function intercept(event) {
        const target = workloadTarget(event);
        if (!target) return;
        event.preventDefault(); event.stopImmediatePropagation();
        show(target);
    }

    // Capture also covers links inside the shared header's open shadow root.
    document.addEventListener('click', intercept, true);
    document.addEventListener('auxclick', intercept, true);
    return { show };
})();
window.WorkloadNotice = WorkloadNotice;
