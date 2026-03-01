/**
 * Dirty State Tracker
 * Tracks unsaved changes and integrates with StateManager change events.
 */
const DirtyStateTracker = (function() {
    'use strict';

    let dirty = false;
    let dirtyContext = null;
    let pendingNavigationUrl = null;
    const listeners = new Set();

    let stateManagerUnsubscribe = null;
    let ignoredStateKeys = new Set();

    function emit() {
        const snapshot = {
            dirty,
            context: dirtyContext,
            pendingNavigationUrl
        };

        listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('DirtyStateTracker listener failed:', error);
            }
        });
    }

    function markDirty(context = null) {
        dirty = true;
        if (context) {
            dirtyContext = context;
        }
        emit();
    }

    function markClean() {
        dirty = false;
        dirtyContext = null;
        pendingNavigationUrl = null;
        emit();
    }

    function isDirty() {
        return dirty;
    }

    function getContext() {
        return dirtyContext;
    }

    function setPendingNavigation(url) {
        pendingNavigationUrl = url || null;
        emit();
    }

    function getPendingNavigation() {
        return pendingNavigationUrl;
    }

    function onChange(listener) {
        if (typeof listener !== 'function') {
            throw new Error('DirtyStateTracker listener must be a function.');
        }

        listeners.add(listener);
        listener({ dirty, context: dirtyContext, pendingNavigationUrl });

        return () => {
            listeners.delete(listener);
        };
    }

    function attachToStateManager(stateManager, options = {}) {
        if (!stateManager || typeof stateManager.subscribe !== 'function') {
            return false;
        }

        if (typeof stateManagerUnsubscribe === 'function') {
            stateManagerUnsubscribe();
            stateManagerUnsubscribe = null;
        }

        ignoredStateKeys = new Set(options.ignoreKeys || []);

        stateManagerUnsubscribe = stateManager.subscribe('*', (_newValue, _oldValue, key) => {
            if (ignoredStateKeys.has(key)) return;
            markDirty(`state:${key}`);
        });

        return true;
    }

    function detachFromStateManager() {
        if (typeof stateManagerUnsubscribe === 'function') {
            stateManagerUnsubscribe();
            stateManagerUnsubscribe = null;
        }
        ignoredStateKeys = new Set();
    }

    function resetForTests() {
        dirty = false;
        dirtyContext = null;
        pendingNavigationUrl = null;
        detachFromStateManager();
        listeners.clear();
    }

    return {
        markDirty,
        markClean,
        isDirty,
        getContext,
        setPendingNavigation,
        getPendingNavigation,
        onChange,
        attachToStateManager,
        detachFromStateManager,
        _resetForTests: resetForTests
    };
})();

if (typeof window !== 'undefined') {
    window.DirtyStateTracker = DirtyStateTracker;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DirtyStateTracker;
}
