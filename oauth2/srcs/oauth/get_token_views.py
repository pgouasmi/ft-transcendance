import os
import jwt
import pytz
import random
import logging

from dotenv import load_dotenv
from django.http import JsonResponse
from datetime import datetime, timedelta
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET


load_dotenv()
logger = logging.getLogger(__name__)

@require_GET
@csrf_exempt
def get_guest_token(request):
    
    if not hasattr(get_guest_token, '_counter'):
        get_guest_token._counter = 0
    
    # Incrémenter le compteur
    get_guest_token._counter += 1
    
    # logging.info("get_guest_token")
    now = datetime.now(pytz.utc)
    expiration_time = now + timedelta(days=1)
    randomize_jwt_signature = random.getrandbits(256)
    payload = {
        'username': f'guest{get_guest_token._counter}',
        'email': randomize_jwt_signature,
        'image_link': None,
        'exp': int(expiration_time.timestamp())
    }
    encoded_jwt = jwt.encode(payload, os.getenv('JWT_SECRET_KEY'), algorithm='HS256')
    
    logging.info(f"Generated username for guest: {payload['username']}")
    
    return JsonResponse({'access_token': encoded_jwt}, status=200)