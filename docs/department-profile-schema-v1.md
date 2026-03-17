# Department Profile Schema v1

This schema defines the runtime configuration contract for department onboarding.

## Top-Level Fields

- `version` (number, required): schema version. Current runtime supports `1`.
- `id` (string, required): unique profile id, for example `design-v1`.
- `identity` (object, required):
  - `name` (string, required)
  - `code` (string, required)
  - `displayName` (string, required)
  - `shortName` (string, optional)
- `branding` (object, required):
  - `appTitle` (string)
  - `logoUrl` (string, optional)
  - `brandColor` (hex string, optional)
  - `headerEyebrow` (string)
  - `headerSubtitle` (string)
  - `textSlots` (object map, optional): profile-driven UI labels/help copy
  - `themeTokens` (object): key/value map applied to CSS vars using `--pc-<token-name>`
- `academic` (object, required):
  - `system` (string, currently `quarter`)
  - `quarters` (array of strings, required)
  - `yearLabelFormat` (string, required): e.g. `YYYY-YY`
  - `defaultTargetYearMode` (string, optional)
  - `defaultWorkloadImportYearMode` (string, optional)
  - `defaultSchedulerYear` (string, optional)
- `scheduler` (object, required):
  - `storageKeyPrefix` (string, required)
  - `allowedRooms` (array of strings, optional)
  - `dayPatterns` (array, optional): each entry can define:
    - `id` (string, required)
    - `label` (string, optional)
    - `aliases` (array of strings, optional)
  - `timeSlots` (array, optional): each entry can define:
    - `id` (string, required)
    - `label` (string, optional)
    - `aliases` (array of strings, optional)
    - `startMinutes` (number, optional)
    - `endMinutes` (number, optional)
  - `roomLabels` (object map, optional): room code to display label
- `workload` (object, required):
  - `dashboardTitle` (string, optional)
  - `dashboardSubtitleBase` (string, optional)
  - `productionResetDefaultScheduleYear` (string, optional)
  - `defaultAnnualTargets` (object, optional)
  - `appliedLearningCourses` (object, required): course-code map to `{ title, rate }`
  - `courseTypeMultipliers` (object, required): named multipliers such as internship/practicum/independentStudy
  - `utilizationThresholds` (object, required):
    - `overloadedPercent` (number, > 0)
    - `optimalMinPercent` (number, > 0)
- `import` (object, optional):
  - `clss.roomMatchPriority` (array of strings, optional)
  - `clss.preferredMatchingOrder` (array of strings, optional)
  - `clss.facultyAliases` (object map, optional): alias to canonical faculty name
  - `clss.courseAliases` (object map, optional): alias code to canonical course code
- `courseModel` (object, required):
  - `courseCodePrefix` (string, required) e.g. `DESN`
  - `catalogStructure` (string, optional)
- `dashboard` (object, required):
  - `modules` (object, required): boolean feature toggles (schedule/workload/capacity/etc.)

## Runtime Loader

The runtime loads profiles from:

- Manifest: `department-profiles/manifest.json`
- Profile JSON: `department-profiles/<profile-file>.json`

The active profile id is stored in localStorage key:

- `programCommandActiveDepartmentProfileId`

If manifest/profile loading fails or validation fails, runtime falls back to the embedded default profile (`design-v1`) and emits warnings.

## Validation + Versioning

- Unsupported profile versions fail validation.
- Missing required fields fail validation.
- Invalid primitive types fail validation (string/boolean/number checks).
- Runtime applies v1 defaults for optional fields.
- Runtime emits contrast warnings when branding foreground/background header tokens fail a 4.5:1 ratio check.
- Migration hook entry point exists in `js/department-profile.js` (`migrateProfile`) for future version upgrades.
