const DirtyStateTracker = require('../js/dirty-state-tracker.js');

describe('DirtyStateTracker', () => {
    afterEach(() => {
        DirtyStateTracker._resetForTests();
    });

    test('markDirty and markClean update dirty state and context', () => {
        expect(DirtyStateTracker.isDirty()).toBe(false);

        DirtyStateTracker.markDirty('schedule:2026-27');
        expect(DirtyStateTracker.isDirty()).toBe(true);
        expect(DirtyStateTracker.getContext()).toBe('schedule:2026-27');

        DirtyStateTracker.markClean();
        expect(DirtyStateTracker.isDirty()).toBe(false);
        expect(DirtyStateTracker.getContext()).toBeNull();
    });

    test('onChange listener receives updates', () => {
        const listener = jest.fn();
        const unsubscribe = DirtyStateTracker.onChange(listener);

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({ dirty: false }));

        DirtyStateTracker.markDirty('state:currentQuarter');
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
            dirty: true,
            context: 'state:currentQuarter'
        }));

        unsubscribe();
    });

    test('attachToStateManager marks dirty for non-ignored state keys', () => {
        let callback = null;
        const unsubscribe = jest.fn();
        const stateManager = {
            subscribe: jest.fn((_key, cb) => {
                callback = cb;
                return unsubscribe;
            })
        };

        const attached = DirtyStateTracker.attachToStateManager(stateManager, {
            ignoreKeys: ['currentQuarter']
        });

        expect(attached).toBe(true);
        expect(stateManager.subscribe).toHaveBeenCalledWith('*', expect.any(Function));

        callback('fall', 'winter', 'currentQuarter');
        expect(DirtyStateTracker.isDirty()).toBe(false);

        callback('changed', 'old', 'scheduleData');
        expect(DirtyStateTracker.isDirty()).toBe(true);
        expect(DirtyStateTracker.getContext()).toBe('state:scheduleData');

        DirtyStateTracker.detachFromStateManager();
        expect(unsubscribe).toHaveBeenCalled();
    });

    test('setPendingNavigation is tracked and cleared by markClean', () => {
        DirtyStateTracker.markDirty('schedule:2026-27');
        DirtyStateTracker.setPendingNavigation('/pages/workload-dashboard.html');

        expect(DirtyStateTracker.getPendingNavigation()).toBe('/pages/workload-dashboard.html');

        DirtyStateTracker.markClean();
        expect(DirtyStateTracker.getPendingNavigation()).toBeNull();
        expect(DirtyStateTracker.isDirty()).toBe(false);
    });

    test('rejects invalid onChange listeners and ignores invalid state managers', () => {
        expect(() => DirtyStateTracker.onChange(null)).toThrow('DirtyStateTracker listener must be a function.');
        expect(DirtyStateTracker.attachToStateManager(null)).toBe(false);
        expect(DirtyStateTracker.attachToStateManager({})).toBe(false);
    });
});
