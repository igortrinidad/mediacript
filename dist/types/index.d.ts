export interface Config {
    openaiApiKey?: string;
    groqApiKey?: string;
}
export interface WorkflowStep {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    result?: any;
    error?: string;
    startTime?: number;
    endTime?: number;
}
export interface WorkflowState {
    steps: WorkflowStep[];
    currentStepIndex: number;
    inputFile: string;
    intermediateFiles: {
        convertedVideo?: string;
        extractedAudio?: string;
        transcriptionText?: string;
    };
}
export type OperationType = 'convert-video' | 'extract-audio' | 'convert-audio' | 'transcribe';
export interface Operation {
    type: OperationType;
    name: string;
    description: string;
    requiresInput: 'video' | 'audio' | 'any';
}
//# sourceMappingURL=index.d.ts.map