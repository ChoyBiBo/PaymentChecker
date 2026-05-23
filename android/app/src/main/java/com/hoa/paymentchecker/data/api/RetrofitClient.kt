package com.hoa.paymentchecker.data.api

import android.content.Context
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .build()

    private fun buildRetrofit(baseUrl: String): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(httpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    fun getService(context: Context): ApiService {
        val baseUrl = PreferencesManager(context).getBaseUrl()
        return buildRetrofit(baseUrl).create(ApiService::class.java)
    }

    fun getAppService(context: Context): AppApiService {
        val baseUrl = PreferencesManager(context).getBaseUrl()
        return buildRetrofit(baseUrl).create(AppApiService::class.java)
    }
}
