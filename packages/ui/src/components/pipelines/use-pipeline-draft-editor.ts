import {
  type DraftPipeline,
  type DraftPipelineStep,
  addDraftStep,
  patchDraftStep,
  removeDraftStep,
  moveDraftStep,
} from "@sparstrow/shared";

export function usePipelineDraftEditor({
  value,
  onChange,
}: {
  value: DraftPipeline;
  onChange: (next: DraftPipeline) => void;
}) {
  const steps: DraftPipelineStep[] = value.steps ?? [];

  const updateField = (field: keyof DraftPipeline, val: string) => {
    onChange({ ...value, [field]: val });
  };

  const setSteps = (next: DraftPipelineStep[]) => onChange({ ...value, steps: next });

  const patchStep = (i: number, patch: Partial<DraftPipelineStep>) => {
    setSteps(patchDraftStep(steps, i, patch));
  };

  const addStep = () => {
    setSteps(addDraftStep(steps));
  };

  const removeStep = (i: number) => {
    setSteps(removeDraftStep(steps, i));
  };

  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps(moveDraftStep(steps, i, dir));
  };

  return {
    steps,
    updateField,
    patchStep,
    addStep,
    removeStep,
    moveStep,
  };
}
