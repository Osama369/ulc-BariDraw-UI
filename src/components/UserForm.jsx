import React, { useState } from "react";
import { FaUser, FaEnvelope, FaPhone, FaCity, FaKey, FaEye, FaEyeSlash, FaIdBadge, FaMoneyBill, FaCalculator } from "react-icons/fa";
import { toast } from "react-hot-toast";

const UserForm = ({ onSubmit, initialData = {}, isEditing = false, theme, onCancel }) => {
  const [formData, setFormData] = useState({
    username: initialData.username || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    city: initialData.city || "",
    dealerId: initialData.dealerId || "",
    balance: initialData.balance || 0,
    isActive: initialData.isActive !== undefined ? initialData.isActive : true,
    singleFigure: initialData.singleFigure || 0,
    doubleFigure: initialData.doubleFigure || 0,
    tripleFigure: initialData.tripleFigure || 0,
    fourFigure: initialData.fourFigure || 0,
    hinsaMultiplier: initialData.hinsaMultiplier || 0,
    akraMultiplier: initialData.akraMultiplier || 0,
    tandolaMultiplier: initialData.tandolaMultiplier || 0,
    pangoraMultiplier: initialData.pangoraMultiplier || 0,
    commission: initialData.commission || 0,
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Validate passwords match if password field is filled
    if (formData.password && formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }

    // Client-side validation: dealerId format (if provided) must be 4-10 alphanumeric chars
    if (formData.dealerId && !/^[A-Za-z0-9]{4,10}$/.test(formData.dealerId)) {
      toast.error('Dealer ID must be 4-10 alphanumeric characters');
      return;
    }

    // Password length validation: when creating (not editing) password is required and must be >=8
    if (!isEditing) {
      if (!formData.password || formData.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
    } else {
      if (formData.password && formData.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
    }

    // Prepare data for submission
    const dataToSubmit = { ...formData };
    
    // Remove unnecessary fields
    delete dataToSubmit.confirmPassword;
    
    // Don't send password if it's empty (editing case and password not changed)
    if (!dataToSubmit.password) {
      delete dataToSubmit.password;
    }
    
    onSubmit(dataToSubmit);
  };

  // regenerateDealerId removed — dealerId must be entered manually

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-5xl h-[calc(100vh-220px)] min-h-[520px] flex flex-col p-6 rounded-lg shadow-md border border-gray-700"
      style={{ backgroundColor: theme === 'dark' ? '#1a202c' : '#fff', color: theme === 'dark' ? '#cbd5e0' : '#2d3748' }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto app-scroll pr-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaUser className="text-blue-500" /> Username:
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter username"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaEnvelope className="text-blue-500" /> Email:
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter email address"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaPhone className="text-blue-500" /> Phone:
          </label>
          <input
            type="text"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter phone number"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCity className="text-blue-500" /> City:
          </label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter city"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Single Figure Commission:
          </label>
          <input
            type="number"
            name="singleFigure"
            value={formData.singleFigure}
            onChange={handleChange}
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter single figure"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Double Figure Commission:
          </label>
          <input
            type="number"
            name="doubleFigure"
            value={formData.doubleFigure}
            onChange={handleChange}
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter double figure"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Triple Figure Commission:
          </label>
          <input
            type="number"
            name="tripleFigure"
            value={formData.tripleFigure}
            onChange={handleChange}
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter triple figure"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Four Figure Commission:
          </label>
          <input
            type="number"
            name="fourFigure"
            value={formData.fourFigure}
            onChange={handleChange}
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter four figure"
          />
        </div>

        {/* Dynamic prize multipliers for sections */}
        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Hinsa Prize:
          </label>
          <input
            type="number"
            name="hinsaMultiplier"
            value={formData.hinsaMultiplier}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="e.g. 8"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Akra Prize:
          </label>
          <input
            type="number"
            name="akraMultiplier"
            value={formData.akraMultiplier}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="e.g. 80"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Tandola Prize:
          </label>
          <input
            type="number"
            name="tandolaMultiplier"
            value={formData.tandolaMultiplier}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="e.g. 800"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Pangora Prize:
          </label>
          <input
            type="number"
            name="pangoraMultiplier"
            value={formData.pangoraMultiplier}
            onChange={handleChange}
            required
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="e.g. 8000"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaCalculator className="text-blue-500" /> Hissa:
          </label>
          <input
            type="number"
            name="commission"
            value={formData.commission}
            onChange={handleChange}
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter Commission"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaIdBadge className="text-blue-500" /> Dealer ID:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              name="dealerId"
              value={formData.dealerId}
              onChange={handleChange}
              required
              className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
              // Allow editing Dealer ID even when editing user
            />
            {/* Dealer ID must be entered manually; generation removed */}
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaMoneyBill className="text-blue-500" /> Balance:
          </label>
          <input
            type="number"
            name="balance"
            value={formData.balance}
            onChange={handleChange}
            className="w-full border rounded-md p-2 focus:ring focus:ring-blue-300"
            placeholder="Enter balance"
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaKey className="text-blue-500" /> Password:
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full border rounded-md p-2 pr-10 focus:ring focus:ring-blue-300"
              placeholder={isEditing ? "Leave blank to keep current password" : "Enter password"}
              required={!isEditing} // Only required when creating a new user
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-2 text-gray-500"
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-medium flex items-center gap-2">
            <FaKey className="text-blue-500" /> Confirm Password:
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full border rounded-md p-2 pr-10 focus:ring focus:ring-blue-300"
              placeholder={isEditing ? "Leave blank to keep current password" : "Confirm password"}
              required={!isEditing || formData.password !== ""} // Required if creating user or if password field is filled
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-2 top-2 text-gray-500"
            >
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>

          {/* User status (active/inactive) toggle - Only show when editing */}
          {isEditing && (
            <div className="space-y-2">
              <label className="font-medium flex items-center gap-2">
                Status:
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring focus:ring-blue-300"
                />
                <span className="ml-2 text-sm">
                  {formData.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-4 pt-4 flex justify-end space-x-3 border-t border-gray-700 shrink-0"
        style={{ backgroundColor: theme === 'dark' ? '#1a202c' : '#fff' }}
      >
        <button
          type="button"
          onClick={() => {
            if (typeof onCancel === 'function') {
              onCancel();
            } else {
              window.history.back();
            }
          }}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          {isEditing ? "Update User" : "Create User"}
        </button>
      </div>
    </form>
  );
};

export default UserForm;
