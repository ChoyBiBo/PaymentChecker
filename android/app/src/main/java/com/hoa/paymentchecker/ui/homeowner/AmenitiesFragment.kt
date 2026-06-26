package com.hoa.paymentchecker.ui.homeowner

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.Amenity
import com.hoa.paymentchecker.data.model.BookingRequest
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch
import java.util.Calendar

class AmenitiesFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var amenities = listOf<Amenity>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_amenities, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        view.findViewById<TextView>(R.id.btn_my_requests).setOnClickListener {
            findNavController().navigate(R.id.action_amenities_to_requests)
        }

        loadAmenities(view)
    }

    override fun onResume() {
        super.onResume()
        loadAmenities(requireView())
    }

    private fun loadAmenities(view: View) {
        val container = view.findViewById<LinearLayout>(R.id.ll_amenities_content)
        container.removeAllViews()
        val loading = TextView(requireContext()).apply {
            text = "Loading..."; textSize = 14f; setTextColor(Color.parseColor("#5A7A84"))
        }
        container.addView(loading)

        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getAmenities()
                amenities = data.amenities
                renderAmenities(container)
            } catch (e: Exception) {
                container.removeAllViews()
                container.addView(TextView(requireContext()).apply {
                    text = "Failed to load amenities"
                    textSize = 14f
                    setTextColor(Color.parseColor("#DC2626"))
                })
            }
        }
    }

    private fun renderAmenities(container: LinearLayout) {
        container.removeAllViews()
        if (amenities.isEmpty()) {
            container.addView(TextView(requireContext()).apply {
                text = "No amenities available"
                textSize = 14f
                setTextColor(Color.parseColor("#5A7A84"))
            })
            return
        }

        val dp = resources.displayMetrics.density

        amenities.forEach { amenity ->
            val card = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.VERTICAL
                background = resources.getDrawable(R.drawable.rounded_card, null)
                elevation = 6f
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.bottomMargin = (12 * dp).toInt()
                layoutParams = lp
                clipToOutline = true
            }

            // Banner image (full-width from DB base64)
            if (!amenity.imageData.isNullOrBlank()) {
                try {
                    val bytes = android.util.Base64.decode(amenity.imageData, android.util.Base64.DEFAULT)
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bmp != null) {
                        val banner = ImageView(requireContext()).apply {
                            setImageBitmap(bmp)
                            scaleType = ImageView.ScaleType.CENTER_CROP
                            layoutParams = LinearLayout.LayoutParams(
                                LinearLayout.LayoutParams.MATCH_PARENT,
                                (180 * dp).toInt()
                            )
                        }
                        card.addView(banner)
                    }
                } catch (_: Exception) { }
            }

            val body = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.VERTICAL
                setPadding((16 * dp).toInt(), (14 * dp).toInt(), (16 * dp).toInt(), (16 * dp).toInt())
            }

            // Name + status badge row
            val nameRow = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
            }

            val name = TextView(requireContext()).apply {
                text = amenity.name
                textSize = 16f
                setTextColor(Color.parseColor("#1A3A4A"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val isInUse = amenity.currentStatus == "in_use"
            val statusBadge = TextView(requireContext()).apply {
                text = if (isInUse) "In Use" else "Available"
                textSize = 11f
                setTypeface(null, android.graphics.Typeface.BOLD)
                val badgeDrawable = if (isInUse) R.drawable.pill_badge_amber else R.drawable.pill_badge_green
                background = resources.getDrawable(badgeDrawable, null)
                setTextColor(Color.parseColor(if (isInUse) "#92400E" else "#16A34A"))
                setPadding((10 * dp).toInt(), (4 * dp).toInt(), (10 * dp).toInt(), (4 * dp).toInt())
            }

            nameRow.addView(name)
            nameRow.addView(statusBadge)
            body.addView(nameRow)

            if (!amenity.description.isNullOrBlank()) {
                body.addView(TextView(requireContext()).apply {
                    text = amenity.description
                    textSize = 13f
                    setTextColor(Color.parseColor("#5A7A84"))
                    setPadding(0, (6 * dp).toInt(), 0, 0)
                })
            }

            // Meta row: location + capacity
            val meta = buildString {
                if (!amenity.location.isNullOrBlank()) append("📍 ${amenity.location}")
                if (amenity.capacity != null) {
                    if (isNotEmpty()) append("   ")
                    append("👥 ${amenity.capacity} pax")
                }
            }
            if (meta.isNotBlank()) {
                body.addView(TextView(requireContext()).apply {
                    text = meta
                    textSize = 12f
                    setTextColor(Color.parseColor("#5A7A84"))
                    setPadding(0, (6 * dp).toInt(), 0, 0)
                })
            }

            // Upcoming schedule
            val schedule = amenity.upcomingSchedule
            if (!schedule.isNullOrEmpty()) {
                body.addView(TextView(requireContext()).apply {
                    text = "Upcoming bookings:"
                    textSize = 12f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(Color.parseColor("#374151"))
                    setPadding(0, (10 * dp).toInt(), 0, (2 * dp).toInt())
                })
                schedule.take(5).forEach { slot ->
                    body.addView(TextView(requireContext()).apply {
                        text = "  · ${slot.requestedDate}  ${slot.timeStart.take(5)}–${slot.timeEnd.take(5)}" +
                                if (!slot.purpose.isNullOrBlank()) "  (${slot.purpose})" else ""
                        textSize = 12f
                        setTextColor(Color.parseColor("#5A7A84"))
                    })
                }
            }

            val btnRequest = Button(requireContext()).apply {
                text = if (isInUse) "Currently In Use" else "Book Facility"
                isEnabled = !isInUse
                backgroundTintList = android.content.res.ColorStateList.valueOf(
                    Color.parseColor(if (isEnabled) "#1A6B7B" else "#CBD5E1")
                )
                setTextColor(Color.WHITE)
                textSize = 14f
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    (52 * dp).toInt()
                )
                lp.topMargin = (14 * dp).toInt()
                layoutParams = lp
            }
            btnRequest.setOnClickListener { showBookingSheet(amenity) }

            body.addView(btnRequest)
            card.addView(body)
            container.addView(card)
        }
    }

    private fun showBookingSheet(amenity: Amenity) {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = LayoutInflater.from(requireContext())
            .inflate(R.layout.fragment_amenity_request, null)

        sheetView.findViewById<TextView>(R.id.tv_amenity_name).text = amenity.name

        val etDate = sheetView.findViewById<EditText>(R.id.et_date)
        val etStart = sheetView.findViewById<EditText>(R.id.et_time_start)
        val etEnd = sheetView.findViewById<EditText>(R.id.et_time_end)
        val etPurpose = sheetView.findViewById<EditText>(R.id.et_purpose)
        val tvError = sheetView.findViewById<TextView>(R.id.tv_request_error)

        // Schedule info container — shown after date is picked
        val tvScheduleLabel = TextView(requireContext()).apply {
            text = "Booked slots on this date:"
            textSize = 12f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(Color.parseColor("#374151"))
            visibility = View.GONE
        }
        val llScheduleSlots = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
        }
        // Insert schedule info between date field and time fields
        val parent = etDate.parent as? LinearLayout
        val dateIndex = (0 until (parent?.childCount ?: 0)).firstOrNull { parent?.getChildAt(it) == etDate } ?: -1
        if (dateIndex >= 0 && parent != null) {
            parent.addView(tvScheduleLabel, dateIndex + 1)
            parent.addView(llScheduleSlots, dateIndex + 2)
        }

        fun loadScheduleForDate(date: String) {
            tvScheduleLabel.visibility = View.GONE
            llScheduleSlots.visibility = View.GONE
            llScheduleSlots.removeAllViews()
            lifecycleScope.launch {
                try {
                    val service = RetrofitClient.getAppService(requireContext())
                    val response = service.getAmenitySchedule(amenity.id, date)
                    if (response.bookings.isEmpty()) {
                        tvScheduleLabel.text = "No bookings on this date — all slots available!"
                        tvScheduleLabel.setTextColor(Color.parseColor("#3E9142"))
                    } else {
                        tvScheduleLabel.text = "Booked slots on $date:"
                        tvScheduleLabel.setTextColor(Color.parseColor("#374151"))
                        response.bookings.forEach { slot ->
                            llScheduleSlots.addView(TextView(requireContext()).apply {
                                text = "  · ${slot.timeStart.take(5)}–${slot.timeEnd.take(5)}" +
                                        if (!slot.purpose.isNullOrBlank()) "  (${slot.purpose})" else ""
                                textSize = 12f
                                setTextColor(Color.parseColor("#5A7A84"))
                            })
                        }
                        llScheduleSlots.visibility = View.VISIBLE
                    }
                    tvScheduleLabel.visibility = View.VISIBLE
                } catch (_: Exception) {}
            }
        }

        // Date picker
        etDate.setOnClickListener {
            val cal = Calendar.getInstance()
            DatePickerDialog(requireContext(), { _, y, m, d ->
                val dateStr = String.format("%04d-%02d-%02d", y, m + 1, d)
                etDate.setText(dateStr)
                loadScheduleForDate(dateStr)
            }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
        }

        // Time pickers
        etStart.setOnClickListener {
            val cal = Calendar.getInstance()
            TimePickerDialog(requireContext(), { _, h, m ->
                etStart.setText(String.format("%02d:%02d", h, m))
            }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
        }

        etEnd.setOnClickListener {
            val cal = Calendar.getInstance()
            TimePickerDialog(requireContext(), { _, h, m ->
                etEnd.setText(String.format("%02d:%02d", h, m))
            }, cal.get(Calendar.HOUR_OF_DAY) + 1, cal.get(Calendar.MINUTE), true).show()
        }

        sheetView.findViewById<Button>(R.id.btn_cancel_request).setOnClickListener {
            dialog.dismiss()
        }

        sheetView.findViewById<Button>(R.id.btn_submit_request).setOnClickListener {
            val date = etDate.text.toString().trim()
            val start = etStart.text.toString().trim()
            val end = etEnd.text.toString().trim()
            val purpose = etPurpose.text.toString().trim()

            if (date.isEmpty() || start.isEmpty() || end.isEmpty()) {
                tvError.text = "Date, start time, and end time are required"
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }
            if (start >= end) {
                tvError.text = "End time must be after start time"
                tvError.visibility = View.VISIBLE
                return@setOnClickListener
            }

            val btnSubmit = sheetView.findViewById<Button>(R.id.btn_submit_request)
            btnSubmit.isEnabled = false
            btnSubmit.text = "Submitting..."

            lifecycleScope.launch {
                try {
                    val service = RetrofitClient.getAppService(requireContext())
                    service.createBooking(
                        prefs.getBearerToken(),
                        BookingRequest(
                            amenityId = amenity.id,
                            requestedDate = date,
                            timeStart = start,
                            timeEnd = end,
                            purpose = purpose.ifEmpty { null }
                        )
                    )
                    dialog.dismiss()
                    Toast.makeText(requireContext(), "Request submitted successfully!", Toast.LENGTH_SHORT).show()
                    loadAmenities(requireView())
                } catch (e: Exception) {
                    val msg = when {
                        e.message?.contains("403") == true -> "Your account must be updated (current month dues paid) to book amenities."
                        e.message?.contains("409") == true -> "This slot is already booked"
                        else -> "Failed to submit request"
                    }
                    tvError.text = msg
                    tvError.visibility = View.VISIBLE
                    btnSubmit.isEnabled = true
                    btnSubmit.text = "Submit Request"
                }
            }
        }

        dialog.setContentView(sheetView)
        dialog.show()
    }
}
