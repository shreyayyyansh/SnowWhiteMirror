import { useEffect, useRef, useState, useCallback } from 'react';

const useSpeechRecognition = ({ triggerPhrase, onTrigger }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('idle'); // idle | listening | triggered | responding
  const recognitionRef = useRef(null);
  const statusRef = useRef(status);
  const synthRef = useRef(window.speechSynthesis);
  const startListeningRef = useRef(null);

  // Keep statusRef in sync
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const normalize = (text) =>
    text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();

  const speakResponse = useCallback((responseText) => {
    setStatus('responding');
    const utterance = new SpeechSynthesisUtterance(responseText);
    utterance.rate = 0.78;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    // Pick the most natural / eloquent voice available
    const voices = synthRef.current.getVoices();
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    // Priority list: premium/natural voices first, then good defaults
    const preferredNames = [
      // macOS premium voices
      'Zarvox', 'Serena', 'Daniel', 'Fiona', 'Moira', 'Tessa',
      'Samantha (Enhanced)', 'Karen (Enhanced)', 'Daniel (Enhanced)',
      // Google / Chrome natural voices
      'Google UK English Female', 'Google UK English Male',
      // Microsoft Edge natural voices
      'Microsoft Aria Online', 'Microsoft Jenny Online',
      'Microsoft Sonia Online', 'Microsoft Ryan Online',
      // Fallback good voices
      'Samantha', 'Karen', 'Victoria', 'Alex',
    ];

    let selectedVoice = null;
    for (const name of preferredNames) {
      const found = englishVoices.find(v => v.name.includes(name));
      if (found) {
        selectedVoice = found;
        break;
      }
    }

    // If none matched, pick first English voice that isn't default
    if (!selectedVoice && englishVoices.length > 0) {
      selectedVoice = englishVoices.find(v => !v.default) || englishVoices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('Using voice:', selectedVoice.name);
    }

    utterance.onend = () => {
      setStatus('idle');
      setTimeout(() => {
        setTranscript('');
        startListeningRef.current?.();
      }, 1500);
    };

    synthRef.current.speak(utterance);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech Recognition is not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('listening');
    };

    recognition.onresult = (event) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }
      setTranscript(fullTranscript);

      const normalizedTranscript = normalize(fullTranscript);
      const normalizedTrigger = normalize(triggerPhrase);

      if (normalizedTranscript.includes(normalizedTrigger)) {
        setStatus('triggered');
        recognition.stop();
        setTimeout(() => {
          onTrigger?.();
          speakResponse('Famed is thy beauty, Majesty.');
        }, 800);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setTimeout(() => startListeningRef.current?.(), 1000);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart unless we triggered or are responding
      const currentStatus = statusRef.current;
      if (currentStatus !== 'triggered' && currentStatus !== 'responding') {
        setTimeout(() => startListeningRef.current?.(), 500);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [triggerPhrase, onTrigger, speakResponse]);

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setStatus('idle');
  }, []);

  useEffect(() => {
    // Load voices
    synthRef.current.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      synthRef.current.getVoices();
    };
  }, []);

  return {
    isListening,
    transcript,
    status,
    startListening,
    stopListening,
  };
};

export default useSpeechRecognition;
