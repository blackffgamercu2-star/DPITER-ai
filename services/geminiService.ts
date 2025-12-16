
import { GoogleGenAI, Modality, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { ColorSuggestion, ApiSettings } from '../types';

// Default System Key (Fallback)
const SYSTEM_API_KEY = process.env.API_KEY;

if (!SYSTEM_API_KEY) {
    console.warn("API_KEY environment variable not set. System features may fail if user does not provide a key.");
}

interface ImageData {
    base64: string;
    mimeType: string;
}

export interface VideoPromptOptions {
    category: string;
    quantity: number;
    aspectRatio: string;
    productImage?: string | null;
    frameIndex?: number; // 1 = Start, 2 = Next, etc.
    language?: string; // New: English, Hindi, etc.
    audioContext?: string; // New: Text for lip-sync/voice
}

// Helper to delay execution
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Get Client based on Settings ---
const getGoogleClient = (apiKey?: string) => {
    const keyToUse = apiKey && apiKey.trim() !== '' ? apiKey : SYSTEM_API_KEY;
    if (!keyToUse) throw new Error("No API Key available. Please add one in Settings.");
    return new GoogleGenAI({ apiKey: keyToUse });
};

// --- HELPER: OpenRouter Adapter ---
async function callOpenRouter(
    settings: ApiSettings,
    prompt: string,
    images?: ImageData[],
    systemInstruction?: string
): Promise<string> {
    if (!settings.apiKey) throw new Error("OpenRouter API Key is required.");

    const messages: any[] = [];
    
    // System Instruction (if supported by the OpenRouter model via system role)
    if (systemInstruction) {
        messages.push({ role: "system", content: systemInstruction });
    }

    // User Message Construction (Multimodal)
    const userContent: any[] = [];
    userContent.push({ type: "text", text: prompt });

    if (images) {
        for (const img of images) {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: `data:${img.mimeType};base64,${img.base64}`
                }
            });
        }
    }

    messages.push({ role: "user", content: userContent });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${settings.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin, // Required by OpenRouter
            "X-Title": "DPITER AI"
        },
        body: JSON.stringify({
            model: settings.model || "google/gemini-2.0-flash-exp:free",
            messages: messages
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

// Retry wrapper for API calls
async function retryRequest<T>(fn: () => Promise<T>, retries = 10, delay = 5000): Promise<T> {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const errString = String(error);
      const errMessage = error?.message || '';
      
      const isRateLimit = 
        errString.includes('429') || 
        errMessage.includes('429') || 
        errString.includes('RESOURCE_EXHAUSTED');

      const isServerIssue = 
        errString.includes('500') || 
        errString.includes('503');

      if (isRateLimit || isServerIssue) {
         const waitTime = delay * Math.pow(2, i);
         console.warn(`API attempt ${i + 1} failed, retrying in ${waitTime}ms...`);
         await sleep(waitTime);
         continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// --- PUBLIC FUNCTIONS ---

export async function generateImage(
  prompt: string,
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1",
  image?: ImageData | null,
  secondaryImage?: ImageData | null,
  apiSettings?: ApiSettings
): Promise<string> {
    return retryRequest(async () => {
        // Fallback to Google if OpenRouter is selected for IMAGES (unless OpenRouter supports pixel generation in future)
        if (apiSettings?.provider === 'openrouter') {
             console.warn("OpenRouter currently primarily supports Text/Chat. Attempting to use Google Adapter if possible, otherwise defaulting to System.");
        }

        const client = getGoogleClient(apiSettings?.apiKey);

        try {
            const parts: any[] = [];
            if (image) parts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
            if (secondaryImage) parts.push({ inlineData: { data: secondaryImage.base64, mimeType: secondaryImage.mimeType } });
            parts.push({ text: prompt });

            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash-image', // Specialized Image Model
                contents: { parts: parts },
                config: { 
                    responseModalities: [Modality.IMAGE],
                    imageConfig: { aspectRatio: aspectRatio },
                    safetySettings: safetySettings,
                }
            });

            return parseImageResponse(response);

        } catch (error) {
            console.error("Error generating image:", error);
            throw error;
        }
    });
}

export async function editImageWithNanoBanana(
  prompt: string,
  primaryImage?: ImageData | null,
  auxiliaryImages?: ImageData[] | null,
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1",
  apiSettings?: ApiSettings
): Promise<string> {
  return retryRequest(async () => {
      const client = getGoogleClient(apiSettings?.provider === 'google' ? apiSettings.apiKey : undefined);

      try {
        const parts: any[] = [];
        if (primaryImage) parts.push({ inlineData: { data: primaryImage.base64, mimeType: primaryImage.mimeType } });
        if (auxiliaryImages) {
            for (const auxImage of auxiliaryImages) {
                 parts.push({ inlineData: { data: auxImage.base64, mimeType: auxImage.mimeType } });
            }
        }
        
        // ENFORCE PHOTOREALISM IN SYSTEM INSTRUCTION
        const strictPrompt = `
        CRITICAL STYLE RULES (NON-NEGOTIABLE):
        1. 100% ULTRA-PHOTOREALISTIC REAL HUMAN ONLY.
        2. NO cartoon, NO illustration, NO anime, NO CGI, NO 3D render styles.
        3. Professional DSLR / Cinema Camera Realism (Depth of field, skin texture, pores).
        4. IF A REFERENCE IMAGE IS PROVIDED, THE IDENTITY (FACE/HAIR/BODY) MUST BE LOCKED AND MATCH EXACTLY.
        5. IF A PRODUCT IS PROVIDED, IT MUST BE REALISTICALLY INTEGRATED (Perfect grip, no floating).
        
        USER REQUEST: ${prompt}`;

        parts.push({ text: strictPrompt });

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: parts },
          config: { 
              responseModalities: [Modality.IMAGE],
              imageConfig: { aspectRatio: aspectRatio },
              safetySettings: safetySettings,
          }
        });

        return parseImageResponse(response);

      } catch (error) {
        console.error("Error editing image:", error);
        throw error;
      }
  });
}

export async function getVideoGenerationPrompt(
    imageBase64: string,
    options: VideoPromptOptions,
    apiSettings?: ApiSettings
): Promise<string> {
  return retryRequest(async () => {
    try {
      const frameIndex = options.frameIndex || 1;
      const targetLanguage = options.language || "English";
      
      // Audio Context Logic with Enhancement
      let audioInstruction = "";
      if (options.audioContext && options.audioContext.trim() !== "") {
          audioInstruction = `
          \n*** AUDIO/DIALOGUE ENHANCEMENT (CRITICAL) ***
          INPUT TEXT: "${options.audioContext}"
          TASK: The user has provided rough audio text. You MUST ENHANCE this into a professional screenplay dialogue format.
          1. **Refine Dialogue**: Polish the phrasing to sound natural, character-appropriate, and engaging in ${targetLanguage}.
          2. **Add Emotions**: Include explicit cues like [Sighs], [Chuckles], [Whispers], [Excited], [Serious].
          3. **Vocal Tone**: Describe the exact pitch, speed, and modulation (e.g., "Deep, slow, authoritative" or "High-pitched, rapid, energetic").
          4. **Lip-Sync**: Ensure the video prompt explicitly mentions the mouth movements matching this enhanced dialogue.
          `;
      }

      // Determine Scene Logic based on Frame Index (Time Sequence)
      let sceneLogic = "";
      let timeStamp = "";
      
      // Standard 8 second blocks
      const startSec = (frameIndex - 1) * 8;
      const endSec = frameIndex * 8;
      timeStamp = `${startSec}s to ${endSec}s`;

      if (frameIndex === 1) {
          sceneLogic = "FRAME 1 (START): Establish the scene, character, and outfit. Subtle, confident movement.";
      } else if (frameIndex === 2) {
          sceneLogic = "FRAME 2 (CONTINUATION): Continue from Frame 1 naturally. The character performs the main action.";
      } else if (frameIndex === 3) {
          sceneLogic = "FRAME 3 (EMOTION/REACTION): Close-up or reaction. Highlight key emotion. Emphasize eye contact.";
      } else {
          sceneLogic = `FRAME ${frameIndex} (PROGRESSION): A calm, resolving shot or new action beat.`;
      }

      const systemPrompt = `
You are an ELITE AI VIDEO PROMPT GENERATOR for High-Fidelity Human Characters.
Your task is to analyze the input image and generate a technical video generation prompt for an EXACT 8-SECOND CLIP (${timeStamp}).

══════════════════════════════════════
OUTPUT LANGUAGE: ${targetLanguage.toUpperCase()}
══════════════════════════════════════
The ENTIRE output prompt must be written in ${targetLanguage}.

══════════════════════════════════════
CATEGORY SPECS: ${options.category.toUpperCase()}
══════════════════════════════════════
Determine the Voice Tone, Action, and Camera based on this category.

══════════════════════════════════════
VIDEO PROMPT QUALITY REQUIREMENTS
══════════════════════════════════════
1. DURATION: "Generate a video clip of exactly 8 seconds."
2. IDENTITY LOCK: "Strictly preserve face, hair, and body identity from input image."
3. AUDIO/LIP-SYNC: ${audioInstruction ? "Include specific lip-sync instructions for the ENHANCED dialogue." : "Mouth closed or natural breathing if not speaking."}
4. MOVEMENT: "Fluid, human-like motion. No robotic stiffness."
5. CAMERA: "Cinematic lighting, high dynamic range."
6. SCENE LOGIC: ${sceneLogic}

${audioInstruction}

══════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════
Generate a SINGLE, detailed paragraph in ${targetLanguage}.
Include: [Subject Description] [Action/Movement for 8 seconds] [Camera/Angle] [Lighting] [Enhanced Audio/Lip-Sync details].
`;
      const fullPrompt = `${systemPrompt}\n\nBased on the attached image, generate the advanced video prompt.`;

      // --- OPENROUTER PATH ---
      if (apiSettings?.provider === 'openrouter') {
          const images = [{ base64: imageBase64, mimeType: 'image/jpeg' }];
          if (options.productImage) {
              images.push({ base64: options.productImage, mimeType: 'image/jpeg' });
          }
          return await callOpenRouter(apiSettings, fullPrompt, images);
      }

      // --- GOOGLE GENAI PATH ---
      const client = getGoogleClient(apiSettings?.apiKey);
      
      const parts: any[] = [
        { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }
      ];
      if (options.productImage) {
        parts.push({ inlineData: { data: options.productImage, mimeType: 'image/jpeg' } });
      }
      parts.push({ text: systemPrompt });

      const response = await client.models.generateContent({
        model: apiSettings?.model || 'gemini-2.5-flash',
        contents: { parts: parts },
      });

      return response.text || "Could not generate prompt.";

    } catch (error) {
      console.error("Error generating video prompt:", error);
      throw error;
    }
  });
}

function parseImageResponse(response: GenerateContentResponse): string {
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("Generation blocked or failed.");
    }
    const candidate = response.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Generation stopped: ${candidate.finishReason}`);
    }
    const parts = candidate.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) return part.inlineData.data;
      }
    }
    if (response.text) {
        throw new Error(`Model returned text instead of image: "${response.text}"`);
    }
    throw new Error("No image data found in response.");
}

export async function getPromptSuggestions(prompt: string, apiSettings?: ApiSettings): Promise<string[]> {
    // Basic text feature, can work with OpenRouter
    if (apiSettings?.provider === 'openrouter') {
        try {
            const res = await callOpenRouter(apiSettings, `Provide 3 short, creative edit suggestions for: "${prompt}". Return JSON: { "suggestions": [] }`);
            const json = JSON.parse(res);
            return json.suggestions || [];
        } catch { return []; }
    }

    const client = getGoogleClient(apiSettings?.apiKey);
    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Prompt: "${prompt}". Return 3 suggestions JSON.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { suggestions: { type: Type.ARRAY, items: { type: Type.STRING } } }
                }
            }
        });
        const json = JSON.parse(response.text);
        return json.suggestions || [];
    } catch { return []; }
}

export async function getOutfitColorSuggestions(outfitImage: ImageData, apiSettings?: ApiSettings): Promise<ColorSuggestion[]> {
    const client = getGoogleClient(apiSettings?.apiKey);
    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { data: outfitImage.base64, mimeType: outfitImage.mimeType } },
                    { text: "Suggest 3 colors for this outfit. Return JSON { colors: [{name, hex}] }" }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        colors: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { name: { type: Type.STRING }, hex: { type: Type.STRING } }
                            }
                        }
                    }
                }
            }
        });
        const json = JSON.parse(response.text);
        return json.colors?.slice(0,3) || [];
    } catch { return []; }
}
