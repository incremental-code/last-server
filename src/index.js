import { existsSync, readFileSync, watch as fsWatch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from '@incremental-code/last-router/server';
import { compileOrCopy, compileTree, removeCompiled } from './compile.js';

const USAGE = `Usage: last-server <srcDir> [options]

Options:
  --port <n>     Port to listen on (default: 3000)
  --out <dir>    Compile output directory (default: .last-server)
  --no-watch     Disable file watching
  -h, --help     Show this help
`;

export async function runCli(argv) {
    const args = parseArgs(argv);

    if (args.help) {
        process.stdout.write(USAGE);
        return;
    }

    if (!args.srcDir) {
        process.stderr.write(USAGE);
        process.exit(1);
    }

    const srcDir = resolve(process.cwd(), args.srcDir);
    const outDir = resolve(process.cwd(), args.out);

    if (!existsSync(srcDir)) {
        console.error(`last-server: source directory not found: ${srcDir}`);
        process.exit(1);
    }

    await startServer({ srcDir, outDir, port: args.port, watch: args.watch, staticDirs: buildStaticDirs(args, process.env) });
}

export async function startServer({ srcDir, outDir, port = 3000, watch = true, staticDirs = [] } = {}) {
    console.log(`last-server: compiling ${srcDir} -> ${outDir}`);
    await compileTree(srcDir, outDir);

    const imports = resolveUserImports(process.cwd(), outDir);
    const server = createServer({ port, base: outDir, imports, staticDirs });
    const { url } = await server.connect();
    console.log(formatListeningMessage(url));

    if (watch) {
        startWatch(srcDir, outDir);
        console.log(`last-server: watching ${srcDir}`);
    }

    return server;
}

export function formatListeningMessage(url) {
    const port = getPortFromUrl(url);
    return port
        ? `last-server: listening on ${url} (port ${port})`
        : `last-server: listening on ${url}`;
}

function getPortFromUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.port || null;
    } catch {
        return null;
    }
}

function resolveUserImports(cwd, baseDir) {
    const pkgPath = findNearestPackageJson(cwd);
    if (!pkgPath) return {};

    let pkg;
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
        return {};
    }

    const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) };
    const nodeModules = findNodeModules(baseDir) || findNodeModules(dirname(pkgPath));
    if (!nodeModules) return {};

    const imports = {};
    const visited = new Set();
    for (const name of Object.keys(deps)) {
        collectPackageImports(nodeModules, name, imports, visited);
    }
    return imports;
}

function collectPackageImports(nodeModules, name, imports, visited) {
    if (visited.has(name)) return;
    visited.add(name);

    const pkgPath = join(nodeModules, name, 'package.json');
    if (!existsSync(pkgPath)) return;

    let meta;
    try {
        meta = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
        return;
    }

    // Add this package's own exports to the import map
    const rootEntry = resolvePackageTarget(meta.exports?.['.']) || meta.module || meta.main || 'index.js';
    if (rootEntry) {
        imports[name] = `/__module/${name}/${normalizePackageEntry(rootEntry)}`;
    }

    if (meta.exports && typeof meta.exports === 'object') {
        for (const [exportName, exportTarget] of Object.entries(meta.exports)) {
            if (exportName === '.' || exportName === './package.json') {
                continue;
            }

            const entry = resolvePackageTarget(exportTarget);
            if (!entry) {
                continue;
            }

            const subpath = exportName.startsWith('./') ? exportName.slice(2) : exportName;
            if (!subpath) {
                continue;
            }

            imports[`${name}/${subpath}`] = `/__module/${name}/${normalizePackageEntry(entry)}`;
        }
    }

    // Recurse into this package's own dependencies
    const transitiveDeps = { ...(meta.dependencies || {}), ...(meta.peerDependencies || {}) };
    for (const depName of Object.keys(transitiveDeps)) {
        collectPackageImports(nodeModules, depName, imports, visited);
    }
}

function resolvePackageTarget(target) {
    if (typeof target === 'string') {
        return target;
    }

    if (Array.isArray(target)) {
        for (const item of target) {
            const resolved = resolvePackageTarget(item);
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }

    if (!target || typeof target !== 'object') {
        return null;
    }

    for (const key of ['import', 'module', 'browser', 'default', 'require']) {
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            continue;
        }

        const resolved = resolvePackageTarget(target[key]);
        if (resolved) {
            return resolved;
        }
    }

    return null;
}

function normalizePackageEntry(entry) {
    return String(entry || '').replace(/^\.?\//, '');
}

function findNearestPackageJson(start) {
    let dir = start;
    while (true) {
        const candidate = join(dir, 'package.json');
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function findNodeModules(start) {
    let dir = start;
    while (true) {
        const candidate = join(dir, 'node_modules');
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function startWatch(srcDir, outDir) {
    const pending = new Map();

    fsWatch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (filename.includes('node_modules') || filename.startsWith('.')) return;

        const existing = pending.get(filename);
        if (existing) clearTimeout(existing);

        pending.set(filename, setTimeout(async () => {
            pending.delete(filename);
            try {
                const fullPath = resolve(srcDir, filename);
                if (existsSync(fullPath)) {
                    await compileOrCopy(srcDir, outDir, filename);
                    console.log(`last-server: recompiled ${filename}`);
                } else {
                    await removeCompiled(srcDir, outDir, filename);
                    console.log(`last-server: removed ${filename}`);
                }
            } catch (err) {
                console.error(`last-server: ${filename}: ${err.message}`);
            }
        }, 50));
    });
}

function parseArgs(argv) {
    const out = { srcDir: null, port: Number(process.env.PORT) || 3000, out: '.last-server', watch: true, help: false, uploadsDir: null, uploadsPath: '/uploads' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '-h' || a === '--help') out.help = true;
        else if (a === '--port') out.port = Number(argv[++i]);
        else if (a === '--out') out.out = argv[++i];
        else if (a === '--no-watch') out.watch = false;
        else if (a === '--uploads-dir') out.uploadsDir = argv[++i];
        else if (a === '--uploads-path') out.uploadsPath = argv[++i];
        else if (!out.srcDir && !a.startsWith('-')) out.srcDir = a;
    }
    return out;
}

function buildStaticDirs(args, env) {
    const dir = args.uploadsDir || env.LAST_UPLOADS_DIR;
    if (!dir) return [];
    const urlPath = args.uploadsPath || env.LAST_UPLOADS_PATH || '/uploads';
    return [{ path: urlPath, dir }];
}
