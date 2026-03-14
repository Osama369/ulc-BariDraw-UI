import React from "react";
import { FaSpinner } from "react-icons/fa";

const Spinner = () => {
  return (
    <div className="flex justify-center items-center h-screen bg-gray-900 text-gray-100">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 flex items-center justify-center">
        <FaSpinner className="text-blue-400 text-4xl animate-spin" />
      </div>
    </div>
  );
};

export default Spinner;