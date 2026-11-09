import UIKit
import Capacitor

/// The web view's host.
///
/// It once switched off WebKit's internal "PreferPageRenderingUpdatesNear60FPSEnabled"
/// flag, through the private WKPreferences selectors `_features` and
/// `_setEnabled:forFeature:`, so the page could draw at 120 Hz on ProMotion screens.
/// App Store Review Guideline 2.5.1 forbids private API, and App Store Connect scans
/// binaries for those selector names, so that is gone: WebKit now paces
/// `requestAnimationFrame` itself (near 60 fps). The game's frame clock already
/// snaps to whatever rhythm the screen delivers (see App.ts), so nothing else changes.
class MainViewController: CAPBridgeViewController {}
