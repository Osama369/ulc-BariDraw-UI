import React, { useState } from "react";
import { FaUser, FaEnvelope, FaPhone, FaCity, FaKey, FaEye, FaEyeSlash, FaIdBadge } from "react-icons/fa";
import { toast } from "react-hot-toast";

const UserForm = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
    username: initialData.username || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    city: initialData.city || "",
    dealerId: initialData.dealerId || "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Dealer ID must be entered manually now. Removed auto-generation.

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }

    if (!/^[A-Za-z0-9]{4,10}$/.test(formData.dealerId)) {
      toast.error("Dealer ID must be 4-10 alphanumeric characters");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    // Remove confirmPassword before sending to API
    const { confirmPassword, ...userData } = formData;

    onSubmit(userData);
  };

  // regenerate function removed; dealerId must be entered manually by user

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block font-medium flex items-center gap-2">
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
          <label className="block font-medium flex items-center gap-2">
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
          <label className="block font-medium flex items-center gap-2">
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
          <label className="block font-medium flex items-center gap-2">
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
          <label className="block font-medium flex items-center gap-2">
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
              placeholder="Enter dealer ID (4-10 letters/digits)"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block font-medium flex items-center gap-2">
            <FaKey className="text-blue-500" /> Password:
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full border rounded-md p-2 pr-10 focus:ring focus:ring-blue-300"
              placeholder="Enter password"
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
          <label className="block font-medium flex items-center gap-2">
            <FaKey className="text-blue-500" /> Confirm Password:
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="w-full border rounded-md p-2 pr-10 focus:ring focus:ring-blue-300"
              placeholder="Confirm password"
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
      </div>

      <div className="mt-8 flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Create User
        </button>
      </div>
    </form>
  );
};

export default UserForm;