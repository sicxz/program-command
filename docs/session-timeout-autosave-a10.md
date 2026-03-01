# Session Timeout, Auto-Save, and Recovery (Tree/A-10)

Issue: [#96](https://github.com/sicxz/program-command/issues/96)

## Implemented Behavior

### 1) Session timeout
- Idle timeout window: 30 minutes
- Warning toast: 5 minutes before timeout
- On timeout:
  1. attempt resilient auto-save
  2. persist local recovery draft if remote save fails
  3. sign out and redirect to `login.html?timeout=1`

### 2) Auto-save
- Periodic auto-save every 2 minutes when dirty
- Auto-save trigger on tab hide / visibility change
- Save path uses existing `saveScheduleToDatabase` flow with silent mode for background saves
- If Supabase save fails, draft fallback is written to localStorage key `pc_session_recovery_draft_v1`

### 3) Recovery
- Login page checks for recovery draft key after successful sign-in
- Prompt: restore or discard unsaved draft from previous session
- On restore, draft is mapped to `importedScheduleData` and loaded by scheduler import path

## Files
- `index.html`
  - session resilience timers, activity tracking, auto-save hooks, recovery draft persistence
- `pages/login.js`
  - timeout message and recovery prompt flow
- `js/dirty-state-tracker.js`
  - dirty-state source used by auto-save/timeout gating

## Notes
- Background auto-save is debounced and skipped while save is already in progress.
- Successful save clears the local recovery draft key.
