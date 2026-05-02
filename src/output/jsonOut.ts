import { ScanResult } from "../models/scan.js";

export function scanResultToJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
