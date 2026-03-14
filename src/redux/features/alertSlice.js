import { createSlice } from "@reduxjs/toolkit"

export const alertSlice = createSlice({

    name: "alert",
    initialState: {  // initial state 
        loading: false  // this is the state
    },
    reducers: {  
        showLoading: (state) => {   // to show laoding
            state.loading = true
        },

        hideLoading: (state) => { state.loading = false } // to hide laoding
    }
})

export const {showLoading, hideLoading} =  alertSlice.actions