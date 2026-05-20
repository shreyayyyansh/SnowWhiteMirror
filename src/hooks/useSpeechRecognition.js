import { useRef, useState, useCallback, useEffect } from 'react';

const TARGET_PHRASES = [
  'magic mirror on the wall who is the fairest of all',
  'magic mirror on the wall who is the most beautiful of all',
];

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect iOS/iPadOS — Safari on these platforms does NOT reliably support
 * `continuous` or `interimResults` on the SpeechRecognition API.
 * Setting those to `true` causes gibberish/hallucinated transcripts.
 */
function getIsIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Standard iPhone/iPad/iPod detection
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac but has touch support
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

const IS_IOS = getIsIOS();

/**
 * Custom hook for continuous speech recognition with phrase matching.
 *
 * On desktop: uses non-continuous mode with interimResults and auto-restart
 * in onend for a seamless listening experience.
 *
 * On iOS/Safari: disables both continuous and interimResults (they cause
 * gibberish), and manually restarts recognition after each result.
 */
export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [micError, setMicError] = useState(null); // 'not-allowed' | 'network' | null
  const recognitionRef = useRef(null);
  const onTriggerRef = useRef(null);
  const isManualStop = useRef(false);
  const wantListening = useRef(false); // tracks user intent to listen
  const restartTimeoutRef = useRef(null);
  const accumulatedText = useRef('');
  const matchedRef = useRef(false);
  const audioContextRef = useRef(null);
  const restartCount = useRef(0);
  const lastRestartTime = useRef(0);

  const setOnTrigger = useCallback((cb) => {
    onTriggerRef.current = cb;
  }, []);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  /**
   * Resume or create AudioContext — iOS silently blocks any AudioContext
   * that is created without a user gesture. We call this from startListening,
   * which itself is called from a button click handler.
   */
  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioContextRef.current = new AC();
      }
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    } catch (e) {
      // AudioContext creation can fail in restricted environments — non-fatal
      console.warn('[Mirror] AudioContext init failed:', e);
    }
  }, []);

  /**
   * HTTPS guard — speech recognition requires a secure context on deployed sites.
   * Returns true if secure, false if not.
   */
  const isSecureContext = useCallback(() => {
    if (typeof location === 'undefined') return true;
    if (location.protocol === 'https:') return true;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
    return false;
  }, []);

  /**
   * Detect and prevent restart loops — if we've restarted more than 5 times
   * within 3 seconds, something is wrong and we should bail.
   */
  const isRestartLooping = useCallback(() => {
    const now = Date.now();
    if (now - lastRestartTime.current > 3000) {
      // Reset counter after 3 seconds of calm
      restartCount.current = 0;
    }
    restartCount.current++;
    lastRestartTime.current = now;
    return restartCount.current > 5;
  }, []);

  // Start a new recognition session
  const startSession = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    if (!isSecureContext()) {
      console.error('[Mirror] Microphone requires HTTPS');
      setMicError('network');
      return;
    }

    // Abort existing
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // ——— iOS FIX: continuous and interimResults MUST be false on iOS Safari ———
    // Setting them to true causes garbled/hallucinated transcripts.
    recognition.continuous = false;           // false on all platforms for consistency
    recognition.interimResults = !IS_IOS;     // false on iOS — causes gibberish

    recognition.onstart = () => {
      setIsListening(true);
      setMicError(null);
    };

    recognition.onresult = (event) => {
      if (matchedRef.current || isManualStop.current) return;

      let sessionFinals = '';
      let sessionInterim = '';

      for (let i = 0; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          sessionFinals += text + ' ';
        } else {
          sessionInterim += text;
        }
      }

      // Build full text: accumulated from prior sessions + this session
      const currentText = (
        accumulatedText.current +
        ' ' + sessionFinals.trim() +
        ' ' + sessionInterim.trim()
      ).trim();

      setTranscript(currentText);

      // Check for match
      const normalized = normalize(currentText);
      const phraseMatched = TARGET_PHRASES.some(p => normalized.includes(p));
      if (phraseMatched) {
        console.log('[Mirror] ✨ Phrase matched!');
        matchedRef.current = true;

        // Stop recognition first
        isManualStop.current = true;
        wantListening.current = false;
        try { recognition.stop(); } catch (e) { /* ignore */ }
        setIsListening(false);
        setTranscript('');
        accumulatedText.current = '';

        // Fire the trigger callback in a microtask to decouple
        // from recognition cleanup — prevents React batching conflicts
        Promise.resolve().then(() => {
          if (onTriggerRef.current) {
            console.log('[Mirror] Firing trigger callback');
            onTriggerRef.current();
          }
        });
        return; // Don't restart after a match
      }

      // Save finals for accumulation across sessions
      if (sessionFinals.trim()) {
        accumulatedText.current = (accumulatedText.current + ' ' + sessionFinals.trim()).trim();
      }

      // ——— iOS FIX: manually restart after each final result ———
      // On iOS, we don't use auto-restart in onend (it loops).
      // Instead, restart here after we get a result, with a small delay.
      if (IS_IOS && wantListening.current && sessionFinals.trim()) {
        try { recognition.stop(); } catch (e) { /* ignore */ }
        clearRestartTimeout();
        restartTimeoutRef.current = setTimeout(() => {
          if (wantListening.current && !matchedRef.current) {
            startSession();
          }
        }, 300);
      }
    };

    recognition.onerror = (event) => {
      console.warn('[Mirror] Speech error:', event.error);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsListening(false);
        isManualStop.current = true;
        wantListening.current = false;
        setMicError('not-allowed');
        return;
      }

      if (event.error === 'network') {
        setMicError('network');
        // Don't immediately kill — onend will handle restart attempt
      }

      // Other errors (no-speech, aborted) — let onend handle restart
    };

    recognition.onend = () => {
      setIsListening(false);

      // ——— Restart logic (desktop only) ———
      // On iOS, restarts are handled manually in onresult above.
      // On desktop, auto-restart in onend for seamless continuous listening.
      if (!IS_IOS && wantListening.current && !isManualStop.current && !matchedRef.current) {
        if (isRestartLooping()) {
          console.warn('[Mirror] Restart loop detected — stopping');
          wantListening.current = false;
          setMicError('network');
          return;
        }

        clearRestartTimeout();
        restartTimeoutRef.current = setTimeout(() => {
          if (wantListening.current && !isManualStop.current && !matchedRef.current) {
            startSession();
          }
        }, 250); // slightly longer delay than before to avoid tight loops on Vercel
      }

      // On iOS: if we ended without a result (e.g., silence timeout / no-speech),
      // and user still wants to listen, restart after a delay.
      if (IS_IOS && wantListening.current && !isManualStop.current && !matchedRef.current) {
        if (isRestartLooping()) {
          console.warn('[Mirror] iOS restart loop detected — stopping');
          wantListening.current = false;
          return;
        }

        clearRestartTimeout();
        restartTimeoutRef.current = setTimeout(() => {
          if (wantListening.current && !matchedRef.current) {
            startSession();
          }
        }, 500); // longer delay on iOS to prevent rapid fire
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      restartCount.current = 0; // successful start resets the loop counter
    } catch (e) {
      console.warn('[Mirror] Failed to start:', e);
      // On some browsers, start() throws if called too soon after stop()
      // Retry once after a delay
      clearRestartTimeout();
      restartTimeoutRef.current = setTimeout(() => {
        if (wantListening.current && !matchedRef.current) {
          try {
            recognition.start();
          } catch (e2) {
            console.error('[Mirror] Retry start also failed:', e2);
            wantListening.current = false;
          }
        }
      }, 500);
    }
  }, [clearRestartTimeout, isSecureContext, isRestartLooping]);

  // Public: start listening (resets everything)
  const startListening = useCallback(() => {
    // Resume AudioContext on user gesture (required for iOS)
    ensureAudioContext();

    clearRestartTimeout();
    isManualStop.current = false;
    matchedRef.current = false;
    wantListening.current = true;
    accumulatedText.current = '';
    restartCount.current = 0;
    setTranscript('');
    setMicError(null);
    startSession();
  }, [startSession, clearRestartTimeout, ensureAudioContext]);

  // Public: stop listening
  const stopListening = useCallback(() => {
    isManualStop.current = true;
    wantListening.current = false;
    matchedRef.current = false;
    clearRestartTimeout();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    setIsListening(false);
    setTranscript('');
    accumulatedText.current = '';
  }, [clearRestartTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isManualStop.current = true;
      wantListening.current = false;
      matchedRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    micError,
    startListening,
    stopListening,
    setOnTrigger,
  };
}
