class AppHeader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isOpen = false;
        this.authSubscription = null;
        this.permissionSyncTimer = null;
        this.permissionSyncAttempts = 0;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.startPermissionSync();
    }

    disconnectedCallback() {
        this.stopPermissionSync();
        if (this.authSubscription && typeof this.authSubscription.unsubscribe === 'function') {
            this.authSubscription.unsubscribe();
            this.authSubscription = null;
        }
        this.removeEventListeners();
    }

    startPermissionSync() {
        this.stopPermissionSync();
        this.permissionSyncAttempts = 0;
        this.permissionSyncTimer = window.setInterval(async () => {
            this.permissionSyncAttempts += 1;
            const synced = await this.applyRolePermissions();
            if (synced || this.permissionSyncAttempts >= 20) {
                this.stopPermissionSync();
            }
        }, 250);
    }

    stopPermissionSync() {
        if (this.permissionSyncTimer) {
            window.clearInterval(this.permissionSyncTimer);
            this.permissionSyncTimer = null;
        }
    }

    async applyRolePermissions() {
        if (!window.AuthService || typeof window.AuthService.can !== 'function') {
            return false;
        }

        let user = null;
        if (typeof window.AuthService.getUser === 'function') {
            try {
                user = await window.AuthService.getUser();
            } catch (error) {
                user = null;
            }
        }

        const guardedItems = this.shadowRoot.querySelectorAll('[data-rbac-action][data-rbac-resource]');
        guardedItems.forEach((item) => {
            const action = item.dataset.rbacAction;
            const resource = item.dataset.rbacResource;
            const allowed = window.AuthService.can(action, resource, user || null);
            item.dataset.disabled = allowed ? 'false' : 'true';
            item.classList.toggle('header-settings-item-disabled', !allowed);
            item.setAttribute('aria-disabled', allowed ? 'false' : 'true');
            item.tabIndex = allowed ? 0 : -1;
        });

        if (!this.authSubscription && typeof window.AuthService.onAuthStateChange === 'function') {
            try {
                this.authSubscription = window.AuthService.onAuthStateChange(() => {
                    this.applyRolePermissions();
                });
            } catch (error) {
                this.authSubscription = null;
            }
        }

        return true;
    }

    setupEventListeners() {
        this.toggleButton = this.shadowRoot.querySelector('#headerSettingsButton');
        this.menu = this.shadowRoot.querySelector('#headerSettingsMenu');

        this.handleToggleClick = (e) => {
            e.stopPropagation();
            this.isOpen = !this.isOpen;
            this.updateMenuState();
        };

        this.handleDocumentClick = (e) => {
            if (this.isOpen && !this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
                this.isOpen = false;
                this.updateMenuState();
            }
        };

        this.handleActionClick = (e) => {
            if (e.currentTarget?.dataset?.disabled === 'true') {
                this.dispatchEvent(new CustomEvent('header-permission-denied', {
                    detail: {
                        action: e.currentTarget.dataset.action,
                        message: e.currentTarget.dataset.deniedMessage || 'You do not have permission to perform this action.'
                    },
                    bubbles: true,
                    composed: true
                }));
                return;
            }

            const action = e.currentTarget.dataset.action;
            if (action) {
                // Dispatch a custom event that index.html can listen for
                this.dispatchEvent(new CustomEvent('header-action', {
                    detail: { action },
                    bubbles: true,
                    composed: true
                }));
            }
            this.isOpen = false;
            this.updateMenuState();
        };

        if (this.toggleButton) {
            this.toggleButton.addEventListener('click', this.handleToggleClick);
        }
        document.addEventListener('click', this.handleDocumentClick);

        const items = this.shadowRoot.querySelectorAll('.header-settings-item');
        items.forEach(item => item.addEventListener('click', this.handleActionClick));
    }

    removeEventListeners() {
        if (this.toggleButton) {
            this.toggleButton.removeEventListener('click', this.handleToggleClick);
        }
        document.removeEventListener('click', this.handleDocumentClick);

        const items = this.shadowRoot.querySelectorAll('.header-settings-item');
        items.forEach(item => item.removeEventListener('click', this.handleActionClick));
    }

    updateMenuState() {
        if (this.menu) {
            this.menu.style.display = this.isOpen ? 'flex' : 'none';
        }
        if (this.toggleButton) {
            this.toggleButton.setAttribute('aria-expanded', this.isOpen.toString());
        }
    }

    render() {
        const escapeHtml = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const eyebrow = escapeHtml(this.getAttribute('eyebrow') || 'EWU DESIGN · PROGRAM COMMAND');
        const titleText = escapeHtml(this.getAttribute('title-text') || 'Program Command');
        const subtitleText = escapeHtml(this.getAttribute('subtitle') || 'Design Program Planning, Scheduling, and Scenario Control');

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    font-family: var(--f-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif);
                }
                * { box-sizing: border-box; }

                header {
                    background: var(--f-surface, #ffffff);
                    color: var(--f-ink, #0d1117);
                    border: 1px solid var(--f-hairline, #c9d1d9);
                    border-top: 4px solid var(--f-rule, #111827);
                    padding: 20px 24px;
                }

                .header-shell {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 24px;
                    max-width: 1440px;
                    margin: 0 auto;
                }

                .header-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    width: max-content;
                    font-size: 11px;
                    letter-spacing: 0;
                    font-family: var(--f-mono, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace);
                    font-weight: 850;
                    color: var(--f-soft, #6a737d);
                    text-transform: uppercase;
                    margin-bottom: 8px;
                }

                .header-eyebrow::before {
                    content: "";
                    width: 9px;
                    height: 9px;
                    border-radius: 999px;
                    background: var(--f-green, #1a7f37);
                    flex: 0 0 auto;
                }

                h1 {
                    font-size: clamp(1.55rem, 2.6vw, 2.1rem);
                    font-weight: 760;
                    line-height: 1.08;
                    margin: 0;
                    letter-spacing: 0;
                    color: var(--f-ink, #0d1117);
                }

                .subtitle {
                    font-size: 14px;
                    color: var(--f-muted, #3f4652);
                    font-weight: 400;
                    margin: 6px 0 0 0;
                    max-width: 720px;
                }

                .header-actions {
                    position: relative;
                }

                .header-settings-button {
                    background: var(--f-rule, #111827);
                    color: var(--f-ink-inverse, #ffffff);
                    border: 1px solid var(--f-rule, #111827);
                    border-radius: 0;
                    padding: 9px 14px;
                    font-size: 14px;
                    font-weight: 760;
                    line-height: 1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    min-height: 38px;
                    transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
                }

                .header-settings-button:hover {
                    background: var(--f-ink, #0d1117);
                    border-color: var(--f-ink, #0d1117);
                    transform: translateY(-1px);
                }

                .header-settings-button:focus-visible {
                    outline: none;
                    box-shadow: var(--f-focus, 0 0 0 3px rgba(9, 105, 218, .22));
                }

                .header-settings-menu {
                    position: absolute;
                    right: 0;
                    top: calc(100% + 8px);
                    z-index: 1100;
                    width: 270px;
                    padding: 6px;
                    display: none;
                    flex-direction: column;
                    background: var(--f-surface, #ffffff);
                    border: 1px solid var(--f-hairline, #c9d1d9);
                    border-radius: 0;
                    box-shadow: var(--f-shadow, 0 1px 2px rgba(15, 23, 42, .05), 0 18px 45px rgba(15, 23, 42, .08));
                    color: var(--f-ink, #0d1117);
                }

                .header-settings-section-label {
                    font-size: 11px;
                    font-family: var(--f-mono, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace);
                    font-weight: 850;
                    color: var(--f-soft, #6a737d);
                    padding: 8px 9px 6px;
                    text-transform: uppercase;
                    letter-spacing: 0;
                }

                .header-settings-divider {
                    height: 1px;
                    background: var(--f-hairline, #c9d1d9);
                    margin: 6px 0;
                }

                .header-settings-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 9px 10px;
                    cursor: pointer;
                    background: transparent;
                    border: 1px solid transparent;
                    border-left: 3px solid transparent;
                    text-align: left;
                    font-size: 14px;
                    font-weight: 650;
                    color: var(--f-ink, #0d1117);
                    border-radius: 0;
                    transition: background-color 0.14s ease, border-color 0.14s ease;
                }

                .header-settings-item:hover {
                    background: var(--f-surface-subtle, #f1f2f4);
                    border-left-color: var(--f-blue, #0969da);
                }

                .header-settings-item:focus-visible {
                    outline: none;
                    box-shadow: var(--f-focus, 0 0 0 3px rgba(9, 105, 218, .22));
                }

                .header-settings-item-disabled,
                .header-settings-item-disabled:hover {
                    opacity: 0.55;
                    background: var(--f-surface-subtle, #f1f2f4);
                    border-left-color: transparent;
                    cursor: not-allowed;
                }

                .header-settings-item-icon {
                    width: 16px;
                    text-align: center;
                }

                @media (max-width: 640px) {
                    .header-shell {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 12px;
                    }
                    .header-actions {
                        align-self: flex-start;
                    }
                    .header-settings-menu {
                        right: auto;
                        left: 0;
                        width: min(92vw, 320px);
                    }
                    h1 { font-size: 1.55rem; }
                }
            </style>
            
            <header>
                <div class="header-shell">
                    <div class="header-copy">
                        <div class="header-eyebrow">${eyebrow}</div>
                        <h1>${titleText}</h1>
                        <p class="subtitle">${subtitleText}</p>
                    </div>
                    <div class="header-actions">
                        <button class="header-settings-button" id="headerSettingsButton" type="button" aria-haspopup="true" aria-expanded="false" title="Open settings and actions">
                            <span aria-hidden="true">⚙️</span>
                            <span>Settings</span>
                        </button>
                        <div class="header-settings-menu" id="headerSettingsMenu" role="menu">
                            <div class="header-settings-section-label">Schedule</div>
                            <button class="header-settings-item" type="button" data-action="save">
                                <span class="header-settings-item-icon">💾</span>
                                <span>Save Schedule</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="conflicts">
                                <span class="header-settings-item-icon">🔍</span>
                                <span>Detect Conflicts</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="print">
                                <span class="header-settings-item-icon">🖨️</span>
                                <span>Print Schedule</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="sheets">
                                <span class="header-settings-item-icon">📊</span>
                                <span>Export to Sheets</span>
                            </button>
                            <div class="header-settings-divider"></div>
                            <div class="header-settings-section-label">Dashboards</div>
                            <button class="header-settings-item" type="button" data-action="nav-enrollment">
                                <span class="header-settings-item-icon">📈</span>
                                <span>Enrollment Trends</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="nav-workload">
                                <span class="header-settings-item-icon">👥</span>
                                <span>Faculty Workload</span>
                            </button>
                            <div class="header-settings-divider"></div>
                            <div class="header-settings-section-label">Configuration</div>
                            <button class="header-settings-item" type="button" data-action="rules" data-rbac-action="write" data-rbac-resource="system-config" data-denied-message="Insufficient permissions: only admins can change constraint rules.">
                                <span class="header-settings-item-icon">📋</span>
                                <span>Constraint Rules</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="api" data-rbac-action="manage" data-rbac-resource="system-config" data-denied-message="Insufficient permissions: only admins can access API connections.">
                                <span class="header-settings-item-icon">🔐</span>
                                <span>AI & API Settings</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="accounts" data-rbac-action="manage" data-rbac-resource="accounts" data-denied-message="Insufficient permissions: only admins can manage users and accounts.">
                                <span class="header-settings-item-icon">👤</span>
                                <span>Users & Accounts</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>
        `;
    }
}

customElements.define('app-header', AppHeader);
