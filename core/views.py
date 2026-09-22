import json
from decimal import Decimal
from pathlib import Path
from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.views import View
from django.contrib.auth import authenticate
from django.db.models import Sum, Count, Q
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from .models import Empresa, Contacto, Proyecto, PulsoRelacional, Actividad
from .serializers import (
    EmpresaSerializer, ContactoSerializer, ProyectoSerializer,
    PulsoRelacionalSerializer, ActividadSerializer, UserSerializer, UserUpdateSerializer
)
from .permissions import (
    CanManageEmpresas, CanManageContactos, CanManageProyectos,
    CanManagePulso, IsAuthenticatedUser, IsSuperAdminOrCEO, get_user_role
)


# ─────────────────────────────────────────────────────────────
# Helper: registrar actividad en el feed
# ─────────────────────────────────────────────────────────────

def _log_actividad(tipo, descripcion, usuario, empresa=None, contacto=None, proyecto=None):
    """Registra una entrada en el feed de actividad del sistema."""
    try:
        Actividad.objects.create(
            tipo=tipo,
            descripcion=descripcion,
            usuario=usuario,
            empresa=empresa,
            contacto=contacto,
            proyecto=proyecto,
        )
    except Exception:
        pass  # No bloquear la operación principal si el log falla


# ─────────────────────────────────────────────────────────────
# Auth Endpoints (JWT)
# ─────────────────────────────────────────────────────────────

class LoginView(APIView):
    """
    POST /api/auth/login/
    Body: { "username": "...", "password": "..." }
    Returns: { access, refresh, user: {...} }
    """
    permission_classes = []  # Público

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()

        if not username or not password:
            return Response(
                {'error': 'Usuario y contraseña son requeridos.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Permite login con email también
        from django.contrib.auth.models import User as DjangoUser
        if '@' in username:
            try:
                user_obj = DjangoUser.objects.get(email=username)
                username = user_obj.username
            except DjangoUser.DoesNotExist:
                pass

        user = authenticate(request, username=username, password=password)
        if not user:
            return Response(
                {'error': 'Credenciales incorrectas. Verifica tu usuario y contraseña.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'Tu cuenta está desactivada. Contacta al administrador.'},
                status=status.HTTP_403_FORBIDDEN
            )

        refresh = RefreshToken.for_user(user)
        _log_actividad(
            tipo='login',
            descripcion=f'Inicio de sesión: {user.get_full_name() or user.username}',
            usuario=user
        )

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Body: { "refresh": "<refresh_token>" }
    Blacklists the refresh token.
    """
    permission_classes = [IsAuthenticatedUser]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'error': 'Refresh token requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Sesión cerrada exitosamente.'}, status=status.HTTP_200_OK)
        except TokenError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """
    GET /api/auth/me/ — Retorna datos del usuario autenticado.
    PATCH /api/auth/me/ — Actualiza nombre, email, teléfono del perfil.
    """
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(request.user, context={'request': request}).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────
# Dashboard Stats
# ─────────────────────────────────────────────────────────────

class DashboardStatsView(APIView):
    """
    GET /api/dashboard/stats/
    Retorna KPIs consolidados para el panel principal.
    """
    permission_classes = [IsAuthenticatedUser]

    def get(self, request):
        # Conteos básicos
        total_contactos = Contacto.objects.filter(is_active=True).count()
        total_empresas = Empresa.objects.count()
        total_proyectos = Proyecto.objects.count()

        # Pipeline financiero
        pipeline_activo = Proyecto.objects.exclude(estado__in=['ejecucion', 'pausa'])
        monto_total_pipeline = pipeline_activo.aggregate(
            total=Sum('monto_proyectado')
        )['total'] or Decimal('0.00')

        monto_ponderado_total = sum(
            float(p.monto_ponderado) for p in pipeline_activo
        )

        # Proyectos por estado
        proyectos_por_estado = {}
        for estado_val, estado_label in Proyecto.Estado.choices:
            proyectos_por_estado[estado_val] = {
                'label': estado_label,
                'count': Proyecto.objects.filter(estado=estado_val).count(),
                'monto': float(
                    Proyecto.objects.filter(estado=estado_val).aggregate(
                        total=Sum('monto_proyectado')
                    )['total'] or 0
                )
            }

        # Pulsos por clasificación
        pulsos_p1 = Contacto.objects.filter(pulso_vital=1, is_active=True).count()
        pulsos_p2 = Contacto.objects.filter(pulso_vital=2, is_active=True).count()
        pulsos_p3 = Contacto.objects.filter(pulso_vital=3, is_active=True).count()
        pulsos_p4 = Contacto.objects.filter(pulso_vital=4, is_active=True).count()

        # Contactos por fase RED
        fase_r = Contacto.objects.filter(fase_red='R', is_active=True).count()
        fase_e = Contacto.objects.filter(fase_red='E', is_active=True).count()
        fase_d = Contacto.objects.filter(fase_red='D', is_active=True).count()

        # Actividad reciente (últimas 10 acciones)
        actividades = Actividad.objects.select_related('usuario').order_by('-created_at')[:10]
        actividad_feed = ActividadSerializer(actividades, many=True).data

        return Response({
            'status': 'success',
            'kpis': {
                'total_contactos': total_contactos,
                'total_empresas': total_empresas,
                'total_proyectos': total_proyectos,
                'monto_total_pipeline': float(monto_total_pipeline),
                'monto_ponderado_total': monto_ponderado_total,
                'pulsos_calientes': pulsos_p3 + pulsos_p4,
            },
            'pulsos': {
                'P1': pulsos_p1,
                'P2': pulsos_p2,
                'P3': pulsos_p3,
                'P4': pulsos_p4,
            },
            'fases_red': {
                'R': fase_r,
                'E': fase_e,
                'D': fase_d,
            },
            'proyectos_por_estado': proyectos_por_estado,
            'actividad_reciente': actividad_feed,
        })


# ─────────────────────────────────────────────────────────────
# CRM ViewSets con RBAC + Actividad
# ─────────────────────────────────────────────────────────────

class EmpresaViewSet(viewsets.ModelViewSet):
    """CRUD completo para el modelo Empresa con búsqueda, ordenamiento y permisos."""
    queryset = Empresa.objects.all()
    serializer_class = EmpresaSerializer
    permission_classes = [CanManageEmpresas]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'sector', 'nit', 'ciudad']
    ordering_fields = ['nombre', 'created_at', 'sector']
    ordering = ['nombre']

    def perform_create(self, serializer):
        empresa = serializer.save()
        _log_actividad(
            tipo='empresa_creada',
            descripcion=f'Empresa creada: {empresa.nombre}',
            usuario=self.request.user,
            empresa=empresa
        )

    def perform_update(self, serializer):
        empresa = serializer.save()
        _log_actividad(
            tipo='empresa_editada',
            descripcion=f'Empresa actualizada: {empresa.nombre}',
            usuario=self.request.user,
            empresa=empresa
        )

    def perform_destroy(self, instance):
        nombre = instance.nombre
        _log_actividad(
            tipo='empresa_eliminada',
            descripcion=f'Empresa eliminada: {nombre}',
            usuario=self.request.user
        )
        instance.delete()


class ContactoViewSet(viewsets.ModelViewSet):
    """CRUD completo para el modelo Contacto con filtros R.E.D. y permisos."""
    queryset = Contacto.objects.select_related('empresa').all()
    serializer_class = ContactoSerializer
    permission_classes = [CanManageContactos]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre_completo', 'primer_nombre', 'segundo_nombre', 'apellidos',
                     'email', 'telefono', 'ciudad', 'pais', 'rol', 'empresa__nombre']
    ordering_fields = ['nombre_completo', 'pulso_vital', 'fase_red', 'created_at']
    ordering = ['nombre_completo']

    def get_queryset(self):
        queryset = super().get_queryset()
        fase = self.request.query_params.get('fase')
        pulso = self.request.query_params.get('pulso')
        relacion = self.request.query_params.get('relacion')
        empresa_id = self.request.query_params.get('empresa')
        is_active = self.request.query_params.get('activo')

        if fase:
            queryset = queryset.filter(fase_red=fase.upper())
        if pulso:
            queryset = queryset.filter(pulso_vital=pulso)
        if relacion:
            queryset = queryset.filter(tipo_relacion=relacion)
        if empresa_id:
            queryset = queryset.filter(empresa_id=empresa_id)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        return queryset

    def perform_create(self, serializer):
        contacto = serializer.save()
        _log_actividad(
            tipo='contacto_creado',
            descripcion=f'Contacto creado: {contacto.nombre_completo}',
            usuario=self.request.user,
            contacto=contacto,
            empresa=contacto.empresa
        )

    def perform_update(self, serializer):
        contacto = serializer.save()
        _log_actividad(
            tipo='contacto_editado',
            descripcion=f'Contacto actualizado: {contacto.nombre_completo}',
            usuario=self.request.user,
            contacto=contacto,
            empresa=contacto.empresa
        )

    def perform_destroy(self, instance):
        nombre = instance.nombre_completo
        _log_actividad(
            tipo='contacto_eliminado',
            descripcion=f'Contacto eliminado: {nombre}',
            usuario=self.request.user
        )
        instance.delete()


class ProyectoViewSet(viewsets.ModelViewSet):
    """CRUD completo para el modelo Proyecto con filtros por estado de Pipeline y C.O.R."""
    queryset = Proyecto.objects.select_related('empresa', 'contacto').all()
    serializer_class = ProyectoSerializer
    permission_classes = [CanManageProyectos]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['titulo', 'empresa__nombre', 'contacto__nombre_completo', 'proximo_paso']
    ordering_fields = ['created_at', 'monto_proyectado', 'estado', 'fecha_limite']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        flujo = self.request.query_params.get('flujo')
        estado = self.request.query_params.get('estado')
        linea = self.request.query_params.get('linea')
        categoria = self.request.query_params.get('categoria')

        if flujo:
            queryset = queryset.filter(flujo=flujo)
        if estado:
            queryset = queryset.filter(estado=estado)
        if linea:
            queryset = queryset.filter(linea_operativa=linea)
        if categoria:
            queryset = queryset.filter(categoria=categoria)

        return queryset

    def perform_create(self, serializer):
        proyecto = serializer.save()
        _log_actividad(
            tipo='proyecto_creado',
            descripcion=f'Proyecto creado: {proyecto.titulo} — Estado: {proyecto.get_estado_display()}',
            usuario=self.request.user,
            proyecto=proyecto,
            empresa=proyecto.empresa
        )

    def perform_update(self, serializer):
        estado_anterior = serializer.instance.estado
        proyecto = serializer.save()
        tipo = 'estado_cambiado' if proyecto.estado != estado_anterior else 'proyecto_editado'
        desc = (
            f'Estado cambiado en {proyecto.titulo}: {estado_anterior} → {proyecto.estado}'
            if tipo == 'estado_cambiado'
            else f'Proyecto actualizado: {proyecto.titulo}'
        )
        _log_actividad(tipo=tipo, descripcion=desc, usuario=self.request.user,
                       proyecto=proyecto, empresa=proyecto.empresa)

    def destroy(self, request, *args, **kwargs):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role == 'superadmin'):
            return Response(
                {'error': 'Acceso denegado: solo el superusuario puede eliminar proyectos.'},
                status=status.HTTP_403_FORBIDDEN
            )
        instance = self.get_object()
        titulo = instance.titulo
        self.perform_destroy(instance)
        return Response({'message': f'Proyecto "{titulo}" eliminado correctamente.'}, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        titulo = instance.titulo
        _log_actividad(
            tipo='proyecto_eliminado',
            descripcion=f'Proyecto eliminado: {titulo}',
            usuario=self.request.user
        )
        instance.delete()


class PulsoRelacionalViewSet(viewsets.ModelViewSet):
    """CRUD para la Matriz de Intensidad Relacional (100 puntos)."""
    queryset = PulsoRelacional.objects.select_related('contacto', 'evaluado_por').all()
    serializer_class = PulsoRelacionalSerializer
    permission_classes = [CanManagePulso]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['contacto__nombre_completo', 'notas']
    ordering_fields = ['created_at', 'contacto__nombre_completo']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        contacto_id = self.request.query_params.get('contacto')
        clasificacion = self.request.query_params.get('clasificacion')

        if contacto_id:
            queryset = queryset.filter(contacto_id=contacto_id)

        if clasificacion:
            # Filtrar por clasificación usando los rangos de puntos
            if clasificacion == 'P1':
                ids = [p.id for p in queryset if p.clasificacion == 'P1']
            elif clasificacion == 'P2':
                ids = [p.id for p in queryset if p.clasificacion == 'P2']
            elif clasificacion == 'P3':
                ids = [p.id for p in queryset if p.clasificacion == 'P3']
            elif clasificacion == 'P4':
                ids = [p.id for p in queryset if p.clasificacion == 'P4']
            else:
                ids = []
            queryset = queryset.filter(id__in=ids)

        return queryset

    def perform_create(self, serializer):
        pulso = serializer.save(evaluado_por=self.request.user)
        _log_actividad(
            tipo='pulso_evaluado',
            descripcion=f'Pulso evaluado para {pulso.contacto.nombre_completo}: {pulso.total:.1f} pts ({pulso.clasificacion})',
            usuario=self.request.user,
            contacto=pulso.contacto
        )


class ActividadViewSet(viewsets.ReadOnlyModelViewSet):
    """Feed de actividad reciente — solo lectura."""
    queryset = Actividad.objects.select_related('usuario', 'empresa', 'contacto', 'proyecto').all()
    serializer_class = ActividadSerializer
    permission_classes = [IsAuthenticatedUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['descripcion', 'tipo', 'usuario__username']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        limit = self.request.query_params.get('limit')
        tipo = self.request.query_params.get('tipo')

        if tipo:
            queryset = queryset.filter(tipo=tipo)
        if limit:
            try:
                queryset = queryset[:int(limit)]
            except (ValueError, TypeError):
                pass

        return queryset


# ─────────────────────────────────────────────────────────────
# Legacy Views
# ─────────────────────────────────────────────────────────────

class InitialDataView(APIView):
    """Endpoint consolidado para carga inicial rápida de la aplicación."""
    permission_classes = [IsAuthenticatedUser]

    def get(self, request, *args, **kwargs):
        empresas = Empresa.objects.all()
        contactos = Contacto.objects.select_related('empresa').all()
        proyectos = Proyecto.objects.select_related('empresa', 'contacto').all()

        return Response({
            'status': 'success',
            'empresas': EmpresaSerializer(empresas, many=True).data,
            'contactos': ContactoSerializer(contactos, many=True).data,
            'proyectos': ProyectoSerializer(proyectos, many=True).data,
        })


class SystemStatusView(View):
    """Health check endpoint — público."""
    def get(self, request, *args, **kwargs):
        db_engine = settings.DATABASES['default']['ENGINE'].split('.')[-1]
        return JsonResponse({
            'status': 'healthy',
            'system': 'CNTXT R.E.D. System',
            'version': '5.1.0-rbac',
            'database': db_engine,
            'core_app': 'active'
        })


class LegacyFrontendView(View):
    """Bridge view para servir index.html desde Django."""
    def get(self, request, *args, **kwargs):
        index_candidates = [
            settings.BASE_DIR / 'index.html',
            settings.BASE_DIR / 'frontend_legacy' / 'index.html'
        ]
        for candidate in index_candidates:
            if candidate.exists():
                with open(candidate, 'r', encoding='utf-8') as f:
                    return HttpResponse(f.read(), content_type='text/html')
        return JsonResponse({'message': 'index.html not found.'}, status=404)



class InitialDataView(APIView):
    """
    Endpoint consolidado para carga inicial rápida de la aplicación.
    Devuelve empresas, contactos y proyectos en una única solicitud.
    """
    permission_classes = []
    def get(self, request, *args, **kwargs):
        empresas = Empresa.objects.prefetch_related('contactos', 'proyectos').all()
        contactos = Contacto.objects.select_related('empresa').prefetch_related('evaluaciones_pulso').all()
        proyectos = Proyecto.objects.select_related('empresa', 'contacto').all()

        return Response({
            'status': 'success',
            'empresas': EmpresaSerializer(empresas, many=True).data,
            'contactos': ContactoSerializer(contactos, many=True).data,
            'proyectos': ProyectoSerializer(proyectos, many=True).data,
        })


class SystemStatusView(View):
    """
    Health check and system status endpoint.
    """
    def get(self, request, *args, **kwargs):
        db_engine = settings.DATABASES['default']['ENGINE'].split('.')[-1]
        return JsonResponse({
            'status': 'healthy',
            'system': 'CNTXT System',
            'version': '5.1.0',
            'database': db_engine,
            'core_app': 'active'
        })


class LegacyFrontendView(View):
    """
    Bridge view to serve index.html with the Django backend.
    """
    def get(self, request, *args, **kwargs):
        index_candidates = [
            settings.BASE_DIR / 'index.html',
            settings.BASE_DIR / 'frontend_legacy' / 'index.html'
        ]
        for candidate in index_candidates:
            if candidate.exists():
                with open(candidate, 'r', encoding='utf-8') as f:
                    return HttpResponse(f.read(), content_type='text/html')
        return JsonResponse({'message': 'index.html not found.'}, status=404)
