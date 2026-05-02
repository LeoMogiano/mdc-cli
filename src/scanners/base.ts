import { ToolReport } from "../models/scan.js";

export interface Scanner {
  scan(): Promise<ToolReport>;
}
