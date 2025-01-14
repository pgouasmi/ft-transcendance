import { Popover } from './Popover.js';

export class LoadingPopover extends Popover {
    constructor(mode) {
        super('loading');
        this.mode = mode;
        this.setupContent();
    }

    setupContent() {
        const loader = document.createElement('div');
        loader.className = 'spinner-border text-light';
        loader.role = 'status';

        const loaderSpan = document.createElement('span');
        loaderSpan.className = 'visually-hidden';
        loaderSpan.textContent = `En attente d'${this.mode === 'PVE' ? 'une IA' : 'un autre joueur'}...`;

        loader.appendChild(loaderSpan);

        const loadermsg = document.createElement('div');
        loadermsg.className = 'text-light';
        loadermsg.textContent = `En attente d'${this.mode === 'PVE' ? 'une IA' : 'un autre joueur'}...`;

        this.appendChild(loader);
        this.appendChild(loadermsg);
    }
}