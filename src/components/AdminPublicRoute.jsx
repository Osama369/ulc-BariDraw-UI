import React from 'react';
import { Navigate } from 'react-router-dom';

const AdminPublicRoute = ({ children }) => {
    if (localStorage.getItem("adminToken")) {
        return <Navigate to="/admin" />;  // Redirect logged-in admin to dashboard
    }
    return children;  // Allow access to the public route if not logged in
};

export default AdminPublicRoute;
