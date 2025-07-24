import React, { useState } from 'react';

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
    const [formData, setFormData] = useState({
        address: '',
        postcode: '',
        file_type: ''
    });
    const [files, setFiles] = useState<FileList | null>(null);
    const [uploading, setUploading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!files || files.length === 0) {
            alert('Please select files to upload');
            return;
        }

        setUploading(true);

        try {
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', formData.address);
            submitData.append('postcode', formData.postcode);
            submitData.append('file_type', formData.file_type);

            // Add all selected files
            Array.from(files).forEach(file => {
                submitData.append('files', file);
            });

            const response = await fetch('http://localhost:5000/submit-files', {
                method: 'POST',
                credentials:'include',
                body: submitData,
            });

            const result = await response.json();

            if (result.success) {
                alert(`Files uploaded successfully!\nFolder: ${result.folder_path}\nFiles: ${result.files.join(', ')}`);
                
                // Reset form
                setFiles(null);
                (document.getElementById('fileInput') as HTMLInputElement).value = '';
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
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#2c3e50', borderRadius: '4px' }}>
                <h3>Welcome, {staff.name}!</h3>
                <p><strong>Role:</strong> {staff.role}</p>
                <p><strong>Base Folder:</strong> {staff.folder_path}</p>
            </div>

            <h2>Submit Project Files</h2>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Project Address:</label>
                    <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="e.g., 123 Main Street, London"
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Postcode:</label>
                    <input
                        type="text"
                        value={formData.postcode}
                        onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
                        placeholder="e.g., SW1A 1AA"
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>File Type:</label>
                    <select
                        value={formData.file_type}
                        onChange={(e) => setFormData({ ...formData, file_type: e.target.value })}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value="">Select File Type</option>
                        <option value="photos">Photos</option>
                        <option value="documents">Documents</option>
                        <option value="reports">Reports</option>
                        <option value="certificates">Certificates</option>
                        <option value="drawings">Drawings</option>
                    </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Select Files:</label>
                    <input
                        id="fileInput"
                        type="file"
                        multiple
                        onChange={(e) => setFiles(e.target.files)}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    {files && <p style={{ fontSize: '14px', color: '#666' }}>
                        {files.length} file(s) selected
                    </p>}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            flex: 1,
                            padding: '10px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Back
                    </button>
                    
                    <button
                        type="submit"
                        disabled={uploading || !files}
                        style={{
                            flex: 2,
                            padding: '10px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: uploading || !files ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {uploading ? 'Uploading...' : 'Upload Files'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default FileSubmission;