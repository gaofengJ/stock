'use client';

import { Select } from 'antd';
import SelectField from '@/components/SelectField';
import {
  efforts, Metadata, ModelChoice, modelNames,
} from './client';

export default function ModelControls({
  value, onChange, metadata, disabled = false,
}: {
  value: ModelChoice; onChange: (choice: ModelChoice) => void; metadata?: Metadata | null; disabled?: boolean;
}) {
  const available = metadata?.models.find((model) => model.model === value.model)?.efforts;
  return (
    <div className="personal-ai-models">
      <SelectField label="分析模型">
        <Select
          aria-label="分析模型"
          value={value.model}
          disabled={disabled}
          options={Object.entries(modelNames).map(([model, label]) => ({ value: model, label, disabled: !!metadata && !metadata.models.some((item) => item.model === model) }))}
          onChange={(model) => {
            const supported = metadata?.models.find((item) => item.model === model)?.efforts;
            let { effort } = value;
            if (supported && !supported.includes(effort)) effort = supported.includes('high') ? 'high' : supported[0];
            onChange({ model, effort: effort || 'high' });
          }}
        />
      </SelectField>
      <SelectField label="思考档位"><Select aria-label="思考档位" value={value.effort} disabled={disabled} options={efforts.map((effort) => ({ value: effort, label: effort === 'high' ? 'High（默认）' : effort.charAt(0).toUpperCase() + effort.slice(1), disabled: !!available && !available.includes(effort) }))} onChange={(effort) => onChange({ ...value, effort })} /></SelectField>
    </div>
  );
}
