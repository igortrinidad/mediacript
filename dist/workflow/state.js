import fs from 'fs';
import path from 'path';
/**
 * Cria um novo workflow state
 */
export function createWorkflowState(inputFile, stepNames) {
    return {
        steps: stepNames.map((name, index) => ({
            id: `step-${index}`,
            name,
            status: 'pending'
        })),
        currentStepIndex: 0,
        inputFile,
        intermediateFiles: {}
    };
}
/**
 * Atualiza o status de um step
 */
export function updateStepStatus(state, stepIndex, status, result, error) {
    if (stepIndex >= 0 && stepIndex < state.steps.length) {
        const step = state.steps[stepIndex];
        step.status = status;
        if (status === 'running') {
            step.startTime = Date.now();
        }
        else if (status === 'completed' || status === 'failed') {
            step.endTime = Date.now();
        }
        if (result !== undefined) {
            step.result = result;
        }
        if (error) {
            step.error = error;
        }
    }
}
/**
 * Obtém o step atual
 */
export function getCurrentStep(state) {
    if (state.currentStepIndex < state.steps.length) {
        return state.steps[state.currentStepIndex];
    }
    return null;
}
/**
 * Avança para o próximo step
 */
export function nextStep(state) {
    if (state.currentStepIndex < state.steps.length - 1) {
        state.currentStepIndex++;
        return true;
    }
    return false;
}
/**
 * Verifica se o workflow está completo
 */
export function isWorkflowComplete(state) {
    return state.steps.every(step => step.status === 'completed' || step.status === 'skipped');
}
/**
 * Verifica se houve algum erro no workflow
 */
export function hasWorkflowErrors(state) {
    return state.steps.some(step => step.status === 'failed');
}
/**
 * Exibe o progresso do workflow
 */
export function printWorkflowProgress(state) {
    console.log('\n📊 Progresso do Workflow:');
    console.log('━'.repeat(50));
    state.steps.forEach((step, index) => {
        let icon = '⏳';
        if (step.status === 'completed')
            icon = '✓';
        else if (step.status === 'failed')
            icon = '✗';
        else if (step.status === 'running')
            icon = '⚡';
        else if (step.status === 'skipped')
            icon = '⊘';
        const duration = step.startTime && step.endTime
            ? ` (${((step.endTime - step.startTime) / 1000).toFixed(1)}s)`
            : '';
        console.log(`${icon} ${index + 1}. ${step.name}${duration}`);
        if (step.error) {
            console.log(`   └─ Erro: ${step.error}`);
        }
    });
    console.log('━'.repeat(50));
}
/**
 * Salva o estado do workflow em arquivo
 */
export function saveWorkflowState(state, outputDir) {
    const stateFile = path.join(outputDir, '.workflow-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}
/**
 * Carrega o estado do workflow de arquivo
 */
export function loadWorkflowState(outputDir) {
    const stateFile = path.join(outputDir, '.workflow-state.json');
    try {
        if (fs.existsSync(stateFile)) {
            const data = fs.readFileSync(stateFile, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.warn('Erro ao carregar estado do workflow:', error);
    }
    return null;
}
//# sourceMappingURL=state.js.map