import SwiftUI

@main
struct crushingApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ConnectView()
                .environment(appState)
        }
    }
}
