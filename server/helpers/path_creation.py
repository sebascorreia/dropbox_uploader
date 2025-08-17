def clean_string(text):
    """Standardized string cleaning for folder paths"""
    return text.replace(' ', '_').replace(',', '').replace('/', '_').replace('.', '').upper()

def build_folder_path(role, company, staff_name, address, postcode, file_type):
    """Centralized folder path construction"""
    # Clean all inputs
    clean_role = role.upper()
    clean_company = clean_string(company)
    clean_staff = clean_string(staff_name)
    clean_address = clean_string(address)
    clean_postcode = clean_string(postcode)
    combined_add_pc = f"{clean_address}_{clean_postcode}"
    
    
    if not file_type:
        return f"/{clean_role}/{clean_company}/{combined_add_pc}"
    clean_file_type = file_type.upper()
    # Build path based on role
    if role.lower() == 'survey':
        return f"/{clean_role}/{clean_company}/{clean_staff}/{combined_add_pc}/{clean_file_type}"
    
    else:
        return f"/{clean_role}/{clean_company}/{combined_add_pc}/{clean_file_type}"