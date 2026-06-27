import { Component } from "react";
import '../styles/pages/landingPage.css'

class LandingPage extends Component{
    render(){
        return(
            <div id = "langingPage">
                <div className="landingFilters">
                    <label className="landingFilter">
                        <span className="landingFilterLabel">Marchandise</span>
                        <select className="landingFilterSelect" defaultValue="">
                            <option value="" disabled>Sélectionner…</option>
                        </select>
                    </label>

                    <label className="landingFilter">
                        <span className="landingFilterLabel">Pays Exportateur</span>
                        <select className="landingFilterSelect" defaultValue="">
                            <option value="" disabled>Sélectionner…</option>
                        </select>
                    </label>

                    <label className="landingFilter">
                        <span className="landingFilterLabel">Pays Importateur</span>
                        <select className="landingFilterSelect" defaultValue="">
                            <option value="" disabled>Sélectionner…</option>
                        </select>
                    </label>

                    <label className="landingFilter">
                        <span className="landingFilterLabel">Incoterm</span>
                        <select className="landingFilterSelect" defaultValue="">
                            <option value="" disabled>Sélectionner…</option>
                        </select>
                    </label>
                </div>

                <button
                    className="landingSimulateButton"
                    onClick={() => alert("Rien n'est programmé")}
                >
                    Simuler
                </button>
            </div>
        )
    }
}
export default LandingPage;