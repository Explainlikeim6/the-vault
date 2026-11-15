# Source review — version 1.11

Reviewed the extension's UI, calendar, archive database helpers, recording/import worker, deletion/blacklist flow, manual backups, startup routing, styles, icons, and regression checks. This is a review of the maintained extension source, not the user's browser profile or unrelated workspace projects.

Changes made:

- Updated the sidebar wordmark to Vault and the settings heading to A permanent vault.
- Added a logo-green search focus outline without changing layout dimensions. The dark theme uses a lighter green for visibility.
- Removed CSS for the retired page checkbox and optional time fields, unused palette variables, an unused transfer icon, and duplicate brand/device-toolbar rules.
- Removed obsolete precise-time filter helpers and their tests. The current calendar works with whole days; inclusive last-day bounds, open ranges, leap years, and daylight-saving boundaries remain covered.
- Removed the unused updateTitle database helper and the unused oldest-record lookup in storage statistics.
- Avoided repeatedly moving the sidebar toggle within its current parent during selection refreshes, which could unnecessarily disturb keyboard focus.
- Removed a redundant single-entry deletion description and an unused selection-state CSS marker.
- Added a null-backup guard so a JSON null file receives the normal invalid-backup explanation before any write.
- Replaced the interactive label around the search field and clear button with a plain container; the input and button retain their own accessible labels.
- Updated an obsolete regression-test step that still clicked the removed Page checkbox, and refreshed stale version/test documentation.

Compatibility decisions:

- Database version and backup format remain at 1. Existing database indexes are retained to avoid an unnecessary schema migration.
- Legacy folder-backup cleanup remains because older installations may still contain those handles and alarms.
- Existing icon filenames are retained for compatibility with cached references. All contain the dot-free logo.
- The manifest permissions are unchanged.

Validation:

- 15 current unit tests pass. Five tests belonging only to the removed precise-time helpers were retired.
- Chrome UI, selection/layout, recording/retention/deletion/blacklist/backup regression suites pass.
- Edge UI checks pass, including the new labels, light/dark search focus, mobile navigation, calendar, settings dismissal, and favicon behavior.
- Chrome startup/history recovery checks pass across two isolated browser restarts. The test loader explicitly reloads the unpacked test extension if Chrome's CDP loader requires it.
- Static checks confirm unique HTML IDs, existing local imports/assets, and unchanged permissions. Search focus previews were inspected in both themes.

Limits: isolated test profiles and fixture synced devices were used. The review does not establish behavior for every browser, enterprise policy, account-sync configuration, full disk, corrupted profile, or years of operation.

## Version 1.12 follow-up

Added download-specific menus, OS file icons with local type fallbacks, native existence metadata refresh, a missing-file treatment for completed downloads, and explicit file-preservation wording. Imported IDs and file existence remain profile-specific and are not trusted on restore. No schema, backup-format, or permission change was required. The prior startup and cleanup decisions remain in force.

## Version 1.13 follow-up

Removed the All activity navigation and its count binding; Browsing is the default. Section-scoped day/hour/URL/domain deletion now excludes the other record type. Full-archive deletion, blacklist cleanup, and full backup remain explicit cross-section actions.

Calendar availability reads the existing order index and skips remaining records once a matching local day is found. It returns distinct saved dates without changing the schema, permissions, or backup format. Availability is refreshed on opening and independent of text/date filters. Only saved years appear, empty browsing dates reject mouse and keyboard selection with transient feedback, and asynchronous reads cannot repaint a closed or switched calendar. An empty archive has no year options and cannot apply a date range. The date chip has separate accessible edit and clear buttons.
