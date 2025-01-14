import { SELECTORS } from './constants.js';
import { decodeToken, getGuestToken } from '../auth/auth.js';
import { eraseCookie, getCookie } from '../auth/cookies.js';
import { logout } from '../auth/auth.js';
import { AccountDropdown } from '../components/AccountDropdown.js';
import { urlChange } from './router.js';
import { StatsPanel } from '../components/statsPanel.js';

let accountDropdown = null;
let statsPanel = null;

export function get_accountDropdown() {
    return accountDropdown;
}

export function get_statsPanel() {
    return statsPanel;
}

export function set_statsPanel(panel) {
    statsPanel = panel;
}

export function initializeUI() {
    try {
        if (!getCookie('jwt_token')) {
            getGuestToken();
        }
        updateLoginButton(getCookie('jwt_token') !== null);
        window.history.replaceState({}, '', `${window.location.origin}/loading`);
    } catch (e) {
        console.log(e);
        eraseCookie('temp_token');
        eraseCookie('jwt_token');
        showBootstrapAlert('Une erreur est survenue durant l\'initialisation de l\'ui.', 'danger');
    }
}

export async function updateLoginButton(isLoggedIn) {
    try {
        let button = document.createElement('a');
        button.id = SELECTORS.loginButton.slice(1);
        button.className = 'text-light text-decoration-none align-self-center text-end pt-2';
        button.href = '';
        button.style.cursor = 'url(\'/images/astro-cursor.svg\'), auto;';
        button.style.fontSize = '3vh';
        button.innerHTML = 'Se connecter avec <img src="/images/42_Logo.svg" alt="42 logo" style="height: 4vh;">';
        if (isLoggedIn) {
            const token = getCookie('jwt_token');
            const payload = decodeToken(token);

            if (document.querySelector(SELECTORS.loginButton)) {
                document.querySelector(SELECTORS.loginButton).remove();
            }

            if (document.querySelector(SELECTORS.accountButton)) {
                console.log('Account button already exists');
                return;
            }

            button = document.createElement('a');
            button.id = SELECTORS.accountButton.slice(1);
            button.className = 'text-light text-decoration-none align-self-center text-end pt-2';
            button.href = '';
            button.style.cursor = 'url(\'/images/astro-cursor.svg\'), auto;';
            button.style.fontSize = '3vh';
            button.textContent = `Bienvenue, ${payload.username}`;

            button.addEventListener('click', (e) => urlChange(e, '/user/menu'), 'accountButton');

            document.getElementById('user_div').appendChild(button);

            accountDropdown = new AccountDropdown();

            accountDropdown.render(document.getElementById('user_div'));


            statsPanel = new StatsPanel();

            await statsPanel.fetchStats();

            statsPanel.render(document.getElementById('main-menu'));
        } else {
            if (document.querySelector(SELECTORS.accountButton)) {
                document.querySelector(SELECTORS.accountButton).remove();
            }

            if (document.querySelector(SELECTORS.loginButton)) {
                console.log('Login button already exists');
                return;
            }

            button.addEventListener('click', (e) => urlChange(e, '/login'), 'loginButton');

            document.getElementById('user_div').appendChild(button);

            if (accountDropdown) {
                accountDropdown.hide();
                accountDropdown.destroy();
            }

            if (statsPanel) {
                statsPanel.hide();
                statsPanel.destroy();
            }
        }
    } catch (e) {
        console.log(e);
        if (accountDropdown) {
            accountDropdown.hide();
            accountDropdown.destroy();
        }
        if (statsPanel) {
            statsPanel.hide();
            statsPanel.destroy();
        }
        eraseCookie('temp_token');
        eraseCookie('jwt_token');
        // console.log('Error updating login button');
        getGuestToken();
        updateLoginButton(false);
        showBootstrapAlert('Une erreur est survenue durant le chargement du bouton.', 'danger');
    }
}

export function toggleDropdown() {
    if (!getCookie('jwt_token')) {
        urlChange(null, '/home');
        showBootstrapAlert('Vous n\'êtes pas connecté.', 'danger');
        return;
    }

    if (accountDropdown.dropdown.className.includes('visible')) {
        accountDropdown.hide();
    } else {
        accountDropdown.show();
    }
}

export function togglePopover(popoverSelector, buttonSelector) {
    const popover = document.querySelector(popoverSelector);
    const button = document.querySelector(buttonSelector);

    if (!popover || !button) {
        console.log("Popover or button element not found");
        return;
    }

    const isVisible = toggleElement(popoverSelector);
    button.setAttribute('aria-expanded', isVisible.toString());
    if (isVisible) {
        button.focus();
    } else {
        button.blur();
    }
}

export function toggleMenu() {
    toggleElement(SELECTORS.mainMenu);
}

async function toggleElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.log("Element not found");
        return false;
    }

    const isVisible = element.classList.contains('visible');

    if (isVisible) {
        element.classList.remove('visible');
        setTimeout(() => {
            element.style.display = 'none';
        }, 300);
    } else {
        element.style.display = 'flex';
        element.offsetHeight;
        element.classList.add('visible');
        try {
            await statsPanel?.fetchStats();
        } catch (e) {
            console.log(e);
        }
    }

    return !isVisible;
}

export function showBootstrapAlert(message, type = 'info') {
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} d-flex`;
    alertElement.setAttribute('role', 'alert');

    alertElement.style.left = '50%';
    alertElement.style.transform = 'translate(-50%)';
    alertElement.style.zIndex = '10000';
    alertElement.style.maxWidth = '40%';

    alertElement.innerHTML = `${message}`;

    document.body.appendChild(alertElement);

    alertElement.style.opacity = '0';
    alertElement.style.transition = 'opacity 0.3s ease-in';
    setTimeout(() => alertElement.style.opacity = '1', 10);

    setTimeout(() => {
        alertElement.style.opacity = '0';
        setTimeout(() => {
            alertElement.remove();
        }, 300);
    }, 3000);
}

export function handleLogout() {
	logout();
}
