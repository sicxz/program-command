# Presence Tracking Service (Tree/A-07)

Issue: [#93](https://github.com/sicxz/program-command/issues/93)

## Overview
`js/presence-service.js` provides realtime active-editor tracking per page using Supabase Realtime Presence channels.

Primary API:
- `joinPage(pageId)`
- `leavePage(pageId)`
- `getActiveEditors(pageId)`
- `onPresenceChange(pageId, callback)`

## Runtime Integration
`js/auth-guard.js` now:
- lazily loads `presence-service.js`
- joins the current page channel after auth session validation
- updates session UI with active editor count
- leaves the channel on logout and tab close

## Cleanup Behavior
- Heartbeat interval: 10 seconds
- Stale editor TTL: 30 seconds
- Browser/tab close cleanup: `beforeunload` + channel untrack/unsubscribe

## Notes
- Presence is scoped by page path (for example, `/index.html`, `/pages/schedule-builder.html`).
- No polling is used; updates are event-driven via Supabase Realtime Presence.
