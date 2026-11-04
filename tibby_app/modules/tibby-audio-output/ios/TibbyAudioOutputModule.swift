import AVFAudio
import ExpoModulesCore

public final class TibbyAudioOutputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TibbyAudioOutput")
    AsyncFunction("preparePlayback") {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .spokenAudio)
      try session.setActive(true)
    }
    AsyncFunction("finishPlayback") {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    AsyncFunction("getOutput") { () -> [String: Any] in
      let outputs = AVAudioSession.sharedInstance().currentRoute.outputs.map { port in
        ["id": port.uid, "name": port.portName, "kind": self.kind(port.portType)]
      }
      // iOS exposes the current route, not a list of all paired headphones.
      return ["connected": outputs, "route": outputs,
              "evidence": outputs.isEmpty ? "unavailable" : "current-route"]
    }
  }

  private func kind(_ port: AVAudioSession.Port) -> String {
    switch port {
    case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE: return "bluetooth"
    case .headphones: return "headphones"
    case .builtInSpeaker: return "speaker"
    case .builtInReceiver: return "earpiece"
    case .usbAudio: return "usb"
    default: return "other"
    }
  }
}
