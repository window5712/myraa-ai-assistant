// Alya AI Agent — Electron main process (CommonJS)
// Native Desktop Shell & Runtime Architecture:
// Spawns production dist/server.cjs internally in-process without flashing console windows or requiring localhost dev servers.
// Manages system tray, auto-start with Windows, frameless window, screen sharing, and secure native IPC capability bridge.

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, session, nativeImage } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { exec } = require("child_process");

const PORT = 3000;
const APP_URL = `http://localhost:${PORT}`;
const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isProactivePaused = false;
let autoStartEnabled = false;

// ----------------------------------------------------------------------------
// 1. Production Server Bootstrapper
// ----------------------------------------------------------------------------
function startServer() {
  if (isDev) {
    console.log("[Alya Electron Main] Dev mode — using running dev server on port 3000");
    return;
  }

  const cwd = app.getAppPath();
  process.env.NODE_ENV = "production";

  try {
    const serverPath = path.join(cwd, "dist", "server.cjs");
    if (!fs.existsSync(serverPath)) {
      console.error("[Alya Electron Main] dist/server.cjs not found at", serverPath);
      return;
    }
    console.log("[Alya Electron Main] Loading production server bundle from", serverPath);
    require(serverPath);
  } catch (err) {
    console.error("[Alya Electron Main] Failed to start production server:", err);
  }
}

function stopServer() {
  // In-process server; process exit cleans up. Kept for lifecycle compatibility.
}

function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryReq = () => {
      const req = http.get(APP_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Server start timeout"));
        } else {
          setTimeout(tryReq, 350);
        }
      });
      req.setTimeout(1500, () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Server start timeout"));
        } else {
          setTimeout(tryReq, 350);
        }
      });
    };
    tryReq();
  });
}

// ----------------------------------------------------------------------------
// 2. Main Application Window Creation
// ----------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: "#020205",
    title: "Alya AI Agent — Windows Desktop Assistant",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "tray-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron Window] Failed to load ${validatedURL}: ${errorCode} (${errorDescription}). Retrying...`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(APP_URL);
      }
    }, 1000);
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      if (mainWindow) mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("maximize", () => mainWindow?.webContents.send("window:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window:maximized", false));
}

// ----------------------------------------------------------------------------
// 3. System Tray & Auto-Start Configuration
// ----------------------------------------------------------------------------
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Alya Desktop",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Always on Top",
      type: "checkbox",
      checked: mainWindow ? mainWindow.isAlwaysOnTop() : false,
      click: (item) => {
        if (mainWindow) mainWindow.setAlwaysOnTop(item.checked);
      },
    },
    {
      label: autoStartEnabled ? "Disable Start with Windows" : "Start Alya with Windows",
      type: "checkbox",
      checked: autoStartEnabled,
      click: (item) => {
        toggleAutoStart(item.checked);
      },
    },
    { type: "separator" },
    {
      label: isProactivePaused ? "Resume Proactive Questions" : "Pause Proactive Questions",
      click: () => {
        isProactivePaused = !isProactivePaused;
        mainWindow?.webContents.send("tray:toggle-proactive", isProactivePaused);
        updateTrayMenu();
      },
    },
    {
      label: "System Diagnostics",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("tray:open-diagnostics");
        }
      },
    },
    {
      label: "Toggle Developer Tools",
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.toggleDevTools();
        }
      },
    },
    {
      label: "Restart Local Agent",
      click: () => {
        mainWindow?.webContents.reload();
      },
    },
    { type: "separator" },
    {
      label: "Quit Alya",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  let iconPath = path.join(__dirname, "tray-icon.png");
  let trayImage;
  try {
    trayImage = nativeImage.createFromPath(iconPath);
    if (trayImage.isEmpty()) trayImage = nativeImage.createEmpty();
  } catch (e) {
    trayImage = nativeImage.createEmpty();
  }

  tray = new Tray(trayImage);
  tray.setToolTip("Alya AI Assistant — Active");

  updateTrayMenu();

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function toggleAutoStart(enable) {
  try {
    autoStartEnabled = enable;
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath,
      args: ["--autostart"]
    });
    updateTrayMenu();
  } catch (err) {
    console.error("[AutoStart Error]:", err.message);
  }
}

function checkAutoStartStatus() {
  try {
    const settings = app.getLoginItemSettings();
    autoStartEnabled = settings.openAtLogin;
  } catch (e) {
    autoStartEnabled = false;
  }
}

// ----------------------------------------------------------------------------
// 4. Native IPC Handlers
// ----------------------------------------------------------------------------
function registerIpc() {
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize-toggle", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("window:close", () => {
    if (mainWindow) mainWindow.close();
  });
  ipcMain.on("window:toggle-pin", () => {
    if (!mainWindow) return;
    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop());
    updateTrayMenu();
  });

  ipcMain.on("link:open-external", (_e, url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  // Settings & Desktop Auto-Start IPC
  ipcMain.handle("settings:get-autostart", () => {
    return autoStartEnabled;
  });

  ipcMain.handle("settings:set-autostart", (_e, enable) => {
    toggleAutoStart(enable);
    return autoStartEnabled;
  });

  // Shell open media or file with system default handler
  ipcMain.handle("media:open-default", async (_e, targetPath) => {
    try {
      if (!fs.existsSync(targetPath)) return { success: false, error: `File not found: ${targetPath}` };
      const err = await shell.openPath(targetPath);
      return { success: !err, error: err || null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Native application launcher
  ipcMain.handle("app:launch", async (_e, { appName, targetFile }) => {
    try {
      let cmd = targetFile ? `start "" "${appName}" "${targetFile}"` : `start "" "${appName}"`;
      return new Promise((resolve) => {
        exec(cmd, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true, appName });
        });
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Desktop System Diagnostics Status
  ipcMain.handle("system:diagnostics", async () => {
    return {
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      autoStartEnabled,
      isProactivePaused,
      memoryUsage: process.memoryUsage()
    };
  });
}

// ----------------------------------------------------------------------------
// 5. Screen Share Support
// ----------------------------------------------------------------------------
function configureScreenShare() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    callback({ usePicker: true });
  });
}

// ----------------------------------------------------------------------------
// Application Lifecycle Initialization
// ----------------------------------------------------------------------------
app.whenReady().then(async () => {
  checkAutoStartStatus();
  registerIpc();
  configureScreenShare();

  startServer();

  try {
    await waitForServer();
  } catch (err) {
    console.error("[Alya Boot Error]:", err.message);
  }

  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  // App continues running in background tray
});

app.on("before-quit", () => {
  isQuitting = true;
  stopServer();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopServer();
  process.exit(0);
});
