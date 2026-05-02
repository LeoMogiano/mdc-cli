export enum RiskLevel {
  Green = "green",
  Yellow = "yellow",
}

export enum Tool {
  Xcode = "xcode",
  Android = "android",
}

export enum Category {
  // Xcode
  DerivedData = "derived_data",
  XcodeCaches = "xcode_caches",
  XcodeArchives = "xcode_archives",
  IosDeviceSupport = "ios_device_support",
  IosSimulators = "ios_simulators",
  IosRuntimes = "ios_runtimes",
  XcodePreviews = "xcode_previews",
  CocoaPods = "cocoapods",
  Carthage = "carthage",
  Fastlane = "fastlane",
  // Android
  GradleCaches = "gradle_caches",
  GradleDeps = "gradle_deps",
  GradleDaemon = "gradle_daemon",
  GradleJdks = "gradle_jdks",
  GradleWrappers = "gradle_wrappers",
  KotlinDaemon = "kotlin_daemon",
  AndroidCaches = "android_caches",
  AndroidAvds = "android_avds",
  AndroidSdk = "android_sdk",
  AndroidSdkSystemImages = "android_sdk_system_images",
  AndroidSdkVersioned = "android_sdk_versioned",
  AndroidSdkBinaries = "android_sdk_binaries",
  AndroidSdkAux = "android_sdk_aux",
  AndroidStudioOrphan = "android_studio_orphan",
}

export enum ExecutionKind {
  Remove = "remove",
  CliCommand = "cli_command",
  ContainerAction = "container_action",
}

export type ContainerActionKind = "soft_clean" | "reset" | "delete";
