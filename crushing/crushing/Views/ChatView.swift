import SwiftUI

struct ChatView: View {
    @Environment(AppState.self) private var appState
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            messageList

            Divider()

            if let perm = appState.pendingPermission {
                permissionBanner(perm)
            }

            inputBar
        }
        .navigationTitle(appState.sessions.first(where: { $0.id == appState.activeSessionID })?.title ?? "Chat")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("New Session") {
                        Task { await appState.createNewSession() }
                    }
                    Button("Disconnect", role: .destructive) {
                        appState.disconnect()
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(appState.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }
            .onChange(of: appState.messages.count) { _, _ in
                if let last = appState.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Permission Banner

    private func permissionBanner(_ perm: PermissionRequest) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "shield.fill")
                    .foregroundStyle(.orange)
                Text(perm.toolName)
                    .font(.headline)
                    .fontWeight(.semibold)
            }

            Text(perm.description)
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Button("Allow") {
                    Task { await appState.respondToPermission(action: .allow) }
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .controlSize(.small)

                Button("Deny") {
                    Task { await appState.respondToPermission(action: .deny) }
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .controlSize(.small)

                Button("Allow for Session") {
                    Task { await appState.respondToPermission(action: .allowSession) }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.1))
        .cornerRadius(10)
        .padding(.horizontal)
        .padding(.vertical, 4)
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6))
                .cornerRadius(20)
                .focused($inputFocused)

            if appState.agentBusy {
                Button {
                    Task { await appState.cancelAgent() }
                } label: {
                    Image(systemName: "stop.fill")
                        .foregroundStyle(.red)
                        .frame(width: 36, height: 36)
                }
            } else {
                Button {
                    send()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.gray : Color.accentColor)
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private func send() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        Task { await appState.sendPrompt(text) }
    }
}

#Preview {
    NavigationStack {
        ChatView()
            .environment(AppState())
    }
}
