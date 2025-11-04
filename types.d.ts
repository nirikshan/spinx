// Type definitions for spinx

export interface spinxConfig {
  manager: "pnpm";
  concurrency?: number;
  workspace: Workspace[];
  defaults?: Partial<Commands>;
  watch?: {
    include?: string[];
    ignore?: string[];
  };
}

export interface Workspace {
  path: string;
  alias?: string; // e.g., "@orders"
  dependsOn?: string[]; // aliases of dependencies
  command?: Commands;
}

export interface Commands {
  build?: string;
  start?: string;
  live?: string;
  [key: string]: string | undefined;
}

export interface GraphNode {
  workspace: Workspace;
  dependencies: Set<string>;
  dependents: Set<string>;
}

export interface PackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: any;
}

export interface ResolutionMap {
  [workspaceAlias: string]: {
    [packageName: string]: {
      version: string;
      resolvedPath: string;
    };
  };
}

export interface TaskResult {
  workspace: string;
  success: boolean;
  duration: number;
  error?: Error;
}

export interface ConflictInfo {
  packageName: string;
  versions: Map<string, string[]>; // version -> workspaces using it
}
