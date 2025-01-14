import { Popover } from "./Popover";
import { getCookie } from "../auth/cookies";

export class StatsPanel extends Popover {
    constructor() {
        super('user-stats');
        this.setupContent();
        this.setupStyle();
    }

    setupStyle() {
        Object.assign(this.popover.style, {
            width: '250px',
            margin: '0',
            gap: '0',
            padding: '16px',
            top: '125%',
            left: '88%',
            zIndex: '1000'
        });
    }
    setupContent() {
        const statsTitle = document.createElement('h2');
        statsTitle.className = 'text-center text-light border-bottom border-secondary';
        statsTitle.textContent = 'Stats En ligne';

        const goalsNumber = document.createElement('div');
        goalsNumber.className = 'text-center text-light text-weight-bold';
        goalsNumber.innerHTML = "Nombre de points: <span id='goals-number'>0</span>";

        const winNumber = document.createElement('div');
        winNumber.className = 'text-center text-light text-weight-bold';
        winNumber.innerHTML = "Nombre de victoires: <span id='win-number'>0</span>";

        const numbers = [goalsNumber, winNumber];
        numbers.forEach(elem => {
            const span = elem.querySelector('span');
            if (span) {
                span.style.fontWeight = 'bold';
                span.style.marginLeft = '5px';
                span.style.color = '#4CAF50';
            }
        });

        this.appendChild(statsTitle);
        this.appendChild(goalsNumber);
        this.appendChild(winNumber);
    }

    updateStats(goals, wins) {
        let goalsNumber = document.getElementById('goals-number');
        let winNumber = document.getElementById('win-number');

        if (goalsNumber && winNumber) {
            goalsNumber.textContent = goals;
            winNumber.textContent = wins;
        }
    }

    async fetchStats() {
        try {
            if (!getCookie('jwt_token')) {
                throw new Error('No JWT token found');
            }
    
            const response = await fetch(`https://${window.location.hostname}:7777/auth/getusercounters/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${getCookie('jwt_token')}`
                }
            });
    
            const data = await response.json();
    
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.updateStats(data.goal_counter, data.win_counter);
    
        } catch (error) {
            console.log('Error fetching stats:', error);
            throw error;
        }
    }

    async render(parent) {
        try {
            parent.appendChild(this.popover);
            await this.show();
        } catch (error) {
            throw error;
        }
    }

    async show() {
        try {
            await this.fetchStats();
            this.popover.classList.add('visible');
        } catch (error) {
            throw error;
        }
    }

    hide() {
        this.popover.classList.remove('visible');
    }

    destroy() {
        this.popover.remove();
    }
}