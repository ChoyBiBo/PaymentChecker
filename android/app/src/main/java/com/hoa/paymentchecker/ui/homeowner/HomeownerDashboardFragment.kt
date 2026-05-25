package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.ViewFlipper
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.AmenityBooking
import com.hoa.paymentchecker.data.model.Amenity
import com.hoa.paymentchecker.data.model.DashboardResponse
import com.hoa.paymentchecker.data.model.Vehicle
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch

class HomeownerDashboardFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var vehicleCurrentYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_homeowner_dashboard, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        view.findViewById<TextView>(R.id.tv_greeting).text = "Welcome, ${prefs.getUserName() ?: "Homeowner"}!"
        view.findViewById<TextView>(R.id.btn_logout).setOnClickListener { logout() }
        view.findViewById<TextView>(R.id.btn_view_amenities).setOnClickListener {
            findNavController().navigate(R.id.action_dashboard_to_amenities)
        }
        view.findViewById<TextView>(R.id.btn_view_my_bookings).setOnClickListener {
            findNavController().navigate(R.id.action_dashboard_to_amenities)
        }
        view.findViewById<TextView>(R.id.btn_view_vehicles).setOnClickListener {
            findNavController().navigate(R.id.action_dashboard_to_vehicles)
        }
        view.findViewById<TextView>(R.id.btn_submit_proof).setOnClickListener {
            findNavController().navigate(R.id.action_dashboard_to_payment_proof)
        }
        view.findViewById<TextView>(R.id.btn_view_renovation).setOnClickListener {
            findNavController().navigate(R.id.action_dashboard_to_renovation)
        }

        loadDashboard(view)
        loadVehiclesForDashboard(view)
    }

    override fun onResume() {
        super.onResume()
        loadDashboard(requireView())
        loadVehiclesForDashboard(requireView())
    }

    private fun loadDashboard(view: View) {
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getDashboard(prefs.getBearerToken())
                if (isAdded) bindDashboard(view, data)
            } catch (e: Exception) {
                if (!isAdded) return@launch
                when {
                    e.message?.contains("401") == true -> {
                        prefs.logout()
                        findNavController().navigate(R.id.action_dashboard_to_login)
                    }
                    else -> {
                        val flipper = view.findViewById<ViewFlipper>(R.id.vf_announcements)
                        flipper.removeAllViews()
                        flipper.addView(makeBannerView("Unable to load data", "Check your connection and try again."))
                        flipper.stopFlipping()

                        val llAm = view.findViewById<LinearLayout>(R.id.ll_amenities)
                        llAm.removeAllViews()
                        llAm.addView(makeText("Could not load amenities.", "#DC2626", 13f))

                        val llReq = view.findViewById<LinearLayout>(R.id.ll_my_requests)
                        llReq.removeAllViews()
                        llReq.addView(makeText("Could not load requests.", "#DC2626", 13f))
                    }
                }
            }
        }
    }

    private fun bindDashboard(view: View, data: DashboardResponse) {
        val ps = data.paymentStatus

        view.findViewById<TextView>(R.id.tv_period).text = "Period: ${ps.currentPeriod}"
        view.findViewById<TextView>(R.id.tv_months_behind).text = ps.monthsBehind.toString()
        view.findViewById<TextView>(R.id.tv_total_year).text = "₱${formatPeso(ps.totalPaidThisYear)}"

        val badge = view.findViewById<TextView>(R.id.tv_payment_badge)
        val detail = view.findViewById<TextView>(R.id.tv_payment_detail)
        val paidAt = view.findViewById<TextView>(R.id.tv_paid_at)

        if (ps.isPaid) {
            badge.text = "UPDATED"
            badge.setBackgroundColor(Color.parseColor("#3E9142"))
            detail.text = "Dues paid for ${ps.currentPeriod}"
            paidAt.text = "Paid on: ${ps.paidAt?.take(10) ?: ""}"
        } else {
            badge.text = "OUTDATED"
            badge.setBackgroundColor(Color.parseColor("#DC2626"))
            detail.text = if (ps.monthsBehind > 0) "${ps.monthsBehind} month(s) behind" else "Not yet paid"
            paidAt.text = if (ps.lastPaidPeriod != null) "Last paid: ${ps.lastPaidPeriod}" else "No payment recorded"
        }

        // Announcement banner (ViewFlipper)
        val flipper = view.findViewById<ViewFlipper>(R.id.vf_announcements)
        flipper.removeAllViews()
        if (data.announcements.isEmpty()) {
            flipper.addView(makeBannerView("No announcements at this time.", null))
            flipper.stopFlipping()
        } else {
            data.announcements.forEach { ann ->
                flipper.addView(makeBannerView(ann.title, ann.body))
            }
            if (data.announcements.size > 1) flipper.startFlipping() else flipper.stopFlipping()
        }

        // Amenities — circle grid
        renderAmenityCircles(view, data.amenities)

        // My Requests
        bindMyRequests(view, data.myRequests ?: emptyList())
    }

    private fun bindMyRequests(view: View, requests: List<AmenityBooking>) {
        val ll = view.findViewById<LinearLayout>(R.id.ll_my_requests)
        ll.removeAllViews()
        if (requests.isEmpty()) {
            ll.addView(makeText("No booking requests yet.", "#5A7A84", 13f))
            return
        }
        requests.forEach { req ->
            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, 6, 0, 6)
            }

            val nameView = TextView(requireContext()).apply {
                text = req.amenityName ?: "—"
                textSize = 13f
                setTextColor(Color.parseColor("#1A3A4A"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val statusColor = when (req.status) {
                "approved" -> "#3E9142"
                "rejected" -> "#DC2626"
                else -> "#D97706"
            }
            val statusLabel = req.status.replaceFirstChar { it.uppercaseChar() }
            val statusView = TextView(requireContext()).apply {
                text = statusLabel
                textSize = 11f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor(statusColor))
                setPadding(10, 4, 10, 4)
                setTypeface(null, android.graphics.Typeface.BOLD)
            }

            val dateView = TextView(requireContext()).apply {
                text = "  ${req.createdAt?.take(10) ?: ""}"
                textSize = 11f
                setTextColor(Color.parseColor("#5A7A84"))
            }

            row.addView(nameView)
            row.addView(statusView)
            row.addView(dateView)
            ll.addView(row)
        }
    }

    private fun renderAmenityCircles(view: View, amenities: List<Amenity>) {
        val container = view.findViewById<LinearLayout>(R.id.ll_amenities) ?: return
        container.removeAllViews()

        if (amenities.isEmpty()) {
            container.addView(makeText("No amenities available", "#5A7A84", 13f))
            return
        }

        val ctx = requireContext()
        val density = resources.displayMetrics.density
        val sizePx = (80 * density).toInt()

        amenities.forEach { amenity ->
            val inUse = amenity.currentStatus == "in_use"

            val wrapper = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.marginEnd = (14 * density).toInt()
                layoutParams = lp
                isClickable = true
                isFocusable = true
            }

            // Circle: image or initials
            val circle = android.widget.FrameLayout(ctx).apply {
                layoutParams = LinearLayout.LayoutParams(sizePx, sizePx)
            }

            val imgData = amenity.imageData
            if (!imgData.isNullOrBlank()) {
                // Decode base64 image → circular bitmap
                try {
                    val raw = if (imgData.contains(",")) imgData.substringAfter(",") else imgData
                    val bytes = android.util.Base64.decode(raw, android.util.Base64.DEFAULT)
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    val scaled = android.graphics.Bitmap.createScaledBitmap(bmp, sizePx, sizePx, true)

                    // Circular clip using BitmapShader
                    val output = android.graphics.Bitmap.createBitmap(sizePx, sizePx, android.graphics.Bitmap.Config.ARGB_8888)
                    val canvas = android.graphics.Canvas(output)
                    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
                    paint.shader = android.graphics.BitmapShader(scaled, android.graphics.Shader.TileMode.CLAMP, android.graphics.Shader.TileMode.CLAMP)
                    if (inUse) paint.colorFilter = android.graphics.ColorMatrixColorFilter(android.graphics.ColorMatrix().also { it.setSaturation(0f) })
                    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f, paint)

                    val imgView = android.widget.ImageView(ctx).apply {
                        setImageBitmap(output)
                        layoutParams = android.widget.FrameLayout.LayoutParams(sizePx, sizePx)
                        alpha = if (inUse) 0.5f else 1f
                    }
                    circle.addView(imgView)
                } catch (_: Exception) {
                    circle.addView(makeInitialsCircle(ctx, amenity.name, sizePx, inUse, density))
                }
            } else {
                circle.addView(makeInitialsCircle(ctx, amenity.name, sizePx, inUse, density))
            }

            // "In Use" overlay badge
            if (inUse) {
                val badge = TextView(ctx).apply {
                    text = "In Use"
                    textSize = 8f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(Color.WHITE)
                    setBackgroundColor(Color.parseColor("#9B9B9B"))
                    gravity = Gravity.CENTER
                    setPadding(0, (2 * density).toInt(), 0, (2 * density).toInt())
                    layoutParams = android.widget.FrameLayout.LayoutParams(
                        android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                        android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                        android.view.Gravity.BOTTOM
                    )
                }
                circle.addView(badge)
            }

            wrapper.addView(circle)

            // Name label
            wrapper.addView(TextView(ctx).apply {
                text = amenity.name.split(" ").take(2).joinToString("\n")
                textSize = 10f
                gravity = Gravity.CENTER
                setTextColor(if (inUse) Color.parseColor("#9B9B9B") else Color.parseColor("#1A3A4A"))
                val lp = LinearLayout.LayoutParams(sizePx + (8 * density).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.topMargin = (4 * density).toInt()
                layoutParams = lp
            })

            wrapper.setOnClickListener {
                findNavController().navigate(R.id.action_dashboard_to_amenities)
            }

            container.addView(wrapper)
        }
    }

    private fun makeInitialsCircle(ctx: android.content.Context, name: String, sizePx: Int, grayed: Boolean, density: Float): android.widget.FrameLayout {
        val initials = name.trim().split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")
        val bgColor = if (grayed) "#9B9B9B" else "#1A6B7B"
        val frame = android.widget.FrameLayout(ctx).apply {
            layoutParams = android.widget.FrameLayout.LayoutParams(sizePx, sizePx)
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(Color.parseColor(bgColor))
            }
            alpha = if (grayed) 0.6f else 1f
        }
        frame.addView(TextView(ctx).apply {
            text = initials
            textSize = (sizePx / density * 0.28f)
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT
            )
        })
        return frame
    }

    private fun loadVehiclesForDashboard(view: View) {
        val container = view.findViewById<LinearLayout>(R.id.ll_vehicle_circles) ?: return
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getMyVehicles(prefs.getBearerToken())
                if (!isAdded) return@launch
                vehicleCurrentYear = data.currentYear
                renderVehicleCircles(container, data.vehicles)
            } catch (e: Exception) {
                if (!isAdded) return@launch
                container.removeAllViews()
                container.addView(makeText("Could not load vehicles.", "#DC2626", 12f))
            }
        }
    }

    private fun renderVehicleCircles(container: LinearLayout, vehicles: List<Vehicle>) {
        container.removeAllViews()
        if (vehicles.isEmpty()) {
            container.addView(makeText("No vehicles registered yet.", "#94A3B8", 13f))
            return
        }

        val ctx = requireContext()
        val density = resources.displayMetrics.density
        val circleSizePx = (72 * density).toInt()

        vehicles.forEach { vehicle ->
            val (bgColor, statusLabel) = when (vehicle.stickerStatus) {
                "approved" -> Pair("#3E9142", "Registered")
                "pending"  -> Pair("#D97706", "Pending")
                "rejected" -> Pair("#DC2626", "Rejected")
                else       -> Pair("#5A7A84", "No Sticker")
            }

            val wrapper = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.marginEnd = (16 * density).toInt()
                layoutParams = lp
                isClickable = true
                isFocusable = true
            }

            val circle = TextView(ctx).apply {
                text = vehicle.plateNumber.take(7)
                textSize = if (vehicle.plateNumber.length > 5) 9f else 11f
                setTextColor(Color.WHITE)
                setTypeface(null, android.graphics.Typeface.BOLD)
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(circleSizePx, circleSizePx)
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor(bgColor))
                }
            }

            val label = TextView(ctx).apply {
                text = statusLabel
                textSize = 10f
                setTextColor(Color.parseColor(bgColor))
                gravity = Gravity.CENTER
                setTypeface(null, android.graphics.Typeface.BOLD)
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.topMargin = (4 * density).toInt()
                layoutParams = lp
            }

            wrapper.addView(circle)
            wrapper.addView(label)

            wrapper.setOnClickListener {
                if (vehicle.stickerStatus == "approved" && vehicle.stickerId != null) {
                    findNavController().navigate(
                        R.id.action_dashboard_to_sticker_qr,
                        bundleOf("stickerId" to vehicle.stickerId!!, "plateNumber" to vehicle.plateNumber)
                    )
                } else {
                    showVehicleDetailSheet(vehicle)
                }
            }

            container.addView(wrapper)
        }
    }

    private fun showVehicleDetailSheet(vehicle: Vehicle) {
        val dialog = BottomSheetDialog(requireContext())
        val sheet = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 48, 64, 48)
        }

        // Status badge
        val (badgeColor, badgeBg, badgeLabel) = when (vehicle.stickerStatus) {
            "pending"  -> Triple("#92400E", "#FEF3C7", "PENDING APPROVAL")
            "rejected" -> Triple("#991B1B", "#FEE2E2", "REJECTED")
            else       -> Triple("#475569", "#E2E8F0", "NO STICKER YET")
        }

        sheet.addView(TextView(requireContext()).apply {
            text = badgeLabel
            textSize = 11f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor(badgeColor))
            setBackgroundColor(Color.parseColor(badgeBg))
            setPadding(24, 10, 24, 10)
            gravity = Gravity.CENTER
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = 16
            layoutParams = lp
        })

        sheet.addView(TextView(requireContext()).apply {
            text = vehicle.plateNumber
            textSize = 26f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#1A3A4A"))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = 4
            layoutParams = lp
        })

        val details = listOfNotNull(vehicle.make, vehicle.model, vehicle.color, vehicle.year?.toString())
        if (details.isNotEmpty()) {
            sheet.addView(TextView(requireContext()).apply {
                text = details.joinToString("  ·  ")
                textSize = 14f
                setTextColor(Color.parseColor("#5A7A84"))
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = 16
                layoutParams = lp
            })
        }

        if (vehicle.stickerStatus == "pending") {
            sheet.addView(TextView(requireContext()).apply {
                text = "Your $vehicleCurrentYear sticker request has been submitted and is awaiting admin review."
                textSize = 13f
                setTextColor(Color.parseColor("#374151"))
            })
        } else if (vehicle.stickerStatus == "rejected") {
            sheet.addView(TextView(requireContext()).apply {
                text = "Your sticker request was rejected."
                textSize = 13f
                setTextColor(Color.parseColor("#991B1B"))
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = if (!vehicle.reviewNotes.isNullOrBlank()) 6 else 0
                layoutParams = lp
            })
            if (!vehicle.reviewNotes.isNullOrBlank()) {
                sheet.addView(TextView(requireContext()).apply {
                    text = "Reason: ${vehicle.reviewNotes}"
                    textSize = 13f
                    setTextColor(Color.parseColor("#5A7A84"))
                })
            }
        } else {
            sheet.addView(TextView(requireContext()).apply {
                text = "No sticker requested for $vehicleCurrentYear yet. Go to My Vehicles to request one."
                textSize = 13f
                setTextColor(Color.parseColor("#374151"))
            })
        }

        dialog.setContentView(sheet)
        dialog.show()
    }

    private fun makeBannerView(title: String, body: String?): LinearLayout {
        val ll = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        ll.addView(TextView(requireContext()).apply {
            text = title
            textSize = 17f
            setTextColor(Color.WHITE)
            setTypeface(null, android.graphics.Typeface.BOLD)
        })
        if (!body.isNullOrBlank()) {
            ll.addView(TextView(requireContext()).apply {
                text = body
                textSize = 14f
                setTextColor(Color.parseColor("#B2E0E8"))
                setPadding(0, 8, 0, 0)
                maxLines = 3
            })
        }
        return ll
    }

    private fun makeText(text: String, colorHex: String, size: Float): TextView {
        return TextView(requireContext()).apply {
            this.text = text
            textSize = size
            setTextColor(Color.parseColor(colorHex))
        }
    }

    private fun formatPeso(amount: Double): String {
        return String.format("%,.2f", amount)
    }

    private fun logout() {
        prefs.logout()
        findNavController().navigate(R.id.action_dashboard_to_login)
    }
}
