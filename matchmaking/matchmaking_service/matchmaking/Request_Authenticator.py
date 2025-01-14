import os

from jwt import decode, InvalidTokenError, ExpiredSignatureError
import logging
import os
import base64
import json
from urllib.parse import urlparse, parse_qs

answers = {
    "invalid": {"error": "Invalid request", "status": 400},
    "unauthorized": {"error": "Authentication required", "status": 401},
    "forbidden": {"error": "Access denied", "status": 403},
    "not_found": {"error": "Game not found", "status": 404},
    "internal_error": {"error": "Internal server error", "status": 500}
}

class Request_Authenticator:

    def authenticate_create_game_request(request):
        authenticate_web_result = Request_Authenticator.authenticate_web(request)
        if authenticate_web_result is not None:
            return authenticate_web_result
        return None

    def parse_create_game_request(request):
        # logging.info(f"parse_create_game_request, request: {request}")
        mode = request.GET.get('mode')
        option = request.GET.get('option')
        if mode is None or option is None:
            return answers["invalid"]
        if mode not in ['PVE', 'PVP', 'AI']:
            return answers["invalid"]
        if mode == 'PVP' and option not in ['1', '2']:
            return answers["invalid"]
        elif mode == 'PVE':
            if option not in ['1', '2', '3', '11', '21', '31']:
                return answers["invalid"]
        return None


    def parse_join_game_request(request):
        # logging.info(f"parse_join_game_request, request: {request}")
        mode = request.GET.get('mode')
        option = request.GET.get('option')

        # logging.info(f"mode: {mode}, option: {option}")
        
        if mode not in ['PVE', 'PVP', 'AI']:
            return answers["invalid"]

        if mode == 'AI':
            if option is not None:
                return answers["invalid"]
            else:
                return None

        if mode is None or option is None:
            return answers["invalid"]
        if mode == 'AI' and option is not None:
            return answers["invalid"]
        if mode == 'PVP' and option not in ['1', '2']:
            return answers["invalid"]
        elif mode == 'PVE':
            if option not in ['1', '2', '3']:
                return answers["invalid"]
        return None


    def authenticate_join_game_request(request):
        mode = request.GET.get('mode')
        authenticate_ai_result = Request_Authenticator.authenticate_ai(request)
        # logging.info("authenticate AI result: " + str(authenticate_ai_result))
        if mode == 'AI':
            if authenticate_ai_result is not None:
                # logging.info("authenticate AI failed, authenticate AI result: " + str(authenticate_ai_result))
                return authenticate_ai_result
            else:
                return None
        else:
            authenticate_web_result = Request_Authenticator.authenticate_web(request)
            if authenticate_web_result is not None:
                return authenticate_web_result
        return None

    def parse_cleanup_request(request):
        # logging.info(f"parse_cleanup_request, request: {request}\n\n")
        url_path = request.path
        game_uid = url_path.split('/')[-2]
        if game_uid is None:
            return answers["invalid"]
        return None

    def authenticate_cleanup_request(request):
        authenticate_game_server = Request_Authenticator.authenticate_game_server(request)
        if authenticate_game_server is not None:
            return authenticate_game_server
        return None


    def parse_existence_request(request):
        # logging.info(f"parse_existence_request, request: {request}\n\n")
        url_path = request.path
        game_uid = url_path.split('/')[-2]
        # logging.info(f"game_uid: {game_uid}\n\n")
        if game_uid is None:
            return answers["invalid"]
        return None


    def authenticate_existence_request(request):
        authenticate_game_server = Request_Authenticator.authenticate_game_server(request)
        if authenticate_game_server is not None:
            return authenticate_game_server
        return None

    def authenticate_game_server(request):
        """Vérifie si le token est celui d'un utilisateur de type GAME_SERVER"""
        game_server_token = os.getenv('GAME_SERVICE_TOKEN')
        received_token = request.headers.get('Authorization')
        if received_token is None:
            return answers["unauthorized"]
        if request.headers.get('Authorization') == game_server_token:
            # logging.info("Token de service GAME_SERVER validé")
            return None
        return answers["forbidden"]


    def authenticate_ai(request):
        """Vérifie si le token est celui d'un utilisateur de type AI"""
        # logging.info(f"in is sender ai, headers: {request.headers}")
        ai_token = os.getenv('AI_SERVICE_TOKEN')
        received_token = request.headers.get('Authorization')
        if received_token is None:
            return answers["unauthorized"]
        # logging.info(f"received token: {received_token}, ai token: {ai_token}")
        if request.headers.get('Authorization') == ai_token:
            # logging.info("Token de service IA validé")
            return None
        return answers["forbidden"]

    def authenticate_web(request):
        """Vérifie si le token est celui d'un utilisateur de type WEB"""
        # logging.info(f"autheticate_web, request.headers: {request.headers}")
        received_token = request.headers.get('Authorization')

        if received_token is None:
            return answers["unauthorized"]

        try:
            if Request_Authenticator.verify_jwt(received_token) is False:
                # logging.info("JWT validé")
                return answers["forbidden"]
            # else:
                # logging.info("Token de service WEB validé")
        except Exception as e:
            return answers["forbidden"]

        # logging.info("Token de service WEB validé")
        return None


    def decode_jwt_unsafe(token):
        """Décode le JWT en base64 sans vérification de signature"""
        try:
            # Séparer le token
            header_b64, payload_b64, _ = token.split('.')

            # Décoder le payload
            padding = '=' * (-len(payload_b64) % 4)  # Ajouter le padding si nécessaire
            payload_b64_padded = payload_b64 + padding
            payload_json = base64.urlsafe_b64decode(payload_b64_padded)
            return json.loads(payload_json)
        except Exception as e:
            logging.error(f"Erreur décodage base64: {str(e)}")
            return None


    def verify_jwt(token):
        """
        Vérifie et décode le token d'autorisation.
        Supporte les tokens de service (format: "Bearer <token>")
        et les JWT (format: "jwt_token=<token>")
        """
        # logging.info(f"verify_jwt, token: {token}")
        try:
            if len(token.split(' ')) == 2:
                token = token.split(' ')[1]
            if not token:
                # logging.error("Pas de token d'autorisation")
                # raise Exception("Token check failed")
                return False

            # Extraire le token JWT a partir du premier = (pour les cookies)
            jwt_token = token.split('=')[-1]

            # 1. Décodage non sécurisé (base64)
            unsafe_payload = Request_Authenticator.decode_jwt_unsafe(jwt_token)
            if not unsafe_payload:
                # logging.error("Échec du décodage base64")
                # raise Exception("Token check failed")
                return False
            # logging.info(f"Payload décodé (non sécurisé): {unsafe_payload}")

            # 2. Décodage sécurisé avec vérification
            secret_key = os.getenv('JWT_SECRET_KEY')
            if not secret_key:
                # logging.error("JWT_SECRET_KEY non définie")
                # raise Exception("Token check failed")
                return False
            secure_payload = decode(
                jwt_token,
                secret_key,
                algorithms=['HS256']
            )
            # logging.info(f"Payload décodé (sécurisé): {secure_payload}")

            # 3. Vérifier que les deux payloads correspondent
            if unsafe_payload != secure_payload:
                # logging.error("Les payloads ne correspondent pas !")
                # raise Exception("Token check failed")
                return False
            # logging.info(f"JWT validé pour: {secure_payload.get('username')}")
            # return secure_payload
            return True

        except InvalidTokenError as e:
            logging.error(f"Token JWT invalide: {str(e)}")
            # raise Exception("Token check failed")
            return False
        except Exception as e:
            logging.error(f"Erreur de vérification: {str(e)}")
            # raise Exception("Token check failed")
            return False

