package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.Announcement
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
        view.findViewById<TextView>(R.id.btn_view_vehicles).setOnClickListener {
            findNavController().navigate(R.id.action_dashboard_to_vehicles)
        }

        loadDashboard(view)
    }

    private fun loadDashboard(view: View) {
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getDashboard(prefs.getBearerToken())
                bindDashboard(view, data)
            } catch (e: Exception) {
                if (e.message?.contains("401") == true) {
                    prefs.logout()
                    findNavController().navigate(R.id.action_dashboard_to_login)
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

        // Announcements
        val llAnn = view.findViewById<LinearLayout>(R.id.ll_announcements)
        llAnn.removeAllViews()
        if (data.announcements.isEmpty()) {
            llAnn.addView(makeText("No announcements", "#64748B", 13f))
        } else {
            data.announcements.take(3).forEach { bindAnnouncement(llAnn, it) }
        }

        // Amenities
        val llAm = view.findViewById<LinearLayout>(R.id.ll_amenities)
        llAm.removeAllViews()
        if (data.amenities.isEmpty()) {
            llAm.addView(makeText("No amenities", "#64748B", 13f))
        } else {
            data.amenities.take(4).forEach { bindAmenity(llAm, it) }
        }
    }

    private fun bindAnnouncement(parent: LinearLayout, ann: Announcement) {
        val ctx = requireContext()
        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 12)
        }
        val title = TextView(ctx).apply {
            text = ann.title
            textSize = 14f
            setTextColor(Color.parseColor("#1E293B"))
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        val body = TextView(ctx).apply {
            text = ann.body
            textSize = 13f
            setTextColor(Color.parseColor("#374151"))
            maxLines = 2
        }
        row.addView(title)
        row.addView(body)
        parent.addView(row)
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

        // Show upcoming booked slots
        val schedule = amenity.upcomingSchedule
        if (!schedule.isNullOrEmpty()) {
            schedule.take(3).forEach { slot ->
                val slotText = TextView(ctx).apply {
                    text = "  · ${slot.requestedDate} ${slot.timeStart.take(5)}–${slot.timeEnd.take(5)}" +
                            if (!slot.purpose.isNullOrBlank()) " (${slot.purpose})" else ""
                    textSize = 12f
                    setTextColor(Color.parseColor("#64748B"))
                }
                block.addView(slotText)
            }
        }

        parent.addView(block)
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
