import {configureStore}  from "@reduxjs/toolkit"
import { alertSlice } from "./features/alertSlice"

// configure the store 
import  userSlice  from "./features/userSlice"
// import dataSlice  from "./features/dataSlice"
export default  configureStore({

    reducer:{  // this is the reducer 
        alertSlice : alertSlice.reducer,
        user: userSlice,
        // data: dataSlice
    },
})

