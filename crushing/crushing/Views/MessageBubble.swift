import SwiftUI

struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.role == .user { Spacer(minLength: 48) }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                // Role label
                Text(message.role.rawValue.capitalized)
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                // Content parts
                ForEach(message.parts) { part in
                    contentPart(part)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleColor)
            .cornerRadius(16)

            if message.role != .user { Spacer(minLength: 48) }
        }
    }

    @ViewBuilder
    private func contentPart(_ part: ContentPart) -> some View {
        switch part {
        case .text(let t):
            Text(t.text)
                .textSelection(.enabled)
                .font(.body)

        case .reasoning(let r):
            DisclosureGroup("Thinking") {
                Text(r.thinking ?? "")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            .font(.caption)

        case .toolCall(let tc):
            toolCallView(tc)

        case .toolResult(let tr):
            toolResultView(tr)

        case .finish(let f):
            if let reason = f.reason, reason != .endTurn {
                HStack(spacing: 4) {
                    Image(systemName: "info.circle")
                        .font(.caption2)
                    Text(reason.rawValue)
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }

        case .imageURL(let img):
            AsyncImage(url: URL(string: img.url ?? "")) { image in
                image.resizable().aspectRatio(contentMode: .fit)
            } placeholder: {
                ProgressView()
            }
            .frame(maxHeight: 200)
            .cornerRadius(8)
        }
    }

    private func toolCallView(_ tc: ToolCall) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "wrench.and.screwdriver")
                    .font(.caption2)
                Text(tc.name ?? "tool")
                    .font(.caption)
                    .fontWeight(.medium)
                if !(tc.finished ?? false) {
                    ProgressView()
                        .controlSize(.mini)
                }
            }
            .foregroundStyle(.blue)

            if let input = tc.input, !input.isEmpty {
                Text(input.prefix(300))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(5)
            }
        }
        .padding(8)
        .background(Color.blue.opacity(0.08))
        .cornerRadius(8)
    }

    private func toolResultView(_ tr: ToolResult) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: tr.isError == true ? "xmark.circle" : "checkmark.circle")
                    .font(.caption2)
                    .foregroundStyle(tr.isError == true ? .red : .green)
                Text(tr.name ?? "result")
                    .font(.caption)
                    .fontWeight(.medium)
            }

            if let content = tr.content, !content.isEmpty {
                Text(content.prefix(500))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(8)
                    .textSelection(.enabled)
            }
        }
        .padding(8)
        .background((tr.isError == true ? Color.red : Color.green).opacity(0.08))
        .cornerRadius(8)
    }

    private var bubbleColor: Color {
        switch message.role {
        case .user: return Color.accentColor.opacity(0.15)
        case .assistant: return Color(.systemGray6)
        case .tool: return Color(.systemGray6)
        case .system: return Color.yellow.opacity(0.1)
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        MessageBubble(message: Message(
            id: "1", role: .user, sessionId: "s",
            parts: [.text(TextContent(text: "Hello!"))],
            model: "", provider: "", createdAt: 0, updatedAt: 0
        ))
        MessageBubble(message: Message(
            id: "2", role: .assistant, sessionId: "s",
            parts: [
                .reasoning(ReasoningContent(thinking: "Let me think...", signature: nil, startedAt: nil, finishedAt: nil)),
                .text(TextContent(text: "Hi there! How can I help?")),
            ],
            model: "", provider: "", createdAt: 0, updatedAt: 0
        ))
    }
    .padding()
}
