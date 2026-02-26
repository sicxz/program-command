/**
 * EWU Design Schedule Analyzer - State Manager
 * Centralized state management for dashboard applications, now with Signals.
 */

class Signal {
    constructor(initialValue) {
        this._value = initialValue;
        this._subscribers = new Set();
    }

    get value() {
        return this._value;
    }

    set value(newValue) {
        if (this._value !== newValue) {
            this._value = newValue;
            this.notify();
        }
    }

    subscribe(callback) {
        this._subscribers.add(callback);
        // Immediately run with current value
        callback(this._value);
        return () => this._subscribers.delete(callback);
    }

    notify() {
        for (const callback of this._subscribers) {
            callback(this._value);
        }
    }
}

/**
 * Internal state storage mapping keys to Signals
 */
const state = new Map();

/**
 * State history for undo functionality
 */
const history = [];
const MAX_HISTORY = 20;

const config = {
    persistKeys: [],
    storagePrefix: 'ewu_schedule_',
    debug: false
};

// Backwards-compatible subscriber mapping for non-signal legacy code
const legacySubscribers = new Map();

function init(options = {}) {
    Object.assign(config, options);
    if (config.persistKeys.length > 0) {
        loadPersistedState();
    }
    log('State manager initialized');
}

function createSignal(key, initialValue) {
    if (!state.has(key)) {
        state.set(key, new Signal(initialValue));
    }
    return state.get(key);
}

function getSignal(key) {
    return state.get(key);
}

function get(key, defaultValue = null) {
    return state.has(key) ? state.get(key).value : defaultValue;
}

function set(key, value, options = {}) {
    const { silent = false, persist = false, recordHistory = true } = options;

    let signal = state.get(key);
    let oldValue;

    if (!signal) {
        signal = new Signal(value);
        state.set(key, signal);
        oldValue = undefined;
    } else {
        oldValue = signal.value;
    }

    if (recordHistory && oldValue !== undefined && oldValue !== value) {
        recordStateChange(key, oldValue, value);
    }

    // Set the signal value (this notifies signal subscribers automatically)
    if (!silent) {
        signal.value = value;
        notifyLegacySubscribers(key, value, oldValue);
    } else {
        // Bypass notification, update internal value directly
        signal._value = value;
    }

    log(`State set: ${key}`, value);

    if (persist || config.persistKeys.includes(key)) {
        persistState(key, value);
    }
}

function getNested(key, path, defaultValue = null) {
    const current = get(key);
    if (!current) return defaultValue;

    const parts = path.split('.');
    let obj = current;

    for (const part of parts) {
        if (obj === null || obj === undefined || !Object.prototype.hasOwnProperty.call(obj, part)) {
            return defaultValue;
        }
        obj = obj[part];
    }
    return obj;
}

function setNested(key, path, value) {
    const current = get(key) || {};
    // Clone to ensure reactivity triggers due to reference change
    const updated = { ...current };
    const parts = path.split('.');
    let obj = updated;

    for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) {
            obj[parts[i]] = {};
        }
        obj[parts[i]] = { ...obj[parts[i]] }; // Clone nested object
        obj = obj[parts[i]];
    }

    obj[parts[parts.length - 1]] = value;
    set(key, updated);
}

function remove(key) {
    const oldValue = get(key);
    state.delete(key);

    try {
        localStorage.removeItem(config.storagePrefix + key);
    } catch (e) {
        // Storage not available
    }

    notifyLegacySubscribers(key, undefined, oldValue);
    log(`State removed: ${key}`);
}

function has(key) {
    return state.has(key);
}

function keys() {
    return Array.from(state.keys());
}

// Legacy Subscribe Interface
function subscribe(key, callback) {
    if (!legacySubscribers.has(key)) {
        legacySubscribers.set(key, new Set());
    }
    legacySubscribers.get(key).add(callback);
    log(`Subscriber added for: ${key}`);

    return function unsubscribe() {
        const subs = legacySubscribers.get(key);
        if (subs) {
            subs.delete(callback);
            log(`Subscriber removed for: ${key}`);
        }
    };
}

function subscribeMultiple(keys, callback) {
    const unsubscribers = keys.map(k => subscribe(k, callback));
    return function unsubscribeAll() {
        unsubscribers.forEach(unsub => unsub());
    };
}

function notifyLegacySubscribers(key, newValue, oldValue) {
    const keySubscribers = legacySubscribers.get(key);
    if (keySubscribers) {
        keySubscribers.forEach(callback => {
            try { callback(newValue, oldValue, key); }
            catch (e) { console.error('State subscriber error:', e); }
        });
    }

    const wildcardSubscribers = legacySubscribers.get('*');
    if (wildcardSubscribers) {
        wildcardSubscribers.forEach(callback => {
            try { callback(newValue, oldValue, key); }
            catch (e) { console.error('State subscriber error:', e); }
        });
    }
}

function recordStateChange(key, oldValue, newValue) {
    try {
        history.push({
            timestamp: Date.now(),
            key,
            oldValue: JSON.parse(JSON.stringify(oldValue)),
            newValue: JSON.parse(JSON.stringify(newValue))
        });

        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    } catch (e) { /* Ignore non-serializable states */ }
}

function undo() {
    if (history.length === 0) return null;
    const lastChange = history.pop();
    set(lastChange.key, lastChange.oldValue, { recordHistory: false });
    log(`Undid change to: ${lastChange.key}`);
    return lastChange;
}

function getHistory() {
    return [...history];
}

function clearHistory() {
    history.length = 0;
}

function persistState(key, value) {
    try {
        const storageKey = config.storagePrefix + key;
        localStorage.setItem(storageKey, JSON.stringify(value));
        log(`Persisted state: ${key}`);
    } catch (e) {
        console.warn('Failed to persist state:', e);
    }
}

function loadPersistedState() {
    config.persistKeys.forEach(key => {
        try {
            const storageKey = config.storagePrefix + key;
            const stored = localStorage.getItem(storageKey);
            if (stored !== null) {
                set(key, JSON.parse(stored), { silent: true, recordHistory: false });
                log(`Loaded persisted state: ${key}`);
            }
        } catch (e) {
            console.warn('Failed to load persisted state:', e);
        }
    });
}

function clearPersistedState() {
    config.persistKeys.forEach(key => {
        try {
            localStorage.removeItem(config.storagePrefix + key);
        } catch (e) { }
    });
}

function reset(initialState = {}) {
    state.clear();
    clearHistory();

    Object.entries(initialState).forEach(([key, value]) => {
        set(key, value, { silent: true, recordHistory: false });
    });

    notifyLegacySubscribers('*', null, null);
    log('State reset');
}

function getAll() {
    const obj = {};
    state.forEach((signal, key) => {
        obj[key] = signal.value;
    });
    return obj;
}

function setMultiple(values, options = {}) {
    Object.entries(values).forEach(([key, value]) => {
        set(key, value, { ...options, silent: true });
    });

    if (!options.silent) {
        notifyLegacySubscribers('*', values, null);
    }
}

function log(...args) {
    if (config.debug) {
        console.log('[StateManager]', ...args);
    }
}

// Global exposure for legacy scripts that haven't been migrated yet to ES imports
const globalScope = typeof window !== 'undefined' ? window : globalThis;
globalScope.StateManager = {
    init, get, set, getNested, setNested, remove, has, keys,
    subscribe, subscribeMultiple, undo, getHistory, clearHistory,
    reset, getAll, setMultiple, clearPersistedState,
    Signal, createSignal, getSignal
};

// Keep compatibility with Node/CommonJS consumers (tests/tooling).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalScope.StateManager;
}
