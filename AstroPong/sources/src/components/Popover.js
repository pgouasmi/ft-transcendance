export class Popover {
    constructor(name) {
        this.popover = document.createElement('div');
        this.popover.id = name + '-popover';
        this.popover.className = 'game-popover container';
        this.popover.style.width = 'auto';
        this.popover.style.flexDirection = 'column';
        this.popover.style.alignItems = 'center';
        this.popover.style.gap = '20px';
        this.popover.style.padding = '20px';

        this.children = [];
        this.eventListeners = new Map();
    }

    appendChild(child) {
        if (child instanceof HTMLElement) {
            this.children.push(child);
            this.popover.appendChild(child);
        }
    }

    setInnerHTML(content) {
        this.popover.innerHTML = content;
    }

    addEventListener(eventName, callback) {
        this.eventListeners.set(eventName, callback);
        this.popover.addEventListener(eventName, callback);
    }

    removeEventListener(eventName) {
        const callback = this.eventListeners.get(eventName);
        if (callback) {
            this.popover.removeEventListener(eventName, callback);
            this.eventListeners.delete(eventName);
        }
    }

    setStyles(styles) {
        Object.assign(this.popover.style, styles);
    }

    addClass(className) {
        this.popover.classList.add(className);
    }

    removeClass(className) {
        this.popover.classList.remove(className);
    }

    show() {
        this.addClass('visible');
    }

    hide() {
        this.removeClass('visible');
    }

    destroy() {
        this.eventListeners.forEach((callback, eventName) => {
            this.popover.removeEventListener(eventName, callback);
        });
        this.eventListeners.clear();
        this.popover.remove();
    }

    getElement() {
        return this.popover;
    }

    render() {
        document.body.appendChild(this.popover);
        this.show();
    }
}
