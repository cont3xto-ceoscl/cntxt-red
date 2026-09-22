from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import Empresa, Contacto, Proyecto, PerfilUsuario, PulsoRelacional, Actividad


# ─────────────────────────────────────────────────────────────
# Inline: PerfilUsuario en la vista de User
# ─────────────────────────────────────────────────────────────

class PerfilUsuarioInline(admin.StackedInline):
    model = PerfilUsuario
    can_delete = False
    verbose_name_plural = 'Perfil CNTXT'
    fields = ['rol', 'telefono', 'avatar']


class UserAdmin(BaseUserAdmin):
    inlines = [PerfilUsuarioInline]
    list_display = ['username', 'email', 'first_name', 'last_name', 'get_rol', 'is_active']
    list_filter = ['is_active', 'is_staff', 'perfil__rol']

    def get_rol(self, obj):
        try:
            return obj.perfil.get_rol_display()
        except Exception:
            return '—'
    get_rol.short_description = 'Rol CNTXT'


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


# ─────────────────────────────────────────────────────────────
# CRM Models
# ─────────────────────────────────────────────────────────────

@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'sector', 'ciudad', 'nit', 'contactos_count', 'proyectos_count', 'created_at']
    search_fields = ['nombre', 'sector', 'nit', 'ciudad']
    list_filter = ['sector', 'ciudad']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['nombre']

    def contactos_count(self, obj):
        return obj.contactos.count()
    contactos_count.short_description = 'Contactos'

    def proyectos_count(self, obj):
        return obj.proyectos.count()
    proyectos_count.short_description = 'Proyectos'


@admin.register(Contacto)
class ContactoAdmin(admin.ModelAdmin):
    list_display = ['nombre_completo', 'empresa', 'tipo_relacion', 'pulso_vital', 'fase_red', 'email', 'is_active', 'created_at']
    search_fields = ['nombre_completo', 'primer_nombre', 'apellidos', 'email', 'empresa__nombre', 'rol']
    list_filter = ['tipo_relacion', 'pulso_vital', 'fase_red', 'tipo_persona', 'canal_entrada', 'is_active']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['nombre_completo']
    autocomplete_fields = ['empresa']
    list_select_related = ['empresa']


@admin.register(Proyecto)
class ProyectoAdmin(admin.ModelAdmin):
    list_display = ['titulo', 'flujo', 'empresa', 'contacto', 'estado', 'monto_proyectado', 'probabilidad_display', 'monto_ponderado_display', 'fecha_limite']
    search_fields = ['titulo', 'empresa__nombre', 'contacto__nombre_completo', 'proximo_paso']
    list_filter = ['flujo', 'estado', 'linea_operativa', 'categoria']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']
    autocomplete_fields = ['empresa', 'contacto']
    list_select_related = ['empresa', 'contacto']

    def probabilidad_display(self, obj):
        return f'{obj.probabilidad * 100:.0f}%'
    probabilidad_display.short_description = 'Prob.'

    def monto_ponderado_display(self, obj):
        return f'${obj.monto_ponderado:,.0f}'
    monto_ponderado_display.short_description = 'Monto Pond.'


# ─────────────────────────────────────────────────────────────
# New Models Admin
# ─────────────────────────────────────────────────────────────

@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ['user', 'rol', 'telefono', 'created_at']
    list_filter = ['rol']
    search_fields = ['user__username', 'user__email', 'user__first_name', 'user__last_name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PulsoRelacional)
class PulsoRelacionalAdmin(admin.ModelAdmin):
    list_display = ['contacto', 'total_display', 'clasificacion_display', 'evaluado_por', 'created_at']
    list_filter = ['created_at']
    search_fields = ['contacto__nombre_completo', 'evaluado_por__username', 'notas']
    readonly_fields = ['created_at', 'updated_at']
    list_select_related = ['contacto', 'evaluado_por']

    def total_display(self, obj):
        return f'{float(obj.total):.1f} pts'
    total_display.short_description = 'Total'

    def clasificacion_display(self, obj):
        colors = {'P1': '🔴', 'P2': '🟡', 'P3': '🟢', 'P4': '💎'}
        return f'{colors.get(obj.clasificacion, "")} {obj.clasificacion} — {obj.clasificacion_label}'
    clasificacion_display.short_description = 'Clasificación'


@admin.register(Actividad)
class ActividadAdmin(admin.ModelAdmin):
    list_display = ['tipo', 'descripcion_corta', 'usuario', 'empresa', 'contacto', 'proyecto', 'created_at']
    list_filter = ['tipo', 'created_at']
    search_fields = ['descripcion', 'usuario__username', 'empresa__nombre', 'contacto__nombre_completo']
    readonly_fields = ['tipo', 'descripcion', 'usuario', 'empresa', 'contacto', 'proyecto', 'created_at', 'updated_at']
    list_select_related = ['usuario', 'empresa', 'contacto', 'proyecto']

    def descripcion_corta(self, obj):
        return obj.descripcion[:80] + '...' if len(obj.descripcion) > 80 else obj.descripcion
    descripcion_corta.short_description = 'Descripción'

    def has_add_permission(self, request):
        return False  # Las actividades no se crean manualmente

    def has_change_permission(self, request, obj=None):
        return False  # Solo lectura

