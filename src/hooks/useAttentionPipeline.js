/**
 * AI Pipeline — rAF loop with proper object detection for phone and pose-based fight detection.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { BACKEND_URL, SEND_INTERVAL_MS } from '../config';
import { useFaceRecognition } from './useFaceRecognition';
import { getMediaPipe } from './useMediaPipe';
import { usePhoneDetector } from './usePhoneDetector';
import { FightDetector } from './useFightDetector';

const POSTURE_SCORES = { upright:1.0, slouching:0.4, head_down:0.2, sleeping:0.0, unknown:0.5 };

function calcScore(g, p, phone) {
  return Math.round((g*0.4 + (POSTURE_SCORES[p]??0.5)*0.3 + (phone?0:1)*0.3)*100)/100;
}

function estimateGaze(lms) {
  if (!lms || lms.length < 300) return { gazeScore:0.5, status:'no lms', yaw:0, pitch:0 };
  const nose=lms[1], lEye=lms[33], rEye=lms[263], chin=lms[152], fore=lms[10];
  const emx=(lEye.x+rEye.x)/2, emy=(lEye.y+rEye.y)/2;
  const ew=Math.abs(rEye.x-lEye.x), fh=Math.abs(chin.y-fore.y);
  if (ew<0.01||fh<0.01) return { gazeScore:0.5, status:'tiny', yaw:0, pitch:0 };
  const yr=(nose.x-emx)/ew, pr=(nose.y-emy)/fh;
  const fwd=Math.abs(yr)<0.18 && pr>-0.10 && pr<0.45;
  return { gazeScore:fwd?1.0:0.0, status:fwd?'forward':'away', yaw:Math.round(yr*100), pitch:Math.round(pr*100) };
}

function estimatePosture(lm) {
  if (!lm) return { status:'unknown', reason:'no pose' };
  const nose=lm[0], lSh=lm[11], rSh=lm[12];
  if (!nose||!lSh||!rSh) return { status:'unknown', reason:'missing kp' };
  if ((lSh.visibility??1)<0.25||(rSh.visibility??1)<0.25) return { status:'unknown', reason:'low vis' };
  const gap=(lSh.y+rSh.y)/2-nose.y;
  const s=gap>0.18?'upright':gap>0.08?'slouching':gap>0.01?'head_down':'sleeping';
  return { status:s, reason:`gap=${gap.toFixed(2)}` };
}

function drawOverlay(ctx, w, h, data) {
  const { faces, gaze, posture, phone, poseLandmarks, faceApiResults, fight, fightSignals=[] } = data;
  const fx = x => w-x;

  for (const f of faceApiResults) {
    const {x,y,width:bw,height:bh}=f.bbox;
    const color=f.name!=='UNKNOWN'?'#00dc82':'#f59e0b';
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.strokeRect(fx(x+bw),y,bw,bh);
    ctx.fillStyle=color; ctx.font='bold 14px sans-serif'; ctx.textAlign='left';
    ctx.fillText(f.name+(f.name!=='UNKNOWN'?` ${Math.round(f.confidence*100)}%`:''),fx(x+bw),Math.max(y-6,14));
  }
  if (!faceApiResults.length) {
    faces.forEach(lms=>{
      let x0=1,x1=0,y0=1,y1=0;
      for(const l of lms){x0=Math.min(x0,l.x);x1=Math.max(x1,l.x);y0=Math.min(y0,l.y);y1=Math.max(y1,l.y);}
      ctx.strokeStyle='#00dc82'; ctx.lineWidth=2;
      ctx.strokeRect(fx(x1*w),y0*h,(x1-x0)*w,(y1-y0)*h);
    });
  }
  if (poseLandmarks) {
    const B=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]];
    ctx.strokeStyle='#36a2eb'; ctx.lineWidth=2;
    for(const[a,b]of B){const pa=poseLandmarks[a],pb=poseLandmarks[b];if(pa&&pb&&(pa.visibility??1)>0.25&&(pb.visibility??1)>0.25){ctx.beginPath();ctx.moveTo(fx(pa.x*w),pa.y*h);ctx.lineTo(fx(pb.x*w),pb.y*h);ctx.stroke();}}
    ctx.fillStyle='#36a2eb';
    for(const i of[0,11,12,13,14,15,16]){const p=poseLandmarks[i];if(p&&(p.visibility??1)>0.25){ctx.beginPath();ctx.arc(fx(p.x*w),p.y*h,4,0,Math.PI*2);ctx.fill();}}
  }
  const hasFace=faces.length>0||faceApiResults.length>0;
  if (hasFace) {
    const lines=[
      {t:`👁 ${gaze.status} y:${gaze.yaw} p:${gaze.pitch}`, c:gaze.gazeScore>=1?'#00dc82':'#f59e0b'},
      {t:`🧍 ${posture.status} ${posture.reason}`, c:posture.status==='upright'?'#00dc82':posture.status==='slouching'?'#f59e0b':'#ef4444'},
      {t:`📱 ${phone.detected?'PHONE DETECTED':'no phone'} — ${phone.reason||''}`, c:phone.detected?'#ef4444':'#888'},
      {t:`⚠️ fight:${fight?'YES':'no'} signals:[${fightSignals.slice(0,2).join(',')}]`, c:fight?'#ef4444':'#888'},
    ];
    ctx.fillStyle='#000000dd'; ctx.fillRect(0,h-lines.length*18-4,w,lines.length*18+4);
    lines.forEach((l,i)=>{ctx.fillStyle=l.c;ctx.font='11px monospace';ctx.textAlign='left';ctx.fillText(l.t,6,h-(lines.length-i-1)*18-4);});
  }

  // Draw phone bounding boxes from COCO-SSD
  if (phone.detected && phone.boxes) {
    for (const box of phone.boxes) {
      // COCO-SSD returns coords in original (non-mirrored) space — flip x
      const drawX = fx(box.x + box.width);
      ctx.strokeStyle='#ef4444'; ctx.lineWidth=3;
      ctx.strokeRect(drawX, box.y, box.width, box.height);
      ctx.fillStyle='#ef4444'; ctx.font='bold 13px sans-serif'; ctx.textAlign='left';
      ctx.fillText(`📱 ${(box.score*100).toFixed(0)}%`, drawX, Math.max(box.y-5,14));
    }
  }

  if (fight) {
    ctx.fillStyle='#ef444488'; ctx.fillRect(0,0,w,36);
    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
    ctx.fillText('⚠️ POTENTIAL FIGHT DETECTED',w/2,24);
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useAttentionPipeline({ videoRef, canvasRef, studentName, isRunning, onResult }) {
  const [modelsReady, setModelsReady] = useState(false);
  const { detectAndIdentify, modelsLoaded: faceModelsLoaded } = useFaceRecognition();
  const { detect: detectPhoneCoco, ready: phoneModelReady } = usePhoneDetector();

  // All state in one ref — no stale closures
  const R = useRef({
    faces:[], faceApiResults:[], poseLandmarks:null,
    gaze:{gazeScore:0.5,status:'init',yaw:0,pitch:0},
    posture:{status:'unknown',reason:'init'},
    phone:{detected:false,boxes:[],reason:'loading COCO-SSD...'},
    fight:{fight:false,signals:[],confidence:0},
    fightDet: new FightDetector(),
    lastFaceSend:0, lastBackendSend:0, lastPhoneSend:0,
    lastFMSend:0, lastPoseSend:0,
    fmCrashed: false, poseCrashed: false,
  });

  const faceMeshRef    = useRef(null);
  const poseRef        = useRef(null);
  const rafRef         = useRef(null);
  const faceApiRef     = useRef(detectAndIdentify);
  const phoneDetectRef = useRef(detectPhoneCoco);
  useEffect(()=>{ faceApiRef.current     = detectAndIdentify; },[detectAndIdentify]);
  useEffect(()=>{ phoneDetectRef.current = detectPhoneCoco;   },[detectPhoneCoco]);

  const sendToBackend = useCallback(async (payload) => {
    try {
      await fetch(`${BACKEND_URL}/attention`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    } catch(_){}
  },[]);

  // ── rAF loop ──────────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const video = videoRef.current;
    const r     = R.current;
    const now   = Date.now();

    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      // FaceMesh every 200ms (5fps) — enough for gaze/landmark tracking
      if (!r.fmCrashed && faceMeshRef.current && now - r.lastFMSend >= 200) {
        r.lastFMSend = now;
        faceMeshRef.current.send({ image: video }).catch(e => {
          if (!r.fmCrashed) {
            r.fmCrashed = true;
            console.error('[FaceMesh] crashed, stopping sends:', e.message);
          }
        });
      }
      // Pose every 250ms (4fps) — posture/fight don't need higher
      if (!r.poseCrashed && poseRef.current && now - r.lastPoseSend >= 250) {
        r.lastPoseSend = now;
        poseRef.current.send({ image: video }).catch(e => {
          if (!r.poseCrashed) {
            r.poseCrashed = true;
            console.error('[Pose] crashed, stopping sends:', e.message);
          }
        });
      }
      // Face recognition every 3s (heavy SSD model — run infrequently)
      if (now - r.lastFaceSend > 3000) {
        r.lastFaceSend = now;
        faceApiRef.current(video).then(res=>{ r.faceApiResults=res; });
      }
      // Phone detection via COCO-SSD every 600ms — fast enough for smooth detection
      if (now - r.lastPhoneSend > 600) {
        r.lastPhoneSend = now;
        phoneDetectRef.current(video).then(res=>{ r.phone=res; });
      }
      // Fight detection every 200ms (not every frame — it's pure math, but no need to spam)
      if (now - (r.lastFightCheck || 0) >= 200) {
        r.lastFightCheck = now;
        r.fight = r.fightDet.update(r.faces, r.poseLandmarks);
      }
      // Send to backend — ONLY for recognized enrolled students
      if (now - r.lastBackendSend >= SEND_INTERVAL_MS) {
        const identified = r.faceApiResults.filter(f=>f.name!=='UNKNOWN');
        if (identified.length > 0) {
          // We have a recognized face — send data under each identified name
          const attn = calcScore(r.gaze.gazeScore, r.posture.status, r.phone.detected);
          for (const f of identified) {
            const p={
              student_id:f.name, attention_score:attn, gaze_score:r.gaze.gazeScore,
              posture:r.posture.status, phone_detected:r.phone.detected,
              fight_detected:r.fight.fight,
            };
            sendToBackend(p);
            onResult?.(p);
          }
          r.lastBackendSend = now;
        } else if (r.faces.length > 0 || r.faceApiResults.length > 0) {
          // Face visible but not recognized — only update local UI, don't send to backend
          const attn = calcScore(r.gaze.gazeScore, r.posture.status, r.phone.detected);
          onResult?.({
            student_id: 'Scanning...', attention_score: attn,
            gaze_score: r.gaze.gazeScore, posture: r.posture.status,
            phone_detected: r.phone.detected, fight_detected: r.fight.fight,
          });
          r.lastBackendSend = now;
        }
      }
    }

    // Draw overlay every frame
    const canvas = canvasRef?.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawOverlay(ctx,canvas.width,canvas.height,{
        faces:r.faces, gaze:r.gaze, posture:r.posture, phone:r.phone,
        poseLandmarks:r.poseLandmarks, faceApiResults:r.faceApiResults, fight:r.fight.fight,
        fightSignals:r.fight.signals||[],
      });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [videoRef, canvasRef, studentName, sendToBackend, onResult]);

  // Start/stop
  useEffect(() => {
    if (isRunning) {
      const r = R.current;
      r.faces=[]; r.faceApiResults=[]; r.poseLandmarks=null;
      r.gaze={gazeScore:0.5,status:'starting',yaw:0,pitch:0};
      r.posture={status:'unknown',reason:'starting'};
      r.phone={detected:false,boxes:[],reason:'starting'};
      r.fight={fight:false,signals:[],confidence:0};
      r.fightDet.reset();
      r.lastBackendSend=0; r.lastFaceSend=0; r.lastPhoneSend=0;
      r.fmCrashed=false; r.poseCrashed=false;
      r.lastFMSend=0; r.lastPoseSend=0;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isRunning, loop]);

  // Init MediaPipe — singleton, runs once per page load regardless of remounts
  useEffect(() => {
    getMediaPipe().then(({ faceMesh, pose }) => {
      // Attach result handlers (safe to re-attach on remount)
      faceMesh.onResults(({ multiFaceLandmarks }) => {
        const faces = multiFaceLandmarks || [];
        R.current.faces = faces;
        R.current.gaze  = faces.length > 0
          ? estimateGaze(faces[0])
          : { gazeScore: 0.5, status: 'no face', yaw: 0, pitch: 0 };
      });
      pose.onResults(({ poseLandmarks }) => {
        R.current.poseLandmarks = poseLandmarks || null;
        R.current.posture = estimatePosture(R.current.poseLandmarks);
      });
      faceMeshRef.current = faceMesh;
      poseRef.current     = pose;
      setModelsReady(true);
    }).catch(e => {
      console.error('[MediaPipe]', e.message);
      setModelsReady(true); // don't block the app
    });
    // No cleanup — singleton instances must not be closed on unmount
  }, []);

  useEffect(() => { if (faceModelsLoaded) setModelsReady(true); }, [faceModelsLoaded]);

  return { modelsReady: modelsReady && faceModelsLoaded, phoneModelReady };
}
