import React, { useState } from 'react';
import {
  Download,
  Terminal,
  Smartphone,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Layers,
  Cpu,
  FileCode,
  ShieldAlert
} from 'lucide-react';
import JSZip from 'jszip';
import { FLUTTER_CODEBASE } from '../data/flutterCodebase';

export const ApkBuildGuide: React.FC = () => {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleCopy = (text: string, stepIndex: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepIndex);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      // Write all Flutter codebase files into zip
      FLUTTER_CODEBASE.forEach(file => {
        zip.file(file.path, file.code);
      });

      // Write Android manifest & gradle configs
      zip.file(
        'android/app/src/main/AndroidManifest.xml',
        `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.whisper.whisper_text">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.WAKE_LOCK"/>
    <application
        android:label="WhisperText"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>`
      );

      // Write android/build.gradle
      zip.file(
        'android/build.gradle',
        `allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.buildDir = '../build'
subprojects {
    project.buildDir = "\${rootProject.buildDir}/\${project.name}"
    project.evaluationDependsOn(':app')
}

tasks.register("clean", Delete) {
    delete rootProject.buildDir
}`
      );

      // Write android/app/build.gradle
      zip.file(
        'android/app/build.gradle',
        `plugins {
    id "com.android.application"
    id "kotlin-android"
    id "dev.flutter.flutter-gradle-plugin"
    id "com.google.gms.google-services"
}

def localProperties = new Properties()
def localPropertiesFile = rootProject.file('local.properties')
if (localPropertiesFile.exists()) {
    localPropertiesFile.withReader('UTF-8') { reader ->
        localProperties.load(reader)
    }
}

android {
    namespace "com.whisper.whisper_text"
    compileSdkVersion 34
    ndkVersion flutter.ndkVersion

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = '1.8'
    }

    defaultConfig {
        applicationId "com.whisper.whisper_text"
        minSdkVersion 21
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
        multiDexEnabled true
    }

    buildTypes {
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
            shrinkResources false
        }
    }
}

flutter {
    source '../..'
}

dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.8.0')
}`
      );

      // Write android/settings.gradle
      zip.file(
        'android/settings.gradle',
        `include ':app'

def localPropertiesFile = new File(rootProject.projectDir, "local.properties")
def properties = new Properties()

assert localPropertiesFile.exists()
localPropertiesFile.withReader("UTF-8") { reader -> properties.load(reader) }

def flutterSdkPath = properties.getProperty("flutter.sdk")
assert flutterSdkPath != null, "flutter.sdk not set in local.properties"
apply from: "\$flutterSdkPath/packages/flutter_tools/gradle/app_plugin_loader.gradle"`
      );

      // Write GitHub Actions Workflow for automated cloud APK compilation
      zip.file(
        '.github/workflows/build_apk.yml',
        `name: Build Android APK
on: [push, workflow_dispatch]

jobs:
  build:
    name: Compile Release APK
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Java JDK
        uses: actions/setup-java@v3
        with:
          distribution: 'zulu'
          java-version: '17'

      - name: Setup Flutter SDK
        uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.19.x'
          cache: true

      - name: Install Pub Dependencies
        run: flutter pub get

      - name: Build Release APK
        run: flutter build apk --release

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: whisper-text-release-apk
          path: build/app/outputs/flutter-apk/app-release.apk
`
      );

      // Write Linux/Mac build script
      zip.file(
        'build_apk.sh',
        `#!/bin/bash
# WhisperText 1-Command APK Build Script
echo "============================================="
echo "Building WhisperText Release APK"
echo "============================================="
flutter clean
flutter pub get
flutter build apk --release
echo "============================================="
echo "APK Built Successfully at:"
echo "build/app/outputs/flutter-apk/app-release.apk"
echo "============================================="
`
      );

      // Write Windows build script
      zip.file(
        'build_apk.bat',
        `@echo off
echo =============================================
echo Building WhisperText Release APK
echo =============================================
call flutter clean
call flutter pub get
call flutter build apk --release
echo =============================================
echo APK Built Successfully at:
echo build\\app\\outputs\\flutter-apk\\app-release.apk
echo =============================================
pause
`
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whisper_text_apk_source.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  const steps = [
    {
      title: 'Download & Extract the Full Flutter Project',
      description: 'Download the complete source code containing all Dart files, pubspec.yaml, SQLite database, FCM, and Android configurations.',
      code: '# Extract the downloaded zip:\nunzip whisper_text_apk_source.zip -d whisper_text\ncd whisper_text',
    },
    {
      title: 'Install Dependencies',
      description: 'Fetch the Flutter Riverpod, Firebase, sqflite, and crypto packages specified in pubspec.yaml.',
      code: 'flutter pub get',
    },
    {
      title: 'Link Your Firebase Project',
      description: 'Connect your Firebase project to automatically configure google-services.json for Android.',
      code: 'flutterfire configure',
    },
    {
      title: 'Compile the Release APK',
      description: 'Run the Flutter compiler to build the standalone, optimized production Android APK binary.',
      code: 'flutter build apk --release',
    },
    {
      title: 'Install or Distribute the APK',
      description: 'Your compiled APK is located in the build directory. Install it directly onto any connected Android phone or upload it to Google Drive.',
      code: '# Install directly onto connected Android device:\nflutter install\n\n# Or locate the compiled APK file:\nls -lh build/app/outputs/flutter-apk/app-release.apk',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono text-zinc-200">
      
      {/* Top Banner */}
      <div className="bg-[#141820] border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wider">HOW TO COMPILE THE ANDROID APK</h2>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                1-CLICK DOWNLOAD READY
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Building a native <code className="text-amber-300">.apk</code> binary requires the Android SDK and Java/Gradle toolchain (run on your machine or GitHub Actions).
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={downloading}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
        >
          <Download className="w-4 h-4" />
          <span>{downloading ? 'PACKAGING CODEBASE...' : 'DOWNLOAD READY-TO-BUILD PROJECT (.ZIP)'}</span>
        </button>
      </div>

      {/* Cloud Environment Notice */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 space-y-1">
          <p className="font-bold text-amber-300">Why can't this web browser tab directly output a compiled .apk file?</p>
          <p className="text-zinc-400 leading-relaxed">
            AI Studio runs a Node.js cloud sandbox without the 15GB+ Android NDK/SDK and Java Gradle daemon needed to sign Android binary packages. Everything is packaged in the <strong>.ZIP</strong> ready to compile on your machine or via a free CI/CD runner.
          </p>
        </div>
      </div>

      {/* Step-by-Step Compilation Guide */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>STEP-BY-STEP COMPILATION INSTRUCTIONS</span>
        </h3>

        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-[#12151C] border border-zinc-800 rounded-xl p-4 space-y-2 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span>{step.title}</span>
                </div>

                <button
                  onClick={() => handleCopy(step.code, idx)}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] flex items-center gap-1 border border-zinc-700"
                >
                  {copiedStep === idx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-zinc-400" />
                      <span>Copy Command</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 pl-7">{step.description}</p>

              <div className="bg-[#0A0C0F] border border-zinc-800/80 rounded-lg p-3 text-xs text-emerald-300 font-mono ml-7 overflow-x-auto">
                <pre>{step.code}</pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Free Cloud Build Option: GitHub Actions */}
      <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-5">
        <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>ALTERNATIVE: COMPILE FREE IN THE CLOUD USING GITHUB ACTIONS</span>
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed mb-3">
          If you do not have Flutter or Android Studio installed on your computer, you can push this project to GitHub. GitHub Actions will compile the APK for you in under 3 minutes and give you a direct download link.
        </p>

        <div className="bg-[#0A0C0F] border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-300 font-mono">
          <div className="text-zinc-500 mb-1"># File: .github/workflows/build_apk.yml</div>
          <pre>{`name: Build Android APK
on: [push, workflow_dispatch]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v3
        with:
          distribution: 'zulu'
          java-version: '17'
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.19.x'
      - run: flutter pub get
      - run: flutter build apk --release
      - uses: actions/upload-artifact@v4
        with:
          name: whisper-text-release-apk
          path: build/app/outputs/flutter-apk/app-release.apk`}</pre>
        </div>
      </div>

    </div>
  );
};
