import { useState } from 'react'
import './styles/App.css'
import Header from './components/header/header'
import LandingPage from './pages/landingPage';
import MapPage from './pages/simulationPage';
import RoutePage from './pages/routePage';
import InformationPage from './pages/informationPage';

/**
 * Main app and entry point of the SVO viewer 
 * 
 * l'application utilise un lifting state up pattern.
 * Props permet aux etats d'etre herites par les elements imbriques
 * les states peuvent etre changes via les callback 
 * 
 * props --> down
 * state --> up
 */

function App() {
  const [currentView, setCurrentView] = useState("landing");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const renderView = () => {
    switch(currentView){
      case "landing":
        console.log(currentView);
        return <LandingPage/>
      case "simulation":
        return <MapPage/>
      case "route":
        return <RoutePage/>
      case "info":
        return <InformationPage/>
      default:
        console.log(currentView);
        return <LandingPage/>
    }
  }

  return (
    <div id='app'>
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        isLoggedIn={isLoggedIn}
        onLoginChange={setIsLoggedIn}/>
      <main>{renderView()}</main>
    </div>
  )
}

export default App
