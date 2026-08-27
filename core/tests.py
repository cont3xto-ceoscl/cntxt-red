from django.test import TestCase
from django.urls import reverse


class CoreAppTests(TestCase):
    def test_status_endpoint(self):
        response = self.client.get(reverse('core:system_status'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get('status'), 'healthy')
