import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
  isAdmin: localStorage.getItem('adminToken') ? true : false,
  isAuthenticated: localStorage.getItem('token') || localStorage.getItem('adminToken') ? true : false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    setAdmin: (state, action) => {
      state.isAdmin = true;
      state.isAuthenticated = true;
    },
    clearAuth: (state) => {
      state.user = null;
      state.isAdmin = false;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, setAdmin, clearAuth } = authSlice.actions;
export default authSlice.reducer;