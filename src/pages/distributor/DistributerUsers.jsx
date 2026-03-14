import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { showLoading, hideLoading } from '../../redux/features/alertSlice';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaUserPlus } from 'react-icons/fa';

const DistributerUsers = ({ onEditUser }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();
  const isMounted = useRef(true);

  // Fetch users created by the distributor
  const fetchDistributorUsers = async () => {
    try {
      // dispatch(showLoading());
      setError(null);
      
      const token = localStorage.getItem("token");
      const response = await axios.get("/api/v1/users/distributor-users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (isMounted.current) {
        if (Array.isArray(response.data)) {
          setUsers(response.data);
        } else {
          console.error("Unexpected data format:", response.data);
          setError("Received invalid data format from server");
        }
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      if (isMounted.current) {
        setError(error.response?.data?.message || "Failed to load users");
        toast.error(error.response?.data?.message || "Failed to load users");
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        // dispatch(hideLoading());
      }
    }
  };

  // Toggle user active status
  const toggleStatus = async (id) => {
    try {
      // dispatch(showLoading());
      
      const user = users.find(user => user._id === id);
      if (!user) {
        toast.error("User not found");
        return;
      }
      
      const newStatus = !user.isActive;
      const token = localStorage.getItem("token");
      
      await axios.put(
        `/api/v1/users/${id}/active`,
        { isActive: newStatus },
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
      // dispatch(hideLoading());
    }
  };

  // Delete user
  const deleteUser = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
    }
    
    try {
      // dispatch(showLoading());
      
      const token = localStorage.getItem("token");
      await axios.delete(`/api/v1/users/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      // Remove user from local state
      setUsers(prevUsers => prevUsers.filter(user => user._id !== id));
      toast.success("User deleted successfully");
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error(error.response?.data?.message || "Failed to delete user");
    } finally {
      // dispatch(hideLoading());
    }
  };

  useEffect(() => {
    // Set up cleanup function
    isMounted.current = true;
    fetchDistributorUsers();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Manage Your Users</h1>
        <div className="flex gap-2">
          <button 
            onClick={fetchDistributorUsers}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4">
          <p>You haven't created any users yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dealer ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.username}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.phone}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.city}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.dealerId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.balance}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.isActive 
                        ? "bg-green-100 text-green-800" 
                        : "bg-red-100 text-red-800"
                    }`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => toggleStatus(user._id)}
                        className={`${
                          user.isActive ? "text-green-600" : "text-red-600"
                        } hover:opacity-70`}
                        title={user.isActive ? "Deactivate" : "Activate"}
                      >
                        {user.isActive ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                      </button>
                      {onEditUser ? (
                        <button
                          onClick={() => onEditUser(user._id)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit user"
                        >
                          <FaEdit size={16} />
                        </button>
                      ) : (
                        <Link
                          to={`/edit-user/${user._id}`}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit user"
                        >
                          <FaEdit size={16} />
                        </Link>
                      )}
                      <button
                        onClick={() => deleteUser(user._id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete user"
                      >
                        <FaTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DistributerUsers;
