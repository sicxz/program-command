class LensFilters extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.collapsed = true;

        // Default state
        this.track = 'all';
        this.minor = 'all';
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();

        // Listen to global state changes to reflect programmatic filter resets
        window.addEventListener('state-change', this.handleStateChange.bind(this));
    }

    disconnectedCallback() {
        this.removeEventListeners();
        window.removeEventListener('state-change', this.handleStateChange.bind(this));
    }

    handleStateChange(e) {
        if (!e.detail) return;

        let needsUpdate = false;
        if (e.detail.key === 'currentTrack' && this.track !== e.detail.value) {
            this.track = e.detail.value || 'all';
            needsUpdate = true;
        }
        if (e.detail.key === 'currentMinor' && this.minor !== e.detail.value) {
            this.minor = e.detail.value || 'all';
            needsUpdate = true;
        }

        if (needsUpdate) {
            this.updateSelects();
            this.updateStatus();
        }
    }

    setupEventListeners() {
        const toggle = this.shadowRoot.querySelector('.filters-toggle');
        const trackSelect = this.shadowRoot.getElementById('trackFilter');
        const minorSelect = this.shadowRoot.getElementById('minorFilter');
        const clearBtn = this.shadowRoot.querySelector('.btn-clear-lens');

        if (toggle) {
            toggle.addEventListener('click', () => {
                this.collapsed = !this.collapsed;
                this.updateCollapsedState();
            });
        }

        if (trackSelect) {
            trackSelect.addEventListener('change', (e) => {
                this.track = e.target.value;
                this.notifyFilterChange();
                this.updateStatus();
            });
        }

        if (minorSelect) {
            minorSelect.addEventListener('change', (e) => {
                this.minor = e.target.value;
                this.notifyFilterChange();
                this.updateStatus();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.track = 'all';
                this.minor = 'all';
                this.updateSelects();
                this.notifyFilterChange();
                this.updateStatus();

                this.dispatchEvent(new CustomEvent('clear-lens', {
                    bubbles: true,
                    composed: true
                }));
            });
        }
    }

    removeEventListeners() {
        // Simple DOM replacement on component teardown usually handles this,
        // but explicit removal is good practice for complex components.
    }

    notifyFilterChange() {
        this.dispatchEvent(new CustomEvent('filter-change', {
            detail: {
                track: this.track,
                minor: this.minor
            },
            bubbles: true,
            composed: true
        }));
    }

    updateCollapsedState() {
        const panel = this.shadowRoot.querySelector('.filters-panel');
        if (panel) {
            if (this.collapsed) {
                panel.classList.add('collapsed');
            } else {
                panel.classList.remove('collapsed');
            }
        }
    }

    updateSelects() {
        const trackSelect = this.shadowRoot.getElementById('trackFilter');
        const minorSelect = this.shadowRoot.getElementById('minorFilter');

        if (trackSelect) trackSelect.value = this.track;
        if (minorSelect) minorSelect.value = this.minor;
    }

    updateStatus() {
        const statusEl = this.shadowRoot.getElementById('lensStatus');
        if (!statusEl) return;

        let statusText = 'No advising lens active.';
        const trackSelect = this.shadowRoot.getElementById('trackFilter');
        const minorSelect = this.shadowRoot.getElementById('minorFilter');

        const trackName = trackSelect && trackSelect.value !== 'all' ? trackSelect.options[trackSelect.selectedIndex].text : '';
        const minorName = minorSelect && minorSelect.value !== 'all' ? minorSelect.options[minorSelect.selectedIndex].text : '';

        if (trackName && minorName) {
            statusText = `Showing courses for <strong>${trackName}</strong> and <strong>${minorName}</strong> minor.`;
        } else if (trackName) {
            statusText = `Showing courses for <strong>${trackName}</strong> track.`;
        } else if (minorName) {
            statusText = `Showing courses for <strong>${minorName}</strong> minor.`;
        }

        statusEl.innerHTML = statusText;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    margin-bottom: 24px;
                }
                * { box-sizing: border-box; }

                /* Primer style collapsible panel */
                .filters-panel {
                    background: #ffffff;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(27, 31, 36, 0.04);
                }

                .filters-toggle {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 16px;
                    background: #f6f8fa;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    color: #57606a;
                    border-bottom: 1px solid transparent;
                    transition: background 0.15s ease;
                }

                .filters-toggle:hover {
                    background: #eaeef2;
                    color: #24292f;
                }

                .filters-panel:not(.collapsed) .filters-toggle {
                    border-bottom-color: #d0d7de;
                }

                .filters-toggle .toggle-icon {
                    transition: transform 0.2s ease;
                    font-size: 10px;
                }

                .filters-panel.collapsed .toggle-icon {
                    transform: rotate(-90deg);
                }

                .filters-content {
                    padding: 16px;
                    background: #ffffff;
                    display: block;
                }

                .filters-panel.collapsed .filters-content {
                    display: none;
                }

                .filters-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    align-items: end;
                }

                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .filter-group label {
                    font-weight: 600;
                    color: #24292f;
                    font-size: 12px;
                }

                select {
                    width: 100%;
                    padding: 6px 32px 6px 12px;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    background-color: #f6f8fa;
                    font-size: 14px;
                    color: #24292f;
                    appearance: none;
                    background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2324292f%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
                    background-repeat: no-repeat;
                    background-position: right 10px top 50%;
                    background-size: 10px auto;
                    cursor: pointer;
                }

                .filters-actions {
                    flex-direction: row;
                    align-items: center;
                    justify-content: flex-start;
                    height: 32px; /* Match height of selects */
                }

                .btn-clear-lens {
                    padding: 5px 16px;
                    font-size: 13px;
                    font-weight: 500;
                    background: transparent;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    color: #57606a;
                    cursor: pointer;
                    transition: 0.2s;
                }

                .btn-clear-lens:hover {
                    background: #f6f8fa;
                    color: #24292f;
                    border-color: #8b949e;
                }

                .lens-status {
                    margin-top: 16px;
                    padding-top: 12px;
                    border-top: 1px solid #eaeef2;
                    font-size: 13px;
                    color: #57606a;
                }
            </style>

            <div class="filters-panel ${this.collapsed ? 'collapsed' : ''}">
                <div class="filters-toggle">
                    <span>🎯 Advising Lens</span>
                    <span class="toggle-icon">▼</span>
                </div>
                <div class="filters-content">
                    <div class="filters-grid">
                        <div class="filter-group">
                            <label for="trackFilter">Student Track:</label>
                            <select id="trackFilter">
                                <option value="all">All Tracks</option>
                                <option value="ux">UX Design</option>
                                <option value="interaction-design">Interaction Design</option>
                                <option value="web-development">Web Development</option>
                                <option value="animation">Animation</option>
                                <option value="game-design">Game Design</option>
                                <option value="motion">Motion Design</option>
                                <option value="photography">Photography</option>
                            </select>
                        </div>

                        <div class="filter-group">
                            <label for="minorFilter">Program / Minor Lens:</label>
                            <select id="minorFilter">
                                <option value="all">No Minor Lens</option>
                                <option value="ux">UX/Interaction Design</option>
                                <option value="animation">Animation</option>
                                <option value="gameDesign">Game Design</option>
                                <option value="graphicDesign">Graphic Design</option>
                                <option value="photography">Photography</option>
                                <option value="webDevelopment">Web Development</option>
                            </select>
                        </div>

                        <div class="filter-group filters-actions">
                            <button class="btn-clear-lens" type="button">Clear Lens</button>
                        </div>
                    </div>
                    <div class="lens-status" id="lensStatus">No advising lens active.</div>
                </div>
            </div>
        `;

        // Ensure inputs reflect current state
        this.updateSelects();
        this.updateStatus();
    }
}

customElements.define('lens-filters', LensFilters);
