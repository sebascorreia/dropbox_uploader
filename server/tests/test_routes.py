import requests
import os
from database import add_company

BASE_URL = "http://localhost:5000"

def test_companies():
    response = requests.get(f"{BASE_URL}/companies")
    print("Companies:", response.json())

def test_register():
    data = {
        "name": "Test User",
        "company_id": 1,
        "role": "survey"
    }
    response = requests.post(f"{BASE_URL}/register", json=data)
    print("Register:", response.json())
    return response.json().get('staff_id')

def test_submit_files(staff_id):
    # Look for test.txt in parent directory (server folder)
    test_file_path = os.path.join(os.path.dirname(__file__), '..', 'test.txt')
    files = {'files': open(test_file_path, 'rb')}
    data = {
        'staff_id': staff_id,
        'address': '123 Test Street',
        'postcode': 'SW1A 1AA',
        'file_type': 'Documents'
    }
    response = requests.post(f"{BASE_URL}/submit-files", files=files, data=data)
    print("Submit Files:", response.json())

if __name__ == "__main__":
    print("Testing Flask routes...")
    add_company("Test Company Ltd", "test@company.com", "01234567890", "London, UK")
    test_companies()
    staff_id = test_register()
    if staff_id:
        test_submit_files(staff_id)