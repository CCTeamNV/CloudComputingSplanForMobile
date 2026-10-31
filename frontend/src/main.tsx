import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import App from './App'
import { loadConfig } from './config'
import CoursesPage from './pages/CoursesPage'
import PlanPage from './pages/PlanPage'
import './index.css'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <PlanPage /> },
      { path: 'courses', element: <CoursesPage /> },
      // Separate chunk: students never download the admin UI.
      { path: 'admin', lazy: async () => ({ Component: (await import('./pages/AdminPage')).default }) },
    ],
  },
])

const root = createRoot(document.getElementById('root')!)

loadConfig()
  .then(() =>
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    ),
  )
  .catch((err: Error) => {
    root.render(<p className="p-4 text-destructive">Konfiguration konnte nicht geladen werden: {err.message}</p>)
  })
