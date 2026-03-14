import axios from "axios";
import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { showLoading, hideLoading } from "../redux/features/alertSlice";
import { FaUser, FaEnvelope, FaPhone, FaCity, FaKey, FaEye, FaEyeSlash, FaIdBadge } from "react-icons/fa";

const Register = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    dispatch(showLoading());

    if (password !== confirmPass) {
      setMessage("Passwords do not match!");
      toast.error("Passwords do not match!");
      dispatch(hideLoading());
      return;
    }

    if (!/^[A-Za-z0-9]{4,10}$/.test(dealerId)) {
      setMessage("Dealer ID must be 4-10 alphanumeric characters");
      toast.error("Dealer ID must be 4-10 alphanumeric characters");
      dispatch(hideLoading());
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters long");
      toast.error("Password must be at least 8 characters long");
      dispatch(hideLoading());
      return;
    }

    const userData = { username, city, password, dealerId, phone, email };
    
    try {
      const res = await axios.post("/api/v1/auth/register", userData);
      setMessage(res.data.message);
      setUsername("");
      setCity("");
      setPassword("");
      setConfirmPass("");
      setPhone("");
      setEmail("");
      setDealerId("");
      setTimeout(() => {
        navigate("/login");
      }, 1000);
    } catch (error) {
      setMessage(error.response?.data?.error || "Registration failed");
    } finally {
      dispatch(hideLoading());
    }
  };

  return (
    <div className="flex justify-center items-center h-screen min-h-[800px] bg-gray-900 text-gray-100">
      <div className="bg-gray-800 p-6 rounded-lg w-96 border border-gray-700 shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-center">User Registration</h2>

        {message && <p className="text-center text-red-500">{message}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {[{ label: "Username", value: username, setValue: setUsername, icon: FaUser, type: "text", placeholder: "Enter your username" },
            { label: "Email", value: email, setValue: setEmail, icon: FaEnvelope, type: "email", placeholder: "Enter your email" },
            { label: "Phone", value: phone, setValue: setPhone, icon: FaPhone, type: "text", placeholder: "Enter your phone number" },
            { label: "City", value: city, setValue: setCity, icon: FaCity, type: "text", placeholder: "Enter your city" }].map((field, index) => (
              <div key={index} className="relative">
                <label className="block font-medium flex items-center gap-2"><field.icon className="text-blue-400" /> {field.label}:</label>
                <input
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.setValue(e.target.value)}
                  required
                  className="w-full p-2 border rounded bg-gray-700 text-white"
                  placeholder={field.placeholder}
                />
              </div>
          ))}

          <div className="relative">
            <label className="block font-medium flex items-center gap-2"><FaIdBadge className="text-purple-400" /> Dealer ID:</label>
            <input
              type="text"
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              required
              className="w-full p-2 border rounded bg-gray-700 text-white"
              placeholder="Enter dealer ID (4-10 letters/digits)"
            />
          </div>

          {[{ label: "Password", value: password, setValue: setPassword, show: showPassword, setShow: setShowPassword },
            { label: "Confirm Password", value: confirmPass, setValue: setConfirmPass, show: showConfirmPassword, setShow: setShowConfirmPassword }].map((field, index) => (
              <div key={index} className="relative">
                <label className="block font-medium flex items-center gap-2"><FaKey className="text-green-400" /> {field.label}:</label>
                <input
                  type={field.show ? "text" : "password"}
                  value={field.value}
                  onChange={(e) => field.setValue(e.target.value)}
                  required
                  className="w-full p-2 border rounded bg-gray-700 text-white pr-10"
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                />
                <button
                  type="button"
                  onClick={() => field.setShow(!field.show)}
                  className="absolute inset-y-0 right-2 flex items-center"
                >
                  {field.show ? <FaEyeSlash className="text-gray-400" /> : <FaEye className="text-gray-400" />}
                </button>
              </div>
          ))}

          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500 transition-all">
            Register
          </button>
        </form>
      </div>
    </div>
  );
};

export default Register;