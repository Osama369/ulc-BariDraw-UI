import axios from "axios";

// In production (Vercel), set `VITE_API_BASE_URL` to your backend origin:
// e.g. https://ulc-baridraw-server.onrender.com
// In local dev, leave it unset to keep using the Vite proxy (/api/v1 -> localhost:5000).
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (typeof rawBaseUrl === "string") {
  const baseURL = rawBaseUrl.trim().replace(/\/+$/, "");
  if (baseURL) {
    axios.defaults.baseURL = baseURL;
  }
}

