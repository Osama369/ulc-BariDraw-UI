import React, { useState, useEffect } from "react";
import axios from "axios";
import { useDispatch } from "react-redux";
import { showLoading, hideLoading } from "../../redux/features/alertSlice";
import toast from 'react-hot-toast';
import UserTable from "../../components/UserTable";

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();
  const [showOnlyDistributors, setShowOnlyDistributors] = useState(true);

  const fetchUsers = async () => {
    dispatch(showLoading());
    setError(null);
    setIsLoading(true);
    const token = localStorage.getItem("adminToken");

    axios.get("/api/v1/users/", {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      console.log("Got data:", res.data);
      setUsers(res.data);
    }).catch(err => {
      console.error("Error fetching users:", err);
      setError(error.response?.data?.message || "Failed to load users");
      toast.error(error.response?.data?.message || "Failed to load users");
      setUsers([]); // Reset to empty array on error
    });
  }

  const toggleStatus = async (id) => {
    try {
      dispatch(showLoading());
      
      const user = users.find(user => user._id === id);
      if (!user) {
        toast.error("User not found");
        return;
      }
      
      // Using isActive field from your schema instead of status
      const newStatus = !user.isActive;
      
      const token = localStorage.getItem("adminToken");
      
      // Fix the API call structure - send data and headers separately
      await axios.patch(
        `/api/v1/users/${id}/active`,
        { isActive: newStatus }, // This is the request body
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user._id === id ? { ...user, isActive: newStatus } : user
        )
      );
      
      toast.success(`User status updated to ${newStatus ? 'active' : 'inactive'}`);
    } catch (error) {
      console.error("Error updating user status:", error);
      toast.error(error.response?.data?.message || "Failed to update user status");
    } finally {
      dispatch(hideLoading());
    }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
      }
    
      try {
        dispatch(showLoading());
        
        const token = localStorage.getItem("adminToken");
        await axios.delete(`/api/v1/users/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        // Remove user from local state using functional update to ensure we have the latest state
        setUsers(prevUsers => prevUsers.filter(user => user._id !== id));
        toast.success("User deleted successfully");
      } catch (error) {
        console.error("Error deleting user:", error);
        toast.error(error.response?.data?.message || "Failed to delete user");
      } finally {
        dispatch(hideLoading());
      }
  };

  useEffect(() => {
    console.log("Effect run");
    fetchUsers();
    setIsLoading(false);
    dispatch(hideLoading());
  }, []);
  
  return <div>
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
              <p>{error}</p>
            </div>
          )}
      
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : !users || users.length === 0 ? (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4">
              <p>No users found.</p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center space-x-2">
                <button
                  onClick={() => setShowOnlyDistributors(true)}
                  className={`px-3 py-1 rounded ${showOnlyDistributors ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Distributors
                </button>
                <button
                  onClick={() => setShowOnlyDistributors(false)}
                  className={`px-3 py-1 rounded ${!showOnlyDistributors ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  All users
                </button>
              </div>
              <UserTable 
                users={users} 
                toggleStatus={toggleStatus}
                deleteUser={deleteUser}
                showOnlyDistributors={showOnlyDistributors}
              />
            </div>
          )}
    </div>;
}

export default ManageUsers;