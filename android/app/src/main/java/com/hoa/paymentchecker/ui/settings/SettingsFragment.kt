package com.hoa.paymentchecker.ui.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hoa.paymentchecker.BuildConfig
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import com.hoa.paymentchecker.databinding.FragmentSettingsBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private lateinit var prefs: PreferencesManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        // Load current values
        binding.etServerUrl.setText(prefs.getBaseUrl())
        binding.etApiKey.setText(prefs.getApiKey())
        binding.tvVersion.text = "Version ${BuildConfig.VERSION_NAME}"

        binding.btnSave.setOnClickListener { saveSettings() }
        binding.btnTestConnection.setOnClickListener { testConnection() }
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }
    }

    private fun saveSettings() {
        val url = binding.etServerUrl.text.toString().trim()
        val apiKey = binding.etApiKey.text.toString().trim()

        if (url.isEmpty()) {
            Toast.makeText(requireContext(), "Server URL cannot be empty", Toast.LENGTH_SHORT).show()
            return
        }

        prefs.setBaseUrl(url)
        prefs.setApiKey(apiKey)
        Toast.makeText(requireContext(), "Settings saved", Toast.LENGTH_SHORT).show()
    }

    private fun testConnection() {
        val url = binding.etServerUrl.text.toString().trim().let {
            if (it.endsWith("/")) it else "$it/"
        }

        if (url.isEmpty()) {
            Toast.makeText(requireContext(), "Enter a server URL first", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnTestConnection.isEnabled = false
        binding.btnTestConnection.text = "Testing..."

        lifecycleScope.launch {
            val success = withContext(Dispatchers.IO) {
                try {
                    val client = OkHttpClient.Builder()
                        .connectTimeout(5, TimeUnit.SECONDS)
                        .readTimeout(5, TimeUnit.SECONDS)
                        .build()
                    val request = Request.Builder()
                        .url("${url}api/auth/me")
                        .build()
                    val response = client.newCall(request).execute()
                    // 401 means server is reachable (not authenticated, but that's expected)
                    response.code == 401 || response.isSuccessful
                } catch (e: Exception) {
                    false
                }
            }

            binding.btnTestConnection.isEnabled = true
            binding.btnTestConnection.text = "Test Connection"

            if (success) {
                Toast.makeText(requireContext(), "✓ Server is reachable!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(requireContext(), "✕ Cannot reach server. Check URL and network.", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
