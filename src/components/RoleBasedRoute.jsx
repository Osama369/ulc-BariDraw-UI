// src/components/RoleBasedRoute.jsx
import React from 'react';
import { useSelector } from 'react-redux';

const RoleBasedComponent = ({ requiredRoles, children, fallback = null }) => {
  // Add a safer selector that doesn't throw if auth is undefined
  const user = useSelector(state => state?.user?.user);
  
  // Check if user exists and has the required role
  if (user && requiredRoles.includes(user.role)) {
    return children;
  }
  
  return fallback;
};

export default RoleBasedComponent;