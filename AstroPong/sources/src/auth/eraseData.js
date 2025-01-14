import { Popover } from '../components/Popover';
import { showBootstrapAlert } from '../ui/ui';
import { getCookie } from './cookies';
import { decodeToken, logout } from './auth';
import { sleep } from '../game/renderer';

export class EraseDataPopover extends Popover {
    constructor() {
        super('erase_data_popover');
        this.handlers = {
            confirm: this.handleErase.bind(this),
            cancel: this.handleCancel.bind(this),
            outsideClick: this.handleOutsideClick.bind(this),
            popstate: this.handlePopstate.bind(this)
        };
        this.setupContent();
    }

    handleOutsideClick(e) {
        if (!this.getElement().contains(e.target)) {
            this.hide();
            this.cleanup();
            this.resolve(false);
        }
    }

    handlePopstate(e) {
        this.hide();
        this.cleanup();
        this.resolve(false);
    }

    handleCancel() {
        this.hide();
        this.cleanup();
        this.resolve(false);
    }

    setupContent() {
        const title = document.createElement('h1');
        title.textContent = 'Effacer les données';
        this.appendChild(title);

        const message = document.createElement('p');
        message.textContent = 'Êtes-vous sûr de vouloir effacer toutes vos données ?';
        this.appendChild(message);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';

        this.confirmButton = document.createElement('button');
        this.confirmButton.className = 'btn btn-danger';
        this.confirmButton.textContent = 'Oui, effacer mes données';

        this.cancelButton = document.createElement('button');
        this.cancelButton.className = 'btn btn-secondary';
        this.cancelButton.textContent = 'Annuler';

        buttonContainer.appendChild(this.confirmButton);
        buttonContainer.appendChild(this.cancelButton);
        this.appendChild(buttonContainer);
    }

    async handleErase() {
        const jwt_token = getCookie('jwt_token');
        if (!jwt_token) {
            showBootstrapAlert("Vous n'êtes pas connecté", 'danger');
            this.hide();
            this.cleanup();
            this.resolve(false);
            return;
        }

        const username = decodeToken(jwt_token)?.username;
        if (!username) {
            showBootstrapAlert("Une erreur est survenue, veuillez réessayer", 'danger');
            this.hide();
            this.cleanup();
            this.resolve(false);
            return;
        }

        try {
            const res = await fetch(`https://${window.location.hostname}:7777/auth/reset/`, {
                method: 'POST',
                body: new URLSearchParams({ 'token': jwt_token }),
            });

            if (res.ok) {
                showBootstrapAlert("Vos données ont été effacées", 'success');
                logout(true);
            } else {
                showBootstrapAlert("Une erreur est survenue, veuillez réessayer", 'danger');
            }
        } catch (error) {
            showBootstrapAlert("Une erreur est survenue, veuillez réessayer", 'danger');
        }

        this.hide();
        this.cleanup();
        this.resolve(true);
    }

    attachEventListeners() {
        this.confirmButton.addEventListener('click', this.handlers.confirm);
        this.cancelButton.addEventListener('click', this.handlers.cancel);
        document.body.addEventListener('click', this.handlers.outsideClick);
        window.addEventListener('popstate', this.handlers.popstate);
    }

    cleanup() {
        this.confirmButton.removeEventListener('click', this.handlers.confirm);
        this.cancelButton.removeEventListener('click', this.handlers.cancel);
        document.body.removeEventListener('click', this.handlers.outsideClick);
        window.removeEventListener('popstate', this.handlers.popstate);

        this.handlers = null;
        this.destroy();
    }

    async prompt() {
        await sleep(150);
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.attachEventListeners();
            this.render();
        });
    }
}

export async function eraseData() {
    const popover = new EraseDataPopover();
    return popover.prompt();
}
