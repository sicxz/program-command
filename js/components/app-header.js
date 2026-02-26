class AppHeader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isOpen = false;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    disconnectedCallback() {
        this.removeEventListeners();
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
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                }
                * { box-sizing: border-box; }

                header {
                    background: linear-gradient(180deg, #3d444d 0%, #24292f 100%);
                    color: #ffffff;
                    padding: 1rem 1.25rem;
                }

                .header-shell {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .header-eyebrow {
                    font-size: 11px;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                    color: #d0d7de;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                }

                h1 {
                    font-size: 1.8rem;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.5px;
                }

                .subtitle {
                    font-size: 14px;
                    color: #d0d7de;
                    font-weight: 400;
                    margin: 4px 0 0 0;
                }

                .header-actions {
                    position: relative;
                }

                .header-settings-button {
                    background: #24292f;
                    color: #c9d1d9;
                    border: 1px solid #57606a;
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: 0.2s;
                }

                .header-settings-button:hover {
                    background: #30363d;
                    border-color: #8b949e;
                }

                .header-settings-menu {
                    position: absolute;
                    right: 0;
                    top: calc(100% + 8px);
                    z-index: 1100;
                    width: 250px;
                    padding: 8px;
                    display: none;
                    flex-direction: column;
                    background: #ffffff;
                    border: 1px solid #d0d7de;
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
                    color: #24292f;
                }

                .header-settings-section-label {
                    font-size: 12px;
                    font-weight: 600;
                    color: #57606a;
                    padding: 6px 8px;
                    text-transform: uppercase;
                }

                .header-settings-divider {
                    height: 1px;
                    background: #d0d7de;
                    margin: 8px 0;
                }

                .header-settings-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 8px;
                    cursor: pointer;
                    background: transparent;
                    border: none;
                    text-align: left;
                    font-size: 14px;
                    font-weight: 500;
                    color: #24292f;
                    border-radius: 6px;
                }

                .header-settings-item:hover {
                    background: #f6f8fa;
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
                        <div class="header-eyebrow">EWU DESIGN · PROGRAM COMMAND</div>
                        <h1>Program Command</h1>
                        <p class="subtitle">Design Program Planning, Scheduling, and Scenario Control</p>
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
                            <button class="header-settings-item" type="button" data-action="ai">
                                <span class="header-settings-item-icon">✨</span>
                                <span>AI Analysis</span>
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
                            <button class="header-settings-item" type="button" data-action="rules">
                                <span class="header-settings-item-icon">📋</span>
                                <span>Constraint Rules</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="api">
                                <span class="header-settings-item-icon">🔐</span>
                                <span>API Connections</span>
                            </button>
                            <button class="header-settings-item" type="button" data-action="accounts">
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
