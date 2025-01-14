from django.http import JsonResponse
import logging

# from .tournament import tournament_maker
from matchmaking.game_session import game_session
from rest_framework.decorators import api_view
from .Request_Authenticator import Request_Authenticator
import os

import json
import random
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import asyncio
import websockets
from matchmaking.game_session import game_session
from rest_framework.decorators import api_view
from .Tournament import get_tournament

# views.py
@api_view(['GET'])
def create_game(request):
    """View pour créer une partie"""
    #logging.info(f"create_game, request: {request}")
    try:
        parsing_result = Request_Authenticator.parse_create_game_request(request)
        #logging.info(f"parsing result: {parsing_result}")
        if parsing_result is not None:
            return JsonResponse(parsing_result, status=parsing_result["status"])
        authenticate_result = Request_Authenticator.authenticate_create_game_request(request)
        # logging.info(f"authenticate result: {authenticate_result}")
        if authenticate_result is not None:
            return JsonResponse(authenticate_result, status=authenticate_result["status"])

        mode = request.GET.get('mode')
        # logging.info(f"Mode: {mode}")
        option = request.GET.get('option')
        # logging.info(f"Option: {option}")

        jwt = request.headers.get('Authorization')

        #############################################################

        uid = game_session.create_game(mode, option, jwt)
        return JsonResponse({'uid': uid}, status=200)
    # except InvalidTokenError as e:
    #     return JsonResponse({'error': str(e)}, status=401)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@api_view(['GET'])
def join_game(request):
    """View pour rejoindre une partie existante"""
    try:
        parse_result = Request_Authenticator.parse_join_game_request(request)
        # logging.info(f"join_game, parse_result: {parse_result}")
        if parse_result is not None:
            return JsonResponse(parse_result, status=parse_result["status"])
        authenticate_result = Request_Authenticator.authenticate_join_game_request(request)
        # logging.info(f"join_game, authenticate_result: {authenticate_result}")
        if authenticate_result is not None:
            return JsonResponse(authenticate_result, status=authenticate_result["status"])

        mode = request.GET.get('mode')
        option = request.GET.get('option')

        uid = game_session.find_available_game(mode, option)
        if uid == 'error':
            return JsonResponse({'uid': 'error'}, status=404)
        return JsonResponse({'uid': uid}, status=200)

    except Exception as e:
        logging.error(f"Error in join_game: {e}")
        return JsonResponse({'error': str(e)}, status=500)


@api_view(['DELETE'])
def cleanup_game(request, uid):
    """View pour nettoyer une partie terminée"""
    # logging.info(f"cleanup_game, uid: {uid}, request: {request}")
    try:
        parse_result = Request_Authenticator.parse_cleanup_request(request)
        if parse_result is not None:
            return JsonResponse(parse_result, status=parse_result["status"])
        authenticate_result = Request_Authenticator.authenticate_cleanup_request(request)
        if authenticate_result is not None:
            return JsonResponse(authenticate_result, status=authenticate_result["status"])
        success = game_session.remove_game(uid)
        if success:
            return JsonResponse({'status': 'success'}, status=200)
        return JsonResponse({'status': 'game not found'}, status=404)
        # else:
        #     return JsonResponse({'error': 'Invalid request'}, status=400)
    except Exception as e:
        logging.error(f"Error in cleanup_game: {e}")
        return JsonResponse({'error': str(e)}, status=500)

@api_view(['GET'])
def does_game_exist(request, uid):
    """View pour vérifier si une partie existe"""
    # logging.info(f"in does game exist, uid: {uid}, request: {request}")
    try:

        parse_result = Request_Authenticator.parse_existence_request(request)
        if parse_result is not None:
            # logging.info(f"parse result: {parse_result}")
            return JsonResponse(parse_result, status=parse_result["status"])

        authenticate_result = Request_Authenticator.authenticate_existence_request(request)
        if authenticate_result is not None:
            # logging.info(f"authenticate result: {authenticate_result}")
            return JsonResponse(authenticate_result, status=authenticate_result["status"])

        if Request_Authenticator.authenticate_game_server(request) is False:
            return JsonResponse({'error': 'Invalid request'}, status=400)
        # logging.info("got un does game exist")
        token = request.headers.get('Authorization')
        client_token = request.headers.get('Client_token')
        # Request_Authenticator.verify_jwt(token)
        exists = game_session.game_exists(uid, client_token)
        # logging.info(f"in does game exist: {exists}")
        if exists is None:
            return JsonResponse({'exists': exists}, status=404)
        return JsonResponse({'exists': exists}, status=200)
    except Exception as e:
        logging.error(f"Error in does_game_exist: {e}")
        return JsonResponse({'error': str(e)}, status=500)

@api_view(['GET'])
def tournament_check(request, uid):
    """View pour vérifier si un tournoi existe"""
    # logging.info(f"in tournament check, uid: {uid}, request: {request}")
    try:
        result = get_tournament(uid)
        if result:
            return JsonResponse(result.to_dict())
        return JsonResponse({'status': 'inactive'})
    except Exception as e:
        logging.error(f"Error in tournament_check: {e}")
        return JsonResponse({'error': str(e)}, status=500)
    
