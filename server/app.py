from flask import Flask, request, jsonify, session, redirect
from flask_cors import CORS
from dotenv import load_dotenv
import dropbox, os, secrets
from database import get_companies, add_staff, add_project, add_file_upload, init_database, get_db_connection
load_dotenv()
app = Flask(__name__)
CORS(app, supports_credentials=True,origins=['http://localhost:5173'])
init_database()
app.secret_key = os.getenv('SECRET_KEY', secrets.token_hex(16))
DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI")

@app.route('/auth/dropbox', methods=['GET'])
def dropbox_auth():
    """Start Dropbox OAuth flow"""
    auth_flow = dropbox.DropboxOAuth2FlowNoRedirect(DROPBOX_APP_KEY, DROPBOX_APP_SECRET)
    authorize_url = auth_flow.start()
    
    # Don't store the auth_flow object - we'll recreate it in callback
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
        
        # Create a new auth flow (since we can't store the previous one)
        auth_flow = dropbox.DropboxOAuth2FlowNoRedirect(DROPBOX_APP_KEY, DROPBOX_APP_SECRET)
        
        try:
            oauth_result = auth_flow.finish(auth_code)
            access_token = oauth_result.access_token
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Invalid authorization code: {str(e)}"
            }), 400
        
        # Store token in session
        session['dropbox_token'] = access_token
        
        # Get user info
        dbx = dropbox.Dropbox(access_token)
        account_info = dbx.users_get_current_account()
        
        return jsonify({
            "success": True,
            "message": "Successfully connected to Dropbox!",
            "user_name": account_info.name.display_name,
            "user_email": account_info.email
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"OAuth failed: {str(e)}"
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
@app.route('/submit-files', methods=['POST'])
@app.route('/submit-files', methods=['POST'])
def submit_files():
    try:
        # Check if user has connected Dropbox
        access_token = session.get('dropbox_token')
        if not access_token:
            return jsonify({
                "success": False,
                "message": "Please connect your Dropbox account first"
            }), 401
        
        # Use user's Dropbox token instead of yours
        dbx = dropbox.Dropbox(access_token)
        
        # ... rest of your existing submit_files code ...
        # Get form data
        staff_id = request.form.get('staff_id')
        address = request.form.get('address')
        postcode = request.form.get('postcode')
        file_type = request.form.get('file_type')
        files = request.files.getlist('files')
        
        if not all([staff_id, address, postcode, file_type, files]):
            return jsonify({
                "success": False,
                "message": "All fields are required"
            }), 400
        
        # Add project to database
        project_id = add_project(address, postcode)
        
        # Get staff info including role and company
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.role, c.name as company_name 
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
        
        # Clean address for folder name
        clean_address = address.title().replace(' ', '_').replace(',', '').replace('/', '_').replace('.', '')
        clean_company = staff_info['company_name'].replace(' ', '_').replace(',', '').replace('/', '_')
        
        # Build correct folder path
        folder_path = f"/{staff_info['role'].title()}/{clean_company}/{clean_address}/{file_type.title()}"
        
        uploaded_files = []
        
        for file in files:
            file_path = f"{folder_path}/{file.filename}"
            dbx.files_upload(file.read(), file_path, mode=dropbox.files.WriteMode.overwrite)
            add_file_upload(staff_id, project_id, file.filename, file_path)
            uploaded_files.append(file.filename)
        
        return jsonify({
            "success": True,
            "message": f"Files uploaded successfully to {folder_path}!",
            "files": uploaded_files,
            "folder_path": folder_path
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Upload failed: {str(e)}"
        }), 500

@app.route('/upload', methods = ['POST'])
def upload():
    try:
        files = request.files.getlist('files')
        uploaded_files = []
        
        for file in files:
            path = f"/AutoFolder/{file.filename}"
            dbx.files_upload(file.read(), path, mode=dropbox.files.WriteMode.overwrite)
            uploaded_files.append(file.filename)
        
        return jsonify({
            "success": True,
            "message": "Files uploaded successfully!",
            "files": uploaded_files
        }), 200
        
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Upload failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)