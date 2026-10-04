# Veya Campus mobile shell

This is the Android-first Capacitor shell around the Veya Campus responsive prototype.

## Current state

- The web app lives in `www/`: `index.html` (markup only), `css/app.css` + `css/polish.css`, and ordered scripts in `js/`. `www/` is the single source of truth; `npm run build` no longer copies an `index.html` over it. Scripts are plain `<script>` tags that share one scope, so the order in `index.html` matters (the build checks every referenced file exists).
- Opening `www/index.html` directly in a browser works without errors (a demo-mode `supabase-config.js` stub is included; there is no service worker in this build).
- Report and block tools (posts, people, listings, messages) and a moderator queue are built into the demo; they mirror `reports` and `user_blocks` in the backend schema.
- An Android Capacitor project is included under `android/`.
- The Android activity is configured for portrait orientation and resize-aware keyboard behavior.
- The Android shell includes Honey Campus launcher and splash assets plus Capacitor App back-button handling.
- Native QR scanning is wired through `@capacitor-mlkit/barcode-scanning`; it creates a pending demo verification request and still requires administrator approval.
- `veya-admin-demo-qr.png` is a fictional, scannable QR for testing the native camera path only; it is not a credential or production verification token.
- The web shell includes safe-area spacing, offline status messaging, startup/error states, accessible focus states, and keyboard-aware viewport behavior.
- Capacitor uses the app id `com.veya.campus`.
- Stage 2: with a real Supabase sign-in the app runs in live mode (profiles, feed, likes, comments, posts, follows, persistent refreshed session; see `CHANGES.md`). Messages, bookings, opportunities, events and photos are still the local fictional demo.
- Signed out, or with no backend configured, the app data is fictional and browser/local-storage based.
- A provider-neutral PostgreSQL/Supabase backend foundation is documented under `backend/`.
- The dependency-free Supabase REST adapter and local config generator are present.
- When public configuration is included, the Communities page can show a read-only fictional reference directory from Supabase; the fictional local directory and all demo actions remain the fallback.
- A GitHub Actions workflow is included at `.github/workflows/build-android.yml` for cloud APK builds.
- Optional GitHub Actions secrets `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` can provide public backend configuration; absent secrets keep the APK in fictional demo mode.

## Local development

```bash
npm install
npm run build   # checks www/ references, writes www/supabase-config.js, copies the backend adapter
npm run sync
npx cap open android
```

Android Studio and an Android SDK are required for local Android builds. The Capacitor 7 Android project compiles with Java 21; Android Studio's Embedded JDK is suitable.

## Build an APK without a powerful computer

1. Create a private GitHub repository.
2. Upload the **contents of this folder** to the repository root, including `android/`, `www/`, `.github/`, `package.json`, and `package-lock.json`.
3. Open the repository's **Actions** tab.
4. Select **Build Veya Android APK**.
5. Choose **Run workflow**.
6. When the workflow finishes, open the workflow run and download the `veya-campus-debug-apk` artifact.
7. Extract the artifact and install `app-debug.apk` on an Android phone.

The GitHub workflow uses Java 21 and an Ubuntu Android build environment, so Android Studio is not required on the low-RAM computer used to edit the prototype.
