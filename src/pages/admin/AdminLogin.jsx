import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { showLoading, hideLoading } from '../../redux/features/alertSlice';
import toast from 'react-hot-toast';

const AdminLogin = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector(state => state.alertSlice);

  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    dispatch(showLoading());

    try {
      const response = await axios.post('/api/v1/auth/admin-login', formData);

      if (response.status === 200) {
        localStorage.setItem('adminToken', response.data.token);
        toast.success(response.data?.message || 'Admin logged in successfully');
        navigate('/admin'); // Redirect to admin dashboard
      }
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      setError(message);
      toast.error(message);
    } finally {
      dispatch(hideLoading());
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-white text-center text-2xl font-semibold mb-4">Admin Login</h2>
        
        {error && <p className="text-red-500 text-center">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col">
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Username"
            className="p-2 rounded bg-gray-700 text-white border border-gray-600 mb-3"
            required
          />
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Password"
            className="p-2 rounded bg-gray-700 text-white border border-gray-600 mb-3"
            required
          />
          <button 
            type="submit" 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-400"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
