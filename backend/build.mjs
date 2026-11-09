// Bundles every backend/functions/<name>/index.ts into dist/<name>/index.mjs (zipped by Terraform).
import { build } from 'esbuild'
import { readdirSync } from 'node:fs'

const functions = readdirSync('functions', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

await Promise.all(
  functions.map((name) =>
    build({
      entryPoints: [`functions/${name}/index.ts`],
      outfile: `dist/${name}/index.mjs`,
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      minify: true,
      sourcemap: true,
      // The Lambda runtime ships AWS SDK v3.
      external: ['@aws-sdk/*'],
      // CommonJS dependencies (aws-xray-sdk-core via Powertools Tracer) call require(), which ESM lacks.
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    }),
  ),
)

// Load every bundle once, so module-level failures break the build instead of the Lambda.
for (const name of functions) await import(new URL(`dist/${name}/index.mjs`, import.meta.url).href)

console.log(`built: ${functions.join(', ')}`)
