import { execa } from "execa";
import pLimit from "p-limit";
import kleur from "kleur";
import type { spinxConfig, TaskResult } from "../types";
import { DependencyGraph } from "./graph";
import { getCommand } from "./config";

export class TaskRunner {
  private config: spinxConfig;
  private graph: DependencyGraph;
  private nodeOptions: string;

  constructor(
    config: spinxConfig,
    graph: DependencyGraph,
    nodeOptions: string = ""
  ) {
    this.config = config;
    this.graph = graph;
    this.nodeOptions = nodeOptions;
  }

  /**
   * Run a command for all workspaces in parallel batches
   */
  async runAll(
    commandType: string,
    filter?: string[]
  ): Promise<Map<string, TaskResult>> {
    const batches = this.graph.getParallelBatches();
    const results = new Map<string, TaskResult>();
    const concurrency = this.config.concurrency || this.config.workspace.length;

    console.log(`\n🚀 Running ${commandType} for all workspaces...\n`);

    for (let i = 0; i < batches.length; i++) {
      console.log(`📦 Batch ${i + 1}/${batches.length}:`);

      let batch = batches[i];

      // Apply filter if provided
      if (filter) {
        batch = batch.filter((alias) => filter.includes(alias));
      }

      if (batch.length === 0) continue;

      const batchResults = await this.runBatch(batch, commandType, concurrency);

      // Merge results
      for (const [alias, result] of batchResults) {
        results.set(alias, result);
      }

      // Check for failures
      const failed = Array.from(batchResults.values()).filter(
        (r) => !r.success
      );
      if (failed.length > 0) {
        console.log(`\n❌ Batch ${i + 1} had failures. Stopping.\n`);
        throw new Error(`Failed to run ${commandType}`);
      }

      console.log(); // Empty line between batches
    }

    this.printSummary(results);
    return results;
  }

  /**
   * Run a batch of workspaces in parallel
   */
  private async runBatch(
    aliases: string[],
    commandType: string,
    concurrency: number
  ): Promise<Map<string, TaskResult>> {
    const limit = pLimit(concurrency);
    const results = new Map<string, TaskResult>();

    const tasks = aliases.map((alias) =>
      limit(async () => {
        const result = await this.runTask(alias, commandType);
        results.set(alias, result);
        return result;
      })
    );

    await Promise.all(tasks);
    return results;
  }

  /**
   * Run a single task for a workspace
   */
  async runTask(alias: string, commandType: string): Promise<TaskResult> {
    const workspace = this.graph.getWorkspace(alias);
    if (!workspace) {
      throw new Error(`Workspace not found: ${alias}`);
    }

    const command = getCommand(workspace, commandType, this.config);
    if (!command) {
      console.log(
        `   ${kleur.yellow("⊘")} ${alias}: no ${commandType} command`
      );
      return {
        workspace: alias,
        success: true,
        duration: 0,
      };
    }

    const startTime = Date.now();
    console.log(`   ${kleur.blue("►")} ${alias}: ${command}`);

    try {
      const env = { ...process.env };

      // Add NODE_OPTIONS for resolver hook
      if (this.nodeOptions) {
        env.NODE_OPTIONS =
          this.nodeOptions + (env.NODE_OPTIONS ? ` ${env.NODE_OPTIONS}` : "");
      }

      await execa(command, {
        cwd: workspace.path,
        shell: true,
        stdio: "inherit",
        env,
      });

      const duration = Date.now() - startTime;
      console.log(
        `   ${kleur.green("✓")} ${alias} (${(duration / 1000).toFixed(2)}s)`
      );

      return {
        workspace: alias,
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`   ${kleur.red("✗")} ${alias} failed`);

      return {
        workspace: alias,
        success: false,
        duration,
        error: error as Error,
      };
    }
  }

  /**
   * Run a single workspace with dependency checking
   */
  async runSingle(
    alias: string,
    commandType: string,
    withDeps: boolean = false
  ): Promise<void> {
    if (!this.graph.has(alias)) {
      throw new Error(`Workspace not found: ${alias}`);
    }

    if (withDeps) {
      // Build dependency chain
      const deps = this.graph.getDependencies(alias);
      if (deps.length > 0) {
        console.log(`\n📦 Starting dependencies first: ${deps.join(", ")}\n`);

        for (const dep of deps) {
          await this.runTask(dep, commandType);
        }
      }
    }

    console.log(`\n🚀 Starting ${alias}...\n`);
    await this.runTask(alias, commandType);
  }

  /**
   * Print execution summary
   */
  private printSummary(results: Map<string, TaskResult>): void {
    const successful = Array.from(results.values()).filter((r) => r.success);
    const failed = Array.from(results.values()).filter((r) => !r.success);
    const totalTime = Array.from(results.values()).reduce(
      (sum, r) => sum + r.duration,
      0
    );

    console.log(`\n${"=".repeat(50)}`);
    console.log(`📊 Summary:`);
    console.log(`   Total: ${results.size}`);
    console.log(`   ${kleur.green("✓")} Successful: ${successful.length}`);
    if (failed.length > 0) {
      console.log(`   ${kleur.red("✗")} Failed: ${failed.length}`);
    }
    console.log(`   ⏱  Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`${"=".repeat(50)}\n`);
  }

  /**
   * Run tasks for affected workspaces only
   */
  async runAffected(
    changedAliases: string[],
    commandType: string
  ): Promise<Map<string, TaskResult>> {
    const affected = this.graph.getAffected(changedAliases);
    console.log(
      `\n🎯 Affected workspaces: ${Array.from(affected).join(", ")}\n`
    );

    return this.runAll(commandType, Array.from(affected));
  }
}
