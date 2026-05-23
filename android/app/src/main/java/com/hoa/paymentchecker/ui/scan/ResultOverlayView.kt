package com.hoa.paymentchecker.ui.scan

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.View

enum class OverlayType(val color: Int, val icon: String) {
    UPDATED(Color.parseColor("#CC16a34a"), "✓"),
    OUTDATED(Color.parseColor("#CCdc2626"), "✕"),
    INVALID(Color.parseColor("#CCd97706"), "!")
}

class ResultOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var overlayType: OverlayType = OverlayType.UPDATED
    private var titleText: String = ""
    private var subtitleText: String = ""
    private var detailText: String = ""

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    private val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    private val subtitlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
    }
    private val detailPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#EEEEEE")
        textAlign = Paint.Align.CENTER
    }

    fun show(type: OverlayType, title: String, subtitle: String, detail: String) {
        overlayType = type
        titleText = title
        subtitleText = subtitle
        detailText = detail
        visibility = VISIBLE
        invalidate()
    }

    fun hide() {
        visibility = GONE
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w / 2f
        val cy = h / 2f

        // Background
        bgPaint.color = overlayType.color
        canvas.drawRect(0f, 0f, w, h, bgPaint)

        val density = resources.displayMetrics.density

        // Icon
        val iconSize = 80f * density
        iconPaint.textSize = iconSize
        canvas.drawText(overlayType.icon, cx, cy - 60f * density, iconPaint)

        // Title
        val titleSize = 32f * density
        titlePaint.textSize = titleSize
        canvas.drawText(titleText, cx, cy + 20f * density, titlePaint)

        // Subtitle
        val subtitleSize = 18f * density
        subtitlePaint.textSize = subtitleSize
        canvas.drawText(subtitleText, cx, cy + 55f * density, subtitlePaint)

        // Detail
        val detailSize = 14f * density
        detailPaint.textSize = detailSize
        canvas.drawText(detailText, cx, cy + 82f * density, detailPaint)
    }
}
