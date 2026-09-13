const fs = require('fs');
const path = require('path');

beforeAll(() => {
    window.eval(fs.readFileSync(path.join(__dirname, '../js/components/app-header.js'), 'utf8'));
});

afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
});

function mountHeader(pathname = '/program-command/program-command.html') {
    window.history.replaceState({}, '', pathname);
    const header = document.createElement('app-header');
    document.body.appendChild(header);
    return header;
}

// Inspect whether the component blocked navigation; suppress jsdom's real
// navigation afterward so this test cannot leave the fixture page.
function clickLink(link, options = {}) {
    let wasPrevented;
    link.addEventListener('click', (event) => {
        wasPrevented = event.defaultPrevented;
        event.preventDefault();
    }, { once: true });
    link.dispatchEvent(new MouseEvent('click', {
        bubbles: true, composed: true, cancelable: true, button: 0, ...options
    }));
    return wasPrevented;
}

test.each([
    '/program-command/program-command.html',
    '/program-command/pages/eaglenet-compare.html',
    '/program-command/pages/department-onboarding.html'
])('dashboard links resolve within the deployed site from %s', (pathname) => {
    const header = mountHeader(pathname);
    const destinations = [...header.shadowRoot.querySelectorAll('a')]
        .map((link) => new URL(link.href).pathname);
    expect(destinations).toEqual([
        '/program-command/pages/applied-learning-dashboard.html',
        '/program-command/enrollment-dashboard.html',
        '/program-command/pages/capacity-planning-dashboard.html',
        '/program-command/pages/workload-dashboard.html'
    ]);
});

test('secondary pages follow dashboard links without a scheduler event listener', () => {
    const header = mountHeader('/program-command/pages/eaglenet-compare.html');
    const link = header.shadowRoot.querySelector('[data-action="nav-applied-learning"]');
    expect(clickLink(link)).toBe(false);
});

test('scheduler can cancel the native link while its unsaved-change guard runs', () => {
    const header = mountHeader();
    const guardedNavigation = jest.fn((event) => event.preventDefault());
    document.addEventListener('header-action', guardedNavigation, { once: true });
    const link = header.shadowRoot.querySelector('[data-action="nav-capacity"]');

    expect(clickLink(link)).toBe(true);
    expect(guardedNavigation).toHaveBeenCalledTimes(1);
    expect(guardedNavigation.mock.calls[0][0].detail.action).toBe('nav-capacity');
});

test.each([{ ctrlKey: true }, { metaKey: true }, { button: 1 }])(
    'opening a separate tab preserves native link behavior: %j', (options) => {
        const header = mountHeader();
        const listener = jest.fn();
        header.addEventListener('header-action', listener);
        const link = header.shadowRoot.querySelector('[data-action="nav-enrollment"]');
        expect(clickLink(link, options)).toBe(false);
        expect(listener).not.toHaveBeenCalled();
    }
);
