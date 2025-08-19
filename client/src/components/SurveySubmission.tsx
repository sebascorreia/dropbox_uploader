import React, { useState, useEffect, useRef } from 'react';

import type { FileGroup } from '../helpers/fileHelpers';
import { 
    getFileExtension, 
    areAllFilesImages, 
    areAllFilesWord,
    isWordFile,
    convertImagesToPdf, 
    generateSmartFileNames 
} from '../helpers/fileHelpers';
import { 
    checkExistingFiles, 
    deleteUploadedFiles as apiDeleteUploadedFiles,
    uploadFiles,
    generatePath
} from '../helpers/apiHelpers';
import FormField from './common/FormField';
import FileUploadButton from './common/FileUploadButton';
import SubmitButton from './common/SubmitButton';



interface Staff {
    id: number;
    name: string;
    company_id: number;
    role: string;
    folder_path: string;
}

interface SurveySubmissionProps {
    staff: Staff;
    onBack: () => void;
}
interface ConflictingGroup {
    groupId: number;
    docType: string;
    fileName: string;
}

const SHARED_ELIGIBILITY_TYPES = [
    "council_tax",
    "flex_form",
    "land_registration",
    "nhs_referral",
    "utility_bill",
    "la_declaration"
];


// Group document types into logical categories
const DOCUMENT_CATEGORIES = {
    "Property Documents": ["land_registration","freehold","deed"],
    "Utility Documents": ["utility_bill","council_tax"],
    "Personal Documents": ["id","passport"],
    "Flex evidences": ["medical_evidence","nhs_referral","universal_credit","bank_statements"],
    "Forms": ["la_declaration","consent_form","privacy_notice","ventilation_declaration",
        "survey_details_form","flex_form","submission_confirmation","quotation"],
    "Blue Prints": ["blue_prints"]
};

// Document labels for display
const DOCUMENT_LABELS: {[key: string]: string} = {
    land_registration: "Land Registration",
    utility_bill: "Utility Bill",
    council_tax: "Council Tax",
    nhs_referral: "NHS Referral",
    la_declaration: "LA Declaration",
    consent_form: "Consent Form",
    ventilation_declaration: "Ventilation Declaration",
    survey_details_form: "Survey Details Form",
    freehold: "Freehold",
    deed: "Deed",
    medical_evidence: "Medical Evidence",
    universal_credit: "Universal Credit Payments",
    id: "ID",
    passport: "Passport",
    blue_prints: "Blueprints",
    submission_confirmation: "Submission Confirmation",
    bank_statements: "Bank Statements",
    flex_form: "Flex Form"
};

const SurveySubmission: React.FC<SurveySubmissionProps> = ({ staff, onBack }) => {
    const docFileInputRef = useRef<HTMLInputElement>(null);
    const pictureFileInputRef = useRef<HTMLInputElement>(null);
    
    const [address, setAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [activeTab, setActiveTab] = useState<'documents'|'pictures'>('documents');
    const [fileGroups, setFileGroups] = useState<FileGroup[]>([]);
    const [pictureFiles, setPictureFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadedPictures, setUploadedPictures] = useState<boolean>(false);
    const [uploadedPicturePaths, setUploadedPicturePaths] = useState<string[]>([]);
    const [nextGroupId, setNextGroupId] = useState(1);
    const [existingFiles, setExistingFiles] = useState<{[key: string]: string[]}>({});
    const [createdFileNames, setCreatedFileNames] = useState<string[]>([]);
    const [loadingExistingFiles, setLoadingExistingFiles] = useState(false);
    const [originalFiles, setOriginalFiles] = useState<Map<number, File[]>>(new Map());
    const loadKeyRef = useRef<string>('');
    const _uploadedPictureCount = uploadedPicturePaths.length;


    // Add this useEffect hook to load files when address/postcode changes
   useEffect(() => {
        const trimmedAddress = address.trim();
        const trimmedPostcode = postcode.trim();
        const key = `${trimmedAddress}|${trimmedPostcode}`.toUpperCase();

        // If either field empty -> clear everything
        if (!trimmedAddress || !trimmedPostcode) {
            if (loadKeyRef.current !== '') {
                loadKeyRef.current = '';
                setFileGroups([]);
                setExistingFiles({});
                setUploadedPictures(false);
                setUploadedPicturePaths([]);
            }
            return;
        }

        // New combination: clear previous immediately (UI should blank out)
        if (key !== loadKeyRef.current) {
            loadKeyRef.current = key;
            setFileGroups([]);
            setExistingFiles({});
            setUploadedPictures(false);
            setUploadedPicturePaths([]);
        }

        let cancelled = false;
        const loadExistingFiles = async () => {
            setLoadingExistingFiles(true);
            try {
                const currentKey = loadKeyRef.current;

                const documentsPath = await generatePath(staff.id, trimmedAddress, trimmedPostcode, 'documents');
                const existingFilesList = await checkExistingFiles(documentsPath, staff.id);
                // Guard against race
                if (cancelled || currentKey !== loadKeyRef.current) return;

                setExistingFiles(existingFilesList);

                if (existingFilesList.documents?.length > 0) {
                    const documentGroups = processExistingFiles(existingFilesList.documents, documentsPath);
                    if (documentGroups.length > 0) {
                        setFileGroups(prev => {
                            // If key changed while waiting, abort
                            if (currentKey !== loadKeyRef.current) return prev;
                            const filtered = prev.filter(g => !documentGroups.some(ng => ng.type === g.type && ng.category === g.category));
                            return [...filtered, ...documentGroups];
                        });
                        setNextGroupId(prev => prev + documentGroups.length);
                    }
                }

                const picturesPath = await generatePath(staff.id, trimmedAddress, trimmedPostcode, 'pictures');
                const picturesFiles = await checkExistingFiles(picturesPath, staff.id);
                if (cancelled || currentKey !== loadKeyRef.current) return;
                if (picturesFiles.pictures?.length > 0) {
                    setUploadedPictures(true);
                    setUploadedPicturePaths(picturesFiles.pictures.map(n => `${picturesPath}/${n}`));
                }
            } catch (e) {
                if (!cancelled) console.error("Error loading existing files:", e);
            } finally {
                if (!cancelled) setLoadingExistingFiles(false);
            }
        };
        loadExistingFiles();

        return () => { cancelled = true; };
    }, [address, postcode, staff.id]);

    const processExistingFiles = (files: string[], basePath: string) => {
        // Group files by document type
        const documentGroups = new Map<string, string[]>();
        
        files.forEach((fileName: string) => {
            // Try to determine document type from filename
            let matchedType = '';
            let matchedCategory = '';
            
            // Check each document type
            Object.entries(DOCUMENT_LABELS).forEach(([type, label]) => {
                const normalizedLabel = label.replace(/\s+/g, '_');
                if (fileName.toUpperCase().startsWith(normalizedLabel.toUpperCase())) {
                    matchedType = type;
                    
                    // Find the category this document type belongs to
                    Object.entries(DOCUMENT_CATEGORIES).forEach(([category, types]) => {
                        if ((types as string[]).includes(matchedType)) {
                            matchedCategory = category;
                        }
                    });
                }
            });
            
            if (matchedType) {
                const key = `${matchedCategory}|${matchedType}`;
                if (!documentGroups.has(key)) {
                    documentGroups.set(key, []);
                }
                documentGroups.get(key)?.push(fileName);
            }
        });
        // Create file groups from the grouped files
        const newFileGroups: FileGroup[] = [];
        let groupCounter = 0;
            
        documentGroups.forEach((fileNames, key) => {
            const [category, docType] = key.split('|');
                
            // Create a group for this document type
            newFileGroups.push({
                files: [], // No local files since these are already uploaded
                type: docType,
                category,
                uploading: false,
                uploaded: true,
                groupId: nextGroupId + groupCounter++,
                merge: true,
                convert: true,
                uploadedFilePaths: fileNames.map(name => `${basePath}/${name}`)
            });
        });
            
        return newFileGroups;
    };
    
    // Update a specific file group
    const updateGroupState = (groupId: number, updates: Partial<FileGroup>) => {
        setFileGroups(prev => prev.map(group => 
            group.groupId === groupId ? { ...group, ...updates } : group
        ));
    };
    const getGroupFileCount = (group: FileGroup): number => {
        if (group.uploaded && group.uploadedFilePaths) return group.uploadedFilePaths.length;
        if (group.files.length) return group.files.length;
        // Fallback: if we stored originals (e.g. after undo) use those
        const originals = originalFiles.get(group.groupId);
        return originals ? originals.length : 0;
    };


    // Refresh file list from Dropbox
    const refreshFileList = async () => {
        try {
            const documentsPath = await generatePath(staff.id, address, postcode, 'documents');
            const refreshedFiles = await checkExistingFiles(documentsPath, staff.id);
            setExistingFiles(refreshedFiles);
            
            const picturesPath = await generatePath(staff.id, address, postcode, 'pictures');
            const picturesFiles = await checkExistingFiles(picturesPath, staff.id);
            
            setUploadedPictures(!!picturesFiles.pictures?.length);
            setUploadedPicturePaths(
                picturesFiles.pictures?.length 
                ? picturesFiles.pictures.map(name => `${picturesPath}/${name}`) 
                : []
            );
        } catch (error) {
            console.error("Error refreshing file list:", error);
        }
    };

    // Delete uploaded files
    const deleteUploadedFiles = async (group: FileGroup) => {
        try {
            // Determine if this is a file group that was loaded from Dropbox or uploaded in current session
            const isExistingFile = group.uploaded && !createdFileNames.some(name => 
                group.uploadedFilePaths?.some(path => path.includes(name))
            );
            
            // Different confirmation message based on file origin
            const confirmMessage = isExistingFile
                ? `Are you sure you want to delete the ${DOCUMENT_LABELS[group.type]} files from Dropbox? This cannot be undone.`
                : `Are you sure you want to delete the uploaded ${DOCUMENT_LABELS[group.type]} files?`;
                
            // Confirm deletion
            const confirmDelete = window.confirm(confirmMessage);
            if (!confirmDelete) return false;
            
            setUploading(true);
            
            // Delete files from Dropbox
            const result = await apiDeleteUploadedFiles(
                group,
                staff.id,
                setUploading,
                updateGroupState,
                setCreatedFileNames,
                refreshFileList,
                DOCUMENT_LABELS[group.type]
            );
            
            if (result) {
                if (isExistingFile) {
                    // Existing Dropbox files: remove group entirely
                    setFileGroups(prev => prev.filter(g => g.groupId !== group.groupId));
                } else {
                    // Session upload: restore original local files (they were stored before upload)
                    const originalFilesForGroup = originalFiles.get(group.groupId) || [];
                    if (originalFilesForGroup.length === 0) {
                        // If somehow missing, just drop the group (prevents 0‑file phantom box)
                        setFileGroups(prev => prev.filter(g => g.groupId !== group.groupId));
                    } else {
                        setFileGroups(prev => [
                            ...prev.filter(g => g.groupId !== group.groupId),
                            {
                                files: originalFilesForGroup,
                                type: group.type,
                                category: group.category,
                                uploading: false,
                                uploaded: false,
                                groupId: nextGroupId,
                                merge: originalFilesForGroup.length > 1,
                                convert:true
                            }
                        ]);
                        // Preserve originals under new id
                        setOriginalFiles(prev => {
                            const clone = new Map(prev);
                            clone.set(nextGroupId, originalFilesForGroup);
                            return clone;
                        });
                        setNextGroupId(id => id + 1);
                    }
                }
            }
            
            return result;
        } catch (error) {
            console.error("Error deleting uploaded files:", error);
            return false;
        }
    };

    
    // Handle document file selection - create a new file group for multiple files
    const handleDocFileChange = (files: FileList | null) => {
        if (!files || files.length === 0) return;

        // Clone NOW – FileList is live
        const selected: File[] = Array.from(files);

        setFileGroups(prev => ([
            ...prev,
            {
                files: selected,
                type: '',
                category: '',
                uploading: false,
                uploaded: false,
                groupId: nextGroupId,
                merge: true,
                convert:true
            }
        ]));

        // Store originals immediately so an Undo BEFORE upload (future) can restore
        setOriginalFiles(prev => {
            const clone = new Map(prev);
            clone.set(nextGroupId, selected);
            return clone;
        });

        setNextGroupId(id => id + 1);

        // Reset input (no change event fired)
        if (docFileInputRef.current) docFileInputRef.current.value = '';
    };


    const toggleConvert = (groupId: number) => {
        updateGroupState(groupId, { convert: !fileGroups.find(g => g.groupId === groupId)?.convert });
    };

   // Toggle merge preference for a file group
    const toggleMergePreference = (groupId: number) => {
        updateGroupState(groupId, { merge: !fileGroups.find(g => g.groupId === groupId)?.merge });
    };

    // Update document type for a file group
    const updateGroupDocumentType = (groupId: number, docType: string, category: string) => {
        updateGroupState(groupId, { type: docType, category });
    };

    // Remove a file group
    const removeFileGroup = (groupId: number) => {
        setFileGroups(prev => prev.filter(group => group.groupId !== groupId));
    };
    
    // Handle picture file selection
    const handlePictureFileChange = (files: FileList | null) => {
        if (files?.length) {
            setPictureFiles(Array.from(files));
        } else {
            setPictureFiles([]);
        }
    };
    
    
    // Upload all document file groups
    const uploadAllDocuments = async () => {
        if (!address || !postcode || fileGroups.length === 0) {
            alert('Please fill in address, postcode and add document files');
            return;
        }
        
        // Check if all groups have types assigned
        const unassignedGroups = fileGroups.filter(group => !group.type);
        if (unassignedGroups.length > 0) {
            alert(`Please assign a document type to all file groups (${unassignedGroups.length} groups unassigned)`);
            return;
        }
        // Check for shared eligibility types with multiple files and not merged
        let updatedGroups = [...fileGroups];
        let changed = false;
        for (let i = 0; i < updatedGroups.length; i++) {
            const group = updatedGroups[i];
            if (
                SHARED_ELIGIBILITY_TYPES.includes(group.type) &&
                group.files.length > 1 &&
                !group.merge
            ) {
                const shouldMerge = window.confirm(
                    `You have selected multiple files for "${DOCUMENT_LABELS[group.type]}".\n\n` +
                    `Do you want to merge them into a single PDF before uploading to Eligibility?\n\n` +
                    `If you select No, the files will be uploaded individually and grouped together in Eligibility.`
                );
                if (shouldMerge) {
                    updatedGroups[i] = { ...group, merge: true };
                    changed = true;
                }
            }
        }
        if (changed) setFileGroups(updatedGroups);

        
        
        // Check for existing files
        const documentsPath = await generatePath(staff.id, address, postcode, 'documents');
        const existingFilesList = await checkExistingFiles(documentsPath, staff.id);
        setExistingFiles(existingFilesList);

        
        // Generate smart filenames and check for conflicts
        const documentsFolder = existingFilesList.documents || [];
        const fileNameMap = generateSmartFileNames(fileGroups, documentsFolder, DOCUMENT_LABELS);

        const conflictingGroups = checkForConflicts(fileGroups, documentsFolder);
        
        const sessionFileNames: string[] = [];
        fileNameMap.forEach(fileNames => {
            sessionFileNames.push(...fileNames);
        });

        // Handle conflicts if any
        if (conflictingGroups.length > 0) {
            const confirmOverwrite = window.confirm(
                `Some files with the same names already exist in the folder:\n\n${
                    conflictingGroups.map(c => `• ${c.fileName} (${DOCUMENT_LABELS[c.docType]})`).join('\n')
                }\n\nDo you want to overwrite them? If you choose No, files will be renamed automatically.`
            );
            
            if (!confirmOverwrite) {
                console.log("Using automatic file numbering for conflicts");
            }
        }
        
        setUploading(true);
        setCreatedFileNames([]);

        
        // Upload each group of files
        for (const [index, group] of updatedGroups.entries()) {
            // Skip already uploaded groups
            if (group.uploaded) continue;
            
            try {
                // Mark this group as uploading
                updatedGroups[index] = { ...updatedGroups[index], uploading: true };
                setFileGroups([...updatedGroups]);
                
                const result = await uploadGroupFiles(group, fileNameMap.get(group.groupId) || []);
                
                if (result.success) {
                    // Store uploaded file paths
                    const uploadedPaths = result.files.map((fileName: string) => `${result.folder_path}/${fileName}`);
                    
                    // Update existing files list
                    setExistingFiles(prev => ({
                        ...prev,
                        documents: [...(prev.documents || []), ...result.files]
                    }));
                    
                    // Mark group as uploaded with file paths
                    updatedGroups[index] = { 
                        ...updatedGroups[index], 
                        uploading: false, 
                        uploaded: true,
                        uploadedFilePaths: uploadedPaths
                    };
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                // Mark group as failed
                updatedGroups[index] = { 
                    ...updatedGroups[index], 
                    uploading: false, 
                    error: (error as Error).message 
                };
                
                alert(`Upload error for ${DOCUMENT_LABELS[group.type]}: ${(error as Error).message}`);
            }
            
            // Update UI after each group
            setFileGroups([...updatedGroups]);
        }
        
        setUploading(false);
        
        // Show summary
        const successCount = updatedGroups.filter(g => g.uploaded).length;
        const totalGroups = updatedGroups.length;
        
       if (successCount === totalGroups) {
            alert(`All ${successCount} document groups uploaded successfully!`);
        } else {
            alert(`Uploaded ${successCount} out of ${totalGroups} document groups. Please check errors and try again for failed uploads.`);
        }
    };
        // Helper function to check for filename conflicts
    const checkForConflicts = (groups: FileGroup[], existingFiles: string[]) => {
        const conflicts: ConflictingGroup[] = [];
        
        for (const group of groups) {
            if (group.uploaded) continue;
            
            if (group.merge && group.files.length > 1) {
                const pdfFileName = `${DOCUMENT_LABELS[group.type].replace(/\s+/g, '_')}.pdf`;
                if (existingFiles.includes(pdfFileName)) {
                    conflicts.push({ groupId: group.groupId, docType: group.type, fileName: pdfFileName });
                }
            } else {
                for (const file of group.files) {
                    const fileName = `${DOCUMENT_LABELS[group.type].replace(/\s+/g, '_')}${getFileExtension(file.name)}`;
                    if (existingFiles.includes(fileName)) {
                        conflicts.push({ groupId: group.groupId, docType: group.type, fileName });
                        break;
                    }
                }
            }
        }
        
        return conflicts;
    };
    
    // Helper function to prepare and upload files for a group
    const uploadGroupFiles = async (group: FileGroup, fileNames: string[]) => {
        const allowConversion = group.convert;
        // Store originals
        setOriginalFiles(prev => new Map(prev).set(group.groupId, [...group.files]));

        // CASE 1: Merge ON and more than one file (existing logic)
        if (group.merge && group.files.length > 1) {
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', address);
            submitData.append('postcode', postcode);
            submitData.append('file_type', 'documents');
            submitData.append('convert_user_pref', allowConversion ? 'true' : 'false');

            let trackedNames: string[] = [...fileNames];

            if (allowConversion && areAllFilesImages(group.files)) {
                const pdfFile = await convertImagesToPdf(
                    group.files,
                    DOCUMENT_LABELS[group.type].replace(/\s+/g, '_')
                );
                const pdfName = fileNames[0].replace(/\.\w+$/, '.pdf');
                trackedNames = [pdfName];
                const renamedFile = new File([pdfFile], pdfName, { type: 'application/pdf' });
                submitData.append('files', renamedFile);
            } else if (allowConversion && areAllFilesWord(group.files)) {
                group.files.forEach((file, i) => {
                    submitData.append('files', new File([file], fileNames[i], { type: file.type }));
                });
                submitData.append('convert_to_pdf', 'true');
                const pdfName = fileNames[0].replace(/\.\w+$/, '.pdf');
                trackedNames = [pdfName];
                submitData.append('output_filename', pdfName);
            } else {
                group.files.forEach((file, i) => {
                    submitData.append('files', new File([file], fileNames[i], { type: file.type }));
                });
            }

            setCreatedFileNames(prev => [...prev, ...trackedNames]);

            return uploadFiles(submitData, undefined, {
                generatePath: true,
                staffId: staff.id,
                address,
                postcode,
                fileType: 'documents'
            });
        }

        // CASE 2: NOT merging and MULTIPLE files -> upload each file separately so all appear (fix for only first uploading)
        if (!group.merge && group.files.length > 1) {
            const aggregatedFiles: string[] = [];
            let folderPath: string | null = null;

            for (let i = 0; i < group.files.length; i++) {
                const singleFile = group.files[i];
                const targetName = fileNames[i];
                const isImg = singleFile.type.startsWith('image/');
                const isWord = isWordFile(singleFile);
                const base = targetName.replace(/\.\w+$/, '');
                const pdfName = `${base}.pdf`;

                const fd = new FormData();
                fd.append('staff_id', staff.id.toString());
                fd.append('address', address);
                fd.append('postcode', postcode);
                fd.append('file_type', 'documents');
                fd.append('convert_user_pref', allowConversion ? 'true' : 'false');

                if (allowConversion && isImg) {
                    const pdfFile = await convertImagesToPdf([singleFile], base);
                    fd.append('files', new File([pdfFile], pdfName, { type: 'application/pdf' }));
                } else if (allowConversion && isWord) {
                    fd.append('files', new File([singleFile], targetName, { type: singleFile.type }));
                    fd.append('convert_to_pdf', 'true');
                    fd.append('output_filename', pdfName);
                } else {
                    fd.append('files', new File([singleFile], targetName, { type: singleFile.type }));
                }

                const result = await uploadFiles(fd, undefined, {
                    generatePath: true,
                    staffId: staff.id,
                    address,
                    postcode,
                    fileType: 'documents'
                });

                if (!result.success) {
                    return result; // stop on first failure
                }

                folderPath = result.folder_path;
                aggregatedFiles.push(...result.files);
                setCreatedFileNames(prev => [...prev, ...(result.files || [])]);
            }

            return {
                success: true,
                files: aggregatedFiles,
                folder_path: folderPath
            };
        }

        // CASE 3: Single-file group (existing logic)
        const submitData = new FormData();
        submitData.append('staff_id', staff.id.toString());
        submitData.append('address', address);
        submitData.append('postcode', postcode);
        submitData.append('file_type', 'documents');
        submitData.append('convert_user_pref', allowConversion ? 'true' : 'false');

        let trackedNames: string[] = [...fileNames];

        const file = group.files[0];
        const originalName = fileNames[0];
        if (
            allowConversion &&
            (file.type.startsWith('image/') || isWordFile(file))
        ) {
            const base = originalName.replace(/\.\w+$/, '');
            const pdfName = `${base}.pdf`;
            trackedNames = [pdfName];

            if (file.type.startsWith('image/')) {
                const pdfFile = await convertImagesToPdf([file], base);
                const renamed = new File([pdfFile], pdfName, { type: 'application/pdf' });
                submitData.append('files', renamed);
            } else {
                submitData.append('files', new File([file], originalName, { type: file.type }));
                submitData.append('convert_to_pdf', 'true');
                submitData.append('output_filename', pdfName);
            }
        } else {
            submitData.append('files', new File([file], originalName, { type: file.type }));
        }

        setCreatedFileNames(prev => [...prev, ...trackedNames]);

        return uploadFiles(submitData, undefined, {
            generatePath: true,
            staffId: staff.id,
            address,
            postcode,
            fileType: 'documents'
        });
    };

    // Upload picture files
    const uploadPictures = async () => {
        if (!address || !postcode || pictureFiles.length === 0) {
            alert('Please fill in address, postcode and select picture files');
            return;
        }
        
        setUploading(true);
        
       try {
            const submitData = new FormData();
            submitData.append('staff_id', staff.id.toString());
            submitData.append('address', address);
            submitData.append('postcode', postcode);
            submitData.append('file_type', 'pictures');
            
            // Add all selected files
            pictureFiles.forEach(file => submitData.append('files', file));
            
            // Use centralized path generation and upload helper
            const result = await uploadFiles(submitData, undefined, {
                generatePath: true,
                staffId: staff.id,
                address,
                postcode,
                fileType: 'pictures'
            });
            
            if (result.success) {
                setUploadedPictures(true);
                setPictureFiles([]);
                
                const uploadedPaths = result.files.map((fileName: string) => `${result.folder_path}/${fileName}`);
                setUploadedPicturePaths(uploadedPaths);
                
                // Reset file input
                if (pictureFileInputRef.current) {
                    pictureFileInputRef.current.value = '';
                }
                
                alert(`Survey pictures uploaded successfully!`);
            } else {
                alert(`Upload failed: ${result.message}`);
            }
        } catch (error) {
            alert(`Upload error: ${(error as Error).message}`);
        } finally {
            setUploading(false);
        }
    };
    
    // Get document types by category for dropdown menus
    const getDocumentTypesByCategory = (category: string) => {
        return (DOCUMENT_CATEGORIES[category as keyof typeof DOCUMENT_CATEGORIES] || []).filter(Boolean);
    };


    // Check if all documents are uploaded
    const allDocumentsUploaded = fileGroups.length > 0 && fileGroups.every(group => group.uploaded);

   return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#2c3e50', borderRadius: '4px', color: 'white' }}>
                <h3>Welcome, {staff.name}!</h3>
                <p><strong>Role:</strong> {staff.role}</p>
                <p><strong>Base Folder:</strong> {staff.folder_path}</p>
            </div>

            <h2 style={{ color: 'white' }}>Survey Submission</h2>
            
            {/* Project Info */}
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

            {/* Tabs */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', marginBottom: '15px' }}>
                    <SubmitButton
                        onClick={() => setActiveTab('documents')}
                        text="Documents"
                        style={{
                            flex: 1,
                            borderRadius: '4px 0 0 4px',
                            backgroundColor: activeTab === 'documents' ? '#3498db' : '#282828',
                            padding: '10px'
                        }}
                    />
                    <SubmitButton
                        onClick={() => setActiveTab('pictures')}
                        text="Pictures"
                        style={{
                            flex: 1,
                            borderRadius: '0 4px 4px 0',
                            backgroundColor: activeTab === 'pictures' ? '#3498db' : '#282828',
                            padding: '10px'
                        }}
                    />
                </div>

                {/* Documents Tab */}
                {activeTab === 'documents' && (
                    <div style={{ backgroundColor: '#282828', padding: '20px', borderRadius: '4px' }}>
                        <h3 style={{ color: 'white', marginTop: 0 }}>Upload Multiple Documents</h3>
                        
                        {/* File selection */}
                        <div style={{ marginBottom: '20px' }}>
                            <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '10px' }}>
                                Files selected together will be assigned the same document type
                            </p>
                            <FileUploadButton
                                id="docFileInput"
                                inputRef={docFileInputRef}
                                onChange={handleDocFileChange}
                                multiple={true}
                                accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                disabled={uploading}
                                label="Select Files"
                            />
                        </div>
                        
                        {/* File groups */}
                        {fileGroups.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                                <h4 style={{ color: 'white' }}>Selected File Groups</h4>
                                <p style={{ color: '#aaa', marginBottom: '10px' }}>Assign a document type to each group:</p>
                                
                                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    {fileGroups.map((group) => (
                                        <div 
                                            key={group.groupId} 
                                            style={{ 
                                                padding: '15px', 
                                                backgroundColor: group.uploaded ? '#1e3a5f' : group.error ? '#5e2129' : '#333',
                                                marginBottom: '15px',
                                                borderRadius: '4px',
                                                position: 'relative'
                                            }}
                                        >
                                            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginTop:'8px' }}>
                                                {(() => {
                                                    const hasLocalFiles = group.files && group.files.length > 0;
                                                    const allPdf = hasLocalFiles && group.files.every(f =>
                                                        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
                                                    );
                                                    // Show convert only if there are local (not yet uploaded) non-PDF convertible files
                                                    if (!group.uploaded && hasLocalFiles && !allPdf) {
                                                        return (
                                                            <label style={{ color:'#ccc', fontSize:'12px', display:'flex', alignItems:'center', gap:'4px' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!group.convert}
                                                                    onChange={() => toggleConvert(group.groupId)}
                                                                    disabled={group.uploaded || group.uploading}
                                                                />
                                                                Convert to PDF (images / Word)
                                                            </label>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                <label style={{ color:'#ccc', fontSize:'12px', display:'flex', alignItems:'center', gap:'4px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={group.merge}
                                                        onChange={() => toggleMergePreference(group.groupId)}
                                                        disabled={group.uploaded || group.uploading || group.files.length < 2}
                                                    />
                                                    Merge files into single PDF
                                                </label>
                                            </div>
                                            {/* Uploading overlay */}
                                            {group.uploading && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 0, left: 0, right: 0, bottom: 0,
                                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    zIndex: 2,
                                                    borderRadius: '4px'
                                                }}>
                                                    <p style={{ color: 'white' }}>Uploading...</p>
                                                </div>
                                            )}
                                            
                                            {/* Header with file count and actions */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                <span style={{ color: 'white', fontWeight: 'bold' }}>
                                                    {(() => {
                                                        const count = getGroupFileCount(group);
                                                        return `${count} file${count !== 1 ? 's' : ''}`;
                                                    })()}
                                                    {group.type ? ` (${DOCUMENT_LABELS[group.type]})` : ''}
                                                </span>
                                                
                                                {!group.uploaded && !group.uploading && (
                                                    <SubmitButton 
                                                        onClick={() => removeFileGroup(group.groupId)}
                                                        text="Remove"
                                                        style={{
                                                            backgroundColor: '#e74c3c',
                                                            width: 'auto',
                                                            padding: '4px 8px',
                                                            marginLeft: '10px',
                                                            fontSize: '12px'
                                                        }}
                                                    />
                                                )}
                                                
                                                {group.uploaded && (
                                                    <div style={{ display:'flex', alignItems: 'center'}}>
                                                        <span style={{
                                                            backgroundColor: '#27ae60',
                                                            color: 'white',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            marginRight: '8px'
                                                        }}>
                                                            Uploaded ✓
                                                        </span>
                                                        <SubmitButton
                                                            onClick={() => deleteUploadedFiles(group)}
                                                            disabled={uploading}
                                                            text={`Undo (${group.category}: ${DOCUMENT_LABELS[group.type]})`}
                                                            style={{
                                                                backgroundColor: '#e74c3c',
                                                                width: 'auto',
                                                                padding: '4px 8px',
                                                                fontSize: '12px'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                
                                                {group.error && (
                                                    <span style={{
                                                        backgroundColor: '#e74c3c',
                                                        color: 'white',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '12px'
                                                    }}>
                                                        Failed
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* File list */}
                                            <ul style={{
                                                margin: '10px 0',
                                                padding: '10px',
                                                backgroundColor: 'rgba(0,0,0,0.2)',
                                                borderRadius: '4px',
                                                maxHeight: '120px',
                                                overflowY: 'auto',
                                                listStyleType: 'none'
                                            }}>
                                                {group.uploaded && group.uploadedFilePaths?.length ? (
                                                    group.uploadedFilePaths.map((p, i) => {
                                                        const name = p.split('/').pop() || '';
                                                        return (
                                                            <li key={i} style={{ color:'#aaa', marginBottom:'5px', fontSize:'14px', display:'flex', alignItems:'center' }}>
                                                                <span style={{ color:'#3498db', marginRight:'8px' }}>✓</span>{name}
                                                            </li>
                                                        );
                                                    })
                                                ) : group.files.length ? (
                                                    group.files.map((f, i) => (
                                                        <li key={i} style={{ color:'#aaa', marginBottom:'5px', fontSize:'14px' }}>
                                                            {f.name} ({Math.round(f.size/1024)} KB)
                                                        </li>
                                                    ))
                                                ) : (() => {
                                                    const originals = originalFiles.get(group.groupId);
                                                    if (originals && originals.length) {
                                                        return originals.map((f, i) => (
                                                            <li key={i} style={{ color:'#aaa', marginBottom:'5px', fontSize:'14px' }}>
                                                                {f.name} ({Math.round(f.size/1024)} KB)
                                                            </li>
                                                        ));
                                                    }
                                                    return <li style={{ color:'#777', fontStyle:'italic' }}>No files</li>;
                                                })()}
                                            </ul>
                                            
                                            {/* Document type selection */}
                                            {!group.uploaded && !group.uploading && (
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    {/* Category selection */}
                                                    <select
                                                        value={group.category}
                                                        onChange={(e) => updateGroupDocumentType(group.groupId, '', e.target.value)}
                                                        style={{
                                                            flex: 1,
                                                            padding: '8px',
                                                            backgroundColor: '#444',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px'
                                                        }}
                                                    >
                                                        <option value="">Select Category</option>
                                                        {Object.keys(DOCUMENT_CATEGORIES).map(category => (
                                                            <option key={category} value={category}>{category}</option>
                                                        ))}
                                                    </select>
                                                    
                                                    {/* Document type selection */}
                                                    {group.category && (
                                                        <>
                                                        <select
                                                            value={group.type}
                                                            onChange={(e) => updateGroupDocumentType(group.groupId, e.target.value, group.category)}
                                                            style={{
                                                                flex: 1,
                                                                padding: '8px',
                                                                backgroundColor: '#444',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '4px'
                                                            }}
                                                        >
                                                            <option value="">Select Document Type</option>
                                                            {getDocumentTypesByCategory(group.category)
                                                                .filter(type => type && DOCUMENT_LABELS[type]) // Filter out empty/undefined and missing label
                                                                .map(type => (
                                                                    <option key={type} value={type}>{DOCUMENT_LABELS[type]}</option>
                                                                ))
}
                                                        </select>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            
                                            {/* Error message */}
                                            {group.error && (
                                                <p style={{ color: '#e74c3c', margin: '10px 0 0 0' }}>
                                                    Error: {group.error}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Upload button */}
                        <SubmitButton
                            onClick={uploadAllDocuments}
                            disabled={fileGroups.length === 0 || uploading || fileGroups.every(group => group.uploaded)}
                            loading={uploading}
                            loadingText="Uploading..."
                            text={fileGroups.every(group => group.uploaded) ? 'All Documents Uploaded' : 'Upload All Documents'}
                        />
                    </div>
                )}

                {/* Pictures Tab */}
                {activeTab === 'pictures' && (
                    <div style={{ backgroundColor: '#282828', padding: '20px', borderRadius: '4px' }}>
                        <h3 style={{ color: 'white', marginTop: 0 }}>Upload Survey Pictures</h3>
                        <p style={{ color: '#aaa' }}>Upload pictures of the property from your survey</p>
                        {/* Show count if already uploaded */}
                        {uploadedPictures && _uploadedPictureCount > 0 && (
                            <p style={{ color:'#aaa', fontSize:'12px', marginTop:0 }}>
                                {_uploadedPictureCount} picture(s) currently stored
                            </p>
                        )}
                        {/* File selection */}
                        <div style={{ marginBottom: '15px' }}>
                            <FileUploadButton
                                id="pictureFileInput"
                                inputRef={pictureFileInputRef}
                                onChange={handlePictureFileChange}
                                multiple={true}
                                accept="image/*"
                                disabled={uploading || uploadedPictures}
                                label="Select Pictures"
                            />
                            {pictureFiles.length > 0 && (
                                <div style={{ color: '#aaa', marginTop: '8px' }}>
                                    <p>{pictureFiles.length} picture(s) selected</p>
                                    <ul style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '14px' }}>
                                        {pictureFiles.map((file, index) => (
                                            <li key={index}>{file.name} ({Math.round(file.size / 1024)} KB)</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        
                        {/* Upload button or status */}
                        {!uploadedPictures ? (
                            <SubmitButton
                                onClick={uploadPictures}
                                disabled={pictureFiles.length === 0 || uploading}
                                loading={uploading}
                                loadingText="Uploading..."
                                text="Upload Pictures"
                            />
                        ) : (
                            <div style={{ 
                                backgroundColor: '#27ae60', 
                                color: 'white',
                                padding: '10px',
                                borderRadius: '4px',
                                textAlign: 'center'
                            }}>
                                Pictures uploaded successfully ✓
                                <SubmitButton
                                    onClick={() => setUploadedPictures(false)}
                                    text="Upload Different Pictures"
                                    style={{
                                        display: 'block',
                                        margin: '10px auto 0',
                                        backgroundColor: '#2ecc71',
                                        border: '1px solid white',
                                        padding: '5px 10px'
                                    }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <SubmitButton
                    onClick={onBack}
                    disabled={uploading}
                    text="Back"
                    style={{
                        flex: 1,
                        backgroundColor: '#566573',
                        padding: '10px'
                    }}
                />
                
                <SubmitButton
                    onClick={() => alert('Survey submission complete!')}
                    disabled={uploading || !uploadedPictures || !allDocumentsUploaded}
                    text="Complete Survey Submission"
                    style={{
                        flex: 2,
                        backgroundColor: (uploadedPictures && allDocumentsUploaded) ? '#27ae60' : '#566573',
                        padding: '10px'
                    }}
                />
            </div>
        </div>
    );
};

export default SurveySubmission;