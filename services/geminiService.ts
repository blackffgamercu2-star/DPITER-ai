import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import type { ColorSuggestion } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

interface ImageData {
    base64: string;
    mimeType: string;
}

export async function editImageWithNanoBanana(
  faceImage: ImageData,
  prompt: string,
  outfitImage?: ImageData | null,
): Promise<string> {
  try {
    // FIX: Explicitly type `parts` to allow both image and text parts.
    // This prevents a TypeScript error where the array type was inferred too
    // narrowly from its first element.
    const parts: ({ inlineData: { data: string; mimeType: string; } } | { text: string; })[] = [
      {
        inlineData: {
          data: faceImage.base64,
          mimeType: faceImage.mimeType,
        },
      },
    ];

    if (outfitImage) {
        parts.push({
            inlineData: {
                data: outfitImage.base64,
                mimeType: outfitImage.mimeType,
            },
        });
    }

    parts.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: parts,
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }

    throw new Error("No image data found in the API response.");

  } catch (error) {
    console.error("Error editing image with Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to edit image: ${error.message}`);
    }
    throw new Error("An unknown error occurred while editing the image.");
  }
}

export async function getPromptSuggestions(prompt: string): Promise<string[]> {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the following image editing prompt, provide 3 creative and concise suggestions for edits. The suggestions should be short phrases that could be appended to the original prompt. Do not repeat the original prompt. Only return the suggestions. Prompt: "${prompt}"`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    suggestions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                            description: "A single, concise suggestion for an image edit."
                        }
                    }
                },
                required: ['suggestions']
            }
        }
    });

    const jsonResponse = JSON.parse(response.text);
    if (jsonResponse && jsonResponse.suggestions && Array.isArray(jsonResponse.suggestions)) {
        return jsonResponse.suggestions;
    }
    console.warn("Could not parse suggestions from Gemini response", response.text);
    return [];

  } catch (error) {
    console.error("Error getting prompt suggestions:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to get suggestions: ${error.message}`);
    }
    throw new Error("An unknown error occurred while getting suggestions.");
  }
}

export async function getOutfitColorSuggestions(outfitImage: ImageData): Promise<ColorSuggestion[]> {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: outfitImage.base64,
                mimeType: outfitImage.mimeType,
              },
            },
            { text: `Analyze the uploaded outfit image. Identify the main top garment. Suggest three distinct and complementary alternative color variations for this main top garment. For each suggestion, provide a descriptive color name and its corresponding HEX code. Return a JSON object with a single key "colors" containing an array of objects, each with "name" (string) and "hex" (string) properties. Example: [{"name": "dusty rose", "hex": "#D8BFD8"}, {"name": "midnight blue", "hex": "#191970"}, {"name": "olive green", "hex": "#808000"}]` },
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
                            properties: {
                                name: { type: Type.STRING, description: "A descriptive color name." },
                                hex: { type: Type.STRING, description: "The hexadecimal code for the color." }
                            },
                            required: ['name', 'hex']
                        }
                    }
                },
                required: ['colors']
            }
        }
    });

    const jsonResponse = JSON.parse(response.text);
    if (jsonResponse && jsonResponse.colors && Array.isArray(jsonResponse.colors) && jsonResponse.colors.length > 0) {
        return jsonResponse.colors.slice(0, 3); // Ensure only 3 colors are returned
    }
    console.warn("Could not parse color suggestions from Gemini response", response.text);
    return [];

  } catch (error) {
    console.error("Error getting color suggestions:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to get color suggestions: ${error.message}`);
    }
    throw new Error("An unknown error occurred while getting color suggestions.");
  }
}