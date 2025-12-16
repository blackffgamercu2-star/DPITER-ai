
export interface ImageFile {
  file: File;
  base64: string;
  mimeType: string;
}

export interface ColorSuggestion {
  name: string;
  hex: string;
}

export type ApiProvider = 'google' | 'openrouter';

export interface ApiSettings {
  provider: ApiProvider;
  apiKey: string;
  model: string;
}

export interface GenerationResult {
  base64: string;
  prompt: string;
  videoPrompt?: string;
}

// New Types for Character Gaze
export interface Frame {
    frameIndex: number;
    base64: string;
    prompt: string;
    videoPrompt: string;
    audioContext?: string;      // The active audio context used for generation
    tempAudioContext?: string;  // The current value in the input field
}

export interface CharacterScene {
    id: string;
    frames: Frame[];
    isLoading: boolean;
    error?: string;
    category: string;
    settings: {
        gender: string;
        age: string;
        ratio: string;
    };
}
