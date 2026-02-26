/**
 * EWU Design Program - Intelligent Course Offering Recommender
 * 
 * Synthesizes catalog metadata, historical enrollment, tracks/minors constraints,
 * and current schedule context to generate intelligent course offering recommendations.
 */

import { minors, studentTracks } from './data-models.js';

export class CourseRecommender {
    constructor(courseCatalog, enrollmentData) {
        this.catalog = courseCatalog || [];
        // Map catalog for quick O(1) lookups
        this.catalogMap = new Map();
        this.catalog.forEach(course => {
            this.catalogMap.set(course.code, course);
        });

        this.enrollmentData = enrollmentData || {};

        // Pre-compute track requirements for fast O(1) lookups during scoring
        this.trackRequirements = new Set();
        this.minorRequirements = new Set();

        // Collect all explicit minor requirements
        Object.values(minors).forEach(minor => {
            if (minor.courses && Array.isArray(minor.courses)) {
                minor.courses.forEach(code => this.minorRequirements.add(code));
            }
        });

        // Note: studentTracks largely map to minors in this program structure, 
        // but this allows for distinct track-level courses if they were added.
        Object.values(studentTracks).forEach(track => {
            if (track.courses && Array.isArray(track.courses)) {
                track.courses.forEach(code => this.trackRequirements.add(code));
            }
        });
    }

    /**
     * Update the enrollment data cache dynamically if a new JSON payload arrives
     */
    updateEnrollmentData(enrollmentData) {
        this.enrollmentData = enrollmentData || {};
    }

    /**
     * Update the catalog map
     */
    updateCatalog(courseCatalog) {
        this.catalog = courseCatalog || [];
        this.catalogMap.clear();
        this.catalog.forEach(course => {
            this.catalogMap.set(course.code, course);
        });
    }

    /**
     * Generate an ordered list of course recommendations for a target quarter
     * 
     * @param {string} targetQuarter - e.g., 'spring'
     * @param {Object} scheduleData - The current application state's schedule structure
     * @returns {Array} List of scored and sorted course recommendation objects
     */
    generateRecommendations(targetQuarter, scheduleData) {
        if (!this.catalog || this.catalog.length === 0) return [];

        const quarterKey = String(targetQuarter).toLowerCase();

        // 1. Identify what is already scheduled for this quarter
        const scheduledCodes = new Set();
        const quarterSchedule = scheduleData[quarterKey] || {};

        // Traverse the nested schedule structure { DAY: { TIME: [ courses ] } }
        Object.values(quarterSchedule).forEach(dayGrid => {
            Object.values(dayGrid).forEach(timeSlot => {
                if (Array.isArray(timeSlot)) {
                    timeSlot.forEach(course => {
                        if (course.code) {
                            scheduledCodes.add(course.code);
                        }
                    });
                }
            });
        });

        // 2. Score every course in the catalog
        const scoredCourses = [];

        this.catalog.forEach(course => {
            let score = 0;
            const reasons = [];

            // Skip courses that are already heavily scheduled, but don't entirely drop them
            // in case they are massive core sequences (e.g., DESN 100 might need 2 sections).
            // For now, strongly penalize to push them to the bottom.
            if (scheduledCodes.has(course.code)) {
                score -= 100;
                reasons.push('Already scheduled');
            }

            // A: Quarter Match (+50 points)
            // Does this course typically run in this quarter?
            const offeredQuarters = (course.offeredQuarters || []).map(q => q.toLowerCase());
            if (offeredQuarters.includes(quarterKey)) {
                score += 50;
                reasons.push(`Typically offered in ${targetQuarter}`);
            }

            // B: Graduation/Track Requirement (+30 points)
            // Core requirements for graduation pathways are critical.
            if (this.minorRequirements.has(course.code) || this.trackRequirements.has(course.code)) {
                score += 30;
                reasons.push('Required for track/minor progression');
            }

            // C: Historical Enrollment Demand (+15 points)
            // If historical data shows high averages or a growing trend, prioritize it.
            const stats = this.enrollmentData[course.code];
            if (stats) {
                if (stats.average > 20) {
                    score += 10;
                    reasons.push('High historical demand');
                }
                if (stats.trend === 'growing') {
                    score += 5;
                    reasons.push('Growing enrollment trend');
                }
            }

            // Generate priority badge type for the UI
            let badge = 'standard';
            if (score >= 80) badge = 'critical';
            else if (score >= 50) badge = 'high';

            scoredCourses.push({
                code: course.code,
                title: course.title,
                score: score,
                primaryReason: reasons[0] || 'Elective option',
                allReasons: reasons,
                badge: badge
            });
        });

        // 3. Sort by score descending
        scoredCourses.sort((a, b) => b.score - a.score);

        // Filter out deeply negative scores (already scheduled courses)
        // Only return the top 5 viable suggestions.
        return scoredCourses.filter(c => c.score > 0).slice(0, 5);
    }
}
