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
                }
                * { box-sizing: border-box; }

                .year-nav {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 15px;
                }

                .year-selector {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: #ffffff;
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: 1px solid #d0d7de;
                    box-shadow: 0 1px 3px rgba(27, 31, 36, 0.04);
                }

                .year-selector label {
                    font-weight: 600;
                    color: #24292f;
                    font-size: 14px;
                }

                select {
                    padding: 6px 32px 6px 12px;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    background-color: #f6f8fa;
                    font-size: 14px;
                    font-weight: 500;
                    color: #24292f;
                    cursor: pointer;
                    appearance: none;
                    background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2324292f%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
                    background-repeat: no-repeat;
                    background-position: right 10px top 50%;
                    background-size: 10px auto;
                }

                .copy-year-btn {
                    padding: 6px 12px;
                    background: transparent;
                    border: 1px solid #d0d7de;
                    border-radius: 6px;
                    color: #57606a;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: 0.2s;
                }

                .copy-year-btn:hover {
                    background: #f6f8fa;
                    color: #24292f;
                    border-color: #8b949e;
                }

                .quarter-tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 24px;
                    background: #ffffff;
                    padding: 6px;
                    border-radius: 12px;
                    border: 1px solid #d0d7de;
                    box-shadow: 0 1px 3px rgba(27, 31, 36, 0.04);
                }

                .quarter-tab {
                    flex: 1;
                    padding: 12px 24px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    color: #57606a;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: baseline;
                    justify-content: center;
                    gap: 6px;
                }

                .quarter-tab:hover:not(.active) {
                    background: #f6f8fa;
                    color: #24292f;
                }

                .quarter-tab.active {
                    background: #0969da;
                    color: #ffffff;
                    box-shadow: 0 4px 12px rgba(9, 105, 218, 0.2);
                }

                .tab-year {
                    font-size: 13px;
                    font-weight: 500;
                    opacity: 0.8;
                }

                .quarter-tab.active .tab-year {
                    color: rgba(255, 255, 255, 0.9);
                }

                @media (max-width: 640px) {
                    .quarter-tabs {
                        flex-direction: column;
                        gap: 4px;
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
