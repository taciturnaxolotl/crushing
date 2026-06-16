import Foundation

/// REST client for the Crush server API.
/// All endpoints are under /v1/.
final class APIClient {

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    init(baseURL: URL) {
        self.baseURL = baseURL
        self.session = URLSession(configuration: .default)
        self.decoder = JSONDecoder()
    }

    // MARK: - System

    func healthCheck() async throws -> Bool {
        let (_, response) = try await get(path: "v1/health")
        return (response as? HTTPURLResponse)?.statusCode == 200
    }

    func version() async throws -> VersionInfo {
        try await getDecoded(path: "v1/version")
    }

    // MARK: - Workspaces

    func listWorkspaces() async throws -> [Workspace] {
        try await getDecoded(path: "v1/workspaces")
    }

    func createWorkspace(path workspacePath: String) async throws -> Workspace {
        struct CreateRequest: Codable { let path: String }
        return try await postDecoded(
            path: "v1/workspaces",
            body: CreateRequest(path: workspacePath)
        )
    }

    func getWorkspace(id: String) async throws -> Workspace {
        try await getDecoded(path: "v1/workspaces/\(id)")
    }

    func deleteWorkspace(id: String) async throws {
        _ = try await delete(path: "v1/workspaces/\(id)")
    }

    // MARK: - Sessions

    func listSessions(workspaceID: String) async throws -> [Session] {
        try await getDecoded(path: "v1/workspaces/\(workspaceID)/sessions")
    }

    func createSession(workspaceID: String, title: String? = nil) async throws -> Session {
        struct CreateRequest: Codable { let title: String? }
        return try await postDecoded(
            path: "v1/workspaces/\(workspaceID)/sessions",
            body: CreateRequest(title: title)
        )
    }

    func getSession(workspaceID: String, sessionID: String) async throws -> Session {
        try await getDecoded(path: "v1/workspaces/\(workspaceID)/sessions/\(sessionID)")
    }

    func deleteSession(workspaceID: String, sessionID: String) async throws {
        _ = try await delete(path: "v1/workspaces/\(workspaceID)/sessions/\(sessionID)")
    }

    func getSessionMessages(workspaceID: String, sessionID: String) async throws -> [Message] {
        try await getDecoded(path: "v1/workspaces/\(workspaceID)/sessions/\(sessionID)/messages")
    }

    func getSessionHistory(workspaceID: String, sessionID: String) async throws -> [Message] {
        try await getDecoded(path: "v1/workspaces/\(workspaceID)/sessions/\(sessionID)/history")
    }

    // MARK: - Agent

    func sendMessage(workspaceID: String, message: AgentMessage) async throws {
        _ = try await post(path: "v1/workspaces/\(workspaceID)/agent", body: message)
    }

    func cancelAgent(workspaceID: String, sessionID: String) async throws {
        _ = try await post(
            path: "v1/workspaces/\(workspaceID)/agent/sessions/\(sessionID)/cancel"
        )
    }

    func summarizeSession(workspaceID: String, sessionID: String) async throws {
        _ = try await post(
            path: "v1/workspaces/\(workspaceID)/agent/sessions/\(sessionID)/summarize"
        )
    }

    func getAgentInfo(workspaceID: String) async throws -> AgentInfo {
        try await getDecoded(path: "v1/workspaces/\(workspaceID)/agent")
    }

    // MARK: - Permissions

    func grantPermission(workspaceID: String, grant: PermissionGrant) async throws -> PermissionGrantResponse {
        try await postDecoded(
            path: "v1/workspaces/\(workspaceID)/permissions/grant",
            body: grant
        )
    }

    func skipPermissions(workspaceID: String, skip: Bool) async throws {
        struct SkipRequest: Codable { let skip: Bool }
        _ = try await post(
            path: "v1/workspaces/\(workspaceID)/permissions/skip",
            body: SkipRequest(skip: skip)
        )
    }

    // MARK: - HTTP Helpers

    private func get(path: String) async throws -> (Data, URLResponse) {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        return try await session.data(for: request)
    }

    private func post(path: String, body: (any Encodable)? = nil) async throws -> (Data, URLResponse) {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        return try await session.data(for: request)
    }

    private func delete(path: String) async throws -> (Data, URLResponse) {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        return try await session.data(for: request)
    }

    private func getDecoded<T: Decodable>(path: String) async throws -> T {
        let (data, _) = try await get(path: path)
        return try decoder.decode(T.self, from: data)
    }

    private func postDecoded<T: Decodable>(path: String, body: any Encodable) async throws -> T {
        let (data, _) = try await post(path: path, body: body)
        return try decoder.decode(T.self, from: data)
    }
}

// MARK: - AgentInfo (lightweight, separate from proto.AgentInfo which depends on catwalk)

struct AgentInfo: Codable {
    let isBusy: Bool
    let isReady: Bool

    enum CodingKeys: String, CodingKey {
        case isBusy = "is_busy"
        case isReady = "is_ready"
    }
}
