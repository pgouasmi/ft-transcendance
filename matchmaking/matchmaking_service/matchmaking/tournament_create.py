import json
import logging
from .Tournament import Tournament, tournaments_list
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view

@api_view(['POST'])
@csrf_exempt
def tournament_new(request):
    try:
        if not request.body:
            return JsonResponse({'error': 'Empty request body'}, status=400)
        
        try:
            data = json.loads(request.body.decode('utf-8'))
        except json.JSONDecodeError as e:
            logging.error(f"JSON decode error: {e}")
            return JsonResponse({'error': 'Invalid JSON format'}, status=400)

        players_data = data.get('players', [])

        if not players_data or len(players_data) < 2:
            return JsonResponse({'error': 'At least 2 players are required'}, status=400)

        try:
            tournament = Tournament(players_data)
            return JsonResponse({'tournament_uid': tournament.uid})
        except Exception as e:
            logging.error(f"An error occurred while initializing tournament: {str(e)}")
            return JsonResponse({'error': str(e)}, status=200)

    except Exception as e:
        logging.error(f"An error occurred: {str(e)}")
        return JsonResponse({'error': f'An error occurred: {str(e)}'}, status=500)