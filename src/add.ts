import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execa } from "execa";
import type { spinxConfig, PackageJson } from "../types.js";
import { DependencyGraph } from "./graph.js";

export class DependencyManager {
  private config: spinxConfig;
  private graph: DependencyGraph;
  private rootDir: string;

  constructor(config: spinxConfig, graph: DependencyGraph, rootDir: string) {
    this.config = config;
    this.graph = graph;
    this.rootDir = rootDir;
  }

  /**
   * Add a dependency (workspace-to-workspace or workspace-to-npm)
   */
  async add(
    from: string,
    to: string,
    options: {
      dev?: boolean;
      exact?: boolean;
      version?: string;
    } = {}
  ): Promise<void> {
    // Check if 'from' workspace exists
    if (!this.graph.has(from)) {
      throw new Error(`Workspace not found: ${from}`);
    }

    const fromWorkspace = this.graph.getWorkspace(from)!;

    // Determine if 'to' is a workspace or npm package
    if (this.graph.has(to)) {
      // Workspace-to-workspace
      await this.addWorkspaceDependency(fromWorkspace, to, options.dev);
    } else {
      // Workspace-to-npm
      await this.addNpmDependency(fromWorkspace, to, options);
    }
  }

  /**
   * Add a workspace-to-workspace dependency
   */
  private async addWorkspaceDependency(
    fromWorkspace: spinxConfig["workspace"][0],
    toAlias: string,
    isDev: boolean = false
  ): Promise<void> {
    console.log(
      `\n🔗 Linking ${fromWorkspace.alias || fromWorkspace.path} → ${toAlias}\n`
    );

    // 1. Update spinx.config.js
    await this.updatespinxConfig(
      fromWorkspace.alias || fromWorkspace.path,
      toAlias
    );

    // 2. Update package.json
    const pkgJsonPath = join(fromWorkspace.path, "package.json");
    const pkgJson: PackageJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

    const depType = isDev ? "devDependencies" : "dependencies";
    if (!pkgJson[depType]) {
      pkgJson[depType] = {};
    }

    pkgJson[depType]![toAlias] = "workspace:*";

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
    console.log(`   ✓ Updated ${fromWorkspace.path}/package.json`);

    // 3. Run pnpm install
    console.log(`\n📦 Running pnpm install...\n`);
    await execa("pnpm", ["install"], {
      cwd: this.rootDir,
      stdio: "inherit",
    });

    console.log(
      `\n✅ Successfully linked ${fromWorkspace.alias} → ${toAlias}\n`
    );
  }

  /**
   * Add an npm package dependency
   */
  private async addNpmDependency(
    workspace: spinxConfig["workspace"][0],
    packageName: string,
    options: { dev?: boolean; exact?: boolean; version?: string }
  ): Promise<void> {
    console.log(
      `\n📦 Adding ${packageName} to ${workspace.alias || workspace.path}\n`
    );

    const args = ["add"];

    // Add package with version if specified
    const pkgSpec = options.version
      ? `${packageName}@${options.version}`
      : packageName;
    args.push(pkgSpec);

    // Add flags
    if (options.dev) args.push("--save-dev");
    if (options.exact) args.push("--save-exact");

    // Use pnpm filter to install only in specific workspace
    args.unshift("--filter", workspace.alias || workspace.path);

    console.log(`   Running: pnpm ${args.join(" ")}\n`);

    await execa("pnpm", args, {
      cwd: this.rootDir,
      stdio: "inherit",
    });

    console.log(
      `\n✅ Successfully added ${packageName} to ${workspace.alias}\n`
    );
  }

  /**
   * Update spinx.config.js to add dependency
   */
  private async updatespinxConfig(
    fromAlias: string,
    toAlias: string
  ): Promise<void> {
    const configPath = join(this.rootDir, "spinx.config.js");
    let configContent = readFileSync(configPath, "utf-8");

    // Find the workspace object and add to dependsOn
    // This is a simple regex-based approach
    // For production, consider using an AST parser like @babel/parser

    const workspaceRegex = new RegExp(
      `(\\{[^}]*alias:\\s*['"]${fromAlias}['"][^}]*)(dependsOn:\\s*\\[)([^\\]]*)(\\])`,
      "s"
    );

    if (workspaceRegex.test(configContent)) {
      // dependsOn exists, add to it
      configContent = configContent.replace(
        workspaceRegex,
        (match, before, depOn, deps, close) => {
          const depsList = deps
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
          const depString = `"${toAlias}"`;

          if (!depsList.includes(depString)) {
            depsList.push(depString);
          }

          return `${before}${depOn}${depsList.join(", ")}${close}`;
        }
      );
    } else {
      // dependsOn doesn't exist, add it
      const addDepOnRegex = new RegExp(
        `(\\{[^}]*alias:\\s*['"]${fromAlias}['"][^}]*)(,?\\s*command:)`,
        "s"
      );

      configContent = configContent.replace(
        addDepOnRegex,
        `$1,\n      dependsOn: ["${toAlias}"]$2`
      );
    }

    writeFileSync(configPath, configContent);
    console.log(`   ✓ Updated spinx.config.js`);
  }

  /**
   * Remove a dependency
   */
  async remove(from: string, to: string): Promise<void> {
    console.log(`\n🗑️  Removing ${to} from ${from}\n`);

    const workspace = this.graph.getWorkspace(from);
    if (!workspace) {
      throw new Error(`Workspace not found: ${from}`);
    }

    if (this.graph.has(to)) {
      // Remove workspace dependency
      await this.removeWorkspaceDependency(workspace, to);
    } else {
      // Remove npm dependency
      await this.removeNpmDependency(workspace, to);
    }
  }

  /**
   * Remove workspace dependency
   */
  private async removeWorkspaceDependency(
    workspace: spinxConfig["workspace"][0],
    toAlias: string
  ): Promise<void> {
    // Update package.json
    const pkgJsonPath = join(workspace.path, "package.json");
    const pkgJson: PackageJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

    if (pkgJson.dependencies?.[toAlias]) {
      delete pkgJson.dependencies[toAlias];
    }
    if (pkgJson.devDependencies?.[toAlias]) {
      delete pkgJson.devDependencies[toAlias];
    }

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
    console.log(`   ✓ Updated package.json`);

    // Update spinx.config.js
    const configPath = join(this.rootDir, "spinx.config.js");
    let configContent = readFileSync(configPath, "utf-8");

    const fromAlias = workspace.alias || workspace.path;
    const workspaceRegex = new RegExp(
      `(\\{[^}]*alias:\\s*['"]${fromAlias}['"][^}]*dependsOn:\\s*\\[)([^\\]]*)(\\])`,
      "s"
    );

    configContent = configContent.replace(
      workspaceRegex,
      (match, before, deps, close) => {
        const depsList = deps
          .split(",")
          .map((s: string) => s.trim())
          .filter((d: string) => d && !d.includes(toAlias));

        return `${before}${depsList.join(", ")}${close}`;
      }
    );

    writeFileSync(configPath, configContent);
    console.log(`   ✓ Updated spinx.config.js`);

    console.log(`\n✅ Removed dependency\n`);
  }

  /**
   * Remove npm dependency
   */
  private async removeNpmDependency(
    workspace: spinxConfig["workspace"][0],
    packageName: string
  ): Promise<void> {
    await execa(
      "pnpm",
      ["remove", "--filter", workspace.alias || workspace.path, packageName],
      {
        cwd: this.rootDir,
        stdio: "inherit",
      }
    );

    console.log(`\n✅ Removed ${packageName}\n`);
  }
}
