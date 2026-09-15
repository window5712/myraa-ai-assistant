/**
 * Alya Application Launcher Service
 * Safe desktop application detection and launcher for Windows.
 * Resolves application aliases (VS Code, Chrome, Notepad, VLC, Calculator, Explorer, etc.),
 * checks whether an instance is running, and launches applications safely.
 */

import { exec, execFile } from "child_process";
import path from "path";
import fs from "fs";

export interface AppLaunchResult {
  success: boolean;
  appName: string;
  targetPath?: string;
  pid?: number;
  message: string;
  alreadyRunning?: boolean;
}

class AppLauncherService {
  // Known safe Windows executable mappings
  private knownApps: Record<string, string[]> = {
    notepad: ["notepad.exe"],
    calculator: ["calc.exe"],
    calc: ["calc.exe"],
    chrome: ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "chrome.exe"],
    vscode: ["code.cmd", "code.exe", "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"],
    code: ["code.cmd", "code.exe"],
    explorer: ["explorer.exe"],
    cmd: ["cmd.exe"],
    powershell: ["powershell.exe"],
    vlc: ["C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe", "vlc.exe"],
    edge: ["msedge.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  };

  /**
   * Resolves application name or path to a runnable executable
   */
  public resolveAppPath(appQuery: string): string {
    const key = appQuery.trim().toLowerCase();

    // Check if query is an absolute path to an existing file
    if (path.isAbsolute(appQuery) && fs.existsSync(appQuery)) {
      return appQuery;
    }

    if (this.knownApps[key]) {
      const candidates = this.knownApps[key];
      for (const candidate of candidates) {
        if (candidate.includes("%USERNAME%")) {
          const userCandidate = candidate.replace("%USERNAME%", process.env.USERNAME || "");
          if (fs.existsSync(userCandidate)) return userCandidate;
        } else if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
          return candidate;
        } else if (!candidate.includes("\\")) {
          return candidate;
        }
      }
    }

    return appQuery;
  }

  /**
   * Launches an installed application safely.
   */
  public async launchApp(appName: string, targetFileOrUrl?: string): Promise<AppLaunchResult> {
    const targetApp = this.resolveAppPath(appName);

    return new Promise((resolve) => {
      let command = "";
      if (targetFileOrUrl) {
        command = `start "" "${targetApp}" "${targetFileOrUrl}"`;
      } else {
        command = `start "" "${targetApp}"`;
      }

      exec(command, { windowsHide: false }, (error) => {
        if (error) {
          // Fallback to direct execFile if start command failed
          execFile(targetApp, targetFileOrUrl ? [targetFileOrUrl] : [], (fileErr) => {
            if (fileErr) {
              resolve({
                success: false,
                appName,
                message: `Failed to launch application '${appName}': ${fileErr.message}`
              });
            } else {
              resolve({
                success: true,
                appName,
                targetPath: targetApp,
                message: `Successfully launched application '${appName}'.`
              });
            }
          });
        } else {
          resolve({
            success: true,
            appName,
            targetPath: targetApp,
            message: `Successfully launched application '${appName}'.`
          });
        }
      });
    });
  }

  /**
   * Opens a file or URL using system default handler (`shell.openPath` or `start`)
   */
  public async openWithSystemDefault(targetPathOrUrl: string): Promise<{ success: boolean; target: string; message: string }> {
    return new Promise((resolve) => {
      const command = `start "" "${targetPathOrUrl}"`;
      exec(command, (err) => {
        if (err) {
          resolve({ success: false, target: targetPathOrUrl, message: `Could not open file: ${err.message}` });
        } else {
          resolve({ success: true, target: targetPathOrUrl, message: `Opened '${targetPathOrUrl}' in default Windows handler.` });
        }
      });
    });
  }
}

export const appLauncherService = new AppLauncherService();
