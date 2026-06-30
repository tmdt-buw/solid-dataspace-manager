const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const appRoot = path.resolve(__dirname, "..");
const nodeModulesRoot = path.join(appRoot, "node_modules");
const defaultSourceDirs = [
  "/solid-data-manager/dist",
  "/semantic-data-catalog/dist",
  "/solid-health-app/dist",
  "/solid-chatbot/dist",
];

const sourceDirs = (process.env.LOCAL_PACKAGE_WATCH_DIRS || defaultSourceDirs.join(";"))
  .split(/[;,]/)
  .map((item) => item.trim())
  .filter(Boolean);
const pollIntervalMs = Number(process.env.LOCAL_PACKAGE_WATCH_INTERVAL_MS || 1500);
const triggerFile = path.join(appRoot, "src", "App.js");

const packageDestination = (packageName) => {
  const parts = packageName.split("/");
  return path.join(nodeModulesRoot, ...parts);
};

const copyDirectory = (source, target) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    dereference: true,
    force: true,
  });
};

const readLocalPackage = (sourceDir) => {
  const packagePath = path.join(sourceDir, "package.json");
  if (!fs.existsSync(packagePath)) return null;
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (!packageJson.name) return null;
  return {
    name: packageJson.name,
    sourceDir,
    targetDir: packageDestination(packageJson.name),
  };
};

const getDirectorySignature = (sourceDir) => {
  if (!fs.existsSync(sourceDir)) return "missing";
  const stack = [sourceDir];
  let newest = 0;
  let fileCount = 0;
  let totalSize = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        return;
      }

      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }

      if (entry.isFile()) {
        fileCount += 1;
        totalSize += stat.size;
        newest = Math.max(newest, stat.mtimeMs);
      }
    });
  }

  return `${newest}:${fileCount}:${totalSize}`;
};

const touchReloadTrigger = () => {
  if (!fs.existsSync(triggerFile)) return;
  const now = new Date();
  fs.utimesSync(triggerFile, now, now);
};

const syncPackage = (localPackage) => {
  copyDirectory(localPackage.sourceDir, localPackage.targetDir);
  console.log(
    `[local-package-watch] Synced ${localPackage.name} from ${localPackage.sourceDir}`
  );
};

const localPackages = sourceDirs.map(readLocalPackage).filter(Boolean);
if (localPackages.length === 0) {
  console.warn("[local-package-watch] No local dist packages found. Starting normally.");
}

const signatures = new Map();
localPackages.forEach((localPackage) => {
  signatures.set(localPackage.sourceDir, getDirectorySignature(localPackage.sourceDir));
  syncPackage(localPackage);
});

let child = null;
let restarting = false;
let shuttingDown = false;
let restartChain = Promise.resolve();

const killChildTree = (childProcess, signal) => {
  if (!childProcess || childProcess.killed) return;
  if (process.platform === "win32") {
    childProcess.kill(signal);
    return;
  }
  process.kill(-childProcess.pid, signal);
};

const stopDevServer = (signal = "SIGTERM") =>
  new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    const current = child;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(forceTimer);
      resolve();
    };

    const killTimer = setTimeout(() => {
      try {
        killChildTree(current, "SIGKILL");
      } catch (err) {
        settle();
      }
    }, 5000);

    const forceTimer = setTimeout(settle, 10000);

    current.once("exit", settle);
    try {
      killChildTree(current, signal);
    } catch (err) {
      settle();
    }
  });

const spawnDevServer = () => {
  child = spawn("npm", ["start"], {
    cwd: appRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });

  child.on("exit", (code, signal) => {
    if (restarting) return;
    if (signal && shuttingDown) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });
};

const restartDevServer = () => {
  restartChain = restartChain
    .then(async () => {
      restarting = true;
      await stopDevServer();
      spawnDevServer();
      restarting = false;
    })
    .catch((err) => {
      restarting = false;
      console.error("[local-package-watch] Failed to restart dev server:", err);
    });
};

let pendingSync = null;
const pendingChangedPackages = new Map();
const scheduleSync = (changedPackages) => {
  changedPackages.forEach((localPackage) => {
    pendingChangedPackages.set(localPackage.sourceDir, localPackage);
  });

  if (pendingSync) clearTimeout(pendingSync);
  pendingSync = setTimeout(() => {
    pendingSync = null;
    const packagesToSync = Array.from(pendingChangedPackages.values());
    pendingChangedPackages.clear();
    packagesToSync.forEach(syncPackage);
    touchReloadTrigger();
    restartDevServer();
  }, 350);
};

setInterval(() => {
  const changedPackages = [];
  localPackages.forEach((localPackage) => {
    const nextSignature = getDirectorySignature(localPackage.sourceDir);
    if (nextSignature !== signatures.get(localPackage.sourceDir)) {
      signatures.set(localPackage.sourceDir, nextSignature);
      changedPackages.push(localPackage);
    }
  });

  if (changedPackages.length > 0) {
    scheduleSync(changedPackages);
  }
}, pollIntervalMs);

spawnDevServer();

const shutdown = (signal) => {
  shuttingDown = true;
  stopDevServer(signal).then(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
