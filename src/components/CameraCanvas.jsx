import { useRef, useEffect, useCallback } from 'react';

/**
 * CameraCanvas — Renders webcam feed onto a <canvas> element.
 *
 * Props:
 *  - stream: MediaStream | null — the webcam stream
 *  - isFrosted: boolean — whether to apply frost/blur effect
 *  - className: string — additional CSS class
 */
export default function CameraCanvas({ stream, isFrosted = true, className = '' }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const animFrameRef = useRef(null);

  // Draw loop: paint video frame to canvas with mirror effect + cover-fit
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (vw === 0 || vh === 0) {
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    // Object-fit: cover calculation
    const canvasAspect = cw / ch;
    const videoAspect = vw / vh;

    let sx, sy, sw, sh;
    if (videoAspect > canvasAspect) {
      // Video is wider — crop sides
      sh = vh;
      sw = vh * canvasAspect;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      // Video is taller — crop top/bottom
      sw = vw;
      sh = vw / canvasAspect;
      sx = 0;
      sy = (vh - sh) / 2;
    }

    ctx.clearRect(0, 0, cw, ch);

    // Mirror horizontally
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, -cw, 0, cw, ch);
    ctx.restore();

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  // Handle stream changes
  useEffect(() => {
    if (!stream) return;

    // Create invisible in-memory video element
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');

    videoRef.current = video;

    video.play().catch((err) => {
      console.warn('Video play failed:', err);
    });

    // Start draw loop
    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      video.pause();
      video.srcObject = null;
      videoRef.current = null;
    };
  }, [stream, draw]);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  const filterStyle = {
    filter: isFrosted
      ? 'blur(18px) brightness(0.7) saturate(0.6)'
      : 'blur(0px) brightness(1) saturate(1)',
    transition: 'filter 1.2s ease',
  };

  return (
    <canvas
      ref={canvasRef}
      className={`camera-canvas ${className}`}
      style={filterStyle}
    />
  );
}
