import { Category, Tool } from "../models/enums.js";
import { Dict } from "./i18n.js";

export function categoryLabel(cat: Category, d: Dict): string {
  switch (cat) {
    case Category.DerivedData: return d.catDerivedData;
    case Category.XcodeCaches: return d.catXcodeCaches;
    case Category.XcodeArchives: return d.catXcodeArchives;
    case Category.IosDeviceSupport: return d.catIosDeviceSupport;
    case Category.IosSimulators: return d.catIosSimulators;
    case Category.IosRuntimes: return d.catIosRuntimes;
    case Category.XcodePreviews: return d.catXcodePreviews;
    case Category.CocoaPods: return d.catCocoaPods;
    case Category.Carthage: return d.catCarthage;
    case Category.Fastlane: return d.catFastlane;
    case Category.GradleCaches: return d.catGradleCaches;
    case Category.GradleDeps: return d.catGradleDeps;
    case Category.GradleDaemon: return d.catGradleDaemon;
    case Category.GradleJdks: return d.catGradleJdks;
    case Category.GradleWrappers: return d.catGradleWrappers;
    case Category.KotlinDaemon: return d.catKotlinDaemon;
    case Category.AndroidCaches: return d.catAndroidCaches;
    case Category.AndroidAvds: return d.catAndroidAvds;
    case Category.AndroidSdk: return "SDK";
    case Category.AndroidSdkSystemImages: return d.catAndroidSdkSystemImages;
    case Category.AndroidSdkVersioned: return d.catAndroidSdkVersioned;
    case Category.AndroidSdkBinaries: return d.catAndroidSdkBinaries;
    case Category.AndroidSdkAux: return d.catAndroidSdkAux;
    case Category.AndroidStudioOrphan: return d.catAndroidStudioOrphan;
  }
}

export function toolLabel(tool: Tool, d: Dict): string {
  return tool === Tool.Xcode ? d.toolXcode : d.toolAndroid;
}

export const xcodeCategoriesOrder: readonly Category[] = [
  Category.DerivedData,
  Category.XcodeCaches,
  Category.IosSimulators,
  Category.IosRuntimes,
  Category.IosDeviceSupport,
  Category.XcodeArchives,
  Category.XcodePreviews,
  Category.CocoaPods,
  Category.Carthage,
  Category.Fastlane,
];

export const androidCategoriesOrder: readonly Category[] = [
  Category.GradleCaches,
  Category.GradleDeps,
  Category.GradleDaemon,
  Category.GradleJdks,
  Category.GradleWrappers,
  Category.KotlinDaemon,
  Category.AndroidCaches,
  Category.AndroidAvds,
  Category.AndroidSdkSystemImages,
  Category.AndroidSdkVersioned,
  Category.AndroidSdkBinaries,
  Category.AndroidSdkAux,
  Category.AndroidStudioOrphan,
];
