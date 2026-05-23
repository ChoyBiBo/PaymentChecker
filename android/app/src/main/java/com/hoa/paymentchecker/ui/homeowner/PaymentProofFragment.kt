package com.hoa.paymentchecker.ui.homeowner

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.PaymentProof
import com.hoa.paymentchecker.data.model.SubmitProofRequest
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Calendar

class PaymentProofFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var capturedImageBase64: String? = null
    private var cameraImageUri: Uri? = null

    private val MONTHS = listOf(
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
    )

    private val takePicture = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success && cameraImageUri != null) {
            processImageUri(cameraImageUri!!)
        }
    }

    private val pickFromGallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) processImageUri(uri)
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_payment_proof, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        view.findViewById<TextView>(R.id.btn_back).setOnClickListener {
            findNavController().popBackStack()
        }

        setupPeriodSpinners(view)
        setupImageButtons(view)
        setupSubmitButton(view)
        loadSubmissions(view)
    }

    private fun setupPeriodSpinners(view: View) {
        val cal = Calendar.getInstance()
        val currentYear = cal.get(Calendar.YEAR)
        val currentMonth = cal.get(Calendar.MONTH) // 0-based

        val monthAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, MONTHS)
        monthAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        view.findViewById<Spinner>(R.id.sp_month).apply {
            adapter = monthAdapter
            setSelection(currentMonth)
        }

        val years = (currentYear downTo currentYear - 2).map { it.toString() }
        val yearAdapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, years)
        yearAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        view.findViewById<Spinner>(R.id.sp_year).apply {
            adapter = yearAdapter
            setSelection(0)
        }
    }

    private fun setupImageButtons(view: View) {
        view.findViewById<Button>(R.id.btn_camera).setOnClickListener {
            val file = File(requireContext().cacheDir, "or_photo_${System.currentTimeMillis()}.jpg")
            cameraImageUri = FileProvider.getUriForFile(
                requireContext(),
                "${requireContext().packageName}.provider",
                file
            )
            takePicture.launch(cameraImageUri)
        }

        view.findViewById<Button>(R.id.btn_gallery).setOnClickListener {
            pickFromGallery.launch("image/*")
        }
    }

    private fun processImageUri(uri: Uri) {
        try {
            val inputStream = requireContext().contentResolver.openInputStream(uri) ?: return
            val originalBitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()

            // Scale down to max 900px on longest side
            val compressed = scaleBitmap(originalBitmap, 900)

            // Encode to base64 JPEG
            val out = ByteArrayOutputStream()
            compressed.compress(Bitmap.CompressFormat.JPEG, 75, out)
            capturedImageBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)

            // Show preview
            val view = requireView()
            view.findViewById<ImageView>(R.id.iv_preview).apply {
                setImageBitmap(compressed)
                visibility = View.VISIBLE
            }
            view.findViewById<View>(R.id.tv_image_placeholder).visibility = View.GONE
            view.findViewById<Button>(R.id.btn_submit).isEnabled = true
        } catch (e: Exception) {
            showStatus(requireView(), "Failed to load image: ${e.message}", isError = true)
        }
    }

    private fun scaleBitmap(bitmap: Bitmap, maxPx: Int): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        if (w <= maxPx && h <= maxPx) return bitmap
        val ratio = maxPx.toFloat() / maxOf(w, h)
        return Bitmap.createScaledBitmap(bitmap, (w * ratio).toInt(), (h * ratio).toInt(), true)
    }

    private fun setupSubmitButton(view: View) {
        view.findViewById<Button>(R.id.btn_submit).setOnClickListener {
            val base64 = capturedImageBase64 ?: return@setOnClickListener
            val monthPos = view.findViewById<Spinner>(R.id.sp_month).selectedItemPosition + 1
            val year = view.findViewById<Spinner>(R.id.sp_year).selectedItem.toString().toInt()

            view.findViewById<Button>(R.id.btn_submit).isEnabled = false
            showStatus(view, "Submitting...", isError = false)

            lifecycleScope.launch {
                try {
                    val service = RetrofitClient.getAppService(requireContext())
                    service.submitProof(
                        prefs.getBearerToken(),
                        SubmitProofRequest(year, monthPos, base64)
                    )
                    if (!isAdded) return@launch
                    showStatus(view, "Proof submitted! Admin will review it shortly.", isError = false)
                    capturedImageBase64 = null
                    view.findViewById<ImageView>(R.id.iv_preview).visibility = View.GONE
                    view.findViewById<View>(R.id.tv_image_placeholder).visibility = View.VISIBLE
                    view.findViewById<Button>(R.id.btn_submit).isEnabled = false
                    loadSubmissions(view)
                } catch (e: Exception) {
                    if (!isAdded) return@launch
                    view.findViewById<Button>(R.id.btn_submit).isEnabled = true
                    showStatus(view, e.message ?: "Submission failed.", isError = true)
                }
            }
        }
    }

    private fun loadSubmissions(view: View) {
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val data = service.getMyProofs(prefs.getBearerToken())
                if (!isAdded) return@launch
                bindSubmissions(view, data.proofs)
            } catch (e: Exception) {
                if (!isAdded) return@launch
                val ll = view.findViewById<LinearLayout>(R.id.ll_submissions)
                ll.removeAllViews()
                ll.addView(makeText("Could not load submissions.", "#DC2626", 13f))
            }
        }
    }

    private fun bindSubmissions(view: View, proofs: List<PaymentProof>) {
        val ll = view.findViewById<LinearLayout>(R.id.ll_submissions)
        ll.removeAllViews()
        if (proofs.isEmpty()) {
            ll.addView(makeText("No submissions yet.", "#64748B", 13f))
            return
        }
        proofs.forEach { proof ->
            val monthName = MONTHS.getOrNull(proof.periodMonth - 1) ?: proof.periodMonth.toString()
            val period = "$monthName ${proof.periodYear}"

            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, 8, 0, 8)
            }

            val periodView = TextView(requireContext()).apply {
                text = period
                textSize = 13f
                setTextColor(Color.parseColor("#1E293B"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val (statusColor, statusBg, statusLabel) = when (proof.status) {
                "approved" -> Triple("#166534", "#DCFCE7", "Approved")
                "rejected" -> Triple("#991B1B", "#FEE2E2", "Rejected")
                else       -> Triple("#92400E", "#FEF3C7", "Pending")
            }
            val statusView = TextView(requireContext()).apply {
                text = statusLabel
                textSize = 11f
                setTextColor(Color.parseColor(statusColor))
                setBackgroundColor(Color.parseColor(statusBg))
                setPadding(12, 4, 12, 4)
                setTypeface(null, android.graphics.Typeface.BOLD)
            }

            val dateView = TextView(requireContext()).apply {
                text = "  ${proof.submittedAt.take(10)}"
                textSize = 11f
                setTextColor(Color.parseColor("#64748B"))
            }

            row.addView(periodView)
            row.addView(statusView)
            row.addView(dateView)

            if (!proof.reviewNotes.isNullOrBlank()) {
                val block = LinearLayout(requireContext()).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(0, 0, 0, 4)
                }
                block.addView(row)
                block.addView(TextView(requireContext()).apply {
                    text = "  ${proof.reviewNotes}"
                    textSize = 11f
                    setTextColor(Color.parseColor("#64748B"))
                })
                ll.addView(block)
            } else {
                ll.addView(row)
            }
        }
    }

    private fun showStatus(view: View, msg: String, isError: Boolean) {
        view.findViewById<TextView>(R.id.tv_submit_status).apply {
            text = msg
            setTextColor(Color.parseColor(if (isError) "#DC2626" else "#16A34A"))
            visibility = View.VISIBLE
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
