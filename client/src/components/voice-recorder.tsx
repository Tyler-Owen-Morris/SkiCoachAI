import { useState } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onSave: (content: string) => void;
}

export default function VoiceRecorder({ onSave }: VoiceRecorderProps) {
  const [transcriptionText, setTranscriptionText] = useState("");
  const { 
    transcript, 
    isListening, 
    startListening, 
    stopListening, 
    hasRecognitionSupport 
  } = useSpeechRecognition();

  const handleToggleRecording = () => {
    if (isListening) {
      stopListening();
      if (transcript.trim()) {
        setTranscriptionText(transcript);
        onSave(transcript.trim());
        // Clear transcript after saving
        setTimeout(() => {
          setTranscriptionText("");
        }, 2000);
      }
    } else {
      setTranscriptionText("");
      startListening();
    }
  };

  if (!hasRecognitionSupport) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-medium text-neutral-800 mb-4">Record Voice Note</h3>
        <div className="text-center py-8">
          <p className="text-neutral-600">
            Voice recognition is not supported in your browser. Please use Chrome, Safari, or Edge for the best experience.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-medium text-neutral-800 mb-4">Record Voice Note</h3>
      
      <div className="text-center space-y-4">
        {/* Recording Button */}
        <button
          onClick={handleToggleRecording}
          className={cn(
            "w-20 h-20 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center",
            isListening 
              ? "bg-red-500 hover:bg-red-600 animate-pulse" 
              : "bg-accent hover:bg-accent-light"
          )}
        >
          {isListening ? (
            <Square className="text-white text-2xl" size={32} />
          ) : (
            <Mic className="text-white text-2xl" size={32} />
          )}
        </button>
        
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">
            {isListening ? "Recording... tap to stop" : "Tap to start recording"}
          </p>
          {isListening && (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
              <span className="text-sm text-accent font-medium">Recording...</span>
            </div>
          )}
        </div>

        {/* Real-time Transcription */}
        {(isListening && transcript) || transcriptionText ? (
          <div className="mt-4">
            <div className="bg-neutral-50 rounded-lg p-4 text-left">
              <p className="text-sm text-neutral-400 mb-2">
                {isListening ? "Live transcription:" : "Saved note:"}
              </p>
              <p className="text-neutral-800">
                {transcriptionText || transcript}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
