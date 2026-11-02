import time
import hashlib
from unittest.mock import patch
import pyotp
from django.test import TestCase, Client
from django.core.cache import cache
from django.core import mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from .models import User, SecurityProfile, DeviceSession
from .views import cipher

PASSWORD = 'A-long-private-phrase-293!'
class AuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User(name='Alex Chen', email='alex@example.test')
        self.user.set_password(PASSWORD); self.user.save()
        self.profile = SecurityProfile.objects.create(user=self.user)

    def post(self, path, data, client=None):
        return (client or self.client).post('/api/' + path + '/', data, content_type='application/json')

    def login(self, client=None):
        return self.post('login', {'email':self.user.email,'password':PASSWORD}, client)

    def enable(self):
        secret = pyotp.random_base32()
        self.profile.secret=cipher().encrypt(secret.encode()).decode()
        self.profile.enabled=True
        self.profile.recovery=[hashlib.sha256(b'recovery-test-code').hexdigest()]
        self.profile.save()
        return secret

    def test_password_policy_and_generic_login(self):
        self.assertEqual(self.post('register', {'name':'Maya','email':'maya@example.test','password':'short'}).status_code,400)
        self.assertEqual(self.post('register', {'name':'Maya','email':'MAYA@example.test','password':PASSWORD}).status_code,201)
        user=User.objects.get(email='maya@example.test'); self.assertNotEqual(user.password,PASSWORD)
        self.assertEqual(self.post('login', {'email':'missing@example.test','password':'wrong'}).json(),self.post('login', {'email':self.user.email,'password':'wrong'}).json())

    def test_session_login_logout_and_csrf(self):
        self.assertEqual(self.client.get('/api/user/').status_code,401)
        self.assertEqual(self.login().status_code,200)
        self.assertEqual(self.client.get('/api/user/').json()['name'],'Alex Chen')
        self.assertEqual(self.post('logout',{}).status_code,200)
        self.assertEqual(self.client.get('/api/user/').status_code,401)
        protected=Client(enforce_csrf_checks=True); protected.get('/api/bootstrap/')
        self.assertEqual(self.post('login',{'email':self.user.email,'password':PASSWORD},protected).status_code,403)

    def test_mfa_requires_second_factor_and_rejects_replay(self):
        secret=self.enable(); code=pyotp.TOTP(secret).now()
        self.assertTrue(self.login().json()['requires_mfa'])
        self.assertEqual(self.client.get('/api/user/').status_code,401)
        self.assertEqual(self.post('mfa/challenge',{'code':'000000-not-valid'}).status_code,401)
        self.assertEqual(self.post('mfa/challenge',{'code':code}).status_code,200)
        second=Client(); self.login(second)
        self.assertEqual(self.post('mfa/challenge',{'code':code},second).status_code,401)

    def test_recovery_codes_are_one_use(self):
        self.enable(); self.login()
        self.assertEqual(self.post('mfa/challenge',{'code':'recovery-test-code'}).status_code,200)
        second=Client(); self.login(second)
        self.assertEqual(self.post('mfa/challenge',{'code':'recovery-test-code'},second).status_code,401)
        self.profile.refresh_from_db(); self.assertEqual(self.profile.recovery,[])

    def test_enrollment_requires_password_and_verified_code_and_revokes_other_sessions(self):
        self.login(); other=Client(); self.login(other)
        self.assertEqual(self.post('mfa/enroll',{'password':'wrong'}).status_code,401)
        result=self.post('mfa/enroll',{'password':PASSWORD}).json()
        self.assertEqual(self.post('mfa/confirm',{'code':'wrong'}).status_code,400)
        response=self.post('mfa/confirm',{'code':pyotp.TOTP(result['secret']).now()})
        self.assertEqual(response.status_code,200); self.assertEqual(len(response.json()['codes']),8)
        self.profile.refresh_from_db(); self.assertTrue(self.profile.enabled)
        self.assertNotEqual(self.profile.secret,result['secret'])
        self.assertNotIn(response.json()['codes'][0],self.profile.recovery)
        self.assertEqual(other.get('/api/user/').status_code,401)
        self.assertEqual(self.post('mfa/enroll',{'password':PASSWORD}).status_code,400)

    def test_session_revocation_is_owner_scoped(self):
        self.login(); second=Client(); self.login(second)
        devices=self.client.get('/api/user/').json()['sessions']; target=next(d for d in devices if not d['current'])
        stranger=User(name='Maya',email='maya@example.test'); stranger.set_password(PASSWORD); stranger.save()
        other=Client(); self.post('login',{'email':stranger.email,'password':PASSWORD},other)
        self.assertEqual(self.post('sessions/revoke',{'id':target['id']},other).status_code,404)
        self.assertEqual(self.post('sessions/revoke',{'id':target['id']}).status_code,200)
        self.assertEqual(second.get('/api/user/').status_code,401)

    def test_reset_one_use_revokes_sessions_and_preserves_mfa(self):
        self.login(); secret=self.enable()
        self.post('password/forgot',{'email':self.user.email}); self.assertEqual(len(mail.outbox),1)
        self.user.refresh_from_db()
        token=default_token_generator.make_token(self.user); uid=urlsafe_base64_encode(force_bytes(self.user.pk))
        data={'uid':uid,'token':token,'password':'Another-long-passphrase-492!'}
        self.assertEqual(self.post('password/reset',data).status_code,200)
        self.assertEqual(self.client.get('/api/user/').status_code,401)
        self.assertEqual(self.post('password/reset',data).status_code,400)
        self.profile.refresh_from_db(); self.assertTrue(self.profile.enabled)
        self.assertTrue(self.post('login',{'email':self.user.email,'password':data['password']}).json()['requires_mfa'])

    def test_pending_mfa_invalidated_by_password_reset(self):
        self.enable(); self.login()
        self.user.refresh_from_db()
        token=default_token_generator.make_token(self.user); uid=urlsafe_base64_encode(force_bytes(self.user.pk))
        self.post('password/reset',{'uid':uid,'token':token,'password':'Another-long-passphrase-492!'})
        self.assertEqual(self.post('mfa/challenge',{'code':'recovery-test-code'}).status_code,401)

    def test_throttles_repeated_login_attempts(self):
        for _ in range(15): self.post('login',{'email':self.user.email,'password':'wrong'})
        self.assertEqual(self.login().status_code,429)

    def test_browser_origin_csrf_flow(self):
        browser=Client(enforce_csrf_checks=True)
        browser.get('/api/bootstrap/')
        token=browser.cookies['csrftoken'].value
        response=browser.post('/api/login/', {'email':self.user.email,'password':PASSWORD}, content_type='application/json', HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN='http://localhost:5177')
        self.assertEqual(response.status_code,200)
        token=browser.cookies['csrftoken'].value
        response=browser.post('/api/logout/', {}, content_type='application/json', HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN='https://evil.example')
        self.assertEqual(response.status_code,403)

    def test_disabling_mfa_requires_password_and_factor(self):
        self.login(); self.enable()
        self.assertEqual(self.post('mfa/disable',{'password':'wrong','code':'recovery-test-code'}).status_code,401)
        self.assertEqual(self.post('mfa/disable',{'password':PASSWORD,'code':'bad'}).status_code,401)
        self.assertEqual(self.post('mfa/disable',{'password':PASSWORD,'code':'recovery-test-code'}).status_code,200)
        self.profile.refresh_from_db(); self.assertFalse(self.profile.enabled)
        self.assertEqual(self.profile.secret,'')
