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
import com.hoa.paymentchecker.data.model.AmenityBooking
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch

class MyRequestsFragment : Fragment() {

    private lateinit var prefs: PreferencesManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_my_requests, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        view.findViewById<TextView>(R.id.btn_back).setOnClickListener {
            findNavController().navigateUp()
        }

        loadRequests(view)
    }

    override fun onResume() {
        super.onResume()
        loadRequests(requireView())
    }

    private fun loadRequests(view: View) {
        val container = view.findViewById<LinearLayout>(R.id.ll_requests_content)
        container.removeAllViews()
        container.addView(TextView(requireContext()).apply {
            text = "Loading..."; textSize = 14f; setTextColor(Color.parseColor("#64748B"))
        })

        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getMyBookings(prefs.getBearerToken())
                renderRequests(container, data.bookings)
            } catch (e: Exception) {
                container.removeAllViews()
                container.addView(TextView(requireContext()).apply {
                    text = "Failed to load requests"
                    textSize = 14f
                    setTextColor(Color.parseColor("#DC2626"))
                })
            }
        }
    }

    private fun renderRequests(container: LinearLayout, bookings: List<AmenityBooking>) {
        container.removeAllViews()
        if (bookings.isEmpty()) {
            container.addView(TextView(requireContext()).apply {
                text = "No booking requests yet.\nGo to Amenities to make a request."
                textSize = 14f
                setTextColor(Color.parseColor("#64748B"))
            })
            return
        }

        bookings.forEach { booking ->
            val card = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.VERTICAL
                background = resources.getDrawable(android.R.color.white, null)
                setPadding(16, 16, 16, 16)
                elevation = 4f
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.bottomMargin = 12
                layoutParams = lp
            }

            // Amenity name + status badge
            val titleRow = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
            }

            val amenityName = TextView(requireContext()).apply {
                text = booking.amenityName ?: "Amenity"
                textSize = 15f
                setTextColor(Color.parseColor("#1E293B"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val (statusColor, statusBg) = when (booking.status) {
                "approved" -> Pair("#166534", "#DCFCE7")
                "rejected" -> Pair("#991B1B", "#FEE2E2")
                else -> Pair("#92400E", "#FEF3C7")
            }
            val statusBadge = TextView(requireContext()).apply {
                text = booking.status.uppercase()
                textSize = 11f
                setTextColor(Color.parseColor(statusColor))
                setBackgroundColor(Color.parseColor(statusBg))
                setPadding(8, 4, 8, 4)
            }

            titleRow.addView(amenityName)
            titleRow.addView(statusBadge)
            card.addView(titleRow)

            // Date and time
            card.addView(TextView(requireContext()).apply {
                text = "📅 ${booking.requestedDate}  🕐 ${booking.timeStart} – ${booking.timeEnd}"
                textSize = 13f
                setTextColor(Color.parseColor("#374151"))
                setPadding(0, 8, 0, 0)
            })

            // Purpose
            if (!booking.purpose.isNullOrBlank()) {
                card.addView(TextView(requireContext()).apply {
                    text = "Purpose: ${booking.purpose}"
                    textSize = 13f
                    setTextColor(Color.parseColor("#64748B"))
                    setPadding(0, 4, 0, 0)
                })
            }

            // Review notes
            if (!booking.reviewNotes.isNullOrBlank()) {
                card.addView(TextView(requireContext()).apply {
                    text = "Note: ${booking.reviewNotes}"
                    textSize = 13f
                    setTextColor(Color.parseColor("#1E40AF"))
                    setPadding(0, 4, 0, 0)
                })
            }

            container.addView(card)
        }
    }
}
