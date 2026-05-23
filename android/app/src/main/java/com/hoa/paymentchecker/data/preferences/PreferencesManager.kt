package com.hoa.paymentchecker.data.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class PreferencesManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "hoa_prefs"
        private const val ENCRYPTED_PREFS_NAME = "hoa_secure_prefs"
        const val KEY_BASE_URL = "base_url"
        const val KEY_API_KEY = "api_key"
        const val KEY_JWT_TOKEN = "jwt_token"
        const val KEY_USER_ROLE = "user_role"
        const val KEY_USER_NAME = "user_name"
        const val KEY_USER_ID = "user_id"
        const val KEY_HOMEOWNER_ID = "homeowner_id"
        private const val DEFAULT_BASE_URL = "http://192.168.1.1:3000/"
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val encryptedPrefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                ENCRYPTED_PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            // Fallback to regular prefs if encryption fails
            context.getSharedPreferences(ENCRYPTED_PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    fun getBaseUrl(): String {
        val url = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        return if (url.endsWith("/")) url else "$url/"
    }

    fun setBaseUrl(url: String) {
        prefs.edit().putString(KEY_BASE_URL, url).apply()
    }

    fun getApiKey(): String {
        return encryptedPrefs.getString(KEY_API_KEY, "") ?: ""
    }

    fun setApiKey(key: String) {
        encryptedPrefs.edit().putString(KEY_API_KEY, key).apply()
    }

    fun getJwtToken(): String? = encryptedPrefs.getString(KEY_JWT_TOKEN, null)

    fun setJwtToken(token: String?) {
        encryptedPrefs.edit().putString(KEY_JWT_TOKEN, token).apply()
    }

    fun getUserRole(): String? = prefs.getString(KEY_USER_ROLE, null)
    fun setUserRole(role: String?) = prefs.edit().putString(KEY_USER_ROLE, role).apply()

    fun getUserName(): String? = prefs.getString(KEY_USER_NAME, null)
    fun setUserName(name: String?) = prefs.edit().putString(KEY_USER_NAME, name).apply()

    fun getHomeownerId(): Int = prefs.getInt(KEY_HOMEOWNER_ID, -1)
    fun setHomeownerId(id: Int?) = prefs.edit().putInt(KEY_HOMEOWNER_ID, id ?: -1).apply()

    fun isLoggedIn(): Boolean = getJwtToken() != null

    fun logout() {
        encryptedPrefs.edit().remove(KEY_JWT_TOKEN).apply()
        prefs.edit()
            .remove(KEY_USER_ROLE)
            .remove(KEY_USER_NAME)
            .remove(KEY_HOMEOWNER_ID)
            .apply()
    }

    fun getBearerToken(): String = "Bearer ${getJwtToken() ?: ""}"

    fun getLastNotifCheck(): String? = prefs.getString("last_notif_check", null)
    fun setLastNotifCheck(timestamp: String) = prefs.edit().putString("last_notif_check", timestamp).apply()
}
