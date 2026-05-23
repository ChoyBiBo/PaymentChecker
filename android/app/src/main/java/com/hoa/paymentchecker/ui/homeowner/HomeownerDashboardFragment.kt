package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.ViewFlipper
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.AmenityBooking
import com.hoa.paymentchecker.data.model.Amenity
import com.hoa.paymentchecker.data.model.DashboardResponse
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch

class HomeownerDashboardFragment : Fragment() {

    private lateinit var prefs: PreferencesManager

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
    }

    override fun onResume() {
        super.onResume()
        loadDashboard(requireView())
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
                        // Show error in banner; amenities show fallback
                        val flipper = view.findViewById<ViewFlipper>(R.id.vf_announcements)
                        flipper.removeAllViews()
                        flipper.addView(makeBannerText("Unable to load data. Check your connection."))
                        flipper.stopFlipping()

                        val llAm = view.findViewById<LinearLayout>(R.id.ll_amenities)
                        llAm.removeAllViews()
                        llAm.addView(makeText("Could not load amenities", "#DC2626", 13f))
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
            flipper.addView(makeBannerText("No announcements at this time."))
            flipper.stopFlipping()
        } else {
            data.announcements.forEach { ann ->
                flipper.addView(makeBannerText("📢  ${ann.title}  —  ${ann.body}"))
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
        bindMyRequests(view, data.myRequests)
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

    private fun makeBannerText(text: String): TextView {
        return TextView(requireContext()).apply {
            this.text = text
            textSize = 13f
            setTextColor(Color.parseColor("#FFFFFF"))
            maxLines = 2
        }
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
