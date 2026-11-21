import { NavLink, Link } from 'react-router-dom';
import './header.css';
import { Logo, IconMessages, IconChart, IconCompass, IconSun, IconMoon, IconMonitor, IconMenu } from './icons';
import { useDisplayName, initials } from './user';
import { useTheme, setThemePref, ThemePref } from './theme';

interface HeaderProps {
    onStartTour: () => void;
    onToggleMenu: () => void;
}

const NEXT: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<ThemePref, string> = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };

const Header: React.FC<HeaderProps> = ({ onStartTour, onToggleMenu }) => {
    const name = useDisplayName();
    const { pref } = useTheme();

    return (
        <header className="app-header">
            <button className="icon-btn menu-btn" aria-label="Open conversations" onClick={onToggleMenu}>
                <IconMenu />
            </button>

            <Link to="/chatpage" className="brand" aria-label="GPTitor home">
                <span className="brand-logo"><Logo /></span>
                <span className="brand-name">GPTitor</span>
                <span className="brand-tag">Prompt trainer</span>
            </Link>

            <nav className="main-nav" aria-label="Main">
                <NavLink to="/chatpage" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <IconMessages size={17} />
                    <span>Practice</span>
                </NavLink>
                <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                    <IconChart size={17} />
                    <span>Progress</span>
                </NavLink>
            </nav>

            <div className="header-actions">
                <button
                    className="icon-btn theme-btn"
                    onClick={() => setThemePref(NEXT[pref])}
                    aria-label={`${LABEL[pref]} (click to change)`}
                    data-tip={LABEL[pref]}
                    data-tip-pos="bottom"
                >
                    <span className="theme-icon" key={pref}>
                        {pref === 'light' ? <IconSun /> : pref === 'dark' ? <IconMoon /> : <IconMonitor />}
                    </span>
                </button>
                <button className="btn btn-ghost tour-btn" onClick={onStartTour} aria-label="Take the tour">
                    <IconCompass size={17} />
                    <span>Take the tour</span>
                </button>
                <Link to="/profile" className="user-chip" aria-label="Open your profile">
                    <span className="avatar">{initials(name)}</span>
                    <span className="user-name">{name || 'Set your name'}</span>
                </Link>
            </div>
        </header>
    );
};

export default Header;
