import { useEffect, useRef, useState, useCallback } from 'react';

const WebcamPixelGrid = ({
  gridCols = 80,
  gridRows = 60,
  gapRatio = 0.18,
  mirror = true,
  colorMode = 'webcam',
  invertColors = false,
  className = '',
  onWebcamReady,
  onWebcamError,
}) => {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      await video.play();

      videoRef.current = video;

      const offCanvas = document.createElement('canvas');
      offCanvas.width = gridCols;
      offCanvas.height = gridRows;
      offscreenCanvasRef.current = offCanvas;

      setIsReady(true);
      onWebcamReady?.();
    } catch (err) {
      console.error('Webcam access denied:', err);
      onWebcamError?.(err);
    }
  }, [gridCols, gridRows, onWebcamReady, onWebcamError]);

  const renderPixelGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const offCanvas = offscreenCanvasRef.current;

    if (!canvas || !video || !offCanvas) return;

    const ctx = canvas.getContext('2d');
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    const w = canvas.width;
    const h = canvas.height;

    // Draw video to offscreen canvas at low res
    if (mirror) {
      offCtx.save();
      offCtx.scale(-1, 1);
      offCtx.drawImage(video, -gridCols, 0, gridCols, gridRows);
      offCtx.restore();
    } else {
      offCtx.drawImage(video, 0, 0, gridCols, gridRows);
    }

    const imageData = offCtx.getImageData(0, 0, gridCols, gridRows);
    const pixels = imageData.data;

    // Clear main canvas
    ctx.clearRect(0, 0, w, h);

    const cellW = w / gridCols;
    const cellH = h / gridRows;
    const gap = Math.min(cellW, cellH) * gapRatio;
    const dotW = cellW - gap;
    const dotH = cellH - gap;
    const halfGap = gap / 2;
    const radius = Math.min(dotW, dotH) * 0.15;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const i = (row * gridCols + col) * 4;
        let r = pixels[i];
        let g = pixels[i + 1];
        let b = pixels[i + 2];

        if (invertColors) {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }

        if (colorMode === 'monochrome') {
          const gray = (r + g + b) / 3;
          r = g = b = gray;
        }

        const x = col * cellW + halfGap;
        const y = row * cellH + halfGap;

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.roundRect(x, y, dotW, dotH, radius);
        ctx.fill();
      }
    }

    animFrameRef.current = requestAnimationFrame(renderPixelGrid);
  }, [gridCols, gridRows, gapRatio, mirror, colorMode, invertColors]);

  useEffect(() => {
    startWebcam();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [startWebcam]);

  useEffect(() => {
    if (!isReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth * window.devicePixelRatio;
        canvas.height = parent.clientHeight * window.devicePixelRatio;
        canvas.style.width = parent.clientWidth + 'px';
        canvas.style.height = parent.clientHeight + 'px';
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    animFrameRef.current = requestAnimationFrame(renderPixelGrid);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isReady, renderPixelGrid]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
      }}
    />
  );
};

export default WebcamPixelGrid;
