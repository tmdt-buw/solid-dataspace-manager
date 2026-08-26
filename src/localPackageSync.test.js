/** @jest-environment node */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  clearCraWebpackCache,
  copyPackageDirectory,
  getChangedLocalPackages,
  getDirectorySignature,
} = require("../scripts/local-package-sync");

describe("local package sync", () => {
  let temporaryRoot;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-package-sync-"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  test("updates generated files while preserving nested npm dependencies", () => {
    const source = path.join(temporaryRoot, "source");
    const target = path.join(temporaryRoot, "node_modules", "@example", "embed");
    const nestedDependency = path.join(
      target,
      "node_modules",
      "react-leaflet",
      "package.json"
    );

    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(path.dirname(nestedDependency), { recursive: true });
    fs.writeFileSync(
      path.join(source, "package.json"),
      JSON.stringify({ name: "@example/embed", version: "2.0.0" })
    );
    fs.writeFileSync(path.join(source, "index.js"), "export const version = 2;\n");
    fs.writeFileSync(path.join(target, "stale.js"), "stale\n");
    fs.writeFileSync(
      nestedDependency,
      JSON.stringify({ name: "react-leaflet", version: "4.2.1" })
    );

    copyPackageDirectory(source, target);

    expect(fs.readFileSync(path.join(target, "index.js"), "utf8")).toContain(
      "version = 2"
    );
    expect(JSON.parse(fs.readFileSync(nestedDependency, "utf8"))).toEqual({
      name: "react-leaflet",
      version: "4.2.1",
    });
    expect(fs.existsSync(path.join(target, "stale.js"))).toBe(false);

    fs.writeFileSync(path.join(source, "index.js"), "export const version = 3;\n");
    copyPackageDirectory(source, target);

    expect(fs.readFileSync(path.join(target, "index.js"), "utf8")).toContain(
      "version = 3"
    );
    expect(fs.existsSync(nestedDependency)).toBe(true);
  });

  test("detects content changes even when file size and timestamps are unchanged", () => {
    const source = path.join(temporaryRoot, "source");
    const generatedFile = path.join(source, "embed.css");
    const fixedTimestamp = new Date("2026-08-20T12:00:00.000Z");

    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(generatedFile, ".login-card{color:red}");
    fs.utimesSync(generatedFile, fixedTimestamp, fixedTimestamp);
    const firstSignature = getDirectorySignature(source);

    fs.writeFileSync(generatedFile, ".login-card{color:tan}");
    fs.utimesSync(generatedFile, fixedTimestamp, fixedTimestamp);
    const secondSignature = getDirectorySignature(source);

    expect(fs.statSync(generatedFile).size).toBe(22);
    expect(firstSignature).not.toBe(secondSignature);
  });

  test("produces a stable signature when directory contents do not change", () => {
    const source = path.join(temporaryRoot, "source");
    fs.mkdirSync(path.join(source, "nested"), { recursive: true });
    fs.writeFileSync(path.join(source, "nested", "index.js"), "export default 1;\n");

    expect(getDirectorySignature(source)).toBe(getDirectorySignature(source));
  });

  test("clears only the derived CRA and webpack cache", () => {
    const cacheFile = path.join(
      temporaryRoot,
      "node_modules",
      ".cache",
      "default-development",
      "0.pack"
    );
    const nestedDependency = path.join(
      temporaryRoot,
      "node_modules",
      "@example",
      "embed",
      "node_modules",
      "react-leaflet",
      "package.json"
    );
    const sourceFile = path.join(temporaryRoot, "src", "App.js");

    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.mkdirSync(path.dirname(nestedDependency), { recursive: true });
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(cacheFile, "stale webpack module");
    fs.writeFileSync(nestedDependency, JSON.stringify({ version: "4.2.1" }));
    fs.writeFileSync(sourceFile, "export default function App() {}\n");

    expect(clearCraWebpackCache(temporaryRoot)).toBe(true);
    expect(fs.existsSync(path.join(temporaryRoot, "node_modules", ".cache"))).toBe(
      false
    );
    expect(fs.existsSync(nestedDependency)).toBe(true);
    expect(fs.existsSync(sourceFile)).toBe(true);
    expect(clearCraWebpackCache(temporaryRoot)).toBe(false);
  });

  test("retries a transient ENOTEMPTY while clearing the CRA cache", () => {
    const cacheFile = path.join(
      temporaryRoot,
      "node_modules",
      ".cache",
      "babel-loader",
      "cache.json"
    );
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, "in-flight cache write");

    const realRmSync = fs.rmSync.bind(fs);
    const rmSync = jest
      .spyOn(fs, "rmSync")
      .mockImplementationOnce(() => {
        const error = new Error("directory not empty");
        error.code = "ENOTEMPTY";
        throw error;
      })
      .mockImplementation((target, options) => realRmSync(target, options));

    expect(clearCraWebpackCache(temporaryRoot)).toBe(true);
    expect(rmSync).toHaveBeenCalledTimes(2);
    expect(rmSync.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      })
    );
    expect(fs.existsSync(path.join(temporaryRoot, "node_modules", ".cache"))).toBe(
      false
    );
  });

  test("keeps the watcher-safe contract when cache writers outlive all retries", () => {
    const cacheFile = path.join(
      temporaryRoot,
      "node_modules",
      ".cache",
      "babel-loader",
      "cache.json"
    );
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, "still being written");

    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const rmSync = jest.spyOn(fs, "rmSync").mockImplementation(() => {
      const error = new Error("directory not empty");
      error.code = "ENOTEMPTY";
      throw error;
    });

    expect(() => clearCraWebpackCache(temporaryRoot)).not.toThrow();
    expect(clearCraWebpackCache(temporaryRoot)).toBe(false);
    expect(rmSync).toHaveBeenCalledTimes(4);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  test("discovers a local package whose dist manifest appears after startup", () => {
    const source = path.join(temporaryRoot, "late-dist");
    const nodeModulesRoot = path.join(temporaryRoot, "node_modules");
    const signatures = new Map();
    fs.mkdirSync(source, { recursive: true });

    expect(
      getChangedLocalPackages([source], nodeModulesRoot, signatures)
    ).toEqual([]);

    fs.writeFileSync(path.join(source, "package.json"), "{ partially written");
    expect(
      getChangedLocalPackages([source], nodeModulesRoot, signatures)
    ).toEqual([]);

    fs.writeFileSync(
      path.join(source, "package.json"),
      JSON.stringify({ name: "@example/late-package", version: "1.0.0" })
    );
    fs.writeFileSync(path.join(source, "index.js"), "export default 1;\n");

    const [discovered] = getChangedLocalPackages(
      [source],
      nodeModulesRoot,
      signatures
    );
    expect(discovered).toEqual(
      expect.objectContaining({
        name: "@example/late-package",
        sourceDir: source,
        targetDir: path.join(nodeModulesRoot, "@example", "late-package"),
      })
    );

    signatures.set(source, discovered.signature);
    expect(
      getChangedLocalPackages([source], nodeModulesRoot, signatures)
    ).toEqual([]);

    fs.rmSync(path.join(source, "package.json"), { force: true });
    expect(
      getChangedLocalPackages([source], nodeModulesRoot, signatures)
    ).toEqual([]);

    fs.writeFileSync(
      path.join(source, "package.json"),
      JSON.stringify({ name: "@example/late-package", version: "1.0.1" })
    );
    expect(
      getChangedLocalPackages([source], nodeModulesRoot, signatures)
    ).toHaveLength(1);
  });
});
