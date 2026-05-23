package com.hoa.paymentchecker.data.api

import com.hoa.paymentchecker.data.model.ScanResult
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Path

interface ApiService {
    @GET("api/scan/{token}")
    suspend fun scanToken(
        @Path("token") token: String,
        @Header("x-api-key") apiKey: String? = null,
        @Header("Authorization") authorization: String? = null
    ): ScanResult
}
