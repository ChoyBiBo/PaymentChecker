package com.hoa.paymentchecker.ui.scan

import com.hoa.paymentchecker.data.model.ScanResult
import com.hoa.paymentchecker.data.model.VehicleScanResult

sealed class ScanState {
    object Idle : ScanState()
    object Loading : ScanState()
    data class Updated(val result: ScanResult) : ScanState()
    data class Outdated(val result: ScanResult) : ScanState()
    data class VehicleValid(val result: VehicleScanResult) : ScanState()
    data class VehicleExpired(val result: VehicleScanResult) : ScanState()
    data class Invalid(val message: String) : ScanState()
    data class NetworkError(val message: String) : ScanState()
}
