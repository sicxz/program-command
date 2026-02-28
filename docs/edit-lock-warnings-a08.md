# Edit-Lock Warning Flow (Tree/A-08)

Issue: [#94](https://github.com/sicxz/program-command/issues/94)

## Behavior
When another authenticated editor is active on the same page:
- an amber warning banner appears at the top of the page
- the arriving user can choose:
  - **View only** (default while conflict is unresolved)
  - **Edit anyway** (explicit acknowledge that last-write-wins may occur)
- the banner clears in realtime when other editors leave

## Conflict Notifications
- If a user saves while another editor is active and they selected **Edit anyway**, the app announces a save notice over the same Supabase Realtime channel.
- Other editors on that page receive a non-blocking notice to refresh/check draft state.

## Runtime Components
- `js/auth-guard.js`
  - warning banner rendering
  - view-only mode toggling for form controls/actions
  - save hook wrapping (`saveScheduleToDatabase`, `saveToDatabase`)
- `js/presence-service.js`
  - broadcast helpers: `announceSave(pageId, payload)` and `onSaveNotice(pageId, callback)`

## Notes
- Warning updates are realtime and event-driven; no polling loop is used.
- View-only mode does not log the user out; it only disables interactive controls until they opt to edit anyway.
