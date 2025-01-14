import json
import logging
from .Tournament import get_tournament, delete_tournament
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view

@api_view(['POST'])
@csrf_exempt
def tournament_del(request, uid):
    try:
        res = delete_tournament(uid)
        
        if not res:
            return JsonResponse({'error': 'Tournament not found, invalid uid'}, status=404)

        return JsonResponse({'status': 'success'}, status=200)

    except Exception as e:
        logging.error(f"An error occurred: {str(e)}")
        return JsonResponse({'error': f'An error occurred: {str(e)}'}, status=500)