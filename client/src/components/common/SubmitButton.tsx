import React from 'react';

interface SubmitButtonProps {
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    loadingText?: string;
    text: string;
    style?: React.CSSProperties;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({
    onClick,
    disabled = false,
    loading = false,
    loadingText = 'Loading...',
    text,
    style = {}
}) => {
    const isDisabled = disabled || loading;
    
    return (
        <button
            onClick={onClick}
            disabled={isDisabled}
            style={{
                width: '100%',
                padding: '12px',
                backgroundColor: isDisabled ? '#566573' : '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.7 : 1,
                ...style
            }}
        >
            {loading ? loadingText : text}
        </button>
    );
};

export default SubmitButton;