import type { EmailIntelligenceV11, RecommendationSet } from "@intelligent-inbox/contracts";

export type AnalysisResult = {
  intelligence: EmailIntelligenceV11;
  recommendations: RecommendationSet;
  cached?: boolean;
};

export type TriageQueue = { items: AnalysisResult[] };
