import re
import uuid
import bleach
import random
from html import escape
from typing import Dict, Union
from django.core.exceptions import ValidationError

# Map of all the tournaments and their uids
tournaments_list = []

class Player:
    def __init__(self, id = 0, name = 'Player', ai = False, difficulty = 'easy'):
        self.id = id
        self.name = name
        self.ai = ai
        self.difficulty = difficulty
        self.defeated = False

    def dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'ai': self.ai,
            'difficulty': self.difficulty,
            'defeated': self.defeated
        }

class Tournament:
    def __init__(self, players_list=[]):
        self.uid = "TOUR" + str(uuid.uuid4())
        self.players = self.init_players(players_list)
        self.rounds = [[[-1, -1], [-1, -1]], [[-1, -1]], [[-1]]]
        if len(self.players) == 8:
            self.rounds = [[[-1, -1], [-1, -1], [-1, -1], [-1, -1]], [[-1, -1], [-1, -1]], [[-1, -1]], [[-1]]] # 8 players
        self.current_round = 0
        self.current_match = 0

        if len(self.players) < 2:
            raise ValueError("You need at least 2 players to start a tournament")
        random.shuffle(self.players)
        self.init_rounds()
        tournaments_list.append(self)

    def validate_player_data(self, player_data: Dict[str, Union[str, bool, int]]) -> Dict[str, Union[str, bool, int]]:
        """
        Validate and sanitize player data.
        
        Args:
            player_data: Dictionary containing player data with format:
                {
                    'id': str,
                    'name': str,
                    'difficulty': str ('off', 'easy', 'medium', 'hard'),
                    'ai': bool
                }
        
        Returns:
            Dict: Sanitized player data
        
        Raises:
            ValidationError: If any validation check fails
            TypeError: If player_data is not a dictionary
        """
        # Copie profonde pour éviter la modification des données d'origine
        try:
            sanitized_data = player_data.copy()
        except AttributeError:
            raise TypeError("Player data must be a dictionary")

        # Verify input is a dictionary
        if not isinstance(sanitized_data, dict):
            raise TypeError("Player data must be a dictionary")

        # Check for required fields
        required_fields = ['id', 'name', 'ai', 'difficulty']
        missing_fields = [field for field in required_fields if field not in sanitized_data]
        if missing_fields:
            raise ValidationError(f"Missing required fields: {', '.join(missing_fields)}")

        # Validate and sanitize name
        if 'name' not in sanitized_data:
            raise ValidationError("Player name is required")
        
        if not isinstance(sanitized_data['name'], str):
            raise ValidationError("Player name must be a string")
        
        # Sanitize the name
        name = sanitized_data['name']
        # Supprime les caractères non-alphanumériques et les caractères spéciaux dangereux
        name = bleach.clean(name, tags=[], strip=True)  # Supprime tout HTML
        name = re.sub(r'[^\w\s-]', '', name)  # Ne garde que les lettres, chiffres, espaces et tirets
        name = name.strip()
        
        # Validation post-sanitization
        if not name:
            raise ValidationError("Player name cannot be empty")
        if len(name) > 10:
            raise ValidationError("Player name is too long (max 10 characters)")
        
        # Protection contre les attaques NoSQL
        if any(char in name for char in ['$', '{', '}']):
            raise ValidationError("Invalid characters in player name")

        sanitized_data['name'] = name

        # Validate AI field with type checking
        if not isinstance(sanitized_data.get('ai'), bool):
            if isinstance(sanitized_data.get('ai'), str):
                ai_str = sanitized_data['ai'].lower()
                if ai_str == 'true':
                    sanitized_data['ai'] = True
                elif ai_str == 'false':
                    sanitized_data['ai'] = False
                else:
                    raise ValidationError("AI field must be a boolean or 'True'/'False' string")
            else:
                raise ValidationError("AI field must be a boolean")

        # Validate difficulty with strict checking
        valid_difficulties = {'off', 'easy', 'medium', 'hard'}
        if not isinstance(sanitized_data.get('difficulty'), str):
            raise ValidationError("Difficulty must be a string")
        
        difficulty = sanitized_data['difficulty'].lower()
        # Protection contre l'injection
        difficulty = bleach.clean(difficulty, tags=[], strip=True)
        if difficulty not in valid_difficulties:
            raise ValidationError(
                f"Invalid difficulty. Must be one of: {', '.join(valid_difficulties)}"
            )
        
        sanitized_data['difficulty'] = difficulty

        # Validate ID if present
        if 'id' in sanitized_data:
            if not isinstance(sanitized_data['id'], (str, int)):
                raise ValidationError("Player ID must be a string or integer")
            
            if isinstance(sanitized_data['id'], str):
                # Sanitize string ID
                id_str = sanitized_data['id']
                id_str = bleach.clean(id_str, tags=[], strip=True)
                id_str = re.sub(r'[^\w-]', '', id_str)  # Only allow alphanumeric and dash
                if not id_str:
                    raise ValidationError("Invalid ID format")
                sanitized_data['id'] = id_str
            else:
                # Validate integer ID
                if sanitized_data['id'] < 0:
                    raise ValidationError("ID cannot be negative")

        # Protection contre la sérialisation JSON malveillante
        if '__proto__' in sanitized_data or 'constructor' in sanitized_data:
            raise ValidationError("Invalid field names detected")

        return sanitized_data

    def init_players(self, players_list):
        players = []
        try :
            for i, player_data in enumerate(players_list):
                self.validate_player_data(player_data)
                player = Player(i, player_data['name'], player_data['ai'], player_data['difficulty'])
                players.append(player)
        except Exception as e:
            raise ValueError(f"An error occurred while initializing players: {str(e)}")
        return players

    def init_rounds(self):
        first_round = []
        players = self.players.copy()
        while len(players) >= 2:
            player1 = players.pop(0)
            player2 = players.pop(0)
            first_round.append([player1, player2])
        self.rounds[0] = first_round

    def get_next_match(self):
        player1 = self.rounds[self.current_round][self.current_match][0].dict()
        if len(self.rounds[self.current_round][self.current_match]) == 1:
            return [player1]
        player2 = self.rounds[self.current_round][self.current_match][1].dict()
        return [player1, player2]

    def set_results(self, winner):
        player1 = self.rounds[self.current_round][self.current_match][0]
        player2 = self.rounds[self.current_round][self.current_match][1]

        if player1.id == winner['id']:
            player2.defeated = True
        else :
            player1.defeated = True
        
        self.rounds[self.current_round + 1][((self.current_match + 1) // 2) - 1 if (self.current_match + 1) % 2 == 0 else (self.current_match + 1) // 2][self.current_match % 2 ] = player1 if player1.id == winner['id'] else player2
        
        self.current_match += 1
        if self.current_match >= len(self.rounds[self.current_round]):
            self.current_round += 1
            self.current_match = 0

    def to_dict(self):
        # Serialize rounds with players
        serialized_rounds = []
        for round in self.rounds:
            serialized_round = []
            for match in round:
                if isinstance(match, list):
                    serialized_match = []
                    for player in match:
                        if player == -1:
                            serialized_match.append(-1)
                        else:
                            serialized_match.append(player.dict())
                    serialized_round.append(serialized_match)
                else:
                    serialized_round.append(-1)
            serialized_rounds.append(serialized_round)

        return {
            'uid': self.uid,
            'players': [p.dict() for p in self.players],
            'rounds': serialized_rounds,
            'current_round': self.current_round,
            'current_match': self.current_match
        }



def get_tournament(uid):
    return next((t for t in tournaments_list if t.uid == uid), None)

def delete_tournament(uid):
    tournament = get_tournament(uid)
    if tournament:
        tournaments_list.remove(tournament)
        return True
    return False