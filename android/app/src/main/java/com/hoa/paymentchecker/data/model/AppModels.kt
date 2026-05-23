package com.hoa.paymentchecker.data.model

import com.google.gson.annotations.SerializedName

// Auth
data class LoginRequest(val username: String, val password: String)

data class LoginResponse(
    val token: String,
    val user: AppUser
)

data class AppUser(
    val id: Int,
    val username: String,
    val fullName: String,
    val role: String, // "homeowner" or "guard"
    val homeownerId: Int?
)

// Dashboard
data class DashboardResponse(
    @SerializedName("payment_status") val paymentStatus: PaymentStatus,
    @SerializedName("payment_history") val paymentHistory: List<PaymentRecord>,
    val announcements: List<Announcement>,
    val amenities: List<Amenity>,
    @SerializedName("upcoming_bookings") val upcomingBookings: List<AmenityBooking>
)

data class PaymentStatus(
    @SerializedName("current_period") val currentPeriod: String,
    @SerializedName("is_paid") val isPaid: Boolean,
    @SerializedName("paid_at") val paidAt: String?,
    @SerializedName("months_behind") val monthsBehind: Int,
    @SerializedName("last_paid_period") val lastPaidPeriod: String?,
    @SerializedName("total_paid_this_year") val totalPaidThisYear: Double
)

data class PaymentRecord(
    @SerializedName("period_year") val periodYear: Int,
    @SerializedName("period_month") val periodMonth: Int,
    @SerializedName("paid_at") val paidAt: String?,
    val amount: Double?
)

data class Announcement(
    val id: Int,
    val title: String,
    val body: String,
    @SerializedName("created_at") val createdAt: String
)

// Amenities
data class Amenity(
    val id: Int,
    val name: String,
    val description: String?,
    val location: String?,
    val capacity: Int?,
    @SerializedName("current_status") val currentStatus: String // "available" or "in_use"
)

data class AmenitiesResponse(val amenities: List<Amenity>)

// Bookings
data class AmenityBooking(
    val id: Int,
    @SerializedName("amenity_id") val amenityId: Int,
    @SerializedName("amenity_name") val amenityName: String?,
    @SerializedName("requested_date") val requestedDate: String,
    @SerializedName("time_start") val timeStart: String,
    @SerializedName("time_end") val timeEnd: String,
    val purpose: String?,
    val status: String, // "pending", "approved", "rejected"
    @SerializedName("review_notes") val reviewNotes: String?
)

data class BookingsResponse(val bookings: List<AmenityBooking>)

data class BookingRequest(
    @SerializedName("amenity_id") val amenityId: Int,
    @SerializedName("requested_date") val requestedDate: String,
    @SerializedName("time_start") val timeStart: String,
    @SerializedName("time_end") val timeEnd: String,
    val purpose: String?
)
