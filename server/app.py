from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import dropbox, os
from database import get_companies, add_staff, add_project, add_file_upload, init_database
load_dotenv()
app = Flask(__name__)
CORS(app)
init_database()
DROPBOX_TOKEN = os.getenv("DROPBOX_TOKEN")
dbx = dropbox.Dropbox(DROPBOX_TOKEN)
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
def submit_files():
    try:
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
        
        # Clean address for folder name
        clean_address = address.replace(' ', '_').replace(',', '').replace('/', '_')
        
        # Get staff folder path (from registration)
        # For MVP, we'll build the path: /Role/Company/Address/FileType/
        folder_path = f"/{file_type.title()}/{clean_address}"
        
        uploaded_files = []
        
        for file in files:
            # Create full file path
            file_path = f"{folder_path}/{file.filename}"
            
            # Upload to Dropbox
            dbx.files_upload(file.read(), file_path, mode=dropbox.files.WriteMode.overwrite)
            
            # Record in database
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