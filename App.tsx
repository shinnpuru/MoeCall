
import React, { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { GoogleGenAI, Modality } from '@google/genai';
import { 
  Mic, MicOff, PhoneOff, Video, Upload, Image as ImageIcon, 
  Loader2, Sparkles, Briefcase, Coffee, Rocket, Heart, User, Check,
  Camera, ArrowRight, Settings, X, Sun, Speaker, Monitor, Smile, Zap, Skull, UserMinus, UserCheck, MessageCircle, Key
} from 'lucide-react';
import { Avatar } from './components/Avatar';
import { useGeminiLive } from './hooks/useGeminiLive';
import { AppState } from './types';

// Predefined scenarios for the suggestion system
const SCENARIOS = [
  { 
    id: 'interview', 
    icon: Briefcase,
    label: 'Job Interview', 
    text: 'You are a hiring manager for a tech company conducting a job interview. You are professional but friendly. Ask me about my experience with React and AI.', 
  },
  { 
    id: 'casual', 
    icon: Coffee,
    label: 'Casual Chat', 
    text: 'You are my best friend catching up at a cafe. You are warm, funny, and interested in my life. Ask me how my week has been.', 
  },
  { 
    id: 'scifi', 
    icon: Rocket,
    label: 'Sci-Fi Mission', 
    text: 'You are Commander Nova briefing me (the pilot) on a critical mission to the Andromeda sector. The stakes are high. Be authoritative but encouraging.', 
  },
  { 
    id: 'dating', 
    icon: Heart,
    label: 'Speed Date', 
    text: 'We are on a first date. You are charming and curious to get to know me. Keep the conversation light and flirty.', 
  },
];

const PERSONALITIES = [
  { id: 'friendly', label: 'Friendly', emoji: '😊', desc: 'Warm and Kind' },
  { id: 'energetic', label: 'Energetic', emoji: '⚡', desc: 'High Energy' },
  { id: 'tsundere', label: 'Tsundere', emoji: '😤', desc: 'Cold then Warm' },
  { id: 'shy', label: 'Shy', emoji: '😳', desc: 'Nervous & Soft' },
  { id: 'professional', label: 'Professional', emoji: '👔', desc: 'Formal & Strict' },
  { id: 'sarcastic', label: 'Sarcastic', emoji: '😏', desc: 'Witty & Dry' },
];

export default function App() {
  const [state, setState] = useState<AppState>({
    step: 'setup',
    apiKey: '',
    characterName: '',
    scenario: '',
    personality: 'Friendly',
    vrmUrl: null,
    backgroundUrl: null,
  });
  
  // UI state for background selection mode
  const [bgMode, setBgMode] = useState<'upload' | 'generate'>('upload');
  
  const [micOn, setMicOn] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Device Settings
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');

  // Studio Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [lighting, setLighting] = useState({
    ambient: 2.5,
    directional: 3.0,
    spot: 2.0,
    env: 1.2
  });
  const [expressionFactor, setExpressionFactor] = useState(0.6);

  // Gemini Live Hook
  const { isConnected, error, analyser } = useGeminiLive({
    apiKey: state.apiKey,
    characterName: state.characterName,
    scenario: state.scenario,
    personality: state.personality,
    isActive: state.step === 'call',
    onSpeakingChanged: setIsSpeaking,
    audioDeviceId: selectedAudioDevice
  });

  // Fetch Devices
  useEffect(() => {
    const getDevices = async () => {
        try {
            // Request permission first to get labels
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            const devs = await navigator.mediaDevices.enumerateDevices();
            setDevices(devs);
            
            // Set defaults if not set
            const videoDevs = devs.filter(d => d.kind === 'videoinput');
            const audioDevs = devs.filter(d => d.kind === 'audioinput');
            
            if (videoDevs.length > 0 && !selectedVideoDevice) setSelectedVideoDevice(videoDevs[0].deviceId);
            if (audioDevs.length > 0 && !selectedAudioDevice) setSelectedAudioDevice(audioDevs[0].deviceId);
        } catch (e) {
            console.warn("Could not enumerate devices", e);
        }
    };
    getDevices();
  }, []); // Run once on mount

  // Generate Background using Gemini 2.5 Flash Image
  const generateBackground = async () => {
    if (!state.scenario || !state.apiKey) return;
    setState(prev => ({ ...prev, step: 'generating' }));

    try {
      const ai = new GoogleGenAI({ apiKey: state.apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{ text: `High quality anime style background art, vivid colors, highly detailed, 4k. Scenario: ${state.scenario}. No people, only scenery, cinematic lighting.` }]
        },
        config: {
            responseModalities: [Modality.IMAGE],
        }
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      if (part && part.inlineData) {
        const base64Image = `data:image/jpeg;base64,${part.inlineData.data}`;
        setState(prev => ({ ...prev, backgroundUrl: base64Image, step: 'call' }));
      } else {
          // Fallback logic handled by UI state (no background)
          alert("Could not generate background. Please try again.");
          setState(prev => ({ ...prev, step: 'setup' }));
      }
    } catch (e) {
      console.error("Failed to generate background", e);
      alert("Generation failed. Please check your API key or try again.");
      setState(prev => ({ ...prev, step: 'setup' }));
    }
  };

  // User Camera Setup
  useEffect(() => {
    if (state.step === 'call' && videoRef.current) {
      const constraints = {
        video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
        audio: false
      };
      
      navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(e => console.error("Camera access denied", e));
    }
  }, [state.step, selectedVideoDevice]);

  const handleVrmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setState(prev => ({ ...prev, vrmUrl: url }));
    }
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBgMode('upload');
      setState(prev => ({ ...prev, backgroundUrl: url }));
    }
  };

  // When a scenario is selected, update text
  const handleScenarioSelect = (scenario: typeof SCENARIOS[0]) => {
    setState(prev => ({ ...prev, scenario: scenario.text }));
  };

  const handleStart = () => {
    if (!state.vrmUrl || !state.scenario || !state.apiKey) return;

    if (bgMode === 'generate') {
        generateBackground();
    } else {
        // If upload, go directly to call
        setState(prev => ({ ...prev, step: 'call' }));
    }
  };

  // SETUP & LOADING VIEW
  if (state.step === 'setup' || state.step === 'generating') {
    return (
      <div className="w-full min-h-screen bg-[#FFF5F7] text-gray-800 font-hand overflow-y-auto">
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            
            <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-bold text-pink-500 mb-4 drop-shadow-sm" style={{ textShadow: '2px 2px 0 #000' }}>
                    VRM Live Call
                </h1>
                <p className="text-xl text-gray-600 font-medium">
                    Chat with your favorite character in 3D! ✨
                </p>
            </div>

            {/* 0. API Key Section */}
            <div className="bg-white rounded-2xl p-6 border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] mb-8 transition-transform hover:-translate-y-1">
                <h2 className="text-2xl font-bold mb-4 flex items-center text-gray-900">
                    <div className="bg-green-100 p-2 rounded-lg border-2 border-gray-900 mr-3">
                        <Key className="w-6 h-6 text-green-600" />
                    </div>
                    1. Enter Gemini API Key
                </h2>
                <input 
                    type="password" 
                    value={state.apiKey}
                    onChange={(e) => setState(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Paste your API Key here..."
                    className="w-full bg-gray-50 border-2 border-gray-900 rounded-xl p-4 text-gray-800 placeholder-gray-400 focus:ring-0 focus:border-green-500 outline-none text-lg shadow-inner"
                />
                 <p className="text-xs text-gray-500 mt-2">
                    Don't have one? <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-pink-500 font-bold underline">Get it here</a>.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Left Column: Avatar & Personality */}
                <div className="space-y-8">
                    {/* 2. Upload Avatar */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1">
                        <h2 className="text-2xl font-bold mb-4 flex items-center text-gray-900">
                            <div className="bg-blue-100 p-2 rounded-lg border-2 border-gray-900 mr-3">
                                <User className="w-6 h-6 text-blue-600" />
                            </div>
                            2. Choose Character
                        </h2>
                        <div className="relative group cursor-pointer">
                            <input 
                            type="file" 
                            accept=".vrm" 
                            onChange={handleVrmChange} 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all ${state.vrmUrl ? 'border-green-500 bg-green-50' : 'border-gray-400 bg-gray-50 group-hover:bg-blue-50 group-hover:border-blue-500'}`}>
                            {state.vrmUrl ? (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center mb-3 shadow-[3px_3px_0px_0px_rgba(34,197,94,1)]">
                                        <Check className="w-8 h-8 text-green-600" />
                                    </div>
                                    <span className="text-green-700 font-bold text-lg">Model Loaded!</span>
                                    <span className="text-sm text-gray-500 mt-1">Click to change</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center mb-3 shadow-[3px_3px_0px_0px_rgba(59,130,246,1)]">
                                        <Upload className="w-8 h-8 text-blue-600" />
                                    </div>
                                    <span className="text-gray-700 font-bold text-lg">Upload VRM Model</span>
                                    <span className="text-sm text-gray-500 mt-1">Drag & drop or click</span>
                                </>
                            )}
                            </div>
                        </div>
                    </div>

                     {/* 3. Character Identity */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1">
                        <h2 className="text-2xl font-bold mb-4 flex items-center text-gray-900">
                            <div className="bg-yellow-100 p-2 rounded-lg border-2 border-gray-900 mr-3">
                                <Smile className="w-6 h-6 text-yellow-600" />
                            </div>
                            3. Character Identity
                        </h2>
                        
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-600 mb-2">Name</label>
                            <input 
                                type="text" 
                                value={state.characterName}
                                onChange={(e) => setState(prev => ({ ...prev, characterName: e.target.value }))}
                                placeholder="e.g. Hatsune Miku"
                                className="w-full bg-gray-50 border-2 border-gray-900 rounded-xl p-3 text-gray-800 focus:border-yellow-500 outline-none"
                            />
                        </div>

                        <label className="block text-sm font-bold text-gray-600 mb-2">Personality Preset</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                            {PERSONALITIES.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setState(prev => ({ ...prev, personality: p.label }))}
                                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${state.personality === p.label ? 'bg-yellow-100 border-yellow-500 shadow-[2px_2px_0px_0px_rgba(234,179,8,1)] translate-x-[1px] translate-y-[1px]' : 'bg-white border-gray-900 hover:bg-gray-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]'}`}
                                >
                                    <span className="text-2xl mb-1">{p.emoji}</span>
                                    <span className="font-bold text-sm text-gray-800">{p.label}</span>
                                    <span className="text-[10px] text-gray-500 leading-tight text-center mt-1">{p.desc}</span>
                                </button>
                            ))}
                        </div>

                        <label className="block text-sm font-bold text-gray-600 mb-2">Or Custom Personality</label>
                        <textarea 
                            value={state.personality}
                            onChange={(e) => setState(prev => ({ ...prev, personality: e.target.value }))}
                            placeholder="Describe the character's personality..."
                            className="w-full bg-gray-50 border-2 border-gray-900 rounded-xl p-3 text-gray-800 h-24 resize-none focus:border-yellow-500 outline-none shadow-inner"
                        />
                    </div>
                </div>

                {/* Right Column: Scenario & Background & Start */}
                <div className="flex flex-col space-y-8">
                    
                    {/* 4. Scenario */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-1">
                        <h2 className="text-2xl font-bold mb-4 flex items-center text-gray-900">
                            <div className="bg-purple-100 p-2 rounded-lg border-2 border-gray-900 mr-3">
                                <Sparkles className="w-6 h-6 text-purple-600" />
                            </div>
                            4. Pick a Scenario
                        </h2>
                        
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {SCENARIOS.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => handleScenarioSelect(s)}
                                    className={`flex items-center p-3 rounded-xl border-2 transition-all text-left ${state.scenario === s.text ? 'bg-purple-100 border-purple-500 shadow-[2px_2px_0px_0px_rgba(168,85,247,1)] translate-x-[1px] translate-y-[1px]' : 'bg-white border-gray-900 text-gray-700 hover:bg-gray-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]'}`}
                                >
                                    <s.icon className={`w-5 h-5 mr-3 flex-shrink-0 ${state.scenario === s.text ? 'text-purple-600' : 'text-gray-500'}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">{s.label}</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <textarea 
                            value={state.scenario}
                            onChange={(e) => setState(prev => ({ ...prev, scenario: e.target.value }))}
                            placeholder="Or write your own story here..."
                            className="w-full bg-gray-50 border-2 border-gray-900 rounded-xl p-4 text-gray-800 placeholder-gray-400 focus:ring-0 focus:border-pink-500 outline-none h-32 resize-none text-lg leading-relaxed shadow-inner"
                        />
                    </div>

                     {/* 5. Background */}
                     <div className="bg-white rounded-2xl p-6 border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex-1 flex flex-col transition-transform hover:-translate-y-1">
                        <h2 className="text-2xl font-bold mb-4 flex items-center text-gray-900">
                            <div className="bg-orange-100 p-2 rounded-lg border-2 border-gray-900 mr-3">
                                <ImageIcon className="w-6 h-6 text-orange-600" />
                            </div>
                            5. Set the Scene
                        </h2>
                        
                        <div className="flex space-x-2 bg-gray-100 p-2 rounded-xl border-2 border-gray-900 mb-6">
                            {['upload', 'generate'].map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setBgMode(mode as any)}
                                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all capitalize border-2 ${bgMode === mode ? 'bg-white border-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 min-h-[240px]">
                            {bgMode === 'upload' && (
                                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-400 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-colors relative bg-gray-50">
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handleBgUpload} 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    {state.backgroundUrl ? (
                                        <div className="relative w-full h-full p-4">
                                            <img src={state.backgroundUrl} className="w-full h-full object-contain rounded-lg shadow-md" alt="Uploaded" />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                                                <span className="text-white font-bold bg-black/50 px-3 py-1 rounded-full">Click to change</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center p-6">
                                            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                            <span className="text-gray-600 font-bold">Upload Image</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {bgMode === 'generate' && (
                                <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl border-2 border-dashed border-purple-300 p-6 text-center">
                                    <Sparkles className="w-16 h-16 text-purple-400 mb-4 animate-bounce" />
                                    <h3 className="text-xl font-bold text-purple-900 mb-2">AI Magic ✨</h3>
                                    <p className="text-purple-700 text-sm max-w-xs">
                                        I'll create an anime-style background for your story!
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <button 
                    onClick={handleStart}
                    disabled={!state.vrmUrl || !state.scenario || !state.apiKey || state.step === 'generating'}
                    className="w-full bg-pink-500 hover:bg-pink-400 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold text-xl py-5 rounded-2xl border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[6px] active:translate-y-[6px] transition-all flex items-center justify-center group"
                    >
                    {state.step === 'generating' ? (
                        <>
                        <Loader2 className="w-6 h-6 animate-spin mr-3" />
                        Painting World...
                        </>
                    ) : (
                        <>
                        Start Call
                        <ArrowRight className="w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                    </button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // CALL VIEW (Fullscreen, no scroll)
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-hand">
        
        {/* Studio Settings Toggle Button */}
        <button 
            onClick={() => setShowSettings(!showSettings)}
            className="absolute top-6 left-6 p-3 bg-white rounded-xl border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 z-40 transition-transform active:translate-y-1 active:shadow-none group"
            title="Studio Settings"
        >
            {showSettings ? <X className="w-6 h-6" /> : <Settings className="w-6 h-6 group-hover:rotate-90 transition-transform" />}
        </button>

        {/* Studio Settings Panel */}
        {showSettings && (
            <div className="absolute top-24 left-6 w-80 bg-white p-5 rounded-xl border-2 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] z-40 font-hand animate-in fade-in slide-in-from-left-4 duration-200 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center mb-4 border-b-2 border-gray-200 pb-2">
                    <Settings className="w-5 h-5 mr-2 text-gray-600" />
                    <h3 className="font-bold text-xl">Studio Settings</h3>
                </div>

                {/* Device Settings */}
                <div className="mb-6 space-y-4">
                     <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex items-center">
                             <Camera className="w-4 h-4 mr-2" /> Camera
                        </label>
                        <select 
                            value={selectedVideoDevice}
                            onChange={(e) => setSelectedVideoDevice(e.target.value)}
                            className="w-full p-2 bg-gray-50 border-2 border-gray-300 rounded-lg text-sm focus:border-pink-500 outline-none"
                        >
                            {devices.filter(d => d.kind === 'videoinput').map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}...`}</option>
                            ))}
                        </select>
                     </div>

                     <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex items-center">
                             <Mic className="w-4 h-4 mr-2" /> Microphone
                        </label>
                        <select 
                            value={selectedAudioDevice}
                            onChange={(e) => setSelectedAudioDevice(e.target.value)}
                            className="w-full p-2 bg-gray-50 border-2 border-gray-300 rounded-lg text-sm focus:border-pink-500 outline-none"
                        >
                            {devices.filter(d => d.kind === 'audioinput').map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}...`}</option>
                            ))}
                        </select>
                     </div>
                </div>
                
                <div className="flex items-center mb-4 border-b-2 border-gray-200 pb-2 pt-2">
                    <Sun className="w-5 h-5 mr-2 text-orange-500" />
                    <h3 className="font-bold text-lg">Lighting & FX</h3>
                </div>
                
                <div className="space-y-5">
                    <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex justify-between">
                            <span>Expression Intensity</span>
                            <span>{Math.round(expressionFactor * 100)}%</span>
                        </label>
                        <input 
                            type="range" min="0" max="1.5" step="0.1" 
                            value={expressionFactor}
                            onChange={(e) => setExpressionFactor(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex justify-between">
                            <span>Ambient Brightness</span>
                            <span>{lighting.ambient.toFixed(1)}</span>
                        </label>
                        <input 
                            type="range" min="0" max="5" step="0.1" 
                            value={lighting.ambient}
                            onChange={(e) => setLighting(l => ({...l, ambient: parseFloat(e.target.value)}))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex justify-between">
                            <span>Key Light (Directional)</span>
                            <span>{lighting.directional.toFixed(1)}</span>
                        </label>
                        <input 
                            type="range" min="0" max="10" step="0.1" 
                            value={lighting.directional}
                            onChange={(e) => setLighting(l => ({...l, directional: parseFloat(e.target.value)}))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex justify-between">
                            <span>Spot Light</span>
                            <span>{lighting.spot.toFixed(1)}</span>
                        </label>
                        <input 
                            type="range" min="0" max="10" step="0.1" 
                            value={lighting.spot}
                            onChange={(e) => setLighting(l => ({...l, spot: parseFloat(e.target.value)}))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-gray-600 flex justify-between">
                            <span>Environment (IBL)</span>
                            <span>{lighting.env.toFixed(1)}</span>
                        </label>
                        <input 
                            type="range" min="0" max="3" step="0.1" 
                            value={lighting.env}
                            onChange={(e) => setLighting(l => ({...l, env: parseFloat(e.target.value)}))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                        />
                    </div>
                </div>
                
                <div className="mt-4 pt-3 border-t-2 border-gray-100 text-xs text-gray-400 text-center">
                    Adjust until the character looks perfect! ✨
                </div>
            </div>
        )}

      {/* 3D Scene (Remote) */}
      <div className="absolute inset-0 z-0">
        {state.backgroundUrl && (
           <div 
             className="absolute inset-0 bg-cover bg-center z-[-1] brightness-[0.7]"
             style={{ backgroundImage: `url(${state.backgroundUrl})` }}
           />
        )}
        {/* Disable shadows in canvas to prevent shader errors */}
        <Canvas className="w-full h-full" shadows={false}>
            <PerspectiveCamera makeDefault position={[0, 1.4, 1]} fov={45} />
            
            {/* Dynamic Lighting based on settings */}
            <ambientLight intensity={lighting.ambient} />
            <directionalLight position={[-2, 2, 2]} intensity={lighting.directional} color="#ffffff" />
            <spotLight position={[0, 2, 2]} angle={0.5} penumbra={1} intensity={lighting.spot} />
            <Environment preset="sunset" environmentIntensity={lighting.env} />

            {state.vrmUrl && (
              <group position={[0, 0, 0]}>
                <Avatar url={state.vrmUrl} analyser={analyser} expressionFactor={expressionFactor} />
              </group>
            )}

            <OrbitControls 
              target={[0, 1.4, 0]} 
              enableZoom={true} 
              minDistance={0.5} 
              maxDistance={2} 
              enablePan={false}
              maxPolarAngle={Math.PI / 2}
              minPolarAngle={Math.PI / 3}
            />
        </Canvas>
      </div>

      {/* Self View (User) */}
      <div className="absolute top-4 right-4 w-32 h-48 md:w-48 md:h-72 bg-white rounded-2xl overflow-hidden border-4 border-gray-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.5)] z-20 transform rotate-[-2deg] transition-transform hover:rotate-0">
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className="w-full h-full object-cover transform scale-x-[-1]" 
        />
        <div className="absolute bottom-2 left-2 bg-pink-500/90 px-3 py-1 rounded-lg border-2 border-black text-xs font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">YOU</div>
      </div>

      {/* Status & Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-30 flex flex-col items-center bg-gradient-to-t from-pink-900/50 via-transparent to-transparent">
        
        {/* Status Bubble */}
        <div className={`mb-8 px-6 py-3 rounded-full border-2 border-gray-900 text-base font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center space-x-3 ${
            isConnected 
            ? (isSpeaking ? 'bg-green-400 text-black animate-bounce' : 'bg-white text-black')
            : 'bg-red-400 text-white'
        }`}>
           <div className={`w-3 h-3 rounded-full border border-black ${isConnected ? (isSpeaking ? 'bg-green-200' : 'bg-green-500') : 'bg-red-200 animate-pulse'}`} />
           <span>
             {error ? error : !isConnected ? 'Connecting...' : isSpeaking ? 'Talking...' : 'Listening...'}
           </span>
        </div>

        {/* Control Bar */}
        <div className="flex items-center space-x-6 bg-white p-4 rounded-3xl border-2 border-gray-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <button 
            onClick={() => setMicOn(!micOn)}
            className={`p-4 rounded-2xl border-2 border-gray-900 transition-all transform active:translate-y-1 active:shadow-none ${micOn ? 'bg-gray-100 text-gray-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-200' : 'bg-red-500 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-red-600'}`}
          >
            {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button 
            onClick={() => setState(prev => ({ ...prev, step: 'setup', backgroundUrl: null, vrmUrl: null }))}
            className="p-6 rounded-full bg-red-500 text-white border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-red-600 active:translate-y-1 active:shadow-none transition-all transform hover:-translate-y-1"
          >
            <PhoneOff className="w-8 h-8" />
          </button>

          <button className="p-4 rounded-2xl bg-gray-100 text-gray-800 border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-200 active:translate-y-1 active:shadow-none transition-all">
             <Camera className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
