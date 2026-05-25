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

    @GET("api/amenities/{id}/schedule")
    suspend fun getAmenitySchedule(
        @Path("id") id: Int,
        @Query("date") date: String? = null
    ): AmenityScheduleResponse

    @GET("api/amenity-bookings/mine")
    suspend fun getMyBookings(
        @Header("Authorization") authorization: String
    ): BookingsResponse

    @POST("api/amenity-bookings")
    suspend fun createBooking(
        @Header("Authorization") authorization: String,
        @Body request: BookingRequest
    ): Map<String, Any>

    // Vehicles
    @GET("api/vehicles/mine")
    suspend fun getMyVehicles(
        @Header("Authorization") authorization: String
    ): VehiclesResponse

    @POST("api/vehicles")
    suspend fun addVehicle(
        @Header("Authorization") authorization: String,
        @Body request: VehicleRequest
    ): Map<String, Any>

    @DELETE("api/vehicles/{id}")
    suspend fun deleteVehicle(
        @Header("Authorization") authorization: String,
        @Path("id") id: Int
    ): Map<String, Any>

    // Vehicle Stickers
    @POST("api/vehicle-stickers")
    suspend fun requestSticker(
        @Header("Authorization") authorization: String,
        @Body request: StickerRequest
    ): Map<String, Any>

    @GET("api/vehicle-stickers/{id}/qr")
    suspend fun getStickerQr(
        @Header("Authorization") authorization: String,
        @Path("id") id: Int
    ): StickerQrResponse

    @GET("api/app/my-notifications")
    suspend fun getMyNotifications(
        @Header("Authorization") authorization: String,
        @Query("since") since: String? = null
    ): HomeownerNotificationsResponse

    // Payment Proofs
    @GET("api/app/payment-proofs/mine")
    suspend fun getMyProofs(
        @Header("Authorization") authorization: String
    ): PaymentProofsResponse

    @POST("api/app/payment-proofs")
    suspend fun submitProof(
        @Header("Authorization") authorization: String,
        @Body request: SubmitProofRequest
    ): Map<String, Any>

    // Renovation
    @GET("api/renovation/requirements")
    suspend fun getRenovationRequirements(): RenovationRequirementsResponse

    @GET("api/renovation/permits/mine")
    suspend fun getMyRenovationPermits(
        @Header("Authorization") authorization: String
    ): RenovationPermitsResponse

    @POST("api/renovation/permits")
    suspend fun submitRenovationPermit(
        @Header("Authorization") authorization: String,
        @Body request: RenovationPermitRequest
    ): Map<String, Any>
}
