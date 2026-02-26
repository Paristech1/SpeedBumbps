import UIKit
import Flutter
import FirebaseCore

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Only configure Firebase when we have real config (not placeholder).
    if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
       let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
       let apiKey = dict["API_KEY"] as? String,
       !apiKey.contains("REPLACE") {
      FirebaseApp.configure()
    } else {
      NSLog("Firebase: Skipping configure (placeholder or missing config).")
    }
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
