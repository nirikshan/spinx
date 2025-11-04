# 🚀 spinx 🚀

A minimal, fast monorepo manager for Node.js/TypeScript projects with advanced dependency resolution.

## Main Features

- **Central node_modules** - Single installation point via pnpm
- **Cross-version resolution** - Different workspaces can use different package versions
- **Alias imports** - Use `@orders/utils/helper` style imports
- **Parallel execution** - Run tasks concurrently with dependency awareness
- **Dependency graph** - Automatic topological ordering and cycle detection
- **Simple configuration** - One `spinx.config.js` file
- **Clean CLI** - Easy-to-use commands

## Installation

```bash
npm install -g spinx
# or
pnpm add -g spinx
```

## 🚀 Quick Start

### 1. Create spinx.config.js

```javascript
/** @type {import('spinx/types').spinxConfig} */
module.exports = {
  manager: "pnpm",
  concurrency: 4,
  workspace: [
    {
      path: "./packages/utils",
      alias: "@utils",
      command: {
        build: "npm run build",
      },
    },
    {
      path: "./services/orders",
      alias: "@orders",
      dependsOn: ["@utils"],
      command: {
        build: "npm run build",
        start: "npm run dev",
        live: "npm run start:prod",
      },
    },
    {
      path: "./services/cart",
      alias: "@cart",
      dependsOn: ["@orders", "@utils"],
      command: {
        build: "npm run build",
        start: "npm run dev",
        live: "npm run start:prod",
      },
    },
  ],
  defaults: {
    build: "npm run build",
    start: "npm run dev",
  },
};
```

### 2. Create pnpm-workspace.yaml

```yaml
packages:
  - "packages/*"
  - "services/*"
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Build everything

```bash
spinx build
```

## 📚 Commands

### Build

Build all workspaces in dependency order:

```bash
spinx build
```

Build only changed workspaces since a git ref:

```bash
spinx build --since=origin/main
```

Build specific workspaces:

```bash
spinx build --filter=@orders,@cart
```

### Start

Start a workspace in development mode:

```bash
spinx start @orders
```

Start with dependencies:

```bash
spinx start @orders --with-deps
```

### Live

Run all workspaces in production mode:

```bash
spinx live
```

### Add Dependencies

Add workspace-to-workspace dependency:

```bash
spinx add @cart @orders
```

Add npm package:

```bash
spinx add @orders express@5.0.0 --exact
spinx add @cart lodash --dev
```

### Remove Dependencies

```bash
spinx remove @cart @orders
spinx rm @orders express
```

### View Conflicts

See package version conflicts:

```bash
spinx conflicts
```

### Explain Resolution

See how a package is resolved:

```bash
spinx explain @orders express
```

### View Graph

Display dependency graph:

```bash
spinx graph
```

## 🔧 Advanced: Cross-Version Resolution

spinx's killer feature is **cross-version resolution**. Different workspaces can depend on different versions of the same package:

```javascript
// @orders uses express 5.x
{
  "dependencies": {
    "express": "^5.0.0"
  }
}

// @cart uses express 4.x
{
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

Both will work correctly at runtime! spinx:

1. Analyzes all workspace dependencies
2. Generates a resolution map (`.spinx/resolutions.json`)
3. Creates a custom Node.js resolver hook (`.spinx/resolver.js`)
4. Automatically loads the hook when running your code

The resolver intercepts `require()` and `import` calls to load the correct version for each workspace.

### How it works

```
Workspace Request Flow:
┌─────────────┐
│   @orders   │ import express  →  express 5.0.0
└─────────────┘

┌─────────────┐
│    @cart    │ import express  →  express 4.18.3
└─────────────┘

Both packages installed in node_modules, correct version loaded per workspace!
```

### View conflicts

```bash
$ spinx conflicts

⚠️  Found 1 package(s) with version conflicts:

📦 express
   5.0.0:
      - @orders
   4.18.3:
      - @cart

💡 These conflicts will be automatically resolved at runtime.
```

## 📦 Configuration

### spinxConfig

```typescript
interface spinxConfig {
  manager: "pnpm";
  concurrency?: number; // Max parallel tasks (default: # of workspaces)
  workspace: Workspace[];
  defaults?: Partial<Commands>; // Fallback commands
  watch?: {
    include?: string[];
    ignore?: string[];
  };
}

interface Workspace {
  path: string; // Path to workspace
  alias?: string; // Import alias (e.g., "@orders")
  dependsOn?: string[]; // Workspace dependencies
  command?: Commands; // Override commands
}

interface Commands {
  build?: string;
  start?: string;
  live?: string;
}
```

## 🎯 Use Cases

### Microservices Monorepo

Perfect for:

- Multiple services with shared packages
- Services that need different versions of dependencies
- Gradual migrations (e.g., Express 4 → 5)

### Library Monorepo

Great for:

- Multiple packages that depend on each other
- Testing packages together
- Version management across packages

## 🔍 How It Differs

| Feature                      | spinx  | Nx      | Turborepo |
| ---------------------------- | ------ | ------- | --------- |
| **Cross-version resolution** | ✅     | ❌      | ❌        |
| **Configuration complexity** | Simple | Complex | Medium    |
| **Learning curve**           | Low    | High    | Medium    |
| **Size**                     | ~100KB | ~50MB   | ~5MB      |
| **Parallel execution**       | ✅     | ✅      | ✅        |
| **Dependency graph**         | ✅     | ✅      | ✅        |

## 🛠️ Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## 📝 Example Project Structure

```
my-monorepo/
├── spinx.config.js
├── pnpm-workspace.yaml
├── package.json
├── packages/
│   ├── utils/
│   │   ├── package.json
│   │   └── src/
│   └── shared/
│       ├── package.json
│       └── src/
└── services/
    ├── orders/
    │   ├── package.json
    │   └── src/
    └── cart/
        ├── package.json
        └── src/
```

### ✅ Core Features

1. **Central node_modules with Version Management**

   - Single `node_modules` via pnpm
   - Advanced package resolution for conflicting versions
   - Automatic resolution map generation
   - Runtime resolver hook that intercepts `require()` and `import`
   - Each workspace gets the correct package version automatically

2. **Alias Support**

   - Use `@orders/utils/helper.ts` style imports
   - Clean, readable import statements
   - Automatic path mapping

3. **Parallel Execution**

   - Dependency-aware parallel builds
   - Configurable concurrency
   - Batched execution respecting dependency graph
   - Smart topological ordering

4. **Conflict Resolution**
   - Automatic detection of version conflicts
   - Visual conflict display via `spinx conflicts`
   - Detailed resolution explanation with `spinx explain`
   - Works seamlessly at runtime

## Project Structure

```
spinx/
├── src/
│   ├── cli.ts           # Main CLI entry point
│   ├── config.ts        # Configuration loader & validator
│   ├── graph.ts         # Dependency graph (DAG, cycles, topo sort)
│   ├── resolution.ts    # Version conflict resolution system ⭐
│   ├── tasks.ts         # Parallel task execution
│   ├── add.ts           # Dependency management
│   └── utils.ts         # Helper functions
├── tests/
│   └── graph.test.ts    # Graph tests
├── scripts/
│   └── quickstart.sh    # Project setup script
├── examples/
│   └── spinx.config.example.js
├── types.d.ts           # TypeScript definitions
├── package.json
├── tsconfig.json
├── README.md            # Main documentation
└── USAGE.md             # Detailed usage guide

Generated at runtime:
.spinx/
├── resolutions.json     # Package version mappings
└── resolver.js          # Runtime resolver hook
```

You can also design your own structure

## How the Version Resolution Works 🎯

This is the killer feature. Here's how it works:

### 1. Analysis Phase

```typescript
// spinx analyzes all workspace package.json files
@orders → express@5.0.0
@cart   → express@4.18.3
```

### 2. Resolution Map Generation

```json
// .spinx/resolutions.json
{
  "@orders": {
    "express": {
      "version": "5.0.0",
      "resolvedPath": "/node_modules/.pnpm/express@5.0.0/..."
    }
  },
  "@cart": {
    "express": {
      "version": "4.18.3",
      "resolvedPath": "/node_modules/.pnpm/express@4.18.3/..."
    }
  }
}
```

### 3. Runtime Resolution

```javascript
// .spinx/resolver.js intercepts require()
Module._resolveFilename = function (request, parent) {
  // Determine which workspace is calling
  const workspace = findWorkspace(parent.filename);

  // Look up correct version for that workspace
  const resolution = resolutions[workspace][request];

  // Return correct path
  return resolution.resolvedPath;
};
```

### 4. Result

```javascript
// In @orders/src/index.ts
import express from "express"; // Gets express 5.0.0 ✅

// In @cart/src/index.ts
import express from "express"; // Gets express 4.18.3 ✅
```

## Getting Started

### Option 1: Quick Setup (Recommended)

```bash
cd spinx
npm install
npm run build

# Create a test project
cd ..
mkdir test-monorepo && cd test-monorepo
../spinx/scripts/quickstart.sh

# Start using it!
pnpm install
npx spinx build
npx spinx start @orders
```

### Option 2: Install Globally

```bash
cd spinx
npm install
npm run build
npm link

# Now use anywhere
cd /path/to/your/project
spinx init
spinx build
```

## Key Commands

```bash
# View version
spinx -v

# Build everything
spinx build

# Build only changed
spinx build --since=origin/main

# Start a service
spinx start @orders
spinx start @orders --with-deps

# Production mode
spinx live

# Manage dependencies
spinx add @cart @orders              # Link workspaces
spinx add @orders express@5.0.0 -E   # Add npm package

# Check conflicts
spinx conflicts
spinx explain @orders express

# View graph
spinx graph
```

## Example Scenario: Version Conflict

### The Problem

```
Your monorepo:
├── @new-api (wants Express 5.x - new async/await API)
└── @legacy-api (stuck on Express 4.x - old callbacks)

Traditional approach: Either migrate everything at once (risky!)
or split into separate repos (overhead!)
```

### The spinx Solution

```bash
# 1. Set up both services with different Express versions
cd services/new-api
pnpm add express@5.0.0

cd ../legacy-api
pnpm add express@4.18.3

# 2. Check conflicts
spinx conflicts
# ⚠️  express: 5.0.0 (@new-api), 4.18.3 (@legacy-api)

# 3. Build and run - it just works!
spinx build
spinx start @new-api    # Uses Express 5 ✅
spinx start @legacy-api # Uses Express 4 ✅

# 4. Gradually migrate at your own pace
# No rush, no breaking changes, both services work perfectly
```

## Architecture Highlights

### 1. Dependency Graph (graph.ts)

- Uses Kahn's algorithm for topological sort
- Detects cycles with full path display
- Calculates affected workspaces
- Generates parallel execution batches

### 2. Resolution System (resolution.ts)

- Scans all workspace dependencies
- Detects version conflicts automatically
- Generates resolution map
- Creates runtime resolver hook
- Fast path for non-conflicting packages

### 3. Task Runner (tasks.ts)

- Parallel execution with p-limit
- Respects dependency order
- Configurable concurrency
- Streams output with colored prefixes
- Fail-fast or continue on error

### 4. Smart Config (config.ts)

- Zod schema validation
- Helpful error messages
- Workspace validation
- Default command fallbacks

## Testing

```bash
cd spinx
npm install
npm test

# Run specific test
npm test graph.test.ts
```

## Publishing to npm

When ready to publish:

```bash
# Update version
npm version patch  # or minor, major

# Build
npm run build

# Publish
npm publish

# Install globally
npm install -g spinx
```

## Comparison with Competitors

| Feature                  | spinx          | Nx         | Turborepo | Lerna     |
| ------------------------ | -------------- | ---------- | --------- | --------- |
| Cross-version resolution | ✅ **Unique!** | ❌         | ❌        | ❌        |
| Config simplicity        | ✅ Simple      | ❌ Complex | ✅ Simple | ⚠️ Medium |
| Learning curve           | ✅ Low         | ❌ High    | ✅ Low    | ⚠️ Medium |
| Package size             | ✅ ~100KB      | ❌ ~50MB   | ⚠️ ~5MB   | ✅ ~1MB   |
| Parallel builds          | ✅             | ✅         | ✅        | ✅        |
| Dependency graph         | ✅             | ✅         | ✅        | ✅        |
| TypeScript support       | ✅             | ✅         | ✅        | ✅        |

## What Makes spinx Special

1. **Cross-Version Resolution** - The only monorepo tool that can handle different package versions correctly at runtime

2. **Zero Configuration Bloat** - One simple config file vs. dozens of Nx config files

3. **Fast & Lightweight** - No heavy plugins, no magic, just fast execution

4. **pnpm-First** - Built specifically for pnpm's workspace features

5. **Developer Experience** - Clear error messages, helpful commands, simple mental model

## Next Steps

1. **Install dependencies**

   ```bash
   cd spinx && npm install
   ```

2. **Build the project**

   ```bash
   npm run build
   ```

3. **Try the quickstart**

   ```bash
   ./scripts/quickstart.sh
   ```

4. **Test with your own project**

   ```bash
   npm link  # Make spinx available globally
   cd /your/monorepo
   spinx init
   ```

5. **Read the docs**
   - README.md - Overview and quick start
   - USAGE.md - Detailed usage patterns
   - examples/ - Config examples

## Troubleshooting

### "Module not found" errors

- Run `spinx build` to regenerate resolution map
- Check that .spinx/resolver.js exists
- Verify NODE_OPTIONS includes the resolver

### "Circular dependency" errors

- Check `spinx graph` to see dependencies
- Remove circular references in spinx.config.js

### "pnpm not found" errors

- Install pnpm: `npm install -g pnpm`

## Contributing

Future enhancements to consider:

- [ ] Watch mode with hot reload
- [ ] TUI dashboard (spinx view)
- [ ] Cache system for faster builds
- [ ] Remote cache support
- [ ] Plugin system
- [ ] Better TypeScript project references

**My core focus for this project was:**
✅ Central dependency management  
✅ Version conflict resolution  
✅ Parallel execution  
✅ Clean aliases

## Contributing

Contributions welcome! Please read our contributing guidelines.

## License

MIT

## Repository

GitHub: [https://github.com/nirikshan/spinx](https://github.com/nirikshan/spinx)

## Credits

Built with:

- [commander](https://github.com/tj/commander.js) - CLI framework
- [execa](https://github.com/sindresorhus/execa) - Process execution
- [chokidar](https://github.com/paulmillr/chokidar) - File watching
- [p-limit](https://github.com/sindresorhus/p-limit) - Concurrency control
- [zod](https://github.com/colinhacks/zod) - Schema validation
