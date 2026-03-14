import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch } from "react-redux";
import { showLoading, hideLoading } from "../redux/features/alertSlice";
import { FaUserShield, FaKey, FaEye, FaEyeSlash } from "react-icons/fa";

const Login = () => {
  const [dealerId, setDealerId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(showLoading());
    setMessage("");

    if (!dealerId || !password) {
      setMessage("Both fields are required!");
      dispatch(hideLoading());
      return;
    }

    const loginData = { dealerId, password };

    try {
      const response = await axios.post("/api/v1/auth/user-login", loginData);
      localStorage.setItem("token", response.data.token);
      setMessage("Login successful!");
      setTimeout(() => {
        navigate("/");
      }, 1000);
    } catch (error) {
      setMessage(error.response?.data?.error || "Invalid credentials");
    } finally {
      dispatch(hideLoading());
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-900 text-gray-100">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-96 border border-gray-700">
        <h2 className="text-2xl font-semibold mb-4 text-center">User Login</h2>

        {message && <p className="text-center text-red-500">{message}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block font-medium flex items-center gap-2">
              <FaUserShield className="text-blue-400" /> Dealer ID:
            </label>
            <input
              type="text"
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              required
              className="w-full p-2 border rounded bg-gray-700 text-white"
              placeholder="Enter your Dealer ID"
            />
          </div>

          <div className="relative">
            <label className="block font-medium flex items-center gap-2">
              <FaKey className="text-green-400" /> Password:
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-2 border rounded bg-gray-700 text-white pr-10"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-2 flex items-center"
            >
              {showPassword ? <FaEyeSlash className="text-gray-400" /> : <FaEye className="text-gray-400" />}
            </button>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500 transition-all"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;