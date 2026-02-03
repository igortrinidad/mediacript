import fs from 'fs';
import path from 'path';
/**
 * Creates a new workflow state
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
 * Updates step status
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
 * Gets current step
 */
export function getCurrentStep(state) {
    if (state.currentStepIndex < state.steps.length) {
        return state.steps[state.currentStepIndex];
    }
    return null;
}
/**
 * Advances to next step
 */
export function nextStep(state) {
    if (state.currentStepIndex < state.steps.length - 1) {
        state.currentStepIndex++;
        return true;
    }
    return false;
}
/**
 * Checks if workflow is complete
 */
export function isWorkflowComplete(state) {
    return state.steps.every(step => step.status === 'completed' || step.status === 'skipped');
}
/**
 * Checks if there were any workflow errors
 */
export function hasWorkflowErrors(state) {
    return state.steps.some(step => step.status === 'failed');
}
/**
 * Displays workflow progress
 */
export function printWorkflowProgress(state) {
    console.log('\n📊 Workflow Progress:');
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
            console.log(`   └─ Error: ${step.error}`);
        }
    });
    console.log('━'.repeat(50));
}
/**
 * Saves workflow state to file
 */
export function saveWorkflowState(state, outputDir) {
    const stateFile = path.join(outputDir, '.workflow-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}
/**
 * Loads workflow state from file
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
        console.warn('Error loading workflow state:', error);
    }
    return null;
}
//# sourceMappingURL=state.js.map