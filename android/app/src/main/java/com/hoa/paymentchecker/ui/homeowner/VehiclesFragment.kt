package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.StickerRequest
import com.hoa.paymentchecker.data.model.Vehicle
import com.hoa.paymentchecker.data.model.VehicleRequest
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Calendar

class VehiclesFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var currentYear = Calendar.getInstance().get(Calendar.YEAR)

    // Sticker image capture
    private var capturedStickerImageBase64: String? = null
    private var stickerCameraUri: Uri? = null
    private var stickerPreviewRef: ImageView? = null
    private var stickerPlaceholderRef: View? = null

    private val takeStickerPicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success && stickerCameraUri != null) processStickerImageUri(stickerCameraUri!!)
    }

    private val pickStickerFromGallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) processStickerImageUri(uri)
    }

    private fun processStickerImageUri(uri: Uri) {
        try {
            val stream = requireContext().contentResolver.openInputStream(uri) ?: return
            val original = BitmapFactory.decodeStream(stream)
            stream.close()
            val w = original.width; val h = original.height
            val maxPx = 900
            val scaled = if (w > maxPx || h > maxPx) {
                val ratio = maxPx.toFloat() / maxOf(w, h)
                Bitmap.createScaledBitmap(original, (w * ratio).toInt(), (h * ratio).toInt(), true)
            } else original
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
            capturedStickerImageBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            stickerPreviewRef?.setImageBitmap(scaled)
            stickerPreviewRef?.visibility = View.VISIBLE
            stickerPlaceholderRef?.visibility = View.GONE
        } catch (_: Exception) {}
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_vehicles, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        view.findViewById<TextView>(R.id.btn_back).setOnClickListener {
            findNavController().popBackStack()
        }
        view.findViewById<TextView>(R.id.btn_add_vehicle).setOnClickListener {
            showAddVehicleSheet()
        }

        loadVehicles(view)
    }

    override fun onResume() {
        super.onResume()
        loadVehicles(requireView())
    }

    private fun loadVehicles(view: View) {
        val container = view.findViewById<LinearLayout>(R.id.ll_vehicles_content)
        container.removeAllViews()
        container.addView(makeText("Loading...", "#5A7A84", 14f))

        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getMyVehicles(prefs.getBearerToken())
                currentYear = data.currentYear
                renderVehicles(container, data.vehicles)
            } catch (e: Exception) {
                container.removeAllViews()
                container.addView(makeText("Failed to load vehicles", "#DC2626", 14f))
            }
        }
    }

    private fun renderVehicles(container: LinearLayout, vehicles: List<Vehicle>) {
        container.removeAllViews()
        if (vehicles.isEmpty()) {
            container.addView(makeText("No vehicles registered. Tap + Add to register your vehicle.", "#5A7A84", 14f))
            return
        }

        vehicles.forEach { vehicle -> container.addView(buildVehicleCard(vehicle)) }
    }

    private fun buildVehicleCard(vehicle: Vehicle): View {
        val ctx = requireContext()

        val card = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(16, 16, 16, 16)
            elevation = 4f
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = 12
            layoutParams = lp
        }

        // Plate + sticker status row
        val headerRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val plateText = TextView(ctx).apply {
            text = vehicle.plateNumber
            textSize = 18f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#1A3A4A"))
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val (stickerLabel, stickerColor, stickerBg) = when (vehicle.stickerStatus) {
            "approved" -> Triple("APPROVED", "#166534", "#DCFCE7")
            "pending" -> Triple("PENDING", "#92400E", "#FEF3C7")
            "rejected" -> Triple("REJECTED", "#991B1B", "#FEE2E2")
            else -> Triple("NO STICKER", "#475569", "#E2E8F0")
        }

        val stickerBadge = TextView(ctx).apply {
            text = stickerLabel
            textSize = 11f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor(stickerColor))
            setBackgroundColor(Color.parseColor(stickerBg))
            setPadding(8, 4, 8, 4)
        }

        headerRow.addView(plateText)
        headerRow.addView(stickerBadge)
        card.addView(headerRow)

        // Vehicle details
        val details = buildString {
            val parts = listOfNotNull(vehicle.make, vehicle.model, vehicle.color,
                vehicle.year?.toString())
            if (parts.isNotEmpty()) append(parts.joinToString(" · "))
        }
        if (details.isNotEmpty()) {
            card.addView(TextView(ctx).apply {
                text = details
                textSize = 13f
                setTextColor(Color.parseColor("#5A7A84"))
                setPadding(0, 4, 0, 0)
            })
        }

        if (vehicle.reviewNotes != null) {
            card.addView(TextView(ctx).apply {
                text = "Note: ${vehicle.reviewNotes}"
                textSize = 12f
                setTextColor(Color.parseColor("#991B1B"))
                setPadding(0, 4, 0, 0)
            })
        }

        // Action buttons
        val btnRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 12, 0, 0)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        if (vehicle.stickerStatus == "approved" && vehicle.stickerId != null) {
            val btnQr = Button(ctx).apply {
                text = "View QR Code"
                setBackgroundColor(Color.parseColor("#3E9142"))
                setTextColor(Color.WHITE)
                textSize = 13f
                val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                lp.marginEnd = 8
                layoutParams = lp
            }
            btnQr.setOnClickListener {
                findNavController().navigate(
                    R.id.action_vehicles_to_sticker_qr,
                    bundleOf("stickerId" to vehicle.stickerId!!, "plateNumber" to vehicle.plateNumber)
                )
            }
            btnRow.addView(btnQr)
        } else if (vehicle.stickerStatus == null || vehicle.stickerStatus == "rejected") {
            val btnRequest = Button(ctx).apply {
                text = "Request $currentYear Sticker"
                setBackgroundColor(Color.parseColor("#1A6B7B"))
                setTextColor(Color.WHITE)
                textSize = 13f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            btnRequest.setOnClickListener { showRequestStickerSheet(vehicle) }
            btnRow.addView(btnRequest)
        }

        if (btnRow.childCount > 0) card.addView(btnRow)

        return card
    }

    private fun showAddVehicleSheet() {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }

        sheetView.addView(TextView(requireContext()).apply {
            text = "Register Vehicle"
            textSize = 18f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#1A3A4A"))
            setPadding(0, 0, 0, 16)
        })

        fun makeInput(hint: String, inputType: Int = android.text.InputType.TYPE_CLASS_TEXT): EditText {
            return EditText(requireContext()).apply {
                this.hint = hint
                this.inputType = inputType
                setTextColor(Color.parseColor("#1A3A4A"))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.bottomMargin = 12
                layoutParams = lp
            }
        }

        val etPlate = makeInput("Plate Number *")
        val etMake = makeInput("Make (e.g. Toyota)")
        val etModel = makeInput("Model (e.g. Vios)")
        val etColor = makeInput("Color")
        val etYear = makeInput("Year", android.text.InputType.TYPE_CLASS_NUMBER)

        val tvError = TextView(requireContext()).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#DC2626"))
            visibility = View.GONE
        }

        val btnSubmit = Button(requireContext()).apply {
            text = "Register Vehicle"
            setBackgroundColor(Color.parseColor("#1A6B7B"))
            setTextColor(Color.WHITE)
            textSize = 14f
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = 8
            layoutParams = lp
        }

        sheetView.addView(etPlate)
        sheetView.addView(etMake)
        sheetView.addView(etModel)
        sheetView.addView(etColor)
        sheetView.addView(etYear)
        sheetView.addView(tvError)
        sheetView.addView(btnSubmit)

        btnSubmit.setOnClickListener {
            val plate = etPlate.text.toString().trim()
            if (plate.isEmpty()) {
                tvError.text = "Plate number is required"
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }

            btnSubmit.isEnabled = false
            btnSubmit.text = "Registering..."
            tvError.visibility = View.GONE

            lifecycleScope.launch {
                try {
                    val service = RetrofitClient.getAppService(requireContext())
                    service.addVehicle(
                        prefs.getBearerToken(),
                        VehicleRequest(
                            plateNumber = plate.uppercase(),
                            make = etMake.text.toString().trim().ifEmpty { null },
                            model = etModel.text.toString().trim().ifEmpty { null },
                            color = etColor.text.toString().trim().ifEmpty { null },
                            year = etYear.text.toString().trim().toIntOrNull()
                        )
                    )
                    dialog.dismiss()
                    Toast.makeText(requireContext(), "Vehicle registered!", Toast.LENGTH_SHORT).show()
                    loadVehicles(requireView())
                } catch (e: Exception) {
                    val msg = if (e.message?.contains("409") == true) "Plate number already registered" else "Failed to register vehicle"
                    tvError.text = msg
                    tvError.visibility = View.VISIBLE
                    btnSubmit.isEnabled = true
                    btnSubmit.text = "Register Vehicle"
                }
            }
        }

        val scroll = androidx.core.widget.NestedScrollView(requireContext())
        scroll.addView(sheetView)
        dialog.setContentView(scroll)
        dialog.show()
    }

    private fun showRequestStickerSheet(vehicle: Vehicle) {
        capturedStickerImageBase64 = null
        stickerPreviewRef = null
        stickerPlaceholderRef = null

        val dialog = BottomSheetDialog(requireContext())
        val sheetView = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }

        sheetView.addView(TextView(requireContext()).apply {
            text = "Request $currentYear Sticker"
            textSize = 18f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#1A3A4A"))
            setPadding(0, 0, 0, 4)
        })
        sheetView.addView(TextView(requireContext()).apply {
            text = "Plate: ${vehicle.plateNumber}"
            textSize = 14f
            setTextColor(Color.parseColor("#5A7A84"))
            setPadding(0, 0, 0, 16)
        })

        fun makeInput(hint: String, inputType: Int = android.text.InputType.TYPE_CLASS_TEXT): EditText {
            return EditText(requireContext()).apply {
                this.hint = hint
                this.inputType = inputType
                setTextColor(Color.parseColor("#1A3A4A"))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.bottomMargin = 12
                layoutParams = lp
            }
        }

        val etAmount = makeInput("Amount Paid (optional)", android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL)
        val etReceipt = makeInput("Receipt Number (optional)")

        // Receipt photo section
        sheetView.addView(TextView(requireContext()).apply {
            text = "Receipt Photo (optional)"
            textSize = 13f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#374151"))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = 8
            layoutParams = lp
        })

        // Image preview
        val frameLayout = FrameLayout(requireContext()).apply {
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0)
            lp.height = (180 * resources.displayMetrics.density).toInt()
            lp.bottomMargin = (10 * resources.displayMetrics.density).toInt()
            layoutParams = lp
            setBackgroundColor(Color.parseColor("#F1F5F9"))
        }
        val placeholder = TextView(requireContext()).apply {
            text = "📷  No photo selected"
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = android.view.Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        val preview = ImageView(requireContext()).apply {
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        frameLayout.addView(placeholder)
        frameLayout.addView(preview)
        stickerPreviewRef = preview
        stickerPlaceholderRef = placeholder
        sheetView.addView(frameLayout)

        // Camera + Gallery buttons
        val btnRow = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = (16 * resources.displayMetrics.density).toInt()
            layoutParams = lp
        }
        val btnCamera = Button(requireContext()).apply {
            text = "📷  Camera"
            setBackgroundColor(Color.parseColor("#1A6B7B"))
            setTextColor(Color.WHITE)
            textSize = 13f
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            lp.marginEnd = (8 * resources.displayMetrics.density).toInt()
            layoutParams = lp
        }
        val btnGallery = Button(requireContext()).apply {
            text = "🖼  Gallery"
            setBackgroundColor(Color.parseColor("#1A6B7B"))
            setTextColor(Color.WHITE)
            textSize = 13f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        btnCamera.setOnClickListener {
            val file = File(requireContext().cacheDir, "sticker_photo_${System.currentTimeMillis()}.jpg")
            stickerCameraUri = FileProvider.getUriForFile(requireContext(), "${requireContext().packageName}.provider", file)
            takeStickerPicture.launch(stickerCameraUri)
        }
        btnGallery.setOnClickListener { pickStickerFromGallery.launch("image/*") }
        btnRow.addView(btnCamera)
        btnRow.addView(btnGallery)
        sheetView.addView(btnRow)

        val tvError = TextView(requireContext()).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#DC2626"))
            visibility = View.GONE
        }

        val btnSubmit = Button(requireContext()).apply {
            text = "Submit Request"
            setBackgroundColor(Color.parseColor("#3E9142"))
            setTextColor(Color.WHITE)
            textSize = 14f
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = 4
            layoutParams = lp
        }

        sheetView.addView(etAmount)
        sheetView.addView(etReceipt)
        sheetView.addView(tvError)
        sheetView.addView(btnSubmit)

        btnSubmit.setOnClickListener {
            btnSubmit.isEnabled = false
            btnSubmit.text = "Submitting..."
            tvError.visibility = View.GONE

            lifecycleScope.launch {
                try {
                    val service = RetrofitClient.getAppService(requireContext())
                    service.requestSticker(
                        prefs.getBearerToken(),
                        StickerRequest(
                            vehicleId = vehicle.id,
                            stickerYear = currentYear,
                            amount = etAmount.text.toString().trim().toDoubleOrNull(),
                            receiptNumber = etReceipt.text.toString().trim().ifEmpty { null },
                            imageData = capturedStickerImageBase64
                        )
                    )
                    dialog.dismiss()
                    Toast.makeText(requireContext(), "Sticker request submitted!", Toast.LENGTH_SHORT).show()
                    loadVehicles(requireView())
                } catch (e: Exception) {
                    tvError.text = "Failed to submit request"
                    tvError.visibility = View.VISIBLE
                    btnSubmit.isEnabled = true
                    btnSubmit.text = "Submit Request"
                }
            }
        }

        val scroll = androidx.core.widget.NestedScrollView(requireContext())
        scroll.addView(sheetView)
        dialog.setContentView(scroll)
        dialog.show()
    }

    private fun makeText(text: String, colorHex: String, size: Float): TextView {
        return TextView(requireContext()).apply {
            this.text = text
            textSize = size
            setTextColor(Color.parseColor(colorHex))
        }
    }
}
