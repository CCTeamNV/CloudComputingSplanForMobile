import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import App from './App'
import { initApi } from './api/client'
import { completeLogin, currentSession } from './auth'
import { loadConfig } from './config'
import AccountPage from './pages/AccountPage'
import CoursesPage from './pages/CoursesPage'
import LoginPage from './pages/LoginPage'
import PlanPage from './pages/PlanPage'
import './index.css'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <PlanPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'account', element: <AccountPage /> },
      // Separate chunk: students never download the admin UI.
      { path: 'admin', lazy: async () => ({ Component: (await import('./pages/AdminPage')).default }) },
    ],
  },
])

const root = createRoot(document.getElementById('root')!)

loadConfig()
  .then(async (config) => {
    initApi(config)
    const loginError = await completeLogin(config) // back from Cognito with ?code=
    root.render(
      <StrictMode>
        {currentSession() ? <RouterProvider router={router} /> : <LoginPage error={loginError} />}
      </StrictMode>,
    )
  })
  .catch((err: Error) => {
    root.render(<p className="p-4 text-destructive">Konfiguration konnte nicht geladen werden: {err.message}</p>)
  })
