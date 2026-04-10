/**
 * Downloads ALL model files needed for the pipeline:
 * 1. face-api.js models (face detection + recognition)
 * 2. MediaPipe FaceMesh WASM + model files
 * 3. MediaPipe Pose WASM + model files
 *
 * Run once: node scripts/download-models.js
 * Files saved to: public/models/
 */
import https from 'https';
import http  from 'http';
import fs    from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT       = path.join(__dirname, '..', 'public', 'models');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── face-api.js models ────────────────────────────────────────────────────────
const FACE_API_BASE = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
const FACE_API_FILES = [
  // TinyFaceDetector (fast, frontal)
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  // SsdMobilenetv1 (better angles, side faces)
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  // Landmarks + recognition
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

// ── MediaPipe Camera Utils ────────────────────────────────────────────────────
const CAM_BASE  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils';
const CAM_DIR   = path.join(OUT, 'camera_utils');
const CAM_FILES = ['camera_utils.js'];

// ── MediaPipe FaceMesh ────────────────────────────────────────────────────────
const FM_BASE  = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4';
const FM_DIR   = path.join(OUT, 'face_mesh');
const FM_FILES = [
  'face_mesh_solution_packed_assets_loader.js',
  'face_mesh_solution_packed_assets.data',
  'face_mesh_solution_simd_wasm_bin.js',
  'face_mesh_solution_simd_wasm_bin.wasm',
  'face_mesh_solution_wasm_bin.js',
  'face_mesh_solution_wasm_bin.wasm',
];

// ── MediaPipe Pose ────────────────────────────────────────────────────────────
const POSE_BASE  = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5';
const POSE_DIR   = path.join(OUT, 'pose');
const POSE_FILES = [
  'pose_solution_packed_assets_loader.js',
  'pose_solution_packed_assets.data',
  'pose_solution_simd_wasm_bin.js',
  'pose_solution_simd_wasm_bin.wasm',
  'pose_solution_wasm_bin.js',
  'pose_solution_wasm_bin.wasm',
  'pose_landmark_full.tflite',
  'pose_landmark_lite.tflite',
  'pose_landmark_heavy.tflite',
];

// ── Download helper ───────────────────────────────────────────────────────────
function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      console.log(`  skip (exists): ${path.basename(dest)}`);
      return resolve();
    }
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(dest);

    const req = proto.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log(`  ✓ ${path.basename(dest)}`); resolve(); });
    });
    req.on('error', e => { file.close(); try { fs.unlinkSync(dest); } catch(_){} reject(e); });
  });
}

async function downloadAll(label, baseUrl, dir, files) {
  console.log(`\n── ${label} ──`);
  for (const f of files) {
    try {
      await download(`${baseUrl}/${f}`, path.join(dir, f));
    } catch (e) {
      console.warn(`  ✗ FAILED: ${f} — ${e.message}`);
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('Downloading all AI model files...');
console.log(`Output: ${OUT}\n`);

await downloadAll('face-api.js models', FACE_API_BASE, OUT,      FACE_API_FILES);
await downloadAll('MediaPipe Camera',   CAM_BASE,       CAM_DIR,  CAM_FILES);
await downloadAll('MediaPipe FaceMesh', FM_BASE,        FM_DIR,   FM_FILES);
await downloadAll('MediaPipe Pose',     POSE_BASE,      POSE_DIR, POSE_FILES);

console.log('\n✅ Done. All models saved locally.');
console.log('Now run: npm run dev');
