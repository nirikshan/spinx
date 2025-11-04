import { execa } from "execa";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Get changed files since a git ref
 */
export async function getChangedFiles(
  since: string,
  rootDir: string
): Promise<string[]> {
  try {
    const { stdout } = await execa(
      "git",
      ["diff", "--name-only", `${since}...HEAD`],
      {
        cwd: rootDir,
      }
    );
    return stdout.split("\n").filter(Boolean);
  } catch (error) {
    throw new Error(`Failed to get git diff: ${(error as Error).message}`);
  }
}

/**
 * Map changed files to workspace aliases
 */
export function mapFilesToWorkspaces(
  changedFiles: string[],
  workspaces: Array<{ path: string; alias?: string }>,
  rootDir: string
): string[] {
  const changedWorkspaces = new Set<string>();

  for (const file of changedFiles) {
    const absolutePath = join(rootDir, file);

    for (const ws of workspaces) {
      if (absolutePath.startsWith(ws.path)) {
        changedWorkspaces.add(ws.alias || ws.path);
        break;
      }
    }
  }

  return Array.from(changedWorkspaces);
}

/**
 * Get package version from package.json
 */
export function getPackageVersion(rootDir: string): string {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    return "0.0.0";
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Check if pnpm is installed
 */
export async function checkPnpmInstalled(): Promise<boolean> {
  try {
    await execa("pnpm", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate project setup
 */
export async function validateSetup(rootDir: string): Promise<void> {
  // Check for pnpm
  const hasPnpm = await checkPnpmInstalled();
  if (!hasPnpm) {
    throw new Error(
      "pnpm is not installed. Please install it: npm install -g pnpm"
    );
  }

  // Check for spinx.config.js
  const configPath = join(rootDir, "spinx.config.js");
  if (!existsSync(configPath)) {
    throw new Error("spinx.config.js not found in project root");
  }

  // Check for pnpm-workspace.yaml
  const workspacePath = join(rootDir, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    console.warn(
      "⚠️  pnpm-workspace.yaml not found. Make sure to create it for proper workspace management."
    );
  }
}

/**
 * Parse filter argument
 */
export function parseFilter(
  filterArg: string | undefined
): string[] | undefined {
  if (!filterArg) return undefined;
  return filterArg
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}
