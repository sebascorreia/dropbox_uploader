export const formatAddressForPath = (address: string, postcode: string): string => {
    return `${address.replace(/[^a-zA-Z0-9]/g, '_')}_${postcode.replace(/\s+/g, '')}`;
};

export const getReadableFileSize = (size: number): string => {
    if (size < 1024) {
        return `${size} B`;
    } else if (size < 1024 * 1024) {
        return `${Math.round(size / 1024)} KB`;
    } else {
        return `${Math.round(size / (1024 * 1024) * 10) / 10} MB`;
    }
};

export const checkUnassignedGroups = (groups: Array<{type: string}>): boolean => {
    return groups.some(group => !group.type);
};

export const validateAddressInfo = (address: string, postcode: string): boolean => {
    return Boolean(address.trim() && postcode.trim());
};

export const showUploadResultAlert = (successCount: number, totalCount: number): void => {
    if (successCount === totalCount) {
        alert(`Successfully uploaded ${successCount} document${successCount !== 1 ? 's' : ''}!`);
    } else {
        alert(`Uploaded ${successCount} out of ${totalCount} document${totalCount !== 1 ? 's' : ''}. Please check errors and try again for failed uploads.`);
    }
};

export const getButtonStyle = (
    isActive: boolean, 
    isDisabled: boolean = false,
    customStyle: Record<string, string> = {}
): React.CSSProperties => {
    return {
        backgroundColor: isActive ? '#3498db' : '#566573',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '10px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.7 : 1,
        ...customStyle
    };
};