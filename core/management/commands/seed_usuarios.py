"""
Management command: seed_usuarios
Crea los 5 usuarios de prueba para cada rol del sistema CNTXT R.E.D.

Uso:
    python manage.py seed_usuarios
    python manage.py seed_usuarios --force   (sobreescribe si ya existen)
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import PerfilUsuario


USUARIOS_SEED = [
    {
        'username': 'admin.cntxt',
        'email': 'admin@cntxt.co',
        'password': 'CNTXT@Admin2026!',
        'first_name': 'Super',
        'last_name': 'Admin',
        'rol': 'superadmin',
        'is_superuser': True,
        'is_staff': True,
    },
    {
        'username': 'ceo.cntxt',
        'email': 'ceo@cntxt.co',
        'password': 'CNTXT@CEO2026!',
        'first_name': 'CEO',
        'last_name': 'CNTXT',
        'rol': 'ceo_coo',
        'is_superuser': False,
        'is_staff': True,
    },
    {
        'username': 'coordinadora.cntxt',
        'email': 'coordinadora@cntxt.co',
        'password': 'CNTXT@Coord2026!',
        'first_name': 'Coordinadora',
        'last_name': 'CNTXT',
        'rol': 'coordinadora',
        'is_superuser': False,
        'is_staff': False,
    },
    {
        'username': 'director.cntxt',
        'email': 'director@cntxt.co',
        'password': 'CNTXT@Dir2026!',
        'first_name': 'Director',
        'last_name': 'CNTXT',
        'rol': 'director',
        'is_superuser': False,
        'is_staff': False,
    },
    {
        'username': 'growth.cntxt',
        'email': 'growth@cntxt.co',
        'password': 'CNTXT@Growth2026!',
        'first_name': 'Growth',
        'last_name': 'Partner',
        'rol': 'growth_partner',
        'is_superuser': False,
        'is_staff': False,
    },
]


class Command(BaseCommand):
    help = 'Crea usuarios de prueba para cada rol del sistema CNTXT R.E.D.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Sobreescribe la contrasena si el usuario ya existe.',
        )

    def handle(self, *args, **options):
        force = options['force']
        self.stdout.write(self.style.SUCCESS('=== Seeding usuarios CNTXT R.E.D. ===\n'))

        for data in USUARIOS_SEED:
            rol = data.pop('rol')
            is_superuser = data.pop('is_superuser')
            is_staff = data.pop('is_staff')
            password = data.pop('password')

            user, created = User.objects.get_or_create(
                username=data['username'],
                defaults={**data, 'is_superuser': is_superuser, 'is_staff': is_staff}
            )

            if created or force:
                user.set_password(password)
                user.is_superuser = is_superuser
                user.is_staff = is_staff
                for k, v in data.items():
                    setattr(user, k, v)
                user.save()

            # Asignar o actualizar perfil
            perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
            perfil.rol = rol
            perfil.save()

            status = 'CREADO' if created else 'YA EXISTE (perfil actualizado)'
            self.stdout.write(
                f'  [{rol.upper():>15}] {user.username:<25} | {user.email:<30} | {status}'
            )

        self.stdout.write(self.style.SUCCESS('\n=== Seed completado exitosamente ==='))
        self.stdout.write('\nCredenciales de acceso:')
        self.stdout.write('  admin@cntxt.co       | CNTXT@Admin2026!')
        self.stdout.write('  ceo@cntxt.co         | CNTXT@CEO2026!')
        self.stdout.write('  coordinadora@cntxt.co| CNTXT@Coord2026!')
        self.stdout.write('  director@cntxt.co    | CNTXT@Dir2026!')
        self.stdout.write('  growth@cntxt.co      | CNTXT@Growth2026!')
