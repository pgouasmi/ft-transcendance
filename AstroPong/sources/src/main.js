import { initializeUI } from './ui/ui.js';
import { setupEventListeners } from './ui/eventListeners.js';
import { gameLoop } from './game/renderer.js';

document.addEventListener('DOMContentLoaded', async () => {
    initializeUI();
    setupEventListeners();

    async function main() {
        try {
            await gameLoop();
        } catch (error) {
            console.log('An error occurred in the game loop:', error);
        }
    }

    main();
});