import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaEdit, FaTrash, FaToggleOn, FaToggleOff } from "react-icons/fa";

const UserTable = ({ users, toggleStatus, deleteUser, showOnlyDistributors = true }) => {
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helper to find children (users created by a distributor)
  const findChildren = (parentId) => {
    if (!users || users.length === 0) return [];
    return users.filter(u => u.createdBy && String(u.createdBy) === String(parentId));
  };

  return (
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
            {showOnlyDistributors && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clients</th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {/** Optionally show only distributors in the main table */}
          {(() => {
            const displayedUsers = showOnlyDistributors ? users.filter(u => u.role === 'distributor') : users;
            return displayedUsers.map((user) => {
              const children = findChildren(user._id).filter(c => c.role === 'user');
              return (
              <React.Fragment key={user._id}>
                <tr className="hover:bg-gray-50">
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
                  {showOnlyDistributors && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{children.length}</div>
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.role || 'user'}</div>
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
                    <div className="flex items-center space-x-2">
                      {children.length > 0 && (
                        <button
                          onClick={() => toggleExpand(user._id)}
                          className="text-sm bg-gray-100 px-2 py-1 rounded text-gray-700 hover:bg-gray-200"
                          title="View clients created by this distributor"
                        >
                          {expanded[user._id] ? 'Hide Clients' : `Clients (${children.length})`}
                        </button>
                      )}
                      <button
                        onClick={() => toggleStatus(user._id)}
                        className={`${
                          user.isActive ? "text-green-600" : "text-red-600"
                        } hover:opacity-70`}
                        title={user.isActive ? "Deactivate" : "Activate"}
                      >
                        {user.isActive ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                      </button>
                      <Link
                        to={`/admin/edit-user/${user._id}`}
                        className="text-blue-600 hover:text-blue-800"
                        title="Edit user"
                      >
                        <FaEdit size={16} />
                      </Link>
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

                {expanded[user._id] && children.length > 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan={showOnlyDistributors ? 10 : 9} className="px-6 py-4">
                      <div className="bg-white border rounded">
                        <table className="min-w-full">
                          <thead>
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Username</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Phone</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Dealer ID</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {children.map(child => (
                              <tr key={child._id} className="border-t">
                                <td className="px-4 py-2 text-sm text-gray-700">{child.username}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{child.email}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{child.phone}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{child.dealerId}</td>
                                <td className="px-4 py-2 text-sm">
                                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                    child.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {child.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          });
          })()}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;
