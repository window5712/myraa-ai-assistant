// Alya AI Assistant — Preload Bridge (Secure Context Isolation)
// Safely exposes capability APIs to the renderer without exposing raw Node or shell.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:maximize-toggle"),
  close: () => ipcRenderer.send("window:close"),
  togglePin: () => ipcRenderer.send("window:toggle-pin"),

  // Link opener
  openExternal: (url) => ipcRenderer.send("link:open-external", url),

  // Maximize state listener
  onMaximizedChange: (callback) => {
    const handler = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximized", handler);
    return () => ipcRenderer.removeListener("window:maximized", handler);
  },

  // Desktop Auto-Start with Windows
  getAutoStart: () => ipcRenderer.invoke("settings:get-autostart"),
  setAutoStart: (enable) => ipcRenderer.invoke("settings:set-autostart", enable),

  // Media & App Launching
  openDefaultMedia: (filePath) => ipcRenderer.invoke("media:open-default", filePath),
  launchApp: (appName, targetFile) => ipcRenderer.invoke("app:launch", { appName, targetFile }),

  // System Diagnostics
  getSystemDiagnostics: () => ipcRenderer.invoke("system:diagnostics"),

  // Tray Event Listeners
  onTrayAction: (callback) => {
    const handler = (_event, action, data) => callback(action, data);
    ipcRenderer.on("tray:action", handler);
    return () => ipcRenderer.removeListener("tray:action", handler);
  },
  onOpenDiagnostics: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("tray:open-diagnostics", handler);
    return () => ipcRenderer.removeListener("tray:open-diagnostics", handler);
  },
  onToggleProactive: (callback) => {
    const handler = (_event, isPaused) => callback(isPaused);
    ipcRenderer.on("tray:toggle-proactive", handler);
    return () => ipcRenderer.removeListener("tray:toggle-proactive", handler);
  }
});
