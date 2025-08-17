import React from 'react';
import type { RefObject } from 'react';
interface FileUploadButtonProps {
  id: string;
  onChange: (files: FileList | null) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}
const FileUploadButton: React.FC<FileUploadButtonProps> = ({
    id,
    onChange,
    accept = '*/*',
    multiple = false,
    disabled = false,
    label = 'Select Files',
    inputRef
}) => {
    return (
        <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', color: 'white', marginBottom: '5px' }}>
                {label}:
            </label>
            <input
                id={id}
                ref={inputRef}
                type="file"
                multiple={multiple}
                accept={accept}
                onChange={(e) => onChange(e.target.files)}
                style={{ 
                    width: '100%', 
                    padding: '8px', 
                    color: 'white', 
                    backgroundColor: '#333', 
                    borderRadius: '4px' 
                }}
                disabled={disabled}
            />
        </div>
    );
};

export default FileUploadButton;