import os
import dropbox
import tempfile
from helpers.path_creation import build_folder_path
from helpers.document_converter import convert_word_to_pdf, convert_image_to_pdf, WORD_EXTS,IMAGE_EXTS
SHARED_SURVEY_TO_ELIGIBILITY = {
    "COUNCIL_TAX": "Council_Tax.pdf",
    "FLEX_FORM": "Flex_Form.pdf",
    "LAND_REGISTRATION": "Land_Registration.pdf",
    "NHS_REFERRAL": "NHS_Referral.pdf",
    "UTILITY_BILL": "Utility_Bill.pdf",
    "LA_DECLARATION": "LA_Declaration.pdf"
}


def copy_file_to_eligibility(dbx, company_name: str, address: str, postcode: str,
                             src_filename: str, file_bytes: bytes,
                             target_override: str | None = None,
                             user_requested_pdf: bool = True):
    """
    Mirror selected Survey/EPR uploads into Eligibility.
    - Convert to PDF unless (a) already PDF or (b) Flex Form Word file and user chose not to convert.
    - Flex Form can stay as Word or be PDF.
    - If src_filename is already a unique variant (e.g., Council_Tax_2.pdf), mirror with that name.
    """
    base_upper = os.path.splitext(src_filename)[0].upper()
    ext = os.path.splitext(src_filename)[1].lower()

    # Determine canonical target name (PDF by default)
    if target_override:
        target_name = target_override
    else:
        canonical = None
        for key, mapped in SHARED_SURVEY_TO_ELIGIBILITY.items():
            # Use exact match only for canonical, not startswith
            if base_upper == key:
                canonical = mapped
                break
        if not canonical:
            # Not a mirrored doc, but allow unique variants (e.g., LA_Declaration_1.pdf)
            # Only mirror if src_filename starts with a known key (for grouping)
            for key in SHARED_SURVEY_TO_ELIGIBILITY:
                if base_upper.startswith(key):
                    canonical = SHARED_SURVEY_TO_ELIGIBILITY[key]
                    break
            if not canonical:
                return  # not a mirrored doc

        # If src_filename matches canonical, use canonical; else, use src_filename (unique variant)
        if src_filename.lower() == canonical.lower():
            target_name = canonical
        else:
            target_name = src_filename

    is_flex_form = base_upper.startswith('FLEX_FORM')

    # Decide conversion
    needs_conversion = False
    output_pdf_bytes = None
    final_ext = '.pdf'

    if ext == '.pdf':
        # Already PDF
        pass
    else:
        if is_flex_form and not user_requested_pdf:
            # Keep original Word doc for Flex Form
            final_ext = ext
            target_name = target_name.replace('.pdf', ext)
        else:
            # Convert non-PDF to PDF
            needs_conversion = True

    if needs_conversion:
        try:
            if ext in WORD_EXTS:
                with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_word:
                    tmp_word.write(file_bytes)
                    tmp_word_path = tmp_word.name
                pdf_out = tmp_word_path + ".pdf"
                convert_word_to_pdf(tmp_word_path, pdf_out)
                with open(pdf_out, 'rb') as f:
                    output_pdf_bytes = f.read()
                # Always keep the unique base name, just change extension to .pdf
                target_name = os.path.splitext(target_name)[0] + '.pdf'
            elif ext in IMAGE_EXTS:
                with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_img:
                    tmp_img.write(file_bytes)
                    tmp_img_path = tmp_img.name
                pdf_out = tmp_img_path + ".pdf"
                convert_image_to_pdf(file_bytes, pdf_out)
                with open(pdf_out, 'rb') as f:
                    output_pdf_bytes = f.read()
                target_name = os.path.splitext(target_name)[0] + '.pdf'
            else:
                # Unsupported for auto conversion; skip mirror
                return
        except Exception as e:
            print(f"[Eligibility mirror] Conversion failed for {src_filename}: {e}")
            return

    data_to_upload = output_pdf_bytes if output_pdf_bytes else file_bytes

    eligibility_folder = build_folder_path(
        'Eligibility',
        company_name,
        '',
        address,
        postcode,
        ''
    )
    dest_path = f"{eligibility_folder}/{target_name}"

    try:
        dbx.files_upload(data_to_upload, dest_path, mode=dropbox.files.WriteMode.overwrite)
        print(f"[Eligibility mirror] Mirrored {src_filename} -> {dest_path}")
    except Exception as e:
        print(f"[Eligibility mirror] Failed copying {src_filename} -> {dest_path}: {e}")


    data_to_upload = output_pdf_bytes if output_pdf_bytes else file_bytes

    eligibility_folder = build_folder_path(
        'Eligibility',
        company_name,
        '',
        address,
        postcode,
        ''
    )
    dest_path = f"{eligibility_folder}/{target_name}"

    try:
        dbx.files_upload(data_to_upload, dest_path, mode=dropbox.files.WriteMode.overwrite)
        print(f"[Eligibility mirror] Mirrored {src_filename} -> {dest_path}")
    except Exception as e:
        print(f"[Eligibility mirror] Failed copying {src_filename} -> {dest_path}: {e}")
def remove_mirrored_if_shared(dbx, original_path: str):
    # ...existing code unchanged...
    try:
        parts = original_path.strip('/').split('/')
        if len(parts) < 3:
            return
        role = parts[0].upper()
        company = parts[1]
        filename = parts[-1]
        base_upper = os.path.splitext(filename)[0].upper()

        eligibility_folder = None
        target_name = None

        if role == 'SURVEY' and len(parts) >= 6 and parts[-2].upper() == 'DOCUMENTS':
            address_postcode = parts[3]
            for key, mapped in SHARED_SURVEY_TO_ELIGIBILITY.items():
                if base_upper.startswith(key):
                    # Handle possible original flex form word extension
                    if key == 'FLEX_FORM' and not filename.lower().endswith('.pdf'):
                        # Mirror name may have docx
                        mapped = mapped.replace('.pdf', os.path.splitext(filename)[1])
                    target_name = mapped
                    break
            if target_name:
                eligibility_folder = f"/ELIGIBILITY/{company}/{address_postcode}"
        elif role == 'EPR' and len(parts) >= 5 and parts[-2].upper() == 'PRE':
            if base_upper.startswith('EPR'):
                address_postcode = parts[2]
                target_name = "EPR.pdf"
                eligibility_folder = f"/ELIGIBILITY/{company}/{address_postcode}"

        if eligibility_folder and target_name:
            dest_path = f"{eligibility_folder}/{target_name}"
            try:
                dbx.files_delete_v2(dest_path)
                print(f"[Eligibility mirror] Removed mirrored file {dest_path}")
            except dropbox.exceptions.ApiError as e:
                if not (hasattr(e.error, 'is_path_lookup') and e.error.is_path_lookup()):
                    print(f"[Eligibility mirror] Could not delete {dest_path}: {e}")
    except Exception as e:
        print(f"[Eligibility mirror] remove_mirrored_if_shared error: {e}")