import React, { useState, useEffect } from "react";
import axios from "axios";
import { useDispatch } from "react-redux";
import { showLoading, hideLoading } from "../../redux/features/alertSlice";
import toast from 'react-hot-toast';
import UserTable from "../../components/UserTable";
import UserForm from "../../components/UserForm";
import { FaPlus } from 'react-icons/fa';

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();
  const [showOnlyDistributors, setShowOnlyDistributors] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
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
      setError(err.response?.data?.message || "Failed to load users");
      toast.error(err.response?.data?.message || "Failed to load users");
      setUsers([]); // Reset to empty array on error
    }).finally(() => {
      setIsLoading(false);
    });
  }

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUser(null);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user || null);
    setShowUserModal(true);
  };

  const handleSaveUser = async (userData) => {
    try {
      dispatch(showLoading());
      const token = localStorage.getItem("adminToken");

      if (editingUser && editingUser._id) {
        await axios.patch(`/api/v1/users/${editingUser._id}`, userData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Distributor updated successfully');
      } else {
        await axios.post('/api/v1/users/create-user', userData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Distributor created successfully');
      }

      closeUserModal();
      fetchUsers();
    } catch (err) {
      console.error('Error saving distributor:', err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to save distributor');
    } finally {
      dispatch(hideLoading());
    }
  };

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
    fetchUsers();
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2 flex-wrap">
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

                <button
                  onClick={openCreateModal}
                  className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 shrink-0"
                >
                  <FaPlus size={12} />
                  Add Distributor
                </button>
              </div>
              <UserTable 
                users={users} 
                toggleStatus={toggleStatus}
                deleteUser={deleteUser}
                showOnlyDistributors={showOnlyDistributors}
                onEditUser={openEditModal}
              />
            </div>
          )}

          {showUserModal && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg w-full max-w-6xl max-h-[95vh] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h2 className="text-xl font-semibold text-gray-800">
                    {editingUser ? 'Edit Distributor' : 'Add Distributor'}
                  </h2>
                  <button onClick={closeUserModal} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>

                <div className="p-4">
                  <UserForm
                    initialData={editingUser || {}}
                    isEditing={!!editingUser}
                    onSubmit={handleSaveUser}
                    onCancel={closeUserModal}
                  />
                </div>
              </div>
            </div>
          )}
    </div>;
}

export default ManageUsers;