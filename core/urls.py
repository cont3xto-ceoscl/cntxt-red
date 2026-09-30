from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    EmpresaViewSet,
    ContactoViewSet,
    ProyectoViewSet,
    PulsoRelacionalViewSet,
    ActividadViewSet,
    LoginView,
    LogoutView,
    MeView,
    DashboardStatsView,
    InitialDataView,
    SystemStatusView,
    LegacyFrontendView,
)

app_name = 'core'

router = DefaultRouter()
# Recursos principales del CRM
router.register(r'empresas', EmpresaViewSet, basename='empresa')
router.register(r'contactos', ContactoViewSet, basename='contacto')
router.register(r'proyectos', ProyectoViewSet, basename='proyecto')
router.register(r'pulso-relacional', PulsoRelacionalViewSet, basename='pulso_relacional')
router.register(r'actividades', ActividadViewSet, basename='actividad')

urlpatterns = [
    # Frontend SPA entrypoint
    path('', LegacyFrontendView.as_view(), name='home'),

    # REST API — recursos del CRM
    path('api/', include(router.urls)),

    # Auth JWT
    path('api/auth/login/', LoginView.as_view(), name='auth_login'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth_logout'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='auth_refresh'),
    path('api/auth/me/', MeView.as_view(), name='auth_me'),

    # Dashboard & Utilitarios
    path('api/dashboard/stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('api/initial-data/', InitialDataView.as_view(), name='initial_data'),
    path('api/status/', SystemStatusView.as_view(), name='system_status'),
]

