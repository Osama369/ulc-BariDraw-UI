import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch } from "react-redux";
import { showLoading, hideLoading } from "../../redux/features/alertSlice";
import toast from 'react-hot-toast';
import UserForm from "../../components/UserForm";

const EditUser = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setError("");
        // dispatch(showLoading());
        
        const token = localStorage.getItem("adminToken");
        const response = await axios.get(`/api/v1/users/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        setUserData(response.data);
        console.log("Fetched user data:", response.data);
      } catch (error) {
        console.error("Error fetching user:", error);
        setError(error.response?.data?.message || "Failed to load user data");
        toast.error(error.response?.data?.message || "Failed to load user data");
      } finally {
        setIsLoading(false);
        // dispatch(hideLoading());
      }
    };

    fetchUser();
  }, [id, dispatch]);

  const handleUpdateUser = async (updatedData) => {
    try {
      setError("");
      dispatch(showLoading());
      
      const token = localStorage.getItem("adminToken");
      await axios.patch(
        `/api/v1/users/${id}`,
        updatedData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      dispatch(hideLoading());
      toast.success("User updated successfully!");
      navigate("/admin/manage-users");
    } catch (error) {
      dispatch(hideLoading());
      setError(error.response?.data?.message || "Failed to update user");
      toast.error(error.response?.data?.message || "Failed to update user");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Edit User</h1>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : userData ? (
        <UserForm 
          initialData={userData} 
          onSubmit={handleUpdateUser} 
          isEditing={true}
        />
      ) : (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4">
          <p>User not found or you don't have permission to edit this user.</p>
        </div>
      )}
    </div>
  );
};

export default EditUser;