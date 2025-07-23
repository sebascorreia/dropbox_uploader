import React from 'react'

const FileUpload: React.FC = () => {
    const handleUpload = async (event: React.FormEvent<HTMLFormElement>) =>{
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        try{
            const res = await fetch("http://localhost:5000/upload", {
                method: "POST",
                body: formData,
            });
            const result = await res.json();

            if (result.success){
                alert(`Success: ${result.message}`);
            }else{
                alert(`Error: ${result.message}`);
            }
        } catch(error){
            alert("Upload failed: " + (error as Error).message);
        }
    };
    return(
        <div>
            <h2>Upload Files to Dropbox</h2>
            <form onSubmit={handleUpload}>
                <input type="file" name="files" multiple />
                <button type="submit">Upload</button>
            </form>
        </div>
    );
};
export default FileUpload;
