"""
URL configuration for matchmaking_service project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, re_path
from matchmaking import views
from matchmaking import tournament_create, tournament_next, tournament_setresults, tournament_del

urlpatterns = [
    # path('admin/', admin.site.urls),
    path('game/create/', views.create_game, name='create_game'),  # Créer une nouvelle partie
    path('game/join/', views.join_game, name='join_game'),      # Rejoindre une partie existante
    path('game/tournament/new/', tournament_create.tournament_new, name='tournament_new'),  # Créer un nouveau tournoi
    path('game/tournament/setresults/', tournament_setresults.tournament_setresults, name='tournament_setresults'),  # Définir les résultats d'un match
    re_path(r'game/tournament/check/([a-zA-Z0-9-]+)/$',
            views.tournament_check,
            name='tournament_check'),  # Vérifier si l'uid du tournoi existe
    re_path(r'game/tournament/next/([a-zA-Z0-9-]+)/$',
            tournament_next.tournament_next,
            name='tournament_next'),  # Passer au tour suivant
    re_path(r'game/tournament/del/([a-zA-Z0-9-]+)/$',
            tournament_del.tournament_del,
            name='tournament_del'),  # supprimer un tournoi
    re_path(r'^game/cleanup/([a-zA-Z0-9-]+)/$',
            views.cleanup_game,
            name='cleanup_game'),
    re_path(r'game/verify/([a-zA-Z0-9-]+)/$', views.does_game_exist, name='does_game_exist'),
]
