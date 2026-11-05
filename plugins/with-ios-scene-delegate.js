// Expo SDK 54 iOS 27 lifecycle fix. Based on expo/expo#50250.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
const MARKER = '// with-ios-scene-delegate';
const SCENE_DELEGATE = `
// with-ios-scene-delegate (Expo SDK 54 / Xcode 27)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    let window = appDelegate.window ?? UIWindow(frame: windowScene.coordinateSpace.bounds)
    window.windowScene = windowScene
    self.window = window
    appDelegate.window = window
    window.makeKeyAndVisible()
    for context in connectionOptions.urlContexts {
      SceneDelegate.deliver(url: context.url, options: context.options)
    }
    for activity in connectionOptions.userActivities {
      SceneDelegate.deliver(userActivity: activity)
    }
  }
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      SceneDelegate.deliver(url: context.url, options: context.options)
    }
  }
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    SceneDelegate.deliver(userActivity: userActivity)
  }
  private static func deliver(url: URL, options sceneOptions: UIScene.OpenURLOptions) {
    guard let delegate = UIApplication.shared.delegate else { return }
    var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: sceneOptions.openInPlace]
    if let sourceApplication = sceneOptions.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = sceneOptions.annotation {
      options[.annotation] = annotation
    }
    _ = delegate.application?(UIApplication.shared, open: url, options: options)
  }
  private static func deliver(userActivity: NSUserActivity) {
    guard let delegate = UIApplication.shared.delegate else { return }
    _ = delegate.application?(UIApplication.shared, continue: userActivity,
                               restorationHandler: { _ in })
  }
}
`;
const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [{
      UISceneConfigurationName: 'Default Configuration',
      UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
    }],
  },
};
module.exports = (config) => {
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('Swift AppDelegate required');
    const content = cfg.modResults.contents;
    if (!content.includes(MARKER)) {
      if (!/class AppDelegate\s*:\s*ExpoAppDelegate/.test(content) ||
          !content.includes('factory.startReactNative(') ||
          !content.includes('window = UIWindow(frame:')) {
        throw new Error('Unexpected SDK 54 AppDelegate; patch intentionally refused');
      }
      cfg.modResults.contents = content + SCENE_DELEGATE;
    }
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });
};
