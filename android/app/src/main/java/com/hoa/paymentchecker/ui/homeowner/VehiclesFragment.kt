package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
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
import java.util.Calendar

class VehiclesFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var currentYear = Calendar.getInstance().get(Calendar.YEAR)

    private var activeDocRequirementId: Int = -1
    private val docFileData = mutableMapOf<Int, String>()
    private val docAttachBtnRefs = mutableMapOf<Int, android.widget.Button>()
    private var submitBtnRef: android.widget.Button? = null
    private var currentRequirements: List<com.hoa.paymentchecker.data.model.StickerRequirement> = emptyList()

    private val pickStickerFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) processStickerDocUri(uri)
    }

    private fun processStickerDocUri(uri: Uri) {
        val reqId = activeDocRequirementId
        try {
            val mimeType = requireContext().contentResolver.getType(uri) ?: "application/octet-stream"
            val stream = requireContext().contentResolver.openInputStream(uri) ?: return
            val bytes = stream.readBytes()
            stream.close()
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            docFileData[reqId] = "data:$mimeType;base64,$b64"
            docAttachBtnRefs[reqId]?.apply {
                text = "✓ Attached"
                setBackgroundColor(Color.parseColor("#16A34A"))
            }
            checkSubmitEnabled()
        } catch (_: Exception) {}
    }

    private fun checkSubmitEnabled() {
        val allFulfilled = currentRequirements
            .filter { it.isRequired }
            .all { docFileData.containsKey(it.id) }
        submitBtnRef?.isEnabled = allFulfilled
        submitBtnRef?.setBackgroundColor(
            Color.parseColor(if (allFulfilled) "#16A34A" else "#94A3B8")
        )
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
        val dp = resources.displayMetrics.density

        // Detect motorcycle by make name
        val motorcycleBrands = setOf("honda", "yamaha", "kawasaki", "suzuki", "harley", "ducati",
            "ktm", "triumph", "bmw motorrad", "royal enfield", "bajaj", "tvs", "moto")
        val makeLC = vehicle.make?.lowercase() ?: ""
        val isMotorcycle = motorcycleBrands.any { makeLC.contains(it) }
        val vehicleEmoji = if (isMotorcycle) "🏍️" else "🚗"

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

        // Top row: icon + content
        val topRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Vehicle icon box
        val iconSize = (56 * dp).toInt()
        val iconBox = TextView(ctx).apply {
            text = vehicleEmoji
            textSize = 26f
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(Color.parseColor("#E6F4F6"))
            width = iconSize
            height = iconSize
            val lp = LinearLayout.LayoutParams(iconSize, iconSize)
            lp.marginEnd = (14 * dp).toInt()
            layoutParams = lp
        }

        // Content column (plate + badge + details)
        val contentCol = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
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
            "pending"  -> Triple("PENDING",  "#92400E", "#FEF3C7")
            "rejected" -> Triple("REJECTED", "#991B1B", "#FEE2E2")
            else       -> Triple("NO STICKER","#475569", "#E2E8F0")
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
        contentCol.addView(headerRow)

        // Vehicle details
        val details = buildString {
            val parts = listOfNotNull(vehicle.make, vehicle.model, vehicle.color, vehicle.year?.toString())
            if (parts.isNotEmpty()) append(parts.joinToString(" · "))
        }
        if (details.isNotEmpty()) {
            contentCol.addView(TextView(ctx).apply {
                text = details
                textSize = 13f
                setTextColor(Color.parseColor("#5A7A84"))
                setPadding(0, 4, 0, 0)
            })
        }

        if (vehicle.reviewNotes != null) {
            contentCol.addView(TextView(ctx).apply {
                text = "Note: ${vehicle.reviewNotes}"
                textSize = 12f
                setTextColor(Color.parseColor("#991B1B"))
                setPadding(0, 4, 0, 0)
            })
        }

        topRow.addView(iconBox)
        topRow.addView(contentCol)
        card.addView(topRow)

        // Action buttons
        val btnRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = (12 * dp).toInt()
            layoutParams = lp
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
        docFileData.clear()
        docAttachBtnRefs.clear()
        submitBtnRef = null
        activeDocRequirementId = -1

        val dialog = BottomSheetDialog(requireContext())
        val sheetView = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
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

        // Requirements section placeholder (populated after fetch)
        val docsSection = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val tvDocsLabel = TextView(requireContext()).apply {
            text = "Required Documents"
            textSize = 13f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#374151"))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.topMargin = 8
            lp.bottomMargin = 8
            layoutParams = lp
        }
        sheetView.addView(tvDocsLabel)

        val tvDocsLoading = TextView(requireContext()).apply {
            text = "Loading requirements..."
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
        }
        docsSection.addView(tvDocsLoading)
        sheetView.addView(docsSection)

        val tvError = TextView(requireContext()).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#DC2626"))
            visibility = View.GONE
        }
        sheetView.addView(tvError)

        val btnSubmit = android.widget.Button(requireContext()).apply {
            text = "Submit Request"
            setBackgroundColor(Color.parseColor("#94A3B8"))
            setTextColor(Color.WHITE)
            textSize = 14f
            isEnabled = false
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = 8
            layoutParams = lp
        }
        submitBtnRef = btnSubmit
        sheetView.addView(btnSubmit)

        btnSubmit.setOnClickListener {
            val missing = currentRequirements.filter { it.isRequired && !docFileData.containsKey(it.id) }
            if (missing.isNotEmpty()) {
                tvError.text = "Please upload: ${missing.joinToString(", ") { it.name }}"
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }
            btnSubmit.isEnabled = false
            btnSubmit.text = "Submitting..."
            tvError.visibility = View.GONE

            lifecycleScope.launch {
                try {
                    val service = RetrofitClient.getAppService(requireContext())
                    val docsList = docFileData.map { (reqId, data) ->
                        com.hoa.paymentchecker.data.model.StickerReqDocSubmit(requirementId = reqId, fileData = data)
                    }
                    service.requestSticker(
                        prefs.getBearerToken(),
                        StickerRequest(
                            vehicleId = vehicle.id,
                            stickerYear = currentYear,
                            amount = null,
                            receiptNumber = null,
                            imageData = null,
                            docs = docsList
                        )
                    )
                    dialog.dismiss()
                    Toast.makeText(requireContext(), "Sticker request submitted!", Toast.LENGTH_SHORT).show()
                    loadVehicles(requireView())
                } catch (e: Exception) {
                    tvError.text = if (e.message?.contains("400") == true || e.message?.contains("Missing") == true)
                        "Please upload all required documents" else "Failed to submit request"
                    tvError.visibility = View.VISIBLE
                    btnSubmit.isEnabled = true
                    btnSubmit.text = "Submit Request"
                }
            }
        }

        val scroll = androidx.core.widget.NestedScrollView(requireContext()).apply {
            setBackgroundColor(Color.WHITE)
        }
        scroll.addView(sheetView)
        dialog.setContentView(scroll)
        // Force the dialog's own container to white (overrides dark theme)
        dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            ?.setBackgroundColor(Color.WHITE)
        dialog.show()

        // Fetch requirements and build upload slots
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getStickerRequirements()
                currentRequirements = data.requirements
                docsSection.removeAllViews()

                if (currentRequirements.isEmpty()) {
                    tvDocsLabel.visibility = View.GONE
                    checkSubmitEnabled()
                    return@launch
                }

                currentRequirements.forEach { req ->
                    val row = LinearLayout(requireContext()).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setBackgroundColor(Color.WHITE)
                        setPadding(12, 12, 12, 12)
                        val lp = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        )
                        lp.bottomMargin = (8 * resources.displayMetrics.density).toInt()
                        layoutParams = lp
                    }

                    val labelCol = LinearLayout(requireContext()).apply {
                        orientation = LinearLayout.VERTICAL
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    labelCol.addView(TextView(requireContext()).apply {
                        text = req.name
                        textSize = 13f
                        setTypeface(null, android.graphics.Typeface.BOLD)
                        setTextColor(Color.parseColor("#1A3A4A"))
                    })
                    labelCol.addView(TextView(requireContext()).apply {
                        text = if (req.isRequired) "Required" else "Optional"
                        textSize = 11f
                        setTextColor(Color.parseColor(if (req.isRequired) "#DC2626" else "#16A34A"))
                    })

                    val reqId = req.id
                    val btnAttach = android.widget.Button(requireContext()).apply {
                        text = "📎 Attach"
                        setBackgroundColor(Color.parseColor("#1A6B7B"))
                        setTextColor(Color.WHITE)
                        textSize = 12f
                        val lp = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT
                        )
                        lp.marginStart = (12 * resources.displayMetrics.density).toInt()
                        layoutParams = lp
                    }
                    btnAttach.setOnClickListener {
                        activeDocRequirementId = reqId
                        pickStickerFile.launch("*/*")
                    }
                    docAttachBtnRefs[reqId] = btnAttach

                    row.addView(labelCol)
                    row.addView(btnAttach)
                    docsSection.addView(row)
                }

                checkSubmitEnabled()
            } catch (_: Exception) {
                // If requirements fetch fails, allow submission without docs
                currentRequirements = emptyList()
                tvDocsLabel.visibility = View.GONE
                docsSection.removeAllViews()
                checkSubmitEnabled()
            }
        }
    }

    private fun makeText(text: String, colorHex: String, size: Float): TextView {
        return TextView(requireContext()).apply {
            this.text = text
            textSize = size
            setTextColor(Color.parseColor(colorHex))
        }
    }
}
