package com.hoa.paymentchecker.repository

import android.content.Context
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.ScanResult
import com.hoa.paymentchecker.data.preferences.PreferencesManager

class ScanRepository(private val context: Context) {

    suspend fun scan(token: String): Result<ScanResult> {
        return try {
            val prefs = PreferencesManager(context)
            val service = RetrofitClient.getService(context)

            // Use JWT Bearer token if logged in as guard, else fall back to API key
            val jwt = prefs.getJwtToken()
            val result = if (jwt != null && prefs.getUserRole() == "guard") {
                service.scanToken(token, authorization = "Bearer $jwt")
            } else {
                service.scanToken(token, apiKey = prefs.getApiKey())
            }
            Result.success(result)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
