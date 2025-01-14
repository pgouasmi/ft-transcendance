import { changePlayerNumber, changeAILevel } from '../game/tournament.js';
import { showBootstrapAlert, toggleDropdown, togglePopover } from './ui.js';
import { SELECTORS } from './constants.js';
import { urlChange, routes, resetPage } from './router.js';
import { gameStateEnum, getGameState, sleep } from '../game/renderer.js';

const routeConfig = {
  singlePlayer: { selector: SELECTORS.singlePlayerButton, path: '/singleplayer' },
  multiplayer: { selector: SELECTORS.multiPlayerButton, path: '/multiplayer' },
  tournament: { selector: SELECTORS.tournamentButton, path: '/tournament' },
  easy: { selector: SELECTORS.easyButton, path: '/singleplayer/easy' },
  medium: { selector: SELECTORS.mediumButton, path: '/singleplayer/medium' },
  hard: { selector: SELECTORS.hardButton, path: '/singleplayer/hard' },
  sharedScreen: { selector: SELECTORS.sharedScreenButton, path: '/multiplayer/sharedscreen' },
  lan: { selector: SELECTORS.lanButton, path: '/multiplayer/local' }
};

const popoverConfig = [
  { popover: SELECTORS.accountDropdown, button: SELECTORS.accountButton, toggle: toggleDropdown },
  { popover: SELECTORS.difficultyPopover, button: SELECTORS.singlePlayerButton },
  { popover: SELECTORS.multiplayerPopover, button: SELECTORS.multiPlayerButton },
  { popover: SELECTORS.tournamentPopover, button: SELECTORS.tournamentButton },
];

export function setupEventListeners() {
  document.addEventListener('click', handleOutsideClick);

  window.addEventListener('popstate', handlePopState);

  setupRouteListeners();

  setupTournamentListeners();
}

function setupRouteListeners() {
  Object.values(routeConfig).forEach(({ selector, path }) => {
    const element = document.querySelector(selector);
    element?.addEventListener('click', (e) => urlChange(e, path));
  });
}

function setupTournamentListeners() {
  const tournamentForm = document.getElementById('form-tournament');
  const playerButtons = {
    four: document.getElementById('4-players-button'),
    eight: document.getElementById('8-players-button')
  };

  playerButtons.four?.addEventListener('click', () => changePlayerNumber(4));
  playerButtons.eight?.addEventListener('click', () => changePlayerNumber(8));

  document.querySelectorAll('.tournament-AI-button')
    .forEach(button => button.addEventListener('click', () => changeAILevel(button)));

  tournamentForm?.addEventListener('submit', (e) => urlChange(e, '/tournament/ongoing'));
}

async function handlePopState() {
  if (window.location.pathname === '/loading' && getGameState() === gameStateEnum.MAIN_MENU) {
    showBootstrapAlert('La partie est déjà chargée.', 'danger');
    urlChange(null, '/home');
    return;
  }

  if (getGameState() === gameStateEnum.LOADING || getGameState() === gameStateEnum.PRESS_START) {
    showBootstrapAlert('Une partie est en cours de chargement, veuillez patienter.', 'danger');
    urlChange(null, '/loading');
    return;
  }

  hideAllPopovers();
  const path = window.location.pathname;
  await resetPage();
  sleep(150);
  routes[path]?.();
}

export function hideAllPopovers() {
  popoverConfig.forEach(({ popover, button, toggle }) => {
      const popoverElement = document.querySelector(popover);

      if (popoverElement?.classList.contains('visible')) {
          if (toggle) {
              toggle();
          } else {
              togglePopover(popover, button);
          }

          if (popoverElement.id === SELECTORS.eraseDataPopover.slice(1)) {
            document.body.removeChild(popoverElement);
          }
      }
  });
}

export function handleOutsideClick(event) {
  popoverConfig.forEach(({ popover, button, toggle }) => {
    const popoverElement = document.querySelector(popover);
    const buttonElement = document.querySelector(button);

    if (isClickOutside(event, popoverElement, buttonElement)) {
      handlePopoverVisibility(event, popover, button, toggle);
    }
  });
}

function handlePopoverVisibility(event, popover, button, toggle) {
  const popoverElement = document.querySelector(popover);
  const wasClickedButton = popoverConfig.some(
    config => document.querySelector(config.button)?.contains(event.target)
  );

  if (popoverElement?.classList.contains('visible')) {
    if (wasClickedButton) {
      toggle ? toggle() : togglePopover(popover, button);
    } else {
      toggle ? toggle() : togglePopover(popover, button);
      urlChange(event, '/home');
    }
  }
}

function isClickOutside(event, element, button) {
  return element &&
         button &&
         !element.contains(event.target) &&
         !button.contains(event.target);
}
