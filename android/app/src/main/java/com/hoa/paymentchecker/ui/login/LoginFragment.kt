package com.hoa.paymentchecker.ui.login

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.hoa.paymentchecker.BuildConfig
import com.hoa.paymentchecker.R
import com.hoa.paymentchecker.data.api.RetrofitClient
import com.hoa.paymentchecker.data.model.LoginRequest
import com.hoa.paymentchecker.data.preferences.PreferencesManager
import kotlinx.coroutines.launch

class LoginFragment : Fragment() {

    private lateinit var prefs: PreferencesManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_login, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = PreferencesManager(requireContext())

        // If already logged in, skip login
        if (prefs.isLoggedIn()) {
            navigateByRole(prefs.getUserRole())
            return
        }

        val llLoginCard = view.findViewById<View>(R.id.ll_login_card)
        val tvSubtitle = view.findViewById<TextView>(R.id.tv_subtitle)
        val etUsername = view.findViewById<EditText>(R.id.et_username)
        val etPassword = view.findViewById<EditText>(R.id.et_password)
        val btnLogin = view.findViewById<Button>(R.id.btn_login)
        val tvError = view.findViewById<TextView>(R.id.tv_error)
        val tvVersionTap = view.findViewById<TextView>(R.id.tv_version_tap)
        val btnDemoHomeowner = view.findViewById<Button>(R.id.btn_demo_homeowner)
        val btnDemoGuard = view.findViewById<Button>(R.id.btn_demo_guard)

        tvVersionTap.text = "v${BuildConfig.VERSION_NAME}"

        etPassword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                performLogin(etUsername, etPassword, btnLogin, tvError)
                true
            } else false
        }

        btnLogin.setOnClickListener {
            performLogin(etUsername, etPassword, btnLogin, tvError)
        }

        // Long-press version label opens server settings (dev access only)
        tvVersionTap.setOnLongClickListener {
            findNavController().navigate(R.id.action_login_to_settings)
            true
        }

        btnDemoHomeowner.setOnClickListener {
            etUsername.setText("demo_homeowner")
            etPassword.setText("Demo@1234")
            performLogin(etUsername, etPassword, btnLogin, tvError)
        }

        btnDemoGuard.setOnClickListener {
            etUsername.setText("demo_guard")
            etPassword.setText("Demo@1234")
            performLogin(etUsername, etPassword, btnLogin, tvError)
        }

        // Check server mode — in test mode, hide login form and show only demo options
        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val modeResponse = service.getMode()
                if (modeResponse.mode == "test") {
                    llLoginCard.visibility = View.GONE
                    tvSubtitle.text = "Demo Mode — Select a role to explore"
                }
            } catch (e: Exception) {
                // Cannot reach server or unexpected error — show normal login form
            }
        }
    }

    private fun performLogin(
        etUsername: EditText,
        etPassword: EditText,
        btnLogin: Button,
        tvError: TextView
    ) {
        val username = etUsername.text.toString().trim()
        val password = etPassword.text.toString()

        if (username.isEmpty() || password.isEmpty()) {
            showError(tvError, "Please enter username and password")
            return
        }

        btnLogin.isEnabled = false
        btnLogin.text = "Signing in..."
        tvError.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val service = RetrofitClient.getAppService(requireContext())
                val response = service.login(LoginRequest(username, password))

                prefs.setJwtToken(response.token)
                prefs.setUserRole(response.user.role)
                prefs.setUserName(response.user.fullName)
                prefs.setHomeownerId(response.user.homeownerId)

                navigateByRole(response.user.role)
            } catch (e: Exception) {
                val msg = when {
                    e.message?.contains("401") == true || e.message?.contains("Unauthorized") == true ->
                        "Invalid username or password"
                    e.message?.contains("deactivated") == true ->
                        "Account is deactivated"
                    e.message?.contains("connect") == true || e.message?.contains("Unable") == true ->
                        "Cannot connect to server."
                    else -> "Login failed. Please try again."
                }
                showError(tvError, msg)
                btnLogin.isEnabled = true
                btnLogin.text = "Sign In"
            }
        }
    }

    private fun navigateByRole(role: String?) {
        when (role) {
            "guard" -> findNavController().navigate(R.id.action_login_to_scan)
            "homeowner" -> findNavController().navigate(R.id.action_login_to_dashboard)
            else -> {
                prefs.logout()
                findNavController().navigate(R.id.action_login_to_settings)
            }
        }
    }

    private fun showError(tvError: TextView, msg: String) {
        tvError.text = msg
        tvError.visibility = View.VISIBLE
    }
}
