import { WorkflowState, WorkflowStep } from '../types/index.js';
/**
 * Creates a new workflow state
 */
export declare function createWorkflowState(inputFile: string, stepNames: string[]): WorkflowState;
/**
 * Updates step status
 */
export declare function updateStepStatus(state: WorkflowState, stepIndex: number, status: WorkflowStep['status'], result?: any, error?: string): void;
/**
 * Gets current step
 */
export declare function getCurrentStep(state: WorkflowState): WorkflowStep | null;
/**
 * Advances to next step
 */
export declare function nextStep(state: WorkflowState): boolean;
/**
 * Checks if workflow is complete
 */
export declare function isWorkflowComplete(state: WorkflowState): boolean;
/**
 * Checks if there were any workflow errors
 */
export declare function hasWorkflowErrors(state: WorkflowState): boolean;
/**
 * Displays workflow progress
 */
export declare function printWorkflowProgress(state: WorkflowState): void;
/**
 * Saves workflow state to file
 */
export declare function saveWorkflowState(state: WorkflowState, outputDir: string): void;
/**
 * Loads workflow state from file
 */
export declare function loadWorkflowState(outputDir: string): WorkflowState | null;
//# sourceMappingURL=state.d.ts.map