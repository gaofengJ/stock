'use client';

import { cloneElement, ReactElement, useId } from 'react';
import './select-field.css';

/** A persistent label for standalone Select filters. Form.Item owns form labels. */
export default function SelectField({ label, children }: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const generatedId = useId();
  const id = children.props.id || `select-field-${generatedId}`;
  return (
    <div className="select-field">
      <label className="select-field-label" htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
