import Foundation
import SwiftUI

/// Central app state: manages connection, active workspace/session, and coordinates
/// the SSE client with the REST API client.
@Observable
@MainActor
final class AppState {

    // MARK: - Connection

    var serverURL: String = ""
    var workspacePath: String = ""
    var isConnected = false
    var connectionError: String?
    var isConnecting = false

    // MARK: - Data

    var workspace: Workspace?
    var sessions: [Session] = []
    var activeSessionID: String?
    var messages: [Message] = []
    var pendingPermission: PermissionRequest?
    var agentBusy = false

    // MARK: - Services

    private(set) var api: APIClient?
    private(set) var sse: SSEClient?

    // MARK: - Init

    init() {
        // Defer UserDefaults reads to avoid blocking scene creation
        Task { @MainActor [weak self] in
            self?.serverURL = UserDefaults.standard.string(forKey: "serverURL") ?? ""
            self?.workspacePath = UserDefaults.standard.string(forKey: "workspacePath") ?? ""
        }
    }

    // MARK: - Connect

    func connect() async {
        guard !serverURL.isEmpty else {
            connectionError = "Server URL is required"
            return
        }

        isConnecting = true
        connectionError = nil

        let baseURL: URL
        do {
            baseURL = try parseServerURL(serverURL)
        } catch {
            connectionError = "Invalid URL: \(error.localizedDescription)"
            isConnecting = false
            return
        }

        let client = APIClient(baseURL: baseURL)

        // Health check
        do {
            let ok = try await client.healthCheck()
            guard ok else {
                connectionError = "Health check failed"
                isConnecting = false
                return
            }
        } catch {
            connectionError = "Cannot reach server: \(error.localizedDescription)"
            isConnecting = false
            return
        }

        self.api = client

        // Create or find workspace
        do {
            let ws = try await client.createWorkspace(path: workspacePath.isEmpty ? "." : workspacePath)
            self.workspace = ws

            // Persist settings
            UserDefaults.standard.set(serverURL, forKey: "serverURL")
            UserDefaults.standard.set(workspacePath, forKey: "workspacePath")

            // Start SSE
            let sseClient = SSEClient(baseURL: baseURL, workspaceID: ws.id)
            setupSSECallbacks(sseClient)
            sseClient.connect()
            self.sse = sseClient

            // Load sessions
            let loaded = try await client.listSessions(workspaceID: ws.id)
            self.sessions = loaded.sorted { $0.updatedDate > $1.updatedDate }

            if let first = sessions.first {
                activeSessionID = first.id
                await loadMessages(for: first.id)
            }

            isConnected = true
        } catch {
            connectionError = "Setup failed: \(error.localizedDescription)"
        }

        isConnecting = false
    }

    func disconnect() {
        sse?.disconnect()
        sse = nil
        api = nil
        workspace = nil
        sessions = []
        messages = []
        activeSessionID = nil
        pendingPermission = nil
        isConnected = false
    }

    // MARK: - Session Management

    func createNewSession() async {
        guard let api, let ws = workspace else { return }
        do {
            let session = try await api.createSession(workspaceID: ws.id)
            sessions.insert(session, at: 0)
            activeSessionID = session.id
            messages = []
        } catch {
            connectionError = "Failed to create session: \(error.localizedDescription)"
        }
    }

    func selectSession(_ id: String) async {
        activeSessionID = id
        await loadMessages(for: id)
    }

    func loadMessages(for sessionID: String) async {
        guard let api, let ws = workspace else { return }
        do {
            messages = try await api.getSessionMessages(workspaceID: ws.id, sessionID: sessionID)
        } catch {
            // Non-fatal
        }
    }

    // MARK: - Send Message

    func sendPrompt(_ text: String) async {
        guard let api, let ws = workspace, let sessionID = activeSessionID else { return }
        let runID = UUID().uuidString
        let msg = AgentMessage(
            sessionId: sessionID,
            runId: runID,
            prompt: text,
            attachments: nil
        )
        agentBusy = true
        do {
            try await api.sendMessage(workspaceID: ws.id, message: msg)
        } catch {
            connectionError = "Send failed: \(error.localizedDescription)"
            agentBusy = false
        }
    }

    func cancelAgent() async {
        guard let api, let ws = workspace, let sessionID = activeSessionID else { return }
        do {
            try await api.cancelAgent(workspaceID: ws.id, sessionID: sessionID)
        } catch {
            connectionError = "Cancel failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Permissions

    func respondToPermission(action: PermissionAction) async {
        guard let api, let ws = workspace, let perm = pendingPermission else { return }
        let grant = PermissionGrant(permission: perm, action: action)
        do {
            _ = try await api.grantPermission(workspaceID: ws.id, grant: grant)
        } catch {
            connectionError = "Permission response failed: \(error.localizedDescription)"
        }
        pendingPermission = nil
    }

    // MARK: - SSE Callbacks

    private func setupSSECallbacks(_ sse: SSEClient) {
        sse.onMessage = { [weak self] event in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch event.type {
                case "created":
                    self.messages.append(event.payload)
                case "updated":
                    if let idx = self.messages.firstIndex(where: { $0.id == event.payload.id }) {
                        self.messages[idx] = event.payload
                    }
                case "deleted":
                    self.messages.removeAll { $0.id == event.payload.id }
                default: break
                }
            }
        }

        sse.onSession = { [weak self] event in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch event.type {
                case "created":
                    self.sessions.insert(event.payload, at: 0)
                case "updated":
                    if let idx = self.sessions.firstIndex(where: { $0.id == event.payload.id }) {
                        self.sessions[idx] = event.payload
                    }
                case "deleted":
                    self.sessions.removeAll { $0.id == event.payload.id }
                default: break
                }
            }
        }

        sse.onPermissionRequest = { [weak self] event in
            Task { @MainActor [weak self] in
                self?.pendingPermission = event.payload
            }
        }

        sse.onRunComplete = { [weak self] event in
            Task { @MainActor [weak self] in
                self?.agentBusy = false
            }
        }

        sse.onAgentEvent = { [weak self] event in
            Task { @MainActor [weak self] in
                if event.payload.type == "error" {
                    self?.connectionError = event.payload.error
                }
            }
        }
    }

    // MARK: - Helpers

    private func parseServerURL(_ raw: String) throws -> URL {
        var str = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !str.contains("://") { str = "http://" + str }
        guard let url = URL(string: str) else {
            throw URLError(.badURL)
        }
        return url
    }
}