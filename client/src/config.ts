const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://dropboxuploader-production-13cc.up.railway.app'  // Replace with your Railway URL
  : 'http://localhost:5000';

export default API_BASE_URL;