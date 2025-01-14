import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      'three/webgpu': 'three'
    }
  },
  build: {
    sourcemap: false, // Désactivé pour une meilleure obfuscation
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['bootstrap', 'postprocessing'],
          https: ['https']
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        dead_code: true,
        drop_console: true, // Supprime les console.log
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 3,
        unsafe: true,
        unsafe_math: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        conditionals: true,
        switches: true,
        sequences: true,
        booleans: true,
        typeofs: true,
        loops: true,
        unused: true,
        properties: true,
        join_vars: true,
        collapse_vars: true,
        reduce_vars: true,
        hoist_props: true,
        keep_classnames: false, // Modifié pour permettre l'obfuscation des noms de classes
        keep_fnames: false, // Modifié pour permettre l'obfuscation des noms de fonctions
      },
      mangle: {
        eval: true,
        toplevel: true, // Mangle les noms au niveau supérieur
        safari10: true,
        properties: {
          regex: /^_/ // Mangle uniquement les propriétés commençant par _
        },
        keep_classnames: false,
        keep_fnames: false
      },
      format: {
        comments: false, // Supprime tous les commentaires
        beautify: false,
        ascii_only: true
      }
    }
  },
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: true,
    logger: {
      level: 'error'
    },
    hmr: {
      overlay: false
    }
  },
  optimizeDeps: {
    include: ['three', 'postprocessing']
  },
  define: {
    'API_URL': JSON.stringify(process.env.VITE_API_URL),
    'CLIENT_ID': JSON.stringify(process.env.VITE_CLIENT_ID),
    'REDIRECT_URI': JSON.stringify(process.env.VITE_REDIRECT_URI),
    'VITE_BACKEND_URL': JSON.stringify(process.env.VITE_BACKEND_URL),
    'VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL)
  },
  logLevel: 'error'
});