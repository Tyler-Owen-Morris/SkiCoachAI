import { useState, useRef } from 'react';

interface UseMediaRecorderResult {
    isRecording: boolean;
    audioBlob: Blob | null;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    hasMediaRecorderSupport: boolean;
}

export function useMediaRecorder(): UseMediaRecorderResult {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const hasMediaRecorderSupport =
        typeof window !== 'undefined' &&
        !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    const startRecording = async () => {
        if (!hasMediaRecorderSupport) {
            throw new Error('MediaRecorder not supported');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Error starting recording:', error);
            throw error;
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    return {
        isRecording,
        audioBlob,
        startRecording,
        stopRecording,
        hasMediaRecorderSupport,
    };
}