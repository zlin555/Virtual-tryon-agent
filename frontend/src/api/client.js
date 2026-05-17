import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  timeout: 300000
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tryon_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
