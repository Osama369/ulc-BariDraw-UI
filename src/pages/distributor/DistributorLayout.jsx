import React from "react";
import { Outlet } from "react-router-dom";
import DistributorSidebar from "../../components/DistributorSidebar";
import LogoutButton from "../../components/LogoutButton";

const DistributorLayout = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <DistributorSidebar />
      
      {/* Main Content */}
      <div className="flex flex-col flex-grow">
        {/* Header */}
        <header className="bg-white shadow-sm py-4 px-6 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">Distributor Dashboard</h1>
          <div className="flex items-center gap-4">
            <LogoutButton role="distributor" />
          </div>
        </header>
        
        {/* Content */}
        <main className="flex-grow p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DistributorLayout;