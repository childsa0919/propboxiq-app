# PropBox IQ — iOS App Build Runbook

This is the step-by-step you'll run on your Mac to take the `feat/capacitor-ios`
branch and turn it into a TestFlight build, then an App Store submission.

**Bundle ID:** `com.propboxiq.app`
**Display name:** PropBox IQ
**Version at launch:** `1.0.0` (build `1`)
**API origin (production):** `https://propboxiq.com`

---

## Prerequisites on the Mac

1. **macOS Sonoma (14) or newer** — required for current Xcode.
2. **Xcode 15+** — install from the Mac App Store (~7 GB download).
3. **CocoaPods** — `sudo gem install cocoapods` (or `brew install cocoapods`).
4. **Node 20+** and **npm** matching what's in `package.json`.
5. **Apple Developer Program** — paid membership active under your Apple ID.
6. Clone the repo and check out the branch:
   ```bash
   git clone https://github.com/childsa0919/propboxiq-app.git
   cd propboxiq-app
   git checkout feat/capacitor-ios
   npm install
   ```

---

## Step 1 — Build the web bundle and add the iOS project

The Capacitor iOS folder is generated, not checked in. Run once:

```bash
npm run build                      # produces dist/public/
npx cap add ios                    # creates ios/ folder (run once, then commit it)
npx cap sync ios                   # copies dist/public + plugins into the iOS app
```

This creates `ios/App/App.xcworkspace` — always open the **`.xcworkspace`**, never
the `.xcodeproj` (CocoaPods).

---

## Step 2 — Install app icons

Copy the icons from `ios-assets/` into the iOS project's AppIcon set:

```bash
APPICON_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"
cp ios-assets/AppIcon-1024.png "$APPICON_DIR/AppIcon-512@2x.png"
# Modern Xcode (15+) accepts a single 1024×1024 marketing icon and generates
# the rest at build time. If your version doesn't, copy the other sizes too:
cp ios-assets/AppIcon-20@2x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-20@3x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-29@2x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-29@3x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-40@2x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-40@3x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-60@2x.png "$APPICON_DIR/"
cp ios-assets/AppIcon-60@3x.png "$APPICON_DIR/"
```

In Xcode, open `Assets.xcassets > AppIcon` and verify every slot is filled.

---

## Step 3 — Install splash screen

```bash
SPLASH_DIR="ios/App/App/Assets.xcassets/Splash.imageset"
mkdir -p "$SPLASH_DIR"
cp ios-assets/splash.png       "$SPLASH_DIR/splash-2732x2732.png"
cp ios-assets/splash.png       "$SPLASH_DIR/splash-2732x2732-1.png"
cp ios-assets/splash-dark.png  "$SPLASH_DIR/splash-2732x2732-2.png"
```

Also confirm `capacitor.config.ts` matches (already set):
- backgroundColor `#0a0e12`
- launchShowDuration `1200`
- launchAutoHide `true`

---

## Step 4 — Configure signing in Xcode

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select the **App** target in the sidebar, then the **Signing & Capabilities** tab.
3. Check **Automatically manage signing**.
4. Pick your **Team** (your Apple Developer membership).
5. **Bundle Identifier:** `com.propboxiq.app` (should already be set from
   capacitor.config.ts).
6. Xcode will provision the certificate automatically. If it complains, click
   "Try Again" or sign in to your Apple ID in Xcode > Settings > Accounts first.

---

## Step 5 — App version, display name, status bar

In the **General** tab of the App target:
- **Display Name:** `PropBox IQ` (with the space)
- **Version:** `1.0.0`
- **Build:** `1`
- **Minimum Deployments — iOS:** `15.0`
- **iPhone Orientation:** Portrait only (uncheck Landscape Left/Right)
- **iPad Orientation:** all unchecked (we'll mark as iPhone-only at submission)

In **Info.plist** (`ios/App/App/Info.plist`), make sure these are set:
- `UIStatusBarStyle` → `UIStatusBarStyleLightContent`
- `UIViewControllerBasedStatusBarAppearance` → `NO`
- `UILaunchStoryboardName` → `LaunchScreen` (already)
- `NSAppTransportSecurity` → leave default (HTTPS-only, which we comply with)

---

## Step 6 — Run on Simulator / your iPhone

**Simulator:**
```bash
npx cap open ios          # opens the workspace in Xcode
# In Xcode: pick "iPhone 15 Pro" → ▶︎ Run
```

**Your iPhone (physical device test):**
1. Plug in via USB cable.
2. On iPhone: Settings > Privacy & Security > Developer Mode → ON (reboot required first time).
3. In Xcode: pick your device in the destination picker → ▶︎ Run.
4. First run: Settings > General > VPN & Device Management → trust your
   developer certificate.

**Smoke test once running:**
- Welcome screen renders with safe-area padding (no overlap with Dynamic Island).
- Tap "Quick Analyze" — wizard works.
- Submit a deal — the result loads (this proves API calls + CORS + cookies work).
- Pull-down doesn't rubber-band the whole app.
- Splash hides after ~1s when app launches.

---

## Step 7 — Archive and upload to App Store Connect

```bash
# In Xcode:
# 1. Select "Any iOS Device (arm64)" as the destination.
# 2. Menu: Product > Archive.
# 3. Wait ~3-5 min. The Organizer window opens automatically.
# 4. Click "Distribute App" > "App Store Connect" > "Upload".
# 5. Xcode signs + uploads to App Store Connect (~5-10 min).
```

Once uploaded, the build appears in App Store Connect within ~20 min
(processing). You'll get an email when it's ready for TestFlight.

---

## Step 8 — TestFlight (internal test)

In [App Store Connect](https://appstoreconnect.apple.com):

1. **My Apps** → **PropBox IQ** → **TestFlight** tab.
2. Add yourself to **Internal Testers** (no review required, instant access).
3. Install **TestFlight** app on your iPhone.
4. Use the invite link to install the build.
5. Test the full flow on a real device — especially OAuth (web only), magic-link
   email, deal creation, Market Stats panel rendering, share sheet.

---

## Step 9 — Prepare App Store listing

Use the copy in `docs/APP_STORE_LISTING.md`. You'll need:

- **5 screenshots, 6.7" (iPhone 15 Pro Max, 1290×2796)** — required minimum.
- **App icon 1024×1024** — already at `ios-assets/AppIcon-1024.png`.
- **Privacy policy URL** — host at `https://propboxiq.com/privacy` (text in
  `docs/PRIVACY_POLICY.md`).
- **Support URL** — `https://propboxiq.com/support` or mailto.

---

## Step 10 — Submit for review

1. App Store Connect → Apps → PropBox IQ → **App Store** tab → **iOS App 1.0**.
2. Fill all required fields (listing, screenshots, App Privacy).
3. Pick the build that processed.
4. Click **Add for Review** → **Submit for Review**.
5. Apple review typically takes **24–48 hours** in 2026.

**Common rejection reasons we mitigated:**
- 4.2 Minimum Functionality → we added haptics, native share, splash, status bar.
- 5.1.1 Sign-In with Apple → required if you offer any third-party login.
  We hid Google OAuth in the iOS app for v1.0 to dodge this — magic-link email
  only. Add Sign In with Apple in v1.1.
- App Tracking Transparency → we don't track, no prompt needed.

---

## Subsequent builds (after v1.0.0)

```bash
git pull origin main
npm install
npm run build
npx cap sync ios
# bump CFBundleVersion (Build) in Xcode by 1
# Product > Archive > Upload
```
