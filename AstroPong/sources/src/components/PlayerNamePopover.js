export class PlayerNamePopover {
    constructor(playerName, position) {
        this.playerName = playerName;
        this.position = position;
        this.element = document.createElement('div');
        this.id = `player-${position}`;
        this.element.id = this.id;
        this.setupContent();
        this.setupClasses();
    }

    setupContent() {
        const nameElement = document.createElement('div');
        nameElement.textContent = this.playerName;
        this.element.appendChild(nameElement);
    }

    setupClasses() {
        this.element.classList.add('player-name-popover');
        this.element.classList.add(this.position);
    }

    addClass(className) {
        this.element.classList.add(className);
    }

    removeClass(className) {
        this.element.classList.remove(className);
    }

    render() {
        document.body.appendChild(this.element);
    }

    destroy() {
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    animate() {
        // Déclencher le rendu avant d'ajouter la classe active pour permettre la transition
        requestAnimationFrame(() => {
            this.addClass('active');
            
            // Ajouter l'effet d'impact après l'arrivée au centre
            setTimeout(() => {
                this.addClass('impact');
            }, 600);
        });
    }
}

export async function displayPlayerNames(player1Name, player2Name, duration = 3000) {
    const leftPopover = new PlayerNamePopover(player1Name, 'left');
    const rightPopover = new PlayerNamePopover(player2Name, 'right');

    // Afficher les popovers
    leftPopover.render();
    rightPopover.render();

    // Démarrer l'animation
    leftPopover.animate();
    rightPopover.animate();

    // Masquer et détruire après la durée spécifiée
    return new Promise((resolve) => {
        setTimeout(() => {
            leftPopover.removeClass('active');
            rightPopover.removeClass('active');

            // Attendre la fin de l'animation avant de détruire
            setTimeout(() => {
                leftPopover.destroy();
                rightPopover.destroy();
                resolve();
            }, 1500);
        }, duration);
    });
}