import { handleOutsideClick } from '../ui/eventListeners.js';
import { urlChange } from '../ui/router.js';
import { showBootstrapAlert, toggleMenu, togglePopover } from '../ui/ui.js';
import {
	zoomInGame,
	getMovingToTerrain,
	sleep,
	startGameTournament,
	zoomOutGame,
	setGameState,
	resetTerrain
} from './renderer.js';

let ISFINISHED = null;
let TOURNAMENT_UID = null;

export function setISFINISHED(value) {
	ISFINISHED = value;
}


async function quitTournament(msg) {
	if (msg) {
		showBootstrapAlert(msg, 'danger');
	}
	await resetTournament();
	zoomOutGame();
	urlChange(null, '/home');
	document.addEventListener('click', handleOutsideClick);
}


async function getNewTournamentData(players) {
	try {
		const response = await fetch(`https://${window.location.hostname}:7777/game/tournament/new/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ 'players': players }),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return await response.json();
	} catch (error) {
		throw error;
	}
}


function createMatchesForSide(matches, roundDiv) {
	matches.forEach((match) => {
		const matchDiv = document.createElement('div');
		matchDiv.className = 'match';

		const difficulty = { 'easy': 'rgb(0, 190, 0)', 'medium': 'rgb(255, 255, 0)', 'hard': 'rgb(255, 0, 0)' };

		if (match.length === 1) {
			const finalist = document.createElement('div');
			finalist.className = 'player text-center';
			if (match[0].ai) finalist.style = 'color: ' + difficulty[match[0].difficulty];
			finalist.innerText = match[0] == -1 ? '?' : match[0].name;
			matchDiv.appendChild(finalist);
		} else {
			const player1Div = document.createElement('div');
			player1Div.className = 'player text-center';
			if (match[0].ai) player1Div.style = 'color: ' + difficulty[match[0].difficulty];
			player1Div.innerText = match[0] == -1 ? '?' : match[0].name;

			const player2Div = document.createElement('div');
			player2Div.className = 'player text-center';
			if (match[1].ai) player2Div.style = 'color: ' + difficulty[match[1].difficulty];
			player2Div.innerText = match[1] == -1 ? '?' : match[1].name;

			matchDiv.appendChild(player1Div);
			matchDiv.appendChild(player2Div);
		}

		roundDiv.appendChild(matchDiv);
	});
}


async function displayScoreBoard(tournament) {
	const scoreBoard = document.createElement('div');
	scoreBoard.id = 'tournament-scoreboard';
	scoreBoard.className = 'game-popover container';
	scoreBoard.style = 'width: auto; background-color: rgba(150, 150, 150, 0.5); backdrop-filter: blur(8px)';

	const bracketContainer = document.createElement('div');
	bracketContainer.className = 'tournament-bracket flat';

	const leftBracket = document.createElement('div');
	leftBracket.className = 'bracket-side left d-flex flex-row';

	const rightBracket = document.createElement('div');
	rightBracket.className = 'bracket-side right d-flex flex-row-reverse';

	const centerColumn = document.createElement('div');
	centerColumn.className = 'center-column';

	const finalDiv = document.createElement('div');
	finalDiv.className = 'final';
	finalDiv.innerHTML = '<div class="trophy">🏆</div><div>FINALE</div>';
	centerColumn.appendChild(finalDiv);

	let rounds = tournament['rounds'];

	for (let round_id = 0; round_id < rounds.length; round_id++) {
		const leftRoundDiv = document.createElement('div');
		leftRoundDiv.className = 'round';
		const rightRoundDiv = document.createElement('div');
		rightRoundDiv.className = 'round';

		const matchesCount = rounds[round_id].length;
		const leftMatches = rounds[round_id].slice(0, Math.floor(matchesCount / 2));
		const rightMatches = rounds[round_id].slice(Math.floor(matchesCount / 2));

		if (rounds[round_id].length === 1 && rounds[round_id][0].length === 1) {
			const matchDiv = document.createElement('div');
			const winnerDiv = document.createElement('div');
			matchDiv.className = 'match';
			winnerDiv.className = 'player winner';
			const winner = rounds[round_id][0][0];
			winnerDiv.innerText = winner == -1 ? '?' : winner.name;
			if (winner != -1) {
				winnerDiv.style.fontSize = '2em';
				winnerDiv.style.fontWeight = 'bold';
				winnerDiv.style.color = 'gold';
			}
			matchDiv.appendChild(winnerDiv);
			finalDiv.appendChild(matchDiv);
		} else {
			if (rounds[round_id].length === 1) {
				createMatchesForSide([[rounds[round_id][0][0]]], leftRoundDiv);
				createMatchesForSide([[rounds[round_id][0][1]]], rightRoundDiv);
			} else {
				createMatchesForSide(leftMatches, leftRoundDiv);
				createMatchesForSide(rightMatches, rightRoundDiv);
			}
			leftBracket.appendChild(leftRoundDiv);
			rightBracket.appendChild(rightRoundDiv);
		}
	}

	bracketContainer.appendChild(leftBracket);
	bracketContainer.appendChild(centerColumn);
	bracketContainer.appendChild(rightBracket);

	scoreBoard.innerHTML = '<h1>Tournoi</h1>';
	scoreBoard.appendChild(bracketContainer);

	const startButton = document.createElement('button');
	startButton.id = 'start-tournament-match';

	const lastRound = rounds[rounds.length - 1];
	const lastMatch = lastRound[0];

	const hasUnknownPlayers = Array.isArray(lastMatch) && lastMatch.includes(-1);
	startButton.textContent = hasUnknownPlayers ? 'Prochain match' : 'Finir le tournoi';

	scoreBoard.appendChild(startButton);

	document.body.appendChild(scoreBoard);
	togglePopover('#tournament-scoreboard', '#start-tournament-match');

	return new Promise((resolve) => {
		startButton.addEventListener('click', () => {
			scoreBoard.classList.remove('visible');
			document.body.removeChild(scoreBoard);
			sleep(500).then(() => resolve());
		});
	});
}


async function getNextMatch() {
	try {
		const response = await fetch(`https://${window.location.hostname}:7777/game/tournament/next/${TOURNAMENT_UID}/`, {
			method: 'GET'
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		if (result.error) {
			throw new Error(result.error);
		}

		return result;
	} catch (error) {
		throw error;
	}
}


async function playNextMatch(match) {
	const [player1, player2] = match;
	let gametype = 'PVP';
	let diff = 'medium';

	if (player1.ai && player2.ai) {
		let diff_dict = { 'easy': 0, 'medium': 1, 'hard': 2 };
		const rand1 = Math.floor(Math.random() * 4);
		const rand2 = Math.floor(Math.random() * 4);
		return ISFINISHED = diff_dict[player1.difficulty] + rand1 > diff_dict[player2.difficulty] + rand2 ? player1 : player2;
	} else if (player1.ai || player2.ai) {
		gametype = 'PVE';
		diff = player1.ai ? player1.difficulty : player2.difficulty;
		if (player1.ai) {
			diff = diff === 'easy' ? 'easy_p1' : diff === 'medium' ? 'medium_p1' : 'hard_p1';
		}
	}

	let names = [player1.name, player2.name];

	await startGameTournament(diff, gametype, names);

	while (!ISFINISHED) {
		await sleep(1000);
	}

	return ISFINISHED === "1" ? player1 : player2;
}


async function SetResults(winner) {
	let response = await fetch(`https://${window.location.hostname}:7777/game/tournament/setresults/`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ 'tournament_id': TOURNAMENT_UID, 'winner': winner })
	});
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	ISFINISHED = null;

	let results = await response.json();
	return results.tournament;
}


async function getTournament() {
	const response = await fetch(`https://${window.location.hostname}:7777/game/tournament/check/${TOURNAMENT_UID}/`, {
		method: 'GET'
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response}`);
	}

	return await response.json();

}


function parsePlayers() {
	const popover_content = document.getElementById('tournament-players-list');

	if (!popover_content || (popover_content.children.length !== 4 && popover_content.children.length !== 8)) {
		throw new Error('Le nombre de joueurs doit être de 4 ou 8');
	}

	// check for duplicate names
	const names = [];
	for (let i = 0; i < popover_content.children.length; i++) {
		const input = popover_content.children[i].querySelector('input');
		if (names.includes(input.value)) {
			throw new Error('Les noms des joueurs ne peuvent pas être identiques');
		}
		names.push(input.value);
	}

	// check for invalid characters
	const regex = /^[a-zA-Z0-9_]+$/;
	for (let i = 0; i < popover_content.children.length; i++) {
		const input = popover_content.children[i].querySelector('input');
		if (!regex.test(input.value)) {
			throw new Error('Les noms des joueurs ne peuvent contenir que des lettres, des chiffres et des tirets bas');
		}
	}

	const players = [];

	for (let i = 0; i < popover_content.children.length; i++) {
		let player = {};
		const input = popover_content.children[i].querySelector('input');
		player.id = i;
		player.name = input?.value;
		player.difficulty = popover_content.children[i].querySelector('.tournament-AI-button').classList[1];
		player.ai = player.difficulty !== 'off';
		players.push(player);
	}

	return players;
}


async function deleteTournament() {

	if (!TOURNAMENT_UID) {
		return;
	}

	const response = await fetch(`https://${window.location.hostname}:7777/game/tournament/del/${TOURNAMENT_UID}/`, {
		method: 'POST'
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response}`);
	}

	TOURNAMENT_UID = null;
	ISFINISHED = null;
	return await response.json();
}


export async function startTournament() {
	document.removeEventListener('click', handleOutsideClick);
	try {
		let players = parsePlayers();
		let new_tournament_result = await getNewTournamentData(players);
		if (new_tournament_result.error) {
			return quitTournament("Une erreur est survenue lors de la création du tournoi: " + new_tournament_result.error);
		}
		TOURNAMENT_UID = new_tournament_result.tournament_uid;
		let tournament_object = await getTournament();
		let match_winner = null;

		if (document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
		togglePopover('#tournament-popover', '#tournament-button');
		zoomInGame(true);
		while (getMovingToTerrain()) {
			await sleep(200);
		}

		while (tournament_object.current_round < tournament_object.rounds.length - 1) {
			if (TOURNAMENT_UID === null) {
				return;
			}
			resetTerrain();
			await displayScoreBoard(tournament_object);
			let nextMatch = await getNextMatch();
			if (nextMatch.error) {
				showBootstrapAlert("Erreur dans le tournoi:" + nextMatch.error, 'danger');
				throw new Error(nextMatch.error);
			}
			nextMatch = nextMatch.next_match;
			match_winner = await playNextMatch(nextMatch);
			tournament_object = await SetResults(match_winner);
		}

		await displayScoreBoard(tournament_object);
		await resetTournament();

		zoomOutGame();
		setGameState(1);
		if (!document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
		document.addEventListener('click', handleOutsideClick);
		if (window.location.pathname !== '/tournament') urlChange(null, '/home');
	} catch (error) {
		quitTournament("Une erreur est survenue lors du tournoi: " + error.message);
	}
}


export function changeAILevel(button) {
	if (button.classList.contains('off')) {
		button.classList.remove('off');
		button.classList.add('easy');
	} else if (button.classList.contains('easy')) {
		button.classList.remove('easy');
		button.classList.add('medium');
	} else if (button.classList.contains('medium')) {
		button.classList.remove('medium');
		button.classList.add('hard');
	} else if (button.classList.contains('hard')) {
		button.classList.remove('hard');
		button.classList.add('off');
	}
}


export function changePlayerNumber(number) {
	let players = document.getElementById('tournament-players-list');
	if (number === 4 && document.getElementById('tournament-players-list').children.length === 8) {
		while (players.children.length > 4) {
			players.removeChild(players.lastChild);
		}
	} else if (number === 8 && document.getElementById('tournament-players-list').children.length === 4) {
		for (let i = 0; i < 4; i++) {
			let player_clone = players.children[0].cloneNode(true);
			player_clone.children[0].children[0].id = 'player' + (i + 5) + '-input';
			player_clone.children[0].children[0].value = "";
			player_clone.children[0].children[1].for = player_clone.children[0].children[0].id;
			player_clone.children[0].children[1].innerHTML = 'Joueur ' + (i + 5);
			player_clone.children[0].children[2].className = 'tournament-AI-button off';
			player_clone.children[0].children[2].addEventListener('click', function () {
				changeAILevel(this);
			});
			players.appendChild(player_clone);
		}
	}
}


export async function resetTournament() {
	if (!TOURNAMENT_UID) return;

	try {
		const playersList = document.getElementById('tournament-players-list');
		while (playersList.children.length > 4) {
			playersList.removeChild(playersList.lastChild);
		}

		for (let i = 0; i < playersList.children.length; i++) {
			const player = playersList.children[i];
			const input = player.querySelector('input');
			const aiButton = player.querySelector('.tournament-AI-button');

			input.value = "";

			aiButton.className = 'tournament-AI-button off';
		}

		const scoreBoard = document.getElementById('tournament-scoreboard');
		if (scoreBoard) {
			document.body.removeChild(scoreBoard);
		}

		const tournamentEnd = document.getElementById('tournament-end');
		if (tournamentEnd) {
			document.body.removeChild(tournamentEnd);
		}

		ISFINISHED = null;

		await deleteTournament();
		document.addEventListener('click', handleOutsideClick);
	} catch (error) {
		showBootstrapAlert("Une erreur est survenue lors de la réinitialisation du tournoi", 'danger');
	}
}
