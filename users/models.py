from django.db import models
from django.contrib.auth.models import AbstractUser

# Create your models here.

class User(AbstractUser):
    name = models.CharField(max_length=255)
    email = models.CharField(max_length=255,unique=True)
    password = models.CharField(max_length=255)
    username = None

    # Changes login to email and password
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

import uuid
from django.conf import settings

class SecurityProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    secret = models.TextField(blank=True)
    enabled = models.BooleanField(default=False)
    last_counter = models.BigIntegerField(default=-1)
    recovery = models.JSONField(default=list)

class DeviceSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    session_key = models.CharField(max_length=64, unique=True)
    agent = models.CharField(max_length=250)
    created = models.DateTimeField(auto_now_add=True)

class SecurityEvent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    action = models.CharField(max_length=150)
    created = models.DateTimeField(auto_now_add=True)
