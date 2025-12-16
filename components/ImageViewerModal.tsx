import React, { useEffect, useState } from 'react';
import { getVideoGenerationPrompt, editImageWithNanoBanana } from '../services/geminiService';
import { Spinner } from './Spinner';

interface ImageViewerModalProps {
  imageUrl: string;
  onClose: () => void;
  onDownload: (base64: string) => void;
  // Context passed from parent for better defaults
  initialCategory?: string;
  initialAspectRatio?: string;
  productImage?: string | null;
  initialVideoPrompt?: string; // New prop for pre-generated prompt
}

// Full list of categories matching App.tsx
const ALL_CATEGORIES = [
  "Daily Vlogging", "Travel", "Fashion", "Fitness", "Lifestyle", "Business", "Education", 
  "Food", "Beauty", "Technology", "Product Promotion", "Motivation", 
  "Social Media Influencer", "Cinematic", "Casual Daily Life", "Luxury", "Street Style"
];

// JSZip Declaration
declare const JSZip: any;

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ 
    imageUrl, 
    onClose, 
    onDownload,
    initialCategory = "Fashion",
    initialAspectRatio = "9:16",
    productImage,
    initialVideoPrompt
}) => {
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(initialVideoPrompt || null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  // Video Prompt Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    category: initialCategory,
    aspectRatio: initialAspectRatio,
    quantity: 1,
    frameIndex: 1
  });

  // Versions / Scenes Generator State
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [versionPrompt, setVersionPrompt] = useState("");
  const [versionQuantity, setVersionQuantity] = useState(1);
  const [isGeneratingVersion, setIsGeneratingVersion] = useState(false);
  const [versionResults, setVersionResults] = useState<string[]>([]);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Update prompt if prop changes (though modal usually remounts)
  useEffect(() => {
    if (initialVideoPrompt) {
        setGeneratedPrompt(initialVideoPrompt);
    }
  }, [initialVideoPrompt]);

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload(imageUrl);
  };

  const handleGeneratePrompt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGeneratingPrompt) return;

    setIsGeneratingPrompt(true);
    setGeneratedPrompt(null);
    setShowSettings(false); // Close settings panel while generating

    try {
        const prompt = await getVideoGenerationPrompt(imageUrl, {
            category: settings.category,
            aspectRatio: settings.aspectRatio,
            quantity: settings.quantity,
            productImage: productImage,
            frameIndex: settings.frameIndex
        });
        setGeneratedPrompt(prompt);
    } catch (err) {
        console.error("Failed to generate prompt", err);
        alert("Failed to generate prompt. Please try again.");
    } finally {
        setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateVersions = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!versionPrompt.trim()) {
          alert("Please describe the new scene.");
          return;
      }
      setIsGeneratingVersion(true);
      setVersionResults([]);
      setVersionError(null);

      // Sleep helper
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      try {
          const tempResults: string[] = [];
          for (let i = 0; i < versionQuantity; i++) {
              const fullPrompt = `
              CRITICAL TASK: Generate a new version of the uploaded image.
              SCENE DESCRIPTION: ${versionPrompt}
              IDENTITY LOCK (MANDATORY): Keep the Face, Body, and Identity EXACTLY the same as the reference image.
              OUTFIT: Keep the outfit consistent unless asked otherwise.
              QUALITY: 8k, Photorealistic, No Glitch, Perfect Eyes, Perfect Hands.
              `;

              // We use editImageWithNanoBanana to perform image-to-image
              const result = await editImageWithNanoBanana(
                  fullPrompt,
                  { base64: imageUrl, mimeType: 'image/jpeg' }, // Primary Image
                  productImage ? [{ base64: productImage, mimeType: 'image/jpeg' }] : null, // Aux
                  settings.aspectRatio as any,
                  undefined // Uses system or stored settings inside helper
              );
              
              tempResults.push(result);
              setVersionResults([...tempResults]);
              if (i < versionQuantity - 1) await sleep(4000); // polite delay
          }
      } catch (err) {
          console.error("Version generation failed", err);
          setVersionError("Failed to generate versions.");
      } finally {
          setIsGeneratingVersion(false);
      }
  };

  const downloadVersionZip = async () => {
      if (versionResults.length === 0) return;
      const zip = new JSZip();
      versionResults.forEach((img, idx) => {
          zip.file(`scene_version_${idx + 1}.png`, img, { base64: true });
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `versions_collection.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleCopyPrompt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!generatedPrompt) return;

    try {
        await navigator.clipboard.writeText(generatedPrompt);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 3000);
    } catch (err) {
        console.warn("Clipboard API failed, trying fallback", err);
        const textArea = document.createElement("textarea");
        textArea.value = generatedPrompt;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 3000);
        } catch (execErr) {
            console.error("Fallback copy failed", execErr);
            alert("Could not copy automatically. Please copy the text manually.");
        }
        document.body.removeChild(textArea);
    }
  };

  const handleClosePrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGeneratedPrompt(null);
    setCopyStatus('idle');
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex flex-col animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      {/* Top Bar: Close Button */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-30 pointer-events-none">
         <div className="pointer-events-auto bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm">
            <span className="text-sm font-semibold text-slate-700">Full Screen View</span>
         </div>
         <button 
          onClick={onClose}
          className="pointer-events-auto group flex items-center justify-center p-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all border border-slate-200 shadow-sm"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main Image Area */}
      <div className="flex-grow w-full h-full flex items-center justify-center p-4 md:p-8 overflow-hidden relative">
        {/* If showing versions results, show grid overlay instead of main image */}
        {versionResults.length > 0 ? (
             <div className="w-full h-full max-w-5xl mx-auto flex flex-col items-center justify-center z-40" onClick={(e) => e.stopPropagation()}>
                 <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-2xl p-6 w-full max-h-full overflow-y-auto border border-slate-200">
                     <div className="flex justify-between items-center mb-4">
                         <h3 className="text-lg font-bold text-slate-800">Generated Scenes / Versions</h3>
                         <div className="flex gap-2">
                             <button onClick={downloadVersionZip} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Download ZIP</button>
                             <button onClick={() => setVersionResults([])} className="text-slate-500 hover:text-slate-700">Close Results</button>
                         </div>
                     </div>
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                         {versionResults.map((res, idx) => (
                             <div key={idx} className="relative group aspect-[9/16] rounded-lg overflow-hidden border border-slate-100 shadow-sm">
                                 <img src={`data:image/png;base64,${res}`} alt={`Ver ${idx}`} className="w-full h-full object-cover" />
                                 <button onClick={() => onDownload(res)} className="absolute bottom-2 right-2 bg-white p-1 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                 </button>
                             </div>
                         ))}
                         {isGeneratingVersion && (
                            <div className="flex items-center justify-center aspect-[9/16] bg-slate-50 rounded-lg border border-slate-100">
                                <Spinner />
                            </div>
                         )}
                     </div>
                 </div>
             </div>
        ) : (
            <div 
                className="relative flex justify-center items-center shadow-2xl rounded-lg overflow-hidden group max-w-full max-h-full"
                onClick={(e) => { e.stopPropagation(); setShowSettings(false); setShowVersionPanel(false); }}
            >
                <img 
                    src={`data:image/png;base64,${imageUrl}`} 
                    alt="Full view" 
                    className="max-w-full max-h-full object-contain bg-white"
                />
            </div>
        )}

            {/* Version Generator Panel */}
            {showVersionPanel && !versionResults.length && (
                 <div 
                    className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in z-[60]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h4 className="font-semibold text-sm text-slate-700">Generate New Scene/Version</h4>
                        <button onClick={() => setShowVersionPanel(false)} className="text-slate-400 hover:text-slate-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                    <div className="p-4 space-y-3">
                         <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Scene Description</label>
                            <textarea 
                                value={versionPrompt}
                                onChange={(e) => setVersionPrompt(e.target.value)}
                                placeholder="e.g. Walking on a luxury beach, drinking coffee..."
                                className="w-full text-sm border-slate-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 h-20"
                            />
                         </div>
                         <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Quantity (1-10)</label>
                            <select 
                                value={versionQuantity}
                                onChange={(e) => setVersionQuantity(parseInt(e.target.value))}
                                className="w-full text-sm border-slate-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} Version{n>1?'s':''}</option>)}
                            </select>
                         </div>
                         {versionError && <p className="text-xs text-red-500">{versionError}</p>}
                    </div>
                    <div className="p-3 bg-slate-50 border-t border-slate-100">
                        <button
                            onClick={handleGenerateVersions}
                            disabled={isGeneratingVersion}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300"
                        >
                            {isGeneratingVersion ? 'Generating...' : 'Generate Scenes'}
                        </button>
                    </div>
                </div>
            )}
            
            {/* Video Settings Panel */}
            {showSettings && !versionResults.length && (
                <div 
                    className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in z-[60]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h4 className="font-semibold text-sm text-slate-700">Copy Prompt Settings</h4>
                        <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                    <div className="p-4 space-y-3">
                         {/* Frame Sequence Selector */}
                         <div className="bg-indigo-50 border border-indigo-100 p-2 rounded">
                            <label className="block text-xs font-bold text-indigo-700 mb-1">🎬 Video Frame / Sequence</label>
                            <select 
                                value={settings.frameIndex}
                                onChange={(e) => setSettings({...settings, frameIndex: parseInt(e.target.value)})}
                                className="w-full text-sm border-indigo-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-indigo-900"
                            >
                                <option value={1}>Frame 1: Start Scene</option>
                                <option value={2}>Frame 2: Continuation (Next 5s)</option>
                                <option value={3}>Frame 3: Progression (Next 5s)</option>
                                <option value={4}>Frame 4: Ending (Final 5s)</option>
                            </select>
                            <p className="text-[10px] text-indigo-600 mt-1">Select "Frame 2" to generate a prompt that continues EXACTLY from Frame 1.</p>
                         </div>

                         {/* Category */}
                         <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                            <select 
                                value={settings.category}
                                onChange={(e) => setSettings({...settings, category: e.target.value})}
                                className="w-full text-sm border-slate-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                {ALL_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                         </div>
                         {/* Ratio */}
                         <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Aspect Ratio</label>
                            <select 
                                value={settings.aspectRatio}
                                onChange={(e) => setSettings({...settings, aspectRatio: e.target.value})}
                                className="w-full text-sm border-slate-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="9:16">9:16 (Shorts/Reels)</option>
                                <option value="16:9">16:9 (Landscape)</option>
                                <option value="1:1">1:1 (Square)</option>
                            </select>
                         </div>
                         {/* Quantity */}
                         <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Quantity (Variations)</label>
                            <select 
                                value={settings.quantity}
                                onChange={(e) => setSettings({...settings, quantity: parseInt(e.target.value)})}
                                className="w-full text-sm border-slate-200 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value={1}>1 Video</option>
                                <option value={2}>2 Videos</option>
                                <option value={3}>3 Videos</option>
                                <option value={5}>5 Videos</option>
                            </select>
                         </div>
                    </div>
                    <div className="p-3 bg-slate-50 border-t border-slate-100">
                        <button
                            onClick={handleGeneratePrompt}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                        >
                            Generate & Copy Prompt
                        </button>
                    </div>
                </div>
            )}
            
            {/* Prompt Result Overlay (Shows AFTER generation or if initialVideoPrompt exists) */}
            {generatedPrompt && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-end sm:items-center justify-center p-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80%]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-semibold text-slate-800">
                                Video Prompt Generated (Frame {settings.frameIndex})
                            </h3>
                            <button onClick={handleClosePrompt} className="text-slate-400 hover:text-slate-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            <p className="text-sm text-slate-600 leading-relaxed font-mono bg-slate-50 p-3 rounded border border-slate-200 whitespace-pre-wrap">
                                {generatedPrompt}
                            </p>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button 
                                onClick={handleCopyPrompt}
                                className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all ${
                                    copyStatus === 'copied' 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                }`}
                            >
                                {copyStatus === 'copied' ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                        </svg>
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy Text
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Default Controls - Positioned at bottom center with centered layout and backdrop */}
            {!generatedPrompt && !showSettings && !showVersionPanel && !versionResults.length && (
                <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center z-50 pointer-events-none">
                    <div className="flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-xl rounded-full pointer-events-auto shadow-2xl border border-white/10 mx-4 max-w-full overflow-x-auto no-scrollbar">
                        
                        {/* Scenes Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowVersionPanel(true);
                            }}
                            disabled={isGeneratingPrompt}
                            className="flex items-center justify-center px-4 py-2.5 rounded-full font-medium text-sm transition-all transform active:scale-95 bg-white/10 hover:bg-white/20 text-white border border-white/10 whitespace-nowrap"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                            <span className="hidden sm:inline">Scenes</span>
                        </button>

                        {/* Copy Prompt Button (Renamed from Prompt) */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowSettings(true);
                            }}
                            disabled={isGeneratingPrompt}
                            className="flex items-center justify-center px-4 py-2.5 rounded-full font-medium text-sm shadow-lg transition-all transform active:scale-95 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400 whitespace-nowrap"
                        >
                            {isGeneratingPrompt ? (
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                    <span className="hidden sm:inline">Copy Prompt</span>
                                    <span className="sm:hidden">Copy Prompt</span>
                                </>
                            )}
                        </button>

                        {/* Download Button */}
                        <button
                            onClick={handleDownloadClick}
                            className="flex items-center justify-center p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all transform active:scale-95"
                            title="Download Image"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
      </div>
    </div>
  );
};