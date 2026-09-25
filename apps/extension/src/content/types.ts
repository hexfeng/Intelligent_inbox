import type { AnalysisResultV2, SummaryResult } from "@intelligent-inbox/contracts";

export type AnalysisResult = AnalysisResultV2;
export type SummaryResponse = SummaryResult & { cached: boolean };
