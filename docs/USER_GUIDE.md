# The Vault user guide

## Find an old page

- Search keywords across page titles, URLs, domains, download filenames/paths, and timestamps. Every word must match; use `"quoted phrases"` for exact phrases. Webpage body text is not indexed.
- Search domain names in the main search field. For exact domain/subdomain filtering, use a record’s **Find this domain** action or the browser context menu; a removable Site chip appears. The sidebar selects browsing/download type.
- Choose **Date range** to open the calendar. Click a first day and a last day, then **Apply**. For a single day, click once and Apply. Both selected days are included in full. Month arrows and month/year selectors let you jump to older history; arrow keys navigate days. Dates combine with your existing search and type.
- The calendar’s **From** and **To** buttons adjust each endpoint. Clear either date for an open-ended range. Selected days are included in full.
- Click the date chip to edit the range; its × button clears only dates. **Reset filters** clears text, dates, and any contextual domain/URL restriction. Cancel, Escape, or clicking outside the date popup discards unapplied changes.
- Enter an ISO timestamp fragment, such as `2026-11-03`, to match UTC dates in the search box. Use the date filters for precise local-time searches. Group headings and displayed visit times use your device's local timezone.
- Results are grouped by day, newest first, with 100 records per page. Use **View options (⋯) → Group by hour** when you want hour headings. The search field receives focus when you open the archive. Press `/` to return to it.
- Click a title to revisit its original address. For a download, this opens its source URL; use its **··· → Show in folder** action to locate the file if its native download record still exists.
- Generated blob/data downloads also retain metadata. Their titles do not reopen temporary or inline URLs. Inline file contents are excluded from stored data URLs.

Website icons use the browser's favicon service, like its history interface; pages with no available icon use the browser's default icon or a globe fallback. Downloads use the browser’s operating-system file icon when available, with a file-type image fallback for older or imported entries. The **Light mode / Dark mode** button centered above search remembers your choice and updates other open archive tabs. Changes apply immediately; there is no theme animation. Until you choose, it follows your system theme.

## Tabs from other devices

Choose **Other devices** in the sidebar. The Vault reads the synced devices/sessions exposed by your browser, groups tabs by device, and lets you search or open them. It refreshes on opening, manually via **Refresh tabs**, and every minute while that view is visible.

Sign in to the same **browser** account on each device and enable open-tab sync there. For Chrome this usually means the same Google account; Edge and other browsers use their own sync systems. This is not a cross-provider sync service. The browser controls which devices and sessions are available, including API result limits. A browser with no shared sessions shows an explanatory empty state. Remote tabs are not automatically saved as browsing visits merely because they are displayed here.

## Select and delete search matches

1. Search for a word, domain, URL, or phrase. Add a date/type filter if needed.
2. **Select all (N)** appears beside the search. It selects all matching archived records across every results page, including matches not currently visible.
3. Click the **red trash icon / Delete** button. Review the exact record count and confirm. Cancel leaves the archive intact.

The red trash icon beside the search can also open a deletion preview directly for all matching results. Deletion defaults to the local archive; broader native-browser deletion is an explicit checkbox in the preview.

Click checkboxes or an empty part of a row to select individual records. **Shift + click** selects a continuous visible range. **Click and drag across rows** selects a range; starting on an already selected row deselects the dragged range. Selections outside that range stay selected. Dragging near the top/bottom edge scrolls the page. Dragging is enabled for a mouse or pen; touch gestures keep normal scrolling, with checkboxes for selection.

A normal title click opens its URL. Dragging from a title selects rows without opening a tab. Selection is preserved when paging; changing search/type/date filters clears it. **Select all** spans all pages; **Cancel selection (×)** clears the selection. Day-header checkboxes select that day’s visible records.

## Delete exactly what you mean

Every deletion presents a confirmation before it runs. Cancellation does not change anything.

| Action | Scope |
| --- | --- |
| Browsing row **··· → Delete this record** / Download row **··· → Delete entry** | One specific visit or download record |
| Browsing row **··· → Delete all records for this URL** | All archived browsing records for the exact URL |
| Row **··· → Delete all records for this domain** | Browsing records for the domain and all subdomains, across all dates |
| Row menu **Delete this hour** / day menu **Delete this day** | All records in the current section (Browsing or Downloads) in that local hour/day, including records hidden by current search filters |
| Checkboxes + **Delete selected** | Selected records across pages; Shift-click or drag selects/deselects a range on the visible page |
| Search toolbar **red trash icon** | All matches across every page, using current filters |
| Settings → **Delete entire archive** | All currently archived visits and download records; blacklist rules stay |

The confirmation uses an exact snapshot of record IDs. Records arriving after that preview are not included. Changing filters clears the selection; paging preserves it. Records arriving after Select all are not automatically added to that snapshot.

**By default, deletion changes only the archive.** You can explicitly select **Also delete from the browser’s separate history** in the confirmation. Chrome's API deletes **every native visit to each selected URL**, including visits outside your selection. The interface warns about this. Native download-record deletion never deletes downloaded files. If a browser deletion fails, the archive deletion still succeeds and the result reports the browser failure.

Browser clearing and expiry do **not** clear the archive: keeping an independent copy is its purpose. Clear this extension's archive separately when desired. Deleted records leave SHA-256 fingerprints, without plaintext URLs or titles, to prevent interrupted imports from resurrecting them. Explicitly restoring an older backup can bring them back.

## Domain blacklist

Add `example.com` under **Archive settings**, or right-click a page/link and choose **Blacklist this domain…**. Domains are matched exactly or as subdomains, not by substring. `example.com` also covers `news.example.com`, but does not cover `notexample.com`. A rule for `www.example.com` does not cover its parent `example.com`; use the parent when appropriate.

Adding a rule requires confirmation and:

- Deletes matching archived visits and archived download records, including downloads whose original URL matches before a redirect.
- Removes existing matching URLs from native browsing history.
- Excludes matching future activity from the archive, and removes future matching URLs from browser history after the browser reports the visit.

This is not an incognito substitute: an entry may briefly exist in the browser before the extension removes it. Native download records and downloaded files are not removed by blacklist rules. Removing a rule permits new recording and does not restore erased history. Interrupted cleanup is marked as pending and retried automatically.

The right-click menu also searches selected text, finds history for the current site/link, and opens a deletion review for the exact page/link URL.

## Storage, retention, and backups

The sidebar shows **one estimated disk-use figure**, based on the browser's storage estimate. It includes database/index overhead and deletion fingerprints, not just the text of history records. Browser-managed compaction means the number may not drop immediately after cleanup.

There is no timer, size threshold, or automatic cleanup. The extension requests `unlimitedStorage` to avoid ordinary extension storage quotas and automatic eviction. Physical disk space, browser/profile damage, and uninstalling can still cause data loss. A red **!** on the toolbar and an archive error banner report recording failures.

Use **Export** regularly. The JSON file contains every archived record, plus blacklist rules for reference. To restore, use **Import**, or Archive settings → Restore backup, and review the record count. Restore validates the whole file before writing, merges by record ID, respects the current blacklist, and leaves unrelated records intact. Invalid backup files are rejected. Very large files require enough memory to parse and validate them.

Restores run in batches. If the page closes or an operation fails midway, some batches may already have been saved; restore the same file again to finish without duplicate IDs. Restored download metadata is not bound to another profile's native download IDs. Blacklist rules from the backup are **not** automatically applied; add them manually if required.

## Practical limits

- Already-expired/deleted history cannot be recovered. Historic imports only have the titles the browser currently exposes; new visit titles are preserved as captured, with the latest visit updated when its page title changes.
- Recording operates while this extension is enabled. Private/incognito browsing is excluded. No private-page access, content scripts, analytics, or extension account is used. Synced tabs use your browser's sync. Backups are manually exported/imported JSON files.
- The archive belongs to one browser profile. Installing in another browser creates a separate archive. Manual JSON backup/restore can merge records between profiles.
- Uninstalling the extension or deleting the browser profile removes its local archive. Export before uninstalling or moving profiles. Reloading the same unpacked extension at the same location preserves data; export before moving or replacing its folder.
- Long imports checkpoint their progress and resume after worker/browser restarts. Very dense history timestamps that exceed the import API's result window are reported rather than silently skipped.
- Downloads retain metadata only, not file contents. Deleting a record never deletes a file.

## Permissions

| Permission | Purpose |
| --- | --- |
| `history` | Import/record visits and carry out explicit native-history deletion and blacklist cleanup |
| `downloads` | Record download metadata and explicitly erase native download records |
| `tabs` | Capture loaded page titles and identify the current page; no webpage content is read |
| `storage` | Save recording error information |
| `unlimitedStorage` | Allow a long-lived IndexedDB archive without ordinary quotas/eviction |
| `contextMenus` | Add right-click search, delete review, and blacklist actions |
| `alarms` | Resume initial imports and unfinished blacklist cleanup |
| `sessions` | Read tabs from other devices exposed by your browser's sync |
| `favicon` | Display the browser's website icons in history and synced-tab lists |


## Development and verification

No dependencies or build step are required to install. Source files are included. For unit tests with Node.js: `npm test` in this folder. For real-browser integration tests, install Playwright in a development environment and run the browser, UI, and interaction suites in the tests folder; see `TESTING.md` for details.

Browser API references: [History](https://developer.chrome.com/docs/extensions/reference/api/history), [Downloads](https://developer.chrome.com/docs/extensions/reference/api/downloads), [Persistent extension storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies), [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [Loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).






## Download entries

The Downloads view uses the Search download placeholder. Each download row has exactly three menu actions: Copy link, Show in folder, and Delete entry. Browsing rows retain their history-specific actions.

Deleting download entries removes metadata, never downloaded files. The confirmation states this explicitly, even when the optional browser-history checkbox is not selected. Selecting that checkbox can remove Chrome's download record too; it still does not delete the file.

Completed downloads whose files are reported missing by the browser have a line through the filename. Opening the archive and periodic refreshes ask the browser to check visible native downloads. Chrome checks asynchronously and throttles existence checks, so the status can take a few seconds to update. Moving or renaming a file can also make its original location unavailable.

Native download IDs belong to one profile. Imported entries use file-type fallback icons and cannot use Show in folder without a native download ID. Their file existence is unknown, rather than assumed missing. Removing a native download record does not imply the file was removed. Inline data-download links have Copy link disabled because their saved addresses are deliberately redacted.

File-icon and existence APIs: https://developer.chrome.com/docs/extensions/reference/api/downloads
