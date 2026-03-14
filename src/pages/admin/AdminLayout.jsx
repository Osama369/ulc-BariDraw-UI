import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import LogoutButton from '../../components/LogoutButton';

const AdminLayout = () => {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-col flex-grow">
        {/* Header */}
        <header className="bg-white shadow-sm py-4 px-6 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            {/* Admin profile or other header items */}
            <LogoutButton />
          </div>
        </header>
        <div className="flex-1 p-6 bg-gray-100">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
