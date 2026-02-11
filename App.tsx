import React, { useState } from 'react';
import Header from './components/Header.tsx';
import ImageUploader from './components/ImageUploader.tsx';
import AnalysisView from './components/AnalysisView.tsx';
import ChatInterface from './components/ChatInterface.tsx';
import { analyzeRoom } from './services/geminiService.ts';
import { AnalysisResult } from './types.ts';

// Add prop type for the callback
interface AppProps {
  onDesignGenerated?: () => Promise<number>;
  designsUsed?: number;
  designsLimit?: number;
  userPlan?: string;
  userName?: string;
  upgradeToPro?: () => void;
  userButton?: React.ReactNode;
}

const App: React.FC<AppProps> = ({ 
  onDesignGenerated, 
  designsUsed, 
  designsLimit, 
  userPlan, 
  userName, 
  upgradeToPro, 
  userButton 
}) => {
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrentImage(null);
    setAnalysis(null);
    setError(null);
  };

  const handleStart = async (base64: string) => {
    setCurrentImage(base64);
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await analyzeRoom(base64, (userPlan || 'free') as any);
      setAnalysis(res);
      
      // INCREMENT USAGE IN DATABASE (NEW!)
      if (onDesignGenerated) {
        await onDesignGenerated();
        console.log('Design usage incremented in database');
      }
    } catch (e) {
      setError("AI couldn't see the room clearly. Try another photo.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-white selection:bg-accent-gold selection:text-dark-bg overflow-x-hidden">
      <Header 
        onReset={reset} 
        designsUsed={designsUsed}
        designsLimit={designsLimit}
        userPlan={userPlan}
        userName={userName}
        upgradeToPro={upgradeToPro}
        userButton={userButton}
      />
      
      <main className="max-w-[1400px] mx-auto px-8 py-12">
        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="relative">
              <div className="w-32 h-32 border-8 border-dark-muted rounded-full"></div>
              <div className="absolute inset-0 w-32 h-32 border-8 border-accent-gold border-t-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(255,215,0,0.15)]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 bg-accent-gold rounded-full animate-pulse shadow-[0_0_15px_rgba(255,215,0,0.5)]"></div>
              </div>
            </div>
            <h2 className="heading text-5xl mt-12 font-bold text-white tracking-tighter">Reimagining your space...</h2>
            <p className="text-gray-500 mt-6 text-xl font-medium max-w-md text-center leading-relaxed">Our AI is detecting layout, lighting, and style potential to create your masterpiece.</p>
          </div>
        ) : !currentImage ? (
          <div className="max-w-4xl mx-auto text-center mt-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-white/5 text-accent-gold text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
              AI Interior Design Studio
            </div>
            <h1 className="heading text-6xl md:text-8xl text-white mb-8 leading-[1.1] tracking-tight">
              Design your dream <br/>
              <span className="gold-text-gradient">space</span> in seconds.
            </h1>
            <p className="text-gray-400 text-xl mb-16 max-w-2xl mx-auto leading-relaxed font-medium">
              Experience the power of professional interior design. Upload a photo and let our AI recreate your space with stunning transformations.
            </p>
            <div className="p-4 bg-dark-card rounded-[3.5rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.6)] border border-dark-border relative overflow-hidden group">
              <div className="absolute inset-0 gold-gradient opacity-0 group-hover:opacity-[0.02] transition-opacity duration-1000"></div>
              <ImageUploader onImageSelected={handleStart} isLoading={isAnalyzing} />
            </div>
            
            <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { label: 'Upload Photo', desc: 'Snap a picture of your current room', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { label: 'AI Magic', desc: 'Our AI analyzes layout and lighting', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                { label: 'New Design', desc: 'Get a professional redesign instantly', icon: 'M5 13l4 4L19 7' }
              ].map((step, i) => (
                <div key={i} className="dark-card p-10 rounded-[2.5rem] text-left group">
                  <div className="w-14 h-14 teal-gradient rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-accent-teal/10 group-hover:scale-110 transition-all duration-500">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={step.icon} />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4 tracking-tight">{step.label}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AnalysisView 
            result={analysis!} 
            originalImage={currentImage} 
            onReset={reset}
            userPlan={userPlan}
            upgradeToPro={upgradeToPro}
          />
        )}

        {error && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-dark-card text-rose-500 px-10 py-6 rounded-[2.5rem] border border-rose-500/20 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] z-[100] animate-fade-in flex items-center gap-5 font-bold backdrop-blur-2xl">
            <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">Error Detected</span>
              <span className="text-lg tracking-tight">{error}</span>
            </div>
          </div>
        )}
      </main>

      <ChatInterface 
        currentImage={currentImage || undefined} 
        userPlan={userPlan}
        upgradeToPro={upgradeToPro}
      />
    </div>
  );
};

export default App;