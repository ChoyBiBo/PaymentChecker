package com.hoa.paymentchecker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class PaymentCheckerApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "HOA Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Announcements, booking approvals/rejections, and sticker updates"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "HOA_ALERTS"
    }
}
