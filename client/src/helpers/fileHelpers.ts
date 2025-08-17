import {jsPDF} from 'jspdf'

export interface FileGroup {
    files: File[];
    type: string;
    category: string;
    uploading: boolean;
    uploaded: boolean;
    error?: string;
    groupId: number; 
    merge: boolean;
    convert?: boolean;
    uploadedFilePaths?: string[];
}
export const getFileExtension = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';
};
export const areAllFilesImages = (files:File[]): boolean =>{
        return files.every(file => file.type.startsWith('image/'));
    }
export const convertImagesToPdf = async (files: File[], docName: string): Promise<File> => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new jsPDF();
            const imagePromises = files.map(file => {
                return new Promise<{file: File, dataUrl: string}>((res) => {
                    const reader = new FileReader();
                    reader.onload = () => res({
                        file,
                        dataUrl: reader.result as string
                    });
                    reader.readAsDataURL(file);
                });
            });
            
            const imageData = await Promise.all(imagePromises);
            
            // Sort files by name to maintain order
            imageData.sort((a, b) => a.file.name.localeCompare(b.file.name));
            
            // Add each image as a page in the PDF
            for (let i = 0; i < imageData.length; i++) {
                // Add new page if not the first page
                if (i > 0) {
                    doc.addPage();
                }
                
                const { dataUrl } = imageData[i];
                const imgProps = doc.getImageProperties(dataUrl);
                
                // Calculate dimensions to fit the page
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const imgWidth = imgProps.width;
                const imgHeight = imgProps.height;
                
                // Scale image to fit the page while maintaining aspect ratio
                let finalWidth = pageWidth;
                let finalHeight = (imgHeight * pageWidth) / imgWidth;
                
                // If height exceeds page, scale down
                if (finalHeight > pageHeight) {
                    finalHeight = pageHeight;
                    finalWidth = (imgWidth * pageHeight) / imgHeight;
                }
                
                // Center the image on the page
                const x = (pageWidth - finalWidth) / 2;
                const y = (pageHeight - finalHeight) / 2;
                
                doc.addImage(dataUrl, 'JPEG', x, y, finalWidth, finalHeight);
            }
            
            // Generate the PDF file
            const pdfBlob = doc.output('blob');
            
            // Create a File object from the blob
            const pdfFile = new File([pdfBlob], `${docName}.pdf`, { type: 'application/pdf' });
            resolve(pdfFile);
        } catch (error) {
            console.error('Error converting images to PDF:', error);
            reject(error);
        }
    });
};

export const generateSmartFileNames = (
  fileGroups: FileGroup[],
  existingFiles: string[],
  documentLabels: {[key:string]: string}
): Map<number, string[]> => {
  // Track all filenames we'll generate in this session
  const allFileNames: string[] = [...existingFiles];
  
  // Map to store group ID -> generated filenames
  const fileNameMap = new Map<number, string[]>();
  
  // First, group files by document type to track how many of each type we have
  const docTypeCounts: {[docType: string]: number} = {};
  
  // Count how many document groups of each type we have
  fileGroups.forEach(group => {
    if (group.uploaded) return; // Skip already uploaded groups
    
    if (!docTypeCounts[group.type]) {
      docTypeCounts[group.type] = 0;
    }
    docTypeCounts[group.type]++;
  });
  
  // Process each group to generate appropriate filenames
  fileGroups.forEach(group => {
    if (group.uploaded) return;
    
    const baseFileName = documentLabels[group.type].replace(/\s+/g, '_');
    const fileNames: string[] = [];
    
    // Check if we need a group number suffix (when multiple groups have same doc type)
    const needsGroupNumber = docTypeCounts[group.type] > 1;
    
    // For merged files, create a single filename
    if (group.merge && group.files.length > 1) {
      // Generate a unique name for the merged PDF
      let fileName = baseFileName;
      
      // Add suffix for multiple groups of same type
      if (needsGroupNumber) {
        // Find what number this group is within its type
        const groupNumber = fileGroups
          .filter(g => g.type === group.type && g.groupId <= group.groupId)
          .length;
        
        fileName = `${fileName}_${groupNumber}`;
      }
      
      // Add extension
      fileName = `${fileName}.pdf`;
      
      // Check if the name is already taken
      if (allFileNames.includes(fileName)) {
        // Add a timestamp to ensure uniqueness
        const timestamp = new Date().getTime();
        fileName = `${fileName.replace('.pdf', '')}_${timestamp}.pdf`;
      }
      
      // Save this filename
      fileNames.push(fileName);
      allFileNames.push(fileName);
    } 
    // For individual files or non-merged groups
    else {
      group.files.forEach((file, index) => {
        const fileExt = getFileExtension(file.name);
        let fileName = baseFileName;
        
        // Add group number if needed
        if (needsGroupNumber) {
          // Find what number this group is within its type
          const groupNumber = fileGroups
            .filter(g => g.type === group.type && g.groupId <= group.groupId)
            .length;
          
          fileName = `${fileName}_${groupNumber}`;
        }
        
        // Add file number if multiple files in group
        if (group.files.length > 1) {
          fileName = `${fileName}_${index + 1}`;
        }
        
        // Add extension
        fileName = `${fileName}${fileExt}`;
        
        // Check if the name is already taken
        if (allFileNames.includes(fileName)) {
          // Try adding sequential numbers
          let counter = 1;
          let tempName = `${fileName.replace(fileExt, '')}_${counter}${fileExt}`;
          
          while (allFileNames.includes(tempName)) {
            counter++;
            tempName = `${fileName.replace(fileExt, '')}_${counter}${fileExt}`;
          }
          
          fileName = tempName;
        }
        
        // Save this filename
        fileNames.push(fileName);
        allFileNames.push(fileName);
      });
    }
    
    // Store the generated filenames for this group
    fileNameMap.set(group.groupId, fileNames);
  });
  
  return fileNameMap;
};

export const isPdfFile = (file: File): boolean => {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};

export const isImageFile = (file: File): boolean => {
    return file.type.startsWith('image/');
};

export const resetFileInput = (inputId: string): void => {
    const fileInput = document.getElementById(inputId) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
};

export const createRenamedFile = (originalFile: File, newName: string): File => {
    return new File(
        [originalFile.slice(0, originalFile.size, originalFile.type)],
        newName,
        { type: originalFile.type }
    );
};
export const generateFileIdentifier = (file: File): string => {
    return `${file.name}_${file.size}`;
};

/**
 * Check if a file is a Word document
 */
export const isWordFile = (file: File): boolean => {
    const wordTypes = [
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.ms-word.document.macroEnabled.12', // .docm
    ];
    return wordTypes.includes(file.type) || 
           file.name.toLowerCase().endsWith('.doc') || 
           file.name.toLowerCase().endsWith('.docx') || 
           file.name.toLowerCase().endsWith('.docm');
};

/**
 * Check if all files in an array are Word documents
 */
export const areAllFilesWord = (files: File[]): boolean => {
    return files.every(file => isWordFile(file));
};