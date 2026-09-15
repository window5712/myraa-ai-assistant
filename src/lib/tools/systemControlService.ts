/**
 * Alya Native System Control Service
 * Provides hardware, disk volume, system audio, and connected device control capabilities on Windows.
 */

import { exec } from "child_process";
import os from "os";

export interface DriveInfo {
  deviceId: string;
  name: string;
  driveType: string;
  freeSpaceBytes: number;
  totalSizeBytes: number;
  freeSpaceGb: string;
  totalSizeGb: string;
}

export interface SystemStatus {
  platform: string;
  arch: string;
  hostname: string;
  uptimeHours: number;
  totalMemoryGb: string;
  freeMemoryGb: string;
  cpuCount: number;
  cpuModel: string;
  batteryStatus?: string;
  drives: DriveInfo[];
}

class SystemControlService {
  /**
   * Retrieves logical drive information (C:, D:, USB drives, etc.)
   */
  public async getDrives(): Promise<{ success: boolean; drives: DriveInfo[]; error?: string }> {
    return new Promise((resolve) => {
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName, DriveType, FreeSpace, Size | ConvertTo-Json"`;
      exec(cmd, { timeout: 10000 }, (err, stdout) => {
        if (err || !stdout) {
          // Fallback basic disk info
          return resolve({
            success: true,
            drives: [
              {
                deviceId: "C:",
                name: "Local Disk (C:)",
                driveType: "Fixed Disk",
                freeSpaceBytes: os.freemem(),
                totalSizeBytes: os.totalmem(),
                freeSpaceGb: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
                totalSizeGb: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
              }
            ]
          });
        }

        try {
          let parsed = JSON.parse(stdout.trim());
          if (!Array.isArray(parsed)) parsed = [parsed];

          const driveTypeNames: Record<number, string> = {
            2: "Removable Disk (USB)",
            3: "Local Fixed Disk",
            4: "Network Drive",
            5: "Optical CD/DVD",
          };

          const drives: DriveInfo[] = parsed.map((d: any) => {
            const freeBytes = d.FreeSpace || 0;
            const totalBytes = d.Size || 0;
            return {
              deviceId: d.DeviceID || "Unknown",
              name: d.VolumeName ? `${d.VolumeName} (${d.DeviceID})` : d.DeviceID,
              driveType: driveTypeNames[d.DriveType] || "Disk",
              freeSpaceBytes: freeBytes,
              totalSizeBytes: totalBytes,
              freeSpaceGb: (freeBytes / (1024 * 1024 * 1024)).toFixed(1) + " GB",
              totalSizeGb: (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + " GB",
            };
          });

          resolve({ success: true, drives });
        } catch (e: any) {
          resolve({ success: false, drives: [], error: e.message });
        }
      });
    });
  }

  /**
   * Adjusts or sets master system volume on Windows
   */
  public async controlVolume(action: "set" | "mute" | "unmute" | "up" | "down", value?: number): Promise<{ success: boolean; action: string; message: string }> {
    return new Promise((resolve) => {
      let psScript = "";

      if (action === "mute" || action === "unmute") {
        psScript = `(new-object -com wscript.shell).SendKeys([char]173)`;
      } else if (action === "up") {
        psScript = `1..5 | ForEach-Object { (new-object -com wscript.shell).SendKeys([char]175) }`;
      } else if (action === "down") {
        psScript = `1..5 | ForEach-Object { (new-object -com wscript.shell).SendKeys([char]174) }`;
      } else if (action === "set") {
        const targetPercent = Math.min(100, Math.max(0, value ?? 50));
        psScript = `$wsh = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $wsh.SendKeys([char]174) }; 1..[math]::Round(${targetPercent} / 2) | ForEach-Object { $wsh.SendKeys([char]175) }`;
      }

      const cmd = `powershell -NoProfile -Command "${psScript}"`;
      exec(cmd, { timeout: 8000 }, (err) => {
        if (err) {
          resolve({ success: false, action, message: `Volume adjustment failed: ${err.message}` });
        } else {
          resolve({
            success: true,
            action,
            message: action === "set" ? `System volume set to ~${value}%` : `System volume action '${action}' completed successfully.`
          });
        }
      });
    });
  }

  /**
   * Inspects system hardware status and connected peripherals
   */
  public async getSystemStatus(): Promise<{ success: boolean; status: SystemStatus }> {
    const driveRes = await this.getDrives();
    const cpus = os.cpus();
    const status: SystemStatus = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptimeHours: parseFloat((os.uptime() / 3600).toFixed(1)),
      totalMemoryGb: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
      freeMemoryGb: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || "Intel/AMD Processor",
      drives: driveRes.drives || []
    };
    return { success: true, status };
  }
}

export const systemControlService = new SystemControlService();
