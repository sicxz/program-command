# Codebase Optimization and Feature Planning

This document outlines structural and architectural recommendations for the `scheduler-v2-codex` application, aiming to improve maintainability, performance, and developer experience. It also provides a phased roadmap for future feature development based on the department's evolving needs.

## 1. Recommendations for Improvements and Optimization

### 1.1. Frontend Architecture & Optimization
The current frontend relies heavily on a monolithic HTML structure and the classic IIFE (Immediately Invoked Function Expression) singleton pattern. While this works well for simple prototype apps, the scale of this project has outgrown it.

*   **Componentization of `index.html`:** At nearly 10,000 lines (~400KB), `index.html` is extremely difficult to maintain. 
    *   **Recommendation:** Break the user interface down into smaller, reusable components. If you prefer to stay close to Vanilla JavaScript, consider Web Components or a lightweight templating library like Lit or Alpine.js. Alternatively, migrating the view layer to a framework like React, Vue, or Svelte will drastically reduce boilerplate and manual DOM manipulation.
*   **Adopt a Modern Bundler & ES Modules:** The IIFE script loading pattern pollutes the global namespace and prevents modern optimization techniques.
    *   **Recommendation:** Migrate to standard ES Modules (`import`/`export`) and introduce a build tool like **Vite**. This will provide instant server start, hot module replacement (HMR), and automated minification and tree-shaking for production.
*   **CSS Architecture:** There are massive blocks of inline CSS rules and scattered stylesheets.
    *   **Recommendation:** Centralize the design tokens. Consider adopting a utility-first framework like Tailwind CSS, or strongly modularize the CSS using CSS Modules or SCSS to constrain styles strictly to their respective components.

### 1.2. Backend Services & Data Pipeline
The Node.js backend operates primarily as a static file server with a few specialized API routes via the native `http` module.

*   **Upgrade to a Web Framework:** Using the native `http` module limits scalability and developer speed for handling complex routing, authentication, and HTTP headers. 
    *   **Recommendation:** Refactor `api-server.js` using **Express.js** or **Fastify**. This will abstract away manual MIME-type and route checking, making the server significantly more readable and robust.
*   **Automated Data Ingestion:** Currently, data ingestion relies on manual execution of Node scripts (`node scripts/process-enrollment-data.js`) over CSV files.
    *   **Recommendation:** Build an automated ingestion pipeline. Integrate file drag-and-drop into a protected admin dashboard, or ideally, set up a direct API integration with the university's Student Information System (SIS) / Canvas for real-time synchronization.

### 1.3 State Management
*   **Reactive Data Flow:** `state-manager.js` forces UI components to manually subscribe and unsubscribe to state changes. 
    *   **Recommendation:** Implement a reactive state primitive (like Signals) or a dedicated state library (like Redux or Zustand, if transitioning to React). This ensures UI consistency across all dashboards without manual `.subscribe()` boilerplate.

---

## 2. Plans for Future Features

Building upon the `TIER1-IMPLEMENTATION-PROGRESS` and strategic goals, here is a phased roadmap for the next evolution of the application.

### Phase 1: Near-Term Completion (Tier 1 Finalization)
Focus on completing the in-progress analytical tools to solidify the foundational data layers.
*   **Global Academic Year Filtering:** Complete the UI and logic for the Academic Year selector on the Enrollment Dashboard to properly recalculate all charts for historical and forecasted years.
*   **Unified Pipeline Processing:** Merge `workload-calculator.js` into `process-enrollment-data.js` so that a single unified command (`npm run process-data`) generates both the enrollment and workload analytics.
*   **Enhanced Forecasting:** Implement seasonal adjustments (e.g., Fall 1.15x, Winter 0.95x modifier) to replace the current basic linear regression, enabling more accurate 3-scenario forecasts.

### Phase 2: Medium-Term Predictive Capabilities (Tier 2)
Focus on moving the application from strictly analytical reporting to proactive recommendations.
*   **Course Offering Recommender:** An algorithm that flags when core courses need additional sections based on cohort sizes, or which electives to pause due to low projected interest.
*   **Adjunct Hiring Predictor:** A tool that analyzes the delta between Full-Time faculty capacity and projected student enrollment to automatically forecast adjunct hiring needs quarters in advance.
*   **Student Pathway Conflict Detector:** A matrix analyzer that flags when required courses for different cohorts are accidentally scheduled at conflicting times.

### Phase 3: Long-Term Institutional Extensibility
Focus on workflow automation, security, and institutional integration.
*   **Automated Release Time Tracking:** A dedicated UI workflow for department chairs to enter faculty sabbaticals, advising buy-outs, or research grants, automatically adjusting their available capacity calculations dynamically.
*   **Role-Based Access Control (RBAC):** Leverage the existing Supabase integration to add minimal authentication. Provide different views for:
    *   *Admins/Chairs:* Full read/write, faculty assignment overrides.
    *   *Faculty:* Read-only view of their personal schedule and capacity.
*   **AI-Driven Schedule Optimization Strategy:** Feed historical scheduling data, room constraints, and faculty preferences into an AI engine to output 2-3 globally optimized draft schedules.
