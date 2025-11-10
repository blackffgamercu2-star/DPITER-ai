import React, { useState, useCallback, useMemo } from 'react';
import type { ImageFile, ColorSuggestion } from './types';
import { editImageWithNanoBanana, getPromptSuggestions, getOutfitColorSuggestions } from './services/geminiService';
import { ImageUploader } from './components/ImageUploader';
import { Spinner } from './components/Spinner';

type Mode = 'edit' | 'photoshoot' | 'outfitColors' | 'diagram';

// Generate height options from 5'9" to 7'1"
const heightOptions: string[] = [];
for (let feet = 5; feet <= 7; feet++) {
    for (let inches = 0; inches < 12; inches++) {
        if (feet === 5 && inches < 9) continue;
        if (feet === 7 && inches > 1) continue;
        heightOptions.push(`${feet}'${inches}"`);
    }
}

const aspectRatios = ['1:1', '4:3', '3:4', '16:9', '9:16'];
const fallbackColorObjects: ColorSuggestion[] = [
    { name: 'vibrant royal blue', hex: '#4169E1' },
    { name: 'rich emerald green', hex: '#50C878' },
    { name: 'fiery crimson red', hex: '#DC143C' }
];


const getAspectRatioDescription = (ar: string) => {
    switch (ar) {
        case '16:9': return `${ar} (a wide, landscape orientation)`;
        case '9:16': return `${ar} (a tall, portrait orientation)`;
        case '4:3': return `${ar} (a standard landscape orientation)`;
        case '3:4': return `${ar} (a standard portrait orientation)`;
        case '4:5': return `${ar} (a standard portrait orientation)`;
        case '1:1': return `${ar} (a perfect square)`;
        default: return ar;
    }
};

const SkeletonLoader: React.FC<{ count: number; aspectRatio: string }> = ({ count, aspectRatio }) => (
  <div className="w-full h-full flex flex-col items-center justify-center">
    <div className={`w-full grid ${count > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="bg-slate-200 rounded-lg"
          style={{ aspectRatio: aspectRatio.replace(':', ' / ') }}
        />
      ))}
    </div>
    <p className="mt-4 text-lg text-slate-500">AI is working its magic...</p>
    <p className="text-sm text-slate-400">This can take a moment, especially for 4 images.</p>
  </div>
);


const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<ImageFile | null>(null);
  const [outfitImage, setOutfitImage] = useState<ImageFile | null>(null);
  const [editedImages, setEditedImages] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('4:5'); // Default to portrait for diagrams
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('edit');
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [colorSuggestions, setColorSuggestions] = useState<ColorSuggestion[]>([]);
  const [isFetchingColors, setIsFetchingColors] = useState<boolean>(false);

  const originalImagePreview = useMemo(() => {
    if (!originalImage) return null;
    return `data:${originalImage.mimeType};base64,${originalImage.base64}`;
  }, [originalImage]);

  const outfitImagePreview = useMemo(() => {
    if (!outfitImage) return null;
    return `data:${outfitImage.mimeType};base64,${outfitImage.base64}`;
  }, [outfitImage]);

  const handleImageUpload = useCallback((image: ImageFile | null) => {
    setOriginalImage(image);
    setEditedImages(null);
    setError(null);
    setSuggestions([]);
  }, []);
  
  const handleOutfitUpload = useCallback(async (image: ImageFile | null) => {
    setOutfitImage(image);
    setEditedImages(null);
    setError(null);
    setColorSuggestions([]); // Reset on new image

    if (image && mode === 'outfitColors') {
      setIsFetchingColors(true);
      try {
        const suggestions = await getOutfitColorSuggestions({
          base64: image.base64,
          mimeType: image.mimeType,
        });
        setColorSuggestions(suggestions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch color ideas.");
        setColorSuggestions([]); // ensure it's empty on failure
      } finally {
        setIsFetchingColors(false);
      }
    }
  }, [mode]);

  const handleGetSuggestions = async () => {
    if (!prompt.trim()) return;
    setIsSuggesting(true);
    setSuggestions([]);
    setError(null);
    try {
      const newSuggestions = await getPromptSuggestions(prompt);
      setSuggestions(newSuggestions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get suggestions.");
    } finally {
      setIsSuggesting(false);
    }
  };
  
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (newMode === 'diagram' && !['4:5', '3:4', '9:16'].includes(aspectRatio)) {
        setAspectRatio('4:5');
    }
  };

  const handleSubmit = async () => {
    if (mode === 'edit' && !originalImage) {
        setError("Please upload a face image to start.");
        return;
    }
    if (mode === 'edit' && !prompt.trim()) {
      setError("Please enter a description for your edit.");
      return;
    }
    if ((mode === 'outfitColors' || mode === 'diagram') && !outfitImage) {
        setError("Please upload an outfit image.");
        return;
    }
     if (mode === 'photoshoot' && !originalImage) {
        setError("Please upload a face image.");
        return;
    }


    setIsLoading(true);
    setError(null);
    setEditedImages(null);
    setSuggestions([]);

    try {
        let editPromises: Promise<string>[];

        if (mode === 'edit') {
            const basePrompt = `Apply this edit: "${prompt}". The final image must be of the highest quality, 4K resolution, and photorealistic. IMPORTANT: Keep the original subject's face, body, and the background as close to the original as possible unless specified in the edit.`;
            editPromises = [editImageWithNanoBanana(originalImage!, basePrompt)];
        } else if (mode === 'photoshoot') {
            const poses = [
                'A dynamic walking pose, as if on a runway, capturing movement.',
                'A classic contrapposto stance, exuding relaxed confidence.',
                'A powerful three-quarter turn, looking over the shoulder towards the camera.',
                'An elegant seated pose on an unseen block, creating interesting lines.'
            ];
            
            editPromises = poses.map(pose => {
                const photoshootPrompt = `
**PHOTOSHOOT DIRECTIVE: This is a high-fashion catalogue shoot. The result must be a 4K, hyper-realistic image, indistinguishable from a real photograph. The aspect ratio must be exactly ${aspectRatio}.**
**MODEL SPECIFICATIONS (NON-NEGOTIABLE):**
1.  **Face:** Create a 4K, ultra-HD, photorealistic replica of the face from the uploaded image. The likeness must be perfect, capturing exact skin texture, tone, and features with hyper-realistic detail. The head must be seamlessly integrated with the body, with lighting that matches the studio environment perfectly. No "cut-and-paste" appearance.
2.  **Physique:** The model MUST be an extremely tall, ${height || '7-foot (213 cm)'}, high-fashion supermodel with impossibly long legs and a slender, statuesque build. This is not a regular person; this is a runway model.
3.  **Pose:** The model must execute the following pose with elegance and strength: **${pose}**. The pose should look natural and dynamic, not stiff.
**OUTFIT & STYLING (CRITICAL TASK):**
1.  **Source:** The model wears the exact outfit from the provided outfit image. If none is provided, use a simple, perfectly tailored black turtleneck and trousers.
2.  **Digital Draping & Tailoring:** This is the most important task. First, create the model as a "digital mannequin." Then, you must digitally DRAPE the source outfit onto this mannequin. This involves realistically stretching, scaling, and wrapping the fabric around the model's elongated body. The garment must conform to the body's contours, creating natural folds, seams, and wrinkles. It must look like the clothing was custom-made for this tall model.
**TECHNICAL & AESTHETIC REQUIREMENTS:**
1.  **Composition:** The final image frame MUST be **${getAspectRatioDescription(aspectRatio)}**. The entire model, from head to toe, must be visible.
2.  **Lighting:** Use dramatic, high-key studio lighting.
3.  **Background:** A seamless, pure white studio background.
**ABSOLUTE PROHIBITIONS (NEGATIVE PROMPT):**
- **DO NOT** create a short or average-height model. - **DO NOT** create a "pasted-on" face or outfit. - **DO NOT** create a stiff, mannequin-like poses.
                `;

                return editImageWithNanoBanana(originalImage!, photoshootPrompt.trim(), outfitImage);
            });
        } else if (mode === 'diagram') {
            let finalOutputSpec = '';
            if (aspectRatio === '3:4') {
                finalOutputSpec = `
1.  **Dimensions:** The final output image MUST be a completely new image generated with the exact dimensions of **300 pixels wide by 400 pixels tall**.
2.  **Resolution:** The resolution should be standard quality, suitable for the specified dimensions.
`;
            } else if (aspectRatio === '4:5') {
                finalOutputSpec = `
1.  **Aspect Ratio:** The final output image MUST be a completely new image generated with a precise **4:5 aspect ratio**.
2.  **Resolution:** The image must be high definition, approximately 1080x1350 pixels.
`;
            } else { // 9:16
                finalOutputSpec = `
1.  **Aspect Ratio:** The final output image MUST be a completely new image generated with a precise **9:16 aspect ratio**.
2.  **Resolution:** The image must be ultra-high definition and 4K resolution quality.
`;
            }

            const diagramPrompt = `
**TASK: Create a professional, hyper-realistic, and clean fashion outfit breakdown diagram, meticulously replicating the style of the user-provided reference image.**

**OUTPUT IMAGE SPECIFICATIONS (ABSOLUTE REQUIREMENT):**
${finalOutputSpec}
3.  **Independence from Source:** The output dimensions are dictated *only* by the request above, NOT by the dimensions of the uploaded source photo.

**LAYOUT & STYLE (STRICT RULES - FOLLOW THE REFERENCE IMAGE EXACTLY):**
1.  **Background Style:** The background is split into two seamless color blocks.
    *   **Left Side (~60% width):** A solid, pure white background (#FFFFFF). The person from the uploaded image must be perfectly cut out and placed here. The entire person, from head to toe, must be visible and centered vertically.
    *   **Right Side (~40% width):** A solid, light gray background (#E5E7EB). All text and illustrations will be on this side.
2.  **Right Side Content (Execute with Extreme Precision):**
    *   **Typography:** Use a clean, modern, bold, and highly legible sans-serif font (like Helvetica Bold or Arial Bold) throughout. All text should be **ALL-CAPS and BOLD**.
    *   **Header:** At the very top, add the text "OUTFIT DETAILS".
    *   **Item Breakdown:**
        a. **Accurately identify** each visible article of clothing and footwear. The descriptions MUST BE FACTUALLY CORRECT.
        b. For each item, create a simple, clean, minimalist 2D vector-style illustration of only that item. The illustrations must be high-quality and accurately represent the item's color and style.
        c. Below each illustration, write a short, descriptive label.
        d. Arrange these illustration/description blocks vertically with generous spacing for a clean, uncluttered, and perfectly aligned look.
    *   **Callout Lines (CRITICAL STYLE DETAIL):** Draw thin, black, perfectly straight lines. Each line MUST originate from a point on the actual clothing item on the model (left side) and extend horizontally to the right, pointing towards its corresponding description block. The lines should be simple and elegant.
3.  **Accurate Color Palette:**
    *   At the bottom of the right side, create a section titled "COLOR PALETTE".
    *   Perform a **precise and accurate analysis** of the outfit to identify the 3-4 dominant colors.
    *   For each color, display a small, solid-colored circle and, to its right, list its **correct** HEX code. The color of the circle must **exactly match** the listed HEX code.

**ABSOLUTE PROHIBITIONS (NEGATIVE PROMPT - VERY IMPORTANT):**
- **DO NOT** draw a vertical dividing line between the white and gray background areas. The transition must be a seamless edge.
- **DO NOT** use arrows on the callout lines. They must be simple, straight lines.
- **DO NOT** have the callout lines originate from the right side. They MUST originate from the model on the left.
- **DO NOT** use the aspect ratio of the original uploaded image.
- **DO NOT** misidentify clothing items. Be accurate.
- **DO NOT** use a normal or light font weight for any text. All text must be BOLD and ALL-CAPS.
- **DO NOT** use photographic cutouts for the item details; they must be clean 2D vector illustrations.
- **DO NOT** use serif or decorative fonts.
            `;
            editPromises = [editImageWithNanoBanana(outfitImage!, diagramPrompt.trim())];

        } else { // outfitColors mode
            const colorsToUse = colorSuggestions.length > 0 ? colorSuggestions : fallbackColorObjects;
            const colors = [{name: 'the original color', hex: null}, ...colorsToUse];
            const basePromptTemplate = (colorName: string, colorHex: string | null, selectedHeight: string) => `
**PHOTOSHOOT DIRECTIVE: This is a high-fashion e-commerce shoot. The result must be a 4K, ultra-HD, hyper-realistic image, indistinguishable from a real e-commerce photograph. The aspect ratio must be exactly ${aspectRatio}.**
**MODEL SPECIFICATIONS (NON-NEGOTIABLE):**
1.  **Face:** Create a 4K, ultra-HD, photorealistic replica of the face from the uploaded image. The likeness must be perfect.
2.  **Physique:** The model MUST be an extremely tall, ${selectedHeight || '7-foot (213 cm)'}, high-fashion supermodel.
3.  **Pose:** The model must strike a confident, standard, front-facing fashion pose. **This pose must be identical across all four generated color options.**
**OUTFIT & STYLING (CRITICAL TASK):**
1.  **Digital Draping & Tailoring:** Drape the source outfit from the second image onto the model. It must look custom-made.
2.  **Targeted Color Change (CRUCIAL):**
    - The **TOP GARMENT ONLY** must be changed to **${colorName}** ${colorHex ? `(exact HEX: ${colorHex})` : ''}.
    - The **BOTTOM GARMENT** (pants, etc.) **MUST RETAIN ITS ORIGINAL COLOR**.
    - If the instruction is "the original color", replicate the outfit's colors precisely.
**TECHNICAL & AESTHETIC REQUIREMENTS:**
1.  **Composition:** The final image frame MUST be **${getAspectRatioDescription(aspectRatio)}**.
2.  **Lighting:** Use clean, bright, even e-commerce studio lighting.
3.  **Background:** A seamless, pure white studio background.
**ABSOLUTE PROHIBITIONS (NEGATIVE PROMPT):**
- **DO NOT** create a short or average-height model. - **DO NOT** change the color of the bottom garment. - **DO NOT** vary the pose between images.
            `;
            editPromises = colors.map(color => {
                const photoshootPrompt = basePromptTemplate(color.name, color.hex, height).trim();
                return editImageWithNanoBanana(originalImage!, photoshootPrompt, outfitImage);
            });
        }
      
      const results = await Promise.all(editPromises);
      const formattedResults = results.map(base64 => `data:image/png;base64,${base64}`);
      setEditedImages(formattedResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = useCallback((imageUrl: string, index: number) => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `ai-generated-image-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleDownloadAll = useCallback(() => {
    if (!editedImages || editedImages.length === 0) return;
    editedImages.forEach((imageUrl, index) => {
      handleDownload(imageUrl, index);
    });
  }, [editedImages, handleDownload]);

  const getTabClassName = (tabMode: Mode) => {
    const baseClasses = 'px-4 py-2 text-sm sm:text-base font-medium transition-colors duration-200 focus:outline-none rounded-t-lg';
    if (mode === tabMode) {
      return `${baseClasses} text-indigo-600 border-b-2 border-indigo-500`;
    }
    return `${baseClasses} text-slate-500 hover:text-slate-800 hover:border-b-2 hover:border-slate-300`;
  };
  
  const isSubmitDisabled = () => {
    if (isLoading) return true;
    switch (mode) {
        case 'edit':
            return !originalImage || !prompt.trim();
        case 'photoshoot':
            return !originalImage;
        case 'outfitColors':
            return !originalImage || !outfitImage || isFetchingColors;
        case 'diagram':
            return !outfitImage;
        default:
            return true;
    }
  };
  
  const currentAspectRatioStyle = useMemo(() => {
    return { aspectRatio: aspectRatio.replace(':', ' / ') };
  }, [aspectRatio]);

  return (
    <div className="min-h-screen text-slate-800 font-sans p-4 sm:p-6 lg:p-8">
      <main className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900">
            AI Photo Studio
          </h1>
          <p className="mt-2 text-lg text-slate-600">Powered by Gemini 'Nano Banana'</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Control Panel */}
          <div className="flex flex-col">
            <div className="flex space-x-1 border-b border-slate-200">
                <button onClick={() => handleModeChange('edit')} className={getTabClassName('edit')}>
                    🎨 Creative Edit
                </button>
                <button onClick={() => handleModeChange('photoshoot')} className={getTabClassName('photoshoot')}>
                    📸 Virtual Photoshoot
                </button>
                <button onClick={() => handleModeChange('outfitColors')} className={getTabClassName('outfitColors')}>
                    👕 Model &amp; Outfit
                </button>
                <button onClick={() => handleModeChange('diagram')} className={getTabClassName('diagram')}>
                    📊 Outfit Diagram
                </button>
            </div>
            <div className="bg-white p-6 sm:p-8 rounded-b-2xl shadow-lg border border-t-0 border-slate-200 flex-grow flex flex-col space-y-6">
                
                {mode !== 'diagram' && (
                  <div>
                    <label className="text-lg font-semibold text-slate-700 block mb-2">1. Upload Face</label>
                    <p className="text-sm text-indigo-700 bg-indigo-50 p-2 rounded-md mb-3">For best results, upload a clear, front-facing photo of a face.</p>
                    <ImageUploader onImageUpload={handleImageUpload} imagePreviewUrl={originalImagePreview} />
                  </div>
                )}
                
                {mode === 'diagram' && (
                  <>
                    <div>
                      <label className="text-lg font-semibold text-slate-700 block mb-2">1. Upload Full Outfit Photo</label>
                      <p className="text-sm text-indigo-700 bg-indigo-50 p-2 rounded-md mb-3">Upload a single, full-body photo of an outfit to generate a diagram.</p>
                      <ImageUploader onImageUpload={handleOutfitUpload} imagePreviewUrl={outfitImagePreview} />
                    </div>
                     <div>
                        <label className="text-lg font-semibold text-slate-700 block mb-2">
                            2. Select Output Size
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { value: '4:5', label: '4:5' },
                                { value: '3:4', label: '300x400px' },
                                { value: '9:16', label: '9:16' }
                            ].map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => setAspectRatio(value)}
                                className={`py-2 px-1 text-sm rounded-lg border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500
                                ${aspectRatio === value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:border-slate-400'}
                                `}
                            >
                                {label}
                            </button>
                            ))}
                        </div>
                    </div>
                  </>
                )}

                {mode === 'edit' && (
                    <>
                        <div>
                        <label htmlFor="prompt" className="text-lg font-semibold text-slate-700 block mb-2">
                            2. Describe Your Edit
                        </label>
                        <textarea
                            id="prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., 'change only the shirt to a red t-shirt', 'add a cute cat wearing a hat'..."
                            className="w-full h-32 p-3 bg-slate-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors placeholder-slate-400"
                            disabled={!originalImage || isLoading}
                        />
                         <div className="mt-4">
                            <button
                            onClick={handleGetSuggestions}
                            disabled={!prompt.trim() || isSuggesting || isLoading}
                            className="px-4 py-2 text-sm font-semibold bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                            >
                            {isSuggesting ? (
                                <>
                                <Spinner />
                                <span className="ml-2">Suggesting...</span>
                                </>
                            ) : '💡 Suggest Ideas'}
                            </button>
                            {suggestions.length > 0 && !isLoading && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <p className="w-full text-sm text-slate-500 mb-1">Click to add a suggestion:</p>
                                {suggestions.map((s, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => setPrompt(p => `${p.trim()} ${s}`.trim())}
                                    className="px-3 py-1 bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-full text-sm hover:bg-indigo-200 transition-colors"
                                >
                                    {s}
                                </button>
                                ))}
                            </div>
                            )}
                        </div>
                        </div>
                    </>
                )}

                {(mode === 'photoshoot' || mode === 'outfitColors') && (
                  <>
                    <div>
                        <label className="text-lg font-semibold text-slate-700 block mb-2">{mode === 'photoshoot' ? '2. Upload Outfit (Optional)' : '2. Upload Outfit'}</label>
                        {mode === 'outfitColors' && <p className="text-sm text-indigo-700 bg-indigo-50 p-2 rounded-md mb-3">Upload a clear photo of the clothing item or full outfit.</p>}
                        <ImageUploader onImageUpload={handleOutfitUpload} imagePreviewUrl={outfitImagePreview} />
                    </div>
                     {mode === 'outfitColors' && (
                      <div className="mt-1 space-y-2">
                          {isFetchingColors && (
                              <div className="flex items-center text-sm text-slate-500 p-2 bg-slate-100 rounded-md">
                                  <Spinner />
                                  <span className="ml-2">Getting AI color ideas...</span>
                              </div>
                          )}
                          {!isFetchingColors && colorSuggestions.length > 0 && (
                              <div className="animate-fade-in">
                                  <p className="text-sm font-semibold text-slate-600 mb-2">AI Color Suggestions:</p>
                                  <div className="flex flex-wrap gap-2">
                                      {colorSuggestions.map(color => (
                                          <span key={color.hex} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium capitalize flex items-center gap-2">
                                              <span className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: color.hex }}></span>
                                              {color.name}
                                          </span>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>
                    )}
                  </>
                )}

                {(mode === 'photoshoot' || mode === 'outfitColors') && (
                  <>
                    <div>
                        <label htmlFor="height" className="text-lg font-semibold text-slate-700 block mb-2">
                            {mode === 'photoshoot' ? '3. Select Height (Optional)' : '3. Select Height (Optional)'}
                        </label>
                        <select
                            id="height"
                            value={height}
                            onChange={(e) => setHeight(e.target.value)}
                            className="w-full p-3 bg-slate-100 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            disabled={isLoading}
                        >
                            <option value="">Default (7ft+)</option>
                            {heightOptions.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="text-lg font-semibold text-slate-700 block mb-2">
                            {mode === 'photoshoot' ? '4. Select Aspect Ratio' : '4. Select Aspect Ratio'}
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                            {aspectRatios.map(ar => (
                            <button
                                key={ar}
                                onClick={() => setAspectRatio(ar)}
                                className={`py-2 px-1 text-sm rounded-lg border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500
                                ${aspectRatio === ar ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:border-slate-400'}
                                `}
                            >
                                {ar}
                            </button>
                            ))}
                        </div>
                    </div>
                  </>
                )}
                
                <div className="pt-4 mt-auto">
                    <button
                    onClick={handleSubmit}
                    disabled={isSubmitDisabled()}
                    className="w-full py-3 px-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-indigo-500/50 disabled:shadow-none text-lg"
                    >
                    {isLoading ? (
                        <>
                        <Spinner />
                        <span className="ml-3">Generating...</span>
                        </>
                    ) : mode === 'edit' ? `✨ Apply Edit` 
                      : mode === 'photoshoot' ? `📸 Generate 4 Poses` 
                      : mode === 'diagram' ? `📊 Generate Diagram`
                      : `🎨 Generate 4 Colors`
                    }
                    </button>
                </div>
            </div>
          </div>


          {/* Output Panel */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 flex items-center justify-center min-h-[400px] lg:min-h-0">
            {isLoading ? (
               <SkeletonLoader count={mode === 'edit' || mode === 'diagram' ? 1 : 4} aspectRatio={aspectRatio} />
            ) : error ? (
              <div className="text-center text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="font-bold">Error</p>
                <p>{error}</p>
              </div>
            ) : editedImages && editedImages.length > 0 ? (
              <div className="w-full h-full flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-slate-800">Generated Images</h3>
                    {editedImages.length > 1 && (
                    <button
                        onClick={handleDownloadAll}
                        className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        aria-label="Download all generated images"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Download All</span>
                    </button>
                    )}
                </div>
                <div className={`flex-grow w-full grid ${editedImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  {editedImages.map((imgSrc, index) => (
                    <div 
                      key={index} 
                      className="group relative cursor-zoom-in overflow-hidden rounded-lg bg-slate-100"
                      onClick={() => setFullScreenImage(imgSrc)}
                      style={currentAspectRatioStyle}
                    >
                      <img src={imgSrc} alt={`Edited result ${index + 1}`} className="object-cover w-full h-full shadow-md transition-transform duration-300 group-hover:scale-105"/>
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-lg pointer-events-none">
                        <div className="text-white text-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3h-6" />
                            </svg>
                            <p className="text-sm font-semibold mt-1">View Larger</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(imgSrc, index);
                        }}
                        className="absolute bottom-2 right-2 bg-green-600 text-white p-2.5 rounded-full hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500 transition-all duration-300 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 pointer-events-auto"
                        aria-label={`Download image ${index + 1}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <h3 className="text-xl font-semibold">Your generated images will appear here</h3>
                <p>Upload a photo and describe your idea to get started.</p>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {fullScreenImage && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 animate-fade-in"
            onClick={() => setFullScreenImage(null)}
        >
            <button 
                className="absolute top-4 right-4 text-white text-4xl z-50 hover:text-indigo-400 transition-colors"
                aria-label="Close full screen view"
            >
                &times;
            </button>
            <img 
                src={fullScreenImage} 
                alt="Full screen view" 
                className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
      )}
    </div>
  );
};

export default App;