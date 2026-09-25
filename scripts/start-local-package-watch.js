const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  clearCraWebpackCache,
  copyPackageDirectory,
  getChangedLocalPackages,
  readLocalPackage,
} = require("./local-package-sync");

const appRoot = path.resolve(__dirname, "..");
const nodeModulesRoot = path.join(appRoot, "node_modules");
const defaultSourceDirs = [
  "/solid-data-manager/dist",
  "/semantic-data-catalog/dist",
  "/solid-health-app/dist",
  "/city-tours/dist",
  "/solid-health-questionnaire/dist",
  "/solid-chatbot/dist",
];

const sourceDirs = (process.env.LOCAL_PACKAGE_WATCH_DIRS || defaultSourceDirs.join(";"))
  .split(/[;,]/)
  .map((item) => item.trim())
  .filter(Boolean);
const pollIntervalMs = Number(process.env.LOCAL_PACKAGE_WATCH_INTERVAL_MS || 1500);
const triggerFile = path.join(appRoot, "src", "App.js");

const touchReloadTrigger = () => {
  if (!fs.existsSync(triggerFile)) return;
  const now = new Date();
  fs.utimesSync(triggerFile, now, now);
};

const syncPackage = (localPackage) => {
  copyPackageDirectory(localPackage.sourceDir, localPackage.targetDir);
  console.log(
    `[local-package-watch] Synced ${localPackage.name} from ${localPackage.sourceDir}`
  );
};

const signatures = new Map();
const synchronizePackages = (packages) => {
  let syncedCount = 0;

  packages.forEach((candidate) => {
    // Re-read immediately before copying. A dist build may have removed or
    // replaced package.json since the polling snapshot was taken.
    const currentPackage = readLocalPackage(candidate.sourceDir, nodeModulesRoot);
    if (!currentPackage || currentPackage.name !== candidate.name) return;

    try {
      syncPackage(currentPackage);
      signatures.set(candidate.sourceDir, candidate.signature);
      syncedCount += 1;
    } catch (error) {
      // Do not advance the signature. The next poll will retry this package
      // after its dist directory has reached a stable state.
      console.warn(
        `[local-package-watch] Could not sync ${candidate.name}; will retry (${error.code || error.message}).`
      );
    }
  });

  return syncedCount;
};

const initialPackages = getChangedLocalPackages(
  sourceDirs,
  nodeModulesRoot,
  signatures
);
const initialSyncedCount = synchronizePackages(initialPackages);
if (initialSyncedCount === 0) {
  console.warn(
    "[local-package-watch] No local dist packages ready. Starting normally and continuing discovery."
  );
}

// Docker keeps /app/node_modules in a named volume. Clear its derived webpack
// cache after the initial package sync as well, so restarting the container
// cannot resurrect modules compiled from an older local build.
if (initialSyncedCount > 0 && clearCraWebpackCache(appRoot)) {
  console.log("[local-package-watch] Cleared CRA/webpack cache");
}

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
      // The old webpack process must be fully stopped before its filesystem
      // cache is removed; otherwise an in-flight compile can recreate stale
      // cache entries between invalidation and the new process starting.
      if (clearCraWebpackCache(appRoot)) {
        console.log("[local-package-watch] Cleared CRA/webpack cache");
      }
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
    const syncedCount = synchronizePackages(packagesToSync);
    if (syncedCount > 0) {
      touchReloadTrigger();
      restartDevServer();
    }
  }, 350);
};

setInterval(() => {
  const changedPackages = getChangedLocalPackages(
    sourceDirs,
    nodeModulesRoot,
    signatures
  );

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
