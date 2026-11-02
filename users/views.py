import base64
import hashlib
import json
import secrets
import time
from functools import wraps

import pyotp
from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth import login as auth_login, logout as auth_logout
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction, IntegrityError
from django.http import JsonResponse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from .models import User, SecurityProfile, DeviceSession, SecurityEvent


def cipher():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('totp:' + settings.SECRET_KEY).encode()).digest()))


def endpoint(method='POST', protected=False):
    def wrap(fn):
        @wraps(fn)
        def view(request, *args, **kwargs):
            if request.method != method:
                return JsonResponse({'error': 'Method not allowed.'}, status=405)
            if protected and not request.user.is_authenticated:
                return JsonResponse({'error': 'Please sign in.'}, status=401)
            try:
                request.payload = json.loads(request.body or b'{}') if method == 'POST' else {}
                if not isinstance(request.payload, dict):
                    raise ValueError('Expected an object.')
                response = fn(request, *args, **kwargs)
            except (ValueError, ValidationError, TypeError) as exc:
                response = JsonResponse({'error': ' '.join(exc.messages) if isinstance(exc, ValidationError) else str(exc)}, status=400)
            response['Cache-Control'] = 'no-store'
            return response
        return view
    return wrap


def throttle(request, action):
    key = 'auth:' + hashlib.sha256((action + request.META.get('REMOTE_ADDR', '')).encode()).hexdigest()
    cache.add(key, 0, 300)
    if cache.incr(key) > 15:
        return JsonResponse({'error': 'Too many attempts. Try again in five minutes.'}, status=429)


def event(user, action):
    SecurityEvent.objects.create(user=user, action=action)


def profile(user):
    return SecurityProfile.objects.get_or_create(user=user)[0]


def establish(request, user):
    auth_login(request, user, backend='django.contrib.auth.backends.ModelBackend')
    DeviceSession.objects.update_or_create(session_key=request.session.session_key, defaults={'user': user, 'agent': request.META.get('HTTP_USER_AGENT', 'Unknown browser')[:250]})
    event(user, 'Signed in')
    return JsonResponse({'ok': True})


def verify_factor(p, code):
    code = str(code).strip()
    if len(code) == 6 and code.isdigit():
        totp = pyotp.TOTP(cipher().decrypt(p.secret.encode()).decode())
        current = int(time.time() // 30)
        for counter in (current-1, current, current+1):
            if counter > p.last_counter and secrets.compare_digest(totp.generate_otp(counter), code):
                changed = SecurityProfile.objects.filter(pk=p.pk, last_counter=p.last_counter).update(last_counter=counter)
                if changed:
                    p.last_counter = counter
                    return True
        return False
    digest = hashlib.sha256(code.encode()).hexdigest()
    if digest in p.recovery:
        old = p.recovery.copy()
        new = [v for v in old if v != digest]
        changed = SecurityProfile.objects.filter(pk=p.pk, recovery=old).update(recovery=new)
        if changed:
            p.recovery = new
            return True
    return False


@ensure_csrf_cookie
@endpoint('GET')
def bootstrap(request):
    return JsonResponse({'authenticated': request.user.is_authenticated})


@endpoint()
def register(request):
    limited = throttle(request, 'register')
    if limited: return limited
    name = str(request.payload.get('name', '')).strip()
    email = str(request.payload.get('email', '')).strip().lower()
    password = request.payload.get('password', '')
    validate_email(email)
    if not name or len(name) > 100 or len(email) > 254 or not isinstance(password, str) or len(password) > 128:
        raise ValueError('Enter a name, valid email, and password of at most 128 characters.')
    user = User(name=name, email=email)
    validate_password(password, user)
    if len(password) < 12: raise ValueError('Use at least 12 characters for your password.')
    user.set_password(password)
    try:
        user.save()
    except IntegrityError:
        return JsonResponse({'error': 'Unable to create this account. Try signing in or resetting your password.'}, status=409)
    profile(user)
    event(user, 'Account created')
    return JsonResponse({'ok': True}, status=201)


@endpoint()
def login(request):
    limited = throttle(request, 'login')
    if limited: return limited
    email = str(request.payload.get('email', '')).strip().lower()
    password = request.payload.get('password', '')
    user = User.objects.filter(email=email, is_active=True).first()
    if not isinstance(password, str) or len(password) > 128: raise ValueError('Invalid credentials.')
    if not user:
        make_password(password)
    if not user or not user.check_password(password):
        return JsonResponse({'error': 'Email or password is incorrect.'}, status=401)
    if profile(user).enabled:
        request.session.flush()
        request.session['pending_user'] = user.pk
        request.session['pending_hash'] = user.get_session_auth_hash()
        request.session['pending_until'] = time.time() + 300
        return JsonResponse({'requires_mfa': True})
    return establish(request, user)


@endpoint()
def challenge(request):
    limited = throttle(request, 'challenge')
    if limited: return limited
    user = User.objects.filter(pk=request.session.get('pending_user'), is_active=True).first()
    if not user or request.session.get('pending_until', 0) <= time.time() or not secrets.compare_digest(request.session.get('pending_hash', ''), user.get_session_auth_hash()):
        return JsonResponse({'error': 'Sign in again to request a new verification challenge.'}, status=401)
    p = profile(user)
    if not p.enabled or not verify_factor(p, request.payload.get('code', '')):
        return JsonResponse({'error': 'The code is invalid, expired, or already used.'}, status=401)
    request.session.flush()
    return establish(request, user)


@endpoint('GET', True)
def user_view(request):
    p = profile(request.user)
    live = set(Session.objects.filter(expire_date__gt=timezone.now()).values_list('session_key', flat=True))
    sessions = [{'id': str(s.id), 'agent': s.agent, 'created': s.created.isoformat(), 'current': s.session_key == request.session.session_key} for s in DeviceSession.objects.filter(user=request.user, session_key__in=live).order_by('-created')]
    return JsonResponse({'name': request.user.name, 'email': request.user.email, 'mfa': p.enabled, 'recovery_remaining': len(p.recovery), 'sessions': sessions, 'events': list(SecurityEvent.objects.filter(user=request.user).order_by('-created').values('action', 'created')[:15])})


@endpoint(protected=True)
def logout(request):
    DeviceSession.objects.filter(session_key=request.session.session_key).delete()
    event(request.user, 'Signed out')
    auth_logout(request)
    return JsonResponse({'ok': True})


@endpoint(protected=True)
def enroll(request):
    limited = throttle(request, 'enroll')
    if limited: return limited
    if not request.user.check_password(str(request.payload.get('password', ''))):
        return JsonResponse({'error': 'Your current password is incorrect.'}, status=401)
    if profile(request.user).enabled: raise ValueError('Two-factor authentication is already enabled.')
    secret = pyotp.random_base32()
    request.session['enroll_secret'] = cipher().encrypt(secret.encode()).decode()
    request.session['enroll_until'] = time.time() + 300
    return JsonResponse({'secret': secret})


@endpoint(protected=True)
def confirm(request):
    limited = throttle(request, 'confirm')
    if limited: return limited
    encrypted = request.session.get('enroll_secret')
    if not encrypted or request.session.get('enroll_until', 0) <= time.time(): raise ValueError('Setup expired. Start again.')
    code = str(request.payload.get('code', ''))
    secret = cipher().decrypt(encrypted.encode()).decode()
    if not pyotp.TOTP(secret).verify(code, valid_window=1): raise ValueError('Enter the current six-digit code from your authenticator.')
    p = profile(request.user)
    if p.enabled: raise ValueError('Two-factor authentication is already enabled.')
    codes = [secrets.token_hex(8) for _ in range(8)]
    p.secret = encrypted; p.enabled = True
    p.last_counter = max(c for c in (int(time.time()//30)-1, int(time.time()//30), int(time.time()//30)+1) if secrets.compare_digest(pyotp.TOTP(secret).generate_otp(c), code))
    p.recovery = [hashlib.sha256(c.encode()).hexdigest() for c in codes]; p.save()
    request.session.pop('enroll_secret', None)
    event(request.user, 'Two-factor authentication enabled')
    others = DeviceSession.objects.filter(user=request.user).exclude(session_key=request.session.session_key)
    Session.objects.filter(session_key__in=others.values_list('session_key', flat=True)).delete(); others.delete()
    return JsonResponse({'codes': codes})


@endpoint(protected=True)
def disable(request):
    limited = throttle(request, 'disable')
    if limited: return limited
    p = profile(request.user)
    if not p.enabled: raise ValueError('Two-factor authentication is not enabled.')
    if not request.user.check_password(str(request.payload.get('password', ''))) or not verify_factor(p, request.payload.get('code', '')):
        return JsonResponse({'error': 'Enter your current password and a valid unused authenticator or recovery code.'}, status=401)
    p.secret = ''; p.enabled = False; p.recovery = []; p.last_counter = -1; p.save()
    event(request.user, 'Two-factor authentication disabled')
    return JsonResponse({'ok': True})


@endpoint(protected=True)
def revoke(request):
    identifier = request.payload.get('id')
    try: device = DeviceSession.objects.filter(pk=identifier, user=request.user).first()
    except ValidationError: device = None
    if not device: return JsonResponse({'error': 'Session not found.'}, status=404)
    if device.session_key == request.session.session_key: raise ValueError('Use sign out to end the current session.')
    Session.objects.filter(session_key=device.session_key).delete(); device.delete()
    event(request.user, 'Another session revoked')
    return JsonResponse({'ok': True})


@endpoint()
def forgot(request):
    limited = throttle(request, 'reset')
    if limited: return limited
    email = str(request.payload.get('email', '')).strip().lower()
    validate_email(email)
    user = User.objects.filter(email=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk)); token = default_token_generator.make_token(user)
        link = f'{settings.FRONTEND_ORIGIN}/?reset={uid}&token={token}'
        send_mail('Reset your Obsidian Access password', f'Use this one-hour link to choose a new password:\n{link}\n\nAuthenticator verification is still required if enabled.', settings.DEFAULT_FROM_EMAIL, [email])
    return JsonResponse({'ok': True, 'message': 'If that account exists, a reset link has been generated. In this local demo, check the server console.'})


@endpoint()
def reset(request):
    limited = throttle(request, 'reset-confirm')
    if limited: return limited
    try: user = User.objects.get(pk=urlsafe_base64_decode(str(request.payload.get('uid', ''))).decode(), is_active=True)
    except (ValueError, UnicodeError, User.DoesNotExist): user = None
    if not user or not default_token_generator.check_token(user, str(request.payload.get('token', ''))): raise ValueError('This reset link is invalid or expired.')
    password = request.payload.get('password', '')
    if not isinstance(password, str) or not 12 <= len(password) <= 128: raise ValueError('Use 12–128 characters.')
    validate_password(password, user)
    user.set_password(password); user.save()
    Session.objects.filter(session_key__in=DeviceSession.objects.filter(user=user).values_list('session_key', flat=True)).delete()
    DeviceSession.objects.filter(user=user).delete()
    event(user, 'Password reset; sessions revoked')
    return JsonResponse({'ok': True})
