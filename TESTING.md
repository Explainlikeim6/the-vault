# Version 1.15 scrolling update

Chrome tests/scroll.test.cjs passes: four consecutive batches, tied timestamps without duplicate rows, retained selection, end marker, filter reset, and no hidden-view loading. Updated interaction suite passes, including selection of unloaded matches and deletion. Earlier verification below applies to prior releases.

# Version 1.13.1 layout update

Month/year spacing adjusted to the supplied reference. The Chrome calendar suite was rerun and the popup checked at desktop and narrow viewport sizes. Calendar logic, archive storage, and permissions are unchanged. The checks below document version 1.13.

# Verification — version 1.13

All browser checks use isolated profiles without personal history or accounts.

## Checks completed for this release

- npm test: all 18 unit tests pass, including whole-day inclusive ranges, leap years, and daylight-saving boundaries.
- Chrome and Edge tests/calendar-ui.test.cjs: empty archive, sparse saved years, midnight/duplicate-day handling, type-specific availability, grey empty dates, mouse and keyboard rejection with disappearing feedback, editable date chip, month-arrow order and missing-year navigation, search combined with dates, separate browsing/download sections, day-deletion scope, refreshing years after deletion, and light/dark appearance.
- Chrome tests/ui.test.cjs: compact navigation, themes, mobile layout, date filtering, settings dismissal, website icons, synced-device fixtures, native cleanup shortcut, and legacy folder-setting cleanup without data loss.
- Chrome tests/interaction.test.cjs: drag/Shift selection and auto-scroll, selection across pages, exact deletion preview, cancellation, preserving native history by default, and manual export/import.
- Chrome tests/browser.test.cjs: actual recording, 1,000+ equal-timestamp records, search and pagination, archive/native deletion, deletion markers, blacklist rules, backup restore and validation, and retention after native clearing/restart.
- Light and dark calendar screenshots inspected; HTML IDs, script syntax, local assets/imports, and unchanged permissions checked.

Native download-file checks passed in Chrome and Edge for version 1.12. Startup/history recovery checks passed for version 1.11. Those unchanged dedicated suites were not rerun for this calendar release.

## Run

Use Node.js 20 or newer. npm test has no external dependencies. Browser suites require Playwright. Set HISTORY_VAULT_BROWSER to an installed Chromium executable; installed Chrome test loading also uses HISTORY_VAULT_CDP=1. Run node tests/calendar-ui.test.cjs for the new calendar suite, or the other tests/ filenames listed above.

Test profiles are stored under work/ beside outputs/. Screenshots are outside the extension source. The ZIP contains only source, assets, documentation, and tests.

The calendar reflects saved records when opened, in the local time zone. It is not limited by the current search. Search and dates still combine when Apply is clicked. Downloads permit empty days within saved years as range boundaries; Browsing does not.

Live synced accounts, other Chromium variants, enterprise policies, full disks, corrupted profiles, and years of operation are not directly tested.
