import json
import logging
import websockets
import asyncio
import sys
import ssl
import requests
from enum import Enum
import termios
from typing import Optional
import urllib3
import curses
from CLIGame import CLIGame
import logging
import signal
import atexit

class GameType(Enum):
    PVE = "PVE"
    PVP = "PVP"

class GameState(Enum):
    WAITING_FOR_AI = "waiting_for_ai"
    WAITING_FOR_OPPONENT = "waiting_for_opponent"
    IN_GAME = "in_game"
    GAME_OVER = "game_over"

class GameElement(Enum):
    EMPTY = " "
    WALL = "═"
    PADDLE = "█"
    BALL = "●"
    VERTICAL = "║"


class CLIClient:
    def __init__(self):

        self.logger = logging.getLogger('CLIClient')
        self.logger.setLevel(logging.DEBUG)
        
        fh = logging.FileHandler('debugClient.txt', mode='w')
        fh.setLevel(logging.DEBUG)
        
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        fh.setFormatter(formatter)
        
        self.logger.addHandler(fh)

        self.game = None
        self.running = True
        self.service_token = None
        self.clear_token = None
        self.game_state = None
        self.server_address = None
        
        
        self.goal_event = asyncio.Event()
        self.goal_timer = None
        
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE
        
        self.signal_received = False
        
        self.original_terminal_state = termios.tcgetattr(sys.stdin)
        atexit.register(self.cleanup_terminal)
        
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        self.ascii_title = [
    "  █████╗  ███████╗████████╗██████╗  ██████╗  ",
    " ██╔══██╗ ██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗ ",
    " ███████║ ███████╗   ██║   ██████╔╝██║   ██║ ",
    " ██╔══██║ ╚════██║   ██║   ██╔══██╗██║   ██║ ",
    " ██║  ██║ ███████║   ██║   ██║  ██║╚██████╔╝ ",
    " ╚═╝  ╚═╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝  ",
    "              アストロ・ポング                 ",
    "╭──────────────────────────────────────────╮",
    "│                 CLI MODE                 │",
    "╰──────────────────────────────────────────╯"
]
        
        
    def cleanup_terminal(self):
        if hasattr(self, 'original_terminal_state'):
            try:
                termios.tcsetattr(sys.stdin, termios.TCSADRAIN, self.original_terminal_state)
            except:
                pass
        
    def signal_handler(self, signum, frame):
        """Gestion propre des signaux d'interruption"""
        self.signal_received = True
        self.running = False
        self.cleanup_curses()
        print("\nSignal received, cleaning up...")
        sys.exit(0)

    def init_curses(self):
        
        self.original_terminal_state = termios.tcgetattr(sys.stdin)
        
        self.stdscr = curses.initscr()
        curses.noecho()
        curses.cbreak()
        
        curses.mouseinterval(-1)
        curses.mousemask(0)
        
        self.window = curses.newwin(45, 135, 0, 0)
        self.window.keypad(True)
        self.window.timeout(16)
        self.window.box()

    def cleanup_curses(self):
        try:
            if hasattr(self, 'window') and self.window:
                self.window.keypad(False)
                self.window = None
    
            if curses.isendwin() == False:
                curses.echo()
                curses.nocbreak()
                curses.endwin()
            
        except Exception as e:
            pass
            # self.logger.error(f"Error during curses cleanup: {e}")
        finally:
            if hasattr(self, 'stdscr'):
                self.stdscr = None

    async def get_service_token(self):
        try:
            response = requests.get(
                f"https://{self.server_address}/auth/getguesttoken/",
                verify=False,
                timeout=2
            )
            
            if response.status_code == 200:
                self.service_token = response.json().get('access_token')
                self.clear_token = self.service_token
                return True
            else:
                logging.error(f"Error getting service token: {response.status_code}")
            return False
        except Exception as e:
            logging.error(f"Error getting service token: {e}")
            return False
        
    async def display_message(self, message: str, delay: int = 2):
        self.window.clear()
        self.window.box()
        self.window.addstr(2, 2, message)
        self.window.refresh()
        await asyncio.sleep(delay)

    
    async def join_pvp_game(self, difficulty: str) -> Optional[str]:
        join_url = f"https://{self.server_address}/game/join/?mode=PVP&option={difficulty}"
        
        try:
            response = requests.get(
                join_url,
                verify=False,
                timeout=2,
                headers={"Authorization": f"{self.service_token}"}
            )
            
            if response.status_code == 200:
                return response.json()["uid"]
            if response.status_code == 404:
                return "error"
            return None
                
        except Exception as e:
            return None
    
    async def create_game(self, game_type: str, difficulty: str) -> Optional[str]:
        create_url = f"https://{self.server_address}/game/create/?mode={game_type}&option={difficulty}"
        
        try:
            response = requests.get(
                create_url,
                verify=False,
                timeout=2,
                headers={"Authorization": f"{self.service_token}"}
            )
            
            if response.status_code == 200:
                return response.json()["uid"]
            return None
                
        except Exception as e:
            return None
    
    async def send_game_request(self, game_type: str, difficulty: str) -> Optional[str]:
        if game_type == "PVP":
            # D'abord essayer de rejoindre une partie
            game_uid = await self.join_pvp_game(difficulty)
            if game_uid:
                return game_uid
            # Si pas de partie trouvée, en créer une nouvelle
            return await self.create_game("PVP", difficulty)
        else:  # PVE
            return await self.create_game("PVE", difficulty)
    
    async def select_server(self):
        self.window.clear()
        self.window.box()
        
        # Afficher l'ASCII art en haut
        start_y = 2
        for i, line in enumerate(self.ascii_title):
            start_x = (self.window.getmaxyx()[1] - len(line)) // 2
            self.window.addstr(start_y + i, start_x, line)
    
        # Menu options après l'ASCII art
        menu_start_y = start_y + len(self.ascii_title) + 2
        
        self.window.addstr(menu_start_y, 2, "Select server address:")
        self.window.addstr(menu_start_y + 2, 2, "1. localhost")
        self.window.addstr(menu_start_y + 3, 2, "2. Enter custom address")
        self.window.addstr(menu_start_y + 5, 2, "Your choice (1-2): ")
        self.window.refresh()
        
        while True:
            try:
                key = self.window.getch()
                if key == ord('1'):
                    return "localhost:7777"
                elif key == ord('2'):
                    self.window.clear()
                    self.window.box()
                    
                    for i, line in enumerate(self.ascii_title):
                        start_x = (self.window.getmaxyx()[1] - len(line)) // 2
                        self.window.addstr(start_y + i, start_x, line)
                        
                    self.window.addstr(menu_start_y, 2, "Enter server address (e.g., 10.11.12.13):")
                    self.window.addstr(menu_start_y + 1, 2, "Press Enter to confirm")
                    self.window.move(menu_start_y + 2, 2)
                    self.window.refresh()
                    
                    curses.echo()
                    address = ''
                    while True:
                        char = self.window.getch()
                        if char == ord('\n'):
                            break
                        if char == 27:
                            return await self.select_server()
                        
                        if char in range(32, 127):
                            address += chr(char)
                            self.window.addch(menu_start_y + 2, 2 + len(address) - 1, char)
                        elif char == 127 or char == curses.KEY_BACKSPACE:
                            if address:
                                address = address[:-1]
                                self.window.addstr(menu_start_y + 2, 2 + len(address), ' ')
                                self.window.move(menu_start_y + 2, 2 + len(address))
                        
                        self.window.refresh()
                    
                    curses.noecho()
                    
                    if address.strip():
                        return address.strip() + ":7777"
                    return await self.select_server()
                    
            except Exception as e:
                self.window.addstr(menu_start_y + 7, 2, f"Error: {str(e)}")
                self.window.refresh()
                await asyncio.sleep(1)
            
            await asyncio.sleep(0.1)

    async def handle_input(self, websocket):
        await asyncio.sleep(2)
        # await websocket.send(json.dumps({"type": "start", "sender": "cli"}))
        
        last_direction = 0
        keys_pressed = set()
        
        up_key = ord('w') if self.game.side == '1' else curses.KEY_UP
        down_key = ord('s') if self.game.side == '1' else curses.KEY_DOWN
        
        while self.running:
            try:
                key = self.window.getch()
    
                if key == 27:  # ESC
                    while self.window.getch() != -1:
                        pass
                    continue
    
                if key == up_key:
                    keys_pressed.add('up')
                elif key == down_key:
                    keys_pressed.add('down')
                elif key == -1:
                    pass
    
                current_direction = 0
                if 'up' in keys_pressed:
                    current_direction = 1
                elif 'down' in keys_pressed:
                    current_direction = -1
    
                if key == -1:
                    if current_direction != 0:
                        if up_key not in [self.window.getch() for _ in range(2)]:
                            keys_pressed.discard('up')
                        if down_key not in [self.window.getch() for _ in range(2)]:
                            keys_pressed.discard('down')
    
                        current_direction = 0
                        if 'up' in keys_pressed:
                            current_direction = 1
                        elif 'down' in keys_pressed:
                            current_direction = -1
    
                if current_direction != last_direction:
                    message = {
                        "type": "keyDown",
                        'player': f'p{self.game.side}',
                        'value': [current_direction, 0] if self.game.side == '1' else [0, current_direction],
                        "sender": "cli"
                    }
                    last_direction = current_direction
                    
                    if self.game_state == GameState.IN_GAME.value:
                        await websocket.send(json.dumps(message))
                        # self.logger.debug(f"Player {self.game.side} sent direction: {current_direction}")
    
            except Exception as e:
                self.window.clear()
                self.window.box()
                self.window.addstr(2, 2, "An error occured handle input, returning to menu...")
                self.window.refresh()
                await asyncio.sleep(2)
                
                
            await asyncio.sleep(0.01)
            
    async def render_disconnect_message(self, window):
        self.logger.debug("Opponent disconnected!")
        window.clear()
        window.box()
        message = "Opponent disconnected!"
        return_msg = "Returning to menu..."
        window.addstr(45//2, (135-len(message))//2, message)
        window.addstr(45//2 + 2, (135-len(return_msg))//2, return_msg)
        window.refresh()
        await asyncio.sleep(2)
            
    async def handle_game_data(self, websocket):
        
        async def resume_after_delay(delay, data):
            await asyncio.sleep(delay)
            
            if data.get('type') == 'greetings':
                self.game_state = GameState.IN_GAME.value
            elif data.get('goal'):
                await websocket.send(json.dumps({
                    "type": "resumeOnGoal",
                    "sender": "cli"
                }))
                self.goal_event.clear()
    
        while self.running:
            try:
                # Recevoir et parser les données
                message = await websocket.recv()
                data = json.loads(message)
                
                if data.get('type') == 'opponent_connected' and data.get('opponent_connected'):
                    self.game.render_curses(self.window, self.game_state)
                    await asyncio.sleep(0.1)
                    self.game.render_start_message(self.window)
                    await asyncio.sleep(2)
                    self.game.render_curses(self.window, self.game_state)
                    self.game_state = GameState.IN_GAME.value
                    await websocket.send(json.dumps({
                        "type": "start",
                        "sender": "cli"
                    }))
                    continue
    
                self.game.update_from_JSON(data)
            
                if data.get('type') == 'timeout':
                    await self.display_message("No opponent found. Returning to menu...", 2)
                    self.running = False
                    return
                
                elif data.get('type') == 'greetings':
                    self.game.render_curses(self.window, self.game_state)
                    await asyncio.sleep(0.1)
                    self.game.render_start_message(self.window)
                    await asyncio.sleep(2)
                    self.game.render_curses(self.window, self.game_state)
                    self.game_state = GameState.IN_GAME.value
                    await websocket.send(json.dumps({
                        "type": "start",
                        "sender": "cli"
                    }))
                    
                if data.get('type') == 'gameover':
                    self.logger.info(f"Gameover received from {data.get('sender')}")
                    self.running = False
                    
                    if data.get('sender') == 'game':
                        await self.render_disconnect_message(self.window)
                        self.running = False
                    
                    try:
                        await websocket.close()
                    except:
                        self.logger.error("Error closing websocket", exc_info=True)
                    
                    self.game.reset_game_objects()
                    return
                
                elif data.get('gameover'):
                    self.game.render_game_over(self.window, data.get('winner'))
                    
                    await asyncio.sleep(4)
                    self.running = False
                    await websocket.close()  # Fermer explicitement le websocket
                    self.game.reset_game_objects()
                    return
                    
                    
                elif data.get('goal') != "None" and data.get('goal') is not None and not self.goal_event.is_set():
                    self.goal_event.set()
                    self.game.render_goal_message(self.window, data.get('goal'))
                    asyncio.create_task(resume_after_delay(1, data))
                    
                elif not self.goal_event.is_set():
                    self.game.render_curses(self.window, self.game_state)
    
            except websockets.exceptions.ConnectionClosed:
                # self.logger.debug(f"Error in handle_game_data, connection closed: {str(e)}")
                self.window.clear()
                self.window.box()
                self.window.addstr(2, 2, "Connection lost handle game data, returning to menu...")
                self.window.refresh()
                
                await asyncio.sleep(2)
                
                self.running = False
                self.game.reset_game_objects()
                
                return

            except Exception as e:
                # self.logger.debug(f"Error in handle_game_data: {str(e)}")  # Garder le print pour le débogage
                
                self.window.clear()
                self.window.box()
                self.window.addstr(2, 2, "An error occurred handle game data, returning to menu...")
                self.window.refresh()
                
                await asyncio.sleep(2)
                
                self.running = False
                self.game.reset_game_objects()
                
                return
    
        self.running = False
        try:
            await websocket.close()
        except:
            pass

    async def connect_to_game(self, game_uid: str, message: str):
        uri = f"wss://{self.server_address}/ws/pong/{game_uid}/"
        
        try:
            async with websockets.connect(
                uri, 
                ssl=self.ssl_context,
                subprotocols=[f'token_{self.clear_token}']
            ) as websocket:
                await self.display_message(message, delay=0)
                
                await websocket.send(json.dumps({
                    "type": "greetings",
                    "sender": "cli"
                }))
                
                input_task = asyncio.create_task(self.handle_input(websocket))
                game_task = asyncio.create_task(self.handle_game_data(websocket))
                
                try:
                    done, pending = await asyncio.wait(
                        [input_task, game_task],
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    
                    for task in pending:
                        self.logger.debug(f"Cancelling pending task")
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            self.logger.debug("Task cancelled successfully")
                    
                except Exception as e:
                    self.logger.error(f"Error in game tasks: {str(e)}", exc_info=True)
                    
        finally:
            # self.logger.info("Exiting connect_to_game")
            if not self.signal_received:
                self.game.reset_game_objects()
                

    async def show_menu(self):
        self.window.clear()
        self.window.box()
        
        start_y = 2
        for i, line in enumerate(self.ascii_title):
            start_x = (self.window.getmaxyx()[1] - len(line)) // 2
            self.window.addstr(start_y + i, start_x, line)

        menu_start_y = start_y + len(self.ascii_title) + 2
        
        self.window.addstr(menu_start_y, 2, "1. Play vs AI (PVE)")
        self.window.addstr(menu_start_y + 1, 2, "2. Play vs Player online (PVP)")
        self.window.addstr(menu_start_y + 2, 2, "3. Exit")
        self.window.addstr(menu_start_y + 4, 2, "Your choice (1-3): ")
        self.window.refresh()

    async def get_ai_difficulty(self):
        self.window.clear()
        self.window.box()
        self.window.addstr(2, 2, "Select AI difficulty:")
        self.window.addstr(4, 2, "1. Easy")
        self.window.addstr(5, 2, "2. Medium")
        self.window.addstr(6, 2, "3. Hard")
        self.window.addstr(8, 2, "Choice (1-3): ")
        self.window.refresh()
        
        while True:
            try:
                key = self.window.getch()
                if key in [ord('1'), ord('2'), ord('3')]:
                    return chr(key)
            except: pass
            await asyncio.sleep(0.1)

    async def main_menu(self):
        self.game = CLIGame()
        
        while True:
            await self.show_menu()
            
            try:
                key = self.window.getch()
                
                if key not in [ord('1'), ord('2'), ord('3')]:
                    continue
                
                if key == ord('1'):
                    self.game_state = GameState.WAITING_FOR_AI.value
                    difficulty = await self.get_ai_difficulty()
                    
                    await self.display_message("Creating game against AI...")
                    if game_uid := await self.send_game_request("PVE", difficulty):
                        self.running = True
                        await self.connect_to_game(game_uid, f"Starting game against AI (Difficulty: {difficulty})...")
                    else:
                        self.window.clear()
                        self.window.box()
                        self.window.addstr(2, 2, "Failed to create game against AI. Please try again.")
                        self.window.refresh()
                        await asyncio.sleep(2)
                        continue
                
                elif key == ord('2'):
                    self.game_state = GameState.WAITING_FOR_OPPONENT.value
                    
                    self.window.clear()
                    self.window.box()
                    self.window.addstr(2, 2, "Searching for available games...")
                    self.window.refresh()
                    
                    if game_uid := await self.join_pvp_game("1"):
                        if game_uid != "error":
                            self.running = True
                            await self.connect_to_game(game_uid, "Waiting for opponent...")
                        else:
                            self.window.clear()
                            self.window.box()
                            self.window.addstr(2, 2, "No games found. Creating a new game...")
                            self.window.refresh()
                            await asyncio.sleep(2)
                            
                            if game_uid := await self.create_game("PVP", "1"):
                                self.running = True
                                await self.connect_to_game(game_uid, "Waiting for opponent...")
                    else:
                        #fetch a echoue, server down
                        self.window.clear()
                        self.window.box()
                        self.window.addstr(2, 2, "Failed to connect to server. Please check the address and try again.")
                        self.window.refresh()
                        await asyncio.sleep(2)
                
                elif key == ord('3') or key == 27:
                    break
                
            except Exception as e:
                self.window.addstr(10, 2, f"Error: {str(e)}")
                self.window.refresh()
                await asyncio.sleep(2)

    async def run(self):
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        try:
            self.init_curses()
            
            self.server_address = await self.select_server()

            self.logger.info(f"Selected server: {self.server_address}")
            
            if not await self.get_service_token():
                self.window.clear()
                self.window.box()
                self.window.addstr(2, 2, "Failed to connect to server. Please check the address and try again.")
                self.window.refresh()
                await asyncio.sleep(2)
                return
            
            await self.main_menu()
            
        except EOFError:
            print("\nEOF received, exiting...")
        except KeyboardInterrupt:
            print("\nKeyboard interrupt received, exiting...")
        except Exception as e:
             await asyncio.sleep(2)
        finally:
            if not self.signal_received:
                self.cleanup_curses()
            if self.game is not None:
                self.game.reset_game_objects()