/**
 * Phone detection Web Worker.
 * Runs COCO-SSD in complete isolation from the main thread.
 * face-api.js (TF 1.7) and COCO-SSD (TF 4.x) never share the same context.
 */

let model = null;
let ready = false;

async function loadModel() {
  try {
    // Import TF.js 4.x and COCO-SSD inside the worker
    const tf      = await import('@tensorflow/tfjs');
    const cocoSsd = await import('@tensorflow-models/coco-ssd');

    // Workers don't have WebGL — use WASM or CPU
    try { await tf.setBackend('wasm'); }
    catch { await tf.setBackend('cpu'); }
    await tf.ready();

    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

    // Warmup
    const imgData = new ImageData(64, 64);
    const tensor  = tf.browser.fromPixels(imgData);
    await model.detect(tensor);
    tensor.dispose();

    ready = true;
    self.postMessage({ type: 'ready', backend: tf.getBackend() });
    console.log('[Worker] COCO-SSD ready, backend:', tf.getBackend());
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
}

self.onmessage = async (e) => {
  const { type, id, imageBitmap } = e.data;

  if (type === 'load') {
    loadModel();
    return;
  }

  if (type === 'detect') {
    if (!ready || !model) {
      self.postMessage({ type: 'result', id, detected: false, boxes: [], reason: 'not ready' });
      return;
    }
    try {
      const tf = await import('@tensorflow/tfjs');
      // Draw bitmap to offscreen canvas for detection
      const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx    = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const tensor    = tf.browser.fromPixels(imageData);

      const preds  = await model.detect(tensor);
      tensor.dispose();
      imageBitmap.close();

      const phones = preds.filter(p => p.class === 'cell phone' && p.score > 0.30);
      self.postMessage({
        type: 'result', id,
        detected: phones.length > 0,
        boxes: phones.map(p => ({
          x: p.bbox[0], y: p.bbox[1],
          width: p.bbox[2], height: p.bbox[3],
          score: p.score,
        })),
        reason: phones.length > 0
          ? `${phones.length} phone(s) ${(phones[0].score * 100).toFixed(0)}%`
          : `no phone (${preds.length} obj)`,
      });
    } catch (err) {
      self.postMessage({ type: 'result', id, detected: false, boxes: [], reason: err.message });
    }
  }
};

// Auto-start loading
loadModel();
