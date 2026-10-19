// Help video, step 3: lays the narration clips (audio/nNN.aiff) over walkthrough.mp4 at the times in
// timeline.json and writes walkthrough-voice.mp4 (H.264 + AAC) with AVFoundation, as QuickTime would.
import AVFoundation
import Foundation
let dir = FileManager.default.currentDirectoryPath
let timeline = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: dir + "/timeline.json"))) as! [String: Any]
let starts = timeline["starts"] as! [Double]
let video = AVURLAsset(url: URL(fileURLWithPath: dir + "/walkthrough.mp4"))
let comp = AVMutableComposition()
let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let src = video.tracks(withMediaType: .video)[0]
try! vTrack.insertTimeRange(CMTimeRange(start: .zero, duration: video.duration), of: src, at: .zero)
let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
for (i, t) in starts.enumerated() {
  let url = URL(fileURLWithPath: String(format: "%@/audio/n%02d.aiff", dir, i))
  guard FileManager.default.fileExists(atPath: url.path) else { continue }
  let clip = AVURLAsset(url: url)
  let at = CMTime(seconds: t, preferredTimescale: 600)
  let len = CMTimeMinimum(clip.duration, CMTimeSubtract(video.duration, at))
  try! aTrack.insertTimeRange(CMTimeRange(start: .zero, duration: len), of: clip.tracks(withMediaType: .audio)[0], at: at)
}
let out = URL(fileURLWithPath: dir + "/walkthrough-voice.mp4")
try? FileManager.default.removeItem(at: out)
let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
ex.outputURL = out; ex.outputFileType = .mp4; ex.shouldOptimizeForNetworkUse = true
let done = DispatchSemaphore(value: 0)
ex.exportAsynchronously { done.signal() }
done.wait()
print(ex.status == .completed ? "ok \(CMTimeGetSeconds(comp.duration))s" : "failed \(String(describing: ex.error))")
