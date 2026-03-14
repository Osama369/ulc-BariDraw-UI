import React from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { showLoading, hideLoading } from '../redux/features/alertSlice';
import toast from 'react-hot-toast';
import { FaSignOutAlt } from 'react-icons/fa';

const LogoutButton = ({ role = "admin", className }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleLogout = async () => {
    try {
      dispatch(showLoading());
      
      // Set up the correct API endpoint and token based on role
      const endpoint = role === "distributor" 
        ? '/api/v1/auth/distributor-logout'
        : '/api/v1/auth/admin-logout';
      
      const tokenKey = role === "distributor" 
        ? "distributorToken" 
        : "adminToken";
      
      const token = localStorage.getItem(tokenKey);
      
      // Make logout API request
      await axios.post(endpoint, {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      // Remove token from local storage
      localStorage.removeItem(tokenKey);
      
      dispatch(hideLoading());
      toast.success('Logged out successfully');
      
      // Redirect to appropriate login page
      navigate(role === "distributor" ? '/distributor-login' : '/admin-login');
    } catch (error) {
      dispatch(hideLoading());
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  return (
    <button
      onClick={handleLogout}
      className={`flex items-center gap-2 text-red-500 hover:text-red-700 ${className || ''}`}
    >
      <FaSignOutAlt /> Logout
    </button>
  );
};

export default LogoutButton;