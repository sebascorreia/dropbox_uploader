import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import { validateAddressInfo } from '../helpers/uiHelpers';
import { uploadFiles, checkRoleDocument } from '../helpers/apiHelpers';
import FormField from './common/FormField';
import FileUploadButton from './common/FileUploadButton';
import SubmitButton from './common/SubmitButton';
import { resetFileInput } from '../helpers/fileHelpers';
import { 
    isImageFile,
    isWordFile,
    convertImagesToPdf 
} from '../helpers/fileHelpers';


interface Staff {
    id: number;
    name: string;
    company_id: number;
    role: string;
    folder_path: string;
}

interface EPRSubmissionProps {
    staff: Staff;
    onBack: () => void;
}

// Document state interface
interface DocumentState {
    file: File | null;
    uploaded: boolean;
    uploading: boolean;
    filePath?:string;
    convert?:boolean;
}

// Define valid document types
type DocType = 'epr' | 'site_notes';
type Section = 'pre' | 'post';

const INITIAL_EPR_DOCS: DocumentsState = {
    pre: {
        epr: { file: null, uploaded: false, uploading: false,convert: true },
        site_notes: { file: null, uploaded: false, uploading: false,convert: true }
    },
    post: {
        epr: { file: null, uploaded: false, uploading: false,convert: true },
        site_notes: { file: null, uploaded: false, uploading: false,convert: true }
    }
};

// Document types organized by section
const SECTIONS = {
    pre: {
        title: "Pre-Installation",
        types: {
            epr: "EPR",
            site_notes: "Site Notes"
        }
    },
    post: {
        title: "Post-Installation",
        types: {
            epr: "EPR",
            site_notes: "Site Notes"
        }
    }
} as const;

// Define the document state structure
interface DocumentsState {
    pre: {
        epr: DocumentState;
        site_notes: DocumentState;
    };
    post: {
        epr: DocumentState;
        site_notes: DocumentState;
    };
}

const EPRSubmission: React.FC<EPRSubmissionProps> = ({ staff, onBack }) => {
    const [address, setAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [uploading, setUploading] = useState(false);
    const [loadingExistingFiles, setLoadingExistingFiles] = useState(false);
    const [documents, setDocuments] = useState<DocumentsState>(INITIAL_EPR_DOCS);
    const loadKeyRef = useRef<string>('');
    // Check for existing files when address and postcode are set
    useEffect(() => {
        const trimmedAddress = address.trim();
        const trimmedPostcode = postcode.trim();
        const key = `${trimmedAddress}|${trimmedPostcode}`.toUpperCase();

        if (!trimmedAddress || !trimmedPostcode) {
            if (loadKeyRef.current !== '') {
                loadKeyRef.current = '';
                setDocuments(INITIAL_EPR_DOCS);
            }
            return;
        }

        if (key !== loadKeyRef.current) {
            loadKeyRef.current = key;
            setDocuments(INITIAL_EPR_DOCS);
        }

        let cancelled = false;
        const checkForExistingFiles = async () => {
            setLoadingExistingFiles(true);
            try {
                const currentKey = loadKeyRef.current;
                const updated: DocumentsState = JSON.parse(JSON.stringify(INITIAL_EPR_DOCS));
                for (const section of ['pre','post'] as const) {
                    for (const docType of ['epr','site_notes'] as const) {
                        const result = await checkRoleDocument({
                            staffId: staff.id,
                            address: trimmedAddress,
                            postcode: trimmedPostcode,
                            role: 'epr',
                            section,
                            docType,
                            sectionTypes: SECTIONS
                        });
                        if (cancelled || currentKey !== loadKeyRef.current) return;
                        if (result.exists && result.filePath) {
                            updated[section][docType] = {
                                file: null,
                                uploaded: true,
                                uploading: false,
                                filePath: result.filePath,
                                convert:true
                            };
                        }
                    }
                }
                if (!cancelled && currentKey === loadKeyRef.current) {
                    setDocuments(updated);
                }
            } catch (e) {
                if (!cancelled) console.error("Error checking for existing files:", e);
            } finally {
                if (!cancelled) setLoadingExistingFiles(false);
            }
        };
        checkForExistingFiles();
        return () => { cancelled = true; };
    }, [address, postcode, staff.id, staff.role]);
    
    // Rest of your component code...
    // Handle file selection
    const handleFileChange = (section: Section, docType: DocType, file: File | null) => {
        setDocuments(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [docType]: { 
                    ...prev[section][docType],
                    file
                }
            }
        }));
    };
    // Toggle handler
    const toggleConvert = (section: Section, docType: DocType) => {
    setDocuments(prev => ({
        ...prev,
        [section]: {
        ...prev[section],
        [docType]: { ...prev[section][docType], convert: !prev[section][docType].convert }
        }
    }));
    };

    // Upload a single document
    const uploadDocument = async (section: Section, docType: DocType): Promise<boolean> => {
        const allowConversion = documents[section][docType].convert !== false;
        const docState = documents[section][docType];
        if (!docState.file) return false;
        
        // Update uploading state
        setDocuments(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [docType]: { 
                    ...prev[section][docType],
                    uploading: true
                }
            }
        }));
        
        try {
            if (!validateAddressInfo(address, postcode)) {
                alert('Please enter a valid address and postcode');
                return false;
            }
            
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', address);
            submitData.append('postcode', postcode);
            
            
            // Use the section and document type to create file_type
            const folderType = section;
            submitData.append('file_type', folderType);
            
            // Create a new file with standardized name
            const baseName = `${SECTIONS[section].types[docType].replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
            
            const file = docState.file;
            const isImg = isImageFile(file);
            const isWord = isWordFile(file);
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

            if (allowConversion && isImg) {
                // Client image -> PDF
                const pdfFile = await convertImagesToPdf([file], baseName);
                submitData.append('files', pdfFile);
            } else if (allowConversion && isWord) {
                // Server word -> PDF
                submitData.append('files', file);
                submitData.append('convert_to_pdf', 'true');
                submitData.append('output_filename', `${baseName}.pdf`);
                submitData.append('convert_files', file.name);
            } else {
                // No conversion (or already PDF)
                let finalName: string;
                if (isPdf) {
                    finalName = `${baseName}.pdf`;
                    const renamed = new File([file.slice(0, file.size, file.type)], finalName, { type: 'application/pdf' });
                    submitData.append('files', renamed);
                } else {
                    // Keep original extension for non‑converted image/word
                    const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
                    finalName = `${baseName}.${ext}`;
                    const renamed = new File([file.slice(0, file.size, file.type)], finalName, { type: file.type });
                    submitData.append('files', renamed);
                }
            }
            submitData.append('convert_user_pref', allowConversion ? 'true' : 'false');
            const result = await uploadFiles(submitData, undefined, {
                generatePath: true,
                staffId: staff.id,
                address,
                postcode,
                fileType: folderType
            });
            
            if (result.success) {
                // Update state to mark document as uploaded
                setDocuments(prev => ({
                    ...prev,
                    [section]: {
                        ...prev[section],
                        [docType]: { 
                            file: null, 
                            uploaded: true,
                            uploading: false,
                            convert:docState.convert
                        }
                    }
                }));
                
                // Reset the file input
                resetFileInput(`fileInput_${section}_${docType}`);
                
                return true;
            } else {
                alert(`Upload failed: ${result.message}`);
                return false;
            }
        } catch (error) {
            alert(`Upload error: ${(error as Error).message}`);
            return false;
        } finally {
            // Reset uploading state regardless of outcome
            setDocuments(prev => ({
                ...prev,
                [section]: {
                    ...prev[section],
                    [docType]: { 
                        ...prev[section][docType],
                        uploading: false 
                    }
                }
            }));
        }
    };

    // Upload all selected documents
    const uploadAllDocuments = async () => {
        if (!validateAddressInfo(address, postcode)) {
            alert('Please enter a valid address and postcode');
            return;
        }
        
        // Find all documents that need to be uploaded
        const documentsToUpload: Array<{section: Section, docType: DocType}> = [];

        // Add proper type annotations to the forEach callbacks
        Object.entries(documents).forEach(([section, sectionDocs]: [string, typeof documents[Section]]) => {
            Object.entries(sectionDocs).forEach(([docType, docState]: [string, DocumentState]) => {
                if (docState.file && !docState.uploaded) {
                    documentsToUpload.push({
                        section: section as Section,
                        docType: docType as DocType
                    });
                }
            });
        });
        
        if (documentsToUpload.length === 0) {
            alert('No documents selected for upload');
            return;
        }
        
        setUploading(true);
        
        const results = [];
        
        // Upload each document
        for (const { section, docType } of documentsToUpload) {
            const success = await uploadDocument(section, docType as DocType);
            results.push({ section, docType, success });
        }
        
        setUploading(false);
        
        // Show summary
        const successCount = results.filter(r => r.success).length;
        if (successCount === documentsToUpload.length) {
            alert(`Successfully uploaded ${successCount} document${successCount !== 1 ? 's' : ''}!`);
        } else {
            alert(`Uploaded ${successCount} out of ${documentsToUpload.length} document${documentsToUpload.length !== 1 ? 's' : ''}. Please check errors and try again for failed uploads.`);
        }
    };
    
    // Reset a document that was previously uploaded
    const resetDocument = async (section: Section, docType: DocType) => {
        // First, get the current document
        const docState = documents[section][docType];
        setDocuments(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [docType]: { 
                    file: null, 
                    uploaded: false,
                    uploading: false,
                    convert: prev[section][docType].convert !== false
                }
            }
        }));
         try {
            if (docState.filePath){
                    const response = await fetch(`${API_BASE_URL}/delete-file`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        staff_id: staff.id,
                        file_path: docState.filePath
                    }),
                });
                
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message);
                }
            }
            
            // Allow new file selection
            setDocuments(prev => ({
                ...prev,
                [section]: {
                    ...prev[section],
                    [docType]: { 
                        file: null, 
                        uploaded: false,
                        uploading: false 
                    }
                }
            }));
            resetFileInput(`fileInput_${section}_${docType}`);
        } catch (error) {
            console.error("Error resetting document:", error);
            alert(`Error removing file: ${(error as Error).message}`);
            
            // Reset to not uploading state if there was an error
            setDocuments(prev => ({
                ...prev,
                [section]: {
                    ...prev[section],
                    [docType]: { 
                        ...prev[section][docType],
                        uploading: false 
                    }
                }
            }));
        }
    };
        


    // Check if all documents are uploaded
    const allDocumentsUploaded = 
        documents.pre.epr.uploaded && 
        documents.pre.site_notes.uploaded && 
        documents.post.epr.uploaded && 
        documents.post.site_notes.uploaded;
    
    // Check if any documents are selected but not uploaded
    const anyDocumentsSelected = (['pre', 'post'] as const).some((section) => 
        (['epr', 'site_notes'] as const).some((docType) => {
            const doc = documents[section][docType];
            return doc.file !== null && !doc.uploaded;
        })
    );
    // Render a document upload form
    const renderDocumentForm = (section: Section, docType: DocType) => {
        const docState = documents[section][docType];
        const docLabel = SECTIONS[section].types[docType];
        
        return (
            <div 
                style={{ 
                    marginBottom: '15px', 
                    padding: '15px', 
                    backgroundColor: docState.uploaded ? '#1e3a5f' : '#282828',
                    borderRadius: '4px',
                    border: `1px solid ${docState.uploaded ? '#3498db' : '#444'}`
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, color: 'white' }}>{docLabel}</h4>
                    {docState.uploaded && (
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
                </div>
                
                {docState.uploading && (
                    <div style={{ 
                        padding: '8px', 
                        backgroundColor: 'rgba(0,0,0,0.3)', 
                        borderRadius: '4px',
                        marginBottom: '10px',
                        textAlign: 'center',
                        color: 'white'
                    }}>
                        Uploading...
                    </div>
                )}
                
                {!docState.uploaded ? (
                    <div>
                        <FileUploadButton
                            id={`fileInput_${section}_${docType}`}
                            onChange={(files) => handleFileChange(section, docType, files?.[0] || null)}
                            accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx,.docm"
                            disabled={uploading || docState.uploading}
                            label={`Select ${docLabel} File`}
                        />
                        {(() => {
                            const f = docState.file;
                            const isPdf = f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
                            // Show only if a non-PDF file selected
                            if (f && !isPdf) {
                                return (
                                    <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#ccc', fontSize:'12px', marginTop:'4px' }}>
                                        <input 
                                            type="checkbox"
                                            checked={docState.convert !== false}
                                            onChange={() => toggleConvert(section, docType)}
                                            disabled={docState.uploading}
                                        />
                                        Convert to PDF (images / Word)
                                    </label>
                                );
                            }
                            return null;
                        })()}
                        {docState.file && (
                            <p style={{ fontSize: '14px', color: '#aaa', margin: '5px 0' }}>
                                Selected: {docState.file.name} ({Math.round(docState.file.size / 1024)} KB)
                            </p>
                        )}
                        {docState.file && (
                            <SubmitButton
                                onClick={() => uploadDocument(section, docType)}
                                disabled={uploading || !docState.file || docState.uploading}
                                loading={docState.uploading}
                                loadingText="Uploading..."
                                text={`Upload ${docLabel}`}
                                style={{ 
                                    marginTop: '10px',
                                    padding: '8px',
                                    fontSize: '14px'
                                }}
                            />
                        )}
                    </div>
                ) : (
                    <SubmitButton
                        onClick={() => resetDocument(section, docType)}
                        disabled={uploading}
                        text="Replace"
                        style={{ 
                            width: 'auto', 
                            padding: '5px 10px', 
                            fontSize: '12px' 
                        }}
                    />
                )}
            </div>
        );
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#2c3e50', borderRadius: '4px', color: 'white' }}>
                <h3>Welcome, {staff.name}!</h3>
                <p><strong>Role:</strong> {staff.role}</p>
                <p><strong>Base Folder:</strong> {staff.folder_path}</p>
            </div>

            <h2 style={{ color: 'white' }}>EPR Submission</h2>
            
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#1a2937', borderRadius: '4px', color: 'white' }}>
                <h3>Project Information</h3>
                
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
                {loadingExistingFiles && (
                    <div style={{
                        marginTop: '10px', 
                        padding: '8px', 
                        backgroundColor: 'rgba(52, 152, 219, 0.2)',
                        borderRadius: '4px',
                        textAlign: 'center'
                    }}>
                        <span>Checking for existing files...</span>
                </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                {/* Pre-Installation Section */}
                <div style={{ flex: 1, backgroundColor: '#1a2937', padding: '15px', borderRadius: '4px' }}>
                    <h3 style={{ color: 'white', marginTop: 0 }}>Pre-Installation</h3>
                    
                    {renderDocumentForm('pre', 'epr')}
                    {renderDocumentForm('pre', 'site_notes')}
                </div>
                
                {/* Post-Installation Section */}
                <div style={{ flex: 1, backgroundColor: '#1a2937', padding: '15px', borderRadius: '4px' }}>
                    <h3 style={{ color: 'white', marginTop: 0 }}>Post-Installation</h3>
                    
                    {renderDocumentForm('post', 'epr')}
                    {renderDocumentForm('post', 'site_notes')}
                </div>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
                <SubmitButton
                    onClick={uploadAllDocuments}
                    disabled={!anyDocumentsSelected || uploading}
                    loading={uploading}
                    loadingText="Uploading Documents..."
                    text="Upload All Selected Documents"
                />
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
                    onClick={() => alert('All EPR documents have been submitted!')}
                    disabled={!allDocumentsUploaded || uploading}
                    text="Complete Submission"
                    style={{ 
                        flex: 2, 
                        backgroundColor: allDocumentsUploaded ? '#27ae60' : '#566573'
                    }}
                />
            </div>
        </div>
    );
};

export default EPRSubmission;