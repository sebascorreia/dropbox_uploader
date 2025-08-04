import { useState } from 'react';
import DropboxAuth from './components/DropboxAuth';
import StaffRegistration from './components/StaffRegistration';
import FileSubmission from './components/FileSubmission';
import EligibilitySubmission from './components/EligibilitySubmission';
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

  // Determine which submission component to show based on role
  const renderSubmissionComponent = () => {
    if (!currentStaff) return null;
    
    // For Eligibility staff, show the specialized form
    if (currentStaff.role === 'eligibility') {
      return <EligibilitySubmission staff={currentStaff} onBack={handleBack} />;
    }
    
    // For all other roles, show the standard form
    return <FileSubmission staff={currentStaff} onBack={handleBack} />;
  }

  return (
    <div className="App">
      <h1>E-Green File Management System</h1>
      
      {!dropboxConnected ? (
        <DropboxAuth onAuthSuccess={handleDropboxAuth} />
      ) : !currentStaff ? (
        <StaffRegistration onRegistrationSuccess={handleRegistrationSuccess} />
      ) : (
        renderSubmissionComponent()
      )}
    </div>
  );
}

export default App;