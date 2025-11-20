
import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audioHelper';

interface UseGeminiLiveProps {
  apiKey: string;
  characterName: string;
  scenario: string;
  personality: string;
  isActive: boolean;
  audioDeviceId?: string;
  onSpeakingChanged?: (isSpeaking: boolean) => void;
}

export const useGeminiLive = ({ apiKey, characterName, scenario, personality, isActive, audioDeviceId, onSpeakingChanged }: UseGeminiLiveProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Refs for audio context and processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Cleanup function
  const cleanup = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
    }
    if (outputNodeRef.current) {
      outputNodeRef.current.disconnect();
    }
    
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    
    setIsConnected(false);
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setIsConnected(false);
    setRetryCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!isActive || !apiKey) {
      if (!isActive) cleanup();
      return;
    }

    const initSession = async () => {
      try {
        // Initialize Audio Contexts
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass({ sampleRate: 24000 }); // Model output rate
        audioContextRef.current = audioCtx;

        // Input handling (Microphone) - Resample to 16000 for Gemini
        const inputCtx = new AudioContextClass({ sampleRate: 16000 }); 
        inputAudioContextRef.current = inputCtx;
        
        const constraints = {
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const inputSource = inputCtx.createMediaStreamSource(stream);
        inputSourceRef.current = inputSource;

        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        // Output handling
        const outputNode = audioCtx.createGain();
        outputNode.connect(audioCtx.destination);
        outputNodeRef.current = outputNode;

        // Analyser for Lip Sync
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        outputNode.connect(analyser);
        analyserRef.current = analyser;

        const ai = new GoogleGenAI({ apiKey: apiKey });
        
        // Establish Connection
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              setIsConnected(true);
              console.log('Gemini Live Connected');
              
              // Stream audio from the microphone to the model.
              // Note: We rely on the sessionPromise logic inside the processor to ensure connection is ready.
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then(session => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              
              inputSource.connect(processor);
              processor.connect(inputCtx.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
              const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              
              if (base64Audio) {
                if (onSpeakingChanged) onSpeakingChanged(true);

                const audioData = base64ToUint8Array(base64Audio);
                
                // Sync playback time
                nextStartTimeRef.current = Math.max(
                    nextStartTimeRef.current,
                    audioCtx.currentTime
                );

                const audioBuffer = await decodeAudioData(audioData, audioCtx, 24000, 1);
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                
                source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                    if (sourcesRef.current.size === 0 && onSpeakingChanged) {
                        onSpeakingChanged(false);
                    }
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }

              // Handle Interruption
              if (msg.serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 if (onSpeakingChanged) onSpeakingChanged(false);
              }
            },
            onclose: () => {
              setIsConnected(false);
              console.log('Gemini Live Closed');
            },
            onerror: (e) => {
              console.error('Gemini Live Error', e);
              setError("Connection error occurred.");
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
            },
            systemInstruction: `You are ${characterName || 'a 3D avatar'}. 
            The current scenario is: "${scenario}". 
            Your personality is: "${personality}".
            Act appropriately for this scenario and personality. 
            If the user is silent initially, introduce yourself and the situation confidently using your name (${characterName}). 
            Your voice should match the character's personality.
            Keep responses concise and conversational.`,
          }
        });

        sessionPromiseRef.current = sessionPromise;

      } catch (err: any) {
        setError(err.message);
        console.error(err);
      }
    };

    initSession();

    return cleanup;
  }, [isActive, scenario, personality, characterName, apiKey, cleanup, onSpeakingChanged, audioDeviceId, retryCount]);

  return { isConnected, error, analyser: analyserRef.current, retry };
};
