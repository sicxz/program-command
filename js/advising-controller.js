const AdvisingController = (function(globalScope) {
    'use strict';

    let activeElement = null;
    let activeSelectionHandler = null;
    let activeWorkspace = null;
    let generation = 0;

    function getPlannerElement(options) {
        if (options && options.element) return options.element;
        const root = (options && options.root) || globalScope.document;
        return root && root.querySelector
            ? root.querySelector('advising-pathway-planner')
            : null;
    }

    function removeActiveListener() {
        if (activeElement && activeSelectionHandler) {
            activeElement.removeEventListener('advising-selection-change', activeSelectionHandler);
        }
        activeElement = null;
        activeSelectionHandler = null;
    }

    function focusElement(element) {
        if (!element || typeof element.focus !== 'function') return;
        try {
            element.focus({ preventScroll: true });
        } catch (error) {
            element.focus();
        }
    }

    function setDialogOpen(dialog, open) {
        if (!dialog) return;
        if (open) {
            if (typeof dialog.showModal === 'function') {
                try {
                    dialog.showModal();
                    return;
                } catch (error) {
                    // Test environments and older browsers may expose an incomplete dialog API.
                }
            }
            dialog.setAttribute('open', '');
            return;
        }
        if (typeof dialog.close === 'function' && dialog.hasAttribute('open')) {
            try {
                dialog.close();
                return;
            } catch (error) {
                // Fall back to the open attribute when the native API is incomplete.
            }
        }
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new Event('close'));
    }

    function removeWorkspaceListeners() {
        if (!activeWorkspace) return;
        const { dialog, document, onDocumentClick, onClosed, onBackdropClick } = activeWorkspace;
        document.removeEventListener('click', onDocumentClick);
        dialog.removeEventListener('close', onClosed);
        dialog.removeEventListener('click', onBackdropClick);
        if (document && document.body) document.body.classList.remove('advising-workspace-open');
        activeWorkspace = null;
    }

    function bindWorkspaceControls(options = {}) {
        removeWorkspaceListeners();
        const document = options.document || globalScope.document;
        if (!document) return;
        const dialog = options.dialog || document.getElementById('advisingWorkspaceDialog');
        const openButton = options.openButton || document.getElementById('openAdvisingWorkspace');
        const closeButton = options.closeButton || document.getElementById('closeAdvisingWorkspace');
        if (!dialog || !openButton || !closeButton) return;

        let launchButton = openButton;
        const onClosed = () => {
            if (document.body) document.body.classList.remove('advising-workspace-open');
            focusElement(launchButton);
        };
        const onOpen = () => {
            if (dialog.hasAttribute('open')) return;
            setDialogOpen(dialog, true);
            if (document.body) document.body.classList.add('advising-workspace-open');
            focusElement(closeButton);
        };
        const onCloseRequest = () => {
            if (!dialog.hasAttribute('open')) return;
            setDialogOpen(dialog, false);
        };
        const onDocumentClick = (event) => {
            const target = event.target && event.target.closest
                ? event.target.closest('#openAdvisingWorkspace, #closeAdvisingWorkspace')
                : null;
            if (!target) return;
            if (target.id === 'openAdvisingWorkspace') {
                launchButton = target;
                onOpen();
                return;
            }
            onCloseRequest();
        };
        const onBackdropClick = (event) => {
            if (event.target === dialog) setDialogOpen(dialog, false);
        };

        document.addEventListener('click', onDocumentClick);
        dialog.addEventListener('close', onClosed);
        dialog.addEventListener('click', onBackdropClick);
        activeWorkspace = { dialog, document, onDocumentClick, onClosed, onBackdropClick };
    }

    async function init(options = {}) {
        const element = getPlannerElement(options);
        if (!element) return null;

        const runGeneration = ++generation;
        removeActiveListener();
        activeElement = element;
        bindWorkspaceControls(options);

        try {
            const curriculumService = options.curriculumService || globalScope.AdvisingCurriculum;
            const planner = options.planner || globalScope.AdvisingPlanner;
            if (!curriculumService || typeof curriculumService.load !== 'function') {
                throw new Error('The advising curriculum loader is unavailable.');
            }
            if (!planner || typeof planner.plan !== 'function') {
                throw new Error('The advising planner is unavailable.');
            }

            const snapshot = await curriculumService.load(options.loadOptions);
            if (runGeneration !== generation || activeElement !== element) return null;
            element.setCurriculum(snapshot);

            const applySelection = (lensIds) => {
                if (runGeneration !== generation || activeElement !== element) return null;
                const result = planner.plan(snapshot, Array.isArray(lensIds) ? lensIds : [], options.plannerOptions);
                element.setResult(result);
                return result;
            };

            activeSelectionHandler = (event) => {
                const detail = event && event.detail;
                const lensIds = detail && Array.isArray(detail.lensIds) ? detail.lensIds : [];
                try {
                    applySelection(lensIds);
                } catch (error) {
                    element.setUnavailable(error);
                }
            };
            element.addEventListener('advising-selection-change', activeSelectionHandler);

            const initialLensIds = Array.isArray(element.selectedLensIds)
                ? element.selectedLensIds
                : [];
            const result = applySelection(initialLensIds);
            return { element, snapshot, result };
        } catch (error) {
            if (runGeneration === generation && activeElement === element) {
                element.setUnavailable(error);
            }
            return null;
        }
    }

    function destroy() {
        generation += 1;
        removeActiveListener();
        removeWorkspaceListeners();
    }

    function initializeOnReady() {
        init();
    }

    if (globalScope.document) {
        if (globalScope.document.readyState === 'loading') {
            globalScope.document.addEventListener('DOMContentLoaded', initializeOnReady, { once: true });
        } else {
            initializeOnReady();
        }
    }

    return { init, destroy };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof window !== 'undefined') window.AdvisingController = AdvisingController;
if (typeof module !== 'undefined' && module.exports) module.exports = AdvisingController;
