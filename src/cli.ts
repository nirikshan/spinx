#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig, validateWorkspaces } from "./config.js";
import { DependencyGraph } from "./graph.js";
import { PackageResolver } from "./resolution.js";
import { TaskRunner } from "./tasks.js";
import { DependencyManager } from "./add.js";
import {
  getPackageVersion,
  validateSetup,
  getChangedFiles,
  mapFilesToWorkspaces,
  parseFilter,
} from "./utils.js";

const program = new Command();
const rootDir = process.cwd();

program
  .name("spinx")
  .description(
    "Minimal, fast monorepo manager with advanced dependency resolution"
  )
  .version(getPackageVersion(rootDir));

/**
 * spinx build
 */
program
  .command("build")
  .description("Build all workspaces in dependency order")
  .option("--since <ref>", "Only build changed workspaces since git ref")
  .option(
    "--filter <aliases>",
    "Comma-separated list of workspace aliases to build"
  )
  .action(async (options) => {
    try {
      await validateSetup(rootDir);
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);
      graph.printSummary();

      // Analyze packages and generate resolver
      const resolver = new PackageResolver(config, rootDir);
      await resolver.analyze();

      const runner = new TaskRunner(config, graph, resolver.getNodeOptions());

      let filter = parseFilter(options.filter);

      if (options.since) {
        const changedFiles = await getChangedFiles(options.since, rootDir);
        const changedWorkspaces = mapFilesToWorkspaces(
          changedFiles,
          config.workspace,
          rootDir
        );

        if (changedWorkspaces.length === 0) {
          console.log("\n✅ No changes detected. Nothing to build.\n");
          return;
        }

        const affected = graph.getAffected(changedWorkspaces);
        filter = Array.from(affected);
      }

      await runner.runAll("build", filter);
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx start
 */
program
  .command("start <workspace>")
  .description("Start a workspace in development mode")
  .option("--with-deps", "Start dependencies first")
  .action(async (workspace, options) => {
    try {
      await validateSetup(rootDir);
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);

      // Analyze packages and generate resolver
      const resolver = new PackageResolver(config, rootDir);
      await resolver.analyze();

      const runner = new TaskRunner(config, graph, resolver.getNodeOptions());
      await runner.runSingle(workspace, "start", options.withDeps);
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx live
 */
program
  .command("live")
  .description("Start all workspaces in production mode")
  .action(async () => {
    try {
      await validateSetup(rootDir);
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);

      // Analyze packages and generate resolver
      const resolver = new PackageResolver(config, rootDir);
      await resolver.analyze();

      const runner = new TaskRunner(config, graph, resolver.getNodeOptions());

      // First, ensure everything is built
      console.log("🏗️  Ensuring all workspaces are built...\n");
      await runner.runAll("build");

      // Then start production services
      console.log("\n🚀 Starting production services...\n");
      await runner.runAll("live");
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx add
 */
program
  .command("add <from> <to>")
  .description("Add a dependency (workspace-to-workspace or workspace-to-npm)")
  .option("-D, --dev", "Add as devDependency")
  .option("-E, --exact", "Install exact version")
  .option("-v, --version <version>", "Specific version to install")
  .action(async (from, to, options) => {
    try {
      await validateSetup(rootDir);
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);
      const manager = new DependencyManager(config, graph, rootDir);

      await manager.add(from, to, {
        dev: options.dev,
        exact: options.exact,
        version: options.version,
      });

      console.log(
        '💡 Tip: Run "spinx build" to rebuild affected workspaces.\n'
      );
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// yeslay xai hit the command of spinx comfig hai ta
program
  .command("run <commandName>")
  .description("Run a custom command for all workspaces")
  .option("--since <ref>", "Only run for changed workspaces since git ref")
  .option("--filter <aliases>", "Comma-separated list of workspace aliases")
  .option("<workspace>", "Run command for specific workspace only")
  .action(async (commandName, options) => {
    try {
      await validateSetup(rootDir);
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);

      // Analyze packages and generate resolver
      const resolver = new PackageResolver(config, rootDir);
      await resolver.analyze();

      const runner = new TaskRunner(config, graph, resolver.getNodeOptions());

      let filter = parseFilter(options.filter);

      if (options.since) {
        const changedFiles = await getChangedFiles(options.since, rootDir);
        const changedWorkspaces = mapFilesToWorkspaces(
          changedFiles,
          config.workspace,
          rootDir
        );

        if (changedWorkspaces.length === 0) {
          console.log(`\n✅ No changes detected. Nothing to ${commandName}.\n`);
          return;
        }

        const affected = graph.getAffected(changedWorkspaces);
        filter = Array.from(affected);
      }

      // Check if any workspace has this command
      console.log(config.workspace);
      const hasCommand = config.workspace.some(
        (ws) =>
          ws.command?.[commandName as keyof typeof ws.command] ||
          config.defaults?.[commandName as keyof typeof config.defaults]
      );

      if (!hasCommand) {
        console.error(
          `\n❌ Error: No workspace defines command "${commandName}"\n`
        );
        console.log("Available commands in your config:");
        const commands = new Set<string>();
        config.workspace.forEach((ws) => {
          if (ws.command) {
            Object.keys(ws.command).forEach((cmd) => commands.add(cmd));
          }
        });
        if (config.defaults) {
          Object.keys(config.defaults).forEach((cmd) => commands.add(cmd));
        }
        console.log(`  ${Array.from(commands).join(", ")}\n`);
        process.exit(1);
      }

      await runner.runAll(commandName as any, filter);
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx remove
 */
program
  .command("remove <from> <to>")
  .alias("rm")
  .description("Remove a dependency")
  .action(async (from, to) => {
    try {
      await validateSetup(rootDir);
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);
      const manager = new DependencyManager(config, graph, rootDir);

      await manager.remove(from, to);
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx graph
 */
program
  .command("graph")
  .description("Display dependency graph")
  .action(async () => {
    try {
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const graph = new DependencyGraph(config);
      graph.printSummary();

      console.log("📋 Workspace Details:\n");
      for (const alias of graph.getAllAliases()) {
        const deps = graph.getDependencies(alias);
        const dependents = graph.getDependents(alias);

        console.log(`   ${alias}`);
        if (deps.length > 0) {
          console.log(`      Dependencies: ${deps.join(", ")}`);
        }
        if (dependents.length > 0) {
          console.log(`      Dependents: ${dependents.join(", ")}`);
        }
        console.log();
      }
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx conflicts
 */
program
  .command("conflicts")
  .description("Show package version conflicts")
  .action(async () => {
    try {
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const resolver = new PackageResolver(config, rootDir);
      await resolver.analyze();

      const conflicts = resolver.getConflicts();

      if (conflicts.length === 0) {
        console.log("\n✅ No version conflicts detected!\n");
      } else {
        console.log(
          `\n⚠️  Found ${conflicts.length} package(s) with version conflicts:\n`
        );

        for (const conflict of conflicts) {
          console.log(`📦 ${conflict.packageName}`);
          for (const [version, workspaces] of conflict?.versions) {
            console.log(`   ${version}:`);
            for (const ws of workspaces) {
              console.log(`      - ${ws}`);
            }
          }
          console.log();
        }

        console.log(
          "💡 These conflicts will be automatically resolved at runtime using the custom resolver.\n"
        );
      }
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx explain
 */
program
  .command("explain <workspace> <package>")
  .description("Explain how a package is resolved for a workspace")
  .action(async (workspace, packageName) => {
    try {
      const config = await loadConfig(rootDir);
      validateWorkspaces(config);

      const resolver = new PackageResolver(config, rootDir);
      await resolver.analyze();

      resolver.explainResolution(workspace, packageName);
    } catch (error) {
      console.error(`\n❌ Error: ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

/**
 * spinx init
 */
program
  .command("init")
  .description("Initialize a new spinx monorepo")
  .action(async () => {
    console.log(`
╭─────────────────────────────────────╮
│  🚀 spinx Monorepo Initialization  │
╰─────────────────────────────────────╯

This command will help you set up a new monorepo.

📝 Create these files manually:

1. spinx.config.js - Main configuration
2. pnpm-workspace.yaml - Workspace definitions
3. package.json - Root package file

Example spinx.config.js:

module.exports = {
  manager: "pnpm",
  concurrency: 4,
  workspace: [
    {
      path: "./packages/utils",
      alias: "@utils",
      command: {
        build: "npm run build"
      }
    }
  ],
  defaults: {
    build: "npm run build",
    start: "npm run start"
  }
};

Example pnpm-workspace.yaml:

packages:
  - 'packages/*'
  - 'services/*'

After creating these files, run:
  pnpm install
  spinx build

📚 Full documentation: https://github.com/nirikshan/spinx
`);
  });

// Parse CLI arguments
program.parse();
