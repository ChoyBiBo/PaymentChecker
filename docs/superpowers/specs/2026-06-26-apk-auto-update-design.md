# APK Auto-Update Design Spec
**Date:** 2026-06-26
**Status:** Approved

## Overview

When a new APK is deployed to the server (replacing `web/downloads/hoa-connect.apk`), mobile app users automatically receive a system notification. Tapping it triggers a download via Android's DownloadManager and then launches the system install prompt. No version numbers, no admin UI — fully automatic based on the APK file's last-modified timestamp.

---

## Section 1 — Server

**File:** `server/routes/app-api.js`

New public endpoint (no auth):

```
GET /api/app/version
```

Response:
```json
{
  "apk_modified": 1719384000000,
  "apk_size": 7549000,
  "apk_url": "/downloads/hoa-connect.apk"
}
```

Implementation: reads `fs.statSync` on `web/downloads/hoa-connect.apk` and returns `mtimeMs`, `size`, and the download path. Returns `404` if the file does not exist. No DB involved — the file itself is the source of truth.

The endpoint is placed before the `router.use(requireAppAuth)` middleware so it is publicly accessible without a JWT.

---

## Section 2 — Android Worker

**New file:** `android/.../worker/UpdateCheckWorker.kt`

**Modified:** `android/.../PaymentCheckerApplication.kt`

**Modified:** `android/.../data/preferences/PreferencesManager.kt`

**Modified:** `android/.../data/api/AppApiService.kt`

**Modified:** `android/.../data/model/AppModels.kt`

A `CoroutineWorker` scheduled as a `PeriodicWorkRequest` every **6 hours**, registered in `PaymentCheckerApplication.onCreate()` with policy `KEEP` (same as `AmenityAlarmWorker`).

**Logic:**
1. Call `GET /api/app/version`
2. Read `prefs.getLastApkModified()` (default `0L`)
3. If `response.apkModified > stored` → show system notification on channel `HOA_ALERTS`:
   - Title: `"HOA Connect Update Available"`
   - Body: `"A new version is available. Tap to download and install."`
   - PendingIntent: opens `MainActivity` with extra `EXTRA_START_UPDATE = true`
   - `autoCancel = true`
4. Save `response.apkModified` to `prefs.setLastApkModified(...)` — notifies only once per deployment regardless of subsequent checks

Worker does **not** require the user to be logged in.

**PreferencesManager additions:**
- `getLastApkModified(): Long` — key `"last_apk_modified"`, default `0L`
- `setLastApkModified(ts: Long)` — stores the value
- `getPendingDownloadId(): Long` — key `"pending_download_id"`, default `-1L`
- `setPendingDownloadId(id: Long)`

**AppModels addition:**
```kotlin
data class AppVersionResponse(
    @SerializedName("apk_modified") val apkModified: Long,
    @SerializedName("apk_size") val apkSize: Long,
    @SerializedName("apk_url") val apkUrl: String
)
```

**AppApiService addition:**
```kotlin
@GET("api/app/version")
suspend fun getAppVersion(): AppVersionResponse
```

---

## Section 3 — Download & Install

**Modified:** `android/.../MainActivity.kt`

**New file:** `android/.../receiver/DownloadCompleteReceiver.kt`

**Modified:** `android/app/src/main/AndroidManifest.xml`

### Download trigger

`MainActivity.onCreate` checks for `intent.getBooleanExtra(EXTRA_START_UPDATE, false)`. If `true`, calls `startApkDownload()`:

```kotlin
fun startApkDownload() {
    val apkUrl = "${prefs.getBaseUrl()}downloads/hoa-connect.apk"
    val request = DownloadManager.Request(Uri.parse(apkUrl))
        .setTitle("HOA Connect Update")
        .setDescription("Downloading update...")
        .setDestinationInExternalFilesDir(this, null, "hoa-connect-update.apk")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setMimeType("application/vnd.android.package-archive")
    val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val downloadId = dm.enqueue(request)
    prefs.setPendingDownloadId(downloadId)
}
```

The file is written to `getExternalFilesDir(null)/hoa-connect-update.apk` — app-private external storage, no `WRITE_EXTERNAL_STORAGE` permission needed.

### Completion & install

`DownloadCompleteReceiver` catches `DownloadManager.ACTION_DOWNLOAD_COMPLETE`:

```kotlin
class DownloadCompleteReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
        val prefs = PreferencesManager(context)
        if (completedId != prefs.getPendingDownloadId()) return

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(completedId)
        val cursor = dm.query(query)
        if (cursor.moveToFirst()) {
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                val uri = dm.getUriForDownloadedFile(completedId)
                val install = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(install)
            }
        }
        cursor.close()
        prefs.setPendingDownloadId(-1L)
    }
}
```

### Manifest additions

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

<receiver
    android:name=".receiver.DownloadCompleteReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.DOWNLOAD_COMPLETE" />
    </intent-filter>
</receiver>
```

---

## Data Flow Summary

```
New APK deployed → file mtime changes
        ↓
UpdateCheckWorker fires (every 6h)
  GET /api/app/version → apkModified > stored
        ↓
System notification shown once
        ↓
User taps notification
  → MainActivity.onCreate (EXTRA_START_UPDATE=true)
  → DownloadManager.enqueue(apk_url)
        ↓
DownloadManager downloads + shows progress notification
        ↓
ACTION_DOWNLOAD_COMPLETE → DownloadCompleteReceiver
  → Intent(ACTION_VIEW, apk_uri) → system install prompt
        ↓
User approves → app installs (replaces current version)
```

---

## Out of Scope

- Force-update (blocking app use until updated) — optional future enhancement
- In-app progress bar — DownloadManager's own notification handles this
- Delta/incremental updates
- Rollback
