/**
 * Lets plain Node run the app's TypeScript modules from a script.
 *
 * Node 22 strips types itself (--experimental-strip-types), but it does not
 * know the `@/` path alias from tsconfig, and it wants file extensions that
 * the app's imports leave off. This hook supplies both, and nothing else.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs <file.ts>
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
function candidates(base) {
  return [base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"];
}
export async function resolve(spec, ctx, next) {
  let base = null;
  if (spec.startsWith("@/")) base = new URL(spec.slice(2), ROOT).href;
  else if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
    base = new URL(spec, ctx.parentURL).href;
  }
  if (base) {
    for (const c of candidates(base)) {
      const p = fileURLToPath(c);
      if (existsSync(p) && !p.endsWith("/")) {
        try { if ((await import("node:fs")).statSync(p).isFile()) return next(c, ctx); } catch {}
      }
    }
  }
  return next(spec, ctx);
}
`),
  import.meta.url,
);
