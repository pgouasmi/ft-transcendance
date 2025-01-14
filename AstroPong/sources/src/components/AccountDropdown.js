import { eraseData } from '../auth/eraseData.js';
import { logout } from '../auth/auth.js';

export class AccountDropdown {
    constructor() {
        this.dropdown = document.createElement('div');
        this.dropdown.id = 'account_dropdown';
        this.dropdown.className = 'flex-column position-absolute p-2 text-start';

        this.eraseDataLink = this.createLink('erase_data', 'Supprimer les données', this.getTrashIcon());

        this.logoutLink = this.createLink('logout', 'Se déconnecter', this.getLogoutIcon());

        this.dropdown.appendChild(this.eraseDataLink);
        this.dropdown.appendChild(this.logoutLink);

        this.setupEventListeners();

        this.hide();
    }

    createLink(id, text, icon) {
        const link = document.createElement('a');
        link.id = id;
        link.className = 'text-light text-decoration-none';
        link.href = '';
        link.innerHTML = icon + text;
        return link;
    }

    getTrashIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
            <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5zm-7.487 1a.5.5 0 0 1 .528.47l.5 8.5a.5.5 0 0 1-.998.06L5 5.03a.5.5 0 0 1 .47-.53Zm5.058 0a.5.5 0 0 1 .47.53l-.5 8.5a.5.5 0 1 1-.998-.06l.5-8.5a.5.5 0 0 1 .528-.47M8 4.5a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5"/>
        </svg> `;
    }

    getLogoutIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-left" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M6 12.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v2a.5.5 0 0 1-1 0v-2A1.5 1.5 0 0 1 6.5 2h8A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 12.5v-2a.5.5 0 0 1 1 0z" />
            <path fill-rule="evenodd" d="M.146 8.354a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L1.707 7.5H10.5a.5.5 0 0 1 0 1H1.707l2.147 2.146a.5.5 0 0 1-.708.708z" />
        </svg> `;
    }

    setStyles(styles) {
        Object.assign(this.dropdown.style, styles);
    }

    addClass(className) {
        this.dropdown.classList.add(className);
    }

    removeClass(className) {
        this.dropdown.classList.remove(className);
    }

    setupEventListeners() {
        this.eraseDataLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await eraseData();
        });

        this.logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    show() {
        this.dropdown.classList.add('visible');
    }

    hide() {
        this.dropdown.classList.remove('visible');
    }

    destroy() {
        this.dropdown.remove();
    }

    getElement() {
        return this.dropdown;
    }

    render(parent = document.body) {
        parent.appendChild(this.dropdown);
    }
}
