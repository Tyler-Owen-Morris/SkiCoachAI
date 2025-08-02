import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Button } from "@/components/ui/button";
import { Mic, Square, User, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SkierWithStats {
  id: string;
  name: string;
  level: string;
  age?: number;
  noteCount: number;
  lastNote: string | null;
  createdAt: string;
}

interface SmartVoiceRecorderProps {
  skiers: SkierWithStats[];
}

export default function SmartVoiceRecorder({ skiers }: SmartVoiceRecorderProps) {
  const [transcriptionText, setTranscriptionText] = useState("");
  const [identifiedSkier, setIdentifiedSkier] = useState<SkierWithStats | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { 
    transcript, 
    isListening, 
    startListening, 
    stopListening, 
    hasRecognitionSupport 
  } = useSpeechRecognition();

  // Function to identify skier from transcript
  const identifySkierFromText = (text: string): SkierWithStats | null => {
    const lowerText = text.toLowerCase();
    
    // Find skier whose name appears in the text
    const foundSkier = skiers.find(skier => {
      const nameParts = skier.name.toLowerCase().split(' ');
      return nameParts.some(namePart => 
        lowerText.includes(namePart) && namePart.length > 2 // Avoid matching short words
      );
    });
    
    return foundSkier || null;
  };

  const addNoteMutation = useMutation({
    mutationFn: async ({ skierId, content }: { skierId: string; content: string }) => {
      return await apiRequest(`/api/skiers/${skierId}/notes`, "POST", { content, type: "voice" });
    },
    onSuccess: () => {
      setSaveStatus('success');
      queryClient.invalidateQueries({ queryKey: ['/api/skiers'] });
      toast({
        title: "Note saved!",
        description: `Voice note assigned to ${identifiedSkier?.name}`,
      });
      
      // Reset after showing success
      setTimeout(() => {
        setTranscriptionText("");
        setIdentifiedSkier(null);
        setSaveStatus('idle');
      }, 3000);
    },
    onError: (error) => {
      setSaveStatus('error');
      toast({
        title: "Error",
        description: "Failed to save voice note",
        variant: "destructive",
      });
    },
  });

  const handleToggleRecording = () => {
    if (isListening) {
      stopListening();
      if (transcript.trim()) {
        const finalTranscript = transcript.trim();
        setTranscriptionText(finalTranscript);
        
        // Try to identify the skier
        const skier = identifySkierFromText(finalTranscript);
        setIdentifiedSkier(skier);
        
        if (skier) {
          setSaveStatus('saving');
          addNoteMutation.mutate({
            skierId: skier.id,
            content: finalTranscript
          });
        } else {
          toast({
            title: "No skier identified",
            description: "Please mention a skier's name in your note to assign it automatically",
            variant: "destructive",
          });
        }
      }
    } else {
      setTranscriptionText("");
      setIdentifiedSkier(null);
      setSaveStatus('idle');
      startListening();
    }
  };

  if (!hasRecognitionSupport) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-medium text-neutral-800 mb-4">Quick Voice Note</h3>
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
      <h3 className="text-lg font-medium text-neutral-800 mb-2">Quick Voice Note</h3>
      <p className="text-sm text-neutral-600 mb-4">
        Mention a skier's name and I'll automatically assign the note to them
      </p>
      
      <div className="text-center space-y-4">
        {/* Recording Button */}
        <button
          onClick={handleToggleRecording}
          disabled={(saveStatus === 'saving') || (saveStatus === 'success')}
          className={cn(
            "w-20 h-20 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center",
            isListening 
              ? "bg-red-500 hover:bg-red-600 animate-pulse" 
              : saveStatus === 'success'
              ? "bg-green-500"
              : saveStatus === 'saving'
              ? "bg-yellow-500"
              : "bg-accent hover:bg-accent-light",
            (saveStatus === 'saving' || saveStatus === 'success') && "cursor-not-allowed opacity-75"
          )}
        >
          {saveStatus === 'success' ? (
            <CheckCircle className="text-white text-2xl" size={32} />
          ) : saveStatus === 'saving' ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          ) : isListening ? (
            <Square className="text-white text-2xl" size={32} />
          ) : (
            <Mic className="text-white text-2xl" size={32} />
          )}
        </button>
        
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">
            {saveStatus === 'success' ? "Note saved!" :
             saveStatus === 'saving' ? "Saving note..." :
             isListening ? "Recording... tap to stop" : "Tap to start recording"}
          </p>
          {isListening && (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
              <span className="text-sm text-accent font-medium">Recording...</span>
            </div>
          )}
        </div>

        {/* Identified Skier */}
        {identifiedSkier && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-center space-x-2">
              <User className="text-green-600" size={16} />
              <span className="text-sm font-medium text-green-800">
                Assigning to: {identifiedSkier.name}
              </span>
            </div>
          </div>
        )}

        {/* Real-time Transcription */}
        {(isListening && transcript) || transcriptionText ? (
          <div className="mt-4">
            <div className="bg-neutral-50 rounded-lg p-4 text-left">
              <p className="text-sm text-neutral-400 mb-2">
                {isListening ? "Live transcription:" : 
                 saveStatus === 'success' ? "Saved note:" : "Transcription:"}
              </p>
              <p className="text-neutral-800">
                {transcriptionText || transcript}
              </p>
            </div>
          </div>
        ) : null}

        {/* Tips */}
        {!isListening && saveStatus === 'idle' && skiers.length > 0 && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              💡 Tip: Say something like "John showed great improvement on parallel turns today" to automatically assign the note to John.
            </p>
          </div>
        )}

        {/* No skiers warning */}
        {skiers.length === 0 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center justify-center space-x-2">
              <AlertCircle className="text-yellow-600" size={16} />
              <span className="text-sm text-yellow-800">
                Add some skiers first to use automatic assignment
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}