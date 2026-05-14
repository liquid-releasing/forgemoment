import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Dual-purpose config:
//   `npm run dev`     → boots the playground in src-playground/ for
//                        component dogfooding. Hot module reload, the
//                        works.
//   `npm run build`   → produces the library bundle from src/index.js.
//                        ES + CJS outputs, externalises react / react-dom
//                        / lucide-react so consumers de-dupe.
export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      plugins: [react()],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.js'),
          name: 'forgemoment',
          fileName: (format) => `forgemoment.${format === 'es' ? 'es' : 'cjs'}.js`,
          formats: ['es', 'cjs'],
        },
        rollupOptions: {
          // React + lucide are runtime deps in the consumer app; not
          // bundling them keeps the library light and avoids the
          // dueling-Reacts hooks bug.
          external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
          output: {
            assetFileNames: (asset) =>
              asset.name === 'style.css' ? 'forgemoment.css' : asset.name,
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react/jsx-runtime': 'jsxRuntime',
              'lucide-react': 'LucideReact',
            },
          },
        },
      },
    };
  }
  return {
    plugins: [react()],
    root: 'src-playground',
    resolve: {
      // Let the playground import the components by package name so the
      // imports match what consumer apps will write. No relative paths
      // poisoning the dev experience. The `/styles` subpath mirrors the
      // package.json exports map (`./styles` → src/tokens.css) so
      // `import 'forgemoment/styles'` works the same in playground and
      // in real consumer apps.
      alias: [
        { find: 'forgemoment/styles', replacement: resolve(__dirname, 'src/tokens.css') },
        { find: 'forgemoment',        replacement: resolve(__dirname, 'src/index.js') },
      ],
    },
    server: { port: 5174 },
  };
});
