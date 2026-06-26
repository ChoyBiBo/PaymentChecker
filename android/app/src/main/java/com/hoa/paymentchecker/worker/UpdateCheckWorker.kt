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
