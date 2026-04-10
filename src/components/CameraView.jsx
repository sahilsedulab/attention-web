import { useRef, useState, useEffect, useCallback } from 'react';
import { useAttentionPipeline } from '../hooks/useAttentionPipeline';

export default function CameraView({ studentName, onResult }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [isRunning,  setIsRunning]  = useState(false);
  const [camError,   setCamError]   = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const handleResult = useCallback((r) => {
    setLastResult(r);
    onResult?.(r);
  }, [onResult]);

  const { modelsReady, phoneModelReady } = useAttentionPipeline({
    videoRef, canvasRef, studentName, isRunning, onResult: handleResult,
  });

  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 640x480 is optimal for AI models — HD wastes GPU on extra pixels
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        if (canvasRef.current) {
          // Set canvas pixel dimensions to match actual video stream
          canvasRef.current.width  = video.videoWidth  || 640;
          canvasRef.current.height = video.videoHeight || 480;
        }
      }
      setIsRunning(true);
    } catch (e) {
      setCamError(`Camera error: ${e.message}`);
    }
  };

  const stopCamera = () => {
    setIsRunning(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLastResult(null);
  };

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), []);

  return (
    <div style={s.container}>
      {/* Model loading banner */}
      {!modelsReady && (
        <div style={s.loadingBanner}>
          ⏳ Loading AI models... first load may take 10–20s
        </div>
      )}

      {/* Video + canvas overlay — fills full card width */}
      <div style={s.videoWrapper}>
        <video ref={videoRef} style={s.video} autoPlay muted playsInline />
        <canvas ref={canvasRef} style={s.canvas} />
        {!isRunning && (
          <div style={s.placeholder}>
            <span style={{ fontSize: 48 }}>📷</span>
            <p style={{ marginTop: 8, color: '#666' }}>Camera not started</p>
          </div>
        )}
      </div>

      {camError && <p style={s.error}>{camError}</p>}

      {/* Controls */}
      <div style={s.controls}>
        {!isRunning ? (
          <button style={s.btnStart} onClick={startCamera} disabled={!modelsReady}>
            {modelsReady ? '▶ Start Camera' : '⏳ Loading models...'}
          </button>
        ) : (
          <button style={s.btnStop} onClick={stopCamera}>■ Stop</button>
        )}
      </div>

      {/* Live result strip */}
      {lastResult && isRunning && (
        <div style={s.resultBar}>
          <ResultChip label={`👤 ${lastResult.student_id}`} />
          <ResultChip
            label={`🧠 ${Math.round(lastResult.attention_score * 100)}%`}
            color={lastResult.attention_score >= 0.8 ? '#00dc82' : lastResult.attention_score >= 0.5 ? '#f59e0b' : '#ef4444'}
          />
          <ResultChip
            label={lastResult.gaze_score >= 1 ? '👁 Forward' : '👁 Away'}
            color={lastResult.gaze_score >= 1 ? '#00dc82' : '#f59e0b'}
          />
          <ResultChip
            label={`🧍 ${lastResult.posture}`}
            color={lastResult.posture === 'upright' ? '#00dc82' : '#f59e0b'}
          />
          {lastResult.phone_detected && <ResultChip label="📱 Phone!" color="#ef4444" />}
          {lastResult.fight_detected && <ResultChip label="⚠️ Fight!" color="#ef4444" />}
        </div>
      )}
      <p style={{ fontSize: 11, color: '#444', textAlign: 'center', margin: 0 }}>
        Gaze + posture debug values shown on camera overlay (top-left)
      </p>
    </div>
  );
}

function ResultChip({ label, color = '#e0e0e0' }) {
  return (
    <span style={{ ...s.chip, color, borderColor: color + '55', background: color + '11' }}>
      {label}
    </span>
  );
}

const s = {
  container:     { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch', width: '100%' },
  loadingBanner: { width: '100%', background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#f59e0b', textAlign: 'center' },
  // 16:9 wrapper — fills full card width, no cropping
  videoWrapper:  { position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 12, overflow: 'hidden' },
  // objectFit: contain — shows the ENTIRE camera frame, no cropping
  video:         { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', transform: 'scaleX(-1)' },
  // Canvas overlays exactly on top — same pixel dimensions as video stream
  canvas:        { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  placeholder:   { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  controls:      { display: 'flex', gap: 12, justifyContent: 'center' },
  btnStart:      { padding: '10px 28px', background: '#00dc82', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  btnStop:       { padding: '10px 28px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  error:         { color: '#ef4444', fontSize: 13, textAlign: 'center' },
  resultBar:     { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  chip:          { fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 8, border: '1px solid' },
};
