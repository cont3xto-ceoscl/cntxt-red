from django.views.generic import RedirectView
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
    TasksAppView,
    EcosystemPortalView,
    NeoUnifiedView,
    ChecklistProjectViewSet,
    ChecklistSystemViewSet,
    TasksTeamMemberViewSet,
    TasksSyncView,
)

app_name = 'core'

router = DefaultRouter()
# Recursos principales del CRM
router.register(r'empresas', EmpresaViewSet, basename='empresa')
router.register(r'contactos', ContactoViewSet, basename='contacto')
router.register(r'proyectos', ProyectoViewSet, basename='proyecto')
router.register(r'pulso-relacional', PulsoRelacionalViewSet, basename='pulso_relacional')
router.register(r'actividades', ActividadViewSet, basename='actividad')
# Checklist & Tasks Engine
router.register(r'tasks/systems', ChecklistSystemViewSet, basename='tasks_system')
router.register(r'tasks/projects', ChecklistProjectViewSet, basename='tasks_project')
router.register(r'tasks/team-members', TasksTeamMemberViewSet, basename='tasks_team_member')

urlpatterns = [
    # Portal Raíz del Ecosistema CNTXT
    path('', EcosystemPortalView.as_view(), name='ecosystem_home'),

    # Portal R.E.D. (Relaciones Estratégicas y Dinámica Comercial)
    path('red/', LegacyFrontendView.as_view(), name='red_portal'),
    path('red', RedirectView.as_view(url='/red/', permanent=False)),

    # N.E.O. Hub Unificado (OKRs + Tasks)
    path('NEO/', NeoUnifiedView.as_view(), name='neo_portal'),
    path('NEO', RedirectView.as_view(url='/NEO/', permanent=False)),
    path('neo/', NeoUnifiedView.as_view(), name='neo_portal_lower'),
    path('neo', RedirectView.as_view(url='/NEO/', permanent=False)),

    # CNTXT Tasks App (acceso directo)
    path('tasks/', TasksAppView.as_view(), name='tasks_app'),
    path('tasks', RedirectView.as_view(url='/tasks/', permanent=False)),

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
    # Sync multi-dispositivo Tasks
    path('api/tasks/sync/', TasksSyncView.as_view(), name='tasks_sync'),
]
