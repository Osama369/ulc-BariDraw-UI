import React from 'react'
import { Navigate } from 'react-router-dom'

export default function DistributorPublicRoute({children}) {
  if(localStorage.getItem('distributorToken')){
    return <Navigate to="/distributor" />
  }else{
    return children;
  }
}