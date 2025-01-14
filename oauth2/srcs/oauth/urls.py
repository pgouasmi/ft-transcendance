from django.urls import path
from .get_token_views import get_guest_token
from .auth_views import oauth_login, verify_2fa, authfortytwo
from .user_data_views import get_user_counters, increment_user_counters, reset


urlpatterns = [
    path('oauth/', oauth_login, name='oauth'),
    path('authfortytwo/', authfortytwo, name='authfortytwo'),

    path('2fa/', verify_2fa, name='2fa'),
    path('getguesttoken/', get_guest_token, name='getguesttoken'),

    path('getusercounters/', get_user_counters, name='getusercounters'),
    path('incrementusercounters/', increment_user_counters, name='incrementusercounters'),
    path('reset/', reset, name='reset')
]
