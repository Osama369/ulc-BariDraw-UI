import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";

export default function DistributorProtectedRoute({ children }) {

  if (localStorage.getItem("distributorToken")) {
    return children;
  } else {
    return <Navigate to="/distributor-login" />;
  }
}