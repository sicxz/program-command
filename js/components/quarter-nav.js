class QuarterNav extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Initial state
        this.currentYear = '2025-26';
        this.currentQuarter = 'spring';
        this.years = ['2025-26', '2026-27'];
        this.quarters = ['fall', 'winter', 'spring'];

        // Map quarters to display years based on academic year
        this.getDisplayYear = (quarter) => {
            const parts = this.currentYear.split('-');
            if (parts.length !== 2) return '';

            const startYear = parseInt(parts[0]);
            // Fall is the start of the academic year, Winter/Spring are the next calendar year
            if (quarter === 'fall') return startYear.toString();
            return (startYear + 1).toString();
        };
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();

        // Listen for external state changes to keep component in sync
        window.addEventListener('state-change', this.handleExternalStateChange.bind(this));
    }

    disconnectedCallback() {
        this.removeEventListeners();
        window.removeEventListener('state-change', this.handleExternalStateChange.bind(this));
    }

    handleExternalStateChange(e) {
        if (e.detail && e.detail.key === 'currentQuarter' && e.detail.value !== this.currentQuarter) {
            this.currentQuarter = e.detail.value;
            this.updateActiveTab();
        }
        if (e.detail && e.detail.key === 'currentYear' && e.detail.value !== this.currentYear) {
            this.currentYear = e.detail.value;
            this.render(); // Re-render to update the select options and display years
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        const tabs = this.shadowRoot.querySelectorAll('.quarter-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const quarter = e.currentTarget.dataset.quarter;
                if (quarter !== this.currentQuarter) {
                    this.currentQuarter = quarter;
                    this.updateActiveTab();

                    // Dispatch custom event for the app to handle
                    this.dispatchEvent(new CustomEvent('quarter-change', {
                        detail: { quarter },
                        bubbles: true,
                        composed: true
                    }));
                }
            });
        });

        const yearSelect = this.shadowRoot.getElementById('yearSelect');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                const year = e.target.value;
                if (year !== this.currentYear) {
                    this.currentYear = year;
                    this.render(); // Re-render to update display years on tabs
                    this.setupEventListeners();

                    this.dispatchEvent(new CustomEvent('year-change', {
                        detail: { year },
                        bubbles: true,
                        composed: true
                    }));
                }
            });
        }

        const copyBtn = this.shadowRoot.querySelector('.copy-year-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('copy-year', {
                    bubbles: true,
                    composed: true
                }));
            });
        }
    }

    removeEventListeners() {
        // Events are mostly cleaned up on render, but good practice
        const tabs = this.shadowRoot.querySelectorAll('.quarter-tab');
        tabs.forEach(tab => tab.replaceWith(tab.cloneNode(true)));
    }

    updateActiveTab() {
        const tabs = this.shadowRoot.querySelectorAll('.quarter-tab');
        tabs.forEach(tab => {
            if (tab.dataset.quarter === this.currentQuarter) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    render() {
        const yearOptions = this.years.map(y =>
            `<option value="${y}" ${y === this.currentYear ? 'selected' : ''}>${y}</option>`
        ).join('');

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    font-family: var(--f-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif);
                }
                * { box-sizing: border-box; }

                .year-nav {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin: 14px 0 10px;
                    flex-wrap: wrap;
                    gap: 12px;
                }

                .year-selector {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: var(--f-surface, #ffffff);
                    padding: 10px 12px;
                    border-radius: 0;
                    border: 1px solid var(--f-hairline, #c9d1d9);
                    border-left: 4px solid var(--f-rule, #111827);
                    box-shadow: none;
                }

                .year-selector label {
                    font-family: var(--f-mono, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace);
                    font-weight: 850;
                    color: var(--f-soft, #6a737d);
                    font-size: 11px;
                    letter-spacing: 0;
                    text-transform: uppercase;
                }

                select {
                    padding: 8px 32px 8px 10px;
                    border: 1px solid var(--f-hairline, #c9d1d9);
                    border-radius: 0;
                    background-color: var(--f-surface-subtle, #f1f2f4);
                    font-size: 14px;
                    font-weight: 650;
                    color: var(--f-ink, #0d1117);
                    cursor: pointer;
                    appearance: none;
                    background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2324292f%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
                    background-repeat: no-repeat;
                    background-position: right 10px top 50%;
                    background-size: 10px auto;
                }

                select:focus-visible {
                    outline: none;
                    box-shadow: var(--f-focus, 0 0 0 3px rgba(9, 105, 218, .22));
                    border-color: var(--f-blue, #0969da);
                }

                .copy-year-btn {
                    padding: 8px 12px;
                    background: transparent;
                    border: 1px solid var(--f-hairline, #c9d1d9);
                    border-radius: 0;
                    color: var(--f-muted, #3f4652);
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
                }

                .copy-year-btn:hover {
                    background: var(--f-surface-subtle, #f1f2f4);
                    color: var(--f-ink, #0d1117);
                    border-color: var(--f-rule, #111827);
                }

                .copy-year-btn:focus-visible {
                    outline: none;
                    box-shadow: var(--f-focus, 0 0 0 3px rgba(9, 105, 218, .22));
                }

                .quarter-tabs {
                    display: flex;
                    gap: 0;
                    margin-bottom: 14px;
                    background: var(--f-surface, #ffffff);
                    padding: 0;
                    border-radius: 0;
                    border: 1px solid var(--f-hairline, #c9d1d9);
                    box-shadow: none;
                }

                .quarter-tab {
                    flex: 1;
                    padding: 12px 16px;
                    border: none;
                    border-right: 1px solid var(--f-hairline, #c9d1d9);
                    background: transparent;
                    border-radius: 0;
                    font-size: 14px;
                    font-weight: 760;
                    color: var(--f-muted, #3f4652);
                    cursor: pointer;
                    transition: background-color 0.15s ease, color 0.15s ease;
                    display: flex;
                    align-items: baseline;
                    justify-content: center;
                    gap: 6px;
                }

                .quarter-tab:last-child {
                    border-right: none;
                }

                .quarter-tab:hover:not(.active) {
                    background: var(--f-surface-subtle, #f1f2f4);
                    color: var(--f-ink, #0d1117);
                }

                .quarter-tab.active {
                    background: var(--f-rule, #111827);
                    color: var(--f-ink-inverse, #ffffff);
                    box-shadow: inset 0 -4px 0 var(--f-blue, #0969da);
                }

                .quarter-tab:focus-visible {
                    outline: none;
                    box-shadow: var(--f-focus, 0 0 0 3px rgba(9, 105, 218, .22));
                    z-index: 1;
                }

                .tab-year {
                    font-family: var(--f-mono, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace);
                    font-size: 12px;
                    font-weight: 650;
                    opacity: 0.78;
                }

                .quarter-tab.active .tab-year {
                    color: rgba(255, 255, 255, 0.9);
                }

                @media (max-width: 640px) {
                    .quarter-tabs {
                        flex-direction: column;
                    }
                    .quarter-tab {
                        border-right: none;
                        border-bottom: 1px solid var(--f-hairline, #c9d1d9);
                    }
                    .quarter-tab:last-child {
                        border-bottom: none;
                    }
                    .year-nav {
                        justify-content: center;
                    }
                    .year-selector {
                        width: 100%;
                        justify-content: space-between;
                    }
                }
            </style>

            <div class="year-nav">
                <div class="year-selector">
                    <label>Academic Year:</label>
                    <select id="yearSelect">
                        ${yearOptions}
                    </select>
                    <button class="copy-year-btn" title="Copy current schedule to next year">
                        Copy to Next Year →
                    </button>
                </div>
            </div>

            <div class="quarter-tabs">
                <button class="quarter-tab ${this.currentQuarter === 'fall' ? 'active' : ''}" data-quarter="fall">
                    Fall <span class="tab-year">${this.getDisplayYear('fall')}</span>
                </button>
                <button class="quarter-tab ${this.currentQuarter === 'winter' ? 'active' : ''}" data-quarter="winter">
                    Winter <span class="tab-year">${this.getDisplayYear('winter')}</span>
                </button>
                <button class="quarter-tab ${this.currentQuarter === 'spring' ? 'active' : ''}" data-quarter="spring">
                    Spring <span class="tab-year">${this.getDisplayYear('spring')}</span>
                </button>
            </div>
        `;
    }
}

customElements.define('quarter-nav', QuarterNav);
