import Foundation

struct Session: Codable, Identifiable {
    let id: String
    let parentSessionId: String?
    let title: String
    let messageCount: Int64
    let promptTokens: Int64
    let completionTokens: Int64
    let summaryMessageId: String?
    let cost: Double
    let todos: [Todo]?
    let createdAt: Int64
    let updatedAt: Int64
    var isBusy: Bool
    var attachedClients: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, cost, todos
        case parentSessionId = "parent_session_id"
        case messageCount = "message_count"
        case promptTokens = "prompt_tokens"
        case completionTokens = "completion_tokens"
        case summaryMessageId = "summary_message_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case isBusy = "is_busy"
        case attachedClients = "attached_clients"
    }

    var createdDate: Date {
        Date(timeIntervalSince1970: TimeInterval(createdAt))
    }

    var updatedDate: Date {
        Date(timeIntervalSince1970: TimeInterval(updatedAt))
    }
}

struct Todo: Codable, Identifiable {
    let content: String
    let status: String
    let activeForm: String

    enum CodingKeys: String, CodingKey {
        case content, status
        case activeForm = "active_form"
    }

    var id: String { content }
}
