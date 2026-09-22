"""
CNTXT® R.E.D. System — RBAC Permission Classes
Sistema de permisos basado en roles para controlar acceso a los recursos del CRM.

Roles (de mayor a menor privilegio):
  - superadmin     → Acceso total: leer, crear, editar, eliminar todo
  - ceo_coo        → Leer todo + crear/editar cualquier recurso
  - coordinadora   → Leer todo + crear/editar Contactos y Empresas
  - director       → Leer todo + crear/editar Proyectos
  - growth_partner → Solo leer su propia cartera de contactos
"""

from rest_framework.permissions import BasePermission, SAFE_METHODS


def get_user_role(user):
    """Helper que obtiene el rol del PerfilUsuario asociado al User de Django."""
    try:
        return user.perfil.rol
    except AttributeError:
        return None


class IsSuperAdmin(BasePermission):
    """Acceso exclusivo para superadmins."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.is_superuser or get_user_role(request.user) == 'superadmin')
        )


class IsSuperAdminOrCEO(BasePermission):
    """Acceso para superadmin y CEO/COO."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        role = get_user_role(request.user)
        return request.user.is_superuser or role in ('superadmin', 'ceo_coo')


class CanManageEmpresas(BasePermission):
    """
    Lectura: cualquier usuario autenticado.
    Escritura: superadmin, ceo_coo, coordinadora.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        return request.user.is_superuser or role in ('superadmin', 'ceo_coo', 'coordinadora')


class CanManageContactos(BasePermission):
    """
    Lectura: cualquier usuario autenticado.
    Escritura: superadmin, ceo_coo, coordinadora.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        return request.user.is_superuser or role in ('superadmin', 'ceo_coo', 'coordinadora')


class CanManageProyectos(BasePermission):
    """
    Lectura: cualquier usuario autenticado.
    Escritura (crear/editar): superadmin, ceo_coo, director.
    Eliminación (DELETE): estrictamente superusuario / superadmin.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        if request.method == 'DELETE':
            return bool(request.user.is_superuser or role == 'superadmin')
        return request.user.is_superuser or role in ('superadmin', 'ceo_coo', 'director')


class CanManagePulso(BasePermission):
    """
    Lectura: cualquier usuario autenticado.
    Escritura: superadmin, ceo_coo, coordinadora.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        return request.user.is_superuser or role in ('superadmin', 'ceo_coo', 'coordinadora')


class IsAuthenticatedUser(BasePermission):
    """Cualquier usuario autenticado (read + write)."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsReadOnly(BasePermission):
    """Solo permite metodos seguros (GET, HEAD, OPTIONS)."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.method in SAFE_METHODS
        )
