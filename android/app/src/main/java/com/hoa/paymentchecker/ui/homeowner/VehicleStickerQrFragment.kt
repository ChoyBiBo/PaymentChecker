package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch

class VehicleStickerQrFragment : Fragment() {

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_vehicle_sticker_qr, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<TextView>(R.id.btn_back).setOnClickListener {
            findNavController().popBackStack()
        }

        val stickerId = arguments?.getInt("stickerId") ?: return
        val plateNumber = arguments?.getString("plateNumber") ?: ""

        view.findViewById<TextView>(R.id.tv_plate).text = plateNumber
        loadQr(view, stickerId)
    }

    private fun loadQr(view: View, stickerId: Int) {
        val tvStatus = view.findViewById<TextView>(R.id.tv_qr_status)
        val ivQr = view.findViewById<ImageView>(R.id.iv_qr_code)
        val tvYear = view.findViewById<TextView>(R.id.tv_sticker_year)

        lifecycleScope.launch {
            try {
                val prefs = PreferencesManager(requireContext())
                val service = RetrofitClient.getAppService(requireContext())
                val response = service.getStickerQr(prefs.getBearerToken(), stickerId)

                tvYear.text = "${response.stickerYear} Vehicle Sticker"
                val qrBitmap = generateQr(response.qrValue, 600)
                if (qrBitmap != null) {
                    ivQr.setImageBitmap(qrBitmap)
                    ivQr.visibility = View.VISIBLE
                    tvStatus.visibility = View.GONE
                } else {
                    tvStatus.text = "Failed to generate QR code"
                }
            } catch (e: Exception) {
                tvStatus.text = when {
                    e.message?.contains("403") == true -> "Sticker not yet approved"
                    else -> "Failed to load QR code"
                }
                tvStatus.setTextColor(Color.parseColor("#DC2626"))
            }
        }
    }

    private fun generateQr(content: String, sizePx: Int): Bitmap? {
        return try {
            val writer = QRCodeWriter()
            val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
            for (x in 0 until sizePx) {
                for (y in 0 until sizePx) {
                    bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
                }
            }
            bitmap
        } catch (e: Exception) {
            null
        }
    }
}
