# The Vault - a permanent history

A Chrome and Chromium browser extension that keeps a searchable, local archive of your browsing and download history until you choose to delete it.

The Vault imports the history your browser still has, then records new visits and downloads while enabled. It replaces the browser’s History page with a compact archive. **It cannot recover history already deleted or expired before installation.**

## What you can do

- Search titles, URLs, domains, timestamps, and download filenames, with keywords or exact phrases.
- Browse by day, optionally group by hour, and filter with a visual date-range calendar showing days with saved records.
- Keep Browsing and Downloads in separate views, with website and file-type icons.
- Select entries individually, with Shift-click, or by dragging; select every search match across pages.
- Delete individual records, a URL, a domain, an hour/day, or search results after reviewing a confirmation.
- Blacklist domains and subdomains, and use right-click search, deletion, and blacklist shortcuts.
- View and search tabs from other devices exposed by your browser’s own sync.
- Export and import JSON backups manually, see estimated storage use, and switch between light and dark themes.

## Install from GitHub

Requires Chrome/Chromium 120 or newer with Manifest V3 extension support. Chrome and Edge have been tested; other Chromium browsers may apply different restrictions.

1. Download this repository using **Code → Download ZIP**, or download a packaged release if available.
2. Extract it into a permanent folder. The folder containing manifest.json is the extension folder; keep it in place.
3. Open chrome://extensions (or edge://extensions) and enable **Developer mode**.
4. Click **Load unpacked**, then select that extension folder.
5. The archive opens and imports the browser’s available history. You can keep browsing during import.

Open it afterward using the toolbar icon, the browser’s History page, or the **Open The Vault** right-click menu. This GitHub distribution is installed manually; a Chrome Web Store listing is not yet available.

## Your archive and your browser’s history

The Vault keeps an independent copy in your browser profile. Clearing the browser’s history does not clear this archive, and deleting from the archive leaves browser history unchanged by default.

You can choose **Also delete from the browser’s separate history** during deletion. For browsing, this removes **all browser visits to each selected URL**, including visits outside the selected date range. Only the selected archived records are removed from The Vault. Download deletion removes records only: **downloaded files are never deleted**.

Blacklisting is broader: it removes matching archived browsing/download records and native browsing history, then excludes new matching activity. Its confirmation explains that scope.

## Back up before uninstalling or changing installations

Use **Export** to save the full archive as JSON. **Import** merges a backup, validates it, and respects current blacklist rules. There is no automatic cloud backup or archive sync.

The archive belongs to one extension installation in one browser profile. Uninstalling the extension or deleting that profile removes it. Export before moving to another browser, folder, or future store installation, then import there.

For an existing unpacked installation, close archive tabs, replace files **inside the same installed folder**, and click **Reload** on the Extensions page. Keep that folder in place. Version 1.14.0 retains the existing database and backup format, including archives from History Vault.

## Privacy and storage

The extension stores history locally. It has no extension account, analytics, advertising, remote scripts, or webpage-content indexing. Private/incognito browsing is excluded. Synced tabs use your browser’s own account and sync service.

There is no automatic expiry or cleanup. Available disk space and the health of the browser profile still matter; export regular backups. Backups contain readable private URLs, titles, and download paths and are not encrypted.

Read the [privacy policy](PRIVACY.md), [full user guide and permission explanations](docs/USER_GUIDE.md), and [verification notes](TESTING.md).

## Development and feedback

No build step is needed. Install this folder directly. Run npm test with Node.js 20 or newer for dependency-free unit tests. Browser checks use Playwright; instructions are in [TESTING.md](TESTING.md).

Report problems through this repository’s **Issues** tab. Include browser/version, extension version, and reproduction steps. Remove private URLs, titles, filenames, and personal data from screenshots and backups before sharing them.

No open-source license has been selected yet; this repository does not grant a general license to redistribute or modify the source.
