package com.hoa.paymentchecker.data.api

import com.hoa.paymentchecker.data.model.*
import retrofit2.http.*

interface AppApiService {

    @POST("api/app/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/app/dashboard")
    suspend fun getDashboard(
        @Header("Authorization") authorization: String
    ): DashboardResponse

    @GET("api/amenities")
    suspend fun getAmenities(): AmenitiesResponse

    @GET("api/amenity-bookings/mine")
    suspend fun getMyBookings(
        @Header("Authorization") authorization: String
    ): BookingsResponse

    @POST("api/amenity-bookings")
    suspend fun createBooking(
        @Header("Authorization") authorization: String,
        @Body request: BookingRequest
    ): Map<String, Any>
}
