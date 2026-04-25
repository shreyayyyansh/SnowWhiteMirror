import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import CameraCanvas from './CameraCanvas';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import './MagicMirror.css';

const RESPONSE_TEXT = 'Famed is thy beauty, Majesty.';

// Generate particles with random properties
function generateParticles(count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    style: {
      '--x': `${Math.random() * 100}%`,
      '--delay': `${Math.random() * 10}s`,
      '--duration': `${8 + Math.random() * 10}s`,
      '--size': `${2 + Math.random() * 5}px`,
      '--drift': `${-40 + Math.random() * 80}px`,
      '--drift-end': `${-60 + Math.random() * 120}px`,
    },
  }));
}

// SVG Crown ornament
function CrownSVG() {
  return (
    <svg
      className="crown-ornament"
      viewBox="0 0 120 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crownGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6e27a" />
          <stop offset="50%" stopColor="#c49a2a" />
          <stop offset="100%" stopColor="#f6e27a" />
        </linearGradient>
      </defs>
      {/* Crown body */}
      <path
        d="M10 50 L20 20 L35 35 L50 8 L60 18 L70 8 L85 35 L100 20 L110 50 Z"
        fill="url(#crownGold)"
        stroke="#8b6914"
        strokeWidth="1.5"
      />
      {/* Crown base */}
      <rect x="14" y="48" width="92" height="6" rx="3" fill="url(#crownGold)" stroke="#8b6914" strokeWidth="1" />
      {/* Jewel accents */}
      <circle cx="60" cy="18" r="4" fill="#e84040" stroke="#8b6914" strokeWidth="0.8" />
      <circle cx="38" cy="32" r="2.5" fill="#4ae" stroke="#8b6914" strokeWidth="0.6" />
      <circle cx="82" cy="32" r="2.5" fill="#4ae" stroke="#8b6914" strokeWidth="0.6" />
      {/* Tip pearls */}
      <circle cx="50" cy="10" r="2" fill="#f6e27a" opacity="0.9" />
      <circle cx="70" cy="10" r="2" fill="#f6e27a" opacity="0.9" />
    </svg>
  );
}

// SVG Flourish ornament (bottom)
function FlourishSVG() {
  return (
    <svg
      className="flourish-ornament"
      viewBox="0 0 200 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="flourishGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8b6914" />
          <stop offset="30%" stopColor="#f6e27a" />
          <stop offset="50%" stopColor="#c49a2a" />
          <stop offset="70%" stopColor="#f6e27a" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
      </defs>
      {/* Center flourish */}
      <path
        d="M100 10 C85 10 75 25 60 22 C50 20 45 10 30 15 C20 18 10 25 5 22"
        stroke="url(#flourishGold)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M100 10 C115 10 125 25 140 22 C150 20 155 10 170 15 C180 18 190 25 195 22"
        stroke="url(#flourishGold)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Curls */}
      <path
        d="M5 22 C2 20 0 25 3 28 C6 31 10 28 8 24"
        stroke="url(#flourishGold)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M195 22 C198 20 200 25 197 28 C194 31 190 28 192 24"
        stroke="url(#flourishGold)"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Central diamond */}
      <path d="M100 5 L104 12 L100 19 L96 12 Z" fill="#c49a2a" stroke="#f6e27a" strokeWidth="0.8" />
      {/* Dots */}
      <circle cx="80" cy="18" r="1.5" fill="#c49a2a" />
      <circle cx="120" cy="18" r="1.5" fill="#c49a2a" />
      <circle cx="55" cy="23" r="1.2" fill="#c49a2a" opacity="0.6" />
      <circle cx="145" cy="23" r="1.2" fill="#c49a2a" opacity="0.6" />
      {/* Lower swirl */}
      <path
        d="M40 30 Q60 40 80 32 Q90 28 100 32 Q110 36 120 32 Q140 24 160 30"
        stroke="url(#flourishGold)"
        strokeWidth="1.2"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

export default function MagicMirror() {
  const [hasStarted, setHasStarted] = useState(false);
  const [gateExiting, setGateExiting] = useState(false);
  const [mirrorState, setMirrorState] = useState('idle'); // idle | awakened | responding
  const [isFrosted, setIsFrosted] = useState(true);
  const [showResponse, setShowResponse] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [error, setError] = useState(null);
  const timeoutsRef = useRef([]);
  const particles = useMemo(() => generateParticles(22), []);

  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    setOnTrigger,
  } = useSpeechRecognition();

  // Clear all pending timeouts
  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  // Schedule a timeout and track it
  const scheduleTimeout = useCallback((cb, ms) => {
    const id = setTimeout(cb, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  // Speak the response using SpeechSynthesis — premium voice selection
  const speakResponse = useCallback(() => {
    if (!window.speechSynthesis) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(RESPONSE_TEXT);
    utterance.rate = 0.75;   // Slow, dramatic pacing
    utterance.pitch = 0.92;  // Slightly deeper, regal tone
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    // Score each voice — higher is better. We want premium/enhanced neural voices
    // with elegant, soothing characteristics.
    function scoreVoice(v) {
      const name = v.name.toLowerCase();
      let score = 0;

      // Tier 1 (best): Apple Enhanced / Premium neural voices
      if (name.includes('(premium)') || name.includes('(enhanced)')) score += 200;
      // Tier 2: Microsoft Neural voices (Online)
      if (name.includes('online') && name.includes('natural')) score += 150;
      // Tier 3: Google high-quality
      if (name.includes('google')) score += 80;

      // Prefer specific voices known for warm, eloquent delivery
      const eliteNames = [
        'zoe', 'ava', 'allison', 'serena', 'kate',     // Apple premium
        'aria', 'jenny', 'sonia', 'libby',               // Microsoft neural
        'fiona', 'moira', 'tessa', 'karen',              // Apple standard (still good)
        'samantha',                                       // macOS default (decent)
      ];
      const eliteIndex = eliteNames.findIndex(n => name.includes(n));
      if (eliteIndex !== -1) score += (100 - eliteIndex * 5); // Earlier = higher priority

      // Slight boost for female-sounding voices (warmer for this fairy-tale context)
      if (name.includes('female')) score += 30;

      // Penalize compact/low-quality markers
      if (name.includes('compact') || name.includes('(low quality)')) score -= 100;

      return score;
    }

    // Sort English voices by score descending and pick the best
    const ranked = [...englishVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
    const selectedVoice = ranked.length > 0 ? ranked[0] : null;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('Mirror voice:', selectedVoice.name);
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  // The trigger handler — the main interaction routine
  const handleTrigger = useCallback(() => {
    if (mirrorState !== 'idle') return;

    clearAllTimeouts();

    // T=0: Glass clears, mirror awakens
    setMirrorState('awakened');
    setIsFrosted(false);

    // T=0.8s: Show text + speak
    scheduleTimeout(() => {
      setMirrorState('responding');
      setShowResponse(true);
      speakResponse();
    }, 800);

    // T=8s: Reset everything
    scheduleTimeout(() => {
      setShowResponse(false);
      setIsFrosted(true);
      setMirrorState('idle');

      // Restart listening after brief pause
      scheduleTimeout(() => {
        startListening();
      }, 500);
    }, 8000);
  }, [mirrorState, clearAllTimeouts, scheduleTimeout, speakResponse, startListening]);

  // Wire up the trigger callback
  useEffect(() => {
    setOnTrigger(handleTrigger);
  }, [handleTrigger, setOnTrigger]);

  // Pre-load voices
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
      stopListening();
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle the "Awaken the Mirror" gate click
  const handleAwaken = useCallback(async () => {
    try {
      setError(null);

      // Request camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setCameraStream(stream);

      // Animate gate exit, then start
      setGateExiting(true);
      setTimeout(() => {
        setHasStarted(true);
        // Start speech recognition
        startListening();
      }, 1200);
    } catch (err) {
      console.error('Permission error:', err);
      setError('Camera access is required. Please allow camera permissions and try again.');
    }
  }, [startListening]);

  return (
    <>
      {/* Floating particles */}
      <div className="particles-container" aria-hidden="true">
        {particles.map(p => (
          <div key={p.id} className="particle" style={p.style} />
        ))}
      </div>

      {/* Gate screen */}
      {!hasStarted && (
        <div className={`gate-screen ${gateExiting ? 'exiting' : ''}`}>
          <h1 className="gate-title">Magic Mirror</h1>
          <p className="gate-subtitle">A Snow White Experience</p>
          <button
            id="awaken-button"
            className="gate-button"
            onClick={handleAwaken}
          >
            ✦ Awaken the Mirror ✦
          </button>
          {!isSupported && (
            <p style={{
              marginTop: '20px',
              color: 'rgba(255,120,120,0.8)',
              fontFamily: 'Inter, sans-serif',
              fontSize: '0.8rem'
            }}>
              Speech recognition is not supported in this browser. Try Chrome or Edge.
            </p>
          )}
        </div>
      )}

      {/* Main mirror scene */}
      {hasStarted && (
        <div className="magic-mirror-scene">
          <div className="mirror-container mirror-entrance">
            {/* Crown ornament */}
            <CrownSVG />

            {/* The frame */}
            <div className={`mirror-oval-frame ${mirrorState !== 'idle' ? 'awakened' : ''}`}>
              {/* The ambient glow */}
              <div className={`ambient-ring ${mirrorState !== 'idle' ? 'active' : ''}`} />

              {/* Glass area */}
              <div className="mirror-glass">
                <CameraCanvas stream={cameraStream} isFrosted={isFrosted} />
                <div className="mirror-gloss" />

                {/* Response overlay */}
                {showResponse && (
                  <div className="response-overlay">
                    <p className="response-text">{RESPONSE_TEXT}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Flourish ornament */}
            <FlourishSVG />
          </div>

          {/* Status bar */}
          <div className="status-bar">
            {isListening && mirrorState === 'idle' && (
              <>
                <div className="listening-indicator">
                  <span className="listening-dot" />
                  <span>Listening</span>
                </div>
                {transcript && (
                  <p className="transcript-display">"{transcript}"</p>
                )}
                <p className="prompt-hint">
                  "Magic Mirror on the wall, who is the fairest of all?"
                </p>
              </>
            )}
            {mirrorState === 'responding' && (
              <div className="listening-indicator">
                <span style={{ color: '#f6e27a', opacity: 0.7 }}>The Mirror speaks…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
