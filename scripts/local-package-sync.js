const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PRESERVED_DIRECTORY = "node_modules";
const CRA_WEBPACK_CACHE_PATH = ["node_modules", ".cache"];
const CACHE_REMOVE_OPTIONS = {
  recursive: true,
  force: true,
  // CRA can still finish an in-flight cache write while its process tree is
  // shutting down. Node retries ENOTEMPTY (as well as EBUSY/EPERM) only when
  // maxRetries is explicitly configured for recursive removal.
  maxRetries: 10,
  retryDelay: 50,
};
const TRANSIENT_REMOVE_ERROR_CODES = new Set([
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "ENOTEMPTY",
  "EPERM",
]);

/**
 * Build a deterministic signature from paths and file contents.
 *
 * Dist builds can replace a file without changing its size and, depending on
 * the mounted filesystem, without exposing a sufficiently precise mtime. A
 * metadata-only signature therefore occasionally left the consuming webpack
 * dev server running with an old bundle even though the package had changed.
 */
const getDirectorySignature = (sourceDir) => {
  if (!fs.existsSync(sourceDir)) return "missing";

  const hash = crypto.createHash("sha256");

  const visit = (directory, relativeDirectory = "") => {
    let entries;
    try {
      entries = fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      hash.update(`unreadable:${relativeDirectory}:${error.code || "unknown"}\0`);
      return;
    }

    entries.forEach((entry) => {
      const relativePath = path.posix.join(
        relativeDirectory.split(path.sep).join(path.posix.sep),
        entry.name
      );
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        hash.update(`directory:${relativePath}\0`);
        visit(fullPath, path.join(relativeDirectory, entry.name));
        return;
      }

      if (!entry.isFile()) {
        hash.update(`other:${relativePath}\0`);
        return;
      }

      hash.update(`file:${relativePath}\0`);
      try {
        hash.update(fs.readFileSync(fullPath));
      } catch (error) {
        hash.update(`unreadable:${error.code || "unknown"}`);
      }
      hash.update("\0");
    });
  };

  visit(sourceDir);
  return `sha256:${hash.digest("hex")}`;
};

/**
 * Replace a locally linked package's generated files without deleting dependencies
 * that npm installed below that package. npm may keep peer-sensitive dependencies
 * nested instead of hoisting them to the consuming application's node_modules.
 */
const copyPackageDirectory = (source, target) => {
  const sourceStat = fs.statSync(source);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Local package source is not a directory: ${source}`);
  }

  fs.mkdirSync(target, { recursive: true });

  const sourceEntries = fs
    .readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.name !== PRESERVED_DIRECTORY);
  const sourceNames = new Set(sourceEntries.map((entry) => entry.name));

  sourceEntries.forEach((entry) => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      dereference: true,
      force: true,
    });
  });

  fs.readdirSync(target, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === PRESERVED_DIRECTORY || sourceNames.has(entry.name)) return;
    fs.rmSync(path.join(target, entry.name), { recursive: true, force: true });
  });
};

/**
 * Remove only cache data created by Create React App's webpack/Babel pipeline.
 *
 * Local package builds are copied into node_modules in place. Webpack's
 * filesystem cache can otherwise reuse modules from the package version that
 * occupied the same path before the copy, even after the dev server restarts.
 * The rest of node_modules (including dependencies nested below a package) and
 * all application sources deliberately remain untouched.
 */
const clearCraWebpackCache = (applicationRoot) => {
  const cachePath = path.join(applicationRoot, ...CRA_WEBPACK_CACHE_PATH);
  if (!fs.existsSync(cachePath)) return false;

  // rmSync's built-in retry loop handles the normal concurrent-write race.
  // Keep one outer retry as well: it makes the operation resilient on mounted
  // filesystems that can surface ENOTEMPTY only after rmSync exhausts its own
  // traversal. The target remains narrowly limited to CRA's derived cache.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.rmSync(cachePath, CACHE_REMOVE_OPTIONS);
      return true;
    } catch (error) {
      const isTransient = TRANSIENT_REMOVE_ERROR_CODES.has(error.code);
      if (!isTransient) throw error;

      if (attempt === 1) {
        console.warn(
          `[local-package-sync] Could not clear ${cachePath} after retries; continuing without terminating the package watcher (${error.code}).`
        );
        return false;
      }
    }
  }

  return false;
};

const packageDestination = (nodeModulesRoot, packageName) => {
  const parts = packageName.split("/");
  return path.join(nodeModulesRoot, ...parts);
};

/**
 * Read a generated package only while its manifest is complete and valid.
 * Build tools commonly replace dist directories in more than one filesystem
 * operation, so a missing or partially written manifest is a transient state.
 */
const readLocalPackage = (sourceDir, nodeModulesRoot) => {
  const packagePath = path.join(sourceDir, "package.json");
  if (!fs.existsSync(packagePath)) return null;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (!packageJson.name || typeof packageJson.name !== "string") return null;
    return {
      name: packageJson.name,
      sourceDir,
      targetDir: packageDestination(nodeModulesRoot, packageJson.name),
    };
  } catch (error) {
    // The next poll will retry once the build has completed the manifest.
    return null;
  }
};

/**
 * Discover ready local packages on every poll. Signatures are advanced only by
 * the caller after a successful copy, so a package that appears after startup
 * or temporarily disappears during a build is retried rather than forgotten.
 */
const getChangedLocalPackages = (sourceDirs, nodeModulesRoot, signatures) =>
  sourceDirs.reduce((changedPackages, sourceDir) => {
    const localPackage = readLocalPackage(sourceDir, nodeModulesRoot);
    if (!localPackage) return changedPackages;

    const signature = getDirectorySignature(sourceDir);
    if (signature !== signatures.get(sourceDir)) {
      changedPackages.push({ ...localPackage, signature });
    }
    return changedPackages;
  }, []);

module.exports = {
  clearCraWebpackCache,
  copyPackageDirectory,
  getChangedLocalPackages,
  getDirectorySignature,
  readLocalPackage,
};
