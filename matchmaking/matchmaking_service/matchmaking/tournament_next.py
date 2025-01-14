import logging
from .Tournament import get_tournament
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view

@api_view(['GET'])
@csrf_exempt
def tournament_next(request, uid):
    try:
        tournament = get_tournament(uid)
        if not tournament:
            return JsonResponse({'error': 'Tournament not found, invalid uid'}, status=404)

        next_match = tournament.get_next_match()

        if len(next_match) == 1:
            return JsonResponse({'status': 'finished', 'winner': next_match[0]})
        else :
            return JsonResponse({'next_match': next_match})

    except Exception as e:
        logging.error(f"An error occurred: {str(e)}")
        return JsonResponse({'error': f'An error occurred: {str(e)}'}, status=500)