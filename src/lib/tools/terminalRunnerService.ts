/**
 * Alya Controlled Terminal Runner Service
 * Safe command runner for dev & automation tasks.
 * Captures stdout/stderr, controls working directory, enforces timeouts, limits output size,
 * manages process cleanup, and flags high-risk destructive commands.
 */

import { exec } from "child_process";
import path from "path";

export interface TerminalExecutionResult {
  success: boolean;
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  isHighRisk?: boolean;
  requiresConfirmation?: boolean;
  error?: string;
}

class TerminalRunnerService {
  // High-risk patterns that require confirmation
  private highRiskPatterns = [
    /\brm\s+-rf\b/i,
    /\bformat\s+[c-z]:/i,
    /\bdel\s+\/[f|s|q]\b/i,
    /\brdir\s+\/s\b/i,
    /\bdrop\s+database\b/i,
    /\bdiskpart\b/i,
    /\bnetsh\s+firewall\b/i,
    /\breg\s+delete\b/i,
    /\bshutdown\b/i
  ];

  /**
   * Evaluates whether a command is high risk
   */
  public isHighRiskCommand(command: string): boolean {
    return this.highRiskPatterns.some((pattern) => pattern.test(command));
  }

  /**
   * Runs an approved shell command with timeout & output safety limits
   */
  public async executeCommand(
    command: string,
    cwd?: string,
    timeoutMs: number = 30000,
    confirmed: boolean = false
  ): Promise<TerminalExecutionResult> {
    const isHighRisk = this.isHighRiskCommand(command);

    if (isHighRisk && !confirmed) {
      return {
        success: false,
        command,
        cwd: cwd || process.cwd(),
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        isHighRisk: true,
        requiresConfirmation: true,
        error: `High-risk command detected: "${command}". Explicit user confirmation required before execution.`
      };
    }

    const workingDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = exec(
        command,
        {
          cwd: workingDir,
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024, // 2MB max output buffer
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const exitCode = error ? error.code || 1 : 0;

          // Limit output to prevent UI freeze (truncates huge output strings)
          let cleanStdout = stdout.trim();
          let cleanStderr = stderr.trim();

          const maxChars = 20000;
          if (cleanStdout.length > maxChars) {
            cleanStdout = cleanStdout.substring(0, maxChars) + `\n\n[...Stdout output truncated (${cleanStdout.length} total chars)]`;
          }

          if (cleanStderr.length > maxChars) {
            cleanStderr = cleanStderr.substring(0, maxChars) + `\n\n[...Stderr output truncated (${cleanStderr.length} total chars)]`;
          }

          if (error && error.killed) {
            resolve({
              success: false,
              command,
              cwd: workingDir,
              exitCode: -1,
              stdout: cleanStdout,
              stderr: `Execution timed out after ${timeoutMs}ms. Process terminated.`,
              durationMs,
              error: `Command timed out after ${timeoutMs}ms.`
            });
            return;
          }

          resolve({
            success: exitCode === 0,
            command,
            cwd: workingDir,
            exitCode,
            stdout: cleanStdout,
            stderr: cleanStderr,
            durationMs,
            error: error ? error.message : undefined
          });
        }
      );
    });
  }
}

export const terminalRunnerService = new TerminalRunnerService();
