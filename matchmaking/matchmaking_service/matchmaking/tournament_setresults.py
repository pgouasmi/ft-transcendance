import json
import logging
from django.http import JsonResponse
from .Tournament import get_tournament
from rest_framework.decorators import api_view
from django.views.decorators.csrf import csrf_exempt

@api_view(['POST'])
@csrf_exempt
def tournament_setresults(request):
    try:
        if not request.body:
            logging.error('Empty request')
            return JsonResponse({'error': 'Empty request body'}, status=400)

        try:
            data = json.loads(request.body.decode('utf-8'))
        except json.JSONDecodeError as e:
            logging.error(f"JSON decode error: {e}")
            return JsonResponse({'error': 'Invalid JSON format'}, status=400)

        tournament_id = data.get('tournament_id')
        winner = data.get('winner')

        if not winner or not tournament_id:
            logging.error('Winner field and tournament_id field are required')
            return JsonResponse({'error': 'Winner field and tournament_id field are required'}, status=400)

        tournament = get_tournament(tournament_id)
        if not tournament:
            logging.error('Tournament not found, invalid uid')
            return JsonResponse({'error': 'Tournament not found, invalid uid'}, status=404)

        tournament.set_results(winner)
        logging.error('Results set successfully')
        return JsonResponse({'tournament': tournament.to_dict()})


    except Exception as e:
        logging.error(f"An error occurred: {str(e)}")
        logging.error('An error occurred')
        return JsonResponse({'error': f'An error occurred: {str(e)}'}, status=500)