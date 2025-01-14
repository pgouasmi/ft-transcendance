import { SELECTORS } from './constants.js';
import { startGame, resetGame } from '../game/renderer.js';
import { showBootstrapAlert, toggleDropdown, togglePopover } from './ui.js';
import { Popover } from '../components/Popover.js';
import { hideAllPopovers, handleOutsideClick } from './eventListeners.js';
import { startTournament, resetTournament } from '../game/tournament.js';
import { login } from '../auth/auth.js';

const RATELIMIT_ROUTES = {
  '/loading': { rateLimit: 1000 },
  '/home': { rateLimit: 250 },
  '/login': { rateLimit: 2000 },
  '/user/menu': { rateLimit: 500 },
  '/multiplayer': { rateLimit: 1000 },
  '/singleplayer': { rateLimit: 1000 },
  '/tournament': { rateLimit: 1000 },
  '/tournament/ongoing': { rateLimit: 2000 },
  '/multiplayer/local': { rateLimit: 2000 },
  '/singleplayer/easy': { rateLimit: 2000 },
  '/singleplayer/hard': { rateLimit: 2000 },
  '/singleplayer/medium': { rateLimit: 2000 },
  '/multiplayer/sharedscreen': { rateLimit: 2000 },
  '/404': { rateLimit: 1000 }
};

const lastRouteAccess = new Map();

export const routes = {
  '/loading': () => {},
  '/home': () => {},
  '/login': () => login(),
  '/user/menu': () => toggleDropdown(),
  '/multiplayer': () => togglePopover(SELECTORS.multiplayerPopover, SELECTORS.multiPlayerButton),
  '/singleplayer': () => togglePopover(SELECTORS.difficultyPopover, SELECTORS.singlePlayerButton),
  '/tournament': () => togglePopover(SELECTORS.tournamentPopover, SELECTORS.tournamentButton),
  '/tournament/ongoing': () => startTournament(),
  '/multiplayer/local': async () => {
    const button = document.getElementById(SELECTORS.lanButton.substring(1));
    if (!button) throw new Error('Button not found');
    await startGame(button);
  },
  '/singleplayer/easy': async () => {
    const button = document.getElementById(SELECTORS.easyButton.substring(1));
    if (!button) throw new Error('Button not found');
    await startGame(button);
  },
  '/singleplayer/hard': async () => {
    const button = document.getElementById(SELECTORS.hardButton.substring(1));
    if (!button) throw new Error('Button not found');
    await startGame(button);
  },
  '/singleplayer/medium': async () => {
    const button = document.getElementById(SELECTORS.mediumButton.substring(1));
    if (!button) throw new Error('Button not found');
    await startGame(button);
  },
  '/multiplayer/sharedscreen': async () => {
    const button = document.getElementById(SELECTORS.sharedScreenButton.substring(1));
    if (!button) throw new Error('Button not found');
    await startGame(button);
  },
  '/404': async () => await page404()
};


function checkRateLimit(path) {
  const now = Date.now();
  const lastAccess = lastRouteAccess.get(path) || 0;
  const timeSinceLastAccess = now - lastAccess;
  const minWaitTime = RATELIMIT_ROUTES[path].rateLimit;

  if (timeSinceLastAccess < minWaitTime) {
    throw new Error(`Trop de requêtes sur la route ${path}, veuillez réessayer dans ${(minWaitTime - timeSinceLastAccess) / 1000} secondes`);
  }

  lastRouteAccess.set(path, now);
  return true;
}


export async function urlChange(e, path) {
  try {
    e?.preventDefault();

    if (!RATELIMIT_ROUTES[path]) {
      throw new Error('Invalid route');
    }

    checkRateLimit(path);

    if (path !== '/loading') {
      await resetPage();
    }

    const baseUrl = window.location.origin;
    const state = {
      path,
      timestamp: Date.now()
    };

	const sanitizedPath = path
	.split('/')
	.map(segment => segment ? encodeURIComponent(segment) : '')
	.join('/');

    window.history.pushState(state, '', `${baseUrl}${sanitizedPath}`);
    await routes[path]();

  } catch (error) {
	  showBootstrapAlert(`Navigation error ${error.message}`, 'danger');
    console.error('Navigation error:', error);
    const baseUrl = window.location.origin;
    window.history.pushState({ path: '/404', timestamp: Date.now() }, '', `${baseUrl}/404`);
    await routes['/404']();
  }
}

async function page404() {
  clean404();
  try {
    const popover = new Popover('404');
    popover.setInnerHTML("<h1>404</h1><p>L'URL demandée n'existe pas ou la naviguation vers la page demandée est impossible.</p>");

    const button = document.createElement('button');
    button.textContent = 'Go Home';
    button.classList = 'btn btn-primary';
    button.addEventListener('click', (e) => urlChange(e, '/home'));
    popover.appendChild(button);

    popover.render();
  } catch (error) {
    console.error('Error rendering 404 page:', error);
  }
}

function clean404() {
  try {
    const popover = document.getElementById('404-popover');
    popover?.remove();
  } catch (error) {
    console.error('Error cleaning 404:', error);
  }
}

export async function resetPage() {
  try {
    clean404();
    hideAllPopovers();
    await resetTournament();
    await resetGame();
    document.addEventListener('click', handleOutsideClick);
  } catch (error) {
    console.error('Error resetting page:', error);
  }
}