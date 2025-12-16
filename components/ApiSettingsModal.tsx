import React, { useState, useEffect } from 'react';
import type { ApiSettings } from '../types';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentSettings: ApiSettings;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({ isOpen, onClose, onSave, currentSettings }) => {
  const [provider, setProvider] = useState<'google' | 'openrouter'>(currentSettings.provider);
  const [apiKey, setApiKey] = useState(currentSettings.apiKey);
  const [model, setModel] = useState(currentSettings.model);

  useEffect(() => {
    if (isOpen) {
      setProvider(currentSettings.provider);
      setApiKey(currentSettings.apiKey);
      setModel(currentSettings.model);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ provider, apiKey, model });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">API Configuration</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">AI Provider</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setProvider('google'); setModel('gemini-2.5-flash'); }}
                className={`py-2 px-4 rounded-lg border text-sm font-medium transition-all ${
                  provider === 'google' 
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Google Gemini
              </button>
              <button
                onClick={() => { setProvider('openrouter'); setModel('google/gemini-2.0-flash-exp:free'); }}
                className={`py-2 px-4 rounded-lg border text-sm font-medium transition-all ${
                  provider === 'openrouter' 
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                OpenRouter
              </button>
            </div>
          </div>

          {/* API Key Input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {provider === 'google' ? 'Google API Key' : 'OpenRouter API Key'}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'google' ? "Enter your Gemini API Key" : "Enter sk-or-..."}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
            <p className="text-xs text-slate-500 mt-2">
              {provider === 'google' 
                ? 'Your key is stored locally in your browser. Leave empty to use System Key.' 
                : 'Required for OpenRouter. Stored locally.'}
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Model ID (Advanced)</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., gemini-2.5-flash"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              {provider === 'google' 
                ? 'Default: gemini-2.5-flash-image (for images) / gemini-2.5-flash (for text)' 
                : 'Default: google/gemini-2.0-flash-exp:free'}
            </p>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 font-medium hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-sm transition-all active:scale-95"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};