// Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
// SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.

package com.wayned.tes.plugin

import android.app.Activity
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.Locale

@InvokeArg
class RotationArgs {
  var allow: Boolean = false
}

@InvokeArg
class SayArgs {
  var word: String = ""
  var lang: String = ""
  var pron: String = ""
}

@InvokeArg
class SpeakItem {
  var id: Int = 0
  var text: String = ""
}

@InvokeArg
class SpeakArgs {
  var items: Array<SpeakItem> = arrayOf()
  /** 1 is the engine's normal pace. */
  var rate: Double = 1.0
  var title: String = ""
  var voice: String? = null
}

/**
 * The Android side of plugins/tes-native, matching the iOS one: the phone stays upright except while a picture
 * is open (allowRotation), reading aloud with Android's own text-to-speech (speak and the rest, with "speech"
 * events for each word), and the system bars' sizes for the page, which Android's web view reports as 0.
 */
@TauriPlugin
class TesNativePlugin(private val activity: Activity) : Plugin(activity) {
  /** The status and gesture bars' heights in CSS pixels (pager-system's lesson). */
  private class Insets {
    @Volatile var top = 0.0
    @Volatile var bottom = 0.0

    @JavascriptInterface fun top(): Double = top

    @JavascriptInterface fun bottom(): Double = bottom
  }

  private val insets = Insets()
  private val tablet get() = activity.resources.configuration.smallestScreenWidthDp >= 600

  private var view: WebView? = null

  /** A light tap felt in the hand, for a button or a word tapped: Android's own key-press feedback. */
  @Command
  fun tap(invoke: Invoke) {
    view?.let { v -> v.post { v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) } }
    invoke.resolve()
  }

  override fun load(webView: WebView) {
    view = webView
    webView.addJavascriptInterface(insets, "TesInsets")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, wi ->
      val bars = wi.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = activity.resources.displayMetrics.density
      insets.top = bars.top / density.toDouble()
      insets.bottom = bars.bottom / density.toDouble()
      webView.evaluateJavascript("window.dispatchEvent(new Event('tes-insets'))", null)
      wi
    }
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    upright(true)
    Thread { unpackModules(webView) }.start()
    // The word engine started now, so the first tap on a speaker isn't kept waiting for it.
    wordEngine {}
  }

  /** Where the bundled modules were copied to, once they have been. */
  @Volatile private var bundled: String? = null

  /** The modules shipped in the APK's assets, copied to the app's own files (SQLite can't open an asset),
   *  again only after the app is updated; then the page is told, and reads its library again. */
  private fun unpackModules(webView: WebView) {
    val root = File(activity.filesDir, "bundled")
    val dst = File(root, "modules")
    val stamp = File(root, ".stamp")
    val version = activity.packageManager.getPackageInfo(activity.packageName, 0).lastUpdateTime.toString()
    try {
      if (!(stamp.exists() && stamp.readText() == version && dst.isDirectory)) {
        dst.deleteRecursively()
        dst.mkdirs()
        for (name in activity.assets.list("modules") ?: arrayOf()) {
          activity.assets.open("modules/$name").use { i -> File(dst, name).outputStream().use { o -> i.copyTo(o) } }
        }
        stamp.writeText(version)
      }
      bundled = root.absolutePath
      webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('tes-bundled'))", null) }
    } catch (_: Exception) {}
  }

  @Command
  fun bundledDir(invoke: Invoke) {
    val r = JSObject()
    bundled?.let { r.put("dir", it) }
    invoke.resolve(r)
  }

  /** A phone stays upright; a tablet turns freely. */
  private fun upright(on: Boolean) {
    activity.runOnUiThread {
      activity.requestedOrientation =
        if (tablet || !on) ActivityInfo.SCREEN_ORIENTATION_FULL_USER else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
  }

  @Command
  fun allowRotation(invoke: Invoke) {
    val args = invoke.parseArgs(RotationArgs::class.java)
    upright(!args.allow)
    invoke.resolve()
  }

  // ---------- reading aloud ----------

  private var tts: TextToSpeech? = null
  private var ready = false
  /** What's being read, so pause can stop and resume can start again from the verse it was on. */
  private var queue: List<SpeakItem> = listOf()
  private var at = 0
  private var rate = 1.0
  private var voiceName: String? = null

  /** The engine, started once; `then` runs when it's ready. */
  private fun engine(then: (TextToSpeech?) -> Unit) {
    tts?.let { if (ready) return then(it) }
    var made: TextToSpeech? = null
    made = TextToSpeech(activity) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (ready) made?.setOnUtteranceProgressListener(progress)
      then(if (ready) made else null)
    }
    tts = made
  }

  private fun event(kind: String, id: Int? = null, at: Int? = null, len: Int? = null) {
    val o = JSObject()
    o.put("kind", kind)
    id?.let { o.put("id", it) }
    at?.let { o.put("at", it) }
    len?.let { o.put("len", it) }
    trigger("speech", o)
  }

  private val progress =
    object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String) {
        val id = utteranceId.toIntOrNull() ?: return
        at = queue.indexOfFirst { it.id == id }.coerceAtLeast(0)
        event("start", id)
      }

      override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) {
        val id = utteranceId.toIntOrNull() ?: return
        event("word", id, start, end - start)
      }

      override fun onDone(utteranceId: String) {
        val id = utteranceId.toIntOrNull() ?: return
        event(if (id == queue.lastOrNull()?.id) "end" else "done", id)
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String) {}
    }

  /** The voice chosen, or the best English one installed that doesn't need the network. */
  private fun voiceFor(t: TextToSpeech): Voice? {
    val all = t.voices?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired } ?: return null
    voiceName?.let { n -> all.firstOrNull { it.name == n }?.let { return it } }
    val mine = Locale.getDefault()
    return all.maxByOrNull { it.quality * 2 + if (it.locale.country == mine.country) 1 else 0 }
  }

  private fun speakFrom(i: Int) {
    engine { t ->
      if (t == null) return@engine
      t.stop()
      voiceFor(t)?.let { t.voice = it }
      t.setSpeechRate(rate.toFloat())
      for (k in i until queue.size) {
        val item = queue[k]
        t.speak(item.text, TextToSpeech.QUEUE_ADD, Bundle(), item.id.toString())
      }
    }
  }

  @Command
  fun speak(invoke: Invoke) {
    val args = invoke.parseArgs(SpeakArgs::class.java)
    queue = args.items.toList()
    rate = args.rate
    voiceName = args.voice
    at = 0
    speakFrom(0)
    invoke.resolve()
  }

  /** Android's engine can't pause in a sentence: it stops, and resume starts that verse again. */
  @Command
  fun speechPause(invoke: Invoke) {
    tts?.stop()
    invoke.resolve()
  }

  @Command
  fun speechResume(invoke: Invoke) {
    speakFrom(at)
    invoke.resolve()
  }

  @Command
  fun speechStop(invoke: Invoke) {
    queue = listOf()
    tts?.stop()
    invoke.resolve()
  }

  @Command
  fun voices(invoke: Invoke) {
    engine { t ->
      val list = JSArray()
      t?.voices
        ?.filter { it.locale.language == "en" && !it.isNetworkConnectionRequired }
        ?.sortedWith(compareByDescending<Voice> { it.quality }.thenBy { it.locale.toLanguageTag() })
        ?.forEach {
          val o = JSObject()
          o.put("id", it.name)
          o.put("name", "${it.locale.displayCountry.ifEmpty { "English" }} (${it.name.substringAfterLast('-').take(8)})")
          o.put("language", it.locale.toLanguageTag())
          o.put("quality", if (it.quality >= Voice.QUALITY_VERY_HIGH) "premium" else if (it.quality >= Voice.QUALITY_HIGH) "enhanced" else "default")
          list.put(o)
        }
      val r = JSObject()
      r.put("voices", list)
      invoke.resolve(r)
    }
  }

  /** A word said on its own (the word sheet's speaker), apart from Listen's reading. */
  private var wordTts: TextToSpeech? = null
  private var wordReady = false

  /** In a Hebrew or Greek voice when the phone has one, otherwise the pronunciation in an English voice,
   *  as the desktop's SayButton does. */
  @Command
  fun say(invoke: Invoke) {
    val args = invoke.parseArgs(SayArgs::class.java)
    val go: (TextToSpeech) -> Unit = { t ->
      val lang = Locale(if (args.lang == "he") "iw" else args.lang)
      val has = t.isLanguageAvailable(lang) >= TextToSpeech.LANG_AVAILABLE
      t.language = if (has) lang else Locale.ENGLISH
      t.setSpeechRate(if (has) 0.8f else 0.9f)
      t.speak(if (has) args.word else args.pron.replace(Regex("[-'ʼ]"), " "), TextToSpeech.QUEUE_FLUSH, Bundle(), "word")
    }
    wordEngine { it?.let(go) }
    invoke.resolve()
  }

  /** The word engine, started once, telling the page when a word starts and is done. */
  private fun wordEngine(then: (TextToSpeech?) -> Unit) {
    wordTts?.let { if (wordReady) return then(it) }
    var made: TextToSpeech? = null
    made = TextToSpeech(activity) { status ->
      wordReady = status == TextToSpeech.SUCCESS
      made?.setOnUtteranceProgressListener(
        object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String) = sayEvent("start")

          override fun onDone(utteranceId: String) = sayEvent("done")

          override fun onStop(utteranceId: String, interrupted: Boolean) = sayEvent("done")

          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String) = sayEvent("done")
        }
      )
      then(if (wordReady) made else null)
    }
    wordTts = made
  }

  private fun sayEvent(kind: String) {
    val o = JSObject()
    o.put("kind", kind)
    trigger("say", o)
  }

  override fun onDestroy() {
    tts?.shutdown()
    tts = null
    wordTts?.shutdown()
    wordTts = null
  }
}
