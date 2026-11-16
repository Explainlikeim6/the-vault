# Privacy

The Vault stores browsing and download metadata locally in its IndexedDB database within your browser profile. Saved information includes addresses, titles, domains, visit timestamps/transition types, and download filenames/paths, addresses, timestamps, state, size, MIME type, and browser-reported file-existence status.

The extension does not upload your archive or create scheduled backup files. Backups are manually exported JSON files; restore reads a file you choose. They contain readable, unencrypted private information. Store exported files somewhere you trust. The local database is not separately password-encrypted.

There are no analytics, advertising libraries, external fonts, remotely executed code, content scripts, or webpage-body indexing. Website icons use the browser's internal favicon service. The extension's content security policy blocks network connections from its own pages. Clicking a saved address opens it in your browser as normal.

Archive retention has no automatic time limit. Native browser history and this independent archive have separate deletion controls. Clearing browser history does not clear the extension's archive. Deleted records leave only SHA-256 fingerprints to prevent accidental re-import. Blacklist rules persist until removed. Pending history import/cleanup jobs are checkpointed locally.

The extension does not run in private/incognito browsing. History exposed by native browser sync can be included in imports or visit events. Tabs from other devices reads devices/sessions exposed by your browser's own sync without adding displayed tabs to the archive automatically. The Vault does not implement an account or live multi-device archive sync.

Theme, sidebar, and hour-grouping preferences stay in local storage. File existence checks use the browser’s download metadata and do not read file contents. Native file icons are requested from the browser. Restored entries do not import native download IDs or assume the original file-existence status. Copy link writes the selected download address to your clipboard when you click it. Row selection and drag gestures stay inside the extension page; no extra page access or network permissions are requested. Upgrading from the previous folder-backup version clears its saved directory handles, settings, and scheduled alarm without deleting existing backup files. Manual restore remains compatible with older JSON backups.

Uninstalling the extension or deleting its browser profile removes its local archive. Export first if you intend to keep it.

## Purpose, sharing, and Limited Use

Saved metadata is used only to provide the archive, search, cleanup, manual backup, and browsing-activity features described in the extension. The developer does not receive or access users' archives. User data is not sold or shared for advertising, creditworthiness, or lending purposes. The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

Users can view and delete saved records in the archive and export their own data using Export. There is no automatic retention limit; users control deletion. For questions about this policy, contact Explainlikeim6 through https://github.com/Explainlikeim6/the-vault/issues without posting private history or backup files.
