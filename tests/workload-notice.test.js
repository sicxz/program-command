const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
let doc, notice;

beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Notice test');
    doc.head.innerHTML = '<base href="http://localhost/program-command/">';
    const create = doc.createElement.bind(doc);
    doc.createElement = tag => {
        const node = create(tag);
        if (tag === 'dialog') {
            node.showModal = jest.fn(() => node.setAttribute('open', ''));
            node.close = () => { node.removeAttribute('open'); node.dispatchEvent(new Event('close')); };
        }
        return node;
    };
    const context = vm.createContext({ document: doc, Element, URL, window: { location: { origin: 'http://localhost' } } });
    notice = vm.runInContext(`${read('js/workload-notice.js')}\nWorkloadNotice;`, context);
});

function link(href = 'pages/workload-dashboard.html?year=2026-27') {
    const anchor = doc.createElement('a'); anchor.href = href; anchor.textContent = 'Workload'; doc.body.append(anchor); return anchor;
}
function click(node, type = 'click', extra = {}) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...extra });
    node.dispatchEvent(event); return event;
}

test('workload click stays on the current page and opens a single accessible notice', () => {
    const target = link(); const navigation = jest.fn(); target.addEventListener('click', navigation);
    expect(click(target).defaultPrevented).toBe(true);
    expect(navigation).not.toHaveBeenCalled();
    const dialog = doc.querySelector('dialog');
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2').textContent).toBe('Under development');
    expect(dialog.getAttribute('aria-describedby')).toBe('workload-notice-description');
    notice.show(target);
    expect(doc.querySelectorAll('dialog')).toHaveLength(1);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
});

test('Close restores focus to the workload entry point', () => {
    const target = link(); target.focus = jest.fn(); click(target);
    click(doc.querySelector('dialog button'));
    expect(doc.querySelector('dialog').open).toBe(false);
    expect(target.focus).toHaveBeenCalled();
});

test('capture stops inline-style handlers and links inside the shared header shadow root', () => {
    const host = doc.createElement('div'); const shadow = host.attachShadow({ mode: 'open' }); doc.body.append(host);
    const target = doc.createElement('a'); target.href = 'pages/workload-dashboard.html'; const child = doc.createElement('span'); child.textContent = 'Faculty Workload'; target.append(child); shadow.append(target);
    const navigate = jest.fn(); target.addEventListener('click', navigate);
    expect(click(child).defaultPrevented).toBe(true); expect(navigate).not.toHaveBeenCalled();
    expect(doc.querySelector('dialog').open).toBe(true);
});

test('keyboard activation and secondary clicks cannot enter the disabled dashboard', () => {
    const target = link();
    expect(click(target, 'click', { detail: 0 }).defaultPrevented).toBe(true);
    doc.querySelector('dialog').close();
    expect(click(target, 'auxclick', { button: 1 }).defaultPrevented).toBe(true);
    expect(doc.querySelector('dialog').open).toBe(true);
});

test('other dashboards and unrelated external links retain their navigation', () => {
    expect(click(link('enrollment-dashboard.html')).defaultPrevented).toBe(false);
    expect(click(link('https://example.com/workload-dashboard.html')).defaultPrevented).toBe(false);
    expect(doc.querySelector('dialog')).toBeNull();
});

test('all active workload entry pages load the gate and direct access never boots the legacy controller', () => {
    const files = ['enrollment-dashboard.html', 'program-command.html', ...fs.readdirSync(path.join(__dirname, '../pages')).filter(name => name.endsWith('.html')).map(name => `pages/${name}`)];
    files.forEach(file => {
        const html = read(file);
        if (html.includes('workload-dashboard.html') || html.includes('components/app-header.js')) expect(html).toContain('js/workload-notice.js');
    });
    const workloadPage = read('pages/workload-dashboard.html');
    expect(workloadPage).toContain('Under development');
    expect(workloadPage).not.toMatch(/<script[^>]+src=["'][^"']*\/workload-dashboard\.js/);
    expect(workloadPage).not.toContain('schedule-manager.js');
    expect(workloadPage).toContain('../js/auth-guard.js');

    const facultyWorkloadDetailPage = read('pages/faculty-workload-detail.html');
    expect(facultyWorkloadDetailPage).toContain('Under development');
    expect(facultyWorkloadDetailPage).not.toMatch(/<script[^>]+src=["'][^"']*faculty-workload-detail\.js/);
    expect(facultyWorkloadDetailPage).not.toContain('data-loader.js');
    expect(facultyWorkloadDetailPage).not.toContain('workload-integration.js');
    expect(facultyWorkloadDetailPage).toContain('../js/auth-guard.js');
});
