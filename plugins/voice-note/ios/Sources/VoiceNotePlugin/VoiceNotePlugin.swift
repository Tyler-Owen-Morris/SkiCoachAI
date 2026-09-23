import Foundation
import Capacitor
import AVFoundation
import Speech

/// Records a voice note to an .m4a file while transcribing it live with Apple's
/// on-device speech recognizer. Both come from one microphone tap, so they never
/// fight over the mic, and neither needs a network connection.
///
/// Files live in Application Support/VoiceNotes and are referred to by file
/// name only, because the app container path changes between app updates.
@objc(VoiceNotePlugin)
public class VoiceNotePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoiceNotePlugin"
    public let jsName = "VoiceNote"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecordingPath", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecording", returnType: CAPPluginReturnPromise),
    ]

    // Recording state. Touched on the main thread, except `audioFile`,
    // `request` and `framesWritten`, which the audio tap reads under `lock`.
    private let lock = NSLock()
    private var engine: AVAudioEngine?
    private var audioFile: AVAudioFile?
    private var framesWritten: AVAudioFramePosition = 0
    private var sampleRate: Double = 44_100
    private var fileName: String?

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var hints: [String] = []
    private var onDevice = false
    private var allowServer = true
    private var committedText = ""
    private var segmentText = ""
    private var segmentStartedAt = Date()
    private var quickFailures = 0

    private var stopping = false
    private var pendingStop: CAPPluginCall?
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let self = self, self.engine != nil,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            // A phone call or Siri took the mic. The file so far is kept; JS calls stop().
            self.notifyListeners("interrupted", data: ["reason": "interruption"])
        })
        observers.append(center.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.engine != nil, !self.stopping else { return }
            self.notifyListeners("interrupted", data: ["reason": "route-change"])
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    // MARK: - Permissions

    private func micState() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            default: return "prompt"
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            default: return "prompt"
            }
        }
    }

    private func speechState() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    private func permissionResult() -> [String: Any] {
        return ["microphone": micState(), "speechRecognition": speechState()]
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(permissionResult())
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        let askSpeech = {
            SFSpeechRecognizer.requestAuthorization { _ in
                DispatchQueue.main.async { call.resolve(self.permissionResult()) }
            }
        }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { _ in askSpeech() }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { _ in askSpeech() }
        }
    }

    // MARK: - Files

    private func recordingsDirectory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        let dir = base.appendingPathComponent("VoiceNotes", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func safeFileURL(_ name: String) throws -> URL {
        // Only plain file names; never let JS reach outside the directory.
        guard !name.isEmpty, !name.contains("/"), !name.contains("..") else {
            throw NSError(domain: "VoiceNote", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid file name"])
        }
        return try recordingsDirectory().appendingPathComponent(name)
    }

    @objc func getRecordingPath(_ call: CAPPluginCall) {
        guard let name = call.getString("fileName") else { return call.reject("fileName is required") }
        do {
            let url = try safeFileURL(name)
            call.resolve([
                "path": url.absoluteString,
                "exists": FileManager.default.fileExists(atPath: url.path),
            ])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func deleteRecording(_ call: CAPPluginCall) {
        guard let name = call.getString("fileName") else { return call.reject("fileName is required") }
        do {
            let url = try safeFileURL(name)
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    // MARK: - Recording

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.startOnMain(call) }
    }

    private func startOnMain(_ call: CAPPluginCall) {
        if engine != nil {
            return call.reject("Already recording", "ALREADY_RECORDING")
        }
        if micState() != "granted" {
            return call.reject("Microphone permission not granted", "PERMISSION_DENIED")
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .default, options: [])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return call.reject("Could not start the audio session: \(error.localizedDescription)")
        }

        let newEngine = AVAudioEngine()
        let input = newEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            return call.reject("No microphone input is available", "NO_INPUT")
        }

        let name = UUID().uuidString + ".m4a"
        let file: AVAudioFile
        do {
            let url = try safeFileURL(name)
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: format.channelCount,
                AVEncoderBitRateKey: 64_000,
            ]
            file = try AVAudioFile(
                forWriting: url, settings: settings,
                commonFormat: format.commonFormat, interleaved: format.isInterleaved
            )
        } catch {
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            return call.reject("Could not create the recording file: \(error.localizedDescription)")
        }

        lock.lock()
        audioFile = file
        framesWritten = 0
        lock.unlock()
        sampleRate = format.sampleRate
        fileName = name
        committedText = ""
        segmentText = ""
        quickFailures = 0
        stopping = false
        hints = (call.getArray("contextualStrings") ?? []).compactMap { $0 as? String }
        allowServer = call.getBool("allowServerRecognition") ?? true
        let locale = Locale(identifier: call.getString("locale") ?? "en-US")

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            self.lock.lock()
            if let file = self.audioFile {
                do {
                    try file.write(from: buffer)
                    self.framesWritten += AVAudioFramePosition(buffer.frameLength)
                } catch {
                    // Keep going; a dropped buffer is better than a lost note.
                }
            }
            let req = self.request
            self.lock.unlock()
            req?.append(buffer)
        }

        newEngine.prepare()
        do {
            try newEngine.start()
        } catch {
            input.removeTap(onBus: 0)
            lock.lock()
            audioFile = nil
            lock.unlock()
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            if let url = try? safeFileURL(name) { try? FileManager.default.removeItem(at: url) }
            return call.reject("Could not start recording: \(error.localizedDescription)")
        }
        engine = newEngine

        // Live transcription is best effort: the recording works without it.
        var transcribing = false
        if SFSpeechRecognizer.authorizationStatus() == .authorized,
           let rec = SFSpeechRecognizer(locale: locale) {
            if rec.supportsOnDeviceRecognition {
                onDevice = true
                recognizer = rec
                transcribing = true
            } else if allowServer && rec.isAvailable {
                onDevice = false
                recognizer = rec
                transcribing = true
            }
        }
        if transcribing { startRecognitionSegment() }

        call.resolve([
            "fileName": name,
            "transcribing": transcribing,
            "onDevice": transcribing && onDevice,
        ])
    }

    /// Recognition tasks end on their own (long pauses, server time limits), so
    /// a long note is transcribed as consecutive segments.
    private func startRecognitionSegment() {
        guard let recognizer = recognizer else { return }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = onDevice
        req.contextualStrings = hints
        if #available(iOS 16.0, *) { req.addsPunctuation = true }
        lock.lock()
        request = req
        lock.unlock()
        segmentText = ""
        segmentStartedAt = Date()
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                // Ignore callbacks from an older segment.
                self.lock.lock()
                let current = self.request === req
                self.lock.unlock()
                guard current else { return }
                if let result = result {
                    self.segmentText = result.bestTranscription.formattedString
                    self.notifyListeners("partialTranscript", data: ["text": self.fullTranscript()])
                    if result.isFinal { self.segmentFinished(failed: false) }
                } else if error != nil {
                    self.segmentFinished(failed: true)
                }
            }
        }
    }

    private func fullTranscript() -> String {
        return [committedText, segmentText]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func segmentFinished(failed: Bool) {
        committedText = fullTranscript()
        segmentText = ""
        lock.lock()
        request = nil
        lock.unlock()
        task = nil

        if stopping {
            completeStop()
            return
        }
        // Keep transcribing a long note, but give up if the recognizer keeps
        // failing immediately (e.g. the on-device model isn't installed).
        if failed && Date().timeIntervalSince(segmentStartedAt) < 2 {
            quickFailures += 1
        } else {
            quickFailures = 0
        }
        // The phone may claim on-device support before its speech model has
        // downloaded; fall back to Apple's server recognition if there's signal.
        if quickFailures >= 3 && onDevice && allowServer && recognizer?.isAvailable == true {
            onDevice = false
            quickFailures = 0
        }
        if engine != nil && quickFailures < 3 {
            startRecognitionSegment()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.stopOnMain(call) }
    }

    private func stopOnMain(_ call: CAPPluginCall) {
        guard let engine = engine, !stopping else {
            return call.reject("Not recording", "NOT_RECORDING")
        }
        stopping = true
        pendingStop = call
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        closeFile()

        lock.lock()
        let req = request
        lock.unlock()
        if let req = req {
            // Let the recognizer finish the last words, but don't wait forever.
            req.endAudio()
            // Only time out *this* stop: if it already finished and a new
            // recording has since been stopped, leave that one alone.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                guard let self = self, self.pendingStop === call else { return }
                self.completeStop()
            }
        } else {
            completeStop()
        }
    }

    private func closeFile() {
        lock.lock()
        let file = audioFile
        audioFile = nil
        lock.unlock()
        if #available(iOS 18.0, *) {
            file?.close()
        }
        // Before iOS 18 the file is finalized when the last reference goes away.
    }

    private func completeStop() {
        guard let call = pendingStop else { return }
        pendingStop = nil
        task?.cancel()
        task = nil
        lock.lock()
        request = nil
        let frames = framesWritten
        lock.unlock()
        let transcript = fullTranscript()
        let name = fileName ?? ""
        let usedOnDevice = onDevice && recognizer != nil
        resetState()
        call.resolve([
            "fileName": name,
            "mimeType": "audio/mp4",
            "durationMs": Int((Double(frames) / max(sampleRate, 1)) * 1000),
            "transcript": transcript,
            "onDevice": usedOnDevice,
        ])
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let engine = self.engine {
                engine.inputNode.removeTap(onBus: 0)
                engine.stop()
            }
            self.closeFile()
            self.task?.cancel()
            if let name = self.fileName, let url = try? self.safeFileURL(name) {
                try? FileManager.default.removeItem(at: url)
            }
            if let pending = self.pendingStop {
                self.pendingStop = nil
                pending.reject("Recording cancelled", "CANCELLED")
            }
            self.resetState()
            call.resolve()
        }
    }

    private func resetState() {
        engine = nil
        recognizer = nil
        task = nil
        lock.lock()
        request = nil
        audioFile = nil
        lock.unlock()
        fileName = nil
        stopping = false
        committedText = ""
        segmentText = ""
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
