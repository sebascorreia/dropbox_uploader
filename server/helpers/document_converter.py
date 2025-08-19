import os
import win32com.client
import pythoncom 
import tempfile
from PIL import Image
WORD_EXTS = ('.doc', '.docx', '.docm')
IMAGE_EXTS = ('.jpg', '.jpeg', '.png')

def convert_image_to_pdf(image_bytes: bytes, out_path: str):
    with tempfile.NamedTemporaryFile(delete=False) as tmp_img:
        tmp_img.write(image_bytes)
        tmp_img_path = tmp_img.name
    try:
        img = Image.open(tmp_img_path)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        img.save(out_path, 'PDF')
    finally:
        try:
            os.unlink(tmp_img_path)
        except:
            pass
    return out_path

def convert_word_to_pdf(word_file_path, output_pdf_path=None):
    """
    Convert a Word document to PDF using Microsoft Word automation
    
    Args:
        word_file_path: Path to the Word document
        output_pdf_path: Path where the PDF will be saved (if None, creates path by replacing extension)
    
    Returns:
        The path to the generated PDF file
    """
    # If no output path is specified, replace the extension with .pdf
    if output_pdf_path is None:
        output_pdf_path = os.path.splitext(word_file_path)[0] + '.pdf'
    
    # Ensure output directory exists
    output_dir = os.path.dirname(output_pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Initialize COM
    pythoncom.CoInitialize()
    
    # Convert using Word automation
    word = None
    try:
        # Create Word application
        word = win32com.client.Dispatch('Word.Application')
        word.Visible = False  # Hide the application
        
        # Open the document
        doc = word.Documents.Open(word_file_path)
        
        # Save as PDF
        # 17 is the PDF format code in Word's SaveAs method
        doc.SaveAs(output_pdf_path, FileFormat=17)
        
        # Close the document
        doc.Close()
        
        return output_pdf_path
    except Exception as e:
        print(f"Error converting Word to PDF: {str(e)}")
        raise
    finally:
        # Make sure to close Word even if there's an error
        if word:
            word.Quit()
        # Uninitialize COM when done
        pythoncom.CoUninitialize()


def merge_pdfs(pdf_files, output_path):
    from PyPDF2 import PdfMerger
    merger = PdfMerger()
    try:
        for pdf in pdf_files:
            # Basic validation
            if not os.path.exists(pdf):
                raise ValueError(f"File missing: {pdf}")
            size = os.path.getsize(pdf)
            if size == 0:
                raise ValueError(f"Empty PDF: {pdf}")
            with open(pdf, 'rb') as fh:
                header = fh.read(5)
                if header != b'%PDF-':
                    raise ValueError(f"Invalid PDF header in {os.path.basename(pdf)}")
            # Let PyPDF2 open the path itself (safer than passing a closed handle)
            merger.append(pdf)
        with open(output_path, "wb") as f_out:
            merger.write(f_out)
        return output_path
    finally:
        merger.close()