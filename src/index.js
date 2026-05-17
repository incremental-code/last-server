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

    await startServer({ srcDir, outDir, port: args.port, watch: args.watch });
}

export async function startServer({ srcDir, outDir, port = 3000, watch = true } = {}) {
    console.log(`last-server: compiling ${srcDir} -> ${outDir}`);
    await compileTree(srcDir, outDir);

    const imports = resolveUserImports(process.cwd(), outDir);
    const server = createServer({ port, base: outDir, imports });
    const { url } = await server.connect();
    console.log(`last-server: listening on ${url}`);

    if (watch) {
        startWatch(srcDir, outDir);
        console.log(`last-server: watching ${srcDir}`);
    }

    return server;
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
    for (const name of Object.keys(deps)) {
        const entry = resolvePackageEntry(nodeModules, name);
        if (entry) imports[name] = `/__module/${name}/${entry}`;
    }
    return imports;
}

function resolvePackageEntry(nodeModules, name) {
    const pkgPath = join(nodeModules, name, 'package.json');
    if (!existsSync(pkgPath)) return null;
    try {
        const meta = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const entry = meta.module || meta.main || 'index.js';
        return entry.replace(/^\.?\//, '');
    } catch {
        return null;
    }
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
    const out = { srcDir: null, port: 3000, out: '.last-server', watch: true, help: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '-h' || a === '--help') out.help = true;
        else if (a === '--port') out.port = Number(argv[++i]);
        else if (a === '--out') out.out = argv[++i];
        else if (a === '--no-watch') out.watch = false;
        else if (!out.srcDir && !a.startsWith('-')) out.srcDir = a;
    }
    return out;
}
