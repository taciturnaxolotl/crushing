import Foundation

// MARK: - SSE Event Envelope

/// The outer SSE payload. `type` discriminates the event kind,
/// `payload` is a nested Event<T> with its own type + typed payload.
struct SSEEnvelope: Codable {
    let type: String
    let payload: JSONAny

    /// Decode the inner Event<T> for a known payload type.
    func decodePayload<T: Decodable>(as _: T.Type) -> T? {
        guard let data = try? JSONSerialization.data(withJSONObject: payload.value) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

/// Inner event wrapper: every SSE payload contains {"type": "created|updated|deleted", "payload": {...}}
struct TypedEvent<T: Decodable>: Decodable {
    let type: String  // "created", "updated", "deleted"
    let payload: T
}

// MARK: - Payload Type Constants

enum PayloadType {
    static let message = "message"
    static let session = "session"
    static let permissionRequest = "permission_request"
    static let permissionNotification = "permission_notification"
    static let runComplete = "run_complete"
    static let agentEvent = "agent_event"
    static let configChanged = "config_changed"
    static let lspEvent = "lsp_event"
    static let mcpEvent = "mcp_event"
    static let skillsEvent = "skills_event"
    static let file = "file"
}

// MARK: - JSONAny helper

struct JSONAny: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let v = try? container.decode(Bool.self) { value = v }
        else if let v = try? container.decode(Int.self) { value = v }
        else if let v = try? container.decode(Double.self) { value = v }
        else if let v = try? container.decode(String.self) { value = v }
        else if let v = try? container.decode([JSONAny].self) { value = v.map(\.value) }
        else if let v = try? container.decode([String: JSONAny].self) { value = v.mapValues(\.value) }
        else if container.decodeNil() { value = NSNull() }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as Bool: try container.encode(v)
        case let v as Int: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as String: try container.encode(v)
        case is NSNull: try container.encodeNil()
        default: try container.encodeNil()
        }
    }
}
