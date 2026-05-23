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
import java.time.Instant

class NotificationWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = PreferencesManager(context)

        // Only run for logged-in homeowners
        if (!prefs.isLoggedIn() || prefs.getUserRole() != "homeowner") return Result.success()

        val since = prefs.getLastNotifCheck()

        return try {
            val service = RetrofitClient.getAppService(context)
            val data = service.getMyNotifications(prefs.getBearerToken(), since)

            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            data.notifications.forEach { notif ->
                val intent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                val pendingIntent = PendingIntent.getActivity(
                    context, notif.id.hashCode(), intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val notification = NotificationCompat.Builder(context, PaymentCheckerApplication.CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(notif.title)
                    .setContentText(notif.message)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(notif.message))
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .setContentIntent(pendingIntent)
                    .build()

                manager.notify(notif.id.hashCode(), notification)
            }

            // Update the last check timestamp so we don't re-show the same notifications
            prefs.setLastNotifCheck(Instant.now().toString())
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
