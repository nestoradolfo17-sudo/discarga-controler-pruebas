import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, type Plugin} from 'vite';

// Módulo ZR (public/zr): usa SheetJS como archivo suelto. Al publicar, se
// reemplaza con la MISMA versión que usa la app (node_modules/xlsx, 0.20.3 o
// superior), así ZR no queda con una versión vieja con fallas conocidas.
const zrXlsxActual = (): Plugin => ({
  name: 'zr-xlsx-actual',
  apply: 'build',
  closeBundle() {
    const origen = path.resolve(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js');
    const destino = path.resolve(__dirname, 'dist/zr/vendor/xlsx.full.min.js');
    try {
      if (!fs.existsSync(origen) || !fs.existsSync(path.dirname(destino))) return;
      fs.copyFileSync(origen, destino);
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'node_modules/xlsx/package.json'), 'utf-8'));
      console.log(`[zr] SheetJS de ZR actualizado a ${pkg.version}`);
    } catch (e) {
      console.warn('[zr] No se pudo actualizar SheetJS de ZR:', (e as Error).message);
    }
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), zrXlsxActual()],
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
