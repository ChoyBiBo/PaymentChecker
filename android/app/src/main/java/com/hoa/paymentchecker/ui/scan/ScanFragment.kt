package com.hoa.paymentchecker.ui.scan

import android.Manifest
import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import com.hoa.paymentchecker.databinding.FragmentScanBinding
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ScanFragment : Fragment() {

    private var _binding: FragmentScanBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ScanViewModel by viewModels()
    private lateinit var cameraExecutor: ExecutorService
    private var cameraControl: CameraControl? = null
    private var torchEnabled = false
    private val handler = Handler(Looper.getMainLooper())

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera()
            else Toast.makeText(requireContext(), "Camera permission is required to scan QR codes", Toast.LENGTH_LONG).show()
        }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentScanBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        cameraExecutor = Executors.newSingleThreadExecutor()

        requestPermissionLauncher.launch(Manifest.permission.CAMERA)

        binding.btnTorch.setOnClickListener {
            torchEnabled = !torchEnabled
            cameraControl?.enableTorch(torchEnabled)
            binding.btnTorch.text = if (torchEnabled) "💡 ON" else "💡"
        }

        binding.btnSettings.setOnClickListener {
            findNavController().navigate(R.id.action_scan_to_settings)
        }

        // Show logout for logged-in guards
        val prefs = PreferencesManager(requireContext())
        if (prefs.isLoggedIn()) {
            binding.btnLogoutGuard.visibility = View.VISIBLE
            binding.btnLogoutGuard.setOnClickListener {
                prefs.logout()
                findNavController().navigate(R.id.action_scan_to_login)
            }
        } else {
            binding.btnLogoutGuard.visibility = View.GONE
        }

        observeViewModel()
    }

    private fun observeViewModel() {
        viewModel.scanState.observe(viewLifecycleOwner) { state ->
            when (state) {
                is ScanState.Idle -> binding.resultOverlay.hide()
                is ScanState.Loading -> { /* optionally show loading */ }
                is ScanState.Updated -> {
                    val h = state.result.homeowner
                    val name = h?.full_name ?: "Homeowner"
                    val lot = "Lot ${h?.lot_number ?: "—"}${if (!h?.block_number.isNullOrBlank()) " Block ${h?.block_number}" else ""}"
                    val period = "Paid: ${state.result.current_period ?: ""}"
                    binding.resultOverlay.show(OverlayType.UPDATED, "UPDATED", name, "$lot · $period")
                    scheduleReset(2500)
                }
                is ScanState.Outdated -> {
                    val h = state.result.homeowner
                    val name = h?.full_name ?: "Homeowner"
                    val lot = "Lot ${h?.lot_number ?: "—"}${if (!h?.block_number.isNullOrBlank()) " Block ${h?.block_number}" else ""}"
                    val behind = state.result.months_behind ?: 0
                    binding.resultOverlay.show(OverlayType.OUTDATED, "OUTDATED", name, "$lot · $behind month${if (behind != 1) "s" else ""} behind")
                    scheduleReset(2500)
                }
                is ScanState.Invalid -> {
                    binding.resultOverlay.show(OverlayType.INVALID, "INVALID", state.message, "QR code not recognized")
                    scheduleReset(1500)
                }
                is ScanState.NetworkError -> {
                    Toast.makeText(requireContext(), "Cannot reach server: ${state.message}", Toast.LENGTH_SHORT).show()
                    viewModel.resetState()
                }
            }
        }
    }

    private fun scheduleReset(delayMs: Long) {
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({
            viewModel.resetState()
        }, delayMs)
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.previewView.surfaceProvider)
            }

            val imageAnalysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { analysis ->
                    analysis.setAnalyzer(cameraExecutor, QrCodeAnalyzer { rawValue ->
                        viewModel.processQrCode(rawValue)
                    })
                }

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                val camera = cameraProvider.bindToLifecycle(
                    viewLifecycleOwner, cameraSelector, preview, imageAnalysis
                )
                cameraControl = camera.cameraControl
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Failed to start camera", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cameraExecutor.shutdown()
        handler.removeCallbacksAndMessages(null)
        _binding = null
    }
}

class QrCodeAnalyzer(private val onQrDecoded: (String) -> Unit) : ImageAnalysis.Analyzer {

    private val reader = MultiFormatReader()

    @SuppressLint("UnsafeOptInUsageError")
    override fun analyze(image: ImageProxy) {
        try {
            val buffer: ByteBuffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)

            val width = image.width
            val height = image.height

            val source = PlanarYUVLuminanceSource(bytes, width, height, 0, 0, width, height, false)
            val bitmap = BinaryBitmap(HybridBinarizer(source))

            try {
                val result = reader.decode(bitmap)
                if (result.text.startsWith("HOA-")) {
                    onQrDecoded(result.text)
                }
            } catch (e: NotFoundException) {
                // No QR code in this frame — normal, ignore
            } finally {
                reader.reset()
            }
        } catch (e: Exception) {
            // Ignore frame errors
        } finally {
            image.close()
        }
    }
}
