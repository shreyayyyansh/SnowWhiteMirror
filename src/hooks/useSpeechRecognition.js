import { useRef, useState, useCallback, useEffect } from 'react';

const TARGET_PHRASE = 'magic mirror on the wall who is the fairest of all';

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect if we're on a mobile device — mobile browsers handle
 * continuous speech recognition very differently (and often poorly).
 */
function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Custom hook for continuous speech recognition with phrase matching.
 * Uses different strategies for desktop (continuous mode) vs mobile (restart loop)
 * to work around mobile browsers garbling audio input in continuous mode.
 */
export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef(null);
  const onTriggerRef = useRef(null);
  const isManualStop = useRef(false);
  const restartTimeoutRef = useRef(null);
  // Accumulate finalized text across restart cycles (mobile)
  const accumulatedFinals = useRef('');
  const triggered = useRef(false);

  // Set onTrigger callback
  const setOnTrigger = useCallback((cb) => {
    onTriggerRef.current = cb;
  }, []);

  // Build the display transcript from final + interim parts properly
  const buildTranscript = useCallback((event) => {
    let finals = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) {
        finals += text + ' ';
      } else {
        interim += text;
      }
    }
    return { finals: finals.trim(), interim: interim.trim() };
  }, []);

  // Create and start a recognition instance
  const createRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      console.warn('SpeechRecognition API not supported in this browser.');
      return null;
    }

    const mobile = isMobile();
    const recognition = new SpeechRecognition();

    // On mobile, disable continuous mode — it causes garbled, repeating text.
    // Instead we'll use short sessions that auto-restart.
    recognition.continuous = !mobile;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      isManualStop.current = false;
    };

    recognition.onresult = (event) => {
      if (triggered.current) return;

      const { finals, interim } = buildTranscript(event);

      // On mobile, we accumulate finals across restart sessions.
      // On desktop continuous mode, the results array already contains
      // the full history, so we don't need to accumulate.
      if (mobile && finals) {
        accumulatedFinals.current = (accumulatedFinals.current + ' ' + finals).trim();
      }
      const fullFinals = mobile ? accumulatedFinals.current : finals;

      // Display: finalized text + current interim
      const displayText = (fullFinals + (interim ? ' ' + interim : '')).trim();
      setTranscript(displayText);

      // Check for phrase match against the full text
      const normalized = normalize(displayText);
      if (normalized.includes(TARGET_PHRASE)) {
        triggered.current = true;

        // Fire callback
        if (onTriggerRef.current) {
          onTriggerRef.current();
        }

        // Stop listening after a match — will be restarted externally
        isManualStop.current = true;
        try { recognition.stop(); } catch (e) { /* ignore */ }
        setIsListening(false);
        setTranscript('');
        accumulatedFinals.current = '';
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      // These errors mean permission denied — don't restart
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsListening(false);
        return;
      }
      // 'no-speech' is common on mobile — just let it restart via onend
    };

    recognition.onend = () => {
      setIsListening(false);

      // Auto-restart if not manually stopped
      if (!isManualStop.current && !triggered.current) {
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.warn('Failed to restart recognition:', e);
            // If start fails, try creating a fresh instance
            const fresh = createRecognition();
            if (fresh) {
              recognitionRef.current = fresh;
              try { fresh.start(); } catch (e2) { /* give up */ }
            }
          }
        }, mobile ? 100 : 300);
      }
    };

    return recognition;
  }, [buildTranscript]);

  // Initialize and start recognition
  const startListening = useCallback(() => {
    // Clean up any existing instance
    if (recognitionRef.current) {
      isManualStop.current = true;
      try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
    }

    // Reset state
    accumulatedFinals.current = '';
    triggered.current = false;
    setTranscript('');

    const recognition = createRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    isManualStop.current = false;

    try {
      recognition.start();
    } catch (e) {
      console.warn('Failed to start recognition:', e);
    }
  }, [createRecognition]);

  // Stop recognition
  const stopListening = useCallback(() => {
    isManualStop.current = true;
    triggered.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    setIsListening(false);
    setTranscript('');
    accumulatedFinals.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isManualStop.current = true;
      triggered.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    setOnTrigger,
  };
}
