package expo.modules.tibbyaudiooutput

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TibbyAudioOutputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TibbyAudioOutput")
    AsyncFunction("preparePlayback") { /* Keep the phone's media routing choice. */ }
    AsyncFunction("finishPlayback") { }
    AsyncFunction("getOutput") {
      val context = appContext.reactContext ?: throw IllegalStateException("App unavailable")
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val connected = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { describe(it) }
      // Android's TTS engine owns its AudioTrack. This is the system's anticipated
      // media route, not a claim that our TTS utterance actually used that route.
      val route = if (Build.VERSION.SDK_INT >= 33) {
        val attributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        try { audio.getAudioDevicesForAttributes(attributes).map { describe(it) } }
        catch (_: SecurityException) { emptyList() }
      } else emptyList()
      mapOf("connected" to connected, "route" to route,
        "evidence" to if (route.isEmpty()) "unavailable" else "system-preference")
    }
  }

  private fun describe(device: AudioDeviceInfo): Map<String, String> {
    val kind = when (device.type) {
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER -> "bluetooth"
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "headphones"
      AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE -> "usb"
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
      else -> "other"
    }
    val name = when (kind) {
      "speaker" -> "Phone speaker"
      "earpiece" -> "Phone earpiece"
      else -> device.productName?.toString()?.takeIf { it.isNotBlank() } ?: "Audio device"
    }
    return mapOf("id" to device.id.toString(), "name" to name, "kind" to kind)
  }
}
