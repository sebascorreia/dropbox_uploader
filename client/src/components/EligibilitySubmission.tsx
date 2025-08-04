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
    const [uploading, setUploading] = useState<boolean>(false);
    const [currentUploadingDoc, setCurrentUploadingDoc] = useState<string | null>(null);
    
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


    // Upload a single document
    const uploadDocument = async (docType: string): Promise<boolean> => {
    const file = documents[docType].file;
    
    if (!file) return false;
    
    setCurrentUploadingDoc(docType);
    
    try {
        const submitData = new FormData();
        submitData.append('staff_id', staff.id.toString());
        submitData.append('address', address);
        submitData.append('postcode', postcode);
        
        // Use "documents" as file_type for all documents
        // This prevents creating separate subfolders for each document type
        submitData.append('file_type', "documents");
        
        // Create a new Blob with the file content
        const blob = file.slice(0, file.size, file.type);
        
        // Create a new File object with standardized name
        const renamedFile = new File([blob], DOCUMENT_FILENAMES[docType], { type: 'application/pdf' });
        
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
            
            // Reset file input
            const fileInput = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            
            return true;
        } else {
            alert(`Upload failed for ${DOCUMENT_LABELS[docType]}: ${result.message}`);
            return false;
        }
    } catch (error) {
        alert(`Upload error for ${DOCUMENT_LABELS[docType]}: ${(error as Error).message}`);
        return false;
    }
};
    // Upload all documents that are selected but not yet uploaded
    const uploadAllDocuments = async () => {
        if (!address || !postcode) {
            alert('Please fill in address and postcode before uploading');
            return;
        }
        
        const documentsToUpload = Object.entries(documents)
            .filter(([_, doc]) => doc.file !== null && !doc.uploaded)
            .map(([docType]) => docType);
        
        if (documentsToUpload.length === 0) {
            alert('No documents selected for upload');
            return;
        }
        
        setUploading(true);
        
        const results = [];
        
        // Upload documents one by one
        for (const docType of documentsToUpload) {
            const success = await uploadDocument(docType);
            results.push({ docType, success });
        }
        
        setUploading(false);
        setCurrentUploadingDoc(null);
        
        // Count successful uploads
        const successCount = results.filter(r => r.success).length;
        
        // Show summary
        if (successCount === documentsToUpload.length) {
            alert(`Successfully uploaded ${successCount} documents!`);
        } else {
            alert(`Uploaded ${successCount} out of ${documentsToUpload.length} documents. Please check errors and try again for failed uploads.`);
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
    const anyDocumentsSelected = Object.values(documents).some(doc => doc.file !== null && !doc.uploaded);

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#2c3e50', borderRadius: '4px', color: 'white' }}>
                <h3>Welcome, {staff.name}!</h3>
                <p><strong>Role:</strong> {staff.role}</p>
                <p><strong>Base Folder:</strong> {staff.folder_path}</p>
            </div>

            <h2 style={{ color: 'white' }}>Eligibility Documents Submission</h2>
            
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#1a2937', borderRadius: '4px', color: 'white' }}>
                <h3>Project Information</h3>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Project Address:</label>
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g., 123 Main Street, London"
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#333', color: 'white' }}
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
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#333', color: 'white' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: 'white' }}>Required Documents</h3>
                <p style={{ color: '#aaa', marginBottom: '15px' }}>Please upload all required documents in PDF format</p>

                {DOCUMENT_TYPES.map(docType => (
                    <div 
                        key={docType} 
                        style={{ 
                            marginBottom: '15px', 
                            padding: '15px', 
                            backgroundColor: documents[docType].uploaded ? '#1e3a5f' : '#282828',
                            borderRadius: '4px',
                            border: `1px solid ${documents[docType].uploaded ? '#3498db' : '#444'}`,
                            position: 'relative'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, color: 'white' }}>{DOCUMENT_LABELS[docType]}</h4>
                            {documents[docType].uploaded && (
                                <span style={{ 
                                    backgroundColor: '#3498db', 
                                    color: 'white', 
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                }}>
                                    Uploaded
                                </span>
                            )}
                            {documents[docType].file && !documents[docType].uploaded && (
                                <span style={{ 
                                    backgroundColor: '#f39c12', 
                                    color: 'white', 
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                }}>
                                    Ready
                                </span>
                            )}
                        </div>
                        
                        {/* Show loading animation when this document is being uploaded */}
                        {currentUploadingDoc === docType && (
                            <div style={{ 
                                position: 'absolute', 
                                top: 0, 
                                left: 0, 
                                width: '100%', 
                                height: '100%', 
                                backgroundColor: 'rgba(0,0,0,0.6)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                borderRadius: '4px',
                                zIndex: 2
                            }}>
                                <span style={{ color: 'white' }}>Uploading...</span>
                            </div>
                        )}
                        
                        {!documents[docType].uploaded ? (
                            <div>
                                <div style={{ display: 'flex', marginBottom: '10px' }}>
                                    <input
                                        id={`fileInput_${docType}`}
                                        type="file"
                                        accept="application/pdf"
                                        onChange={(e) => handleFileChange(docType, e.target.files?.[0] || null)}
                                        style={{ flex: 1, padding: '8px', color: 'white' }}
                                        disabled={uploading}
                                    />
                                </div>
                                
                                {documents[docType].file && (
                                    <p style={{ fontSize: '14px', color: '#aaa', margin: '5px 0' }}>
                                        Selected: {documents[docType].file.name} ({Math.round(documents[docType].file.size / 1024)} KB)
                                    </p>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => resetDocument(docType)}
                                disabled={uploading}
                                style={{
                                    padding: '5px 10px',
                                    backgroundColor: '#3498db',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: uploading ? 'not-allowed' : 'pointer',
                                    opacity: uploading ? 0.7 : 1
                                }}
                            >
                                Replace
                            </button>
                        )}
                    </div>
                ))}

                {/* Main upload button for all documents */}
                <button
                    onClick={uploadAllDocuments}
                    disabled={uploading || !anyDocumentsSelected}
                    style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: anyDocumentsSelected ? '#3498db' : '#566573',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '16px',
                        cursor: (uploading || !anyDocumentsSelected) ? 'not-allowed' : 'pointer',
                        marginTop: '15px',
                        opacity: (uploading || !anyDocumentsSelected) ? 0.7 : 1
                    }}
                >
                    {uploading ? 'Uploading Documents...' : 'Upload All Selected Documents'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                    onClick={onBack}
                    disabled={uploading}
                    style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: '#566573',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        opacity: uploading ? 0.7 : 1
                    }}
                >
                    Back
                </button>
                
                <button
                    onClick={() => alert('All required documents have been uploaded!')}
                    disabled={!allDocumentsUploaded || uploading}
                    style={{
                        flex: 2,
                        padding: '10px',
                        backgroundColor: allDocumentsUploaded ? '#27ae60' : '#566573',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: (allDocumentsUploaded && !uploading) ? 'pointer' : 'not-allowed',
                        opacity: (allDocumentsUploaded && !uploading) ? 1 : 0.7
                    }}
                >
                    Complete Submission
                </button>
            </div>
        </div>
    );
};

export default EligibilitySubmission;