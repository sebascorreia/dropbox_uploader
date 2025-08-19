import os
import sys
import shutil
import tempfile
import subprocess
from typing import Optional, Sequence
from PIL import Image

WORD_EXTS = ('.doc', '.docx', '.docm')
IMAGE_EXTS = ('.jpg', '.jpeg', '.png')

# Capability flags
_HAS_WIN32 = False
try:
    if sys.platform.startswith('win'):
        import win32com.client  # type: ignore
        import pythoncom        # type: ignore
        _HAS_WIN32 = True
except ImportError:
    _HAS_WIN32 = False

_HAS_LIBRE = bool(shutil.which("soffice"))  # LibreOffice CLI
_HAS_DOCX2PDF = False
try:
    from docx2pdf import convert as docx2pdf_convert  # type: ignore
    _HAS_DOCX2PDF = True
except ImportError:
    _HAS_DOCX2PDF = False


def word_conversion_method() -> str:
    if _HAS_WIN32:
        return "win32com"
    if _HAS_LIBRE:
        return "libreoffice"
    if _HAS_DOCX2PDF:
        return "docx2pdf"
    return "none"


def is_word_conversion_available() -> bool:
    return word_conversion_method() != "none"


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
        try: os.unlink(tmp_img_path)
        except: pass
    return out_path


def _convert_word_win32(word_file_path: str, output_pdf_path: str):
    import pythoncom  # type: ignore
    import win32com.client  # type: ignore
    pythoncom.CoInitialize()
    word = None
    try:
        word = win32com.client.Dispatch('Word.Application')
        word.Visible = False
        doc = word.Documents.Open(word_file_path)
        doc.SaveAs(output_pdf_path, FileFormat=17)  # 17 = PDF
        doc.Close()
    finally:
        if word:
            word.Quit()
        pythoncom.CoUninitialize()


def _convert_word_libre(word_file_path: str, output_pdf_path: str):
    # LibreOffice exports into the directory given by --outdir retaining base name
    out_dir = os.path.dirname(output_pdf_path) or os.getcwd()
    cmd = [
        "soffice",
        "--headless",
        "--convert-to", "pdf",
        "--outdir", out_dir,
        word_file_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"LibreOffice conversion failed: {res.stderr.strip() or res.stdout.strip()}")
    # LibreOffice names output with .pdf extension automatically
    produced = os.path.join(out_dir, os.path.splitext(os.path.basename(word_file_path))[0] + ".pdf")
    if produced != output_pdf_path and os.path.exists(produced):
        # Rename/move if caller asked for a specific different path
        if produced != output_pdf_path:
            os.replace(produced, output_pdf_path)
    if not os.path.exists(output_pdf_path):
        raise RuntimeError("LibreOffice did not produce expected PDF.")


def _convert_word_docx2pdf(word_file_path: str, output_pdf_path: str):
    # docx2pdf only officially supports Word formats (not necessarily .docm)
    # It writes alongside; ensure directory exists
    out_dir = os.path.dirname(output_pdf_path) or os.getcwd()
    os.makedirs(out_dir, exist_ok=True)
    docx2pdf_convert(word_file_path, output_pdf_path)
    if not os.path.exists(output_pdf_path):
        raise RuntimeError("docx2pdf did not create PDF.")


def convert_word_to_pdf(word_file_path: str, output_pdf_path: Optional[str] = None) -> str:
    """
    Cross-platform Word->PDF:
    win32com (Windows) -> soffice (Linux/Mac) -> docx2pdf -> raise.
    """
    if output_pdf_path is None:
        output_pdf_path = os.path.splitext(word_file_path)[0] + '.pdf'
    os.makedirs(os.path.dirname(output_pdf_path) or ".", exist_ok=True)

    method = word_conversion_method()
    if method == "win32com":
        _convert_word_win32(word_file_path, output_pdf_path)
    elif method == "libreoffice":
        _convert_word_libre(word_file_path, output_pdf_path)
    elif method == "docx2pdf":
        _convert_word_docx2pdf(word_file_path, output_pdf_path)
    else:
        raise RuntimeError("Word->PDF conversion not available (install LibreOffice or docx2pdf).")
    return output_pdf_path


def merge_pdfs(pdf_files: Sequence[str], output_path: str):
    from PyPDF2 import PdfMerger
    merger = PdfMerger()
    try:
        for pdf in pdf_files:
            if not os.path.exists(pdf):
                raise ValueError(f"Missing file: {pdf}")
            if os.path.getsize(pdf) == 0:
                raise ValueError(f"Empty PDF: {pdf}")
            with open(pdf, 'rb') as fh:
                if fh.read(5) != b'%PDF-':
                    raise ValueError(f"Invalid PDF header: {os.path.basename(pdf)}")
            merger.append(pdf)
        with open(output_path, "wb") as out:
            merger.write(out)
        return output_path
    finally:
        merger.close()