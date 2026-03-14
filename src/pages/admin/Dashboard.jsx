import React from "react";

const Dashboard = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-4 shadow-md rounded-md">
          <h2 className="text-lg font-semibold">Total Users</h2>
          <p className="text-2xl">150</p>
        </div>
        <div className="bg-white p-4 shadow-md rounded-md">
          <h2 className="text-lg font-semibold">Active Users</h2>
          <p className="text-2xl">120</p>
        </div>
        <div className="bg-white p-4 shadow-md rounded-md">
          <h2 className="text-lg font-semibold">Suspended Users</h2>
          <p className="text-2xl">30</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
