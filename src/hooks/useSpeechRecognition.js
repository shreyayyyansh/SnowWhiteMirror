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
 * Custom hook for continuous speech recognition with phrase matching.
 * Listens indefinitely for the magic phrase and fires onTrigger when matched.
 */
export default function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef(null);
  const onTriggerRef = useRef(null);
  const isManualStop = useRef(false);
  const restartTimeoutRef = useRef(null);

  // Set onTrigger callback
  const setOnTrigger = useCallback((cb) => {
    onTriggerRef.current = cb;
  }, []);

  // Initialize and start recognition
  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      console.warn('SpeechRecognition API not supported in this browser.');
      return;
    }

    // Clean up any existing instance
    if (recognitionRef.current) {
      isManualStop.current = true;
      try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      isManualStop.current = false;
    };

    recognition.onresult = (event) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      setTranscript(fullTranscript);

      // Check for phrase match
      const normalized = normalize(fullTranscript);
      if (normalized.includes(TARGET_PHRASE)) {
        // Fire callback
        if (onTriggerRef.current) {
          onTriggerRef.current();
        }
        // Stop listening after a match — will be restarted externally
        isManualStop.current = true;
        try { recognition.stop(); } catch (e) { /* ignore */ }
        setIsListening(false);
        setTranscript('');
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      // Don't restart on 'not-allowed' or 'service-not-allowed'
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsListening(false);
        return;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if not manually stopped
      if (!isManualStop.current) {
        restartTimeoutRef.current = setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.warn('Failed to restart recognition:', e);
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    isManualStop.current = false;

    try {
      recognition.start();
    } catch (e) {
      console.warn('Failed to start recognition:', e);
    }
  }, []);

  // Stop recognition
  const stopListening = useCallback(() => {
    isManualStop.current = true;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    setIsListening(false);
    setTranscript('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isManualStop.current = true;
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
