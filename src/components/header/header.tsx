import '../../styles/header.css'

export interface HeaderViewState {
    currentView: string;
    onViewChange: (view: string) => void;
}

export interface HeaderAuthState {
    isLoggedIn: boolean;
    onLoginChange: (value: boolean) => void;
    username?: string;
}

interface HeaderTabProps extends HeaderViewState {
    title: string;
    view: string;
}

interface HeaderLogoState extends HeaderViewState{
    title: string
}

function HeaderLogo({ title, onViewChange }: HeaderLogoState) {
    return (
        <div className="headerLogo"
            onClick={() => onViewChange("landing")}
        >
            <div >{title}</div>
        </div>
    )
}

export function HeaderTitle({ title }: { title: string }) {
    return (
        <div className="headerTitle">
            <div>{title}</div>
        </div>
    )
}


function HeaderTab({ title, view, currentView, onViewChange }: HeaderTabProps) {
    const isActive = currentView === view;
    return (
        <div
            className={isActive ? "headerTab headerTab--active" : "headerTab"}
            onClick={() => onViewChange(view)}
        >
            <div>{title}</div>
        </div>
    )
}

/**
 * Holder for the different tabs.
 * Relaie l'etat de la vue courante a chaque onglet.
 */
function HeaderTabHolder({ currentView, onViewChange }: HeaderViewState) {
    return (
        <div className="headerTabHolder">
            <HeaderTab title="Simulation" view="simulation" currentView={currentView} onViewChange={onViewChange} />
            <HeaderTab title="Route" view="route" currentView={currentView} onViewChange={onViewChange} />
            <HeaderTab title="Information" view="info" currentView={currentView} onViewChange={onViewChange} />
        </div>
    )
}

function HeaderAccountSection({ isLoggedIn, onLoginChange, username = "Guest" }: HeaderAuthState) {
    return (
        <div className="headerAccountSection">
            {isLoggedIn ? (
                <>
                    <p id="headerAccountSectionName">{username}</p>
                    <div id="headerAccountSectionPlaceHolder"></div>
                    <button className="headerAuthButton" onClick={() => onLoginChange(false)}>Logout</button>
                </>
            ) : (
                <button className="headerAuthButton" onClick={() => onLoginChange(true)}>Login</button>
            )}
        </div>
    )
}

/**
 * Header principal du SVO viewer.
 * Recoit l'etat de la vue depuis App et le transmet aux onglets.
 */
type HeaderProps = HeaderViewState & HeaderAuthState;

function Header({ currentView, onViewChange, isLoggedIn, onLoginChange, username }: HeaderProps) {
    return (
        <div id="header">
            <HeaderLogo title="S.V.O" currentView={currentView} onViewChange={onViewChange} />
            <HeaderTabHolder currentView={currentView} onViewChange={onViewChange} />
            <HeaderAccountSection isLoggedIn={isLoggedIn} onLoginChange={onLoginChange} username={username} />
        </div>
    )
}

export default Header;
