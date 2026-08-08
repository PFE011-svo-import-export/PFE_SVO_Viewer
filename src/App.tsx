import { Routes, Route } from 'react-router-dom'
import './styles/App.css'
import Header from './components/header/header'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/landingPage'
import RoutePage from './pages/routePage'
import AuthPage from './pages/authPage'
import ProcessusPage from './pages/processusPage'
import ProfilePage from './pages/profilePage'
import StepsPage from './pages/stepsPage'
import UsersPage from './pages/usersPage'

/**
 * Main app and entry point of the SVO viewer.
 *
 * Le routage est gere par React Router (URLs reelles).
 * L'etat d'authentification vit dans AuthProvider (cf. main.tsx) et est lu
 * via useAuth() la ou il est necessaire (Header, ProtectedRoute).
 */
function App() {
  return (
    <div id='app'>
      <Header />
      <main>
        <Routes>
          {/* Routes publiques : toujours accessibles */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/route" element={<RoutePage />} />

          {/* Routes protegees : connexion requise */}
          <Route element={<ProtectedRoute />}>
            <Route path="/processus" element={<ProcessusPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Gabarit dont les processus sont tires : consultation et edition
              reservees au personnel (miroir de [Authorize] sur StepController) */}
          <Route element={<ProtectedRoute allowedRoles={["Admin", "CAPD"]} />}>
            <Route path="/steps" element={<StepsPage />} />
          </Route>

          {/* Gestion des comptes : reservee aux administrateurs */}
          <Route element={<ProtectedRoute allowedRoles={["Admin"]} />}>
            <Route path="/utilisateurs" element={<UsersPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
