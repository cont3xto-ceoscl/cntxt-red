from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EmpresaViewSet, 
    ContactoViewSet, 
    ProyectoViewSet, 
    InitialDataView, 
    SystemStatusView, 
    LegacyFrontendView
)

app_name = 'core'

router = DefaultRouter()
# Rutas principales (plural)
router.register(r'empresas', EmpresaViewSet, basename='empresa')
router.register(r'contactos', ContactoViewSet, basename='contacto')
router.register(r'proyectos', ProyectoViewSet, basename='proyecto')

# Alias adicionales (singular) para compatibilidad
router.register(r'empresa', EmpresaViewSet, basename='empresa_singular')
router.register(r'contacto', ContactoViewSet, basename='contacto_singular')
router.register(r'proyecto', ProyectoViewSet, basename='proyecto_singular')

urlpatterns = [
    # Frontend SPA entrypoint
    path('', LegacyFrontendView.as_view(), name='home'),
    
    # REST API endpoints
    path('api/', include(router.urls)),
    path('api/initial-data/', InitialDataView.as_view(), name='initial_data'),
    path('api/status/', SystemStatusView.as_view(), name='system_status'),
]
