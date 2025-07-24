import React, { useState } from 'react';
import API_BASE_URL from '../config';

interface DropboxAuthProps {
    onAuthSuccess: () => void;
}

const DropboxAuth: React.FC<DropboxAuthProps> = ({ onAuthSuccess }) => {
    const [authUrl, setAuthUrl] = useState<string>('');
    const [authCode, setAuthCode] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const startAuth = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/dropbox`);
            const result = await response.json();
            
            if (result.success) {
                setAuthUrl(result.authorize_url);
                window.open(result.authorize_url, '_blank');
            }
        } catch (error) {
            alert('Failed to start Dropbox authorization');
        }
    };

    const completeAuth = async () => {
        if (!authCode) {
            alert('Please enter the authorization code');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/dropbox/callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ auth_code: authCode })
            });

            const result = await response.json();
            
            if (result.success) {
                alert(`Connected to Dropbox as ${result.user_name}!`);
                onAuthSuccess();
            } else {
                alert('Authorization failed: ' + result.message);
            }
        } catch (error) {
            alert('Authorization error: ' + (error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
            <h2>Connect Your Dropbox</h2>
            <p>To use this system, please connect your Dropbox account:</p>
            
            <button 
                onClick={startAuth}
                style={{
                    padding: '10px 20px',
                    backgroundColor: '#0061ff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginBottom: '20px'
                }}
            >
                Connect Dropbox Account
            </button>

            {authUrl && (
                <div>
                    <p>After authorizing, paste the code here:</p>
                    <input
                        type="text"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        placeholder="Enter authorization code"
                        style={{ padding: '8px', marginRight: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button 
                        onClick={completeAuth}
                        disabled={loading}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? 'Connecting...' : 'Complete Connection'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default DropboxAuth;