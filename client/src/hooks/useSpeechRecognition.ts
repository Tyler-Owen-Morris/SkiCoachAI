import { useState, useEffect, useRef } from 'react';

interface SpeechRecognitionResult {
  transcript: string;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  hasRecognitionSupport: boolean;
}

export function useSpeechRecognition(): SpeechRecognitionResult {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const hasRecognitionSupport = 
    typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  useEffect(() => {
    if (!hasRecognitionSupport) return;

    const SpeechRecognition = 
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, [hasRecognitionSupport]);

  const startListening = () => {
    if (recognitionRef.current && hasRecognitionSupport) {
      setTranscript('');
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && hasRecognitionSupport) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    hasRecognitionSupport,
  };
}
