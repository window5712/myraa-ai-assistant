/**
 * Alya Local Filesystem Service
 * Provides secure, capability-based filesystem operations:
 * listing directories, reading documents, writing/updating files with verification,
 * renaming/moving, recursive file search, metadata inspection, and workspace analysis.
 */

import fs from "fs";
import path from "path";

export interface FileMetadata {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  extension: string;
  modifiedAt: string;
  createdAt: string;
  isReadable: boolean;
  isWritable: boolean;
}

export interface FileReadResult {
  success: boolean;
  filePath: string;
  fileName: string;
  extension: string;
  content?: string;
  sizeBytes?: number;
  lineCount?: number;
  mimeType?: string;
  error?: string;
}

export interface FileWriteResult {
  success: boolean;
  filePath: string;
  bytesWritten: number;
  verifiedOnDisk: boolean;
  previousContentPreserved?: boolean;
  backupPath?: string;
  error?: string;
}

class LocalFsService {
  /**
   * Resolves safe absolute path
   */
  public resolvePath(targetPath: string): string {
    if (!targetPath) return process.cwd();
    let resolved = path.normalize(targetPath);
    if (!path.isAbsolute(resolved)) {
      resolved = path.resolve(process.cwd(), resolved);
    }
    return resolved;
  }

  /**
   * Lists directory contents with metadata
   */
  public listDirectory(dirPath: string): { success: boolean; path: string; items: FileMetadata[]; error?: string } {
    try {
      const fullPath = this.resolvePath(dirPath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, path: fullPath, items: [], error: `Directory does not exist: ${fullPath}` };
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        return { success: false, path: fullPath, items: [], error: `Path is not a directory: ${fullPath}` };
      }

      const entries = fs.readdirSync(fullPath);
      const items: FileMetadata[] = [];

      for (const entry of entries) {
        try {
          const entryPath = path.join(fullPath, entry);
          const entryStat = fs.statSync(entryPath);
          items.push({
            name: entry,
            path: entryPath,
            isDirectory: entryStat.isDirectory(),
            sizeBytes: entryStat.isFile() ? entryStat.size : 0,
            extension: entryStat.isFile() ? path.extname(entry).toLowerCase() : "",
            modifiedAt: entryStat.mtime.toISOString(),
            createdAt: entryStat.birthtime.toISOString(),
            isReadable: true,
            isWritable: true,
          });
        } catch (_) {
          // Skip inaccessible entries
        }
      }

      // Sort: directories first, then files alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return { success: true, path: fullPath, items };
    } catch (err: any) {
      return { success: false, path: dirPath, items: [], error: err.message };
    }
  }

  /**
   * Reads file content with support for plain text, markdown, json, csv, and fallback text extractors
   */
  public readFile(filePath: string, maxBytes: number = 500_000): FileReadResult {
    try {
      const fullPath = this.resolvePath(filePath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, filePath: fullPath, fileName: path.basename(filePath), extension: "", error: `File not found: ${fullPath}` };
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        return { success: false, filePath: fullPath, fileName: path.basename(filePath), extension: "", error: `Target path is a directory, not a file: ${fullPath}` };
      }

      const ext = path.extname(fullPath).toLowerCase();
      const fileName = path.basename(fullPath);

      // Check binary extensions (images, video, audio)
      const mediaExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mp3", ".wav", ".ogg", ".zip", ".exe", ".dll"];
      if (mediaExts.includes(ext)) {
        return {
          success: true,
          filePath: fullPath,
          fileName,
          extension: ext,
          sizeBytes: stat.size,
          content: `[Binary/Media File: ${fileName} (${(stat.size / 1024).toFixed(1)} KB). Use openMediaFile to open or view.]`,
          mimeType: ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream"
        };
      }

      // Read text content
      const buffer = fs.readFileSync(fullPath);
      const isUtf8 = !buffer.includes(0);

      if (!isUtf8) {
        return {
          success: true,
          filePath: fullPath,
          fileName,
          extension: ext,
          sizeBytes: stat.size,
          content: `[Binary Document: ${fileName} (${(stat.size / 1024).toFixed(1)} KB)]`
        };
      }

      let content = buffer.toString("utf-8");
      if (content.length > maxBytes) {
        content = content.substring(0, maxBytes) + `\n\n[...Truncated. Total file size: ${(stat.size / 1024).toFixed(1)} KB]`;
      }

      const lines = content.split("\n").length;

      return {
        success: true,
        filePath: fullPath,
        fileName,
        extension: ext,
        content,
        sizeBytes: stat.size,
        lineCount: lines,
        mimeType: "text/plain"
      };
    } catch (err: any) {
      return { success: false, filePath, fileName: path.basename(filePath), extension: "", error: err.message };
    }
  }

  /**
   * Writes content to file, optionally preserving original backup, and verifies disk persistence.
   */
  public writeFile(filePath: string, content: string, preserveBackup: boolean = true): FileWriteResult {
    try {
      const fullPath = this.resolvePath(filePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let backupPath: string | undefined = undefined;
      let previousContentPreserved = false;

      if (fs.existsSync(fullPath) && preserveBackup) {
        try {
          const timestamp = Date.now();
          backupPath = `${fullPath}.${timestamp}.bak`;
          fs.copyFileSync(fullPath, backupPath);
          previousContentPreserved = true;
        } catch (_) {
          // Backup failed, proceed with write
        }
      }

      fs.writeFileSync(fullPath, content, "utf-8");

      // Disk verification step: ensure file exists and size matches written bytes
      const verifiedStat = fs.statSync(fullPath);
      const expectedBytes = Buffer.byteLength(content, "utf-8");
      const verifiedOnDisk = verifiedStat.isFile() && verifiedStat.size === expectedBytes;

      return {
        success: verifiedOnDisk,
        filePath: fullPath,
        bytesWritten: verifiedStat.size,
        verifiedOnDisk,
        previousContentPreserved,
        backupPath
      };
    } catch (err: any) {
      return {
        success: false,
        filePath,
        bytesWritten: 0,
        verifiedOnDisk: false,
        error: err.message
      };
    }
  }

  /**
   * Renames or moves a file/folder safely.
   */
  public moveOrRename(sourcePath: string, destPath: string): { success: boolean; source: string; destination: string; error?: string } {
    try {
      const src = this.resolvePath(sourcePath);
      const dest = this.resolvePath(destPath);

      if (!fs.existsSync(src)) {
        return { success: false, source: src, destination: dest, error: `Source path does not exist: ${src}` };
      }

      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(src, dest);
      return { success: true, source: src, destination: dest };
    } catch (err: any) {
      return { success: false, source: sourcePath, destination: destPath, error: err.message };
    }
  }

  /**
   * Recursively searches for files matching a pattern
   */
  public searchFiles(searchDir: string, pattern: string, maxResults: number = 50): { success: boolean; query: string; results: FileMetadata[]; error?: string } {
    try {
      const fullPath = this.resolvePath(searchDir);
      if (!fs.existsSync(fullPath)) {
        return { success: false, query: pattern, results: [], error: `Search directory does not exist: ${fullPath}` };
      }

      const lowerPattern = pattern.toLowerCase();
      const results: FileMetadata[] = [];

      const walk = (currentDir: string) => {
        if (results.length >= maxResults) return;
        let entries: string[] = [];
        try {
          entries = fs.readdirSync(currentDir);
        } catch (_) {
          return;
        }

        for (const entry of entries) {
          if (results.length >= maxResults) break;
          // Skip node_modules, .git, build directories
          if (["node_modules", ".git", "dist", "release", ".gemini", ".vscode"].includes(entry)) continue;

          const entryPath = path.join(currentDir, entry);
          try {
            const stat = fs.statSync(entryPath);
            if (entry.toLowerCase().includes(lowerPattern)) {
              results.push({
                name: entry,
                path: entryPath,
                isDirectory: stat.isDirectory(),
                sizeBytes: stat.isFile() ? stat.size : 0,
                extension: stat.isFile() ? path.extname(entry).toLowerCase() : "",
                modifiedAt: stat.mtime.toISOString(),
                createdAt: stat.birthtime.toISOString(),
                isReadable: true,
                isWritable: true
              });
            }

            if (stat.isDirectory()) {
              walk(entryPath);
            }
          } catch (_) {}
        }
      };

      walk(fullPath);
      return { success: true, query: pattern, results };
    } catch (err: any) {
      return { success: false, query: pattern, results: [], error: err.message };
    }
  }

  /**
   * Analyzes project workspace structure & key technology files
   */
  public analyzeWorkspace(workspacePath: string): {
    success: boolean;
    path: string;
    projectType: string;
    keyFiles: string[];
    structure: string[];
    error?: string;
  } {
    try {
      const fullPath = this.resolvePath(workspacePath);
      const list = this.listDirectory(fullPath);
      if (!list.success) {
        return { success: false, path: fullPath, projectType: "Unknown", keyFiles: [], structure: [], error: list.error };
      }

      const names = list.items.map((i) => i.name);
      let projectType = "Generic Directory";

      if (names.includes("package.json")) {
        projectType = "Node.js / TypeScript Web App";
      } else if (names.includes("requirements.txt") || names.includes("pyproject.toml")) {
        projectType = "Python Project";
      } else if (names.includes("Cargo.toml")) {
        projectType = "Rust Project";
      } else if (names.includes("pom.xml") || names.includes("build.gradle")) {
        projectType = "Java / Kotlin Project";
      }

      const keyFileNames = ["package.json", "tsconfig.json", "README.md", ".env", "vite.config.ts", "server.ts", "electron"];
      const keyFiles = list.items.filter((i) => keyFileNames.includes(i.name)).map((i) => i.name);
      const structure = list.items.map((i) => `${i.isDirectory ? "[DIR]" : "[FILE]"} ${i.name}`);

      return {
        success: true,
        path: fullPath,
        projectType,
        keyFiles,
        structure
      };
    } catch (err: any) {
      return { success: false, path: workspacePath, projectType: "Unknown", keyFiles: [], structure: [], error: err.message };
    }
  }
}

export const localFsService = new LocalFsService();
