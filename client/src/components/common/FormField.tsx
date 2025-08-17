import React from 'react';

interface FormFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    type?: string;
}

const FormField: React.FC<FormFieldProps> = ({
    label,
    value,
    onChange,
    placeholder = '',
    required = false,
    type = 'text'
}) => {
    return (
        <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>{label}:</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                style={{ 
                    width: '100%', 
                    padding: '8px', 
                    borderRadius: '4px', 
                    border: '1px solid #ccc', 
                    backgroundColor: '#333', 
                    color: 'white' 
                }}
            />
        </div>
    );
};

export default FormField;