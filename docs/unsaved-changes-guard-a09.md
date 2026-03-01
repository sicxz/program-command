# Unsaved Changes Guard (Tree/A-09)

Issue: [#95](https://github.com/sicxz/program-command/issues/95)

## Overview
This implementation adds a shared dirty-state tracker and guards users against losing unsaved scheduler edits.

## Components
- `js/dirty-state-tracker.js`
  - `markDirty(context)`
  - `markClean()`
  - `isDirty()`
  - `attachToStateManager(stateManager, { ignoreKeys })`
- `index.html`
  - browser `beforeunload` warning when dirty
  - in-app navigation guard modal with **Save now / Discard / Cancel**
  - save button pending badge (`save-dirty-dot`) while unsaved edits exist

## Flow
1. Scheduler edits call existing dirty state wiring (`setScheduleDirty(true)`), which now also updates `DirtyStateTracker`.
2. Closing/reloading tab triggers native browser confirmation when dirty.
3. Internal navigation attempts (header nav or links) open a modal:
   - **Save now**: runs save flow, then navigates if clean
   - **Discard**: clears dirty state and navigates
   - **Cancel**: stay on page
4. Successful save clears dirty state and removes warning prompts.

## Notes
- StateManager integration is attached with ignored keys for transient UI filters.
- Save-failure path keeps dirty state active and blocks navigation.
