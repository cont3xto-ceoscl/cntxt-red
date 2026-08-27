from django.contrib import admin
from .models import Empresa, Contacto, Proyecto


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'sector', 'nit', 'ciudad', 'sitio_web', 'created_at')
    search_fields = ('nombre', 'sector', 'nit', 'ciudad')
    list_filter = ('sector', 'ciudad')
    ordering = ('nombre',)


@admin.register(Contacto)
class ContactoAdmin(admin.ModelAdmin):
    list_display = (
        'nombre_completo', 
        'empresa', 
        'rol', 
        'telefono', 
        'email', 
        'fase_red', 
        'pulso_vital', 
        'tipo_relacion', 
        'tipo_persona', 
        'canal_entrada',
        'is_active'
    )
    search_fields = ('nombre_completo', 'email', 'telefono', 'empresa__nombre', 'rol')
    list_filter = ('fase_red', 'pulso_vital', 'tipo_relacion', 'tipo_persona', 'canal_entrada', 'is_active')
    autocomplete_fields = ('empresa',)
    ordering = ('nombre_completo',)


@admin.register(Proyecto)
class ProyectoAdmin(admin.ModelAdmin):
    list_display = (
        'titulo', 
        'empresa', 
        'contacto', 
        'estado', 
        'monto_proyectado', 
        'linea_operativa', 
        'categoria',
        'fecha_limite',
        'created_at'
    )
    search_fields = ('titulo', 'empresa__nombre', 'contacto__nombre_completo')
    list_filter = ('estado', 'linea_operativa', 'categoria', 'created_at')
    autocomplete_fields = ('empresa', 'contacto')
    ordering = ('-created_at',)
