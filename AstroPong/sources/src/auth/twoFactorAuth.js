import { urlChange } from "../ui/router";
import { Popover } from "../components/Popover";

export class TwoFactorAuthPopover extends Popover {
    constructor(qrCodeBase64) {
        super('qrcode');
        this.qrCodeBase64 = qrCodeBase64;
        this.handlers = {
            input: this.handleInput.bind(this),
            keypress: this.handleKeypress.bind(this),
            submit: this.handleSubmit.bind(this),
            outsideClick: this.handleOutsideClick.bind(this),
            popstate: this.handlePopstate.bind(this)
        };
        this.setupContent();
    }

    handleInput(e) {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    }

    handleKeypress(e) {
        if (e.key === 'Enter') {
            this.handleSubmit();
        }
    }

    handleOutsideClick(e) {
        if (!this.getElement().contains(e.target)) {
            this.hide();
            this.cleanup();
            urlChange(e, '/home');
            this.resolve(null);
        }
    }

    handlePopstate(e) {
        this.hide();
        this.cleanup();
        this.resolve(null);
    }

    setupContent() {
        const title = document.createElement('h1');
        title.textContent = this.qrCodeBase64
            ? 'Sannez le QR code avec votre application Google Authenticator'
            : 'Entrez le code Authenticator à 6 chiffres';
        this.appendChild(title);

        if (this.qrCodeBase64) {
            const qrContainer = document.createElement('div');
            qrContainer.style.width = '256px';
            qrContainer.style.height = '256px';

            const qrImage = document.createElement('img');
            qrImage.src = "data:image/png;base64," + this.qrCodeBase64;
            qrImage.style.width = '100%';
            qrImage.style.height = '100%';
            qrContainer.appendChild(qrImage);
            this.appendChild(qrContainer);
        }

        const inputContainer = document.createElement('div');
        inputContainer.style.width = '100%';
        inputContainer.style.maxWidth = '300px';
        inputContainer.style.display = 'flex';
        inputContainer.style.flexDirection = 'column';
        inputContainer.style.gap = '10px';

        const inputLabel = document.createElement('label');
        inputLabel.textContent = 'Entrez le code à 6 chiffres';
        inputContainer.appendChild(inputLabel);

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.maxLength = 6;
        this.input.pattern = '[0-9]*';
        this.input.style.padding = '10px';
        this.input.style.fontSize = '18px';
        this.input.style.textAlign = 'center';
        this.input.style.letterSpacing = '4px';
        inputContainer.appendChild(this.input);
        this.appendChild(inputContainer);

        this.submitButton = document.createElement('button');
        this.submitButton.textContent = 'Valider';
        this.submitButton.style.marginTop = '20px';
        this.submitButton.style.padding = '10px 20px';
        this.appendChild(this.submitButton);

        this.contact_message = document.createElement('p');
        this.contact_message.textContent = 'Si vous avez perdu votre Connexion Authentificator, contactez un administrateur';
        this.contact_message.style.marginTop = '20px';
        this.appendChild(this.contact_message);
    }

    handleSubmit() {
        const code = this.input.value;
        if (code.length === 6) {
            this.hide();
            this.cleanup();
            this.resolve(code);
        } else {
            this.input.classList.add('error');
            this.errorTimeout = setTimeout(() => {
                this.input.classList.remove('error');
            }, 500);
        }
    }

    attachEventListeners() {
        this.input.addEventListener('input', this.handlers.input);
        this.input.addEventListener('keypress', this.handlers.keypress);
        this.submitButton.addEventListener('click', this.handlers.submit);
        document.body.addEventListener('click', this.handlers.outsideClick);
        window.addEventListener('popstate', this.handlers.popstate);
    }

    cleanup() {
        this.input.removeEventListener('input', this.handlers.input);
        this.input.removeEventListener('keypress', this.handlers.keypress);
        this.submitButton.removeEventListener('click', this.handlers.submit);
        document.body.removeEventListener('click', this.handlers.outsideClick);
        window.removeEventListener('popstate', this.handlers.popstate);

        if (this.errorTimeout) {
            clearTimeout(this.errorTimeout);
        }

        this.handlers = null;
        this.destroy();
    }

    async prompt() {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.attachEventListeners();
            this.render();
            this.input.focus();
        });
    }
}

export async function twoFactorAuth(qrCodeBase64) {
    const popover = new TwoFactorAuthPopover(qrCodeBase64);
    return popover.prompt();
}