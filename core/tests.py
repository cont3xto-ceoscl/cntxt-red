from django.test import TestCase
from django.urls import reverse
from core.models import Contacto, Empresa


class CoreAppTests(TestCase):
    def test_status_endpoint(self):
        response = self.client.get(reverse('core:system_status'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get('status'), 'healthy')

    def test_contacto_update_endpoint(self):
        empresa = Empresa.objects.create(nombre="CNTXT Global")
        contacto = Contacto.objects.create(
            nombre_completo="Carlos Andrés",
            telefono="573001234567",
            email="carlos@cntxt.io",
            empresa=empresa,
            rol="Director",
            ciudad="Medellín",
            tipo_persona="natural",
            tipo_relacion="growth",
            canal_entrada="fb",
            pulso_vital=2,
            notas="Nota inicial"
        )

        update_payload = {
            "nombre_completo": "Carlos Andrés Ramos",
            "rol": "CEO & Founder",
            "telefono": "573119876543",
            "email": "carlos.ramos@cntxt.io",
            "ciudad": "Bogotá, Colombia",
            "tipo_persona": "juridica",
            "tipo_relacion": "cliente_black",
            "canal_entrada": "prospeccion",
            "pulso_vital": 4,
            "notas": "Nota actualizada unificada",
            "empresa": empresa.id
        }

        response = self.client.patch(
            f"/api/contactos/{contacto.id}/",
            data=update_payload,
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)

        contacto.refresh_from_db()
        self.assertEqual(contacto.nombre_completo, "Carlos Andrés Ramos")
        self.assertEqual(contacto.rol, "CEO & Founder")
        self.assertEqual(contacto.pulso_vital, 4)
        self.assertEqual(contacto.tipo_relacion, "cliente_black")
        self.assertEqual(contacto.notas, "Nota actualizada unificada")

