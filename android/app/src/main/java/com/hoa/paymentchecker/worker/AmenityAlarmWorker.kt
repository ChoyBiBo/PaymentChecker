package com.hoa.paymentchecker.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.hoa.paymentchecker.MainActivity
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter

class AmenityAlarmWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val ALARM_CHANNEL_ID = "AMENITY_ALARM"
    }

    override suspend fun doWork(): Result {
        val prefs = PreferencesManager(context)
        if (!prefs.isLoggedIn() || prefs.getUserRole() != "homeowner") return Result.success()

        createAlarmChannel()

        return try {
            val service = RetrofitClient.getAppService(context)
            val data = service.getMyBookings(prefs.getBearerToken())
            val today = LocalDate.now().toString()
            val now = LocalTime.now()

            data.bookings.filter { booking ->
                booking.status == "approved" &&
                booking.requestedDate == today
            }.forEach { booking ->
                val startTime = try {
                    LocalTime.parse(booking.timeStart.take(5), DateTimeFormatter.ofPattern("HH:mm"))
                } catch (_: Exception) { return@forEach }

                val minutesUntilStart = java.time.Duration.between(now, startTime).toMinutes()
                // Alert if starts within 15 min or started within last 5 min
                if (minutesUntilStart in -5..15) {
                    fireAlarm(booking.amenityName ?: "Amenity", booking.timeStart.take(5), booking.timeEnd.take(5))
                }
            }
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    private fun fireAlarm(amenityName: String, start: String, end: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            context, amenityName.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notification = NotificationCompat.Builder(context, ALARM_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("🔔 Amenity Booking Starting Soon!")
            .setContentText("$amenityName is booked for you at $start–$end")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("Your booking for $amenityName starts at $start (until $end). Please head to the facility."))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setSound(alarmSound)
            .setVibrate(longArrayOf(0, 500, 250, 500, 250, 500))
            .setDefaults(NotificationCompat.DEFAULT_LIGHTS)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify("alarm_${amenityName}".hashCode(), notification)
    }

    private fun createAlarmChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(ALARM_CHANNEL_ID) != null) return
            val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            val channel = NotificationChannel(
                ALARM_CHANNEL_ID,
                "Amenity Booking Alarms",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alarm notifications when your booked amenity time is approaching"
                setSound(alarmSound, AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 500)
            }
            manager.createNotificationChannel(channel)
        }
    }
}
