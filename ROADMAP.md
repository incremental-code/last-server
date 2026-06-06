# Last Server Roadmap

## Known stack gaps

- **Import map wildcard exports for transitive dependencies:** `resolveUserImports` currently does not expand `package.json` export patterns such as `./lib/languages/*` (for example in `highlight.js`). This can break browser module resolution for extensionless imports like `highlight.js/lib/languages/1c` during client-side navigation.  
  **Planned fix:** add wildcard export pattern expansion in import-map generation so subpath placeholders are resolved to concrete browser-importable targets.

- **Dev watch mode does not fully invalidate server module cache:** file saves trigger recompilation, but module-level server imports can stay cached in the running Node process. This means some backend/runtime edits are not reflected until the service/process is restarted.  
  **Planned fix:** add an opt-in full-restart dev loop (or equivalent cache-busting strategy) so all server-side code changes apply immediately without manual restarts.
