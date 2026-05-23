package com.hoa.paymentchecker.ui.scan

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.hoa.paymentchecker.repository.ScanRepository
import kotlinx.coroutines.launch

class ScanViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = ScanRepository(application)
    val scanState = MutableLiveData<ScanState>(ScanState.Idle)

    @Volatile
    private var isProcessing = false

    fun processQrCode(rawValue: String) {
        if (isProcessing) return
        if (!rawValue.startsWith("HOA-")) return

        val token = rawValue.removePrefix("HOA-")
        if (token.isBlank()) return

        isProcessing = true
        scanState.postValue(ScanState.Loading)

        viewModelScope.launch {
            val result = repository.scan(token)
            result.fold(
                onSuccess = { scanResult ->
                    val newState = when (scanResult.status) {
                        "updated" -> ScanState.Updated(scanResult)
                        "outdated" -> ScanState.Outdated(scanResult)
                        else -> ScanState.Invalid(scanResult.message ?: "Invalid QR code")
                    }
                    scanState.postValue(newState)
                },
                onFailure = { error ->
                    scanState.postValue(ScanState.NetworkError(error.message ?: "Network error"))
                    isProcessing = false
                }
            )
        }
    }

    fun resetState() {
        isProcessing = false
        scanState.postValue(ScanState.Idle)
    }
}
