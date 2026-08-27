import json
from pathlib import Path
from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.views import View
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Empresa, Contacto, Proyecto
from .serializers import EmpresaSerializer, ContactoSerializer, ProyectoSerializer


class EmpresaViewSet(viewsets.ModelViewSet):
    """
    CRUD completo para el modelo Empresa con búsqueda y ordenamiento.
    """
    queryset = Empresa.objects.all()
    serializer_class = EmpresaSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'sector', 'nit', 'ciudad']
    ordering_fields = ['nombre', 'created_at', 'sector']
    ordering = ['nombre']


class ContactoViewSet(viewsets.ModelViewSet):
    """
    CRUD completo para el modelo Contacto con filtros R.E.D.
    """
    queryset = Contacto.objects.select_related('empresa').all()
    serializer_class = ContactoSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre_completo', 'email', 'telefono', 'rol', 'empresa__nombre']
    ordering_fields = ['nombre_completo', 'pulso_vital', 'fase_red', 'created_at']
    ordering = ['nombre_completo']

    def get_queryset(self):
        queryset = super().get_queryset()
        fase = self.request.query_params.get('fase')
        pulso = self.request.query_params.get('pulso')
        relacion = self.request.query_params.get('relacion')
        empresa_id = self.request.query_params.get('empresa')

        if fase:
            queryset = queryset.filter(fase_red=fase.upper())
        if pulso:
            queryset = queryset.filter(pulso_vital=pulso)
        if relacion:
            queryset = queryset.filter(tipo_relacion=relacion)
        if empresa_id:
            queryset = queryset.filter(empresa_id=empresa_id)

        return queryset


class ProyectoViewSet(viewsets.ModelViewSet):
    """
    CRUD completo para el modelo Proyecto con filtros por estado de Pipeline y C.O.R.
    """
    queryset = Proyecto.objects.select_related('empresa', 'contacto').all()
    serializer_class = ProyectoSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['titulo', 'empresa__nombre', 'contacto__nombre_completo', 'proximo_paso']
    ordering_fields = ['created_at', 'monto_proyectado', 'estado', 'fecha_limite']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        estado = self.request.query_params.get('estado')
        linea = self.request.query_params.get('linea')
        categoria = self.request.query_params.get('categoria')

        if estado:
            queryset = queryset.filter(estado=estado)
        if linea:
            queryset = queryset.filter(linea_operativa=linea)
        if categoria:
            queryset = queryset.filter(categoria=categoria)

        return queryset


class InitialDataView(APIView):
    """
    Endpoint consolidado para carga inicial rápida de la aplicación.
    Devuelve empresas, contactos y proyectos en una única solicitud.
    """
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
