import { useState } from 'react';
import DropboxAuth from './components/DropboxAuth';
import StaffRegistration from './components/StaffRegistration';
import FileSubmission from './components/FileSubmission';
import './App.css';

interface Staff {
  id: number;
  name: string;
  company_id: number;
  role: string;
  folder_path: string;
}

function App() {
  const [dropboxConnected, setDropboxConnected] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);

  const handleDropboxAuth = () => {
    setDropboxConnected(true);
  };

  const handleRegistrationSuccess = (staff: Staff) => {
    setCurrentStaff(staff);
  };

  const handleBack = () => {
    setCurrentStaff(null);
  };

  return (
    <div className="App">
      <h1>E-Green File Management System</h1>
      
      {!dropboxConnected ? (
        <DropboxAuth onAuthSuccess={handleDropboxAuth} />
      ) : !currentStaff ? (
        <StaffRegistration onRegistrationSuccess={handleRegistrationSuccess} />
      ) : (
        <FileSubmission staff={currentStaff} onBack={handleBack} />
      )}
    </div>
  );
}

export default App;