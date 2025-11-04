import type { spinxConfig, GraphNode } from "../types.js";

export class DependencyGraph {
  private nodes = new Map<string, GraphNode>();
  private config: spinxConfig;

  constructor(config: spinxConfig) {
    this.config = config;
    this.buildGraph();
    this.detectCycles();
  }

  private buildGraph(): void {
    // Initialize nodes
    for (const workspace of this.config.workspace) {
      const alias = workspace.alias || workspace.path;
      this.nodes.set(alias, {
        workspace,
        dependencies: new Set(workspace.dependsOn || []),
        dependents: new Set(),
      });
    }

    // Build dependents (reverse edges)
    for (const [alias, node] of this.nodes) {
      for (const dep of node.dependencies) {
        const depNode = this.nodes.get(dep);
        if (depNode) {
          depNode.dependents.add(alias);
        }
      }
    }
  }

  private detectCycles(): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (alias: string): boolean => {
      visited.add(alias);
      recStack.add(alias);
      path.push(alias);

      const node = this.nodes.get(alias);
      if (!node) return false;

      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (recStack.has(dep)) {
          // Cycle detected
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep];
          throw new Error(
            `❌ Circular dependency detected: ${cycle.join(" → ")}`
          );
        }
      }

      recStack.delete(alias);
      path.pop();
      return false;
    };

    for (const alias of this.nodes.keys()) {
      if (!visited.has(alias)) {
        dfs(alias);
      }
    }
  }

  /**
   * Get topological order using Kahn's algorithm
   * Returns workspaces in build order (dependencies first)
   */
  getTopologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    // Calculate in-degrees
    for (const [alias, node] of this.nodes) {
      inDegree.set(alias, node.dependencies.size);
      if (node.dependencies.size === 0) {
        queue.push(alias);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const alias = queue.shift()!;
      result.push(alias);

      const node = this.nodes.get(alias)!;
      for (const dependent of node.dependents) {
        const degree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, degree);
        if (degree === 0) {
          queue.push(dependent);
        }
      }
    }

    if (result.length !== this.nodes.size) {
      throw new Error(
        "Graph contains cycles (should have been caught earlier)"
      );
    }

    return result;
  }

  /**
   * Get batches for parallel execution
   * Each batch contains workspaces that can run in parallel
   */
  getParallelBatches(): string[][] {
    const inDegree = new Map<string, number>();
    const batches: string[][] = [];

    // Calculate in-degrees
    for (const [alias, node] of this.nodes) {
      inDegree.set(alias, node.dependencies.size);
    }

    while (inDegree.size > 0) {
      const batch: string[] = [];

      // Find all nodes with in-degree 0
      for (const [alias, degree] of inDegree) {
        if (degree === 0) {
          batch.push(alias);
        }
      }

      if (batch.length === 0) {
        throw new Error("Unable to determine parallel batches");
      }

      batches.push(batch);

      // Remove processed nodes and update in-degrees
      for (const alias of batch) {
        inDegree.delete(alias);
        const node = this.nodes.get(alias)!;
        for (const dependent of node.dependents) {
          if (inDegree.has(dependent)) {
            inDegree.set(dependent, inDegree.get(dependent)! - 1);
          }
        }
      }
    }

    return batches;
  }

  /**
   * Get all dependents (downstream) of given workspaces
   * Used for affected workspace calculation
   */
  getAffected(changedAliases: string[]): Set<string> {
    const affected = new Set<string>(changedAliases);
    const queue = [...changedAliases];

    while (queue.length > 0) {
      const alias = queue.shift()!;
      const node = this.nodes.get(alias);

      if (node) {
        for (const dependent of node.dependents) {
          if (!affected.has(dependent)) {
            affected.add(dependent);
            queue.push(dependent);
          }
        }
      }
    }

    return affected;
  }

  /**
   * Get direct dependencies of a workspace
   */
  getDependencies(alias: string): string[] {
    const node = this.nodes.get(alias);
    return node ? Array.from(node.dependencies) : [];
  }

  /**
   * Get direct dependents of a workspace
   */
  getDependents(alias: string): string[] {
    const node = this.nodes.get(alias);
    return node ? Array.from(node.dependents) : [];
  }

  /**
   * Get workspace by alias
   */
  getWorkspace(alias: string): spinxConfig["workspace"][0] | undefined {
    return this.nodes.get(alias)?.workspace;
  }

  /**
   * Get all workspace aliases
   */
  getAllAliases(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Check if workspace exists
   */
  has(alias: string): boolean {
    return this.nodes.has(alias);
  }

  /**
   * Print graph summary
   */
  printSummary(): void {
    console.log(`\n📊 Dependency Graph:`);
    console.log(`   Workspaces: ${this.nodes.size}`);

    const batches = this.getParallelBatches();
    console.log(`   Parallel Levels: ${batches.length}\n`);

    for (let i = 0; i < batches.length; i++) {
      console.log(`   Level ${i + 1}: ${batches[i].join(", ")}`);
    }
    console.log();
  }
}
