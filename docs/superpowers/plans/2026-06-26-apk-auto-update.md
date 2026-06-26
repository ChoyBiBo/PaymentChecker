# APK Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a new APK is deployed to the server, mobile users receive a system notification and can tap it to download and install the update automatically.

**Architecture:** Server exposes a public `/api/app/version` endpoint that returns the APK file's mtime. An Android `UpdateCheckWorker` polls it every 6 hours, shows a notification when the mtime changed, and stores the new mtime so it only notifies once per deployment. Tapping the notification triggers `DownloadManager` to fetch the APK; a `BroadcastReceiver` launches the system install prompt on completion.

**Tech Stack:** Node.js/Express (server), Kotlin/Android, WorkManager, DownloadManager, BroadcastReceiver

## Global Constraints

- Android minSdk = 26; all code must work on API 26+.
- Gradle binary: `C:\Users\ASUS Vivobook\.gradle\wrapper\dists\gradle-9.4.1-bin\arn2x92ynaizyzdaamcbpbhtj\gradle-9.4.1\bin\gradle.bat`
- APK is served at `{BASE_URL}downloads/hoa-connect.apk` (note: `getBaseUrl()` already includes trailing slash).
- Existing notification channel ID: `PaymentCheckerApplication.CHANNEL_ID = "HOA_ALERTS"`.
- WorkManager pattern from `AmenityAlarmWorker`: `ExistingPeriodicWorkPolicy.KEEP`.

---

### Task 1: Server — Version Endpoint

**Files:**
- Modify: `server/routes/app-api.js` (top of file, before `router.use(requireAppAuth)`)

**Interfaces:**
- Produces: `GET /api/app/version` → `{ apk_modified: Long, apk_size: Long, apk_url: String }` (public, no auth)

- [ ] **Step 1: Add fs/path requires and version endpoint to app-api.js**

At the top of `server/routes/app-api.js`, after the existing requires and before `router.use(requireAppAuth)`, make these two changes:

Add at line 3 (after `const { requireAppAuth, requireAppRole } = require('../middleware/appAuth');`):
```javascript
const fs = require('fs');
const path = require('path');
```

Then add this route BEFORE `router.use(requireAppAuth)`:
```javascript
// GET /api/app/version — public: APK file fingerprint for update detection
router.get('/version', (req, res) => {
  const apkPath = path.join(__dirname, '../../web/downloads/hoa-connect.apk');
  try {
    const stat = fs.statSync(apkPath);
    return res.json({
      apk_modified: stat.mtimeMs,
      apk_size: stat.size,
      apk_url: '/downloads/hoa-connect.apk',
    });
  } catch (_) {
    return res.status(404).json({ error: 'APK not found' });
  }
});
```

- [ ] **Step 2: Restart server and verify endpoint**

With the server running, open a browser or run:
```
curl http://localhost:3000/api/app/version
```
Expected response (values will match your actual APK):
```json
{"apk_modified":1719384000000,"apk_size":7549000,"apk_url":"/downloads/hoa-connect.apk"}
```

---

### Task 2: Android — Data Layer

**Files:**
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt`
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/data/api/AppApiService.kt`
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/data/preferences/PreferencesManager.kt`

**Interfaces:**
- Produces: `AppVersionResponse(apkModified: Long, apkSize: Long, apkUrl: String)`
- Produces: `AppApiService.getAppVersion(): AppVersionResponse`
- Produces: `PreferencesManager.getLastApkModified(): Long`, `setLastApkModified(Long)`
- Produces: `PreferencesManager.getPendingDownloadId(): Long`, `setPendingDownloadId(Long)`

- [ ] **Step 1: Add AppVersionResponse to AppModels.kt**

At the end of `AppModels.kt`, before the final closing (after `RenovationPermitRequest`), add:
```kotlin
data class AppVersionResponse(
    @SerializedName("apk_modified") val apkModified: Long,
    @SerializedName("apk_size") val apkSize: Long,
    @SerializedName("apk_url") val apkUrl: String
)
```

- [ ] **Step 2: Add getAppVersion to AppApiService.kt**

In `AppApiService.kt`, after the `getMode()` declaration, add:
```kotlin
    @GET("api/app/version")
    suspend fun getAppVersion(): AppVersionResponse
```

- [ ] **Step 3: Add four prefs helpers to PreferencesManager.kt**

At the end of `PreferencesManager.kt`, before the closing `}`, add:
```kotlin
    fun getLastApkModified(): Long = prefs.getLong("last_apk_modified", 0L)
    fun setLastApkModified(ts: Long) = prefs.edit().putLong("last_apk_modified", ts).apply()
    fun getPendingDownloadId(): Long = prefs.getLong("pending_download_id", -1L)
    fun setPendingDownloadId(id: Long) = prefs.edit().putLong("pending_download_id", id).apply()
```

---

### Task 3: Android — UpdateCheckWorker

**Files:**
- Create: `android/app/src/main/java/com/hoa/paymentchecker/worker/UpdateCheckWorker.kt`
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/PaymentCheckerApplication.kt`

**Interfaces:**
- Consumes: `AppApiService.getAppVersion()` (Task 2), `PreferencesManager.getLastApkModified/setLastApkModified` (Task 2)
- Consumes: `MainActivity.EXTRA_START_UPDATE` (defined in Task 4 — declare the constant in `MainActivity` before this worker uses it, OR use the string literal `"extra_start_update"` here and define the const in Task 4)
- Produces: `UpdateCheckWorker` class registered as `"apk_update_check"` periodic work

- [ ] **Step 1: Create UpdateCheckWorker.kt**

Create `android/app/src/main/java/com/hoa/paymentchecker/worker/UpdateCheckWorker.kt`:
```kotlin
package com.hoa.paymentchecker.worker

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.hoa.paymentchecker.MainActivity
import com.hoa.paymentchecker.PaymentCheckerApplication
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.preferences.PreferencesManager

class UpdateCheckWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = PreferencesManager(context)
        return try {
            val service = RetrofitClient.getAppService(context)
            val response = service.getAppVersion()
            val stored = prefs.getLastApkModified()
            if (response.apkModified > stored) {
                prefs.setLastApkModified(response.apkModified)
                showUpdateNotification()
            }
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    private fun showUpdateNotification() {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra(MainActivity.EXTRA_START_UPDATE, true)
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, PaymentCheckerApplication.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("HOA Connect Update Available")
            .setContentText("A new version is available. Tap to download and install.")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .build()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIF_ID, notification)
    }

    companion object {
        const val NOTIF_ID = 9001
    }
}
```

- [ ] **Step 2: Schedule UpdateCheckWorker in PaymentCheckerApplication.kt**

In `PaymentCheckerApplication.kt`, add the import at the top:
```kotlin
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.hoa.paymentchecker.worker.UpdateCheckWorker
import java.util.concurrent.TimeUnit
```

In `onCreate()`, after `scheduleAmenityAlarm()`, add:
```kotlin
        scheduleUpdateCheckWorker()
```

Then add the method after `scheduleAmenityAlarm()`:
```kotlin
    private fun scheduleUpdateCheckWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(6, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "apk_update_check",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }
```

---

### Task 4: Android — Download & Install

**Files:**
- Create: `android/app/src/main/java/com/hoa/paymentchecker/receiver/DownloadCompleteReceiver.kt`
- Modify: `android/app/src/main/java/com/hoa/paymentchecker/MainActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `PreferencesManager.getPendingDownloadId/setPendingDownloadId` (Task 2)
- Produces: `MainActivity.EXTRA_START_UPDATE = "extra_start_update"` (used by Task 3's worker)
- Produces: `DownloadCompleteReceiver` registered for `ACTION_DOWNLOAD_COMPLETE`

- [ ] **Step 1: Create DownloadCompleteReceiver.kt**

Create directory `android/app/src/main/java/com/hoa/paymentchecker/receiver/` and create `DownloadCompleteReceiver.kt`:
```kotlin
package com.hoa.paymentchecker.receiver

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.hoa.paymentchecker.data.preferences.PreferencesManager

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

- [ ] **Step 2: Update MainActivity.kt**

Add these imports to `MainActivity.kt`:
```kotlin
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.widget.Toast
import com.hoa.paymentchecker.data.preferences.PreferencesManager
```

Add companion object with the constant (inside `class MainActivity`):
```kotlin
    companion object {
        const val EXTRA_START_UPDATE = "extra_start_update"
    }
```

In `onCreate()`, after `scheduleNotificationWorker()`, add:
```kotlin
        if (intent.getBooleanExtra(EXTRA_START_UPDATE, false)) {
            startApkDownload()
        }
```

Add the download function after `scheduleNotificationWorker()`:
```kotlin
    private fun startApkDownload() {
        val prefs = PreferencesManager(this)
        val apkUrl = prefs.getBaseUrl() + "downloads/hoa-connect.apk"
        val request = DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("HOA Connect Update")
            .setDescription("Downloading update...")
            .setDestinationInExternalFilesDir(this, null, "hoa-connect-update.apk")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setMimeType("application/vnd.android.package-archive")
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadId = dm.enqueue(request)
        prefs.setPendingDownloadId(downloadId)
        Toast.makeText(this, "Downloading update...", Toast.LENGTH_SHORT).show()
    }
```

- [ ] **Step 3: Update AndroidManifest.xml**

Add permission after the existing `<uses-permission>` block:
```xml
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

Add receiver inside `<application>`, after the existing `<provider>` block:
```xml
        <receiver
            android:name=".receiver.DownloadCompleteReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.DOWNLOAD_COMPLETE" />
            </intent-filter>
        </receiver>
```

---

### Task 5: Build & Deploy APK

**Files:**
- Update: `web/downloads/hoa-connect.apk`

- [ ] **Step 1: Build release APK** (run from `android/` directory)

```powershell
& "C:\Users\ASUS Vivobook\.gradle\wrapper\dists\gradle-9.4.1-bin\arn2x92ynaizyzdaamcbpbhtj\gradle-9.4.1\bin\gradle.bat" assembleRelease
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 2: Copy APK to web downloads**

```powershell
Copy-Item "app\release\hoa-connect.apk" "..\web\downloads\hoa-connect.apk" -Force
```

- [ ] **Step 3: Commit everything**

```bash
git add server/routes/app-api.js \
        android/app/src/main/java/com/hoa/paymentchecker/data/model/AppModels.kt \
        android/app/src/main/java/com/hoa/paymentchecker/data/api/AppApiService.kt \
        android/app/src/main/java/com/hoa/paymentchecker/data/preferences/PreferencesManager.kt \
        "android/app/src/main/java/com/hoa/paymentchecker/worker/UpdateCheckWorker.kt" \
        android/app/src/main/java/com/hoa/paymentchecker/PaymentCheckerApplication.kt \
        "android/app/src/main/java/com/hoa/paymentchecker/receiver/DownloadCompleteReceiver.kt" \
        android/app/src/main/java/com/hoa/paymentchecker/MainActivity.kt \
        android/app/src/main/AndroidManifest.xml \
        web/downloads/hoa-connect.apk \
        docs/superpowers/specs/2026-06-26-apk-auto-update-design.md \
        docs/superpowers/plans/2026-06-26-apk-auto-update.md
git commit -m "feat: add APK auto-update notification and download-install flow"
```

---

## Self-Review

1. **Spec coverage:**
   - `GET /api/app/version` returning mtime + size + url ✓ (Task 1)
   - `UpdateCheckWorker` every 6h, mtime comparison, notify once ✓ (Task 3)
   - Notification opens `MainActivity` with `EXTRA_START_UPDATE` ✓ (Task 3 + 4)
   - `DownloadManager` download into external files dir ✓ (Task 4)
   - `DownloadCompleteReceiver` → install intent ✓ (Task 4)
   - `REQUEST_INSTALL_PACKAGES` permission ✓ (Task 4)
   - `getPendingDownloadId` / `setPendingDownloadId` in prefs ✓ (Task 2 + 4)

2. **Placeholder scan:** None found.

3. **Type consistency:**
   - `EXTRA_START_UPDATE` declared in `MainActivity` (Task 4), referenced in `UpdateCheckWorker` (Task 3) ✓
   - `getLastApkModified(): Long` defined in Task 2, used in Task 3 ✓
   - `getPendingDownloadId(): Long` defined in Task 2, used in Task 4 ✓
   - `AppVersionResponse.apkModified: Long` defined in Task 2, used in Task 3 ✓
