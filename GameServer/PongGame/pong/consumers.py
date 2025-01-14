import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from .game.game_wrapper import GameWrapper
import logging
import aiohttp
from enum import Enum
from .game.game_manager import game_manager

from urllib.parse import parse_qs
import jwt
import base64
import time

import os

class PlayerType(Enum):
    HUMAN = "Human"
    AI = "AI"

class GameMode(Enum):
    PVP_KEYBOARD = "PVP_keyboard"
    PVP_LAN = "PVP_LAN"
    PVE = "PVE"

class ClientType(Enum):
    AI = 2
    FRONT = 1


class Errors(Enum):
    WRONG_UID = 1
    WRONG_TOKEN = 2
    TIMEOUT = 3
    SAME_JWT = 4


class PongConsumer(AsyncWebsocketConsumer):
    logger = logging.getLogger(__name__)
    game_wrapper = None
    side = None
    is_main = False
    has_resumed = False
    mode = None
    adversary = None
    error_on_connect = 0
    client = None
    sleeping = False
    message_timestamp = 0
    jwt_token = None


    clients = {}

    def decode_jwt_unsafe(self, token):
        try:
            header_b64, payload_b64, _ = token.split('.')
            padding = '=' * (-len(payload_b64) % 4)
            payload_b64_padded = payload_b64 + padding
            payload_json = base64.urlsafe_b64decode(payload_b64_padded)
            return json.loads(payload_json)
        except Exception as e:
            logging.error(f"Erreur décodage base64: {str(e)}")
            return None

    async def verify_token(self):
        try:
            protocols = self.scope.get('subprotocols', [])
            # logging.info(f"Protocoles reçus: {protocols}")

            if not protocols:
                logging.error("Aucun sous-protocole reçu")
                self.error_on_connect = Errors.WRONG_TOKEN.value
                return False

            token = protocols[0].replace('token_', '')
            self.jwt_token = token

            service_tokens = [
                os.getenv('AI_SERVICE_TOKEN', '').replace('Bearer', '').strip(),
            ]

            if token in service_tokens:
#                 logging.info("Token de service validé")
                return True

            unsafe_payload = self.decode_jwt_unsafe(token)
            if not unsafe_payload:
                logging.error("Échec du décodage base64")
                self.error_on_connect = Errors.WRONG_TOKEN.value
                return False

#             logging.info(f"Payload décodé (non sécurisé): {unsafe_payload}")

            secret_key = os.getenv('JWT_SECRET_KEY')
            if not secret_key:
                logging.error("JWT_SECRET_KEY non définie")
                self.error_on_connect = Errors.WRONG_TOKEN.value
                return False

            secure_payload = jwt.decode(
                token,
                secret_key,
                algorithms=['HS256']
            )
#             logging.info(f"Payload décodé (sécurisé): {secure_payload}")

            if unsafe_payload != secure_payload:
                logging.error("Les payloads ne correspondent pas")
                self.error_on_connect = Errors.WRONG_TOKEN.value
                return False

            self.user = secure_payload.get('username')
#             logging.info(f"JWT validé pour l'utilisateur: {self.user}")

            return True

        except jwt.InvalidTokenError as e:
            logging.error(f"Token JWT invalide: {str(e)}")
            self.error_on_connect = Errors.WRONG_TOKEN.value
            return False

        except Exception as e:
            logging.error(f"Erreur inattendue lors de la vérification: {str(e)}")
            self.error_on_connect = Errors.WRONG_TOKEN.value
            return False


    async def connect(self):

        # logging.info(f"tentative de Connexion de {self.scope['user']}")

        if not await self.verify_token():
            logging.error(f"verify token is false")
            await self.disconnect(4001)
            await self.close(4001)
            return

        
        if not await self.verify_game_uid():
            logging.error("verify game uid failed")
            await self.disconnect(4002)
            await self.close(4002)
            return

        self.game_wrapper = await game_manager.create_or_get_game(self.game_id)

        self.group_name = f"pong_{self.game_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        if self.group_name not in self.clients:
            self.clients[self.group_name] = []
        if len(self.clients[self.group_name]) == 2:
            logging.error(f"Group {self.group_name} is full")
            await self.close(4005)
        else:
            self.clients[self.group_name].append(self)
        # logging.info(f"in connect, number of groups: {len(self.clients)}\nName of groups: {self.clients.keys()}\nsize of current group[channel_name]: {len(self.clients[self.group_name])}")


        subprotocol = self.scope.get('subprotocols', [''])[0]
        
        await self.accept(subprotocol=subprotocol)

        await self._initialize_game_mode()
        # logging.info(f"Game mode: {self.mode}")
#         logging.info(f"number of connected players: {self.game_wrapper.present_players}")

        await self.get_name_from_jwt()

        if self.is_main is True:
            asyncio.ensure_future(self.generate_states())

        else:
            asyncio.ensure_future(self.wait_for_second_player())

    async def get_name_from_jwt(self):

        # logging.info(f"get_name_from_jwt, self.jwt_token: {self.jwt_token}")

        try:

            if self.jwt_token == os.getenv('AI_SERVICE_TOKEN').replace('Bearer', '').strip():
                # logging.info("AI service token !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
                return
            payload = jwt.decode(self.jwt_token, options={'verify_signature': False})
            # logging.info(f"payload: {payload}")
            username = payload['username']
            # logging.info(f"username: {username}")
            if username.startswith('guest'):
                return
            if self.side == "p1":
                self.game_wrapper.player_1.name = username
            else:
                self.game_wrapper.player_2.name = username

        except Exception as e:
            logging.error(f"Error in get_name_from_jwt: {e}")


    async def wait_for_second_player(self):
        try:
            timestamp = time.time()
            timeout = 10  # 10 secondes
            if self.mode == GameMode.PVP_LAN.value:
                timeout = 5
    
            while time.time() - timestamp < timeout:
                if self.game_wrapper.all_players_connected.is_set():
                    if self.game_wrapper.player_1.name not in (None, 'guest') and self.game_wrapper.player_1.name == self.game_wrapper.player_2.name:
                        for client in self.clients[self.group_name]:
                            await client.send(json.dumps({
                            "type": "same_jwt",
                        }))
                        self.error_on_connect = Errors.SAME_JWT.value
                        await self.disconnect(close_code=4003)
                        await self.close(code=4003)
                        return
                        
                    for client in self.clients[self.group_name]:
                        await client.send(json.dumps({
                           "type": "opponent_connected",
                           "opponent_connected": True
                        }))
                        await client.send(json.dumps({
                           "type": "names",
                           "p1": self.game_wrapper.player_1.name,
                           "p2": self.game_wrapper.player_2.name
                        }))
                        # logging.info("sent names")
                    # logging.info("Second player connected successfully")
                    return
                await asyncio.sleep(0.1)
    
            # Timeout atteint
            logging.error("Timeout waiting for second player")
            await self.send(json.dumps({
                "type": "timeout",
                "message": "Second player failed to connect",
                "game_mode": self.mode
            }))
            
            self.error_on_connect = Errors.TIMEOUT.value
            await self.disconnect(close_code=4003)
            await self.close(code=4003)
            return

        except Exception as e:
            logging.error(f"Error in wait_for_second_player: {e}")
            await self.disconnect(close_code=4003)
            await self.close(code=4003)
            return


    async def verify_game_uid(self):
        self.game_id = self.scope['url_route']['kwargs']['uid']
        # logging.info(f"in verify game_uid: uid: {self.game_id}")
        if self.game_id is None:
            self.error_on_connect = Errors.WRONG_UID.value
            return False
        async with aiohttp.ClientSession() as session:
                verify_url = f"https://nginx:7777/game/verify/{self.game_id}/"
                headers = await self.generate_headers()
#                 # logging.info(f"in verify game_uid: headers: {headers}")

                try:
                    async with session.get(
                            verify_url,
                            ssl=False,
                            headers=headers
                    ) as response:
                        # logging.info(f"verify uid response: {response}")
                        response_text = await response.text()
                        # logging.info(f"response.text: {response_text}")
                        if response.status not in [200]:  # On accepte 404 si le jeu est déjà nettoyé
                            # logging.error(f"verify failed: {response.status}")
                            # logging.error(f"Response: {response_text}")
                            return False
                        else:
#                             # logging.info(f"verify successful for game {self.game_id}")
                            return True
                except Exception as e:
                    logging.error(f"verify request error: {str(e)}")
                    return False


#*********************GAME MODE INITIALIZATION START********************************
    async def _initialize_game_mode(self):
        if self._is_shared_screen_mode():
            self._init_shared_screen()
        elif self._is_lan_mode():
            self._init_lan_mode()
        else:
            self._init_pve_mode()
        await self.send(json.dumps({"type": "greetings", "side": self.side}))


    #********************SHARED SCREEN MODE INITIALIZATION START*********************
    def _is_shared_screen_mode(self):
        return self.game_id[0] == 'k' and self.game_id[-1] == 'k'


    def _init_shared_screen(self):
        self.mode = GameMode.PVP_KEYBOARD.value
        self.client = ClientType.FRONT.value
        self.is_main = True
        self.game_wrapper.present_players += 2

        for player in [self.game_wrapper.player_1, self.game_wrapper.player_2]:
            player.type = PlayerType.HUMAN.value
            player.is_connected = True

        self.game_wrapper.all_players_connected.set()
        self.game_wrapper.ai_is_initialized.set()
        self.game_wrapper.game.RUNNING_AI = False

    #********************SHARED SCREEN MODE INITIALIZATION STOP************************



    #*********************LAN MODE INITIALIZATION START********************************
    def _is_lan_mode(self):
        return self.game_id.startswith('PVP')

    def _init_lan_mode(self):
        self.mode = GameMode.PVP_LAN.value
        self.client = ClientType.FRONT.value
        self.game_wrapper.present_players += 1

        if self.game_wrapper.present_players == 2:
            self._setup_second_lan_player()
        else:
            self._setup_first_lan_player()

        self._setup_lan_common()

    def _setup_first_lan_player(self):
        self.side = "p1"
        self.game_wrapper.player_1.type = PlayerType.HUMAN.value
        self.game_wrapper.player_1.is_connected = True

    def _setup_second_lan_player(self):
        self.side = "p2"
        self.is_main = True
        self.game_wrapper.player_2.is_connected = True
        self.game_wrapper.all_players_connected.set()
        # logging.info("all players are connected")
        self.game_wrapper.player_2.type = PlayerType.HUMAN.value

    def _setup_lan_common(self):
        self.game_wrapper.ai_is_initialized.set()
        self.game_wrapper.waiting_for_ai.set()
        self.game_wrapper.game.RUNNING_AI = False

    #*********************LAN MODE INITIALIZATION END********************************



    #*********************PVE MODE INITIALIZATION START******************************
    def _init_pve_mode(self):
        self.mode = GameMode.PVE.value
        # self._setup_pve_players()
        self.game_wrapper.present_players += 1

        if self.game_wrapper.present_players == 2:
            self._handle_second_pve_connection(self.game_id)
        else:
            self._handle_first_pve_connection(self.game_id)

        self.game_wrapper.game.RUNNING_AI = True

    def _handle_first_pve_connection(self, game_id):
        ai_is_player_one = game_id[-1] == '1'
        # logging.info(f"ai_is_player_one: {ai_is_player_one}")

        if ai_is_player_one is True:
            self.side = "p2"
            self.game_wrapper.player_2.type = PlayerType.HUMAN.value
            self.game_wrapper.player_1.type = PlayerType.AI.value
            self.game_wrapper.player_2.is_connected = True
        else:
            self.side = "p1"
            self.game_wrapper.player_1.type = PlayerType.HUMAN.value
            self.game_wrapper.player_2.type = PlayerType.AI.value
            self.game_wrapper.player_1.is_connected = True

    def _handle_second_pve_connection(self, game_id):
        ai_is_player_one = game_id[-1] == '1'
        # logging.info(f"ai_is_player_one: {ai_is_player_one}")

        if ai_is_player_one is True:
            self.side = "p1"
            if self.game_wrapper.player_1.name == None:
                self.game_wrapper.player_1.name = "AI"
            self.game_wrapper.player_1.is_connected = True
            self.game_wrapper.player_1.is_ready = True
        else:
            self.side = "p2"
            if self.game_wrapper.player_2.name == None:
                self.game_wrapper.player_2.name = "AI"
            self.game_wrapper.player_2.is_connected = True
            self.game_wrapper.player_2.is_ready = True

        self.is_main = True
        self.game_wrapper.all_players_connected.set()
        # logging.info("all players are connected")

    #*********************PVE MODE INITIALIZATION sideEND********************************

#*********************GAME MODE INITIALIZATION END********************************

#******************************DISCONNECT********************************


    async def handle_connect_error(self, error_code):
        if hasattr(self, 'game_wrapper') and self.game_wrapper:
                self.game_wrapper.present_players = max(0, self.game_wrapper.present_players - 1)
                self.game_wrapper.game.pause = True
                self.game_wrapper.game_over.set()
                
                if self.game_wrapper.present_players <= 0:
                    if hasattr(self, 'game_id'):
                        await game_manager.remove_game(self.game_id)
                    self.game_wrapper = None


    async def send_user_stats(self):
        if self.game_wrapper is None or self.game_wrapper.start_event.is_set() == False:
            return
        try:
            url = 'https://nginx:7777/auth/incrementusercounters/'
            
            # Préparation des données dans le format attendu par request.POST
            form_data = aiohttp.FormData()
            form_data.add_field('token', self.jwt_token)
            form_data.add_field('goals', str(
                self.game_wrapper.game.paddle1.score if self.side == "p1" else self.game_wrapper.game.paddle2.score
            ))
            form_data.add_field('winner', str(
                (self.side == "p1" and self.get_winner() == "Player1") or 
                (self.side == "p2" and self.get_winner() == "Player2")
            ).lower())
            form_data.add_field('game_service_token', os.getenv('GAME_SERVICE_TOKEN'))

            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    data=form_data,
                    headers=headers,
                    ssl=False
                ) as response:
                    response_text = await response.text()
                    if response.status == 200:
                        response_data = json.loads(response_text)
                        # logging.info(f"Stats updated successfully: goals={response_data['goal_counter']}, wins={response_data['win_counter']}")
                    else:
                        logging.error(f"Stats update failed: {response.status}")
                        logging.error(f"Response: {response_text}")

        except Exception as e:
            logging.error(f"Error sending stats: {str(e)}")

    async def disconnect(self, close_code):
        # logging.info(f"Disconnect, code: {close_code}")
        if close_code == 1006:
            # logging.info(f"Disconnect for instance {id(self)}")
            return
        try:
            if self.mode == "PVP_LAN":
                await self.send_user_stats()

            # Log pour debug
            # logging.info(f"Starting disconnect for instance {id(self)}")
            # if hasattr(self, 'group_name'):
            #     logging.info(f"Group name: {self.group_name}")
            # logging.info(f"Available groups: {list(self.clients.keys())}")
    
            if hasattr(self, 'group_name'):
                try:
                    await self.channel_layer.group_discard("pong", self.channel_name)
                except Exception as e:
                    logging.warning(f"Error discarding from channel layer: {str(e)}")
            
            try:
                if (hasattr(self, 'clients') and hasattr(self, 'group_name') 
                    and isinstance(self.clients, dict)  
                    and self.group_name in self.clients):
                    
                    if self in self.clients[self.group_name]:
                        self.clients[self.group_name].remove(self)
                        # logging.info(f"Removed client from group {self.group_name}")
                    
                    if not self.clients[self.group_name]:
                        del self.clients[self.group_name]
                        # logging.info(f"Deleted empty group {self.group_name}")
                    
                    # logging.info(f"After cleanup - Number of groups: {len(self.clients)}")
                    # logging.info(f"Groups remaining: {list(self.clients.keys())}")
            except Exception as e:
                logging.warning(f"Error cleaning up clients: {str(e)}")
    
            try:
                # logging.info(f"Sending cleanup request for game_id: {self.game_id}")
                await self.send_cleanup_request()
                # logging.info(f"Sent cleanup for game_id: {self.game_id}")
            except Exception as e:
                logging.warning(f"Error in cleanup request: {str(e)}")
    
            if self.error_on_connect != 0:
                await self.handle_connect_error(self.error_on_connect)
            
            elif hasattr(self, 'game_wrapper') and self.game_wrapper:
                try:
                    self.game_wrapper.present_players = max(0, self.game_wrapper.present_players - 1)
                    self.game_wrapper.game.pause = True
                    self.game_wrapper.game_over.set()
                    
                    if self.game_wrapper.present_players <= 0:
                        if hasattr(self, 'game_id'):
                            await game_manager.remove_game(self.game_id)
                        self.game_wrapper = None
                except Exception as e:
                    logging.warning(f"Error cleaning up game wrapper: {str(e)}")
                
                if hasattr(self, 'game_id'):
                    try:
                        data = self.generate_gameover_data()
                        await self.send_gameover_to_remaining_client(data)
                    except Exception as e:
                        pass

        except Exception as e:
            logging.error(f"Error in disconnect: {str(e)}")
            logging.error(f"Full error details: {e.__class__.__name__}")
            logging.error(f"group_name: {getattr(self, 'group_name', 'Not set')}")
            logging.error(f"Available groups: {list(getattr(self, 'clients', {}).keys())}")

    async def send_cleanup_request(self):

        base_url = f"https://nginx:7777"
        if self.game_id is None:
            self.game_id = self.scope['url_route']['kwargs']['uid']
        async with aiohttp.ClientSession() as session:
            # Cleanup request
            cleanup_url = f"{base_url}/game/cleanup/{self.game_id}/"
            headers = await self.generate_headers()

            try:
                async with session.delete(
                        cleanup_url,
                        ssl=False,
                        headers=headers
                ) as response:
                    response_text = await response.text()
                    if response.status not in [200, 404]:
                        logging.error(f"Cleanup failed: {response.status}")
                        logging.error(f"Response: {response_text}")
            except Exception as e:
                logging.error(f"Cleanup request error: {str(e)}")

    async def send_gameover_to_remaining_client(self, data):
#         logging.info(f"Sending gameover event to remaining client")
        if self.mode == "PVP_keyboard":
            return
        remaining_client = None
        for client in self.clients[self.group_name]:
            if client != self:
                remaining_client = client
                break
        if remaining_client is not None:
            # logging.info(f"Sending gameover event to remaining client, data: {data}")
            await remaining_client.send(json.dumps(data))

    async def generate_headers(self):
        headers = {
            'Content-Type': 'application/json',
            "Authorization": f"{os.getenv('GAME_SERVICE_TOKEN')}",
            "Client_token": self.jwt_token
        }
        return headers

    def generate_gameover_data(self):
        data = {
            'type': 'gameover',
            'sender': 'game',
            'uid': self.game_id,
            'winner': self.get_winner(),
        }
        return data

    def get_winner(self):
        if self.mode == "PVE":
            if self.client == ClientType.FRONT:
                winner = "Human"
            else:
                winner = "AI"
        else:
            if self.game_wrapper.game.paddle1.score > self.game_wrapper.game.paddle2.score:
                winner = "Player1"
            else:
                winner = "Player2"

        return winner

    async def receive(self, text_data):
        current_time = time.time()
        if current_time - self.message_timestamp >= 1/80 or not text_data.startswith("{\"type\":\"keyDown"):
            self.message_timestamp = time.time()
            try:
                event = json.loads(text_data)
                if event["sender"] == "front" or event["sender"] == "cli":
                    await self.handle_front_input(event)
                elif event["sender"] == "AI":
                    await self.handle_ai_input(event)
                elif event["sender"] == "game":
                    await self.handle_game_input(event)
            except Exception as e:
                self.logger.info(f"Error in receive: {e}")
                await self.disconnect(4004)
                await self.close(4004)
                return
        # else:
        #     logging.info(f"SPAMMMMMMMMMMMMMMMMMMMMM")

    
    async def handle_game_input(self, event):
        if event["type"] == "gameover":
            await self.disconnect(4003)
            await self.close(4003)
            return


    async def handle_ai_input(self, event):
        self.client = ClientType.AI
        if event["type"] == "greetings":
            self.game_wrapper.ai_is_initialized.set()
            self.game_wrapper.received_names.set()
            self.game_wrapper.received_names.set()
        if event["type"] == "move":
#             # logging.info(f"AI move event: {event}\n\n")
            if event["direction"] == "up":
                if self.side == "p1":
                    self.game_wrapper.player_1.action = 1
                else:
                    self.game_wrapper.player_2.action = 1
            elif event["direction"] == "down":
                if self.side == "p1":
                    self.game_wrapper.player_1.action = -1
                else:
                    self.game_wrapper.player_2.action = -1
            else:
                if self.side == "p1":
                    self.game_wrapper.player_1.action = 0
                else:
                    self.game_wrapper.player_2.action = 0

    async def handle_player1_input(self, event):
        if event["player"] == "p1" and self.side == "p1":
            self.game_wrapper.player_1.action = event["value"][0]

    async def handle_player2_input(self, event):
        if event["player"] == "p2" and self.side == "p2":
            self.game_wrapper.player_2.action = event["value"][1]


    async def get_player_name(self, event):
        # logging.info(f"got in get_player_name: {event}")
        if "name" not in event:
            # logging.error("got no name")
            # logging.info(f"present_players: {self.game_wrapper.present_players}, all_players_connected: {self.game_wrapper.all_players_connected}")
            if self.game_wrapper.present_players == 2:
                self.game_wrapper.received_names.set()
                # logging.info("received names set, DIDNT RECEIVE ANY")
            return
        names = event["name"]
        # logging.info(f"received names: {names}")
        if len(names) != 2:
            if self.side == "p1":
                self.game_wrapper.player_1.name = event["name"][0]
            else:
                self.game_wrapper.player_2.name = event["name"][1]
        else:
            self.game_wrapper.player_1.name = event["name"][0]
            self.game_wrapper.player_2.name = event["name"][1]
        await asyncio.sleep(1)
        for client in self.clients[self.group_name]:
            await client.send(json.dumps({
                           "type": "names",
                           "p1": self.game_wrapper.player_1.name,
                           "p2": self.game_wrapper.player_2.name
                           }))
        self.game_wrapper.received_names.set()
        await asyncio.sleep(1)
        for client in self.clients[self.group_name]:
            await client.send(json.dumps({
                           "type": "names",
                           "p1": self.game_wrapper.player_1.name,
                           "p2": self.game_wrapper.player_2.name
                           }))
        self.game_wrapper.received_names.set()


    async def handle_front_input(self, event):
        self.client = ClientType.FRONT
        # logging.info(f"got in handle_front_input: {event}")
        if event["type"] == "resumeOnGoal":
            # logging.info(f"got resumeOnGoal")
            if self.mode == "PVP_LAN":
                if self.side == "p1":
                    self.game_wrapper.player_1.is_ready_for_next_point = True
                elif self.side == "p2":
                    self.game_wrapper.player_2.is_ready_for_next_point = True
                if self.game_wrapper.player_1.is_ready_for_next_point == True and self.game_wrapper.player_2.is_ready_for_next_point == True:
                    self.game_wrapper.player_1.is_ready_for_next_point = False
                    self.game_wrapper.player_2.is_ready_for_next_point = False
                    await self.game_wrapper.game.resume_on_goal()
                    self.game_wrapper.has_resumed.set()
            else:
                await self.game_wrapper.game.resume_on_goal()
                self.game_wrapper.has_resumed.set()
    
        if event["type"] == "greetings":
            await self.get_player_name(event)
            return
        
        elif event["type"] == "start":
            # logging.info(f"got start from {event["sender"]}")
            if self.mode == "PVE":
                if self.side == "p1":
                    self.game_wrapper.player_1.is_ready = True
                    self.game_wrapper.start_event.set()
                elif self.side == "p2":
                    self.game_wrapper.player_2.is_ready = True
                    self.game_wrapper.start_event.set()
            elif self.mode == "PVP_keyboard":
                self.game_wrapper.start_event.set()
            elif self.mode == "PVP_LAN":
                if self.side == "p1":
                    self.game_wrapper.player_1.is_ready = True
                elif self.side == "p2":
                    self.game_wrapper.player_2.is_ready = True
                if self.game_wrapper.player_1.is_ready == True and self.game_wrapper.player_2.is_ready == True:
                    self.game_wrapper.start_event.set()

        elif event["type"] == "keyDown" and self.sleeping is False:
            # logging.info("got keydown from front")
            # logging.info(f"mode: {self.mode}")
            # logging.info(f"GameModePVP_KEYBOARD: {GameMode.PVP_KEYBOARD.value}")
            # if event["event"] == "pause":
            #     if self.mode == GameMode.PVE.value or self.mode == GameMode.PVP_KEYBOARD.value:
            #         self.game_wrapper.game.pause = not self.game_wrapper.game.pause
            if self.mode == GameMode.PVP_KEYBOARD.value:
                await self.handle_PVP_keyboard_input(event)
            else:
                if self.side == "p1":
                    await self.handle_player1_input(event)
                if self.side == "p2":
                    await self.handle_player2_input(event)

    async def handle_PVP_keyboard_input(self, event):
        # logging.info(f"got in PVP_keyboard_input")
        value = event["value"]
        # logging.info(f"value: {value}")
        # logging.info(f"value [0]: {value[0]}")
        self.game_wrapper.player_1.action = value[0]
        self.game_wrapper.player_2.action = value[1]


    async def generate_states(self):
        try:
            # self.logger.info("in generate states")
            await self.game_wrapper.ai_is_initialized.wait()
            # self.logger.info("in generate states, ai is initialized")
            await self.game_wrapper.received_names.wait()
            # self.logger.info("in generate states, names received")
            await self.game_wrapper.start_event.wait()
            # self.logger.info("state gen set")
            x = 0
            self.sleeping = True
            await asyncio.sleep(2)
            self.sleeping = False
            # logging.info("starting game")
            
            async for state in self.game_wrapper.game.rungame():
                if not hasattr(self, 'game_wrapper') or self.game_wrapper is None:
                    # logging.info("Game wrapper no longer exists, stopping generate_states")
                    return
                    
                state_dict = json.loads(state)
                state_dict["game_mode"] = self.mode
                
                if self.game_wrapper.has_resumed.is_set() is False:
                    state_dict["resumeOnGoal"] = False
                else:
                    state_dict["resumeOnGoal"] = True
                    self.game_wrapper.has_resumed.clear()
    
                try:
                    if state_dict['winner'] is not None:
                        winner = state_dict['winner']
                    else:
                        winner = None
    
                    # Vérifier à nouveau si le groupe existe encore
                    if not hasattr(self, 'group_name') or self.group_name not in self.clients:
                        # logging.info("Group no longer exists, stopping generate_states")
                        return
    
                    for client in self.clients[self.group_name]:
                        state_dict['side'] = client.side
                        if winner is not None:
                            state_dict = await self.determine_winner(state_dict, winner, client)
                        await client.send(text_data=json.dumps(state_dict))
                        await asyncio.sleep(0.0000001)
                        
                    if state_dict["gameover"] == "Score":
                        self.game_wrapper.game_over.set()
                        return
                        
                    await self.move_paddles()
    
                except Exception as e:
                    logging.error(f"Error in generate_states loop: {str(e)}")
                    return
    
                x += 1
                await asyncio.sleep(0.00000001)

        except Exception as e:
            logging.error(f"Error in generate_states: {str(e)}")
            return

    async def move_paddles(self):
        asyncio.create_task(self._move_paddle_1())
        asyncio.create_task(self._move_paddle_2())

    async def _move_paddle_1(self):
        if self.game_wrapper.player_1.action == 1:
            for _ in range(5):
                await self.game_wrapper.game.paddle1.move(self.game_wrapper.game.height, up=True)
                await asyncio.sleep(0)
        elif self.game_wrapper.player_1.action == -1:
            for _ in range(5):
                await self.game_wrapper.game.paddle1.move(self.game_wrapper.game.height, up=False)
                await asyncio.sleep(0)

    async def _move_paddle_2(self):
        if self.game_wrapper.player_2.action == 1:
            for _ in range(5):
                await self.game_wrapper.game.paddle2.move(self.game_wrapper.game.height, up=True)
                await asyncio.sleep(0)
        elif self.game_wrapper.player_2.action == -1:
            for _ in range(5):
                await self.game_wrapper.game.paddle2.move(self.game_wrapper.game.height, up=False)
                await asyncio.sleep(0)

    async def determine_winner(self, state_dict, winner, client):
        state_dict["winner"] = winner
        return state_dict
