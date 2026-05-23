package com.hoa.paymentchecker.data.model

data class ScanResult(
    val status: String,
    val homeowner: HomeownerInfo?,
    val current_period: String?,
    val paid_at: String?,
    val last_paid_period: String?,
    val months_behind: Int?,
    val message: String?
)

data class HomeownerInfo(
    val full_name: String,
    val lot_number: String,
    val block_number: String?
)
