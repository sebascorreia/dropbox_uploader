from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import dropbox, os
load_dotenv()
app = Flask(__name__)
CORS(app)

DROPBOX_TOKEN = os.getenv("DROPBOX_TOKEN")
dbx = dropbox.Dropbox(DROPBOX_TOKEN)

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