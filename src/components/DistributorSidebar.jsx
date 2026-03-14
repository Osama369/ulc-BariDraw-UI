import React from "react";
import { NavLink } from "react-router-dom";
import { FaHome, FaUsers, FaUserPlus, FaSignOutAlt } from "react-icons/fa";
import LogoutButton from "./LogoutButton";

const DistributorSidebar = () => {
  // Menu items array 
  const menuItems = [
    { path: "/distributor", icon: <FaHome />, label: "Dashboard" },
    { path: "/distributor/manage-users", icon: <FaUsers />, label: "Manage Users" },
    { path: "/distributor/create-user", icon: <FaUserPlus />, label: "Create User" },
    { path: "/manage-parties", icon: <FaUsers />, label: "Manage Parties" },
  ];

  return (
    <div className="bg-blue-800 text-white w-64 flex flex-col">
      {/* Logo/brand section */}
      <div className="p-4 border-b border-blue-700">
        <h1 className="text-xl font-bold">Distributor Panel</h1>
      </div>
      
      {/* Navigation menu */}
      <nav className="flex-grow p-4">
        <ul className="space-y-2">
          {menuItems.map((item, index) => (
            <li key={index}>
              <NavLink 
                to={item.path} 
                end={item.path === "/distributor"}
                className={({ isActive }) =>
                  `flex items-center gap-2 p-2 rounded-md transition-colors ${
                    isActive ? "bg-blue-600" : "hover:bg-blue-700"
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      {/* Logout section at bottom of sidebar */}
      <div className="p-4 border-t border-blue-700">
        <LogoutButton 
          role="distributor"
          className="w-full justify-center p-2 bg-blue-700 hover:bg-blue-600 rounded-md transition-colors" 
        />
      </div>
    </div>
  );
};

export default DistributorSidebar;