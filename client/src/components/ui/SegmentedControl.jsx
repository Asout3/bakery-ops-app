import { Radio, RadioGroup } from '@headlessui/react';
import clsx from 'clsx';
import './SegmentedControl.css';

export default function SegmentedControl({ value, onChange, options, ariaLabel }) {
  return (
    <RadioGroup
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      className="segmented-control"
    >
      <p className="sr-only">{ariaLabel}</p>
      <div className="segmented-control-track">
        {options.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            className={({ checked }) =>
              clsx('segmented-option', checked && 'segmented-option-active')
            }
          >
            {({ checked }) => (
              <span className={clsx('segmented-option-label', checked && 'segmented-option-label-active')}>
                {option.label}
              </span>
            )}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}