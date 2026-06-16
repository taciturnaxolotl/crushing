import SwiftUI

struct ConnectView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState

        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Host:port", text: $appState.serverURL)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .keyboardType(.URL)
                }

                Section("Workspace") {
                    TextField("Project path (e.g. /Users/you/code/project)", text: $appState.workspacePath)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }

                if let error = appState.connectionError {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                Section {
                    Button {
                        Task { await appState.connect() }
                    } label: {
                        HStack {
                            if appState.isConnecting {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(appState.isConnecting ? "Connecting..." : "Connect")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(appState.isConnecting || appState.serverURL.isEmpty)
                }
            }
            .navigationTitle("Crush")
        }
    }
}

#Preview {
    ConnectView()
        .environment(AppState())
}
