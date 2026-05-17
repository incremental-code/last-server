import { copyFile, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { transform } from 'esbuild';

const JSX_EXTENSIONS = new Set(['.jsx']);

const BANNER = `import { createElement as __createElement } from '@incremental-code/last-act';
const __Fragment = (props) => props.children;
`;

export async function compileTree(srcDir, outDir) {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    for await (const filePath of walk(srcDir)) {
        const rel = relative(srcDir, filePath);
        await compileOrCopy(srcDir, outDir, rel);
    }
}

export async function compileOrCopy(srcDir, outDir, rel) {
    const srcPath = join(srcDir, rel);
    const ext = extname(rel);

    if (JSX_EXTENSIONS.has(ext)) {
        const target = join(outDir, rel.slice(0, -ext.length) + '.js');
        await mkdir(dirname(target), { recursive: true });
        const source = await readFile(srcPath, 'utf8');
        const result = await transform(source, {
            loader: 'jsx',
            jsx: 'transform',
            jsxFactory: '__createElement',
            jsxFragment: '__Fragment',
            sourcefile: srcPath,
            sourcemap: 'inline',
            format: 'esm',
        });
        await writeFile(target, BANNER + result.code);
        return target;
    }

    const target = join(outDir, rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(srcPath, target);
    return target;
}

export async function removeCompiled(srcDir, outDir, rel) {
    const ext = extname(rel);
    const outName = JSX_EXTENSIONS.has(ext)
        ? rel.slice(0, -ext.length) + '.js'
        : rel;
    const target = join(outDir, outName);
    if (!safelyInside(outDir, target)) return;
    if (existsSync(target)) {
        await unlink(target);
    }
}

async function* walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (entry.isFile()) {
            yield full;
        }
    }
}

function safelyInside(parent, child) {
    return child === parent || child.startsWith(parent + sep);
}
