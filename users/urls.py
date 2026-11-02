from django.urls import path
from . import views
urlpatterns = [path('bootstrap/', views.bootstrap), path('register/', views.register), path('login/', views.login), path('user/', views.user_view), path('logout/', views.logout), path('mfa/challenge/', views.challenge), path('mfa/enroll/', views.enroll), path('mfa/confirm/', views.confirm), path('mfa/disable/', views.disable), path('sessions/revoke/', views.revoke), path('password/forgot/', views.forgot), path('password/reset/', views.reset)]
