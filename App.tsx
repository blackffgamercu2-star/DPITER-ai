
import React, { useState, useCallback, useEffect } from 'react';
import type { ImageFile, ApiSettings, GenerationResult, CharacterScene, Frame } from './types';
import { editImageWithNanoBanana, generateImage, getVideoGenerationPrompt } from './services/geminiService';
import { ImageUploader } from './components/ImageUploader';
import { Spinner } from './components/Spinner';
import { ImageViewerModal } from './components/ImageViewerModal';
import { ApiSettingsModal } from './components/ApiSettingsModal';

// Declare JSZip for TypeScript since it's loaded from a script tag in index.html
declare const JSZip: any;

// Helper to delay execution (Prevent Rate Limits)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced IR Prompts
const IR_PROMPTS = [
  { name: "Color/Pattern Variant", prompt: "Identify the main product in the image. Generate a CREATIVE ALTERNATIVE version of this product with a completely different color scheme or pattern. CRITICAL: Keep the background, lighting, shadows, and perspective EXACTLY the same. Render in 8k hyper-realistic detail." },
  { name: "Material/Texture Swap", prompt: "Identify the main product in the image. Change its material (e.g., to leather, matte, metallic, or textured fabric) to create a distinct look. CRITICAL: Keep the background, lighting, shadows, and perspective EXACTLY the same. Render in 8k hyper-realistic detail." },
  { name: "Modern Redesign", prompt: "Identify the main product in the image. Redesign the product to look more modern, sleek, and minimalist. CRITICAL: Keep the background, lighting, shadows, and perspective EXACTLY the same. Render in 8k hyper-realistic detail." },
  { name: "Luxury Edition", prompt: "Identify the main product in the image. Transform the product into a high-end, premium luxury edition with elegant details. CRITICAL: Keep the background, lighting, shadows, and perspective EXACTLY the same. Render in 8k hyper-realistic detail." }
];

// PS Scan Prompts
const PS_BASE_PROMPT = `Identify the outfit worn by the specified subject in the image. 
ACTION: Extract the outfit (Top + Bottom + Shoes if visible) and place it on a clean white floor.
STYLE: Photorealistic Product Flat Lay.
VIEW: Slightly high angle or top-down (Placement on Ground).
BACKGROUND: Pure Solid White (#FFFFFF).
DETAILS: 
- The clothes should look naturally placed on the floor, not floating.
- Realistic fabric textures, folds, and contact shadows on the floor.
- CRITICAL: NO MODEL. NO BODY PARTS (No hands, no head, no legs). JUST THE CLOTHING ITEMS.
- Output Ratio: 4:3 (Landscape/Product friendly).`;

// UK Generator Base Prompt
const UK_BASE_PROMPT = `Generate a high-end fashion collage (9:16 ratio).

THEME: Modern Premium Korean Fashion.

CHARACTER DETAILS (CRITICAL):
• **Realistic Korean young male**: Clean sharp facial features.
• **Body Stats**: Tall (approx 185 cm), long legs, broad shoulders, slim waist, balanced proportions.
• **Neck**: Slightly long elegant neck with visible natural neck lines.
• **Skin**: Natural texture, soft studio lighting (NOT smoothed/plastic).
• **Vibe**: Modern, stylish, premium, confident.

FITTING & OUTFIT RULES:
• **Style**: Korean Minimalist Fashion.
• **Jeans/Pants**: MUST be OVER LOOSE-FITTING, relaxed, wide silhouette. Even if the input is straight-fit, stylize it as a realistic Korean loose-fit.
• **Tops**: Minimal Korean-style (polo or oversized tee), smooth fabric, clean folds.
• **General**: Outfit should drape naturally on the tall frame.

BACKGROUND:
• Urban Concrete Street (Grey tones).
• Minimalist Industrial Wall or Clean Urban Sidewalk.
• Soft, natural daylight. (Background kept consistent as requested).

POSES (Natural & Stylish):
1. Walking casually towards camera (dynamic).
2. Standing with one hand in pocket (cool posture).
3. Leaning on a wall, looking straight at camera.
4. Adjusting jacket/shirt or running hand through hair.

LAYOUT:
(Injected dynamically below)`;

// Data for Random Korean Set Generation
const K_TOP_STYLES = [
    "Knitted Quarter-Zip Polo", "Oversized Striped Rugby Polo", "Vintage Waffle-Weave Polo Shirt", 
    "Drop-Shoulder Minimalist Polo", "Contrast-Collar Streetwear Polo", "Ribbed Knit Classic Polo",
    "Heavyweight Boxy T-Shirt", "Oversized Graphic Hoodie", "Minimalist Sweatshirt", "Varsity Jacket",
    "Checkered Flannel Shirt (Oversized)", "Mock Neck Long Sleeve Tee", "Soft Knit Cardigan"
];

const K_TOP_COLORS = [
    "Cream Beige", "Forest Green", "Midnight Black", "Navy Blue", "Heather Grey", "Mocha Brown", 
    "Burgundy", "Charcoal", "Off-White", "Dusty Pink", "Olive Drab", "Slate Blue"
];

const K_BOTTOM_STYLES = [
    "Viral Wide-Leg Baggy Denim Jeans", "Classic Loose Fit Carpenter Jeans", "Vintage Wash Oversized Jeans",
    "Wide-Leg Pleated Slacks", "Baggy Parachute Cargo Pants", "Relaxed Fit Corduroy Pants",
    "Straight-Leg Raw Hem Jeans", "Oversized Sweatpants", "Double-Knee Work Pants"
];

const K_SHOE_STYLES = [
    "Chunky Retro Dad Sneakers", "Platform Leather Loafers", "Minimalist Canvas Deck Shoes", 
    "Tech-Runner Silver Sneakers", "Vintage Court Trainers", "Bulky Skate Shoes", "Chelsea Boots",
    "Derby Shoes", "German Army Trainers"
];

// UK Random Styles
const UK_RANDOM_STYLES = [
  "Vintage 90s White Polo (Oversized) tucked into Light Wash Baggy Jeans, Chunky Retro Sneakers",
  "Faded Black Graphic Tee (Boxy Fit), Charcoal Grey Wide-Leg Cargo Pants, Silver Chain",
  "Oversized Beige Knitted Sweater, Dark Indigo Raw Denim Baggy Jeans, Leather Boots",
  "Retro Navy Windbreaker Jacket, Grey Sweatpants (Baggy), New Balance style Runners",
  "Classic Striped 90s Shirt (Loose), Stonewash Blue Carpenter Jeans, Canvas Shoes",
  "Plain White Tee (Heavyweight), Vintage Brown Corduroy Baggy Pants, Streetwear Accessories",
  "Forest Green Boxy Fit T-Shirt, Raw Indigo Baggy Jeans, and White Sneakers",
  "Vintage Graphic Tee (White), Light Blue Ripped Baggy Jeans, and Retro High-Tops"
];

// --- CHARACTER GAZE CONSTANTS ---

const CHAR_CATEGORIES = [
  "Fashion", "Vlogging", "Travel", "Fitness", "Business", "Food", 
  "Beauty", "Technology", "Product Promotion", "Social Media Influencer", 
  "Cinematic", "Casual Daily Lifestyle", "Luxury", "Street Lifestyle"
];

const CHAR_AGES = ["Child", "Teen", "Young Adult", "Adult", "Middle Age", "Senior"];

// 10 Distinct Poses/Scenarios
const CHAR_POSES = [
  { type: "Portrait", desc: "Close-up portrait with a subtle smile, looking directly at the camera. Highlighting skin texture and eye reflection." },
  { type: "Walking", desc: "Full body shot, walking confidently towards the camera. Natural movement in hair and clothes." },
  { type: "Candid", desc: "Side profile view, candidly looking at something in the distance. Natural, unposed look." },
  { type: "Talking", desc: "Mid-shot, gesturing as if talking to an audience. Perfect for a video thumbnail or talking head." },
  { type: "Relaxed", desc: "Sitting in a relaxed, natural posture. Comfortable and authentic vibe." },
  { type: "Action", desc: "Dynamic action shot relevant to the category. Energy and movement." },
  { type: "Interaction", desc: "Holding or interacting with a relevant object (or the product if provided). Focus on hands and object integration." },
  { type: "Happy", desc: "Candid laughter or genuine happy expression. Radiating positivity." },
  { type: "Focused", desc: "Serious, focused, professional look. conveying competence and depth." },
  { type: "Creative", desc: "Creative low-angle shot to emphasize presence and authority. Cinematic composition." }
];

const SkeletonLoader: React.FC<{ count: number; text?: string; aspectRatio?: string }> = ({ count, text, aspectRatio = "aspect-[9/16]" }) => (
  <div className="w-full h-full flex flex-col items-center justify-center p-4">
    <div className={`w-full grid grid-cols-2 md:grid-cols-${count > 2 ? '4' : '2'} gap-4 animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className={`bg-slate-200 rounded-lg ${aspectRatio}`}
        />
      ))}
    </div>
    <p className="mt-6 text-lg font-medium text-slate-600">{text || "AI is generating new looks..."}</p>
    <p className="text-sm text-slate-500 mt-2">This may take a moment. Please wait.</p>
  </div>
);

const App: React.FC = () => {
  // Navigation State - Default to Character Gaze
  const [activeTab, setActiveTab] = useState<'ir' | 'uk' | 'korean-set' | 'ps' | 'character'>('character');

  // --- API SETTINGS STATE ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => {
    const saved = localStorage.getItem('dpiter_api_settings');
    return saved ? JSON.parse(saved) : { provider: 'google', apiKey: '', model: 'gemini-2.5-flash' };
  });

  const handleSaveSettings = (newSettings: ApiSettings) => {
    setApiSettings(newSettings);
    localStorage.setItem('dpiter_api_settings', JSON.stringify(newSettings));
  };

  // --- IR State ---
  const [irResults, setIrResults] = useState<GenerationResult[]>([]);
  const [irImage, setIrImage] = useState<ImageFile | null>(null);
  const [isIrLoading, setIsIrLoading] = useState<boolean>(false);
  const [irError, setIrError] = useState<string | null>(null);

  // --- UK State ---
  const [ukOutfitImage, setUkOutfitImage] = useState<ImageFile | null>(null);
  const [ukCharacterImage, setUkCharacterImage] = useState<ImageFile | null>(null);
  const [ukResults, setUkResults] = useState<GenerationResult[]>([]);
  const [isUkLoading, setIsUkLoading] = useState<boolean>(false);
  const [ukError, setUkError] = useState<string | null>(null);

  // --- Korean Set State ---
  const [koreanSetResults, setKoreanSetResults] = useState<GenerationResult[]>([]);
  const [koreanRefImage, setKoreanRefImage] = useState<ImageFile | null>(null);
  const [isKoreanSetLoading, setIsKoreanSetLoading] = useState<boolean>(false);
  const [koreanSetError, setKoreanSetError] = useState<string | null>(null);

  // --- PS Scan State ---
  const [psImage, setPsImage] = useState<ImageFile | null>(null);
  const [psResults, setPsResults] = useState<GenerationResult[]>([]);
  const [isPsLoading, setIsPsLoading] = useState<boolean>(false);
  const [psError, setPsError] = useState<string | null>(null);
  const [psExtractMode, setPsExtractMode] = useState<'single' | 'multi'>('single');

  // --- Character Gaze State (New) ---
  const [charGender, setCharGender] = useState<string>('Female');
  const [charAge, setCharAge] = useState<string>('Young Adult');
  const [charCategory, setCharCategory] = useState<string>('Fashion');
  const [charAspectRatio, setCharAspectRatio] = useState<"1:1" | "9:16" | "16:9">("9:16");
  const [charQuantity, setCharQuantity] = useState<number>(2);
  const [charRefImage, setCharRefImage] = useState<ImageFile | null>(null);
  const [charProductImage, setCharProductImage] = useState<ImageFile | null>(null);
  const [charAudioContext, setCharAudioContext] = useState<string>(''); // New Audio Context State
  
  // New Complex State for Scenes
  const [charScenes, setCharScenes] = useState<CharacterScene[]>([]);
  const [isCharLoading, setIsCharLoading] = useState<boolean>(false);
  const [charError, setCharError] = useState<string | null>(null);

  // Shared State
  const [selectedImage, setSelectedImage] = useState<GenerationResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Helper to determine current context for video prompt defaults
  const getVideoContext = () => {
    switch (activeTab) {
        case 'character':
            return {
                category: charCategory,
                aspectRatio: charAspectRatio,
                productImage: charProductImage?.base64
            };
        case 'ir':
            return {
                category: 'Product Promotion',
                aspectRatio: '1:1',
                productImage: irImage?.base64 
            };
        case 'uk':
        case 'korean-set':
            return {
                category: 'Fashion',
                aspectRatio: '9:16',
                productImage: null
            };
        case 'ps':
             return {
                category: 'Product Promotion',
                aspectRatio: '4:3',
                productImage: null
            };
        default:
            return {
                category: 'Fashion',
                aspectRatio: '9:16',
                productImage: null
            };
    }
  };

  const currentContext = getVideoContext();

  // --- Handlers: IR ---
  const handleIrImageUpload = useCallback((image: ImageFile | null) => {
    setIrImage(image);
    setIrResults([]);
    setIrError(null);
  }, []);

  // --- Handlers: UK ---
  const handleUkOutfitUpload = useCallback((image: ImageFile | null) => {
    setUkOutfitImage(image);
    setUkResults([]);
    setUkError(null);
  }, []);

  const handleUkCharacterUpload = useCallback((image: ImageFile | null) => {
    setUkCharacterImage(image);
    setUkResults([]);
    setUkError(null);
  }, []);

  // --- Handlers: Korean Set ---
  const handleKoreanRefUpload = useCallback((image: ImageFile | null) => {
      setKoreanRefImage(image);
      setKoreanSetResults([]);
      setKoreanSetError(null);
  }, []);

  // --- Handlers: PS Scan ---
  const handlePsImageUpload = useCallback((image: ImageFile | null) => {
    setPsImage(image);
    setPsResults([]);
    setPsError(null);
  }, []);

  // --- Handlers: Character ---
  const handleCharRefUpload = useCallback((image: ImageFile | null) => {
    setCharRefImage(image);
    setCharScenes([]);
  }, []);

  const handleCharProductUpload = useCallback((image: ImageFile | null) => {
    setCharProductImage(image);
    setCharScenes([]);
  }, []);

  // --- Shared Utilities ---
  const handleManualDownload = useCallback((base64Image: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Image}`;
    link.download = `image_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);
  
  const downloadZip = useCallback(async (images: string[], prefix: string) => {
    if (images.length === 0) return;
    
    const zip = new JSZip();
    images.forEach((imgBase64, index) => {
      zip.file(`${prefix}_${index + 1}.png`, imgBase64, { base64: true });
    });

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${prefix}_collection.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Error creating zip file", err);
    }
  }, []);

  const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  // --- API Calls (Updated to use apiSettings) ---

  const handleGenerateIr = async () => {
    if (!irImage) {
      setIrError("Please upload a product image first.");
      return;
    }
    setIsIrLoading(true);
    setIrError(null);
    setIrResults([]);
    const tempResults: GenerationResult[] = [];

    try {
        for (const item of IR_PROMPTS) {
            try {
                const result = await editImageWithNanoBanana(
                    item.prompt,
                    { base64: irImage.base64, mimeType: irImage.mimeType },
                    null,
                    '1:1',
                    apiSettings
                );
                tempResults.push({ base64: result, prompt: item.prompt });
                setIrResults([...tempResults]);
                await sleep(6000);
            } catch (e) {
                console.error("IR gen failed", e);
            }
        }
    } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        setIrError(`Generation failed. ${errorMessage}`);
    } finally {
        setIsIrLoading(false);
    }
  };

  const handleGenerateUk = async () => {
    setIsUkLoading(true);
    setUkError(null);
    setUkResults([]);
    const tempResults: GenerationResult[] = [];

    try {
      for (let i = 0; i < 2; i++) {
         let prompt = "";
         let primaryImg = null;
         let auxImgs = null;

         if (ukOutfitImage) {
            const imageContext = ukCharacterImage 
                ? "CONTEXT: Image 1 is the Character. Image 2 is the Outfit Product Flat-Lay. " 
                : "CONTEXT: Image 1 is the Outfit Product Flat-Lay. No character image provided. ";

            const layoutInstruction = i === 0 
                ? `\n📸 Collage Layout: Create a 2×2 collage with a CENTER INSERT...`
                : `\n📸 Collage Layout: Create a clean 2×2 grid collage...`;

            prompt = imageContext + UK_BASE_PROMPT + layoutInstruction;

            if (ukCharacterImage) {
                primaryImg = { base64: ukCharacterImage.base64, mimeType: ukCharacterImage.mimeType };
                auxImgs = [{ base64: ukOutfitImage.base64, mimeType: ukOutfitImage.mimeType }];
            } else {
                primaryImg = { base64: ukOutfitImage.base64, mimeType: ukOutfitImage.mimeType };
            }
         } else {
             const randomStyle = UK_RANDOM_STYLES[Math.floor(Math.random() * UK_RANDOM_STYLES.length)];
             const layoutInstruction = i === 0
                ? `- 4 Model Poses (Top-Left, Top-Right, Bottom-Left, Bottom-Right). CENTER INSERT...`
                : `- 4 Model Poses Only. NO CENTER INSERT.`;

             prompt = `Generate a high-fashion 2x2 collage (9:16 ratio) featuring a Korean-style male model wearing: ${randomStyle}.
             THEME: Modern Premium Korean Fashion.
             LAYOUT: ${layoutInstruction}
             STYLE: Urban Concrete Street. 8k resolution.`;
         }
         
         try {
             const result = await editImageWithNanoBanana(prompt, primaryImg, auxImgs, '9:16', apiSettings);
             tempResults.push({ base64: result, prompt: prompt });
             setUkResults([...tempResults]);
             await sleep(6000); 
         } catch (e) {
             console.error("UK gen failed", e);
         }
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setUkError(`Generation failed. ${errorMessage}`);
    } finally {
      setIsUkLoading(false);
    }
  };

  const handleGenerateKoreanSet = async () => {
    setIsKoreanSetLoading(true);
    setKoreanSetError(null);
    setKoreanSetResults([]);
    const tempResults: GenerationResult[] = [];

    // Simple randomization logic for Korean Set
    const randomPick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const topStyle = randomPick(K_TOP_STYLES);
    const topColor = randomPick(K_TOP_COLORS);
    const topDesc = `${topColor} ${topStyle}`;
    const shoesDesc = randomPick(K_SHOE_STYLES);
    let bottomStyle = randomPick(K_BOTTOM_STYLES);
    let bottomColor = "Black"; // simplified
    let finalBottomDesc = `${bottomColor} ${bottomStyle}`;
    const bottomDesc = koreanRefImage ? "The uploaded baggy jeans" : finalBottomDesc;

    const steps = [
        `Generate a professional FLAT LAY product photograph of a ${topDesc}. VIEW: Top-down. BACKGROUND: White.`,
        {
            text: `Generate a professional FLAT LAY product photograph of ${bottomDesc}. MATCH ${topDesc}. VIEW: Top-down. BACKGROUND: White.`,
            image: koreanRefImage 
        },
        `Generate a professional product photograph of a pair of ${shoesDesc}. BACKGROUND: White.`,
        {
            text: `Generate a PERFECTLY ARRANGED OUTFIT GRID (Knolling style) containing: ${topDesc}, ${bottomDesc}, ${shoesDesc}. BACKGROUND: White.`,
            image: koreanRefImage 
        }
    ];

    try {
        for (const step of steps) {
            try {
                let result;
                let currentPrompt = "";
                if (typeof step === 'string') {
                    currentPrompt = step;
                    result = await editImageWithNanoBanana(step, null, null, '9:16', apiSettings);
                } else {
                     currentPrompt = step.text;
                     if (step.image) {
                        result = await editImageWithNanoBanana(step.text, { base64: step.image.base64, mimeType: step.image.mimeType }, null, '9:16', apiSettings);
                     } else {
                        result = await editImageWithNanoBanana(step.text, null, null, '9:16', apiSettings);
                     }
                }
                tempResults.push({ base64: result, prompt: currentPrompt });
                setKoreanSetResults([...tempResults]);
                await sleep(6000); 
            } catch (e) {
                console.error("Korean Set step failed", e);
            }
        }
    } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        setKoreanSetError(`Generation failed. ${errorMessage}`);
    } finally {
        setIsKoreanSetLoading(false);
    }
  };

  const handleGeneratePs = async () => {
    if (!psImage) {
      setPsError("Please upload a character image first.");
      return;
    }
    setIsPsLoading(true);
    setPsError(null);
    setPsResults([]);
    const tempResults: GenerationResult[] = [];

    const targets = psExtractMode === 'multi' 
        ? ["the person on the far LEFT", "the person in the CENTER-LEFT", "the person in the CENTER-RIGHT", "the person on the far RIGHT"] 
        : ["the main subject"];

    try {
        for (const target of targets) {
            const prompt = PS_BASE_PROMPT.replace("the specified subject", target);
            try {
                const result = await editImageWithNanoBanana(prompt, { base64: psImage.base64, mimeType: psImage.mimeType }, null, '4:3', apiSettings);
                tempResults.push({ base64: result, prompt: prompt });
                setPsResults([...tempResults]);
                await sleep(6000); 
            } catch (e) {
                console.error("PS Gen failed", e);
                if (psExtractMode === 'single') throw e; 
            }
        }
    } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        setPsError(`Extraction failed. ${errorMessage}`);
    } finally {
        setIsPsLoading(false);
    }
  };


  // --- NEW: Character Gaze Generation Logic ---
  const handleGenerateCharacterGaze = async () => {
    setIsCharLoading(true);
    setCharError(null);
    setCharScenes([]); // Clear previous results
    
    // Initialize empty scenes for loading state
    const initialScenes: CharacterScene[] = Array.from({ length: charQuantity }).map((_, i) => ({
        id: `scene-${Date.now()}-${i}`,
        frames: [],
        isLoading: true,
        category: charCategory,
        settings: {
            gender: charGender,
            age: charAge,
            ratio: charAspectRatio
        }
    }));
    setCharScenes(initialScenes);

    try {
        // Construct Base Identity Prompt
        let identityInstruction = "";
        if (charRefImage) {
            identityInstruction = `CRITICAL IDENTITY LOCK: The generated character MUST have the EXACT SAME facial features, skin tone, and body structure as the uploaded Reference Image.`;
        } else {
            identityInstruction = `IDENTITY: Photorealistic ${charAge} ${charGender}. Consistent features.`;
        }

        // Product Instruction
        let productInstruction = "";
        if (charProductImage) {
            productInstruction = `PRODUCT INTEGRATION: The character is interacting with the uploaded PRODUCT. The product must be rendered perfectly with realistic physics, lighting, and hand grip. NO floating objects.`;
        }

        // Loop through quantity
        for (let i = 0; i < charQuantity; i++) {
            const sceneId = initialScenes[i].id;
            const pose = CHAR_POSES[i % CHAR_POSES.length];
            
            const prompt = `
            FRAME 1 (START): Generate a 100% ULTRA-PHOTOREALISTIC image of a ${charAge} ${charGender}.
            CATEGORY: ${charCategory}.
            SCENE: ${pose.type} - ${pose.desc}.
            ${identityInstruction}
            ${productInstruction}
            STYLE: DSLR quality, 8k, detailed skin texture, cinematic lighting.
            `;

            try {
                // 1. Generate Image (Frame 1)
                const auxImages = [];
                if (charProductImage) auxImages.push({ base64: charProductImage.base64, mimeType: charProductImage.mimeType });
                
                const resultBase64 = await editImageWithNanoBanana(
                    prompt,
                    charRefImage ? { base64: charRefImage.base64, mimeType: charRefImage.mimeType } : null,
                    auxImages.length > 0 ? auxImages : null,
                    charAspectRatio,
                    apiSettings
                );

                // 2. Auto-Generate Video Prompt for Frame 1
                // Pass Language: English by default, pass Audio Context
                let videoPrompt = "";
                try {
                     videoPrompt = await getVideoGenerationPrompt(resultBase64, {
                        category: charCategory,
                        quantity: 1,
                        aspectRatio: charAspectRatio,
                        productImage: charProductImage?.base64,
                        frameIndex: 1,
                        language: "English",
                        audioContext: charAudioContext
                     }, apiSettings);
                } catch { videoPrompt = `Cinematic video of ${charCategory} scene.`; }

                // Update Scene State
                setCharScenes(prev => prev.map(scene => {
                    if (scene.id === sceneId) {
                        return {
                            ...scene,
                            isLoading: false,
                            frames: [{
                                frameIndex: 1,
                                base64: resultBase64,
                                prompt: prompt,
                                videoPrompt: videoPrompt,
                                audioContext: charAudioContext, // Current finalized audio
                                tempAudioContext: charAudioContext // Default input value
                            }]
                        };
                    }
                    return scene;
                }));

                await sleep(1500); // Polite delay between scenes

            } catch (err) {
                console.error(`Scene ${i} failed`, err);
                setCharScenes(prev => prev.map(scene => 
                    scene.id === sceneId ? { ...scene, isLoading: false, error: "Failed to generate." } : scene
                ));
            }
        }

    } catch (err) {
        console.error(err);
        setCharError("Global generation failed.");
        setIsCharLoading(false);
    } finally {
        setIsCharLoading(false);
    }
  };

  // --- NEW: Generate Next Frames (2, 3, 4) ---
  const handleGenerateNextFrames = async (sceneId: string) => {
      // Find scene
      const scene = charScenes.find(s => s.id === sceneId);
      if (!scene || scene.frames.length === 0) return;

      // Set scene to loading (optimistic UI could work too, but let's be safe)
      setCharScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: true } : s));

      const frame1 = scene.frames[0];

      try {
          for (let nextFrameIdx = 2; nextFrameIdx <= 4; nextFrameIdx++) {
              // Context comes from the IMMEDIATELY PRECEDING frame for continuity
              const prevFrame = scene.frames[scene.frames.length - 1]; 
              
              const nextPrompt = `
              FRAME ${nextFrameIdx} (CONTINUATION): Generate the NEXT frame in this sequence.
              CONTEXT: Continue the action from the previous frame.
              CATEGORY: ${scene.category}.
              IDENTITY: MUST MATCH EXACTLY (Face/Body/Clothes) the character in Frame 1.
              ACTION: ${nextFrameIdx === 3 ? 'Highlight emotion/reaction.' : 'Resolve the scene naturally.'}
              STYLE: 100% Photorealistic, Consistent Lighting.
              `;

              // We pass the PREVIOUS frame as the primary input to evolve it
              // We pass the PRODUCT image as Aux if available
              const auxImages = [];
              if (charProductImage) auxImages.push({ base64: charProductImage.base64, mimeType: charProductImage.mimeType });
              
              const nextBase64 = await editImageWithNanoBanana(
                  nextPrompt,
                  { base64: prevFrame.base64, mimeType: 'image/jpeg' }, // Start from previous frame
                  auxImages.length > 0 ? auxImages : null,
                  scene.settings.ratio as any,
                  apiSettings
              );

               // Generate Video Prompt for this specific frame
               let videoPrompt = "";
               try {
                    videoPrompt = await getVideoGenerationPrompt(nextBase64, {
                       category: scene.category,
                       quantity: 1,
                       aspectRatio: scene.settings.ratio,
                       productImage: charProductImage?.base64,
                       frameIndex: nextFrameIdx,
                       language: "English",
                       audioContext: charAudioContext
                    }, apiSettings);
               } catch { videoPrompt = `Continuation video frame ${nextFrameIdx}.`; }

               // Append Frame
               setCharScenes(prev => prev.map(s => {
                   if (s.id === sceneId) {
                       return {
                           ...s,
                           frames: [...s.frames, {
                               frameIndex: nextFrameIdx,
                               base64: nextBase64,
                               prompt: nextPrompt,
                               videoPrompt: videoPrompt,
                               audioContext: charAudioContext,
                               tempAudioContext: charAudioContext
                           }]
                       };
                   }
                   return s;
               }));
               
               await sleep(2000);
          }
      } catch (err) {
          console.error("Frame generation failed", err);
          alert("Failed to generate next frames.");
      } finally {
          setCharScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoading: false } : s));
      }
  };

  // Helper to update temp input state
  const handleAudioContextChange = (sceneId: string, frameIndex: number, text: string) => {
    setCharScenes(prev => prev.map(s => {
        if(s.id === sceneId) {
            return {
                ...s,
                frames: s.frames.map(f => f.frameIndex === frameIndex ? { ...f, tempAudioContext: text } : f)
            }
        }
        return s;
    }));
  };

  const handleRegeneratePrompt = async (sceneId: string, frameIndex: number, language: string) => {
      const scene = charScenes.find(s => s.id === sceneId);
      if (!scene) return;
      const frame = scene.frames.find(f => f.frameIndex === frameIndex);
      if (!frame) return;

      // Use the temporary input value as the new "active" audio context
      const newAudioContext = frame.tempAudioContext || "";

      // Optimistic update to show loading
      const loadingText = `Regenerating prompt in ${language} with enhanced dialogue...`;
      setCharScenes(prev => prev.map(s => {
        if(s.id === sceneId) {
            return {
                ...s,
                frames: s.frames.map(f => f.frameIndex === frameIndex ? { 
                    ...f, 
                    videoPrompt: loadingText,
                    audioContext: newAudioContext // Commit the change
                } : f)
            }
        }
        return s;
      }));

      try {
        const newPrompt = await getVideoGenerationPrompt(frame.base64, {
            category: scene.category,
            quantity: 1,
            aspectRatio: scene.settings.ratio,
            productImage: charProductImage?.base64,
            frameIndex: frameIndex,
            language: language,
            audioContext: newAudioContext
        }, apiSettings);

        // Update with result
        setCharScenes(prev => prev.map(s => {
            if(s.id === sceneId) {
                return {
                    ...s,
                    frames: s.frames.map(f => f.frameIndex === frameIndex ? { ...f, videoPrompt: newPrompt } : f)
                }
            }
            return s;
        }));

      } catch (err) {
          console.error("Failed to regen prompt", err);
          setCharScenes(prev => prev.map(s => {
            if(s.id === sceneId) {
                return {
                    ...s,
                    frames: s.frames.map(f => f.frameIndex === frameIndex ? { ...f, videoPrompt: "Failed to regenerate. Please try again." } : f)
                }
            }
            return s;
        }));
      }
  };

  // --- NEW HANDLER: Generate Continuation Prompt (Next 8s) ---
  const handleGenerateContinuationPrompt = async (sceneId: string, currentFrameIndex: number, currentLanguage: string = 'English') => {
      const scene = charScenes.find(s => s.id === sceneId);
      if (!scene) return;
      const frame = scene.frames.find(f => f.frameIndex === currentFrameIndex);
      if (!frame) return;

      const nextFrameIndex = currentFrameIndex + 1;
      const loadingText = `Generating continuation prompt for Frame ${nextFrameIndex} (Next 8s)...`;

      // Update UI to loading
      setCharScenes(prev => prev.map(s => {
        if(s.id === sceneId) {
            return {
                ...s,
                frames: s.frames.map(f => f.frameIndex === currentFrameIndex ? { ...f, videoPrompt: loadingText } : f)
            }
        }
        return s;
      }));

      try {
          // Generate prompt for the NEXT frame index but using the CURRENT image context
          const nextPrompt = await getVideoGenerationPrompt(frame.base64, {
            category: scene.category,
            quantity: 1,
            aspectRatio: scene.settings.ratio,
            productImage: charProductImage?.base64,
            frameIndex: nextFrameIndex, // Requesting next slot
            language: currentLanguage,
            audioContext: frame.audioContext
          }, apiSettings);

          // Update UI
          setCharScenes(prev => prev.map(s => {
            if(s.id === sceneId) {
                return {
                    ...s,
                    frames: s.frames.map(f => f.frameIndex === currentFrameIndex ? { ...f, videoPrompt: nextPrompt } : f)
                }
            }
            return s;
          }));

      } catch (err) {
          console.error("Failed to generate continuation", err);
          setCharScenes(prev => prev.map(s => {
            if(s.id === sceneId) {
                return {
                    ...s,
                    frames: s.frames.map(f => f.frameIndex === currentFrameIndex ? { ...f, videoPrompt: "Failed to generate continuation prompt." } : f)
                }
            }
            return s;
          }));
      }
  };

  const renderResults = (results: GenerationResult[], isLoading: boolean, error: string | null, skeletonCount = 4, skeletonText?: string, downloadPrefix = "generated", aspectRatio="aspect-[3/4]") => {
      if (error) return <div className="text-red-500 mt-4 p-4 bg-red-50 rounded-lg text-center">{error}</div>;
      if (isLoading && results.length === 0) return <SkeletonLoader count={skeletonCount} text={skeletonText} aspectRatio={aspectRatio} />;
      return (
          <div className="mt-8 space-y-4">
              {results.length > 0 && (
                  <div className="flex justify-end">
                      <button 
                        onClick={() => downloadZip(results.map(r => r.base64), downloadPrefix)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download Collection (ZIP)
                      </button>
                  </div>
              )}
              <div className={`grid grid-cols-1 ${results.length === 1 && !isLoading ? 'md:grid-cols-1 max-w-sm mx-auto' : 'md:grid-cols-2 lg:grid-cols-4'} gap-4`}>
                  {results.map((item, idx) => (
                      <div key={idx} className={`relative group ${aspectRatio} cursor-pointer rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow`} onClick={() => setSelectedImage(item)}>
                          <img src={`data:image/png;base64,${item.base64}`} alt={`Result ${idx}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity" />
                          
                          {/* Copy Image Prompt Button */}
                          <button
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                copyToClipboard(item.prompt); 
                                setCopiedIndex(idx);
                                setTimeout(() => setCopiedIndex(null), 2000);
                            }}
                            className={`absolute bottom-3 left-3 p-2 rounded-full shadow-md z-10 transition-all active:scale-95 border border-slate-200 ${
                                copiedIndex === idx 
                                ? 'bg-green-600 text-white' 
                                : 'bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600'
                            }`}
                            title="Copy Image Generation Prompt"
                          >
                             {copiedIndex === idx ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                             ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                             )}
                          </button>

                           {/* Copy VIDEO Prompt Button - ONLY if available */}
                           {item.videoPrompt && (
                               <button
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    copyToClipboard(item.videoPrompt!); 
                                    // Hacky but simple for now without extra state
                                    alert("Video Prompt Copied!");
                                }}
                                className="absolute bottom-3 left-14 p-2 rounded-full shadow-md z-10 transition-all active:scale-95 border border-slate-200 bg-white/90 hover:bg-white text-purple-700 hover:text-purple-900"
                                title="Copy Video Generation Prompt"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                           )}

                          {/* Download Button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleManualDownload(item.base64); }}
                            className="absolute bottom-3 right-3 p-2 bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600 rounded-full shadow-md z-10 transition-transform active:scale-95"
                            title="Download Image"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                      </div>
                  ))}
                  {isLoading && (
                    <div className={`flex items-center justify-center ${aspectRatio} bg-slate-50 rounded-lg`}>
                        <div className="flex flex-col items-center">
                            <Spinner />
                            <span className="text-xs text-slate-400 mt-2">Generating next...</span>
                        </div>
                    </div>
                  )}
              </div>
          </div>
      );
  };

  // --- NEW: Custom Renderer for Character Gaze Scene Cards ---
  const renderCharacterScenes = () => {
    if (charError) return <div className="text-red-500 mt-4 p-4 bg-red-50 rounded-lg text-center">{charError}</div>;
    if (isCharLoading && charScenes.filter(s => s.frames.length > 0).length === 0) {
        return <SkeletonLoader count={charQuantity} text="Generating Photorealistic Characters..." aspectRatio={charAspectRatio === "16:9" ? "aspect-video" : (charAspectRatio === "1:1" ? "aspect-square" : "aspect-[9/16]")} />;
    }

    return (
        <div className="grid grid-cols-1 gap-12 mt-8">
            {charScenes.map((scene, sceneIdx) => {
                if (scene.frames.length === 0 && scene.isLoading) return (
                    <div key={scene.id} className="bg-white p-4 rounded-xl shadow border border-slate-100 h-96 flex items-center justify-center">
                        <Spinner />
                    </div>
                );
                if (scene.frames.length === 0) return null;

                const frame1 = scene.frames[0];
                const hasNextFrames = scene.frames.length > 1;

                return (
                    <div key={scene.id} className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col md:flex-row">
                        {/* Left: Main Frame 1 Display */}
                        <div className={`md:w-1/3 relative bg-slate-50 border-r border-slate-200 ${scene.settings.ratio === '16:9' ? 'aspect-video' : (scene.settings.ratio === '1:1' ? 'aspect-square' : 'aspect-[9/16]')}`}>
                            <img src={`data:image/png;base64,${frame1.base64}`} alt="Frame 1" className="w-full h-full object-cover" />
                            <button
                                onClick={() => handleManualDownload(frame1.base64)}
                                className="absolute bottom-3 right-3 p-2 bg-white/90 text-indigo-600 rounded-full shadow hover:bg-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                            <span className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded">Frame 1</span>
                        </div>

                        {/* Right: Controls & Sequence */}
                        <div className="md:w-2/3 p-6 flex flex-col gap-6">
                            {/* Video Prompt Section */}
                            <div>
                                <div className="flex flex-wrap justify-between items-end mb-2 gap-2">
                                    <h4 className="text-sm font-bold text-slate-800 flex items-center whitespace-nowrap">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        8-Second Video Prompt
                                    </h4>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        
                                        {/* Audio Context Input - Directly next to Language */}
                                        <div className="relative flex items-center group">
                                            <input 
                                                type="text" 
                                                value={frame1.tempAudioContext || ''}
                                                onChange={(e) => handleAudioContextChange(scene.id, 1, e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleRegeneratePrompt(scene.id, 1, 'English')}
                                                placeholder="Add Voice/Audio..." 
                                                className="w-32 sm:w-40 text-xs border border-slate-300 rounded-l-md px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50 focus:bg-white transition-all"
                                            />
                                            <button 
                                                onClick={() => handleRegeneratePrompt(scene.id, 1, 'English')}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded-r-md border border-indigo-600 text-xs flex items-center justify-center transition-colors"
                                                title="Regenerate with Voice"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Language Dropdown */}
                                        <div className="relative group">
                                            <button className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border border-slate-300 flex items-center gap-1 transition-colors h-[26px]">
                                                <span>🌐 Language</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </button>
                                            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-20 w-32 overflow-hidden hidden group-hover:block group-focus-within:block">
                                                {[
                                                    {code: 'English', label: '🇺🇸 English'},
                                                    {code: 'Hindi', label: '🇮🇳 Hindi'},
                                                    {code: 'Japanese', label: '🇯🇵 Japanese'},
                                                    {code: 'Korean', label: '🇰🇷 Korean'},
                                                    {code: 'Russian', label: '🇷🇺 Russian'}
                                                ].map(lang => (
                                                    <button 
                                                        key={lang.code}
                                                        onClick={() => handleRegeneratePrompt(scene.id, 1, lang.code)}
                                                        className="block w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 border-b border-slate-50 last:border-0"
                                                    >
                                                        {lang.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => { copyToClipboard(frame1.videoPrompt); alert("Prompt copied!"); }}
                                            className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-medium hover:bg-indigo-100 transition-colors h-[26px]"
                                        >
                                            Copy Text
                                        </button>

                                        {/* NEXT 8s BUTTON */}
                                        <button 
                                            onClick={() => handleGenerateContinuationPrompt(scene.id, 1)}
                                            className="text-xs bg-white text-indigo-600 border border-indigo-200 px-2 py-1 rounded font-medium hover:bg-indigo-50 transition-colors h-[26px] flex items-center gap-1"
                                            title="Generate prompt for the next 8 seconds"
                                        >
                                            <span>Next 8s</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 font-mono h-24 overflow-y-auto">
                                    {frame1.videoPrompt}
                                </div>
                            </div>

                            {/* Next Frames Action */}
                            {!hasNextFrames && !scene.isLoading && (
                                <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                    <div>
                                        <h5 className="text-sm font-bold text-indigo-900">Generate Next 8 Seconds (Image Sequence)</h5>
                                        <p className="text-xs text-indigo-700">Continue scene from 00:08 to 00:32 with images.</p>
                                    </div>
                                    <button
                                        onClick={() => handleGenerateNextFrames(scene.id)}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded shadow transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                        Generate Next Frames
                                    </button>
                                </div>
                            )}

                            {/* Sequence Strip */}
                            {hasNextFrames && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 mb-3">Sequence Progression</h4>
                                    <div className="grid grid-cols-3 gap-3">
                                        {scene.frames.slice(1).map((frame) => (
                                            <div key={frame.frameIndex} className="flex flex-col gap-2">
                                                <div className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-[9/16]">
                                                    <img src={`data:image/png;base64,${frame.base64}`} className="w-full h-full object-cover" />
                                                    <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                                                        {frame.frameIndex === 2 ? '00:08 - 00:16' : (frame.frameIndex === 3 ? '00:16 - 00:24' : '00:24 - 00:32')}
                                                    </span>
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                                                        <button onClick={() => handleManualDownload(frame.base64)} className="bg-white p-1.5 rounded-full text-indigo-600" title="Download">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                        </button>
                                                        {/* Language & Copy for Extended Frames */}
                                                        <div className="relative">
                                                            <button 
                                                                onClick={() => {copyToClipboard(frame.videoPrompt); alert(`Frame ${frame.frameIndex} Prompt Copied!`)}} 
                                                                className="bg-white p-1.5 rounded-full text-purple-600" title="Copy Prompt"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Audio & Language for Extended Frames */}
                                                <div className="flex flex-col gap-1.5 mt-1">
                                                     {/* Audio Input Compact */}
                                                     <div className="relative flex items-center">
                                                        <input 
                                                            type="text" 
                                                            value={frame.tempAudioContext || ''}
                                                            onChange={(e) => handleAudioContextChange(scene.id, frame.frameIndex, e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleRegeneratePrompt(scene.id, frame.frameIndex, 'English')}
                                                            placeholder="Voice..." 
                                                            className="w-full text-[10px] border border-slate-200 rounded-l-sm px-1 py-0.5 focus:ring-0 focus:border-indigo-400 bg-white"
                                                        />
                                                        <button 
                                                            onClick={() => handleRegeneratePrompt(scene.id, frame.frameIndex, 'English')}
                                                            className="bg-indigo-50 text-indigo-600 border border-l-0 border-indigo-100 hover:bg-indigo-100 px-1 py-0.5 rounded-r-sm"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>

                                                    {/* Language Dropdown Compact */}
                                                    <div className="relative group w-full">
                                                        <button className="w-full text-[10px] bg-slate-50 hover:bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 flex items-center justify-between gap-1">
                                                            <span>🌐 Lang</span>
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                        </button>
                                                        <div className="absolute left-0 bottom-full mb-1 bg-white border border-slate-200 rounded shadow-lg z-20 w-full overflow-hidden hidden group-hover:block">
                                                             {[
                                                                {code: 'English', label: '🇺🇸 Eng'},
                                                                {code: 'Hindi', label: '🇮🇳 Hin'},
                                                                {code: 'Japanese', label: '🇯🇵 Jap'},
                                                                {code: 'Korean', label: '🇰🇷 Kor'},
                                                                {code: 'Russian', label: '🇷🇺 Rus'}
                                                            ].map(lang => (
                                                                <button 
                                                                    key={lang.code}
                                                                    onClick={() => handleRegeneratePrompt(scene.id, frame.frameIndex, lang.code)}
                                                                    className="block w-full text-left px-2 py-1.5 text-[10px] text-slate-700 hover:bg-indigo-50"
                                                                >
                                                                    {lang.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {scene.frames.length < 4 && scene.isLoading && (
                                            <div className="flex items-center justify-center bg-slate-50 border border-slate-100 rounded-lg aspect-[9/16]">
                                                <Spinner />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                             {/* Loading Spinner for extended frames */}
                             {scene.isLoading && hasNextFrames && <div className="text-center text-xs text-slate-500 animate-pulse">Generating next frame...</div>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <h1 className="text-xl font-bold text-indigo-600">Gemini Fashion Studio</h1>
                    {/* API Settings Button */}
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 rounded-md hover:bg-slate-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        API Settings
                    </button>
                </div>
                <nav className="-mb-px flex space-x-8 overflow-x-auto no-scrollbar">
                    {[
                        { id: 'character', label: 'Character Gaze' },
                        { id: 'ir', label: 'Product Remix' },
                        { id: 'uk', label: 'UK Generator' },
                        { id: 'korean-set', label: 'Korean Set' },
                        { id: 'ps', label: 'PS Scan' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`${
                                activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            
            {activeTab === 'ir' && (
                <div className="space-y-8">
                     <div className="max-w-xl mx-auto space-y-4">
                        <h2 className="text-lg font-medium text-slate-900 text-center">Upload Product Image</h2>
                        <ImageUploader onImageUpload={handleIrImageUpload} imagePreviewUrl={irImage ? `data:${irImage.mimeType};base64,${irImage.base64}` : null} />
                     </div>
                     <button
                        onClick={handleGenerateIr}
                        disabled={isIrLoading || !irImage}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                        {isIrLoading ? 'Remixing Product...' : 'Generate Product Remixes'}
                    </button>
                    {renderResults(irResults, isIrLoading, irError, 4, "Remixing design concepts...", "product-remix", "aspect-square")}
                </div>
            )}

            {activeTab === 'uk' && (
                <div className="space-y-8">
                     <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                           <h2 className="text-lg font-medium text-slate-900 text-center">1. Upload Outfit (Flat Lay) - Optional</h2>
                           <p className="text-sm text-slate-500 text-center">The outfit product image. Leave empty for random.</p>
                           <ImageUploader onImageUpload={handleUkOutfitUpload} imagePreviewUrl={ukOutfitImage ? `data:${ukOutfitImage.mimeType};base64,${ukOutfitImage.base64}` : null} />
                        </div>
                        <div className="space-y-4">
                           <h2 className="text-lg font-medium text-slate-900 text-center">2. Upload Character (Optional)</h2>
                            <p className="text-sm text-slate-500 text-center">Your own character/face to use.</p>
                           <ImageUploader onImageUpload={handleUkCharacterUpload} imagePreviewUrl={ukCharacterImage ? `data:${ukCharacterImage.mimeType};base64,${ukCharacterImage.base64}` : null} />
                        </div>
                     </div>
                     <button
                        onClick={handleGenerateUk}
                        disabled={isUkLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300"
                    >
                        {isUkLoading ? 'Creating UK Collage...' : (ukOutfitImage ? 'Generate Custom UK Collage' : 'Generate Random Trending Looks')}
                    </button>
                    {renderResults(ukResults, isUkLoading, ukError, 2, "Generating 2x2 Korean Aesthetic Collages...", "uk-collage", "aspect-[9/16]")}
                </div>
            )}

            {activeTab === 'korean-set' && (
                <div className="space-y-8">
                     <div className="max-w-xl mx-auto space-y-4 text-center">
                        <h2 className="text-2xl font-bold text-slate-900">Korean Style Product Set</h2>
                        <p className="text-slate-500">
                           One click to generate a complete product breakdown: Top, Baggy Jeans, Shoes, and Full Outfit.
                        </p>
                        
                        <div className="mt-6 border-t pt-6 border-slate-200">
                             <h3 className="text-sm font-semibold text-slate-700 mb-2">Use Your Own Jeans (Optional)</h3>
                             <p className="text-xs text-slate-500 mb-4">Upload a photo of your baggy jeans to use them in the set.</p>
                             <ImageUploader onImageUpload={handleKoreanRefUpload} imagePreviewUrl={koreanRefImage ? `data:${koreanRefImage.mimeType};base64,${koreanRefImage.base64}` : null} />
                        </div>

                        <p className="text-xs text-indigo-500 uppercase tracking-wide font-semibold mt-4">
                            Realistic Flat Lay Style
                        </p>
                     </div>
                     <button
                        onClick={handleGenerateKoreanSet}
                        disabled={isKoreanSetLoading}
                        className="w-full max-w-md mx-auto flex justify-center py-4 px-6 border border-transparent rounded-full shadow-lg text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-all transform active:scale-95 disabled:bg-slate-300 disabled:scale-100"
                    >
                        {isKoreanSetLoading ? 'Curating Collection...' : '✨ Generate Korean Set'}
                    </button>
                    {renderResults(koreanSetResults, isKoreanSetLoading, koreanSetError, 4, "Creating 4-Piece Korean Collection...", "korean-set", "aspect-[9/16]")}
                </div>
            )}

            {activeTab === 'ps' && (
                <div className="space-y-8">
                     <div className="max-w-xl mx-auto space-y-4 text-center">
                        <h2 className="text-2xl font-bold text-slate-900">PS (Product Scan)</h2>
                        <p className="text-slate-500">
                           Extract outfits from character images and convert them into clean, realistic product flat-lays on a white floor.
                        </p>
                        
                        <ImageUploader onImageUpload={handlePsImageUpload} imagePreviewUrl={psImage ? `data:${psImage.mimeType};base64,${psImage.base64}` : null} />
                        
                        {/* Mode Selector */}
                        <div className="flex justify-center mt-4 space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="extractMode" 
                                    value="single" 
                                    checked={psExtractMode === 'single'} 
                                    onChange={() => setPsExtractMode('single')}
                                    className="form-radio h-4 w-4 text-indigo-600"
                                />
                                <span className="text-slate-700">Single Character</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="extractMode" 
                                    value="multi" 
                                    checked={psExtractMode === 'multi'} 
                                    onChange={() => setPsExtractMode('multi')}
                                    className="form-radio h-4 w-4 text-indigo-600"
                                />
                                <span className="text-slate-700">Multiple Characters (Max 4)</span>
                            </label>
                        </div>
                     </div>
                     <button
                        onClick={handleGeneratePs}
                        disabled={isPsLoading || !psImage}
                        className="w-full max-w-md mx-auto flex justify-center py-3 px-4 border border-transparent rounded-full shadow-lg text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 transition-all active:scale-95"
                    >
                        {isPsLoading ? 'Extracting Products...' : '🔍 Extract Product Flat Lay'}
                    </button>
                    {renderResults(psResults, isPsLoading, psError, psExtractMode === 'multi' ? 4 : 1, "Scanning and extracting outfits...", "ps-scan", "aspect-[4/3]")}
                </div>
            )}

            {activeTab === 'character' && (
                <div className="space-y-8">
                    <div className="max-w-5xl mx-auto space-y-6">
                        {/* Settings Panel */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900 mb-4 border-b pb-2">Character Gaze Settings</h2>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                                {/* Gender */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Gender</label>
                                    <select 
                                        value={charGender} 
                                        onChange={(e) => setCharGender(e.target.value)}
                                        className="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2.5 border"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                {/* Age */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Age Group</label>
                                    <select 
                                        value={charAge} 
                                        onChange={(e) => setCharAge(e.target.value)}
                                        className="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2.5 border"
                                    >
                                        {CHAR_AGES.map(age => <option key={age} value={age}>{age}</option>)}
                                    </select>
                                </div>
                                {/* Ratio */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Aspect Ratio</label>
                                    <select 
                                        value={charAspectRatio} 
                                        onChange={(e) => setCharAspectRatio(e.target.value as any)}
                                        className="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2.5 border"
                                    >
                                        <option value="9:16">9:16 (Reels/Shorts)</option>
                                        <option value="16:9">16:9 (YouTube)</option>
                                        <option value="1:1">1:1 (Square)</option>
                                    </select>
                                </div>
                                {/* Category */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Category</label>
                                    <select 
                                        value={charCategory} 
                                        onChange={(e) => setCharCategory(e.target.value)}
                                        className="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2.5 border"
                                    >
                                        {CHAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                {/* Quantity */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Quantity</label>
                                    <select 
                                        value={charQuantity} 
                                        onChange={(e) => setCharQuantity(parseInt(e.target.value))}
                                        className="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2.5 border"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                            <option key={num} value={num}>{num} Scenes</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            {/* New Voice/Audio Input */}
                            <div className="mt-4 border-t border-slate-100 pt-4">
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Default Voice / Audio Context</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={charAudioContext}
                                        onChange={(e) => setCharAudioContext(e.target.value)}
                                        placeholder="What is the character saying? (Lip sync instructions will be added to frames)"
                                        className="w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2.5 border pl-9"
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-2.5 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Uploads */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h2 className="text-md font-bold text-slate-900 mb-2">2. Reference Character (Identity Lock)</h2>
                                <p className="text-xs text-slate-500 mb-4">Upload a photo to lock the face/identity. Leave empty for random AI human.</p>
                                <ImageUploader onImageUpload={handleCharRefUpload} imagePreviewUrl={charRefImage ? `data:${charRefImage.mimeType};base64,${charRefImage.base64}` : null} />
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h2 className="text-md font-bold text-slate-900 mb-2">3. Product Integration (Optional)</h2>
                                <p className="text-xs text-slate-500 mb-4">Character will hold/interact with this product realistically.</p>
                                <ImageUploader onImageUpload={handleCharProductUpload} imagePreviewUrl={charProductImage ? `data:${charProductImage.mimeType};base64,${charProductImage.base64}` : null} />
                            </div>
                        </div>

                        {/* Generate Button */}
                         <button
                            onClick={handleGenerateCharacterGaze}
                            disabled={isCharLoading}
                            className="w-full flex justify-center py-4 px-6 border border-transparent rounded-full shadow-xl text-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all transform active:scale-[0.99] disabled:bg-slate-300 disabled:scale-100"
                        >
                            {isCharLoading ? `Processing ${charQuantity} Photorealistic Scenes...` : `✨ Generate Character Gaze (${charQuantity} Scenes)`}
                        </button>
                    </div>

                    {renderCharacterScenes()}
                </div>
            )}
        </main>

        <ApiSettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleSaveSettings}
            currentSettings={apiSettings}
        />

        {selectedImage && (
            <ImageViewerModal
            imageUrl={selectedImage.base64}
            onClose={() => setSelectedImage(null)}
            onDownload={handleManualDownload}
            initialCategory={currentContext.category}
            initialAspectRatio={currentContext.aspectRatio}
            productImage={currentContext.productImage}
            initialVideoPrompt={selectedImage.videoPrompt} // Pass generated video prompt
            />
        )}
    </div>
  );
};

export default App;
