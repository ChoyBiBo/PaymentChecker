package com.hoa.paymentchecker.ui.homeowner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
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

/** Holds state for a single worker entry in the UI */
private data class WorkerEntry(
    val nameInput: EditText,
    var idCardBase64: String? = null,
    var idCardFileName: String? = null,
    val idCardBtn: TextView
)

class RenovationFragment : Fragment() {

    private lateinit var prefs: PreferencesManager
    private var requirements = listOf<RenovationRequirement>()
    private val attachedFiles = mutableMapOf<Int, Pair<String, String?>>() // reqId -> (base64, fileName)

    // Requirement file picking
    private var pendingRequirementId: Int = -1
    private val attachButtonRefs = mutableMapOf<Int, TextView>()

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null && pendingRequirementId >= 0) {
            processFileUri(uri, pendingRequirementId)
        }
    }

    // Worker ID card picking
    private var pendingWorkerIndex: Int = -1
    private val workers = mutableListOf<WorkerEntry>()
    private lateinit var workersContainer: LinearLayout

    private val pickWorkerIdCard = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null && pendingWorkerIndex >= 0 && pendingWorkerIndex < workers.size) {
            processWorkerIdCard(uri, pendingWorkerIndex)
        }
    }

    private fun processFileUri(uri: Uri, requirementId: Int) {
        try {
            val ctx = requireContext()
            val mimeType = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val stream = ctx.contentResolver.openInputStream(uri) ?: return
            val bytes: ByteArray

            if (mimeType.startsWith("image/")) {
                val bmp = BitmapFactory.decodeStream(stream)
                stream.close()
                val maxPx = 1200
                val scaled = if (bmp.width > maxPx || bmp.height > maxPx) {
                    val ratio = maxPx.toFloat() / maxOf(bmp.width, bmp.height)
                    Bitmap.createScaledBitmap(bmp, (bmp.width * ratio).toInt(), (bmp.height * ratio).toInt(), true)
                } else bmp
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
                bytes = out.toByteArray()
            } else {
                bytes = stream.readBytes()
                stream.close()
            }

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

    private fun processWorkerIdCard(uri: Uri, workerIndex: Int) {
        try {
            val ctx = requireContext()
            val mimeType = ctx.contentResolver.getType(uri) ?: "image/jpeg"
            val stream = ctx.contentResolver.openInputStream(uri) ?: return

            val bmp = BitmapFactory.decodeStream(stream)
            stream.close()
            val maxPx = 1200
            val scaled = if (bmp.width > maxPx || bmp.height > maxPx) {
                val ratio = maxPx.toFloat() / maxOf(bmp.width, bmp.height)
                Bitmap.createScaledBitmap(bmp, (bmp.width * ratio).toInt(), (bmp.height * ratio).toInt(), true)
            } else bmp
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            val fileName = uri.lastPathSegment ?: "id_card"

            workers[workerIndex].idCardBase64 = "data:$mimeType;base64,$b64"
            workers[workerIndex].idCardFileName = fileName
            workers[workerIndex].idCardBtn.apply {
                text = "✓ ID Card Attached"
                setTextColor(Color.parseColor("#3E9142"))
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

        workersContainer = view.findViewById(R.id.ll_workers)

        view.findViewById<TextView>(R.id.btn_back).setOnClickListener {
            findNavController().popBackStack()
        }

        view.findViewById<TextView>(R.id.btn_add_worker).setOnClickListener {
            addWorkerRow()
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

    private fun addWorkerRow() {
        val density = resources.displayMetrics.density
        val ctx = requireContext()
        val index = workers.size

        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = (10 * density).toInt()
            layoutParams = lp
            setBackgroundColor(Color.parseColor("#F0F7F8"))
            setPadding((12 * density).toInt(), (10 * density).toInt(), (12 * density).toInt(), (10 * density).toInt())
        }

        val topRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }

        val nameInput = EditText(ctx).apply {
            hint = "Worker name"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
            textSize = 13f
            setTextColor(Color.parseColor("#1A3A4A"))
            setHintTextColor(Color.parseColor("#94A3B8"))
            background = null
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val removeBtn = TextView(ctx).apply {
            text = "✕"
            textSize = 16f
            setTextColor(Color.parseColor("#EF4444"))
            setPadding((8 * density).toInt(), 0, 0, 0)
            isClickable = true
            isFocusable = true
        }

        topRow.addView(nameInput)
        topRow.addView(removeBtn)
        row.addView(topRow)

        val divider = View(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
            setBackgroundColor(Color.parseColor("#D4E6EA"))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1)
            lp.topMargin = (4 * density).toInt()
            lp.bottomMargin = (6 * density).toInt()
            layoutParams = lp
        }
        row.addView(divider)

        val idCardBtn = TextView(ctx).apply {
            text = "📷  Attach ID Card Photo"
            textSize = 12f
            setTextColor(Color.parseColor("#1A6B7B"))
            setTypeface(null, android.graphics.Typeface.BOLD)
            isClickable = true
            isFocusable = true
        }
        row.addView(idCardBtn)

        val entry = WorkerEntry(nameInput = nameInput, idCardBtn = idCardBtn)
        workers.add(entry)

        idCardBtn.setOnClickListener {
            pendingWorkerIndex = workers.indexOf(entry)
            pickWorkerIdCard.launch("image/*")
        }

        removeBtn.setOnClickListener {
            val idx = workers.indexOf(entry)
            if (idx >= 0) {
                workers.removeAt(idx)
                workersContainer.removeView(row)
            }
        }

        workersContainer.addView(row)
    }

    private fun loadData(view: View) {
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val reqData = service.getRenovationRequirements()
                requirements = reqData.requirements
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
                text = if (attachedFiles.containsKey(req.id)) {
                    "✓ ${attachedFiles[req.id]?.second ?: "Attached"}"
                } else {
                    "📎  Attach File / Photo"
                }
                textSize = 13f
                setTextColor(if (attachedFiles.containsKey(req.id)) Color.parseColor("#3E9142") else Color.parseColor("#1A6B7B"))
                setTypeface(null, android.graphics.Typeface.BOLD)
                setPadding(0, (8 * density).toInt(), 0, (4 * density).toInt())
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    pendingRequirementId = req.id
                    pickFile.launch("*/*")
                }
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

            val dateText = TextView(requireContext()).apply {
                text = permit.createdAt?.take(10) ?: "—"
                textSize = 12f
                setTextColor(Color.parseColor("#5A7A84"))
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            }

            val (badgeColor, badgeBg) = when (permit.status) {
                "complete"   -> Pair("#166534", "#DCFCE7")
                "incomplete" -> Pair("#92400E", "#FEF3C7")
                "rejected"   -> Pair("#991B1B", "#FEE2E2")
                else         -> Pair("#475569", "#E2E8F0")
            }
            val badgeView = TextView(requireContext()).apply {
                text = permit.status.replaceFirstChar { it.uppercaseChar() }
                textSize = 11f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(Color.parseColor(badgeColor))
                setBackgroundColor(Color.parseColor(badgeBg))
                setPadding(10, 4, 10, 4)
            }

            row.addView(dateText)
            row.addView(badgeView)
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
                val files = attachedFiles.map { (reqId, pair) ->
                    RenovationFileSubmit(reqId, pair.first, pair.second)
                }
                val workerList = workers
                    .filter { it.nameInput.text.isNotBlank() }
                    .map { RenovationWorkerSubmit(it.nameInput.text.toString().trim(), it.idCardBase64) }

                service.submitRenovationPermit(
                    prefs.getBearerToken(),
                    RenovationPermitRequest(notes = null, files = files, workers = workerList)
                )
                Toast.makeText(requireContext(), "Permit request submitted!", Toast.LENGTH_LONG).show()
                attachedFiles.clear()
                workers.clear()
                workersContainer.removeAllViews()
                loadData(requireView())
            } catch (e: Exception) {
                val msg = when {
                    e.message?.contains("403") == true -> "Your account must be updated (dues paid) to submit a permit request."
                    else -> "Failed to submit request. Please try again."
                }
                errorView.text = msg
                errorView.visibility = View.VISIBLE
            } finally {
                if (isAdded) {
                    btn.isEnabled = true
                    btn.text = "Submit Permit Request"
                }
            }
        }
    }

    private fun makeText(text: String, colorHex: String, size: Float) = TextView(requireContext()).apply {
        this.text = text
        textSize = size
        setTextColor(Color.parseColor(colorHex))
    }
}
