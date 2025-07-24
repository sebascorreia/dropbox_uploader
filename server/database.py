import sqlite3
import os
from dotenv import load_dotenv
load_dotenv()

DATABASE_FILE = os.getenv("DATABASE_FILE")

def get_db_connection():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
                CREATE TABLE IF NOT EXISTS companies(
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   name TEXT UNIQUE NOT NULL,
                   contact_email TEXT,
                   contact_phone TEXT,
                   address TEXT,
                   is_active BOOLEAN DEFAULT 1,
                   created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                   )
            ''')
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS staff (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        company_id INTEGER NOT NULL,
                        role TEXT NOT NULL,
                        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        folder_path TEXT,
                        is_active BOOLEAN DEFAULT 1,
                        FOREIGN KEY (company_id) REFERENCES companies(id)
                   )
                ''')
    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS projects(
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        address TEXT NOT NULL,
                        postcode TEXT NOT NULL,
                        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS file_uploads(
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        staff_id INTEGER,
                        project_id INTEGER,
                        filename TEXT NOT NULL,
                        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        file_path TEXT NOT NULL,
                        FOREIGN KEY (staff_id) REFERENCES staff(id),
                        FOREIGN KEY (project_id) REFERENCES projects(id)
                   )
                ''')
    conn.commit()
    conn.close()
    add_company("Emerald Green Energy", "info@egreen.co.uk", "08009991590", "One Canada Square, Level 8, London, E14 5AB")
    print("Database initialized successfully!")
def add_company(name, contact_email=None, contact_phone=None, address=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
                    INSERT INTO companies (name, contact_email, contact_phone, address)
                    VALUES(?,?,?,?)
                       ''', (name, contact_email, contact_phone, address))
        conn.commit()
        company_id= cursor.lastrowid
        conn.close()
        return company_id
    except sqlite3.IntegrityError:
        conn.close()
        return None
def add_staff(name, company_id, role):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Generate folder path based on role and company
        cursor.execute('SELECT name FROM companies WHERE id = ?', (company_id,))
        company = cursor.fetchone()
        company_name = company['name'].replace(' ', '_')
        
        folder_path = f"/{role.title()}/{company_name}"
        
        cursor.execute('''
            INSERT INTO staff (name, company_id, role, folder_path)
            VALUES (?, ?, ?, ?)
        ''', (name, company_id, role, folder_path))
        
        conn.commit()
        staff_id = cursor.lastrowid
        conn.close()
        return staff_id, folder_path
    except sqlite3.IntegrityError:
        conn.close()
        return None, None
    
def add_project(address, postcode):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO projects (address, postcode)
        VALUES (?, ?)
    ''', (address, postcode))
    
    conn.commit()
    project_id = cursor.lastrowid
    conn.close()
    return project_id
def add_file_upload(staff_id, project_id, filename, file_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO file_uploads (staff_id, project_id, filename, file_path)
        VALUES (?, ?, ?, ?)
    ''', (staff_id, project_id, filename, file_path))
    
    conn.commit()
    upload_id = cursor.lastrowid
    conn.close()
    return upload_id
    
def get_companies():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM companies WHERE is_active = 1 ORDER BY name')
    companies = cursor.fetchall()
    conn.close()
    return companies
def get_staff():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM staff WHERE is_active = 1 ORDER BY name')
    staff = cursor.fetchall()
    conn.close()
    return staff
def get_projects():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM projects WHERE is_active = 1 ORDER BY name')
    projects = cursor.fetchall()
    conn.close()
    return projects

if __name__ == '__main__':
    init_database()

    add_company("Emerald Green Energy", "info@egreen.co.uk", "08009991590", "One Canada Square, Level 8, London, E14 5AB")
    add_company("ABC Insulation Ltd", "contact@abcinsulation.co.uk")
    add_company("Solar Pro Installations", "info@solarpro.com")
    print("Sample companies added!")