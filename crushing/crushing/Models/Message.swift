import Foundation

// MARK: - Message Role

enum MessageRole: String, Codable {
    case assistant
    case user
    case system
    case tool
}

// MARK: - Finish Reason

enum FinishReason: String, Codable {
    case endTurn = "end_turn"
    case maxTokens = "max_tokens"
    case toolUse = "tool_use"
    case canceled
    case error
    case unknown
}

// MARK: - Content Parts (polymorphic)

enum ContentPart: Codable, Identifiable {
    case text(TextContent)
    case reasoning(ReasoningContent)
    case toolCall(ToolCall)
    case toolResult(ToolResult)
    case finish(Finish)
    case imageURL(ImageURLContent)

    var id: String {
        switch self {
        case .text(let c): return "text-\(c.text.hashValue)"
        case .reasoning(let c): return "reasoning-\(c.thinking.hashValue)"
        case .toolCall(let c): return "toolcall-\(c.id)"
        case .toolResult(let c): return "toolresult-\(c.toolCallID)"
        case .finish(let c): return "finish-\(c.time)"
        case .imageURL(let c): return "image-\(c.url.hashValue)"
        }
    }

    // Custom decoding: try each variant in order
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let v = try? container.decode(ToolCall.self), v.name != nil {
            self = .toolCall(v); return
        }
        if let v = try? container.decode(ToolResult.self), v.toolCallID != nil {
            self = .toolResult(v); return
        }
        if let v = try? container.decode(Finish.self), v.reason != nil {
            self = .finish(v); return
        }
        if let v = try? container.decode(ReasoningContent.self), v.thinking != nil {
            self = .reasoning(v); return
        }
        if let v = try? container.decode(ImageURLContent.self), v.url != nil {
            self = .imageURL(v); return
        }
        if let v = try? container.decode(TextContent.self) {
            self = .text(v); return
        }

        throw DecodingError.dataCorruptedError(
            in: container,
            debugDescription: "Unable to decode ContentPart"
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let v): try container.encode(v)
        case .reasoning(let v): try container.encode(v)
        case .toolCall(let v): try container.encode(v)
        case .toolResult(let v): try container.encode(v)
        case .finish(let v): try container.encode(v)
        case .imageURL(let v): try container.encode(v)
        }
    }
}

struct TextContent: Codable, Hashable {
    let text: String
}

struct ReasoningContent: Codable, Hashable {
    let thinking: String?
    let signature: String?
    let startedAt: Int64?
    let finishedAt: Int64?

    enum CodingKeys: String, CodingKey {
        case thinking, signature
        case startedAt = "started_at"
        case finishedAt = "finished_at"
    }
}

struct ImageURLContent: Codable, Hashable {
    let url: String?
    let detail: String?
}

struct ToolCall: Codable, Hashable {
    let id: String
    let name: String?
    let input: String?
    let type: String?
    let finished: Bool?
}

struct ToolResult: Codable, Hashable {
    let toolCallID: String?
    let name: String?
    let content: String?
    let data: String?
    let mimeType: String?
    let metadata: String?
    let isError: Bool?

    enum CodingKeys: String, CodingKey {
        case toolCallID = "tool_call_id"
        case name, content, data
        case mimeType = "mime_type"
        case metadata
        case isError = "is_error"
    }
}

struct Finish: Codable, Hashable {
    let reason: FinishReason?
    let time: Int64?
    let message: String?
    let details: String?
}

// MARK: - Message

struct Message: Codable, Identifiable {
    let id: String
    let role: MessageRole
    let sessionId: String
    let parts: [ContentPart]
    let model: String
    let provider: String
    let createdAt: Int64
    let updatedAt: Int64

    enum CodingKeys: String, CodingKey {
        case id, role, parts, model, provider
        case sessionId = "session_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    /// Convenience: extract plain text from parts
    var textContent: String {
        parts.compactMap { part -> String? in
            if case .text(let t) = part { return t.text }
            return nil
        }.joined(separator: "\n")
    }

    /// Convenience: check if message contains a finish part
    var isFinished: Bool {
        parts.contains { if case .finish = $0 { return true }; return false }
    }
}
