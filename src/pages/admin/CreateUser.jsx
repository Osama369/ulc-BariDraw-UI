import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch } from "react-redux";
import { showLoading, hideLoading } from "../../redux/features/alertSlice";
import toast from 'react-hot-toast';
import UserForm from "../../components/UserForm";

const CreateUser = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState("");

  const handleCreateUser = async (userData) => {
    try {
      setError("");
      dispatch(showLoading());
      
      const token = localStorage.getItem("adminToken");
      const response = await axios.post(
        "/api/v1/users/create-user",
        userData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      dispatch(hideLoading());
      toast.success("User created successfully!");
      navigate("/admin/manage-users");
    } catch (error) {
      dispatch(hideLoading());
      setError(error.response?.data?.error || "Failed to create user");
      toast.error(error.response?.data?.error || "Failed to create user");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Distributor  Account</h1>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      <UserForm onSubmit={handleCreateUser} />
    </div>
  );
};

export default CreateUser;