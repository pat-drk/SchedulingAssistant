import React from 'react';
import { Input, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  dateInput: {
    // Style the native date input to match Fluent UI better
    '& input[type="date"], & input[type="month"]': {
      colorScheme: 'auto',
      fontFamily: tokens.fontFamilyBase,
      fontSize: tokens.fontSizeBase300,
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      borderRadius: tokens.borderRadiusMedium,
      padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM}`,
      outline: 'none',
      transition: `border-color ${tokens.durationNormal} ${tokens.curveEasyEase}`,
      ':hover': {
        borderColor: tokens.colorNeutralStroke1Hover,
      },
      ':focus': {
        borderColor: tokens.colorBrandStroke1,
        borderWidth: '2px',
        padding: `calc(${tokens.spacingVerticalSNudge} - 1px) calc(${tokens.spacingHorizontalM} - 1px)`,
      },
      ':disabled': {
        backgroundColor: tokens.colorNeutralBackground4,
        color: tokens.colorNeutralForegroundDisabled,
        borderColor: tokens.colorNeutralStrokeDisabled,
        cursor: 'not-allowed',
      },
    },
    // Dark mode support
    '@media (prefers-color-scheme: dark)': {
      '& input[type="date"], & input[type="month"]': {
        colorScheme: 'dark',
      },
    },
  },
});

interface FluentDateInputProps {
  type: 'date' | 'month';
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => void;
  disabled?: boolean;
  className?: string;
}

export default function FluentDateInput({ type, value, onChange, disabled, className }: FluentDateInputProps) {
  const styles = useStyles();
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e, { value: e.target.value });
  };

  return (
    <div className={`${styles.dateInput} ${className || ''}`}>
      <input
        type={type}
        value={value}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
