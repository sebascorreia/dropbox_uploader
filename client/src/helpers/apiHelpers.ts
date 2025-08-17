import type {FileGroup} from './fileHelpers';
import API_BASE_URL from '../config';

export const checkExistingFiles = async (folderPath: string, staffId:number): Promise<{[key: string]: string[]}> => {
  try {
      const response = await fetch(`${API_BASE_URL}/list-files`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
              staff_id: staffId,
              folder_path: folderPath
          }),
      });
      
      const result = await response.json();
      
      if (result.success) {
          return result.files || {};
      } else {
          console.error('Failed to check existing files:', result.message);
          return {};
      }
  } catch (error) {
      console.error('Error checking existing files:', error);
      return {};
  }
};

export async function listEligibilityFiles(staffId: number, address: string, postcode: string): Promise<string[]> {
  const res = await fetch('/api/list-eligibility-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, address, postcode })
  });
  if (!res.ok) throw new Error('Failed to fetch eligibility files');
  const data = await res.json();
  return data.files; // should be an array of file names
};

export const deleteUploadedFiles = async (
    group: FileGroup, 
    staffId: number,
    setUploading: (uploading: boolean) => void,
    updateGroupState: (groupId: number, updates: Partial<FileGroup>) => void,
    updateCreatedFileNames: (filterFn: (prevNames: string[]) => string[]) => void,
    refreshFileList: () => Promise<void>,
    documentLabel: string): Promise<boolean> => {
    if (!group.uploadedFilePaths || group.uploadedFilePaths.length === 0) {
        alert("No file paths available to delete");
        return false;
    }
    
    // Confirm deletion
    const confirmDelete = window.confirm(
        `Are you sure you want to delete the uploaded ${documentLabel} files? This cannot be undone.`
    );
    
    if (!confirmDelete) return false;
    
    setUploading(true);
    
    try {
        // Mark group as processing
        updateGroupState(group.groupId, { uploading: true });

        // Delete each file
        for (const filePath of group.uploadedFilePaths) {
            const response = await fetch(`${API_BASE_URL}/delete-file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    staff_id: staffId,
                    file_path: filePath
                }),
            });
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message);
            }
        }
        
        // Update group state to not uploaded
        updateGroupState(group.groupId, { 
            uploading: false, 
            uploaded: false,
            uploadedFilePaths: [] 
        });
        
        // Remove file names from created files list
        updateCreatedFileNames(prev => {
            const fileNames = group.uploadedFilePaths?.map(path => path.split('/').pop() || '') || [];
            return prev.filter(name => !fileNames.includes(name));
        });
    
        // Force a refresh of the file list from Dropbox
        await refreshFileList();
    
        // Add a small delay before allowing new uploads
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        alert(`${documentLabel} files deleted successfully`);
        return true;
    
        
    } catch (error) {
        alert(`Error deleting files: ${(error as Error).message}`);
        
        // Reset the uploading state on error
        updateGroupState(group.groupId, { uploading: false });
        return false;
    } finally {
        setUploading(false);
    }
};

export const uploadFiles = async (
    formData: FormData,
    endpoint: string = `${API_BASE_URL}/submit-files`,
    options: {
        generatePath?: boolean,
        staffId?: number,
        address?: string,
        postcode?: string,
        fileType?: string
    } = {}
): Promise<any> => {
    // If path generation is requested, handle it
    if (options.generatePath && 
        options.staffId && 
        options.address && 
        options.postcode && 
        options.fileType) {
        
        try {
            const generatedPath = await generatePath(
                options.staffId,
                options.address,
                options.postcode,
                options.fileType
            );
            
            // Use the generated path
            formData.append('generated_path', generatedPath);
        } catch (error) {
            console.error("Path generation failed:", error);
            // Continue with request, server will fall back to its path logic
        }
    }
    
    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });

    return await response.json();
};

// Add a new export at the bottom of the file
export interface DocumentCheckConfig {
  // Required fields
  staffId: number;
  address: string;
  postcode: string;
  
  // Role-specific configuration
  role: string;
  
  // For EPR: section and docType 
  section?: string;
  docType?: string;
  sectionTypes?: {
    [section: string]: {
      title: string;
      types: {
        [docType: string]: string;
      };
    };
  };
  
  // For Eligibility: just docType
  documentLabels?: {[key: string]: string};
  
  // For Survey: categories and document types
  category?: string;
  fileType?: string;
}

export const checkRoleDocument = async (config: DocumentCheckConfig): Promise<{exists: boolean, filePath?: string}> => {
  if (!config.address || !config.postcode) return { exists: false };
  
  try {
    // Generate the appropriate path based on role
    let folderPath: string;
    let docTypeLabel: string = '';
    
    // Generate path based on role-specific requirements
    switch(config.role.toLowerCase()) {
      case 'epr':
        // For EPR: Check in the section folder (PRE or POST)
        if (!config.section || !config.docType || !config.sectionTypes) {
          throw new Error("Missing required EPR parameters");
        }
        
        folderPath = await generatePath(
          config.staffId, 
          config.address, 
          config.postcode, 
          config.section
        );
        
        docTypeLabel = config.sectionTypes[config.section].types[config.docType].replace(/\s+/g, '_');
        break;
        
      case 'eligibility':
        // For Eligibility: Check in the documents folder
        if (!config.docType || !config.documentLabels) {
          throw new Error("Missing required Eligibility parameters");
        }
        
        folderPath = await generatePath(
          config.staffId, 
          config.address, 
          config.postcode, 
          ""
        );
        
        docTypeLabel = config.documentLabels[config.docType].replace(/\s+/g, '_');
        break;
        
      case 'survey':
        // For Survey: Check in the appropriate category folder
        if (!config.fileType) {
          throw new Error("Missing required Survey parameters");
        }
        
        folderPath = await generatePath(
          config.staffId, 
          config.address, 
          config.postcode, 
          config.fileType
        );
        break;
        
      default:
        // For any other role, use the provided fileType
        if (!config.fileType) {
          throw new Error("Missing required fileType parameter");
        }
        
        folderPath = await generatePath(
          config.staffId, 
          config.address, 
          config.postcode, 
          config.fileType
        );
    }
    
    // Check for files in the folder
    const response = await fetch(`${API_BASE_URL}/list-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ staff_id: config.staffId, folder_path: folderPath }),
    });
    
    const result = await response.json();
    
    if (result.success && result.files && Object.keys(result.files).length > 0) {
      const folderKeys = Object.keys(result.files);
      
      // For EPR and Eligibility where we need to match by document type
      if (docTypeLabel) {
        for (const folderKey of folderKeys) {
          if (Array.isArray(result.files[folderKey])) {
            // Different matching strategies by role
            const matchingFile = config.role.toLowerCase() === 'eligibility'
              // For Eligibility: look for exact match or filename containing the docType
              ? result.files[folderKey].find((fileName: string) => 
                  fileName === `${docTypeLabel}.pdf` || 
                  fileName.toUpperCase().includes(docTypeLabel.toUpperCase())
                )
              // For EPR: look for filename starting with the docType
              : result.files[folderKey].find((fileName: string) => 
                  fileName.toUpperCase().startsWith(docTypeLabel.toUpperCase())
                );
            
            if (matchingFile) {
              return {
                exists: true,
                filePath: `${folderPath}/${matchingFile}`
              };
            }
          }
        }
      } 
      // For Survey or other roles: just check if any files exist
      else if (folderKeys.length > 0 && result.files[folderKeys[0]].length > 0) {
        const fileName = result.files[folderKeys[0]][0];
        return {
          exists: true,
          filePath: `${folderPath}/${fileName}`
        };
      }
    }
    
    return { exists: false };
  } catch (error) {
    console.error(`Error checking for document: ${error}`);
    return { exists: false };
  }
};

export const generatePath = async (
    staffId: number,
    address: string,
    postcode: string,
    fileType: string
): Promise<string> => {
    try {
        // Get staff info first
        const staffResponse = await fetch(`${API_BASE_URL}/staff-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ staff_id: staffId }),
        });
        
        const staffInfo = await staffResponse.json();
        if (!staffInfo.success) {
            throw new Error("Could not get staff information");
        }
        
        // Now generate the path using the server's path utility
        const pathResponse = await fetch(`${API_BASE_URL}/generate-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                role: staffInfo.role,
                company: staffInfo.company,
                staff_name: staffInfo.name,
                address: address,
                postcode: postcode,
                file_type: fileType
            }),
        });
        
        const pathResult = await pathResponse.json();
        if (!pathResult.success) {
            throw new Error("Failed to generate path");
        }
        
        return pathResult.path;
    } catch (error) {
        console.error("Error generating path:", error);
        throw error;
    }
}
