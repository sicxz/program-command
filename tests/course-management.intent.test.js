describe('course management URL intents', () => {
    let courseManagement;
    let originalAddEventListener;

    beforeEach(() => {
        jest.resetModules();

        originalAddEventListener = document.addEventListener;
        document.addEventListener = jest.fn((eventName, handler, options) => {
            if (eventName === 'DOMContentLoaded') {
                return;
            }
            return originalAddEventListener.call(document, eventName, handler, options);
        });

        courseManagement = require('../pages/course-management.js');
    });

    afterEach(() => {
        document.addEventListener = originalAddEventListener;
    });

    test('parses deep-link intents for course editing and add mode', () => {
        expect(courseManagement.resolveCourseManagementIntent('?courseId=course-123')).toEqual({
            action: '',
            courseId: 'course-123'
        });

        expect(courseManagement.resolveCourseManagementIntent('?action=add')).toEqual({
            action: 'add',
            courseId: ''
        });
    });
});
