(function(globalScope) {
    'use strict';

    const TAG_NAME = 'advising-pathway-planner';
    const MAX_LENSES = 3;
    const DEGREEWORKS_URL = 'https://inside.ewu.edu/';

    const STATUS_CONTENT = {
        'fits-normal-horizon': {
            title: 'Fits the normal horizon',
            description: 'The modeled coursework and credit placeholders fit within the 12-term horizon.',
            symbol: '✓'
        },
        'requires-extension': {
            title: 'Requires an extended horizon',
            description: 'The earliest modeled worksheet uses one or more extension terms.',
            symbol: '→'
        },
        'no-known-sequence': {
            title: 'No known sequence',
            description: 'The approved rules do not produce a complete worksheet inside the supported planning horizon.',
            symbol: '!'
        },
        'advisor-review-required': {
            title: 'Advisor review required',
            description: 'At least one source or rule needs human review. The working preview below is non-authoritative.',
            symbol: '?'
        }
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        return Object.entries(value).map(([key, item]) => {
            if (item && typeof item === 'object') {
                return { id: item.id || key, ...item };
            }
            return item;
        });
    }

    function unique(values) {
        return [...new Set(values.filter((value) => value != null && String(value).trim() !== ''))];
    }

    function humanize(value) {
        return String(value || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function firstDefined(...values) {
        return values.find((value) => value !== undefined && value !== null && value !== '');
    }

    class AdvisingPathwayPlanner extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._curriculum = null;
            this._result = null;
            this._unavailableMessage = '';
            this._selectedLensIds = [];
            this._announcement = '';
            this._limitMessage = '';
            this._termOverrides = new Map();
            this._manualMoveWarnings = new Map();
            this._draggedCourseCode = '';
            this._boundLensClick = this._handleLensClick.bind(this);
            this._boundClearClick = this._handleClearClick.bind(this);
            this._boundMoveClick = this._handleMoveClick.bind(this);
            this._boundPlaceChange = this._handlePlaceChange.bind(this);
            this._boundResetMovesClick = this._handleResetMovesClick.bind(this);
            this._boundDragStart = this._handleDragStart.bind(this);
            this._boundDragEnd = this._handleDragEnd.bind(this);
            this._boundDragOver = this._handleDragOver.bind(this);
            this._boundDragLeave = this._handleDragLeave.bind(this);
            this._boundDrop = this._handleDrop.bind(this);
        }

        connectedCallback() {
            this._render();
        }

        get selectedLensIds() {
            return [...this._selectedLensIds];
        }

        setCurriculum(snapshot) {
            this._curriculum = snapshot || null;
            this._unavailableMessage = '';
            this._render();
        }

        setResult(result) {
            this._result = result || null;
            this._unavailableMessage = '';
            this._termOverrides.clear();
            this._manualMoveWarnings.clear();
            this._draggedCourseCode = '';
            if (result && Array.isArray(result.selectedLensIds)) {
                this._selectedLensIds = unique(result.selectedLensIds.map(String)).slice(0, MAX_LENSES);
            }
            this._render();
        }

        setUnavailable(error) {
            this._result = null;
            this._unavailableMessage = error instanceof Error
                ? error.message
                : String(error || 'The advising model could not be loaded.');
            this._render();
        }

        _getLenses() {
            return asArray(this._curriculum && this._curriculum.lenses)
                .filter((lens) => lens && lens.id)
                .map((lens) => ({ ...lens, id: String(lens.id) }));
        }

        _lensMap() {
            return new Map(this._getLenses().map((lens) => [lens.id, lens]));
        }

        _lensNeedsReview(lens) {
            const state = String(firstDefined(lens.reviewState, lens.status, lens.readiness, 'approved')).toLowerCase();
            if (state !== 'approved' || this._hasBlockingIssues(lens.issues)) return true;

            const courses = new Map(asArray(
                this._curriculum && this._curriculum.curriculum
                && this._curriculum.curriculum.courses
            ).map((course) => [String(firstDefined(course.code, course.id, '')), course]));
            return [...asArray(lens.requirementGroups), ...asArray(lens.supportRequirements)]
                .some((group) => this._groupNeedsReview(group, courses));
        }

        _hasBlockingIssues(issueIds) {
            const issues = new Map(asArray(this._curriculum && this._curriculum.issues)
                .map((issue) => [String(firstDefined(issue.id, '')), issue]));
            return asArray(issueIds).some((entry) => {
                const id = String(typeof entry === 'string' ? entry : firstDefined(entry.id, ''));
                const issue = typeof entry === 'object' ? entry : issues.get(id);
                return !issue || String(firstDefined(issue.planningImpact, 'blocking')).toLowerCase() !== 'informational';
            });
        }

        _courseNeedsReview(course) {
            if (!course) return true;
            return [course.reviewState, course.offeringReviewState]
                .filter(Boolean)
                .some((state) => String(state).toLowerCase() !== 'approved')
                || this._hasBlockingIssues(course.issues);
        }

        _groupNeedsReview(group, courses) {
            if (!group) return false;
            const state = String(firstDefined(group.reviewState, 'approved')).toLowerCase();
            if (state !== 'approved' || this._hasBlockingIssues(group.issues)) return true;

            const rawOptions = asArray(group.options);
            const options = rawOptions.length
                ? rawOptions.map((option) => asArray(firstDefined(option.courses, option.courseCodes, [])))
                : asArray(group.courses).map((code) => [code]);
            const approvedOptions = options.filter((option) => option.length > 0 && option.every((entry) => {
                const code = String(typeof entry === 'string' ? entry : firstDefined(entry.code, entry.courseCode, entry.id, ''));
                return !this._courseNeedsReview(courses.get(code));
            })).length;
            const required = String(firstDefined(group.type, 'all-of')).toLowerCase() === 'choose-n'
                ? Number(firstDefined(group.count, 1))
                : options.length;
            return approvedOptions < required;
        }

        _handleLensClick(event) {
            const button = event.currentTarget;
            const lensId = button && button.dataset.lensId;
            if (!lensId) return;

            const selected = this._selectedLensIds.includes(lensId);
            if (!selected && this._selectedLensIds.length >= MAX_LENSES) {
                this._announcement = 'You can select up to three lenses. Remove one before selecting another.';
                this._limitMessage = this._announcement;
                this._render();
                return;
            }

            this._selectedLensIds = selected
                ? this._selectedLensIds.filter((id) => id !== lensId)
                : [...this._selectedLensIds, lensId];

            const lens = this._lensMap().get(lensId);
            const name = lens ? lens.name : lensId;
            this._announcement = selected ? `${name} removed.` : `${name} selected.`;
            this._limitMessage = '';
            this._render();
            this._emitSelectionChange();
        }

        _handleClearClick() {
            if (this._selectedLensIds.length === 0) return;
            this._selectedLensIds = [];
            this._announcement = 'All optional lenses cleared. The BDes baseline remains.';
            this._limitMessage = '';
            this._render();
            this._emitSelectionChange();
        }

        _handleMoveClick(event) {
            const button = event.currentTarget;
            const courseCode = button && button.dataset.moveCode;
            const targetTermIndex = Number(button && button.dataset.targetTermIndex);
            if (!courseCode || !Number.isFinite(targetTermIndex)) return;
            this._moveCourse(courseCode, targetTermIndex);
        }

        _handlePlaceChange(event) {
            const select = event.currentTarget;
            const courseCode = select && select.dataset.moveCode;
            const rawTargetTermIndex = select && select.value;
            if (rawTargetTermIndex === '') return;
            const targetTermIndex = Number(rawTargetTermIndex);
            if (!courseCode || !Number.isFinite(targetTermIndex)) return;
            this._moveCourse(courseCode, targetTermIndex);
        }

        _handleResetMovesClick() {
            if (!this._termOverrides.size) return;
            const firstMovedCode = this._termOverrides.keys().next().value;
            this._termOverrides.clear();
            this._manualMoveWarnings.clear();
            this._announcement = 'Manual moves cleared. The planner-generated sequence is restored.';
            this._render();
            const restoredCard = [...this.shadowRoot.querySelectorAll('.course-card')]
                .find((card) => card.dataset.courseCode === firstMovedCode);
            if (restoredCard) {
                try {
                    restoredCard.focus({ preventScroll: true });
                } catch (error) {
                    restoredCard.focus();
                }
            }
        }

        _handleDragStart(event) {
            const card = event.currentTarget;
            const courseCode = card && card.dataset.courseCode;
            if (!courseCode) return;
            this._draggedCourseCode = courseCode;
            card.classList.add('dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', courseCode);
            }
        }

        _handleDragEnd(event) {
            this._draggedCourseCode = '';
            if (event.currentTarget) event.currentTarget.classList.remove('dragging');
            this.shadowRoot.querySelectorAll('.drop-target').forEach((term) => term.classList.remove('drop-target'));
        }

        _handleDragOver(event) {
            if (!this._draggedCourseCode) return;
            event.preventDefault();
            event.currentTarget.classList.add('drop-target');
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        }

        _handleDragLeave(event) {
            if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
            event.currentTarget.classList.remove('drop-target');
        }

        _handleDrop(event) {
            event.preventDefault();
            const target = event.currentTarget;
            target.classList.remove('drop-target');
            const transferred = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
            const courseCode = transferred || this._draggedCourseCode;
            const targetTermIndex = Number(target.dataset.termIndex);
            this._draggedCourseCode = '';
            if (!courseCode || !Number.isFinite(targetTermIndex)) return;
            this._moveCourse(courseCode, targetTermIndex);
        }

        _moveCourse(courseCode, targetTermIndex) {
            const courseMap = this._buildCourseMap();
            const terms = this._getDisplayTerms();
            const currentTerm = terms.find((term) => this._getEffectiveCourseCodes(term).includes(courseCode));
            const targetTerm = terms.find((term) => Number(term.index) === Number(targetTermIndex));
            if (!targetTerm || (currentTerm && Number(currentTerm.index) === Number(targetTerm.index))) return;

            this._termOverrides.set(courseCode, Number(targetTerm.index));
            const course = courseMap.get(courseCode) || {};
            const title = firstDefined(course.title, course.name, courseCode);
            const kind = String(firstDefined(course.kind, '')).toLowerCase();
            const placeholder = course.placeholder === true || kind === 'gen-ed' || kind === 'major-elective' || kind === 'open-elective';
            const offeredQuarterValues = Array.isArray(course.offeredQuarters)
                ? course.offeredQuarters
                : course.offeredQuarters ? [course.offeredQuarters] : [];
            const offeredQuarters = offeredQuarterValues.map((quarter) => String(quarter).trim().toLowerCase()).filter(Boolean);
            const targetQuarter = String(firstDefined(targetTerm.quarter, targetTerm.term, targetTerm.name, 'target quarter'));
            const outsideKnownOffering = !placeholder
                && offeredQuarters.length > 0
                && !offeredQuarters.includes(targetQuarter.trim().toLowerCase());
            const warning = outsideKnownOffering
                ? `Not historically offered in ${targetQuarter}; chair review required.`
                : 'Prerequisites, offerings, standing, and credit limits require advisor review.';
            this._manualMoveWarnings.set(courseCode, warning);
            this._announcement = `${title} ${currentTerm ? 'moved' : 'placed'} in ${targetTerm.label} for this working preview. ${warning}`;
            this._render();
            if (!currentTerm) {
                const placedCard = [...this.shadowRoot.querySelectorAll('.course-card')]
                    .find((card) => card.dataset.courseCode === courseCode);
                if (placedCard) {
                    try {
                        placedCard.focus({ preventScroll: true });
                    } catch (error) {
                        placedCard.focus();
                    }
                }
            }
        }

        _emitSelectionChange() {
            this.dispatchEvent(new CustomEvent('advising-selection-change', {
                detail: { lensIds: [...this._selectedLensIds] },
                bubbles: true,
                composed: true
            }));
        }

        _captureFocusKey() {
            const active = this.shadowRoot && this.shadowRoot.activeElement;
            return active && active.getAttribute ? active.getAttribute('data-focus-key') : '';
        }

        _restoreFocus(focusKey) {
            if (!focusKey) return;
            const target = [...this.shadowRoot.querySelectorAll('[data-focus-key]')]
                .find((element) => element.getAttribute('data-focus-key') === focusKey);
            if (!target) return;
            try {
                target.focus({ preventScroll: true });
            } catch (error) {
                target.focus();
            }
        }

        _bindInteractions() {
            this.shadowRoot.querySelectorAll('[data-lens-id]').forEach((button) => {
                button.addEventListener('click', this._boundLensClick);
            });
            const clearButton = this.shadowRoot.querySelector('[data-clear-lenses]');
            if (clearButton) clearButton.addEventListener('click', this._boundClearClick);
            this.shadowRoot.querySelectorAll('[data-move-course]').forEach((button) => {
                button.addEventListener('click', this._boundMoveClick);
            });
            this.shadowRoot.querySelectorAll('[data-place-course]').forEach((select) => {
                select.addEventListener('change', this._boundPlaceChange);
            });
            const resetMovesButton = this.shadowRoot.querySelector('[data-reset-moves]');
            if (resetMovesButton) resetMovesButton.addEventListener('click', this._boundResetMovesClick);
            this.shadowRoot.querySelectorAll('[draggable="true"][data-course-code]').forEach((card) => {
                card.addEventListener('dragstart', this._boundDragStart);
                card.addEventListener('dragend', this._boundDragEnd);
            });
            this.shadowRoot.querySelectorAll('[data-term-index]').forEach((term) => {
                term.addEventListener('dragover', this._boundDragOver);
                term.addEventListener('dragleave', this._boundDragLeave);
                term.addEventListener('drop', this._boundDrop);
            });
        }

        _render() {
            if (!this.isConnected) return;
            const focusKey = this._captureFocusKey();
            let content;

            if (this._unavailableMessage) {
                content = this._renderUnavailable();
            } else if (!this._curriculum) {
                content = this._renderLoading();
            } else {
                content = this._renderPlanner();
            }

            this.shadowRoot.innerHTML = `${this._styles()}${content}`;
            this._bindInteractions();
            this._restoreFocus(focusKey);
        }

        _renderLoading() {
            return `
                <section class="planner-shell loading-shell" aria-labelledby="advisingPlannerTitle" aria-busy="true">
                    ${this._renderHeader()}
                    <div class="state-card" role="status">
                        <span class="state-mark" aria-hidden="true"></span>
                        <div>
                            <h3>Loading the advising model…</h3>
                            <p>Checking the BDes baseline, lens rules, and dated offering guidance.</p>
                        </div>
                    </div>
                </section>`;
        }

        _renderUnavailable() {
            return `
                <section class="planner-shell" aria-labelledby="advisingPlannerTitle">
                    ${this._renderHeader()}
                    <div class="state-card unavailable" role="alert">
                        <span class="state-icon" aria-hidden="true">!</span>
                        <div>
                            <h3>Advising model unavailable</h3>
                            <p>${escapeHtml(this._unavailableMessage)}</p>
                            <p class="muted">No schedule or student data was changed. Other Program Command tools remain available.</p>
                        </div>
                    </div>
                </section>`;
        }

        _renderHeader() {
            return `
                <header class="planner-header">
                    <div>
                        <p class="eyebrow">Advisor-led planning · Generic 2026–27 model</p>
                        <h2 id="advisingPlannerTitle">BDes pathway planner</h2>
                        <p class="lede">Compare optional pathway and minor lenses in one source-backed Design and Art course map.</p>
                    </div>
                    <a class="degreeworks-link" href="${DEGREEWORKS_URL}" target="_blank" rel="noopener noreferrer">
                        Open InsideEWU for DegreeWorks
                        <span aria-hidden="true">↗</span>
                    </a>
                </header>`;
        }

        _renderPlanner() {
            const curriculum = this._curriculum.curriculum || {};
            const bdes = curriculum.bdes || {};
            const lenses = this._getLenses();
            const selectedNames = this._selectedLensIds.map((id) => {
                const lens = this._lensMap().get(id);
                return lens ? lens.name : id;
            });
            const limitReached = this._selectedLensIds.length >= MAX_LENSES;
            const catalogYear = firstDefined(curriculum.year, this._curriculum.catalogYear, '2026–27');
            const offeringDate = this._getOfferingDate();

            const lensButtons = lenses.map((lens) => {
                const selected = this._selectedLensIds.includes(lens.id);
                const needsReview = this._lensNeedsReview(lens);
                const capped = limitReached && !selected;
                const readiness = needsReview ? 'Advisor review required' : 'Source reviewed';
                return `
                    <button class="lens-button${selected ? ' selected' : ''}${needsReview ? ' review' : ''}"
                        type="button"
                        data-lens-id="${escapeHtml(lens.id)}"
                        data-focus-key="lens-${escapeHtml(lens.id)}"
                        aria-pressed="${selected}"
                        aria-disabled="${capped}"
                        aria-describedby="lensHelp lensLimitMessage"
                        aria-label="${escapeHtml(`${lens.name}; ${readiness}; ${selected ? 'selected' : 'not selected'}`)}">
                        <span class="lens-control" aria-hidden="true">${selected ? '✓' : '+'}</span>
                        <span class="lens-copy">
                            <span class="lens-name">${escapeHtml(lens.name)}</span>
                            <span class="readiness ${needsReview ? 'review' : 'ready'}">${escapeHtml(readiness)}</span>
                        </span>
                    </button>`;
            }).join('');

            return `
                <section class="planner-shell" aria-labelledby="advisingPlannerTitle">
                    ${this._renderHeader()}

                    <section class="baseline-card" aria-labelledby="baselineTitle">
                        <div class="baseline-symbol" aria-hidden="true">B</div>
                        <div>
                            <p class="section-kicker">Fixed foundation</p>
                            <h3 id="baselineTitle">BDes baseline <span>Always included</span></h3>
                            <p>${escapeHtml(firstDefined(curriculum.name, 'Bachelor of Design'))} · ${escapeHtml(catalogYear)} catalog model · ${escapeHtml(firstDefined(bdes.creditsRequired, 95))} named major credits</p>
                        </div>
                    </section>

                    <section class="lens-section" aria-labelledby="lensTitle">
                        <div class="section-heading">
                            <div>
                                <p class="section-kicker">Optional lenses</p>
                                <h3 id="lensTitle">What should this conversation explore?</h3>
                            </div>
                            <span class="selection-count">${this._selectedLensIds.length} of ${MAX_LENSES} selected</span>
                        </div>
                        <p id="lensHelp" class="muted">Select up to three. A review label means the lens stays usable as a working preview while its source needs confirmation.</p>
                        <div class="lens-grid" role="group" aria-label="Pathway and minor lenses">
                            ${lensButtons}
                        </div>
                        <div class="selection-summary">
                            <div>
                                <span class="summary-label">Current comparison</span>
                                <strong>${escapeHtml(selectedNames.length ? selectedNames.join(' + ') : 'BDes baseline only')}</strong>
                            </div>
                            <button type="button" class="clear-button" data-clear-lenses data-focus-key="clear-lenses" ${selectedNames.length ? '' : 'disabled'}>Clear optional lenses</button>
                        </div>
                        <p id="lensLimitMessage" class="${this._limitMessage ? 'limit-message' : 'sr-only'}" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(this._announcement)}</p>
                    </section>

                    <section class="model-strip" aria-label="Model boundaries">
                        <span><strong>Catalog model</strong> ${escapeHtml(catalogYear)}</span>
                        <span><strong>Usual offerings as of</strong> ${escapeHtml(offeringDate)}</span>
                        <span><strong>Starts</strong> Fall (planning assumption)</span>
                    </section>

                    ${this._result ? this._renderResult() : this._renderPlanningState()}
                </section>`;
        }

        _renderPlanningState() {
            return `
                <div class="state-card" role="status" aria-busy="true">
                    <span class="state-mark" aria-hidden="true"></span>
                    <div>
                        <h3>Building the pathway preview…</h3>
                        <p>Applying prerequisites, usual offering patterns, choices, and the displayed planning limits.</p>
                    </div>
                </div>`;
        }

        _renderResult() {
            const statusKey = STATUS_CONTENT[this._result.status]
                ? this._result.status
                : 'advisor-review-required';
            const status = STATUS_CONTENT[statusKey];
            const courseMap = this._buildCourseMap();
            const sequence = this._renderSequence(courseMap);
            const selectedNames = this._selectedLensIds.map((id) => {
                const lens = this._lensMap().get(id);
                return lens ? lens.name : id;
            });

            return `
                <section class="result-section" aria-labelledby="resultTitle">
                    <div class="status-banner ${escapeHtml(statusKey)}" data-status="${escapeHtml(statusKey)}" role="status" aria-live="polite">
                        <span class="status-symbol" aria-hidden="true">${status.symbol}</span>
                        <div>
                            <p class="section-kicker">Combined result</p>
                            <h3 id="resultTitle">${escapeHtml(status.title)}</h3>
                            <p>${escapeHtml(status.description)}</p>
                            ${statusKey === 'advisor-review-required' ? '<p class="preview-note"><strong>Working preview retained:</strong> use the sequence to guide the conversation, not as an authoritative determination.</p>' : ''}
                            ${this._termOverrides.size ? '<p class="preview-note"><strong>Manual layout in view:</strong> this status describes the planner-generated sequence, not the moved worksheet.</p>' : ''}
                        </div>
                    </div>

                    <div class="boundary-copy">
                        <p><strong>Modeled inputs:</strong> BDes baseline${selectedNames.length ? ` + ${escapeHtml(selectedNames.join(' + '))}` : ''}.</p>
                        <p><strong>Credit placeholders:</strong> general education, BDes elective, and open degree cards reserve planning space only; their student-specific requirements are not modeled.</p>
                        <p><strong>Not modeled:</strong> individual course history, transfer decisions, live seats, capacity, and guaranteed future sections.</p>
                        <p>Verify the student’s applicable catalog year, DegreeWorks audit, and counting rules before recording a plan.</p>
                    </div>

                    ${this._renderSummaryCards(courseMap)}
                    ${this._renderChoiceGroups()}
                    ${this._renderManualMoveNotice()}
                    ${sequence.placed}
                    ${sequence.unplaced}
                    ${this._renderLedger()}
                    ${this._renderSources()}

                    <aside class="degreeworks-callout" aria-label="Student record handoff">
                        <div>
                            <p class="section-kicker">Student-specific record</p>
                            <h3>Confirm the plan in DegreeWorks</h3>
                            <p>This planner stores no student record. Use the EWU audit to verify catalog year, completed work, substitutions, and official counting.</p>
                        </div>
                        <a class="degreeworks-link" href="${DEGREEWORKS_URL}" target="_blank" rel="noopener noreferrer">Open InsideEWU for DegreeWorks <span aria-hidden="true">↗</span></a>
                    </aside>
                </section>`;
        }

        _renderManualMoveNotice() {
            if (!this._termOverrides.size) return '';
            return `
                <aside class="manual-move-notice" role="status" aria-live="polite">
                    <div>
                        <p class="section-kicker">Manual worksheet layout</p>
                        <h3>Advisor review required after ${this._termOverrides.size} ${this._termOverrides.size === 1 ? 'move' : 'moves'}</h3>
                        <p>These moves are temporary and unsaved. Prerequisites, usual offerings, standing, and term credit limits have not been revalidated.</p>
                    </div>
                    <button type="button" data-reset-moves data-focus-key="reset-manual-moves">Restore generated sequence</button>
                </aside>`;
        }

        _renderSummaryCards(courseMap) {
            const progress = this._result.electiveProgress || {};
            const required = Number(firstDefined(progress.requiredCredits, 40));
            const contributed = Number(firstDefined(progress.contributedCredits, progress.appliedCredits, 0));
            const open = Number(firstDefined(progress.openCredits, Math.max(0, required - contributed)));
            const metrics = this._result.metrics || {};
            const degreeRequirements = this._curriculum.curriculum && this._curriculum.curriculum.degreeRequirements || {};
            const totalDegreeCredits = Number(degreeRequirements.totalCredits);
            const upperDivisionCredits = Number(degreeRequirements.upperDivisionCredits);
            const plannedCredits = Number(metrics.totalPlannedCredits);
            const hasCreditGap = Number.isFinite(totalDegreeCredits)
                && totalDegreeCredits > 0
                && Number.isFinite(plannedCredits)
                && plannedCredits < totalDegreeCredits;
            const displayTerms = this._getDisplayTerms();
            const displayTermCount = displayTerms.length;
            const usesExtension = displayTerms.some((term) => term.isExtension);
            const planningHeading = Number.isFinite(totalDegreeCredits) && totalDegreeCredits > 0
                ? hasCreditGap
                    ? `${plannedCredits} of ${totalDegreeCredits} credits placed`
                    : `${totalDegreeCredits}-credit / ${displayTermCount}-term worksheet${usesExtension ? ' with extension' : ''}`
                : `${displayTermCount}-term worksheet${usesExtension ? ' with extension' : ''}`;
            const upperDivisionLabel = Number.isFinite(upperDivisionCredits) && upperDivisionCredits > 0
                ? `${upperDivisionCredits}-credit upper-division requirement`
                : 'Upper-division requirement';
            const overlapCount = Number(firstDefined(metrics.overlapCourseCount, this._countOverlapCourses(courseMap), 0));
            const boundedContributed = Math.max(0, Math.min(required || contributed, contributed));
            const qualification = firstDefined(
                progress.qualification,
                'Selected Design courses may contribute to the BDes elective total; DegreeWorks determines official counting for an individual student.'
            );

            return `
                <div class="summary-grid" aria-label="Plan summary">
                    <section class="summary-card elective-card" aria-labelledby="electiveTitle">
                        <p class="section-kicker">BDes electives</p>
                        <h3 id="electiveTitle">${escapeHtml(contributed)} of ${escapeHtml(required)} credits contributed</h3>
                        <div class="progress-track" role="progressbar" aria-label="BDes elective credits represented by named courses" aria-valuemin="0" aria-valuemax="${escapeHtml(required)}" aria-valuenow="${escapeHtml(boundedContributed)}">
                            <span style="width: ${required > 0 ? Math.min(100, Math.max(0, (contributed / required) * 100)) : 0}%"></span>
                        </div>
                        <p><strong>${escapeHtml(open)} credits remain open.</strong> ${escapeHtml(qualification)}</p>
                    </section>
                    <section class="summary-card overlap-card" aria-labelledby="overlapTitle">
                        <p class="section-kicker">Source-level overlap</p>
                        <h3 id="overlapTitle">${escapeHtml(overlapCount)} shared ${overlapCount === 1 ? 'course' : 'courses'}</h3>
                        <p>A shared marker means a course appears in multiple source curricula. It does <strong>not</strong> guarantee official double-counting.</p>
                    </section>
                    <section class="summary-card limits-card" aria-labelledby="limitsTitle">
                        <p class="section-kicker">Planning envelope</p>
                        <h3 id="limitsTitle">${escapeHtml(planningHeading)}</h3>
                        <p>Fall/Winter/Spring only, at most ${escapeHtml(firstDefined(metrics.maxCreditsPerTerm, this._curriculum.planningLimits && this._curriculum.planningLimits.maxCreditsPerTerm, 15))} modeled credits per term, including credit placeholders.</p>
                        <p><strong>${escapeHtml(upperDivisionLabel)}:</strong> placeholder and open-degree cards reserve credit space but do not prove this total. Verify upper-division credits and actual categories in DegreeWorks.</p>
                    </section>
                </div>`;
        }

        _buildCourseMap() {
            const map = new Map();
            asArray(this._result && this._result.courses).forEach((course) => {
                if (!course) return;
                const code = String(firstDefined(course.code, course.courseCode, course.id, '')).trim();
                if (!code) return;
                const existing = map.get(code) || {};
                map.set(code, {
                    ...existing,
                    ...course,
                    code,
                    contributionIds: unique([
                        ...this._getContributionIds(existing),
                        ...this._getContributionIds(course)
                    ]),
                    sourceIds: unique([
                        ...asArray(existing.sourceIds),
                        ...asArray(course.sourceIds)
                    ])
                });
            });
            return map;
        }

        _getContributionIds(course) {
            const raw = firstDefined(course && course.contributionIds, course && course.contributions, course && course.requirementIds, []);
            return asArray(raw).map((entry) => {
                if (entry && typeof entry === 'object') {
                    return firstDefined(entry.id, entry.lensId, entry.label, entry.name);
                }
                return entry;
            }).filter(Boolean).map(String);
        }

        _contributionLabel(id) {
            const normalized = String(id || '').toLowerCase();
            if (normalized === 'bdes' || normalized === 'bdes-baseline' || normalized === 'baseline') {
                return 'BDes baseline';
            }
            const lens = this._lensMap().get(String(id));
            return lens ? lens.name : humanize(id);
        }

        _countOverlapCourses(courseMap) {
            let count = 0;
            courseMap.forEach((course) => {
                if (unique(this._getContributionIds(course)).length > 1) count += 1;
            });
            return count;
        }

        _getRawTermCourses(term) {
            return Array.isArray(term.courseCodes) ? term.courseCodes : asArray(term.courses);
        }

        _getRawTermCourseCodes(term) {
            return this._getRawTermCourses(term).map((item) => String(typeof item === 'string'
                ? item
                : firstDefined(item && item.code, item && item.courseCode, item && item.id, '')).trim()).filter(Boolean);
        }

        _getEffectiveCourseCodes(term) {
            const termIndex = Number(term.index);
            const codes = this._getRawTermCourseCodes(term).filter((code) => {
                return !this._termOverrides.has(code) || Number(this._termOverrides.get(code)) === termIndex;
            });
            this._termOverrides.forEach((targetIndex, code) => {
                if (Number(targetIndex) === termIndex) codes.push(code);
            });
            return unique(codes);
        }

        _getDisplayTerms() {
            const rawTerms = asArray(this._result && this._result.terms).filter(Boolean);
            const configuredNormalTerms = Number(firstDefined(
                this._result && this._result.metrics && this._result.metrics.normalTermCount,
                this._curriculum && this._curriculum.planningLimits && this._curriculum.planningLimits.normalTerms,
                12
            ));
            const normalTermCount = Math.max(12, Number.isFinite(configuredNormalTerms) ? configuredNormalTerms : 12);
            const byIndex = new Map();

            rawTerms.forEach((term, position) => {
                const parsedIndex = Number(firstDefined(term.index, position));
                const index = Number.isFinite(parsedIndex) ? parsedIndex : position;
                byIndex.set(index, { ...term, index, _position: position });
            });

            for (let index = 0; index < normalTermCount; index += 1) {
                if (!byIndex.has(index)) byIndex.set(index, { index, courseCodes: [], credits: 0 });
            }

            const quarters = ['Fall', 'Winter', 'Spring'];
            const terms = [...byIndex.values()]
                .sort((left, right) => Number(left.index) - Number(right.index))
                .map((term, position) => {
                    const index = Number(term.index);
                    const year = firstDefined(term.year, Math.floor(index / 3) + 1);
                    const quarter = firstDefined(term.quarter, term.term, term.name, quarters[((index % 3) + 3) % 3]);
                    return {
                        ...term,
                        index,
                        year,
                        quarter,
                        label: firstDefined(term.label, `${quarter}, Year ${year}`),
                        isExtension: Boolean(term.isExtension || index >= normalTermCount),
                        _position: position
                    };
                });

            return terms.map((term, position) => ({
                ...term,
                _previousTermIndex: position > 0 ? terms[position - 1].index : null,
                _nextTermIndex: position < terms.length - 1 ? terms[position + 1].index : null
            }));
        }

        _renderSequence(courseMap) {
            const terms = this._getDisplayTerms();
            const renderedCodes = new Set();
            const years = [];
            const yearIndex = new Map();
            const requiredCredits = Number(
                this._curriculum.curriculum
                && this._curriculum.curriculum.degreeRequirements
                && this._curriculum.curriculum.degreeRequirements.totalCredits
            );
            const plannedCredits = Number(this._result.metrics && this._result.metrics.totalPlannedCredits);
            const hasCreditGap = Number.isFinite(requiredCredits)
                && requiredCredits > 0
                && Number.isFinite(plannedCredits)
                && plannedCredits < requiredCredits;
            const usesExtension = terms.some((term) => term.isExtension);
            const normalComplete = this._result.status === 'fits-normal-horizon'
                && terms.length === 12
                && !usesExtension
                && !hasCreditGap;
            const sequenceTitle = hasCreditGap
                ? `${terms.length}-quarter worksheet with unplaced coursework`
                : normalComplete
                    ? 'Complete 12-quarter worksheet'
                    : usesExtension
                        ? `${terms.length}-quarter worksheet with extension`
                        : `${terms.length}-quarter working worksheet`;

            terms.forEach((term, position) => {
                const numericYear = firstDefined(term.year, Math.floor(Number(firstDefined(term.index, position)) / 3) + 1);
                const yearKey = String(numericYear);
                if (!yearIndex.has(yearKey)) {
                    yearIndex.set(yearKey, years.length);
                    years.push({ key: yearKey, value: numericYear, isExtension: Boolean(term.isExtension), terms: [] });
                }
                const year = years[yearIndex.get(yearKey)];
                year.isExtension = year.isExtension || Boolean(term.isExtension);
                year.terms.push(term);
            });

            const placed = years.length
                ? `<section class="sequence-section" aria-labelledby="sequenceTitle">
                    <div class="section-heading">
                        <div>
                            <p class="section-kicker">Working sequence</p>
                            <h3 id="sequenceTitle">${escapeHtml(sequenceTitle)}</h3>
                        </div>
                        <span class="guidance-label">Drag cards or use Move · temporary planning guidance</span>
                    </div>
                    <p class="worksheet-help">Named courses and external credit placeholders share one chronological worksheet. Moving a card does not save or revalidate the plan.</p>
                    <ol class="year-list">
                        ${years.map((year) => this._renderYear(year, courseMap, renderedCodes)).join('')}
                    </ol>
                </section>`
                : `<section class="sequence-section empty-sequence" aria-labelledby="sequenceTitle">
                    <p class="section-kicker">Working sequence</p>
                    <h3 id="sequenceTitle">No placed courses in this result</h3>
                    <p>Review the constraint ledger and unplaced coursework below.</p>
                </section>`;

            const explicitUnplaced = asArray(this._result.unplaced).map((item) => {
                if (typeof item === 'string') return { code: item };
                return item || {};
            });
            const unplacedByCode = new Map();
            explicitUnplaced.forEach((item) => {
                const code = String(firstDefined(item.code, item.courseCode, item.id, '')).trim();
                if (!code || renderedCodes.has(code)) return;
                unplacedByCode.set(code, { ...(courseMap.get(code) || {}), ...item, code });
            });
            courseMap.forEach((course, code) => {
                const state = String(firstDefined(course.requirementState, course.nodeType, course.kind, '')).toLowerCase();
                const choiceOnly = state === 'alternative';
                const conditionOnly = state === 'condition' || course.conditionOnly === true;
                if (!choiceOnly && !conditionOnly && !renderedCodes.has(code) && !unplacedByCode.has(code)) {
                    unplacedByCode.set(code, course);
                }
            });

            const unplacedCourses = [...unplacedByCode.values()];
            const unplaced = `
                <section class="unplaced-section" aria-labelledby="unplacedTitle">
                    <div class="section-heading">
                        <div>
                            <p class="section-kicker">Needs placement or review</p>
                            <h3 id="unplacedTitle">Unplaced coursework</h3>
                        </div>
                        <span class="selection-count">${unplacedCourses.length}</span>
                    </div>
                    ${unplacedCourses.length
        ? `<ul class="course-list unplaced-list">${unplacedCourses.map((course) => `<li>${this._renderCourseCard(course, 'Unplaced', { unplaced: true })}</li>`).join('')}</ul>`
        : '<p class="empty-note">Every named course in this preview has a modeled placement.</p>'}
                </section>`;

            return { placed, unplaced };
        }

        _renderYear(year, courseMap, renderedCodes) {
            let yearLabel;
            if (typeof year.value === 'number' || /^\d+$/.test(String(year.value))) {
                yearLabel = `Year ${year.value}`;
            } else {
                yearLabel = String(year.value).match(/^year\b/i) ? String(year.value) : `Year ${year.value}`;
            }
            const extension = year.isExtension || Number(year.value) > 4;
            return `
                <li class="year-card${extension ? ' extension-year' : ''}">
                    <div class="year-heading">
                        <h4>${escapeHtml(yearLabel)}</h4>
                        ${extension ? '<span>Extension</span>' : ''}
                    </div>
                    <ol class="quarter-list">
                        ${year.terms.map((term) => this._renderTerm(term, yearLabel, courseMap, renderedCodes)).join('')}
                    </ol>
                </li>`;
        }

        _renderTerm(term, yearLabel, courseMap, renderedCodes) {
            const quarter = firstDefined(term.quarter, term.term, term.name, 'Term');
            const placement = firstDefined(term.label, `${quarter}, ${yearLabel}`);
            const rawCourses = this._getRawTermCourses(term);
            const inlineByCode = new Map();
            rawCourses.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                const code = String(firstDefined(item.code, item.courseCode, item.id, '')).trim();
                if (code) inlineByCode.set(code, item);
            });
            const courses = [];
            this._getEffectiveCourseCodes(term).forEach((code) => {
                if (!code || renderedCodes.has(code)) return;
                renderedCodes.add(code);
                courses.push({ ...(courseMap.get(code) || {}), ...(inlineByCode.get(code) || {}), code });
            });
            const assumedStart = Number(firstDefined(term.index, term._position)) === 0
                ? '<span class="assumption">Assumed start</span>'
                : '';
            const credits = courses.reduce((total, course) => {
                const value = Number(firstDefined(course.credits, course.creditHours, 0));
                return total + (Number.isFinite(value) ? value : 0);
            }, 0);
            return `
                <li class="quarter-card${term.isExtension ? ' extension-quarter' : ''}" data-term-index="${escapeHtml(term.index)}" aria-label="${escapeHtml(`${placement}, ${credits} modeled credits`)}">
                    <div class="quarter-heading">
                        <h5>${escapeHtml(quarter)}</h5>
                        <div>${assumedStart}<span>${escapeHtml(credits)} modeled cr.</span></div>
                    </div>
                    ${courses.length
        ? `<ul class="course-list">${courses.map((course) => `<li>${this._renderCourseCard(course, placement, term)}</li>`).join('')}</ul>`
        : '<p class="empty-note">Open planning space.</p>'}
                </li>`;
        }

        _renderCourseCard(course, placement, term = {}) {
            const code = firstDefined(course.code, course.courseCode, course.id, 'Course');
            const title = firstDefined(course.title, course.name, 'Title pending source review');
            const credits = firstDefined(course.credits, course.creditHours);
            const kind = String(firstDefined(course.kind, '')).toLowerCase();
            const placeholder = course.placeholder === true || kind === 'gen-ed' || kind === 'open-elective';
            const contributionIds = unique(this._getContributionIds(course));
            const placeholderFlavor = String(firstDefined(course.subtype, course.category, course.placeholderType, kind, '')).toLowerCase();
            const placeholderLabel = kind === 'gen-ed' || placeholderFlavor.includes('gen-ed') || placeholderFlavor.includes('general')
                ? 'General education placeholder'
                : placeholderFlavor.includes('bdes') || placeholderFlavor.includes('major') || placeholderFlavor.includes('design-elective')
                    ? 'BDes elective slot'
                    : placeholderFlavor.includes('degree')
                        ? 'Open degree credit'
                        : 'Open-elective placeholder';
            const labels = placeholder
                ? [placeholderLabel]
                : contributionIds.length
                ? contributionIds.map((id) => this._contributionLabel(id))
                : ['Curriculum requirement'];
            const manuallyMoved = this._termOverrides.has(String(code));
            const moveWarning = this._manualMoveWarnings.get(String(code));
            const accessibleName = `${code}, ${title}, ${placement}, ${placeholder ? `${placeholderLabel} planning placeholder` : `contributes to ${labels.join(', ')}`}${manuallyMoved ? ', manually moved and requires advisor review' : ''}`;
            const reason = firstDefined(course.reason, course.message, course.unplacedReason);
            const previousIndex = term._previousTermIndex;
            const nextIndex = term._nextTermIndex;
            const unplaced = term.unplaced === true;
            const focusSafeCode = String(code).replace(/[^A-Za-z0-9_-]+/g, '-');
            const placementOptions = unplaced ? this._getDisplayTerms().map((targetTerm) => (
                `<option value="${escapeHtml(targetTerm.index)}">${escapeHtml(targetTerm.label)}</option>`
            )).join('') : '';
            const movable = unplaced || Number.isFinite(Number(term.index));
            return `
                <article class="course-card${movable ? ' movable-card' : ''}${labels.length > 1 ? ' shared-course' : ''}${placeholder ? ' placeholder-card' : ''}${manuallyMoved ? ' manually-moved' : ''}" data-course-code="${escapeHtml(code)}" draggable="${movable}" tabindex="-1" aria-label="${escapeHtml(accessibleName)}">
                    <div class="course-heading">
                        <strong>${escapeHtml(code)}</strong>
                        ${credits !== undefined ? `<span>${escapeHtml(credits)} cr.</span>` : ''}
                    </div>
                    <p class="course-title">${escapeHtml(title)}</p>
                    ${placeholder ? `<p class="placeholder-note">${escapeHtml(placeholderLabel)} · confirm the student-specific requirement in DegreeWorks</p>` : ''}
                    <div class="contribution-list" aria-label="Curriculum contributions">
                        ${labels.map((label, index) => `
                            <span class="contribution-badge${index > 0 ? ' accent' : ''}">
                                <span class="badge-shape" aria-hidden="true"></span>${escapeHtml(label)}
                            </span>`).join('')}
                    </div>
                    ${reason ? `<p class="course-reason"><strong>Why unplaced:</strong> ${escapeHtml(reason)}</p>` : ''}
                    ${manuallyMoved ? `<p class="manual-review-flag"><strong>Manual move:</strong> ${escapeHtml(moveWarning || 'Constraints need advisor review.')}</p>` : ''}
                    ${unplaced ? `
                        <div class="move-controls place-controls" aria-label="Place ${escapeHtml(code)} into a quarter">
                            <span>Place</span>
                            <select data-place-course data-move-code="${escapeHtml(code)}" data-focus-key="place-${escapeHtml(focusSafeCode)}" aria-label="Place ${escapeHtml(code)} into a quarter">
                                <option value="">Choose quarter…</option>
                                ${placementOptions}
                            </select>
                        </div>` : ''}
                    ${movable && (previousIndex !== null || nextIndex !== null) ? `
                        <div class="move-controls" aria-label="Move ${escapeHtml(code)} between quarters">
                            <span>Move</span>
                            <button type="button" data-move-course data-move-code="${escapeHtml(code)}" data-target-term-index="${escapeHtml(previousIndex)}" data-focus-key="move-${escapeHtml(code)}-previous" ${previousIndex === null ? 'disabled' : ''} aria-label="Move ${escapeHtml(code)} to the previous quarter">← Previous</button>
                            <button type="button" data-move-course data-move-code="${escapeHtml(code)}" data-target-term-index="${escapeHtml(nextIndex)}" data-focus-key="move-${escapeHtml(code)}-next" ${nextIndex === null ? 'disabled' : ''} aria-label="Move ${escapeHtml(code)} to the next quarter">Next →</button>
                        </div>` : ''}
                </article>`;
        }

        _renderChoiceGroups() {
            const groups = asArray(this._result.choiceGroups).filter(Boolean);
            if (!groups.length) return '';

            return `
                <section class="choice-section" aria-labelledby="choiceTitle">
                    <p class="section-kicker">Requirement choices</p>
                    <h3 id="choiceTitle">Provisional alternatives</h3>
                    <div class="detail-stack">
                        ${groups.map((group) => {
        const selected = this._choiceLabels(group.selectedOptions, group.selectedCourseCodes);
        const remaining = this._choiceLabels(group.remainingOptions, group.remainingCourseCodes);
        return `
                                <details class="choice-group">
                                    <summary>
                                        <span>${escapeHtml(firstDefined(group.label, humanize(group.id), 'Curriculum choice'))}</span>
                                        <span>Choose ${escapeHtml(firstDefined(group.count, 1))}</span>
                                    </summary>
                                    <div class="detail-body">
                                        <div>
                                            <strong>Planner-selected provisional alternatives</strong>
                                            ${selected.length ? `<ul>${selected.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>` : '<p>None selected in this preview.</p>'}
                                        </div>
                                        <div>
                                            <strong>Remaining approved alternatives</strong>
                                            ${remaining.length ? `<ul>${remaining.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>` : '<p>No remaining alternatives.</p>'}
                                        </div>
                                        ${this._renderSourceLine(group.sourceIds)}
                                    </div>
                                </details>`;
    }).join('')}
                    </div>
                </section>`;
        }

        _choiceLabels(options, courseCodes) {
            const optionLabels = asArray(options).map((option) => {
                if (typeof option === 'string') return option;
                const label = firstDefined(option.label, option.name, option.id);
                const codes = asArray(option.courses || option.courseCodes).map((course) => typeof course === 'string' ? course : firstDefined(course.code, course.courseCode)).filter(Boolean);
                return codes.length ? `${label}: ${codes.join(' + ')}` : label;
            }).filter(Boolean);
            return unique([...optionLabels, ...asArray(courseCodes).map(String)]);
        }

        _renderLedger() {
            const entries = asArray(this._result.ledger).filter(Boolean);
            return `
                <section class="ledger-section" aria-labelledby="ledgerTitle">
                    <div class="section-heading">
                        <div>
                            <p class="section-kicker">Traceable checks</p>
                            <h3 id="ledgerTitle">Constraint ledger</h3>
                        </div>
                        <span class="selection-count">${entries.length}</span>
                    </div>
                    ${entries.length
        ? `<div class="detail-stack">${entries.map((entry) => this._renderLedgerEntry(entry)).join('')}</div>`
        : '<p class="empty-note">No limiting or unresolved checks were reported for this preview.</p>'}
                </section>`;
        }

        _renderLedgerEntry(entry) {
            const category = firstDefined(entry.category, entry.classification, entry.type, 'planning-assumption');
            const message = firstDefined(entry.message, entry.summary, entry.title, 'Review this planning check.');
            const affected = asArray(firstDefined(entry.affected, entry.affectedCourseCodes, entry.courses, []))
                .map((item) => typeof item === 'string' ? item : firstDefined(item.code, item.label, item.id))
                .filter(Boolean);
            const affectedTerms = asArray(firstDefined(entry.affectedTerms, entry.quarters, []))
                .map((item) => typeof item === 'string' ? item : firstDefined(item.label, item.id))
                .filter(Boolean);
            const rule = firstDefined(entry.rule, entry.check, entry.details);
            const owner = firstDefined(entry.owner, entry.curriculumOwner);
            const approval = firstDefined(entry.approvalNeeded, entry.requiredApproval);
            return `
                <details class="ledger-entry" data-classification="${escapeHtml(category)}">
                    <summary>
                        <span class="ledger-category">${escapeHtml(humanize(category))}</span>
                        <span>${escapeHtml(message)}</span>
                    </summary>
                    <div class="detail-body">
                        ${rule ? `<p><strong>Check:</strong> ${escapeHtml(rule)}</p>` : ''}
                        <p><strong>Affected:</strong> ${escapeHtml([...affected, ...affectedTerms].join(', ') || 'Combined plan')}</p>
                        ${owner ? `<p><strong>Curriculum owner:</strong> ${escapeHtml(owner)}</p>` : ''}
                        ${approval ? `<p><strong>Approval needed:</strong> ${escapeHtml(approval)}</p>` : ''}
                        ${this._renderSourceLine(entry.sourceIds)}
                    </div>
                </details>`;
        }

        _getSourceRegistry() {
            const registry = new Map();
            const addSources = (sources) => {
                if (Array.isArray(sources)) {
                    sources.forEach((source) => {
                        if (typeof source === 'string') {
                            if (!registry.has(source)) registry.set(source, { id: source, label: humanize(source) });
                        } else if (source && source.id) {
                            registry.set(String(source.id), source);
                        }
                    });
                    return;
                }
                if (!sources || typeof sources !== 'object') return;
                Object.entries(sources).forEach(([id, source]) => {
                    registry.set(String(id), source && typeof source === 'object' ? { id, ...source } : { id, label: String(source) });
                });
            };
            addSources(this._curriculum && this._curriculum.sources);
            addSources(this._result && this._result.sources);
            return registry;
        }

        _sourceLabels(sourceIds) {
            const registry = this._getSourceRegistry();
            return unique(asArray(sourceIds).map((entry) => {
                if (entry && typeof entry === 'object') return firstDefined(entry.label, entry.name, entry.id);
                const source = registry.get(String(entry));
                return source ? firstDefined(source.label, source.name, source.id, entry) : entry;
            }).filter(Boolean));
        }

        _renderSourceLine(sourceIds) {
            const labels = this._sourceLabels(sourceIds);
            return `<p class="source-line"><strong>Source${labels.length === 1 ? '' : 's'}:</strong> ${escapeHtml(labels.join('; ') || 'Source registry review required')}</p>`;
        }

        _renderSources() {
            const sources = [...this._getSourceRegistry().values()];
            if (!sources.length) return '';
            return `
                <details class="sources-section data-sources-disclosure">
                    <summary>
                        <span>
                            <span class="section-kicker">Chair reference</span>
                            <strong id="sourcesTitle">Data sources</strong>
                        </span>
                        <span class="selection-count">${sources.length}</span>
                    </summary>
                    <div class="data-sources-body" aria-labelledby="sourcesTitle">
                        <p>Open the dated source register when a chair or advisor needs to trace this working result.</p>
                        <ul class="source-list">
                            ${sources.map((source) => {
        const location = firstDefined(source.url, source.path);
        const safeUrl = this._safeHttpUrl(location);
        const dates = [
            source.version ? `Version ${source.version}` : '',
            source.capturedOn ? `captured ${source.capturedOn}` : '',
            source.reviewedOn ? `reviewed ${source.reviewedOn}` : '',
            source.reviewState ? humanize(source.reviewState) : ''
        ].filter(Boolean).join(' · ');
        return `<li>
                                <strong>${safeUrl
        ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(firstDefined(source.label, source.name, source.id))}</a>`
        : escapeHtml(firstDefined(source.label, source.name, source.id))}</strong>
                                ${dates ? `<span>${escapeHtml(dates)}</span>` : ''}
                            </li>`;
    }).join('')}
                        </ul>
                    </div>
                </details>`;
        }

        _safeHttpUrl(value) {
            if (!value) return '';
            try {
                const url = new URL(String(value), globalScope.location && globalScope.location.href);
                return /^https?:$/.test(url.protocol) ? url.href : '';
            } catch (error) {
                return '';
            }
        }

        _getOfferingDate() {
            const curriculum = this._curriculum.curriculum || {};
            const direct = firstDefined(
                curriculum.offeringEvidence && curriculum.offeringEvidence.asOf,
                curriculum.offeringsAsOf,
                curriculum.courseCatalogAsOf,
                this._curriculum.offeringsAsOf,
                this._curriculum.courseCatalogAsOf
            );
            if (direct) return direct;
            const source = [...this._getSourceRegistry().values()].find((candidate) => {
                const haystack = `${candidate.id || ''} ${candidate.label || ''}`.toLowerCase();
                return haystack.includes('offering') || haystack.includes('course catalog') || haystack.includes('course-data');
            });
            return firstDefined(source && source.capturedOn, source && source.version, 'dated repository snapshot');
        }

        _styles() {
            return `
                <style>
                    :host {
                        display: block;
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        color: var(--f-ink, #16191f);
                        font-family: var(--f-sans, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
                    }

                    *, *::before, *::after { box-sizing: border-box; }
                    h2, h3, h4, h5, p { margin-top: 0; }
                    button, a { font: inherit; }
                    a { color: inherit; }

                    .planner-shell {
                        width: 100%;
                        max-width: 100%;
                        min-width: 0;
                        overflow-wrap: anywhere;
                    }

                    .planner-header {
                        display: flex;
                        align-items: flex-start;
                        justify-content: space-between;
                        gap: 24px;
                        padding: 24px;
                        color: #fff;
                        background: linear-gradient(122deg, #151923 0%, #262b38 70%, #501522 100%);
                        border-top: 4px solid var(--ewu-red, #a10022);
                    }

                    .planner-header h2 {
                        margin-bottom: 8px;
                        font-size: clamp(24px, 3vw, 36px);
                        line-height: 1.05;
                        letter-spacing: -0.025em;
                    }

                    .lede { max-width: 760px; margin-bottom: 0; color: #e6e8ed; line-height: 1.55; }
                    .eyebrow, .section-kicker, .summary-label {
                        margin-bottom: 7px;
                        font-size: 11px;
                        font-weight: 850;
                        letter-spacing: .09em;
                        line-height: 1.25;
                        text-transform: uppercase;
                    }
                    .eyebrow { color: #ffb9c7; }
                    .section-kicker, .summary-label { color: var(--f-soft, #667085); }

                    .degreeworks-link {
                        display: inline-flex;
                        flex: 0 0 auto;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        min-height: 44px;
                        padding: 10px 14px;
                        border: 1px solid currentColor;
                        color: inherit;
                        background: transparent;
                        font-weight: 760;
                        text-decoration: none;
                    }
                    .degreeworks-link:hover { background: rgba(255, 255, 255, .1); }
                    .degreeworks-link:focus-visible, .course-card:focus-visible, button:focus-visible, summary:focus-visible {
                        outline: 3px solid #2f81f7;
                        outline-offset: 3px;
                    }

                    .baseline-card {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                        margin: 18px 0;
                        padding: 18px;
                        border: 1px solid var(--f-hairline, #d0d5dd);
                        border-left: 5px solid var(--ewu-red, #a10022);
                        background: var(--f-surface, #fff);
                    }
                    .baseline-card h3 { margin-bottom: 4px; font-size: 18px; }
                    .baseline-card h3 span { margin-left: 8px; color: #7a1930; font-size: 12px; text-transform: uppercase; }
                    .baseline-card p:last-child { margin-bottom: 0; color: var(--f-muted, #475467); }
                    .baseline-symbol {
                        display: grid;
                        flex: 0 0 42px;
                        width: 42px;
                        height: 42px;
                        place-items: center;
                        color: #fff;
                        background: var(--ewu-red, #a10022);
                        font-weight: 900;
                    }

                    .lens-section, .sequence-section, .unplaced-section, .choice-section, .ledger-section, .sources-section {
                        margin-top: 18px;
                        padding: 20px;
                        border: 1px solid var(--f-hairline, #d0d5dd);
                        background: var(--f-surface, #fff);
                    }
                    .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
                    .section-heading h3, .choice-section > h3 { margin-bottom: 8px; font-size: 20px; }
                    .selection-count, .guidance-label {
                        display: inline-flex;
                        flex: 0 0 auto;
                        padding: 5px 8px;
                        border: 1px solid #cfd4dc;
                        color: #475467;
                        background: #f7f8fa;
                        font-size: 12px;
                        font-weight: 760;
                    }
                    .muted, .empty-note { color: var(--f-muted, #5f6672); }

                    .lens-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
                        gap: 10px;
                        margin-top: 16px;
                    }
                    .lens-button {
                        display: flex;
                        align-items: center;
                        gap: 11px;
                        min-width: 0;
                        min-height: 68px;
                        padding: 11px;
                        border: 1px solid #c8ced8;
                        color: #1e232c;
                        background: #fff;
                        text-align: left;
                        cursor: pointer;
                    }
                    .lens-button:hover { border-color: #7d8796; background: #f8f9fb; }
                    .lens-button.selected { border: 2px solid #a10022; padding: 10px; background: #fff5f7; }
                    .lens-button[aria-disabled="true"] { color: #69717d; background: #f1f3f5; cursor: not-allowed; }
                    .lens-control {
                        display: grid;
                        flex: 0 0 28px;
                        width: 28px;
                        height: 28px;
                        place-items: center;
                        border: 1px solid #9aa2ae;
                        border-radius: 50%;
                        font-size: 18px;
                        font-weight: 800;
                    }
                    .selected .lens-control { color: #fff; border-color: #a10022; background: #a10022; }
                    .lens-copy { display: grid; min-width: 0; gap: 5px; }
                    .lens-name { font-size: 14px; font-weight: 780; line-height: 1.25; }
                    .readiness { width: fit-content; padding: 2px 5px; font-size: 10px; font-weight: 820; letter-spacing: .03em; text-transform: uppercase; }
                    .readiness.ready { color: #17633a; background: #e9f7ef; }
                    .readiness.review { color: #8a4b00; background: #fff4dd; }

                    .selection-summary {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 16px;
                        margin-top: 16px;
                        padding-top: 14px;
                        border-top: 1px solid #e1e4e8;
                    }
                    .selection-summary > div { display: grid; gap: 3px; }
                    .clear-button {
                        min-height: 40px;
                        padding: 8px 12px;
                        border: 1px solid #aab1bc;
                        color: #242932;
                        background: #fff;
                        font-weight: 720;
                        cursor: pointer;
                    }
                    .clear-button:disabled { opacity: .5; cursor: default; }
                    .limit-message { margin: 12px 0 0; padding: 9px 11px; border-left: 4px solid #b85c00; background: #fff6e8; color: #5f3300; }

                    .model-strip {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px 22px;
                        margin-top: 18px;
                        padding: 12px 16px;
                        border: 1px solid #cad0d8;
                        background: #f6f7f9;
                        color: #48515e;
                        font-size: 12px;
                    }

                    .status-banner {
                        display: flex;
                        align-items: flex-start;
                        gap: 14px;
                        margin-top: 18px;
                        padding: 18px;
                        border: 1px solid #aeb6c2;
                        border-left: 6px solid #28734f;
                        background: #f0faf5;
                    }
                    .status-banner h3 { margin-bottom: 5px; font-size: 22px; }
                    .status-banner p:last-child { margin-bottom: 0; }
                    .status-symbol {
                        display: grid;
                        flex: 0 0 34px;
                        width: 34px;
                        height: 34px;
                        place-items: center;
                        border: 2px solid currentColor;
                        border-radius: 50%;
                        font-size: 18px;
                        font-weight: 900;
                    }
                    .status-banner.requires-extension { color: #694100; border-left-color: #b87900; background: #fff8e6; }
                    .status-banner.no-known-sequence { color: #811d2d; border-left-color: #a10022; background: #fff1f3; }
                    .status-banner.advisor-review-required { color: #5e3b00; border-left-color: #c16b00; background: #fff5df; }
                    .preview-note { padding-top: 8px; border-top: 1px solid rgba(0, 0, 0, .14); }
                    .boundary-copy { margin-top: 12px; padding: 14px 16px; border-left: 4px solid #56606e; background: #f4f5f7; color: #3f4752; }
                    .boundary-copy p { margin-bottom: 6px; }
                    .boundary-copy p:last-child { margin-bottom: 0; }

                    .manual-move-notice {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 18px;
                        margin-top: 18px;
                        padding: 16px;
                        border: 1px solid #d2a14f;
                        border-left: 5px solid #b45f06;
                        background: #fff7e8;
                        color: #573500;
                    }
                    .manual-move-notice h3 { margin-bottom: 5px; font-size: 18px; }
                    .manual-move-notice p:last-child { margin-bottom: 0; }
                    .manual-move-notice button { flex: 0 0 auto; min-height: 40px; padding: 8px 12px; border: 1px solid currentColor; color: inherit; background: #fff; font-weight: 740; cursor: pointer; }

                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 12px;
                        margin-top: 18px;
                    }
                    .summary-card { min-width: 0; padding: 16px; border: 1px solid #d0d5dd; background: #fff; }
                    .summary-card h3 { margin-bottom: 9px; font-size: 18px; }
                    .summary-card p:last-child { margin-bottom: 0; color: #4f5865; line-height: 1.45; }
                    .progress-track { height: 8px; margin-bottom: 10px; overflow: hidden; background: #e5e8ec; }
                    .progress-track span { display: block; height: 100%; background: #a10022; }

                    .year-list, .quarter-list, .course-list, .source-list { margin: 0; padding: 0; list-style: none; }
                    .year-list {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
                        gap: 14px;
                        margin-top: 12px;
                    }
                    .worksheet-help { margin: 8px 0 0; color: #596271; font-size: 13px; }
                    .year-card { min-width: 0; border: 1px solid #cbd1d9; background: #f7f8fa; }
                    .year-card.extension-year { border-color: #c48b27; }
                    .year-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 11px 13px; color: #fff; background: #272d37; }
                    .year-heading h4 { margin: 0; font-size: 16px; }
                    .year-heading span, .assumption { padding: 2px 5px; color: #593600; background: #ffe4a8; font-size: 10px; font-weight: 800; text-transform: uppercase; }
                    .quarter-list { display: grid; gap: 1px; background: #d9dde3; }
                    .quarter-card { min-width: 0; min-height: 128px; padding: 12px; background: #fff; transition: background-color .12s ease, box-shadow .12s ease; }
                    .quarter-card.drop-target { background: #edf6ff; box-shadow: inset 0 0 0 3px #2f81f7; }
                    .quarter-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
                    .quarter-heading h5 { margin: 0; font-size: 14px; }
                    .quarter-heading > div { display: flex; align-items: center; gap: 6px; color: #667085; font-size: 11px; }
                    .course-list { display: grid; gap: 7px; }
                    .course-card { min-width: 0; padding: 10px; border: 1px solid #d3d7de; border-left: 4px solid #5c6674; background: #fff; }
                    .course-card.movable-card { cursor: grab; }
                    .course-card.dragging { opacity: .55; cursor: grabbing; }
                    .course-card.shared-course { border-left-color: #a10022; background: #fff9fa; }
                    .course-card.placeholder-card { border-style: dashed; border-left-style: solid; border-left-color: #536d91; background: #f4f8fc; }
                    .course-card.manually-moved { border-color: #c27a16; border-left-color: #b45f06; background: #fffaf0; }
                    .course-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
                    .course-heading strong { font-size: 13px; }
                    .course-heading span { color: #667085; font-size: 11px; }
                    .course-title { margin: 3px 0 8px; color: #424a56; font-size: 12px; line-height: 1.35; }
                    .contribution-list { display: flex; flex-wrap: wrap; gap: 4px; }
                    .contribution-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 5px; color: #374151; background: #edf0f3; font-size: 10px; font-weight: 720; }
                    .badge-shape { width: 6px; height: 6px; background: #596273; transform: rotate(45deg); }
                    .contribution-badge.accent { color: #7e1730; background: #fce8ed; }
                    .contribution-badge.accent .badge-shape { border-radius: 50%; background: #a10022; transform: none; }
                    .course-reason { margin: 8px 0 0; padding-top: 7px; border-top: 1px solid #e0e3e7; color: #7a2636; font-size: 11px; }
                    .placeholder-note { margin: -2px 0 8px; color: #455a78; font-size: 10px; line-height: 1.4; }
                    .manual-review-flag { margin: 8px 0 0; padding: 7px; color: #653d00; background: #ffedc5; font-size: 10px; line-height: 1.4; }
                    .move-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 9px; padding-top: 8px; border-top: 1px solid #dfe3e8; }
                    .move-controls > span { margin-right: auto; color: #5b6470; font-size: 10px; font-weight: 800; text-transform: uppercase; }
                    .move-controls button { min-height: 30px; padding: 4px 6px; border: 1px solid #aeb6c2; color: #303844; background: #fff; font-size: 10px; font-weight: 730; cursor: pointer; }
                    .move-controls button:disabled { opacity: .38; cursor: default; }
                    .place-controls select { min-height: 34px; min-width: 0; flex: 1 1 150px; border: 1px solid #aeb6c2; color: #303844; background: #fff; font: inherit; }
                    .unplaced-section { border-left: 5px solid #a10022; }
                    .unplaced-list { grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); margin-top: 12px; }

                    .detail-stack { display: grid; gap: 8px; margin-top: 12px; }
                    details { border: 1px solid #cdd2da; background: #fff; }
                    summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; cursor: pointer; font-weight: 740; }
                    details[open] summary { border-bottom: 1px solid #d8dce2; background: #f7f8fa; }
                    .detail-body { padding: 13px; color: #444d59; }
                    .detail-body p:last-child { margin-bottom: 0; }
                    .detail-body ul { margin: 7px 0 14px; padding-left: 20px; }
                    .ledger-entry summary { justify-content: flex-start; }
                    .ledger-category { flex: 0 0 auto; padding: 3px 6px; color: #5b3900; background: #ffedc5; font-size: 10px; text-transform: uppercase; }
                    .source-line { color: #5e6672; font-size: 12px; }

                    .source-list { display: grid; gap: 7px; margin-top: 12px; }
                    .source-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 14px; padding: 9px 0; border-top: 1px solid #e0e3e7; }
                    .source-list span { color: #626b78; font-size: 12px; }
                    .sources-section { padding: 0; }
                    .sources-section > summary { min-height: 58px; padding: 14px 16px; }
                    .sources-section > summary > span:first-child { display: grid; gap: 2px; }
                    .sources-section > summary .section-kicker { margin: 0; }
                    .sources-section > summary strong { font-size: 18px; }
                    .data-sources-body { padding: 0 16px 16px; color: #4f5865; }
                    .data-sources-body > p { margin: 14px 0 0; }

                    .degreeworks-callout { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 18px; padding: 20px; color: #fff; background: #222832; }
                    .degreeworks-callout h3 { margin-bottom: 6px; }
                    .degreeworks-callout p:last-child { margin-bottom: 0; color: #d8dce2; }

                    .state-card { display: flex; gap: 14px; margin-top: 18px; padding: 22px; border: 1px solid #ccd1d8; background: #f7f8fa; }
                    .state-card h3 { margin-bottom: 5px; }
                    .state-card p:last-child { margin-bottom: 0; }
                    .state-card.unavailable { border-left: 5px solid #a10022; background: #fff3f5; }
                    .state-icon { display: grid; flex: 0 0 32px; width: 32px; height: 32px; place-items: center; border: 2px solid currentColor; border-radius: 50%; font-weight: 900; }
                    .state-mark { flex: 0 0 20px; width: 20px; height: 20px; border: 3px solid #c9ced6; border-top-color: #a10022; border-radius: 50%; animation: spin .8s linear infinite; }
                    @keyframes spin { to { transform: rotate(360deg); } }

                    .sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }

                    @media (max-width: 760px) {
                        .planner-header, .degreeworks-callout, .selection-summary, .section-heading, .manual-move-notice { align-items: stretch; flex-direction: column; }
                        .planner-header, .lens-section, .sequence-section, .unplaced-section, .choice-section, .ledger-section, .sources-section { padding: 16px; }
                        .planner-header .degreeworks-link, .degreeworks-callout .degreeworks-link { width: 100%; }
                        .summary-grid, .year-list, .lens-grid { grid-template-columns: minmax(0, 1fr); }
                        .year-list { display: grid; }
                        .selection-count, .guidance-label { width: fit-content; }
                        .manual-move-notice button { width: 100%; }
                    }

                    @media (prefers-reduced-motion: reduce) {
                        .state-mark { animation: none; }
                    }
                </style>`;
        }
    }

    let registeredClass = AdvisingPathwayPlanner;
    if (globalScope && globalScope.customElements) {
        if (!globalScope.customElements.get(TAG_NAME)) {
            globalScope.customElements.define(TAG_NAME, AdvisingPathwayPlanner);
        } else {
            registeredClass = globalScope.customElements.get(TAG_NAME);
        }
    }
    if (globalScope) globalScope.AdvisingPathwayPlanner = registeredClass;
    if (typeof module !== 'undefined' && module.exports) module.exports = registeredClass;
})(typeof window !== 'undefined' ? window : globalThis);
