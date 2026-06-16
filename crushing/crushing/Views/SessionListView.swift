import SwiftUI

struct SessionListView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        List(appState.sessions) { session in
            Button {
                Task { await appState.selectSession(session.id) }
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(session.title.isEmpty ? "Untitled" : session.title)
                            .font(.headline)
                            .lineLimit(1)

                        Spacer()

                        if session.isBusy {
                            ProgressView()
                                .controlSize(.mini)
                        }
                    }

                    HStack(spacing: 8) {
                        Text("\(session.messageCount) messages")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if session.cost > 0 {
                            Text(String(format: "$%.3f", session.cost))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Text(session.updatedDate, style: .relative)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.vertical, 2)
            }
            .tint(.primary)
        }
        .listStyle(.plain)
        .navigationTitle("Sessions")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await appState.createNewSession() }
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable {
            guard let api = appState.api, let ws = appState.workspace else { return }
            if let loaded = try? await api.listSessions(workspaceID: ws.id) {
                appState.sessions = loaded.sorted { $0.updatedDate > $1.updatedDate }
            }
        }
    }
}

#Preview {
    NavigationStack {
        SessionListView()
            .environment(AppState())
    }
}
