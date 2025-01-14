import logging
from enum import Enum
import curses


logging.basicConfig(
    filename='debug.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filemode='w'
)


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


class CLIGame:
    def __init__(self):
        self.logger = logging.getLogger('CLIGame')
        self.logger.setLevel(logging.INFO)
        
        
        self.height = 45
        self.width = 135
        self.paddle_size = 6
        self.paddle1_pos = self.height // 2 - 2
        self.paddle2_pos = self.height // 2 - 2
        self.paddle1_score = 0
        self.paddle2_score = 0
        self.ball_x = self.width // 2
        self.ball_y = self.height // 2
        self.side = None
        
        
    def reset_game_objects(self):
        self.paddle1_pos = self.height // 2 - 3
        self.paddle2_pos = self.height // 2 - 3
        self.paddle1_score = 0
        self.paddle2_score = 0
        self.ball_x = self.width // 2
        self.ball_y = self.height // 2
        
    def render_start_message(self, window):
        try:
            window.addstr(self.height//2, self.width//4, "YOU    ")
            window.addstr(self.height//2, 3*(self.width//4), "OPPONENT")
            if self.side != "1":
                # Si on est le joueur 2, on échange les positions
                window.addstr(self.height//2, self.width//4, "OPPONENT")
                window.addstr(self.height//2, 3*(self.width//4), "YOU    ")
            window.refresh()
        except curses.error:
            self.logger.error("Error displaying start message")
        
    def render_game_over(self, window, winner):
       window.clear()
       window.box()
       
       self.logger.info(f"winner: {winner}, self.side: {self.side}")
       message = "You win!" if winner == self.side else "Opponent wins!"
       window.addstr(self.height//2, (self.width-len(message))//2, message)
       return_msg = "Returning to menu..."
       window.addstr(self.height//2 + 2, (self.width-len(return_msg))//2, return_msg)
       window.refresh()

    def render_goal_message(self, window, side):
        self.logger.info(f"Current side: {self.side}, Scoring side: {side}")
        message = "You scored!" if self.side == side else "Opponent scored!"
        window.addstr(self.height//2, (self.width-len(message))//2, message)
        window.refresh()
        
    def update_from_JSON(self, data):
        
        if data.get('type') == 'greetings':
            raw_side = data.get('side')
            # self.logger.info(f"Greetings raw data: {data}")
            # self.logger.info(f"Raw side received: {raw_side}")
    
            self.side = '1' if raw_side == 'p1' else '2'
            # self.logger.info(f"Greetings received, side set to: {self.side}")
            return
    
        try:
            # logging.debug(f"Received data: {data}")
    
            ball_data = data.get('ball', {})
            if ball_data:
                ball_x = ball_data.get('x', 0.5)
                self.ball_x = int(ball_x * (self.width - 4))
    
                ball_y = ball_data.get('y', 0.5)
                self.ball_y = int(ball_y * (self.height - 2)) + 1
    
                # logging.debug(f"Ball pos - Percentage: ({ball_x}, {ball_y}) CLI: ({self.ball_x}, {self.ball_y})")
    
            paddle1_data = data.get('paddle1', {})
            if paddle1_data:
                paddle_y = paddle1_data.get('y', 0.5)
                usable_height = self.height - self.paddle_size
                self.paddle1_pos = int(paddle_y * usable_height)
                self.paddle1_score = paddle1_data.get('score', 0)
    
                # logging.debug(f"Paddle1 - Percentage: {paddle_y} CLI: {self.paddle1_pos}")
    
            paddle2_data = data.get('paddle2', {})
            if paddle2_data:
                paddle_y = paddle2_data.get('y', 0.5)
                usable_height = self.height - self.paddle_size + 1
                self.paddle2_pos = int(paddle_y * usable_height)# + 1
                self.paddle2_score = paddle2_data.get('score', 0)
    
                # logging.debug(f"Paddle2 - Percentage: {paddle_y} CLI: {self.paddle2_pos}")
    
        except Exception as e:
            logging.error(f"Error updating from JSON: {e}")

    def render_curses(self, window, game_state=None):
        try:
            window.clear()
            window.box()

            score_text = f"Score: {self.paddle1_score} - {self.paddle2_score}"
            window.addstr(0, (self.width-len(score_text))//2, score_text)

            for y in range(1, self.height-1):
                if y % 2 == 0:
                    window.addch(y, self.width//2, '║')

            for i in range(self.paddle_size):
                try:
                    if 0 <= self.paddle1_pos + i < self.height:
                        window.addch(self.paddle1_pos + i, 1, '█')
                    if 0 <= self.paddle2_pos + i < self.height:
                        window.addch(self.paddle2_pos + i, self.width-2, '█')
                except curses.error:
                    pass

            try:
                if 0 <= self.ball_y < self.height and 0 <= self.ball_x < self.width:
                    window.addch(self.ball_y, self.ball_x, '●')
            except curses.error:
                pass

            window.refresh()

        except Exception as e:
            logging.error(f"Error in render: {e}")
