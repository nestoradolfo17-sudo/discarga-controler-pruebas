import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Netlify indica al publicar qué se está construyendo: CONTEXT
    // ("production", "branch-deploy", "deploy-preview") y BRANCH. La app lo usa
    // para saber si es la versión DEMO sin depender de la dirección web (ver
    // src/services/demoMode.ts). En la computadora quedan vacíos.
    define: {
      __NETLIFY_CONTEXT__: JSON.stringify(process.env.CONTEXT || ''),
      __NETLIFY_BRANCH__: JSON.stringify(process.env.BRANCH || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
