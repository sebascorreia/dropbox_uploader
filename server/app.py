from flask import Flask, request, jsonify, session, redirect, make_response
from flask_cors import CORS
from dotenv import load_dotenv
import dropbox, os, secrets
from database import get_companies, add_staff, add_project, add_file_upload, init_database, get_db_connection
import tempfile
import traceback
import time
from helpers.path_creation import build_folder_path
from werkzeug.utils import secure_filename
from helpers.document_converter import convert_word_to_pdf, merge_pdfs, is_word_conversion_available
from helpers.shared_file_uploader import copy_file_to_eligibility, remove_mirrored_if_shared



load_dotenv()
app = Flask(__name__)
PORT = int(os.environ.get('PORT',5000))


init_database()
app.secret_key = os.getenv('SECRET_KEY', secrets.token_hex(16))

# Configure session cookies for production
app.config.update(
    SESSION_COOKIE_SECURE=True,  # Only over HTTPS
    SESSION_COOKIE_HTTPONLY=True,  # No JS access
    SESSION_COOKIE_SAMESITE='None',  # Cross-site cookies
    PERMANENT_SESSION_LIFETIME=86400  # 24 hours
)

DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI")

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "https://dropbox-uploader.vercel.app"
}

CORS(app, supports_credentials=True, origins=list(ALLOWED_ORIGINS))

@app.after_request
def add_cors_headers(resp):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS,PUT,DELETE"
    return resp


@app.route('/auth/dropbox', methods=['GET'])
def dropbox_auth():
    """Start Dropbox OAuth flow"""
    auth_flow = dropbox.DropboxOAuth2FlowNoRedirect(DROPBOX_APP_KEY, DROPBOX_APP_SECRET)
    authorize_url = auth_flow.start()
    
    return jsonify({
        "success": True,
        "authorize_url": authorize_url,
        "message": "Please visit the URL to authorize the app"
    })

@app.route('/auth/dropbox/callback', methods=['POST'])
def dropbox_callback():
    """Handle Dropbox OAuth callback"""
    try:
        auth_code = request.json.get('auth_code')
        
        if not auth_code:
            return jsonify({"success": False, "message": "Authorization code required"}), 400
        
        # Create a new auth flow
        auth_flow = dropbox.DropboxOAuth2FlowNoRedirect(DROPBOX_APP_KEY, DROPBOX_APP_SECRET)
        
        try:
            oauth_result = auth_flow.finish(auth_code)
            access_token = oauth_result.access_token
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Invalid authorization code: {str(e)}"
            }), 400
        
        # Get user info
        dbx = dropbox.Dropbox(access_token)
        account_info = dbx.users_get_current_account()
        
        # Create response and set cookie
        response = make_response(jsonify({
            "success": True,
            "message": "Successfully connected to Dropbox!",
            "user_name": account_info.name.display_name,
            "user_email": account_info.email
        }))
        
        # Set secure cookie with Dropbox token
        response.set_cookie(
            'dropbox_token', 
            access_token, 
            max_age=86400,  # 24 hours
            secure=True,    # HTTPS only
            httponly=True,  # No JS access
            samesite='None' # Cross-site
        )
        
        return response
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"OAuth failed: {str(e)}"
        }), 500

@app.route('/generate-path', methods=['POST'])
def generate_path():
    """Generate the correct folder path for a given set of parameters"""
    try:
        data = request.json
        
        path = build_folder_path(
            data.get('role', ''),
            data.get('company', ''),
            data.get('staff_name', ''),
            data.get('address', ''),
            data.get('postcode', ''),
            data.get('file_type', '')
        )
        
        return jsonify({
            "success": True,
            "path": path
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Failed to generate path: {str(e)}"
        }), 500
@app.route('/dropbox-download')
def dropbox_download():
    access_token = request.cookies.get('dropbox_token')
    staff_id = request.args.get('staff_id')
    file_path = request.args.get('file_path')

    # Normalize path
    if file_path and not file_path.startswith('/'):
        file_path = '/' + file_path

    if not access_token or not staff_id or not file_path:
        return jsonify({"success": False, "message": "Missing parameters", "file_path": file_path}), 400

    dbx = dropbox.Dropbox(access_token)
    print(f"[dropbox-download] staff_id={staff_id} path={file_path}")

    try:
        md, res = dbx.files_download(file_path)
        content_type = getattr(md, "content_type", None) or 'application/octet-stream'
        return res.content, 200, {
            'Content-Type': content_type,
            'Content-Disposition': f'attachment; filename="{os.path.basename(file_path)}"'
        }
    except dropbox.exceptions.ApiError as e:
        try:
            is_not_found = e.error.is_path() and e.error.get_path().is_not_found()
        except:
            is_not_found = False
        status = 404 if is_not_found else 500
        print(f"[dropbox-download][ERROR] status={status} path={file_path} error={e}")
        return jsonify({"success": False, "message": str(e), "path": file_path}), status
    except Exception as e:
        print(f"[dropbox-download][UNEXPECTED] path={file_path} error={e}")
        return jsonify({"success": False, "message": str(e), "path": file_path}), 500
    

@app.route('/merge-pdfs', methods=['POST'])
def merge_pdfs_endpoint():
    try:
        files = request.files.getlist('files')
        staff_id = request.form.get('staff_id')
        address = request.form.get('address')
        postcode = request.form.get('postcode')
        doc_type = request.form.get('doc_type')
        output_filename = request.form.get('output_filename', 'Merged.pdf')

        if not files or not staff_id or not address or not postcode or not doc_type:
            return jsonify({"success": False, "message": "Missing required fields"}), 400

        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_paths = []
            for upl in files:
                name = upl.filename
                print(f"[merge-pdfs] incoming name={name} size={upl.content_length}")
                if not name.lower().endswith('.pdf'):
                    return jsonify({"success": False, "message": f"Non-PDF file supplied: {name}"}), 400
                temp_path = os.path.join(temp_dir, name)
                upl.save(temp_path)
                size = os.path.getsize(temp_path)
                with open(temp_path, 'rb') as fh:
                    header = fh.read(5)
                print(f"[merge-pdfs] saved temp={temp_path} size={size} header={header}")
                if size < 20:
                    return jsonify({"success": False, "message": f"File {name} too small to be PDF (size {size})"}), 400
                if header != b'%PDF-':
                    return jsonify({"success": False, "message": f"File {name} invalid PDF header {header}"}), 400
                pdf_paths.append(temp_path)

            merged_path = os.path.join(temp_dir, output_filename)
            try:
                merge_pdfs(pdf_paths, merged_path)
            except Exception as me:
                print(f"[merge-pdfs] merge failure: {me}")
                return jsonify({"success": False, "message": f"Merge failed: {me}"}), 500

            access_token = request.cookies.get('dropbox_token')
            if not access_token:
                return jsonify({"success": False, "message": "Dropbox not connected"}), 401
            dbx = dropbox.Dropbox(access_token)
            from helpers.path_creation import build_folder_path
            folder_path = build_folder_path('eligibility', '', '', address, postcode, '')
            dropbox_path = f"{folder_path}/{output_filename}"
            with open(merged_path, 'rb') as f:
                dbx.files_upload(f.read(), dropbox_path, mode=dropbox.files.WriteMode.overwrite)
            return jsonify({"success": True, "file_name": output_filename, "dropbox_path": dropbox_path}), 200
    except Exception as e:
        print("[merge-pdfs] ERROR:", e)
        return jsonify({"success": False, "message": str(e)}), 500
    
# ...existing code...
@app.route('/merge-pdfs-server', methods=['POST'])
def merge_pdfs_server():
    try:
        access_token = request.cookies.get('dropbox_token')
        data = request.json or {}
        staff_id = data.get('staff_id')
        address = data.get('address', '')
        postcode = data.get('postcode', '')
        file_names = data.get('file_names') or []
        output_filename = data.get('output_filename') or 'Merged.pdf'

        if not access_token:
            return jsonify({"success": False, "message": "Dropbox not connected"}), 401
        if not (staff_id and address and postcode and len(file_names) >= 2):
            return jsonify({"success": False, "message": "Missing fields or need >=2 files"}), 400

        # Lookup staff company for path
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT s.role, s.name, c.name as company_name
            FROM staff s JOIN companies c ON s.company_id = c.id
            WHERE s.id = ?
        """, (staff_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({"success": False, "message": "Staff not found"}), 404
        company_name = row['company_name']

        dbx = dropbox.Dropbox(access_token)

        # Build eligibility root (file_type empty)
        folder_path = build_folder_path('eligibility', company_name, '', address, postcode, '')
        if not folder_path.startswith('/'):
            folder_path = '/' + folder_path

        with tempfile.TemporaryDirectory() as temp_dir:
            local_paths = []
            for name in file_names:
                remote_path = f"{folder_path}/{name}"
                print(f"[merge-pdfs-server] downloading {remote_path}")
                try:
                    md, res = dbx.files_download(remote_path)
                except dropbox.exceptions.ApiError as e:
                    return jsonify({"success": False, "message": f"Download failed {name}: {e}"}), 400
                local_path = os.path.join(temp_dir, name)
                with open(local_path, 'wb') as out:
                    out.write(res.content)
                with open(local_path, 'rb') as chk:
                    if chk.read(5) != b'%PDF-':
                        return jsonify({"success": False, "message": f"{name} not a PDF"}), 400
                local_paths.append(local_path)

            merged_path = os.path.join(temp_dir, output_filename)
            merge_pdfs(local_paths, merged_path)

            with open(merged_path, 'rb') as mf:
                merged_bytes = mf.read()

            dest_path = f"{folder_path}/{output_filename}"
            dbx.files_upload(merged_bytes, dest_path, mode=dropbox.files.WriteMode.overwrite)
            print(f"[merge-pdfs-server] merged -> {dest_path}")

        return jsonify({"success": True, "dropbox_path": dest_path, "file_name": output_filename}), 200
    except Exception as e:
        print("[merge-pdfs-server][ERROR]", e)
        return jsonify({"success": False, "message": str(e)}), 500
# ...existing code...
@app.route('/list-files', methods=['POST'])
def list_files():
    try:
        # Get Dropbox token from cookie
        access_token = request.cookies.get('dropbox_token')
        if not access_token:
            return jsonify({
                "success": False,
                "message": "Please connect your Dropbox account first"
            }), 401
        
        # Parse request data
        data = request.json
        staff_id = data.get('staff_id')
        folder_path = data.get('folder_path')
        
        if not all([staff_id, folder_path]):
            return jsonify({
                "success": False,
                "message": "Staff ID and folder path are required"
            }), 400
        
        # Initialize Dropbox client
        dbx = dropbox.Dropbox(access_token)
        
        # Format the folder path properly
        if not folder_path.startswith('/'):
            folder_path = f"/{folder_path}"
        
        try:
            # List files in the specified path
            response = dbx.files_list_folder(folder_path)
            
            # Extract file names and organize by folder
            files = {}
            for entry in response.entries:
                if isinstance(entry, dropbox.files.FolderMetadata):
                    # It's a folder
                    folder_name = entry.name.lower()
                    files[folder_name] = []
                elif isinstance(entry, dropbox.files.FileMetadata):
                    # It's a file - add to the current folder
                    parent_folder = folder_path.split('/')[-1].lower()
                    if parent_folder not in files:
                        files[parent_folder] = []
                    files[parent_folder].append(entry.name)
            
            return jsonify({
                "success": True,
                "files": files
            }), 200
            
        except dropbox.exceptions.ApiError as e:
            # Handle "not_found" errors for non-existent folders
            if isinstance(e.error, dropbox.files.ListFolderError) and e.error.is_path() and e.error.get_path().is_not_found():
                return jsonify({
                    "success": True,
                    "files": {}  # Empty result for non-existent folder
                }), 200
            else:
                raise e  # Re-raise other API errors
                
    except Exception as e:
        
        return jsonify({
            "success": False,
            "message": f"Failed to list files: {str(e)}"
        }), 500

@app.route('/submit-files', methods=['POST'])
def submit_files():
    try:
        # Get Dropbox token from cookie instead of session
        access_token = request.cookies.get('dropbox_token')
        if not access_token:
            return jsonify({
                "success": False,
                "message": "Please connect your Dropbox account first"
            }), 401
        
        # Use user's Dropbox token
        dbx = dropbox.Dropbox(access_token)

        
        # Get form data
        generated_path = request.form.get('generated_path')
        staff_id = request.form.get('staff_id')
        address = request.form.get('address')
        postcode = request.form.get('postcode')
        file_type = request.form.get('file_type')
        files = request.files.getlist('files')

        #check for conversion flags
        convert_to_pdf = request.form.get('convert_to_pdf') == 'true'
        merge_files = request.form.get('merge_files') == 'true'
        output_filename = request.form.get('output_filename')
        convert_files = request.form.getlist('convert_files')
        should_overwrite = request.form.get('overwrite') == 'true'
        user_convert_pref = request.form.get('convert_user_pref', 'true') == 'true'

        
        
        if not staff_id or not address or not postcode or not files:
            return jsonify({
                "success": False,
                "message": "staff_id, address, postcode and at least one file are required"
            }), 400
        # Normalize optional file_type
        if file_type is None:
            file_type = ''
        
        # Add project to database
        project_id = add_project(address, postcode)
        
        # Get staff info including role and company
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.role, s.name, c.name as company_name 
            FROM staff s 
            JOIN companies c ON s.company_id = c.id 
            WHERE s.id = ?
        ''', (staff_id,))
        staff_info = cursor.fetchone()
        conn.close()
        
        if not staff_info:
            return jsonify({
                "success": False,
                "message": "Staff member not found"
            }), 404
        role= staff_info['role'].lower()
        company_name = staff_info['company_name']
        
        if role == 'epr':
            write_mode = dropbox.files.WriteMode.overwrite
        elif role == 'survey':
            write_mode = dropbox.files.WriteMode.add
        else:
            write_mode = dropbox.files.WriteMode.overwrite if should_overwrite else dropbox.files.WriteMode.add
        
        # Use the pre-generated path if provided, otherwise build it
        if generated_path:
            folder_path = generated_path
        else:
            # Use the path_creation helper
            folder_path = build_folder_path(
                staff_info['role'],
                staff_info['company_name'],
                staff_info['name'],
                address,
                postcode,
                file_type
            )
            
        uploaded_files = []
        uploaded_file_paths = []
        temp_files_to_delete = []
        try:
            # Process files for conversion if needed
            if convert_to_pdf:
                # Create a temp directory for processing
                with tempfile.TemporaryDirectory() as temp_dir:
                    # Save all files to temp directory
                    processed_paths = []
                    for upl in files:
                        orig_name = secure_filename(upl.filename)
                        temp_in = os.path.join(temp_dir, orig_name)
                        upl.save(temp_in)

                        base_no_ext, ext = os.path.splitext(orig_name)
                        ext_lower = ext.lower()
                    if ext_lower in ('.doc', '.docx', '.docm'):
                        target_pdf = os.path.join(temp_dir, base_no_ext + '.pdf')
                        try:
                            if is_word_conversion_available():
                                convert_word_to_pdf(temp_in, target_pdf)
                                processed_paths.append(target_pdf)
                            else:
                                raise RuntimeError("Conversion not available")
                        except Exception as ce:
                            print(f"[convert] Falling back to original ({orig_name}): {ce}")
                            processed_paths.append(temp_in)
                        else:
                            temp_files_to_delete.append(target_pdf)
                    # If merge requested and we have at least 2 PDFs
                if merge_files and output_filename:
                    only_pdfs = [p for p in processed_paths if p.lower().endswith('.pdf')]
                    if len(only_pdfs) >= 2:
                        merged_path = os.path.join(temp_dir, secure_filename(output_filename))
                        try:
                            merge_pdfs(only_pdfs, merged_path)
                            upload_set = [merged_path]
                        except Exception as me:
                            print(f"[merge] Failed, uploading individual files: {me}")
                            upload_set = processed_paths
                        else:
                            upload_set = [merged_path]
                    else:
                        upload_set = processed_paths
                else:
                    upload_set = processed_paths

                for local_path in upload_set:
                    with open(local_path, 'rb') as f:
                        file_data = f.read()
                    file_name = os.path.basename(local_path)
                    file_path = f"{folder_path}/{file_name}"
                    dbx.files_upload(file_data, file_path, mode=write_mode)
                    add_file_upload(staff_id, project_id, file_name, file_path)
                    uploaded_files.append(file_name)
                    uploaded_file_paths.append(file_path)
                    # Mirroring rules
                    if role == 'survey' and file_type == 'documents':
                        copy_file_to_eligibility(dbx, company_name, address, postcode, file_name, file_data, user_requested_pdf=user_convert_pref)
                    if role == 'epr' and file_type == 'pre' and file_name.upper().startswith('EPR'):
                        copy_file_to_eligibility(dbx, company_name, address, postcode, file_name, file_data, target_override='EPR.pdf', user_requested_pdf=user_convert_pref)
            else:
                # Handle individual file conversions
                for file in files:
                    file_data = file.read()
                    original_filename = file.filename
                    
                    # Check if this file needs conversion
                    # Inside the else: loop for file in files
                    if original_filename in convert_files or any(original_filename.lower().endswith(ext) for ext in ('.doc', '.docx', '.docm')):
                        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(original_filename)[1]) as temp:
                            temp.write(file_data)
                            temp_path = temp.name
                        pdf_filename = os.path.splitext(original_filename)[0] + '.pdf'
                        pdf_path = os.path.join(tempfile.gettempdir(), pdf_filename)
                        use_converted = False
                        try:
                            if is_word_conversion_available():
                                convert_word_to_pdf(temp_path, pdf_path)
                                use_converted = True
                            else:
                                raise RuntimeError("Conversion not available")
                        except Exception as ce:
                            print(f"[convert] Skip Word->PDF ({original_filename}): {ce}")
                        target_name = pdf_filename if use_converted else original_filename
                        target_bytes = open(pdf_path, 'rb').read() if use_converted else file_data
                        file_path = f"{folder_path}/{target_name}"
                        dbx.files_upload(target_bytes, file_path, mode=write_mode)
                        add_file_upload(staff_id, project_id, target_name, file_path)
                        uploaded_files.append(target_name)
                        uploaded_file_paths.append(file_path)
                        if role == 'survey' and file_type == 'documents':
                            copy_file_to_eligibility(dbx, company_name, address, postcode, target_name, target_bytes, user_requested_pdf=user_convert_pref)
                        if role == 'epr' and file_type == 'pre' and target_name.upper().startswith('EPR'):
                            copy_file_to_eligibility(dbx, company_name, address, postcode, target_name, target_bytes, target_override='EPR.pdf', user_requested_pdf=user_convert_pref)
                        try:
                            os.unlink(temp_path)
                            if use_converted and os.path.exists(pdf_path):
                                os.unlink(pdf_path)
                        except: pass
                    else:

                        # Regular file upload (no conversion)
                        file_path = f"{folder_path}/{original_filename}"
                        dbx.files_upload(file_data, file_path, mode=write_mode)
                        add_file_upload(staff_id, project_id, original_filename, file_path)
                        uploaded_files.append(original_filename)
                        uploaded_file_paths.append(file_path)

                        # Mirror correct original file (original_filename/file_data)
                        if role == 'survey' and file_type == 'documents':
                            copy_file_to_eligibility(dbx, company_name, address, postcode, original_filename, file_data, user_requested_pdf=user_convert_pref)
                        if role == 'epr' and file_type == 'pre' and original_filename.upper().startswith('EPR'):
                            copy_file_to_eligibility(dbx, company_name, address, postcode, original_filename, file_data, target_override='EPR.pdf', user_requested_pdf=user_convert_pref)
            return jsonify({
            "success": True,
            "message": f"Files uploaded successfully to {folder_path}!",
            "files": uploaded_files,
            "folder_path": folder_path
            }), 200
            
        finally:
            # Clean up any remaining temp files
            for temp_file in temp_files_to_delete:
                if os.path.exists(temp_file):
                    try:
                        os.unlink(temp_file)
                    except:
                        pass
    except Exception as e:
        print(f"Upload error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            "success": False,
            "message": f"Upload failed: {str(e)}"
            
        }), 500
@app.route('/companies', methods=['GET'])
def get_companies_route():
    try:
        companies = get_companies()
        companies_list = [{"id": company["id"], "name": company["name"]} for company in companies]
        return jsonify({
            "success": True,
            "companies": companies_list
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Failed to get companies: {str(e)}"
        }), 500
@app.route('/register', methods=['POST'])
def register_staff():
    try:
        data = request.json
        name = data.get('name')
        company_id = data.get('company_id')
        role = data.get('role')
        
        if not all([name, company_id, role]):
            return jsonify({
                "success": False,
                "message": "Name, company, and role are required"
            }), 400
        
        staff_id, folder_path = add_staff(name, company_id, role)
        
        if staff_id:
            return jsonify({
                "success": True,
                "message": "Staff registered successfully!",
                "staff_id": staff_id,
                "folder_path": folder_path
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to register staff"
            }), 500
            
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Registration failed: {str(e)}"
        }), 500
    
@app.route('/delete-file', methods=['POST'])
def delete_file():
    try:
        # Get Dropbox token from cookie
        access_token = request.cookies.get('dropbox_token')
        if not access_token:
            return jsonify({
                "success": False,
                "message": "Please connect your Dropbox account first"
            }), 401
        
        # Parse request data
        data = request.json
        file_path = data.get('file_path')
        staff_id = data.get('staff_id')
        
        if not all([file_path, staff_id]):
            return jsonify({
                "success": False,
                "message": "File path and staff ID are required"
            }), 400
        
        # Initialize Dropbox client
        dbx = dropbox.Dropbox(access_token)
        
        # Format the file path properly
        if not file_path.startswith('/'):
            file_path = f"/{file_path}"
        
        # Delete the file
        dbx.files_delete_v2(file_path)
        
        # Remove from database too
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM file_uploads WHERE file_path = ? AND staff_id = ?', 
                      (file_path, staff_id))
        conn.commit()
        conn.close()
        remove_mirrored_if_shared(dbx, file_path)
        return jsonify({
            "success": True,
            "message": "File deleted successfully"
        }), 200
        
    except dropbox.exceptions.ApiError as e:
        return jsonify({
            "success": False,
            "message": f"Dropbox API error: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Failed to delete file: {str(e)}"
        }), 500
    
@app.route('/staff-info', methods=['POST'])
def get_staff_info():
    try:
        data = request.json
        staff_id = data.get('staff_id')
        
        if not staff_id:
            return jsonify({
                "success": False,
                "message": "Staff ID is required"
            }), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.name, s.role, c.name as company_name 
            FROM staff s 
            JOIN companies c ON s.company_id = c.id 
            WHERE s.id = ?
        ''', (staff_id,))
        staff_info = cursor.fetchone()
        conn.close()
        
        if not staff_info:
            return jsonify({
                "success": False,
                "message": "Staff member not found"
            }), 404
        
        return jsonify({
            "success": True,
            "name": staff_info['name'],
            "role": staff_info['role'],
            "company": staff_info['company_name']
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Failed to get staff info: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=PORT)