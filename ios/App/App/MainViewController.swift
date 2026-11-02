import UIKit
import WebKit
import Capacitor

/// The web view's host. It lets the page run at the screen's full rate.
///
/// WebKit holds `requestAnimationFrame` near 60 fps by default even on a
/// ProMotion iPhone (Info.plist's CADisableMinimumFrameDurationOnPhone only
/// frees native Core Animation). That cap is one of WebKit's feature flags,
/// "PreferPageRenderingUpdatesNear60FPSEnabled"; turning it off lets the game
/// draw every frame of a 120 Hz display. It is looked up by name at run time
/// and skipped quietly if a future iOS renames or removes it.
class MainViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        // Only a ProMotion screen has frames to gain; any other keeps WebKit's own pacing.
        if UIScreen.main.maximumFramesPerSecond > 60 { MainViewController.freeFrameRate(configuration.preferences) }
        return configuration
    }

    private static func freeFrameRate(_ preferences: WKPreferences) {
        let listFeatures = NSSelectorFromString("_features")
        let setEnabled = NSSelectorFromString("_setEnabled:forFeature:")
        guard WKPreferences.responds(to: listFeatures), preferences.responds(to: setEnabled),
              let features = WKPreferences.perform(listFeatures)?.takeUnretainedValue() as? [AnyObject] else { return }
        typealias Setter = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        let set = unsafeBitCast(preferences.method(for: setEnabled), to: Setter.self)
        for feature in features where feature.responds(to: NSSelectorFromString("key")) {
            if (feature.value(forKey: "key") as? String) == "PreferPageRenderingUpdatesNear60FPSEnabled" {
                set(preferences, setEnabled, false, feature)
            }
        }
    }
}
