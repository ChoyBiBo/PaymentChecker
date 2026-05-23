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
            badge.setBackgroundColor(Color.parseColor("#16A34A"))
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

        // Amenities
        val llAm = view.findViewById<LinearLayout>(R.id.ll_amenities)
        llAm.removeAllViews()
        if (data.amenities.isEmpty()) {
            llAm.addView(makeText("No amenities available", "#64748B", 13f))
        } else {
            data.amenities.take(4).forEach { bindAmenity(llAm, it) }
        }

        // My Requests
        bindMyRequests(view, data.myRequests ?: emptyList())
    }

    private fun bindMyRequests(view: View, requests: List<AmenityBooking>) {
        val ll = view.findViewById<LinearLayout>(R.id.ll_my_requests)
        ll.removeAllViews()
        if (requests.isEmpty()) {
            ll.addView(makeText("No booking requests yet.", "#64748B", 13f))
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
                setTextColor(Color.parseColor("#1E293B"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val statusColor = when (req.status) {
                "approved" -> "#16A34A"
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
                setTextColor(Color.parseColor("#64748B"))
            }

            row.addView(nameView)
            row.addView(statusView)
            row.addView(dateView)
            ll.addView(row)
        }
    }

    private fun bindAmenity(parent: LinearLayout, amenity: Amenity) {
        val ctx = requireContext()
        val block = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 10)
        }

        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        val name = TextView(ctx).apply {
            text = amenity.name
            textSize = 14f
            setTextColor(Color.parseColor("#1E293B"))
            setTypeface(null, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val statusColor = if (amenity.currentStatus == "in_use") "#1E40AF" else "#16A34A"
        val statusText = if (amenity.currentStatus == "in_use") "In Use" else "Available"
        val status = TextView(ctx).apply {
            text = statusText
            textSize = 12f
            setTextColor(Color.parseColor(statusColor))
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        row.addView(name)
        row.addView(status)
        block.addView(row)

        val schedule = amenity.upcomingSchedule
        if (!schedule.isNullOrEmpty()) {
            schedule.take(3).forEach { slot ->
                block.addView(TextView(ctx).apply {
                    text = "  · ${slot.requestedDate} ${slot.timeStart.take(5)}–${slot.timeEnd.take(5)}" +
                            if (!slot.purpose.isNullOrBlank()) " (${slot.purpose})" else ""
                    textSize = 12f
                    setTextColor(Color.parseColor("#64748B"))
                })
            }
        }

        parent.addView(block)
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
                "approved" -> Pair("#16A34A", "Registered")
                "pending"  -> Pair("#D97706", "Pending")
                "rejected" -> Pair("#DC2626", "Rejected")
                else       -> Pair("#64748B", "No Sticker")
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
            setTextColor(Color.parseColor("#1E293B"))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = 4
            layoutParams = lp
        })

        val details = listOfNotNull(vehicle.make, vehicle.model, vehicle.color, vehicle.year?.toString())
        if (details.isNotEmpty()) {
            sheet.addView(TextView(requireContext()).apply {
                text = details.joinToString("  ·  ")
                textSize = 14f
                setTextColor(Color.parseColor("#64748B"))
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
                    setTextColor(Color.parseColor("#64748B"))
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
                setTextColor(Color.parseColor("#BFDBFE"))
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
