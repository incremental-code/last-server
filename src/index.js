import { existsSync, watch as fsWatch } from 'node:fs';
import { resolve } from 'node:path';
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

    const server = createServer({ port, base: outDir });
    const { url } = await server.connect();
    console.log(`last-server: listening on ${url}`);

    if (watch) {
        startWatch(srcDir, outDir);
        console.log(`last-server: watching ${srcDir}`);
    }

    return server;
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
