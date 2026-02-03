import { WorkflowState, WorkflowStep } from '../types/index.js';
/**
 * Cria um novo workflow state
 */
export declare function createWorkflowState(inputFile: string, stepNames: string[]): WorkflowState;
/**
 * Atualiza o status de um step
 */
export declare function updateStepStatus(state: WorkflowState, stepIndex: number, status: WorkflowStep['status'], result?: any, error?: string): void;
/**
 * Obtém o step atual
 */
export declare function getCurrentStep(state: WorkflowState): WorkflowStep | null;
/**
 * Avança para o próximo step
 */
export declare function nextStep(state: WorkflowState): boolean;
/**
 * Verifica se o workflow está completo
 */
export declare function isWorkflowComplete(state: WorkflowState): boolean;
/**
 * Verifica se houve algum erro no workflow
 */
export declare function hasWorkflowErrors(state: WorkflowState): boolean;
/**
 * Exibe o progresso do workflow
 */
export declare function printWorkflowProgress(state: WorkflowState): void;
/**
 * Salva o estado do workflow em arquivo
 */
export declare function saveWorkflowState(state: WorkflowState, outputDir: string): void;
/**
 * Carrega o estado do workflow de arquivo
 */
export declare function loadWorkflowState(outputDir: string): WorkflowState | null;
//# sourceMappingURL=state.d.ts.map