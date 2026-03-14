import React from 'react'
import {Navigate} from 'react-router-dom'
const ProtectedRoute = ({children}) => {
    // conditionally return krenge 

     if (localStorage.getItem("token")) {
         
        return children
     }else{
        return <Navigate to={'/login'}/>
     }
}

export default ProtectedRoute