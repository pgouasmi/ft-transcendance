from datetime import datetime
import uuid
import logging
import os


class GameStatus:
    WAITING_AI = "waiting_ai"
    WAITING_PLAYER = "waiting_player"
    READY = "ready"


class GameSession:
    def __init__(self):
        self.active_games = {}
        self.AI_token = os.getenv("AI_SERVICE_TOKEN")

    def create_game(self, mode: str, option: str = None, jwt: str = None) -> str:
        """Crée une nouvelle partie"""
        self.cleanup_finished_games()  # Nettoyer les anciennes parties

        #logging.info(f"Creating game with mode: {mode}, option: {option}")
        uid = self._generate_uid(mode, option)
        status = self._determine_initial_status(mode, option)

        self.active_games[uid] = self.initialize_game(mode, option, status, jwt)

        # self.active_games[uid] = {
        #     'mode': mode,
        #     'option': option,
        #     'status': status,
        #     'created_at': datetime.now()
        # }

        # logging.info(f"Game created with UID: {uid}, in active games: {self.active_games}")
        return uid

    def initialize_game(self, mode: str, option: str, status: str, jwt: str):
        
        # logging.info(f"Initializing game with mode: {mode}, option: {option}, status: {status}, jwt: {jwt}")
        
        game = {
            'mode': mode,
            'option': option,
            'status': status,
            'created_at': datetime.now(),
            'p1_jwt': jwt,
            'p2_jwt': None
        }
        
        if mode == 'PVE':
            game['p2_jwt'] = self.AI_token
        return game


    def find_available_game(self, mode: str, option: str = None, jwt: str = None) -> str:
        """Trouve une partie disponible à rejoindre"""
        if mode == 'AI':
            # logging.info("Finding AI game, len of active games: " + str(len(self.active_games)))
            return self._find_waiting_ai_game()
        elif mode == 'PVP' and option == '1':
            return self._find_waiting_lan_game(jwt)
        return 'error'

    def _determine_initial_status(self, mode: str, option: str) -> str:
        """Détermine le statut initial d'une partie"""
        if mode == 'PVE':
            return GameStatus.WAITING_AI
        elif mode == 'PVP' and option == '1':
            return GameStatus.WAITING_PLAYER
        return GameStatus.READY

    def _generate_uid(self, mode: str, option: str) -> str:
        """Génère un UID unique selon le mode"""
        if mode == 'PVE':
            return self._generate_pve_uid(option)
        elif mode == 'PVP':
            return self._generate_pvp_uid(option)
        raise ValueError(f"Mode non reconnu: {mode}")

    def _generate_pve_uid(self, difficulty: str) -> str:
        """Génère un UID pour une partie PVE"""
        uid = str(uuid.uuid4())
        uid = difficulty[0] + uid[1:]
        if len(difficulty) == 1:
            uid += '2'
        else:
            # logging.info(f"Difficulty: {difficulty}, created UID: {uid} ai as p1")
            uid += '1'

        while uid in self.active_games:
            uid = str(uuid.uuid4())
            uid = difficulty[0] + uid[1:]
            if len(difficulty) == 1:
                uid += '2'
            else:
                uid += '1'
        return uid

    def _generate_pvp_uid(self, option: str) -> str:
        """Génère un UID pour une partie PVP"""
        if option == '1':  # LAN
            uid = "PVP" + str(uuid.uuid4())
            while uid in self.active_games:
                uid = "PVP" + str(uuid.uuid4())
            return uid
        else:  # Keyboard
            uid = 'k' + str(uuid.uuid4())[1:-1] + 'k'
            while uid in self.active_games:
                uid = 'k' + str(uuid.uuid4())[1:-1] + 'k'
            return uid

    def _find_waiting_ai_game(self) -> str:
        """Trouve une partie en attente d'une IA"""
        for uid, game in self.active_games.items():
            if game['status'] == GameStatus.WAITING_AI:
                game['status'] = GameStatus.READY
                return uid
        return 'error'

    def _find_waiting_lan_game(self, jwt:str) -> str:
        """Trouve une partie LAN en attente d'un joueur"""
        for uid, game in self.active_games.items():
            if (game['mode'] == 'PVP' and
                    game['option'] == '1' and
                    game['status'] == GameStatus.WAITING_PLAYER):
                game['status'] = GameStatus.READY
                game['p2_jwt'] = jwt
                return uid
        return 'error'


    def remove_game(self, uid: str) -> bool:
        """Supprime une partie terminée"""
        try:
            if uid in self.active_games:
                del self.active_games[uid]
                #logging.info(f"Successfully removed game {uid}")
                return True
            logging.warning(f"Game {uid} not found for removal")
            return False
        except Exception as e:
            logging.error(f"Error removing game {uid}: {e}")
            return False
        

    def cleanup_finished_games(self):
        """Nettoie les parties terminées"""
        current_time = datetime.now()
        to_remove = []

        for uid, game in self.active_games.items():
            # Si la partie a plus de 5 minutes ou est marquée comme terminée
            if (current_time - game['created_at']).total_seconds() > 300:
                to_remove.append(uid)

        for uid in to_remove:
            self.remove_game(uid)

    def game_exists(self, uid: str, client_token: str) -> bool:
        """Vérifie si une partie existe"""

        # logging.info(f"game exists: uid in active games: {uid}")
        
        game = self.active_games[uid]
        
        if game is None:
            return False
        
        if game["mode"] == "PVE":
            ai_is_player_one = uid[-1] == '1'
            if ai_is_player_one is True:
                return game["p1_jwt"] == self.AI_token and game["p2_jwt"] == client_token
            else:
                return game["p1_jwt"] == client_token and game["p2_jwt"] == self.AI_token
            
        else:
            return game["p1_jwt"] == client_token or game["p2_jwt"] == client_token


# Instance unique
game_session = GameSession()

__all__ = ['GameSession', 'game_session']