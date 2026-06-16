import Foundation

/// Manages the SSE connection to a Crush server workspace event stream.
/// Uses URLSessionDataDelegate instead of async bytes to avoid
/// iOS 26 beta simulator crash in mach_msg dispatch.
@Observable
@MainActor
final class SSEClient {

    // MARK: - State

    var isConnected = false
    var lastError: String?

    // MARK: - Event Callbacks

    var onMessage: ((TypedEvent<Message>) -> Void)?
    var onSession: ((TypedEvent<Session>) -> Void)?
    var onPermissionRequest: ((TypedEvent<PermissionRequest>) -> Void)?
    var onPermissionNotification: ((TypedEvent<PermissionNotification>) -> Void)?
    var onRunComplete: ((TypedEvent<RunComplete>) -> Void)?
    var onAgentEvent: ((TypedEvent<AgentEvent>) -> Void)?
    var onConfigChanged: (() -> Void)?

    // MARK: - Private

    private var baseURL: URL
    private var workspaceID: String
    private var sessionTask: URLSessionDataTask?
    private var urlSession: URLSession?
    private var retryDelay: TimeInterval = 1
    private let maxRetryDelay: TimeInterval = 30
    private var shouldReconnect = true
    private var buffer = ""

    init(baseURL: URL, workspaceID: String) {
        self.baseURL = baseURL
        self.workspaceID = workspaceID
    }

    func updateConnection(baseURL: URL, workspaceID: String) {
        self.baseURL = baseURL
        self.workspaceID = workspaceID
    }

    // MARK: - Connect / Disconnect

    func connect() {
        disconnect()
        shouldReconnect = true
        startStream()
    }

    func disconnect() {
        shouldReconnect = false
        sessionTask?.cancel()
        sessionTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        isConnected = false
    }

    // MARK: - Stream

    private func startStream() {
        guard shouldReconnect else { return }

        let url = baseURL
            .appendingPathComponent("v1/workspaces")
            .appendingPathComponent(workspaceID)
            .appendingPathComponent("events")

        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = .infinity

        let delegate = SSEDataDelegate(owner: self)
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        self.urlSession = session

        let task = session.dataTask(with: request)
        self.sessionTask = task
        task.resume()
    }

    fileprivate func handleConnected() {
        Task { @MainActor [weak self] in
            self?.isConnected = true
            self?.lastError = nil
            self?.retryDelay = 1
        }
    }

    fileprivate func handleData(_ data: Data) {
        guard let str = String(data: data, encoding: .utf8) else { return }
        buffer += str
        processBuffer()
    }

    fileprivate func handleError(_ error: Error?) {
        guard shouldReconnect else { return }

        Task { @MainActor [weak self] in
            guard let self else { return }
            self.isConnected = false
            self.lastError = error?.localizedDescription ?? "Connection lost"
        }

        scheduleReconnect()
    }

    fileprivate func handleCompleted() {
        guard shouldReconnect else { return }
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        let delay = retryDelay
        retryDelay = min(retryDelay * 2, maxRetryDelay)
        DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [weak self] in
            Task { @MainActor [weak self] in
                self?.startStream()
            }
        }
    }

    // MARK: - Buffer Processing

    private func processBuffer() {
        // SSE events are separated by \n\n
        while let range = buffer.range(of: "\n\n") {
            let eventBlock = String(buffer[buffer.startIndex..<range.lowerBound])
            buffer = String(buffer[range.upperBound...])
            parseSSEBlock(eventBlock)
        }
    }

    private func parseSSEBlock(_ block: String) {
        for line in block.components(separatedBy: "\n") {
            guard line.hasPrefix("data: ") else { continue }
            let jsonStr = String(line.dropFirst(6))
            guard let data = jsonStr.data(using: .utf8) else { continue }
            dispatchEvent(data: data)
        }
    }

    // MARK: - Dispatch

    private func dispatchEvent(data: Data) {
        guard let envelope = try? JSONDecoder().decode(SSEEnvelope.self, from: data) else {
            return
        }

        switch envelope.type {
        case PayloadType.message:
            if let event = envelope.decodePayload(as: TypedEvent<Message>.self) {
                onMessage?(event)
            }
        case PayloadType.session:
            if let event = envelope.decodePayload(as: TypedEvent<Session>.self) {
                onSession?(event)
            }
        case PayloadType.permissionRequest:
            if let event = envelope.decodePayload(as: TypedEvent<PermissionRequest>.self) {
                onPermissionRequest?(event)
            }
        case PayloadType.permissionNotification:
            if let event = envelope.decodePayload(as: TypedEvent<PermissionNotification>.self) {
                onPermissionNotification?(event)
            }
        case PayloadType.runComplete:
            if let event = envelope.decodePayload(as: TypedEvent<RunComplete>.self) {
                onRunComplete?(event)
            }
        case PayloadType.agentEvent:
            if let event = envelope.decodePayload(as: TypedEvent<AgentEvent>.self) {
                onAgentEvent?(event)
            }
        case PayloadType.configChanged:
            onConfigChanged?()
        default:
            break
        }
    }
}

// MARK: - URLSession Delegate

/// Non-isolated delegate that forwards data back to the @MainActor SSEClient.
/// Kept as a separate class because URLSession delegates must not be actors.
private final class SSEDataDelegate: NSObject, URLSessionDataDelegate {
    private weak var owner: SSEClient?

    init(owner: SSEClient) {
        self.owner = owner
    }

    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if let http = response as? HTTPURLResponse, http.statusCode == 200 {
            Task { @MainActor [weak owner] in
                owner?.handleConnected()
            }
            completionHandler(.allow)
        } else {
            completionHandler(.cancel)
        }
    }

    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        Task { @MainActor [weak owner] in
            owner?.handleData(data)
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        Task { @MainActor [weak owner] in
            if let error {
                owner?.handleError(error)
            } else {
                owner?.handleCompleted()
            }
        }
    }
}
