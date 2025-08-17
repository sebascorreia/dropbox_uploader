import React, { useState } from 'react';
import FormField from './common/FormField';
import FileUploadButton from './common/FileUploadButton';
import SubmitButton from './common/SubmitButton';
import { uploadFiles } from '../helpers/apiHelpers';
import { resetFileInput } from '../helpers/fileHelpers';
import { validateAddressInfo } from '../helpers/uiHelpers';

interface Staff {
    id: number;
    name: string;
    company_id: number;
    role: string;
    folder_path: string;
}

interface FileSubmissionProps {
    staff: Staff;
    onBack: () => void;
}

const FileSubmission: React.FC<FileSubmissionProps> = ({ staff, onBack }) => {
    const [address, setAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [fileType, setFileType] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (selectedFiles: FileList | null) => {
        setFiles(selectedFiles);
    };

    const handleSubmit = async () => {
        if (!files || files.length === 0) {
            alert('Please select files to upload');
            return;
        }
        
        if (!validateAddressInfo(address, postcode)) {
            alert('Please fill in address and postcode');
            return;
        }
        
        if (!fileType) {
            alert('Please select a file type');
            return;
        }

        setUploading(true);

        try {
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', address);
            submitData.append('postcode', postcode);
            submitData.append('file_type', fileType);

            Array.from(files).forEach(file => {
                submitData.append('files', file);
            });

            const result = await uploadFiles(submitData, undefined, {
                generatePath: true,
                staffId: staff.id,
                address,
                postcode,
                fileType
            });

            if (result.success) {
                alert(`Files uploaded successfully!\nFolder: ${result.folder_path}\nFiles: ${result.files.join(', ')}`);
                
                setFiles(null);
                resetFileInput('fileInput');
                
                // Optionally reset form
                setFileType('');
            } else {
                alert('Upload failed: ' + result.message);
            }
        } catch (error) {
            alert('Upload error: ' + (error as Error).message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#2c3e50', borderRadius: '4px', color: 'white' }}>
                <h3>Welcome, {staff.name}!</h3>
                <p><strong>Role:</strong> {staff.role}</p>
                <p><strong>Base Folder:</strong> {staff.folder_path}</p>
            </div>

            <h2 style={{ color: 'white' }}>Submit Project Files</h2>
            
            <div style={{ backgroundColor: '#1a2937', padding: '20px', borderRadius: '4px', marginBottom: '20px' }}>
                <FormField
                    label="Project Address"
                    value={address}
                    onChange={setAddress}
                    placeholder="e.g., 123 Main Street, London"
                    required={true}
                />

                <FormField
                    label="Postcode"
                    value={postcode}
                    onChange={setPostcode}
                    placeholder="e.g., SW1A 1AA"
                    required={true}
                />

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>File Type:</label>
                    <select
                        value={fileType}
                        onChange={(e) => setFileType(e.target.value)}
                        required
                        style={{ 
                            width: '100%', 
                            padding: '8px', 
                            borderRadius: '4px', 
                            border: '1px solid #ccc',
                            backgroundColor: '#333',
                            color: 'white'
                        }}
                    >
                        <option value="">Select File Type</option>
                        <option value="photos">Photos</option>
                        <option value="documents">Documents</option>
                        <option value="reports">Reports</option>
                        <option value="certificates">Certificates</option>
                        <option value="drawings">Drawings</option>
                    </select>
                </div>

                <FileUploadButton
                    id="fileInput"
                    onChange={handleFileChange}
                    multiple={true}
                    label="Select Files"
                    disabled={uploading}
                />
                
                {files && (
                    <p style={{ fontSize: '14px', color: '#aaa', margin: '5px 0' }}>
                        {files.length} file(s) selected
                    </p>
                )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <SubmitButton
                    onClick={onBack}
                    disabled={uploading}
                    text="Back"
                    style={{ 
                        flex: 1, 
                        backgroundColor: '#566573'
                    }}
                />
                
                <SubmitButton
                    onClick={handleSubmit}
                    disabled={uploading || !files}
                    loading={uploading}
                    loadingText="Uploading..."
                    text="Upload Files"
                    style={{ 
                        flex: 2, 
                        backgroundColor: '#27ae60'
                    }}
                />
            </div>
        </div>
    );
};

export default FileSubmission;