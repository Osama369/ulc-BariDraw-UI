// src/components/RoleProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

export default function RoleProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem("token");
  
    if (!token) {
      return <Navigate to="/login" />;
    }
  
    try {
      const decodedToken = jwtDecode(token);
      
      if (allowedRoles.includes(decodedToken.role)) {
        return children;
      } else {
        alert("Access Denied: Insufficient Permissions");
        return <Navigate to="/" />; // Redirect to homepage or another page
      }
    } catch (error) {
      console.error("Invalid token", error);
      return <Navigate to="/login" />;
    }
}