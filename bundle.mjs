import esbuild from 'esbuild';
import { esbuildPluginVersionInjector } from 'esbuild-plugin-version-injector';

await esbuild.build({
  logLevel: "info",
  bundle: true,
  minify: true,
  platform: 'node',
  entryPoints: ['./dist/astgen.js'],
  outdir: './bundle',
  plugins: [esbuildPluginVersionInjector()]
});
