import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/@mediapipe/face_mesh/*', dest: 'face_mesh' },
        { src: 'node_modules/@mediapipe/pose/*',      dest: 'pose' },
      ],
    }),
  ],
  server: {
    fs: { allow: ['..'] },
    headers: {
      // Required for SharedArrayBuffer (MediaPipe SIMD)
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Tell Vite not to process .wasm files — serve them as-is
  assetsInclude: ['**/*.wasm', '**/*.data', '**/*.binarypb', '**/*.tflite'],
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh', '@mediapipe/pose'],
  },
});
