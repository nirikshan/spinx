import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { createRequire } from "module";
import type {
  spinxConfig,
  ResolutionMap,
  ConflictInfo,
  PackageJson,
} from "../types.js";

export class PackageResolver {
  private config: spinxConfig;
  private resolutionMap: ResolutionMap = {};
  private conflicts: ConflictInfo[] = [];
  private rootDir: string;

  constructor(config: spinxConfig, rootDir: string = process.cwd()) {
    this.config = config;
    this.rootDir = rootDir;
  }

  /**
   * Analyze all workspaces and build resolution map
   */
  async analyze(): Promise<void> {
    console.log("🔍 Analyzing package versions across workspaces...\n");

    const allPackages = new Map<string, Map<string, string[]>>();

    // Collect all package versions from each workspace
    for (const workspace of this.config.workspace) {
      const alias = workspace.alias || workspace.path;
      const pkgJsonPath = join(workspace.path, "package.json");

      if (!existsSync(pkgJsonPath)) {
        console.warn(`⚠️  No package.json found in ${workspace.path}`);
        continue;
      }

      const pkgJson: PackageJson = JSON.parse(
        readFileSync(pkgJsonPath, "utf-8")
      );
      this.resolutionMap[alias] = {};

      const allDeps = {
        ...pkgJson.dependencies,
        ...pkgJson.devDependencies,
      };

      for (const [pkgName, versionRange] of Object.entries(allDeps || {})) {
        // Skip workspace protocol
        if (versionRange.startsWith("workspace:")) continue;

        // Resolve actual installed version
        const resolvedVersion = this.resolveInstalledVersion(
          workspace.path,
          pkgName,
          versionRange
        );

        if (resolvedVersion) {
          this.resolutionMap[alias][pkgName] = {
            version: resolvedVersion.version,
            resolvedPath: resolvedVersion.path,
          };

          // Track for conflict detection
          if (!allPackages.has(pkgName)) {
            allPackages.set(pkgName, new Map());
          }
          const versionMap = allPackages.get(pkgName)!;
          if (!versionMap.has(resolvedVersion.version)) {
            versionMap.set(resolvedVersion.version, []);
          }
          versionMap.get(resolvedVersion.version)!.push(alias);
        }
      }
    }

    // Detect conflicts (same package, different versions)
    for (const [pkgName, versionMap] of allPackages) {
      if (versionMap.size > 1) {
        this.conflicts.push({
          packageName: pkgName,
          versions: versionMap,
        });
      }
    }

    this.printConflicts();
    await this.saveResolutionMap();
    await this.generateResolverHook();
  }

  /**
   * Resolve the actual installed version and path of a package
   */
  private resolveInstalledVersion(
    workspacePath: string,
    packageName: string,
    versionRange: string
  ): { version: string; path: string } | null {
    try {
      // Create a require function from the workspace context
      const workspaceRequire = createRequire(
        join(workspacePath, "package.json")
      );

      // Resolve the package
      const resolvedPath = workspaceRequire.resolve(packageName);

      // Find the package.json for this resolved package
      let currentPath = resolvedPath;
      while (currentPath !== dirname(currentPath)) {
        const pkgPath = join(currentPath, "package.json");
        if (existsSync(pkgPath)) {
          const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
          if (pkg.name === packageName) {
            return {
              version: pkg.version || "unknown",
              path: dirname(pkgPath),
            };
          }
        }
        currentPath = dirname(currentPath);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Print conflicts in a readable format
   */
  private printConflicts(): void {
    if (this.conflicts.length === 0) {
      console.log("✅ No version conflicts detected!\n");
      return;
    }

    console.log("⚠️  Version Conflicts Detected:\n");

    for (const conflict of this.conflicts) {
      console.log(`📦 ${conflict.packageName}`);
      for (const [version, workspaces] of conflict.versions) {
        console.log(`   ${version}: ${workspaces.join(", ")}`);
      }
      console.log();
    }

    console.log(
      "💡 Conflicts will be resolved automatically using custom resolver.\n"
    );
  }

  /**
   * Get conflicts for external display (e.g., TUI)
   */
  getConflicts(): ConflictInfo[] {
    return this.conflicts;
  }

  /**
   * Save resolution map to disk
   */
  private async saveResolutionMap(): Promise<void> {
    const spinxDir = join(this.rootDir, ".spinx");
    mkdirSync(spinxDir, { recursive: true });

    const resolutionPath = join(spinxDir, "resolutions.json");
    writeFileSync(resolutionPath, JSON.stringify(this.resolutionMap, null, 2));

    console.log(`💾 Resolution map saved to .spinx/resolutions.json`);
  }

  /**
   * Generate resolver hook for runtime resolution
   */
  private async generateResolverHook(): Promise<void> {
    const spinxDir = join(this.rootDir, ".spinx");
    const hookPath = join(spinxDir, "resolver.js");

    const hookCode = `
// Auto-generated by spinx - DO NOT EDIT
const { readFileSync } = require('fs');
const { join, dirname } = require('path');
const Module = require('module');

// Load resolution map
const resolutionsPath = join(__dirname, 'resolutions.json');
let resolutions = {};

try {
  resolutions = JSON.parse(readFileSync(resolutionsPath, 'utf-8'));
} catch (err) {
  console.warn('⚠️  Could not load resolutions.json:', err.message);
}

// Store original resolve
const originalResolve = Module._resolveFilename;

// Custom resolver
Module._resolveFilename = function(request, parent, isMain, options) {
  // Fast path: ignore node built-ins and relative/absolute paths
  if (request.startsWith('.') || request.startsWith('/') || request.startsWith('node:')) {
    return originalResolve.call(this, request, parent, isMain, options);
  }

  // Determine which workspace the caller belongs to
  const callerPath = parent?.filename || process.cwd();
  const workspace = findWorkspace(callerPath);

  if (workspace && resolutions[workspace]) {
    // Extract package name (handle scoped packages)
    const pkgName = request.startsWith('@') 
      ? request.split('/').slice(0, 2).join('/')
      : request.split('/')[0];

    const resolution = resolutions[workspace][pkgName];
    
    if (resolution) {
      // Use the resolved path for this workspace
      const subPath = request.slice(pkgName.length);
      const resolvedRequest = resolution.resolvedPath + subPath;
      
      try {
        return originalResolve.call(this, resolvedRequest, parent, isMain, options);
      } catch (err) {
        // Fallback to original resolution
      }
    }
  }

  // Default resolution
  return originalResolve.call(this, request, parent, isMain, options);
};

// Helper: Find which workspace a path belongs to
const workspaceRoots = ${JSON.stringify(
      this.config.workspace.map((ws) => ({
        alias: ws.alias || ws.path,
        path: ws.path,
      }))
    )};

function findWorkspace(filePath) {
  for (const ws of workspaceRoots) {
    if (filePath.startsWith(ws.path)) {
      return ws.alias;
    }
  }
  return null;
}

console.log('✅ spinx resolver hook loaded');
`;

    writeFileSync(hookPath, hookCode);
    console.log(`🔧 Resolver hook generated at .spinx/resolver.js\n`);
  }

  /**
   * Get NODE_OPTIONS for running with resolver
   */
  getNodeOptions(): string {
    const hookPath = join(this.rootDir, ".spinx", "resolver.js");
    return `--require ${hookPath}`;
  }

  /**
   * Explain resolution for a specific package and workspace
   */
  explainResolution(workspace: string, packageName: string): void {
    console.log(`\n🔍 Resolution for ${packageName} in ${workspace}:\n`);

    const resolution = this.resolutionMap[workspace]?.[packageName];

    if (!resolution) {
      console.log(`   ❌ Package not found in ${workspace}`);
      return;
    }

    console.log(`   Version: ${resolution.version}`);
    console.log(`   Path: ${resolution.resolvedPath}`);

    // Check if there are conflicts
    const conflict = this.conflicts.find((c) => c.packageName === packageName);
    if (conflict) {
      console.log(`\n   ⚠️  Conflict detected:`);
      for (const [version, workspaces] of conflict.versions) {
        const marker = version === resolution.version ? "→" : " ";
        console.log(`   ${marker} ${version}: ${workspaces.join(", ")}`);
      }
    } else {
      console.log(`\n   ✅ No conflicts (all workspaces use same version)`);
    }
    console.log();
  }
}
