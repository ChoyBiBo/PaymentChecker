package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.*
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.RenovationFileSubmit
import com.hoa.paymentchecker.data.model.RenovationPermitRequest
import com.hoa.paymentchecker.data.model.RenovationRequirement
import com.hoa.paymentchecker.data.model.RenovationWorkerSubmit
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

private data class WorkerEntry(val name: String, val idCardBase64: String)

class RenovationFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var requirements = listOf<RenovationRequirement>()
    private val attachedFiles = mutableMapOf<Int, Pair<String, String?>>() // reqId -> (base64, fileName)
    private val workers = mutableListOf<WorkerEntry>()

    // Requirement file picking
    private var pendingRequirementId: Int = -1
    private val attachButtonRefs = mutableMapOf<Int, TextView>()

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null && pendingRequirementId >= 0) processFileUri(uri, pendingRequirementId)
    }

    // Worker ID card picking
    private var pendingWorkerIdCard: String? = null

    private val pickWorkerIdCard = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) processWorkerIdCard(uri)
    }

    private fun processFileUri(uri: Uri, requirementId: Int) {
        try {
            val ctx = requireContext()
            val mimeType = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val stream = ctx.contentResolver.openInputStream(uri) ?: return
            val bytes: ByteArray
            if (mimeType.startsWith("image/")) {
                val bmp = BitmapFactory.decodeStream(stream); stream.close()
                val maxPx = 1200
                val scaled = if (bmp.width > maxPx || bmp.height > maxPx) {
                    val ratio = maxPx.toFloat() / maxOf(bmp.width, bmp.height)
                    Bitmap.createScaledBitmap(bmp, (bmp.width * ratio).toInt(), (bmp.height * ratio).toInt(), true)
                } else bmp
                val out = ByteArrayOutputStream(); scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
                bytes = out.toByteArray()
            } else { bytes = stream.readBytes(); stream.close() }
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            val fileName = uri.lastPathSegment ?: "file"
            attachedFiles[requirementId] = Pair("data:$mimeType;base64,$b64", fileName)
            attachButtonRefs[requirementId]?.apply {
                text = "✓ $fileName"
                setTextColor(Color.parseColor("#3E9142"))
            }
        } catch (_: Exception) {
            Toast.makeText(requireContext(), "Failed to read file", Toast.LENGTH_SHORT).show()
        }
    }

    private fun processWorkerIdCard(uri: Uri) {
        try {
            val ctx = requireContext()
            val mimeType = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val stream = ctx.contentResolver.openInputStream(uri) ?: return
            val bmp = BitmapFactory.decodeStream(stream); stream.close()
            val maxPx = 1200
            val scaled = if (bmp.width > maxPx || bmp.height > maxPx) {
                val ratio = maxPx.toFloat() / maxOf(bmp.width, bmp.height)
                Bitmap.createScaledBitmap(bmp, (bmp.width * ratio).toInt(), (bmp.height * ratio).toInt(), true)
            } else bmp
            val out = ByteArrayOutputStream(); scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            pendingWorkerIdCard = "data:$mimeType;base64,$b64"
            requireView().findViewById<TextView>(R.id.btn_attach_worker_id).apply {
                text = "✓ ID Card Attached"
                setTextColor(Color.parseColor("#3E9142"))
                setBackgroundColor(Color.parseColor("#DCFCE7"))
            }
        } catch (_: Exception) {
            Toast.makeText(requireContext(), "Failed to read image", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_renovation, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        view.findViewById<TextView>(R.id.btn_back).setOnClickListener {
            findNavController().popBackStack()
        }

        view.findViewById<TextView>(R.id.btn_attach_worker_id).setOnClickListener {
            pickWorkerIdCard.launch("image/*")
        }

        view.findViewById<Button>(R.id.btn_add_worker).setOnClickListener {
            addWorker(view)
        }

        loadData(view)

        view.findViewById<Button>(R.id.btn_submit).setOnClickListener {
            submitPermit(view)
        }
    }

    override fun onResume() {
        super.onResume()
        loadData(requireView())
    }

    private fun addWorker(view: View) {
        val nameInput = view.findViewById<EditText>(R.id.et_worker_name)
        val name = nameInput.text.toString().trim()

        if (name.isEmpty()) {
            Toast.makeText(requireContext(), "Please enter the worker's name.", Toast.LENGTH_SHORT).show()
            return
        }
        if (pendingWorkerIdCard == null) {
            Toast.makeText(requireContext(), "ID card photo is required for each worker.", Toast.LENGTH_SHORT).show()
            return
        }

        workers.add(WorkerEntry(name, pendingWorkerIdCard!!))
        pendingWorkerIdCard = null

        // Reset form
        nameInput.setText("")
        view.findViewById<TextView>(R.id.btn_attach_worker_id).apply {
            text = "📷  Attach ID Card Photo (required)"
            setTextColor(Color.parseColor("#1A6B7B"))
            setBackgroundColor(Color.parseColor("#E8F4F7"))
        }

        renderWorkersList(view)
        Toast.makeText(requireContext(), "Worker added.", Toast.LENGTH_SHORT).show()
    }

    private fun renderWorkersList(view: View) {
        val container = view.findViewById<LinearLayout>(R.id.ll_workers)
        container.removeAllViews()
        val density = resources.displayMetrics.density

        workers.forEachIndexed { index, worker ->
            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setBackgroundColor(Color.parseColor("#F0F7F8"))
                setPadding((10 * density).toInt(), (8 * density).toInt(), (10 * density).toInt(), (8 * density).toInt())
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = (6 * density).toInt()
                layoutParams = lp
            }

            row.addView(TextView(requireContext()).apply {
                text = "👷 ${worker.name}"
                textSize = 13f
                setTextColor(Color.parseColor("#1A3A4A"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })

            row.addView(TextView(requireContext()).apply {
                text = "✓ ID"
                textSize = 11f
                setTextColor(Color.parseColor("#3E9142"))
                setPadding((6 * density).toInt(), 0, (10 * density).toInt(), 0)
            })

            row.addView(TextView(requireContext()).apply {
                text = "✕"
                textSize = 16f
                setTextColor(Color.parseColor("#EF4444"))
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    workers.removeAt(index)
                    renderWorkersList(view)
                }
            })

            container.addView(row)
        }
    }

    private fun loadData(view: View) {
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                requirements = service.getRenovationRequirements().requirements
                renderRequirements(view)
            } catch (_: Exception) {}

            try {
                val service = RetrofitClient.getAppService(requireContext())
                val permitData = service.getMyRenovationPermits(prefs.getBearerToken())
                renderMyPermits(view, permitData.permits)
            } catch (_: Exception) {}
        }
    }

    private fun renderRequirements(view: View) {
        val container = view.findViewById<LinearLayout>(R.id.ll_requirements)
        container.removeAllViews()
        attachButtonRefs.clear()

        if (requirements.isEmpty()) {
            container.addView(makeText("No requirements listed yet.", "#5A7A84", 13f))
            return
        }

        val density = resources.displayMetrics.density
        requirements.forEach { req ->
            val block = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.VERTICAL
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = (12 * density).toInt()
                layoutParams = lp
            }

            block.addView(TextView(requireContext()).apply {
                text = "${req.sortOrder}. ${req.title}"
                textSize = 14f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(Color.parseColor("#1A3A4A"))
            })
            if (!req.description.isNullOrBlank()) {
                block.addView(TextView(requireContext()).apply {
                    text = req.description
                    textSize = 12f
                    setTextColor(Color.parseColor("#5A7A84"))
                    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    lp.topMargin = (2 * density).toInt()
                    layoutParams = lp
                })
            }

            val btnAttach = TextView(requireContext()).apply {
                text = if (attachedFiles.containsKey(req.id)) "✓ ${attachedFiles[req.id]?.second ?: "Attached"}"
                       else "📎  Attach File / Photo"
                textSize = 13f
                setTextColor(if (attachedFiles.containsKey(req.id)) Color.parseColor("#3E9142") else Color.parseColor("#1A6B7B"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                setPadding(0, (8 * density).toInt(), 0, (4 * density).toInt())
                isClickable = true; isFocusable = true
                setOnClickListener { pendingRequirementId = req.id; pickFile.launch("*/*") }
            }
            attachButtonRefs[req.id] = btnAttach
            block.addView(btnAttach)
            container.addView(block)
        }
    }

    private fun renderMyPermits(view: View, permits: List<com.hoa.paymentchecker.data.model.RenovationPermit>) {
        val container = view.findViewById<LinearLayout>(R.id.ll_my_permits)
        container.removeAllViews()
        if (permits.isEmpty()) {
            container.addView(makeText("No permit requests submitted yet.", "#5A7A84", 13f))
            return
        }
        val density = resources.displayMetrics.density
        permits.take(5).forEach { permit ->
            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.bottomMargin = (8 * density).toInt()
                layoutParams = lp
            }
            row.addView(TextView(requireContext()).apply {
                text = permit.createdAt?.take(10) ?: "—"
                textSize = 12f
                setTextColor(Color.parseColor("#5A7A84"))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            val (badgeColor, badgeBg) = when (permit.status) {
                "complete"   -> Pair("#166534", "#DCFCE7")
                "incomplete" -> Pair("#92400E", "#FEF3C7")
                "rejected"   -> Pair("#991B1B", "#FEE2E2")
                else         -> Pair("#475569", "#E2E8F0")
            }
            row.addView(TextView(requireContext()).apply {
                text = permit.status.replaceFirstChar { it.uppercaseChar() }
                textSize = 11f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(Color.parseColor(badgeColor))
                setBackgroundColor(Color.parseColor(badgeBg))
                setPadding(10, 4, 10, 4)
            })
            container.addView(row)
            if (permit.status == "rejected" && !permit.rejectionReason.isNullOrBlank()) {
                container.addView(TextView(requireContext()).apply {
                    text = "Reason: ${permit.rejectionReason}"
                    textSize = 12f
                    setTextColor(Color.parseColor("#991B1B"))
                    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    lp.bottomMargin = (4 * density).toInt()
                    layoutParams = lp
                })
            }
        }
    }

    private fun submitPermit(view: View) {
        val errorView = view.findViewById<TextView>(R.id.tv_submit_error)
        errorView.visibility = View.GONE

        if (attachedFiles.isEmpty()) {
            errorView.text = "Please attach at least one file before submitting."
            errorView.visibility = View.VISIBLE
            return
        }

        val btn = view.findViewById<Button>(R.id.btn_submit)
        btn.isEnabled = false
        btn.text = "Submitting..."

        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val files = attachedFiles.map { (reqId, pair) -> RenovationFileSubmit(reqId, pair.first, pair.second) }
                val workerList = workers.map { RenovationWorkerSubmit(it.name, it.idCardBase64) }
                service.submitRenovationPermit(
                    prefs.getBearerToken(),
                    RenovationPermitRequest(notes = null, files = files, workers = workerList)
                )
                Toast.makeText(requireContext(), "Permit request submitted!", Toast.LENGTH_LONG).show()
                attachedFiles.clear()
                workers.clear()
                pendingWorkerIdCard = null
                loadData(requireView())
            } catch (e: Exception) {
                val msg = when {
                    e.message?.contains("403") == true -> "Your account must be updated (dues paid) to submit a permit request."
                    else -> "Failed to submit request. Please try again."
                }
                errorView.text = msg
                errorView.visibility = View.VISIBLE
            } finally {
                if (isAdded) { btn.isEnabled = true; btn.text = "Submit Permit Request" }
            }
        }
    }

    private fun makeText(text: String, colorHex: String, size: Float) = TextView(requireContext()).apply {
        this.text = text; textSize = size; setTextColor(Color.parseColor(colorHex))
    }
}
