import { z } from "zod";
import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { resolve, join } from "path";
import type { spinxConfig } from "../types";

const CommandsSchema = z
  .object({
    build: z.string().optional(),
    start: z.string().optional(),
    live: z.string().optional(),
  })
  .catchall(z.string());

const WorkspaceSchema = z.object({
  path: z.string(),
  alias: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  command: CommandsSchema.optional(),
});

const spinxConfigSchema = z.object({
  manager: z.literal("pnpm"),
  concurrency: z.number().positive().optional(),
  workspace: z.array(WorkspaceSchema).min(1),
  defaults: CommandsSchema.optional(),
  watch: z
    .object({
      include: z.array(z.string()).optional(),
      ignore: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function loadConfig(
  rootDir: string = process.cwd()
): Promise<spinxConfig> {
  const configPath = join(rootDir, "spinx.config.js");

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }

  try {
    // Dynamic import for ESM compatibility
    const configModule = await import(pathToFileURL(configPath).href);
    const config = configModule.default || configModule;

    // Validate with Zod
    const validated = spinxConfigSchema.parse(config);

    // Resolve workspace paths to absolute
    validated.workspace = validated.workspace.map((ws) => ({
      ...ws,
      path: resolve(rootDir, ws.path),
    }));

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Config validation failed:");
      error.errors.forEach((err) => {
        console.error(`  • ${err.path.join(".")}: ${err.message}`);
      });
      throw new Error("Invalid configuration");
    }
    throw error;
  }
}

export function validateWorkspaces(config: spinxConfig): void {
  const aliases = new Set<string>();
  const paths = new Set<string>();

  for (const ws of config.workspace) {
    // Check duplicate aliases
    if (ws.alias) {
      if (aliases.has(ws.alias)) {
        throw new Error(`Duplicate alias: ${ws.alias}`);
      }
      aliases.add(ws.alias);
    }

    // Check duplicate paths
    if (paths.has(ws.path)) {
      throw new Error(`Duplicate path: ${ws.path}`);
    }
    paths.add(ws.path);

    // Check path exists
    if (!existsSync(ws.path)) {
      throw new Error(`Workspace path does not exist: ${ws.path}`);
    }

    // Validate dependsOn references
    if (ws.dependsOn) {
      for (const dep of ws.dependsOn) {
        const found = config.workspace.some((w) => w.alias === dep);
        if (!found) {
          throw new Error(
            `Workspace ${ws.alias || ws.path} depends on unknown alias: ${dep}`
          );
        }
      }
    }
  }
}

export function getCommand(
  workspace: spinxConfig["workspace"][0],
  commandType: string,
  config: spinxConfig
): string | undefined {
  return (
    workspace.command?.[commandType as keyof typeof workspace.command] ||
    config.defaults?.[commandType as keyof typeof config.defaults]
  );
}
