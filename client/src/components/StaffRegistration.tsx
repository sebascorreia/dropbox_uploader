import React, { useState, useEffect } from 'react';

interface Company {
    id: number;
    name: string;
}

interface Staff {
    id: number;
    name: string;
    company_id: number;
    role: string;
    folder_path: string;
}

interface StaffRegistrationProps {
    onRegistrationSuccess: (staff: Staff) => void;
}

const StaffRegistration: React.FC<StaffRegistrationProps> = ({ onRegistrationSuccess }) => {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [formData, setFormData] = useState({
        name: '',
        company_id: '',
        role: ''
    });
    const [loading, setLoading] = useState(false);

    // Fetch companies on component mount
    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        try {
            const response = await fetch('http://localhost:5000/companies', {
                credentials: 'include' // Add this line too
            });
            const result = await response.json();
            
            if (result.success) {
                setCompanies(result.companies);
            } else {
                alert('Failed to load companies');
            }
        } catch (error) {
            alert('Error loading companies: ' + (error as Error).message);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('http://localhost:5000/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: formData.name,
                    company_id: parseInt(formData.company_id),
                    role: formData.role
                }),
            });

            const result = await response.json();

            if (result.success) {
                const staff: Staff = {
                    id: result.staff_id,
                    name: formData.name,
                    company_id: parseInt(formData.company_id),
                    role: formData.role,
                    folder_path: result.folder_path
                };
                onRegistrationSuccess(staff);
            } else {
                alert('Registration failed: ' + result.message);
            }
        } catch (error) {
            alert('Registration error: ' + (error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
            <h2>Staff Registration</h2>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Full Name:</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Company:</label>
                    <select
                        value={formData.company_id}
                        onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value="">Select Company</option>
                        {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                                {company.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Role:</label>
                    <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value="">Select Role</option>
                        <option value="survey">Survey</option>
                        <option value="install">Install</option>
                        <option value="maintenance">Maintenance</option>
                    </select>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loading ? 'Registering...' : 'Register'}
                </button>
            </form>
        </div>
    );
};

export default StaffRegistration;