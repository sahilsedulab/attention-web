import { useRef, useState, useEffect, useCallback } from 'react';
import { useFaceRecognition } from '../hooks/useFaceRecognition';

export default function EnrollmentPanel() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  const [name,      setName]      = useState('');
  const [camOpen,   setCamOpen]   = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [progress,  setProgress]  = useState('');
  const [status,    setStatus]    = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  const { modelsLoaded, enrollments, enroll, deleteEnrollment } = useFaceRecognition();

  // ── Camera ──────────────────────────────────────────────────────────────────
  const openCamera = async () => {
    setStatus(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCamOpen(true);   // render the video element first
    } catch (e) {
      setStatus({ type: 'error', msg: `Camera error: ${e.message}` });
    }
  };

  // Attach stream once video element is in the DOM (camOpen = true)
  useEffect(() => {
    if (camOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      // autoPlay handles playback — no need to call .play()
    }
  }, [camOpen]);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCamOpen(false);
    setCountdown(null);
    setProgress('');
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Enrollment flow ─────────────────────────────────────────────────────────
  const startEnrollment = async () => {
    if (!name.trim())   { setStatus({ type: 'error', msg: 'Enter a name first.' }); return; }
    if (!modelsLoaded)  { setStatus({ type: 'error', msg: 'Models still loading, please wait.' }); return; }
    if (!camOpen)       { setStatus({ type: 'error', msg: 'Open the camera first.' }); return; }

    setStatus(null);
    setEnrolling(true);

    // 3-second countdown
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCountdown('📸');
    await new Promise(r => setTimeout(r, 400));
    setCountdown(null);

    try {
      const framesUsed = await enroll(name.trim(), videoRef.current, setProgress);
      setStatus({
        type: 'success',
        msg:  `✅ "${name.trim()}" enrolled using ${framesUsed}/15 frames.`,
      });
      setName('');
      closeCamera();
    } catch (e) {
      setStatus({ type: 'error', msg: `❌ ${e.message}` });
    }

    setEnrolling(false);
    setProgress('');
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = (n) => {
    if (!confirm(`Remove "${n}" from face recognition?`)) return;
    deleteEnrollment(n);
    setStatus({ type: 'success', msg: `"${n}" removed.` });
  };

  return (
    <div style={s.page}>
      <h2 style={s.title}>👤 Student Enrollment</h2>
      <p style={s.subtitle}>
        Enroll students so the system can identify them by face.
        Embeddings are stored in your browser (localStorage) and persist across sessions.
      </p>

      {!modelsLoaded && (
        <div style={s.banner}>
          ⏳ Loading face recognition models... this takes 10–20s on first load
        </div>
      )}

      {/* ── Enroll form ── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>Enroll New Student</h3>

        <div style={s.row}>
          <input
            style={s.input}
            placeholder="Student name (e.g. Rohit)"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !camOpen && openCamera()}
            disabled={enrolling}
          />
          {!camOpen ? (
            <button
              style={{ ...s.btnSecondary, opacity: modelsLoaded ? 1 : 0.5 }}
              onClick={openCamera}
              disabled={!modelsLoaded}
            >
              📷 Open Camera
            </button>
          ) : (
            <button
              style={{ ...s.btnSecondary, borderColor: '#ef4444', color: '#ef4444' }}
              onClick={closeCamera}
              disabled={enrolling}
            >
              ✕ Close
            </button>
          )}
        </div>

        {/* Camera preview — always in DOM when camOpen, video element gets stream via useEffect */}
        <div style={{ ...s.videoWrap, display: camOpen ? 'block' : 'none' }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={s.video}
          />

          {/* Countdown overlay */}
          {countdown !== null && (
            <div style={s.overlay}>
              <span style={s.countdownNum}>{countdown}</span>
            </div>
          )}

          {/* Face guide oval */}
          <div style={s.faceGuide} />

          {/* Instructions */}
          <div style={s.hint}>Centre your face in the oval and look at the camera</div>
        </div>

        {progress && <p style={s.progress}>{progress}</p>}

        {status && (
          <div style={{
            ...s.statusBox,
            borderColor: status.type === 'success' ? '#00dc82' : '#ef4444',
            color:       status.type === 'success' ? '#00dc82' : '#ef4444',
            background:  status.type === 'success' ? '#00dc8211' : '#ef444411',
          }}>
            {status.msg}
          </div>
        )}

        <button
          style={{
            ...s.btnPrimary,
            opacity: (!camOpen || enrolling || !modelsLoaded) ? 0.45 : 1,
            cursor:  (!camOpen || enrolling || !modelsLoaded) ? 'not-allowed' : 'pointer',
          }}
          onClick={startEnrollment}
          disabled={!camOpen || enrolling || !modelsLoaded}
        >
          {enrolling
            ? (progress || 'Enrolling...')
            : '▶ Start Enrollment  (3 second countdown)'}
        </button>
      </div>

      {/* ── Enrolled list ── */}
      <div style={s.card}>
        <h3 style={s.cardTitle}>
          Enrolled Students
          <span style={s.badge}>{enrollments.length}</span>
        </h3>

        {enrollments.length === 0 ? (
          <p style={s.empty}>No students enrolled yet. Use the form above.</p>
        ) : (
          <div style={s.list}>
            {enrollments.map(e => (
              <div key={e.name} style={s.listItem}>
                <div style={s.avatar}>{e.name[0]?.toUpperCase()}</div>
                <div style={s.listInfo}>
                  <span style={s.listName}>{e.name}</span>
                  <span style={s.listSub}>{e.descriptors?.length || 1} face angle(s) stored</span>
                </div>
                <button style={s.deleteBtn} onClick={() => handleDelete(e.name)} title="Remove enrollment">
                  🗑 Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:         { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680, margin: '0 auto' },
  title:        { fontSize: 22, fontWeight: 700, color: '#e0e0e0', margin: 0 },
  subtitle:     { fontSize: 13, color: '#888', margin: 0, lineHeight: 1.5 },
  banner:       { background: '#1a1a2e', border: '1px solid #f59e0b55', borderRadius: 8, padding: '10px 14px', color: '#f59e0b', fontSize: 13 },
  card:         { background: '#12122a', border: '1px solid #222', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  cardTitle:    { fontSize: 16, fontWeight: 700, color: '#e0e0e0', margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
  badge:        { background: '#00dc8222', color: '#00dc82', borderRadius: 10, padding: '1px 10px', fontSize: 13, fontWeight: 700 },
  row:          { display: 'flex', gap: 10 },
  input:        { flex: 1, background: '#0d0d1a', border: '1px solid #333', color: '#e0e0e0', padding: '9px 14px', borderRadius: 8, fontSize: 14, outline: 'none' },
  btnSecondary: { padding: '9px 18px', background: '#1a1a2e', border: '1px solid #444', color: '#e0e0e0', borderRadius: 8, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' },
  btnPrimary:   { padding: '12px 0', background: '#00dc82', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, width: '100%' },
  // Video wrapper — fixed height so it never collapses
  videoWrap:    { position: 'relative', width: '100%', height: 360, background: '#000', borderRadius: 12, overflow: 'hidden' },
  video:        { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  overlay:      { position: 'absolute', inset: 0, background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  countdownNum: { fontSize: 100, fontWeight: 900, color: '#fff', textShadow: '0 0 40px #00dc82' },
  faceGuide:    { position: 'absolute', top: '8%', left: '28%', width: '44%', height: '78%', border: '2px dashed #00dc8288', borderRadius: '50%', pointerEvents: 'none' },
  hint:         { position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#888' },
  progress:     { fontSize: 13, color: '#f59e0b', margin: 0 },
  statusBox:    { border: '1px solid', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  empty:        { color: '#555', fontSize: 13, margin: 0 },
  list:         { display: 'flex', flexDirection: 'column', gap: 8 },
  listItem:     { display: 'flex', alignItems: 'center', gap: 12, background: '#0d0d1a', padding: '10px 14px', borderRadius: 10 },
  avatar:       { width: 38, height: 38, borderRadius: '50%', background: '#1565c033', color: '#36a2eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, flexShrink: 0 },
  listInfo:     { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  listName:     { fontWeight: 600, color: '#e0e0e0', fontSize: 14 },
  listSub:      { fontSize: 11, color: '#555' },
  deleteBtn:    { background: '#ef444422', border: '1px solid #ef444455', borderRadius: 8, cursor: 'pointer', fontSize: 13, padding: '6px 12px', color: '#ef4444', fontWeight: 600 },
};
