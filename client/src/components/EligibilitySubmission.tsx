import { useState, useEffect, useRef } from 'react';
import { convertImagesToPdf } from '../helpers/fileHelpers';
import { uploadFiles, checkRoleDocument, checkExistingFiles, generatePath } from '../helpers/apiHelpers';
import FormField from './common/FormField';
import FileUploadButton from '../components/common/FileUploadButton';
import SubmitButton from '../components/common/SubmitButton';


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
    filePath?:string;
    convert?: boolean;
}
const INITIAL_DOCUMENTS: {[key:string]: DocumentState} = {
  council_tax: { file: null, uploaded: false, convert: true },
  epr: { file: null, uploaded: false, convert: true },
  flex_form: { file: null, uploaded: false, convert: true },
  land_registration: { file: null, uploaded: false, convert: true },
  nhs_referral: { file: null, uploaded: false, convert: true },
  utility_bill: { file: null, uploaded: false, convert: true },
  nhs_trail: { file: null, uploaded: false, convert: true },
  la_declaration: {file:null, uploaded:false, convert:true}
};

// Available document types
const DOCUMENT_TYPES = [
    "council_tax", 
    "epr", 
    "flex_form", 
    "land_registration", 
    "nhs_referral", 
    "utility_bill", 
    "nhs_trail",
    "la_declaration",
];

const DOCUMENT_LABELS: {[key: string]: string} = {
    council_tax: "Council Tax",
    epr: "EPR",
    flex_form: "Flex Form",
    land_registration: "Land Registration",
    nhs_referral: "NHS Referral",
    utility_bill: "Utility Bill",
    nhs_trail: "NHS Trail",
    la_declaration:"LA Declaration",

};

// Add standardized file names
const DOCUMENT_FILENAMES: {[key: string]: string} = {
    council_tax: "Council_Tax.pdf",
    epr: "EPR.pdf",
    flex_form: "Flex_Form.pdf",
    land_registration: "Land_Registration.pdf",
    nhs_referral: "NHS_Referral.pdf",
    utility_bill: "Utility_Bill.pdf",
    nhs_trail: "NHS_Trail.pdf",
    la_declaration:"LA_Declaration.pdf",
};

const EligibilitySubmission: React.FC<EligibilitySubmissionProps> = ({ staff, onBack }) => {
    const [address, setAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [loadingExistingFiles, setLoadingExistingFiles] = useState(false);
    const [documents, setDocuments] = useState<{[key: string]: DocumentState}>(INITIAL_DOCUMENTS);
    const loadKeyRef = useRef<string>('');
    const [uploading, setUploading] = useState<boolean>(false);
    const [currentUploadingDoc, setCurrentUploadingDoc] = useState<string | null>(null);
    const [eligibilityFiles, setEligibilityFiles] = useState<{ [docType: string]: string[] }>({});
    useEffect(() => {
        const trimmedAddress = address.trim();
        const trimmedPostcode = postcode.trim();
        const key = `${trimmedAddress}|${trimmedPostcode}`.toUpperCase();

        if (!trimmedAddress || !trimmedPostcode) {
            if (loadKeyRef.current !== '') {
                loadKeyRef.current = '';
                setDocuments(INITIAL_DOCUMENTS);
            }
            return;
        }

        if (key !== loadKeyRef.current) {
            loadKeyRef.current = key;
            setDocuments(INITIAL_DOCUMENTS);
        }

        let cancelled = false;
        const checkForExistingFiles = async () => {
            setLoadingExistingFiles(true);
            try {
                const currentKey = loadKeyRef.current;
                const updated = { ...INITIAL_DOCUMENTS };
                for (const docType of DOCUMENT_TYPES) {
                    const result = await checkRoleDocument({
                        staffId: staff.id,
                        address: trimmedAddress,
                        postcode: trimmedPostcode,
                        role: 'eligibility',
                        docType,
                        documentLabels: DOCUMENT_LABELS
                    });
                    if (cancelled || currentKey !== loadKeyRef.current) return;
                    if (result.exists && result.filePath) {
                        updated[docType] = { file: null, uploaded: true, filePath: result.filePath };
                    }
                }
                if (currentKey === loadKeyRef.current && !cancelled) {
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
    }, [address, postcode, staff.id]);

useEffect(() => {
    const fetchEligibilityFiles = async () => {
        if (!address || !postcode) {
            setEligibilityFiles({});
            return;
        }
        try {
            // Get the correct folder path from the backend
            const folderPath = await generatePath(staff.id, address.trim(), postcode.trim(), "");
            const filesObj = await checkExistingFiles(folderPath, staff.id);

            // Get all files in the folder (usually under one key)
            const allFiles = Object.values(filesObj).flat();

            // Group files by docType label
            const grouped: { [docType: string]: string[] } = {};
            for (const docType of DOCUMENT_TYPES) {
                const label = DOCUMENT_LABELS[docType].replace(/\s+/g, '_');
                grouped[docType] = allFiles.filter(name =>
                    name.toUpperCase().startsWith(label.toUpperCase())
                );
            }
            setEligibilityFiles(grouped);
        } catch (e) {
            setEligibilityFiles({});
        }
    };
    fetchEligibilityFiles();
}, [address, postcode, staff.id]);
    
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
    // Toggle handler (only flex_form allowed to change)
        const toggleConvert = (docType: string) => {
        if (docType !== 'flex_form') return;
        setDocuments(prev => ({
            ...prev,
            [docType]: { ...prev[docType], convert: !prev[docType].convert }
        }));
        };

    const handleFileChange = (docType: string, file: File | null) => {
        if (!file) {
            setDocuments(prev => ({
                ...prev,
                [docType]: { ...prev[docType], file: null }
            }));
            return;
        }
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isWord = /\.(doc|docx|docm)$/i.test(file.name);
        // Check if the file is a PDF
        if (docType !== 'flex_form' && !isPdf) {
            alert('Please upload PDF files only (Flex Form can be Word or PDF).');
            const input = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
            if (input) input.value = '';
            return;
        }
        // Flex form must be PDF or Word
        if (docType === 'flex_form' && !(isPdf || isWord)) {
            alert('Flex Form must be a PDF or Word document (.doc/.docx).');
            const input = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
            if (input) input.value = '';
            return;
        }
        
        // Check if file is already selected for another document
        if (isDuplicateFile(docType, file)) {
            alert('This file is already selected for another document.');
            const input = document.getElementById(`fileInput_${docType}`) as HTMLInputElement;
            if (input) input.value = '';
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
        const doc = documents[docType];
        
        if (!file) return false;
        
        setCurrentUploadingDoc(docType);
        
        try {
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', address);
            submitData.append('postcode', postcode);
            submitData.append('file_type', "");// eligibility root

            const wantsConversion = docType === 'flex_form' ? doc.convert !== false : true;
            let targetName = DOCUMENT_FILENAMES[docType];
            let uploadFile: File | null = file; // may be replaced
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            const isWord = /\.(doc|docx|docm)$/i.test(file.name);

            if (docType === 'flex_form') {
                if (isPdf) {
                    uploadFile = new File([file], 'Flex_Form.pdf', { type: 'application/pdf' });
                } else if (isWord) {
                    if (wantsConversion) {
                        // Append original Word file (server converts)
                        submitData.append('files', file);
                        submitData.append('convert_to_pdf', 'true');
                        submitData.append('output_filename', 'Flex_Form.pdf');
                        submitData.append('convert_files', file.name);
                        uploadFile = null; // already appended original
                    } else {
                        const ext = file.name.split('.').pop();
                        uploadFile = new File([file], `Flex_Form.${ext}`, { type: file.type });
                    }
                } else {
                    alert('Flex Form must be PDF or Word');
                    return false;
                }
            } else {
                if (!isPdf) {
                    // Append original file for server conversion
                    submitData.append('files', file);
                    submitData.append('convert_to_pdf', 'true');
                    submitData.append('output_filename', targetName);
                    submitData.append('convert_files', file.name);
                    uploadFile = null; // already appended
                } else {
                    uploadFile = new File([file], targetName, { type: 'application/pdf' });
                }
            }

            // Add user preference
            submitData.append('convert_user_pref', wantsConversion ? 'true' : 'false');

            if (uploadFile) {
                const blob = uploadFile.slice(0, uploadFile.size, uploadFile.type);
                const standardized = new File([blob], uploadFile.name, { type: uploadFile.type });
                submitData.append('files', standardized);
            }

            // Use the helper function for file upload
            const result = await uploadFiles(submitData, undefined, {
                generatePath: true,
                staffId: staff.id,
                address,
                postcode,
                fileType: "" // root
            });


            if (result.success) {
                setDocuments(prev => ({
                    ...prev,
                    [docType]: {
                        file: null,
                        uploaded: true,
                        filePath: result.files && result.files[0] ? `${result.folder_path}/${result.files[0]}` : undefined,
                        convert: doc.convert
                    }
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
        } finally {
            setCurrentUploadingDoc(null);
        }
    };
    // ...existing code...
const handleMergeFiles = async (docType: string) => {
    const fileNames = eligibilityFiles[docType] || [];
    if (fileNames.length < 2) {
        alert('Need at least two files to merge.');
        return;
    }
    if (!address.trim() || !postcode.trim()) {
        alert('Enter address and postcode first.');
        return;
    }
    try {
        setUploading(true);
        const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000';
        const res = await fetch(`${API_BASE}/merge-pdfs-server`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                staff_id: staff.id,
                address: address.trim(),
                postcode: postcode.trim(),
                file_names: fileNames,
                output_filename: `${DOCUMENT_LABELS[docType].replace(/\s+/g,'_')}_Merged.pdf`
            })
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.message || 'Merge failed');
        }
        alert('Merged PDF uploaded successfully');
        // Refresh list
        const folderPath = await generatePath(staff.id, address.trim(), postcode.trim(), "");
        const filesObj = await checkExistingFiles(folderPath, staff.id);
        const allFiles = Object.values(filesObj).flat();
        const grouped: { [k: string]: string[] } = {};
        for (const dt of DOCUMENT_TYPES) {
            const label = DOCUMENT_LABELS[dt].replace(/\s+/g, '_');
            grouped[dt] = allFiles.filter(n => n.toUpperCase().startsWith(label.toUpperCase()));
        }
        setEligibilityFiles(grouped);
    } catch (e:any) {
        alert('Error merging files: ' + (e.message || e));
    } finally {
        setUploading(false);
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
            [docType]: { 
                file: null, 
                uploaded: false,
                convert: prev[docType].convert !== false  // preserve flex_form choice
            }
        }));
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
                
                {/* Replace with FormField components */}
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
                
                {/* Add loading indicator here */}
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
                                <div>
                                    <span style={{ 
                                        backgroundColor: '#3498db', 
                                        color: 'white', 
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        marginRight: '8px'
                                    }}>
                                        Uploaded
                                    </span>
                                    <ul style={{ margin: '8px 0 0 0', padding: 0, listStyle: 'none', color: '#b3e5fc', fontSize: '13px' }}>
                                        {(eligibilityFiles[docType] || []).length > 0 ? (
                                            eligibilityFiles[docType].map(fileName => (
                                                <li key={fileName} style={{ marginBottom: 2 }}>
                                                    <span style={{ color: '#b3e5fc' }}>{fileName}</span>
                                                </li>
                                            ))
                                        ) : (
                                            <li style={{ color: '#777', fontStyle: 'italic' }}>No files</li>
                                        )}
                                    </ul>
                                </div>
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
                                <FileUploadButton
                                    id={`fileInput_${docType}`}
                                    onChange={(files) => handleFileChange(docType, files?.[0] || null)}
                                    accept={docType === 'flex_form'
                                        ? "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx,.docm"
                                        : "application/pdf"}
                                    disabled={uploading}
                                    label={`Select ${DOCUMENT_LABELS[docType]} File`}
                                />
                                {(() => {
                                    const f = documents[docType].file;
                                    const isPdf = f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
                                    // Show checkbox only for flex_form when a non-PDF (Word) file is selected
                                    if (docType === 'flex_form' && f && !isPdf) {
                                        return (
                                            <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#ccc', fontSize:'12px', marginTop:'6px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={documents[docType].convert !== false}
                                                    onChange={() => toggleConvert(docType)}
                                                    disabled={documents[docType].uploaded || uploading || !documents[docType].file}
                                                />
                                                Convert to PDF (optional)
                                            </label>
                                        );
                                    }
                                    return null;
                                })()}
                                {documents[docType].file && (
                                    <p style={{ fontSize: '14px', color: '#aaa', margin: '5px 0' }}>
                                        Selected: {documents[docType].file.name} ({Math.round(documents[docType].file.size / 1024)} KB)
                                    </p>
                                )}
                            </div>
                        ) : (
                            <SubmitButton
                                onClick={() => resetDocument(docType)}
                                disabled={uploading}
                                text="Replace"
                                style={{ 
                                    width: 'auto', 
                                    padding: '5px 10px', 
                                    fontSize: '12px' 
                                }}
                            />
                            
                        )}
                        {(eligibilityFiles[docType] || []).length > 1 && (
                                    <SubmitButton
                                        onClick={() => handleMergeFiles(docType)}
                                        disabled={uploading}
                                        text="Merge"
                                        style={{ 
                                            width: 'auto', 
                                            padding: '5px 10px', 
                                            fontSize: '12px',
                                            marginLeft: '8px',
                                            backgroundColor: '#27ae60'
                                        }}
                                    />
                                    )}
                        
                    </div>
                ))}

                {/* Replace with SubmitButton component */}
                <SubmitButton
                    onClick={uploadAllDocuments}
                    disabled={!anyDocumentsSelected || uploading}
                    loading={uploading}
                    loadingText="Uploading Documents..."
                    text="Upload All Selected Documents"
                    style={{ marginTop: '15px' }}
                />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                {/* Replace with SubmitButton components */}
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
                    onClick={() => alert('All required documents have been uploaded!')}
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

export default EligibilitySubmission;