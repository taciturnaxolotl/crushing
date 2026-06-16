import Foundation

// MARK: - Permission Types

struct PermissionRequest: Codable, Identifiable {
    let id: String
    let sessionId: String
    let toolCallId: String
    let toolName: String
    let description: String
    let action: String?
    let params: AnyCodable?
    let path: String?

    enum CodingKeys: String, CodingKey {
        case id, description, action, params, path
        case sessionId = "session_id"
        case toolCallId = "tool_call_id"
        case toolName = "tool_name"
    }
}

struct PermissionNotification: Codable {
    let toolCallId: String
    let granted: Bool
    let denied: Bool

    enum CodingKeys: String, CodingKey {
        case toolCallId = "tool_call_id"
        case granted, denied
    }
}

enum PermissionAction: String, Codable {
    case allow
    case allowSession = "allow_session"
    case deny
}

struct PermissionGrant: Codable {
    let permission: PermissionRequest
    let action: PermissionAction
}

struct PermissionGrantResponse: Codable {
    let resolved: Bool
}

// MARK: - Agent Types

struct AgentMessage: Codable {
    let sessionId: String
    let runId: String?
    let prompt: String
    let attachments: [Attachment]?

    enum CodingKeys: String, CodingKey {
        case prompt, attachments
        case sessionId = "session_id"
        case runId = "run_id"
    }
}

struct Attachment: Codable {
    let name: String
    let content: String
    let mimeType: String?

    enum CodingKeys: String, CodingKey {
        case name, content
        case mimeType = "mime_type"
    }
}

struct RunComplete: Codable {
    let sessionId: String
    let runId: String?
    let messageId: String
    let text: String?
    let error: String?
    let cancelled: Bool?

    enum CodingKeys: String, CodingKey {
        case text, error, cancelled
        case sessionId = "session_id"
        case runId = "run_id"
        case messageId = "message_id"
    }
}

struct AgentEvent: Codable {
    let type: String
    let sessionId: String?
    let sessionTitle: String?
    let runId: String?
    let error: String?
    let progress: String?
    let done: Bool?

    enum CodingKeys: String, CodingKey {
        case type, error, progress, done
        case sessionId = "session_id"
        case sessionTitle = "session_title"
        case runId = "run_id"
    }
}

// MARK: - Workspace

struct Workspace: Codable, Identifiable {
    let id: String
    let path: String
    let yolo: Bool?
    let debug: Bool?
    let version: String?
    let clientId: String?

    enum CodingKeys: String, CodingKey {
        case id, path, yolo, debug, version
        case clientId = "client_id"
    }
}

// MARK: - Version

struct VersionInfo: Codable {
    let version: String
    let commit: String?
}

// MARK: - AnyCodable helper for untyped JSON fields

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(Bool.self) { value = v }
        else if let v = try? container.decode(Int.self) { value = v }
        else if let v = try? container.decode(Double.self) { value = v }
        else if let v = try? container.decode(String.self) { value = v }
        else if let v = try? container.decode([AnyCodable].self) { value = v.map(\.value) }
        else if let v = try? container.decode([String: AnyCodable].self) { value = v.mapValues(\.value) }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as Bool: try container.encode(v)
        case let v as Int: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as String: try container.encode(v)
        default: try container.encodeNil()
        }
    }
}
