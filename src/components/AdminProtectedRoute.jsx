import React from 'react';
import { Navigate } from 'react-router-dom';
import {jwtDecode} from 'jwt-decode';

const AdminProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("adminToken");

  if (!token) {
    return <Navigate to="/admin-login" />;
  }

  try {
    const decodedToken = jwtDecode(token);
    
    if (decodedToken.role === "admin") {
      return children;
    } else {
      alert("Access Denied: Admins Only");
      return <Navigate to="/" />; // Redirect to homepage or another page
    }
  } catch (error) {
    console.error("Invalid token", error);
    return <Navigate to="/admin-login" />;
  }
};

export default AdminProtectedRoute;
