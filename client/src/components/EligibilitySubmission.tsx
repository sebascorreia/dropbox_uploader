import { useState } from 'react';
import API_BASE_URL from '../config';

interface Staff {
    id: number;
    name: string;
    company_id: number;
    role: string;
    folder_path: string;
}

interface EligibilitySubmissionProps {
    staff: Staff;
    onBack: () => void;
}

// Document upload state interface
interface DocumentState {
    file: File | null;
    uploaded: boolean;
}

// Available document types
const DOCUMENT_TYPES = [
    "council_tax", 
    "epr", 
    "flex_form", 
    "land_registration", 
    "nhs_referral", 
    "utility_bill", 
    "quotation"
];

const DOCUMENT_LABELS: {[key: string]: string} = {
    council_tax: "Council Tax",
    epr: "EPR",
    flex_form: "Flex Form",
    land_registration: "Land Registration",
    nhs_referral: "NHS Referral",
    utility_bill: "Utility Bill",
    quotation: "Quotation"
};
// Add standardized file names
const DOCUMENT_FILENAMES: {[key: string]: string} = {
    council_tax: "Council_Tax.pdf",
    epr: "EPR.pdf",
    flex_form: "Flex_Form.pdf",
    land_registration: "Land_Registration.pdf",
    nhs_referral: "NHS_Referral.pdf",
    utility_bill: "Utility_Bill.pdf",
    quotation: "Quotation.pdf"
};

const EligibilitySubmission: React.FC<EligibilitySubmissionProps> = ({ staff, onBack }) => {
    const [address, setAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [documents, setDocuments] = useState<{[key: string]: DocumentState}>({
        council_tax: { file: null, uploaded: false },
        epr: { file: null, uploaded: false },
        flex_form: { file: null, uploaded: false },
        land_registration: { file: null, uploaded: false },
        nhs_referral: { file: null, uploaded: false },
        utility_bill: { file: null, uploaded: false },
        quotation: { file: null, uploaded: false }
    });
    const [uploading, setUploading] = useState<string | null>(null); // Tracks which document is being uploaded
    
    const isDuplicateFile = (docType: string, file: File | null): boolean => {
        if (!file) return false;
        
        // Generate a unique file identifier using name and size
        const fileIdentifier = `${file.name}_${file.size}`;
        
        // Check all other document types for this file
        for (const type of DOCUMENT_TYPES) {
            if (type === docType) continue; // Skip the current document type
            
            const existingFile = documents[type].file;
            if (existingFile) {
                const existingIdentifier = `${existingFile.name}_${existingFile.size}`;
                if (fileIdentifier === existingIdentifier) {
                    return true;
                }
            }
        }
        
        return false;
    };
    const handleFileChange = (docType: string, file: File | null) => {
        if (!file) {
            setDocuments(prev => ({
                ...prev,
                [docType]: { ...prev[docType], file: null }
            }));
            return;
        }
        
        // Check if the file is a PDF
        if (!file.type.includes('pdf')) {
            alert('Please upload PDF files only');
            return;
        }
        
        // Check if file is already selected for another document
        if (isDuplicateFile(docType, file)) {
            alert('This file is already selected for another document. Each document must have a unique file.');
            
            // Reset the file input
            const fileInput = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            
            return;
        }
        
        // File is valid and unique, update state
        setDocuments(prev => ({
            ...prev,
            [docType]: { ...prev[docType], file }
        }));
    };


    const validateFile = (file: File | null): boolean => {
            if (!file) return false;
            
            // Check if file is PDF (double-checking)
            if (!file.type.includes('pdf')) {
                alert('Please upload PDF files only');
                return false;
            }
            
            return true;
        };

    const uploadDocument = async (docType: string) => {
        const file = documents[docType].file;
        
        if (!validateFile(file) || !address || !postcode) {
            alert('Please fill in address, postcode and select a valid PDF file');
            return;
        }
        if (isDuplicateFile(docType, file)) {
            alert('This file is already selected for another document. Each document must have a unique file.');
            return;
        }
        setUploading(docType);

        try {
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', address);
            submitData.append('postcode', postcode);
            submitData.append('file_type', docType); // Using document type as file_type
            submitData.append('files', file!);

            // Create a new file with standardized name but same content
            const standardizedName = DOCUMENT_FILENAMES[docType];
            const fileContent = file!;
            
            // Create a new Blob with the file content
            const blob = fileContent.slice(0, fileContent.size, fileContent.type);
            
            // Create a new File object with standardized name
            const renamedFile = new File([blob], standardizedName, { type: 'application/pdf' });
            
            // Append the renamed file
            submitData.append('files', renamedFile);

            const response = await fetch(`${API_BASE_URL}/submit-files`, {
                method: 'POST',
                credentials: 'include',
                body: submitData,
            });

            const result = await response.json();

            if (result.success) {
                // Mark as uploaded and clear file input
                setDocuments(prev => ({
                    ...prev,
                    [docType]: { file: null, uploaded: true }
                }));
                
                alert(`${DOCUMENT_LABELS[docType]} uploaded successfully as ${standardizedName}!`);
                
                // Reset file input
                const fileInput = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            } else {
                alert(`Upload failed: ${result.message}`);
            }
        } catch (error) {
            alert(`Upload error: ${(error as Error).message}`);
        } finally {
            setUploading(null);
        }
    };

    const resetDocument = (docType: string) => {
        setDocuments(prev => ({
            ...prev,
            [docType]: { file: null, uploaded: false }
        }));
        
        // Reset file input
        const fileInput = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    };

    const allDocumentsUploaded = Object.values(documents).every(doc => doc.uploaded);

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#2c3e50', borderRadius: '4px', color: 'white' }}>
                <h3>Welcome, {staff.name}!</h3>
                <p><strong>Role:</strong> {staff.role}</p>
                <p><strong>Base Folder:</strong> {staff.folder_path}</p>
            </div>

            <h2>Eligibility Documents Submission</h2>
            
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#646cffaa', borderRadius: '4px' }}>
                <h3>Project Information</h3>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Project Address:</label>
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g., 123 Main Street, London"
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Postcode:</label>
                    <input
                        type="text"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                        placeholder="e.g., SW1A 1AA"
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <h3>Required Documents</h3>
                <p style={{ color: '#666', marginBottom: '15px' }}>Please upload all required documents in PDF format</p>

                {DOCUMENT_TYPES.map(docType => (
                    <div 
                        key={docType} 
                        style={{ 
                            marginBottom: '15px', 
                            padding: '15px', 
                            backgroundColor: documents[docType].uploaded ? '#646cffaa' : '#f8f9fa',
                            borderRadius: '4px',
                            border: `1px solid ${documents[docType].uploaded ? '#c3e6cb' : '#ddd'}`
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0 }}>{DOCUMENT_LABELS[docType]}</h4>
                            {documents[docType].uploaded && (
                                <span style={{ 
                                    backgroundColor: '#646cffaa', 
                                    color: 'white', 
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                }}>
                                    Uploaded
                                </span>
                            )}
                        </div>
                        
                        {!documents[docType].uploaded ? (
                            <div>
                                <div style={{ display: 'flex', marginBottom: '10px' }}>
                                    <input
                                        id={`fileInput_${docType}`}
                                        type="file"
                                        accept="application/pdf"
                                        onChange={(e) => handleFileChange(docType, e.target.files?.[0] || null)}
                                        style={{ flex: 1, padding: '8px' }}
                                    />
                                </div>
                                
                                {documents[docType].file && (
                                    <p style={{ fontSize: '14px', color: '#666', margin: '5px 0' }}>
                                        Selected: {documents[docType].file.name} ({Math.round(documents[docType].file.size / 1024)} KB)
                                    </p>
                                )}
                                
                                <button
                                    onClick={() => uploadDocument(docType)}
                                    disabled={uploading !== null || !documents[docType].file}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#646cffaa',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: (uploading !== null || !documents[docType].file) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {uploading === docType ? 'Uploading...' : 'Upload Document'}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => resetDocument(docType)}
                                style={{
                                    padding: '5px 10px',
                                    backgroundColor: '#646cffaa',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                }}
                            >
                                Replace
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                    onClick={onBack}
                    style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#646cffaa',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Back
                </button>
                
                <button
                    onClick={() => alert('All required documents have been uploaded!')}
                    disabled={!allDocumentsUploaded}
                    style={{
                        flex: 2,
                        padding: '10px',
                        backgroundColor: allDocumentsUploaded ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: allDocumentsUploaded ? 'pointer' : 'not-allowed',
                        opacity: allDocumentsUploaded ? 1 : 0.7
                    }}
                >
                    Complete Submission
                </button>
            </div>
        </div>
    );
};

export default EligibilitySubmission;