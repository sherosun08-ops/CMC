/** Build the admin SPA with esbuild into public/. */
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'public');
const assetsDir = path.join(outDir, 'assets');

fs.mkdirSync(assetsDir, { recursive: true });

const watch = process.argv.includes('--watch');

const options: esbuild.BuildOptions = {
  entryPoints: [path.join(root, 'admin', 'main.tsx')],
  bundle: true,
  outfile: path.join(assetsDir, 'admin.js'),
  minify: !watch,
  sourcemap: watch,
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

fs.copyFileSync(path.join(root, 'admin', 'styles.css'), path.join(assetsDir, 'admin.css'));
fs.writeFileSync(
  path.join(outDir, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CMC Admin</title>
  <link rel="stylesheet" href="/assets/admin.css" />
</head>
<body>
  <div id="root"></div>
  <script src="/assets/admin.js"></script>
</body>
</html>
`,
);

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching admin…');
} else {
  await esbuild.build(options);
  console.log('admin built.');
}
