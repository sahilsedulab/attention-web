/**
 * MediaPipe singleton loader.
 *
 * Critical: MediaPipe WASM can only be initialized ONCE per page.
 * Re-initialization (e.g. from React StrictMode double-mount) causes
 * "Module.arguments has been replaced" abort.
 *
 * Solution:
 * - Module-level singleton promise — runs exactly once per page load
 * - FaceMesh fully initialized before Pose starts loading
 * - Instances stored at module level, never recreated
 */

// Module-level singletons — survive React remounts
let _faceMesh = null;
let _pose     = null;
let _initPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`Failed: ${src}`));
    document.head.appendChild(s);
  });
}

function waitForGlobal(name) {
  return new Promise((resolve, reject) => {
    if (window[name]) { resolve(window[name]); return; }
    let tries = 0;
    const t = setInterval(() => {
      if (window[name]) { clearInterval(t); resolve(window[name]); }
      else if (++tries > 100) { clearInterval(t); reject(new Error(`${name} not found`)); }
    }, 100);
  });
}

function initAll() {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Load FaceMesh script
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js');
    const FaceMesh = await waitForGlobal('FaceMesh');

    // Create and initialize FaceMesh instance
    _faceMesh = new FaceMesh({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`,
    });
    _faceMesh.setOptions({
      maxNumFaces: 3, refineLandmarks: false,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.4,
    });
    await _faceMesh.initialize();
    console.log('[FaceMesh] initialized');

    // Only load Pose AFTER FaceMesh WASM is fully done
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js');
    const Pose = await waitForGlobal('Pose');

    _pose = new Pose({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}`,
    });
    _pose.setOptions({
      modelComplexity: 0, smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.4,
    });
    await _pose.initialize();
    console.log('[Pose] initialized');

    return { faceMesh: _faceMesh, pose: _pose };
  })();

  return _initPromise;
}

// Start loading immediately when module is imported
initAll().catch(e => console.error('[MediaPipe] init failed:', e.message));

export function getMediaPipe() {
  return initAll();
}
