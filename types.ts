
export interface AppState {
  step: 'setup' | 'generating' | 'call';
  apiKey: string;
  characterName: string;
  scenario: string;
  personality: string;
  vrmUrl: string | null;
  backgroundUrl: string | null;
}

export interface AudioVisualizerData {
  volume: number; // 0 to 1
  frequencyData: Uint8Array;
}
