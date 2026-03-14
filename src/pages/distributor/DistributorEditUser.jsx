import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { showLoading, hideLoading } from '../../redux/features/alertSlice';
import toast from 'react-hot-toast';
import UserForm from '../../components/UserForm';

const DistributorEditUser = ({userId, theme}) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Fetch user data when component mounts
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setError('');
        // dispatch(showLoading());

        const token = localStorage.getItem('token');
        if (!token) {
          toast.error('You must be logged in to edit users');
          navigate('/login');
          return;
        }

        // Fetch the user data
        const response = await axios.get(`/api/v1/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        // dispatch(hideLoading());
        setUserData(response.data);
        console.log('Fetched user data:', response.data);
      } catch (error) {
        // dispatch(hideLoading());
        const errorMessage = error.response?.data?.message || 'Failed to fetch user data';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId, navigate, dispatch]);

  const handleUpdateUser = async (updatedUserData) => {
    try {
      setError('');
    //   dispatch(showLoading());

      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('You must be logged in to update users');
        navigate('/login');
        return;
      }

      // Update the user using the distributor-specific endpoint
      const response = await axios.patch(`/api/v1/users/distributor-update/${userId}`, updatedUserData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

    //   dispatch(hideLoading());
      
      // Show success message and navigate back to user management
      toast.success('User updated successfully!');
      navigate('/manage-users');
    } catch (error) {
    //   dispatch(hideLoading());
      const errorMessage = error.response?.data?.message || 'Failed to update user';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit User</h1>
        <p className="text-gray-600 mt-1">Update user details</p>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      {userData && (
        <UserForm 
          onSubmit={handleUpdateUser}
          initialData={userData}
          isEditing={true}
          theme={theme}
        />
      )}
    </div>
  );
};

export default DistributorEditUser;
