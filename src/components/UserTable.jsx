import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FaEdit, FaTrash, FaToggleOn, FaToggleOff } from "react-icons/fa";

const UserTable = ({ users, toggleStatus, deleteUser, showOnlyDistributors = true, onEditUser }) => {
  const [expanded, setExpanded] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const displayedUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return showOnlyDistributors ? users.filter((u) => u.role === 'distributor') : users;
  }, [users, showOnlyDistributors]);

  const totalPages = Math.max(1, Math.ceil(displayedUsers.length / rowsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [showOnlyDistributors, rowsPerPage, users]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return displayedUsers.slice(start, start + rowsPerPage);
  }, [displayedUsers, currentPage, rowsPerPage]);

  const mainColCount = showOnlyDistributors ? 10 : 9;

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helper to find children (users created by a distributor)
  const findChildren = (parentId) => {
    if (!users || users.length === 0) return [];
    return users.filter(u => u.createdBy && String(u.createdBy) === String(parentId));
  };

  return (
    <div className="space-y-3">
      <div className="max-h-[62vh] overflow-auto app-scroll bg-white border border-gray-200 shadow-md rounded-lg">
      <table className="w-full min-w-[1100px]">
        <thead className="bg-gray-50 sticky top-0 z-10">
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
          {pagedUsers.length === 0 ? (
            <tr>
              <td colSpan={mainColCount} className="px-6 py-6 text-center text-sm text-gray-500">
                No users found for current filter.
              </td>
            </tr>
          ) : (
            pagedUsers.map((user) => {
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
                      {typeof onEditUser === 'function' ? (
                        <button
                          onClick={() => onEditUser(user)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit user"
                        >
                          <FaEdit size={16} />
                        </button>
                      ) : (
                        <Link
                          to={`/admin/edit-user/${user._id}`}
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
          })
          )}
        </tbody>
      </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="text-sm text-gray-600">
          Showing {displayedUsers.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}
          {' '}-{' '}
          {Math.min(currentPage * rowsPerPage, displayedUsers.length)} of {displayedUsers.length}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="rows-per-page">Rows</label>
          <select
            id="rows-per-page"
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value) || 25)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>

          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-gray-700">Page {currentPage} / {totalPages}</span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};


export default UserTable;
