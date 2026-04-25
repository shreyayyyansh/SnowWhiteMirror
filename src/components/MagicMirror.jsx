import { useState, useCallback, useEffect, useRef } from 'react';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import './MagicMirror.css';

const TRIGGER_PHRASE = 'Magic Mirror on the wall, who is the fairest of all?';
const RESPONSE_TEXT = 'Famed is thy beauty, Majesty.';

const MagicMirror = () => {
  const [mirrorState, setMirrorState] = useState('idle'); // idle | awakened | responding
  const [showResponse, setShowResponse] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFrosted, setIsFrosted] = useState(true);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  const handleTrigger = useCallback(() => {
    setMirrorState('awakened');
    setShowResponse(false);
    // Remove frosted glass effect
    setIsFrosted(false);
    setTimeout(() => {
      setShowResponse(true);
      setMirrorState('responding');
    }, 800);
    setTimeout(() => {
      setMirrorState('idle');
      setShowResponse(false);
      // Re-apply frosted effect after response
      setIsFrosted(true);
    }, 8000);
  }, []);

  const {
    isListening,
    transcript,
    status,
    startListening,
  } = useSpeechRecognition({
    triggerPhrase: TRIGGER_PHRASE,
    onTrigger: handleTrigger,
  });

  const startWebcam = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      setStream(mediaStream);
    } catch (err) {
      console.error('Webcam error:', err);
    }
  }, []);

  // Assign stream to video element whenever both are available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasStarted]);

  const handleStart = async () => {
    setHasStarted(true);
    await startWebcam();
    startListening();
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [stream]);

  return (
    <div className="mirror-scene">
      {/* Floating particles */}
      <div className="particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              '--delay': `${Math.random() * 8}s`,
              '--x': `${Math.random() * 100}%`,
              '--duration': `${6 + Math.random() * 8}s`,
              '--size': `${2 + Math.random() * 4}px`,
              '--opacity': `${0.2 + Math.random() * 0.5}`,
            }}
          />
        ))}
      </div>

      {/* Oval mirror */}
      <div className={`mirror-container ${mirrorState !== 'idle' ? 'mirror-active' : ''}`}>
        {/* Ornate crown on top */}
        <div className="ornament-top">
          <svg viewBox="0 0 240 80" className="crown-svg">
            <path d="M120 8 L138 30 L155 15 L150 40 L168 28 L158 52 L175 38 L162 65 L78 65 L65 38 L82 52 L72 28 L90 40 L85 15 L102 30 Z"
                  fill="none" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="120" cy="18" r="4" fill="currentColor"/>
            <circle cx="100" cy="27" r="2.5" fill="currentColor"/>
            <circle cx="140" cy="27" r="2.5" fill="currentColor"/>
            <circle cx="85" cy="22" r="1.5" fill="currentColor" opacity="0.6"/>
            <circle cx="155" cy="22" r="1.5" fill="currentColor" opacity="0.6"/>
          </svg>
        </div>

        {/* Oval frame + glass */}
        <div className="mirror-oval-frame">
          <div className="mirror-oval-border" />
          <div className="mirror-glass-oval">
            {hasStarted ? (
              <div className="webcam-container">
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && stream && !el.srcObject) {
                      el.srcObject = stream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className={`webcam-video ${isFrosted ? 'frosted' : 'clear'}`}
                />
                <div className="mirror-shimmer" />
                <div className={`mirror-glow ${mirrorState === 'awakened' || mirrorState === 'responding' ? 'glow-active' : ''}`} />
              </div>
            ) : (
              <div className="mirror-placeholder">
                <div className="mirror-smoke" />
                <span className="placeholder-text">Gaze into the mirror...</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom ornament */}
        <div className="ornament-bottom">
          <svg viewBox="0 0 200 45" className="bottom-svg">
            <path d="M25 8 C25 8, 100 40, 175 8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M50 5 C50 5, 100 25, 150 5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
            <circle cx="100" cy="28" r="5" fill="none" stroke="currentColor" strokeWidth="1"/>
            <circle cx="100" cy="28" r="2.5" fill="currentColor"/>
          </svg>
        </div>
      </div>

      {/* Question phrase display */}
      <div className="phrase-display">
        <p className="trigger-phrase">
          <span className="phrase-quote">&ldquo;</span>
          {TRIGGER_PHRASE}
          <span className="phrase-quote">&rdquo;</span>
        </p>
        <p className="phrase-hint">Speak this phrase to awaken the mirror</p>
      </div>

      {/* Transcript */}
      {hasStarted && transcript && (
        <div className={`transcript-display ${status === 'triggered' ? 'transcript-match' : ''}`}>
          <div className="transcript-label">
            <span className="listening-dot" />
            Hearing...
          </div>
          <p className="transcript-text">&ldquo;{transcript}&rdquo;</p>
        </div>
      )}

      {/* Response overlay */}
      {showResponse && (
        <div className="response-display">
          <div className="response-glow" />
          <p className="response-text">
            <span className="response-quote">&ldquo;</span>
            {RESPONSE_TEXT}
            <span className="response-quote">&rdquo;</span>
          </p>
        </div>
      )}

      {/* Status indicator */}
      <div className="status-bar">
        {!hasStarted ? (
          <button className="start-button" onClick={handleStart} id="start-mirror-btn">
            <span className="btn-glow" />
            <span className="btn-text">✦ Awaken the Mirror ✦</span>
          </button>
        ) : (
          <div className={`listening-indicator ${isListening ? 'active' : ''}`}>
            <div className="wave-bars">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="wave-bar" style={{ '--i': i }} />
              ))}
            </div>
            <span>{isListening ? 'Mirror is listening...' : 'Preparing...'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagicMirror;
