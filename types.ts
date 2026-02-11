

export type TransformMode = 
  | 'restyle' 
  | 'refurnish' 
  | 'lighting' 
  | 'paint' 
  | 'flooring' 
  | 'custom';

export interface FurnitureSuggestion {
  item: string;
  move: string;
  reason: string;
}

export interface AnalysisResult {
  clutterLevel: string;
  quickSummary: string;
  topFixes: {
    title: string;
    action: string;
  }[];
  furnitureTips: FurnitureSuggestion[];
  designPrompt: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}