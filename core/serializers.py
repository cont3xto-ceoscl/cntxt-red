from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Empresa, Contacto, Proyecto, PerfilUsuario, PulsoRelacional, Actividad


# ─────────────────────────────────────────────────────────────
# Auth & Perfil Serializers
# ─────────────────────────────────────────────────────────────

class PerfilUsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfilUsuario
        fields = ['rol', 'telefono', 'avatar']


class UserSerializer(serializers.ModelSerializer):
    """Serializer del usuario autenticado con datos de perfil y rol."""
    perfil = PerfilUsuarioSerializer(read_only=True)
    nombre_completo = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email',
            'first_name', 'last_name', 'nombre_completo',
            'is_superuser', 'is_staff',
            'rol', 'perfil',
            'date_joined', 'last_login',
        ]
        read_only_fields = ['id', 'username', 'is_superuser', 'is_staff', 'date_joined', 'last_login']

    def get_nombre_completo(self, obj):
        return obj.get_full_name() or obj.username

    def get_rol(self, obj):
        try:
            return obj.perfil.rol
        except AttributeError:
            return 'growth_partner'


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer para actualizar perfil propio."""
    telefono = serializers.CharField(source='perfil.telefono', required=False, allow_blank=True)
    avatar = serializers.ImageField(source='perfil.avatar', required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'telefono', 'avatar']

    def update(self, instance, validated_data):
        perfil_data = validated_data.pop('perfil', {})
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name = validated_data.get('last_name', instance.last_name)
        instance.email = validated_data.get('email', instance.email)
        instance.save()

        if perfil_data:
            perfil, _ = PerfilUsuario.objects.get_or_create(user=instance)
            for attr, value in perfil_data.items():
                setattr(perfil, attr, value)
            perfil.save()

        return instance


# ─────────────────────────────────────────────────────────────
# Core CRM Serializers
# ─────────────────────────────────────────────────────────────

class EmpresaSerializer(serializers.ModelSerializer):
    contactos_count = serializers.IntegerField(source='contactos.count', read_only=True)
    proyectos_count = serializers.IntegerField(source='proyectos.count', read_only=True)

    class Meta:
        model = Empresa
        fields = [
            'id',
            'nombre',
            'sector',
            'nit',
            'ciudad',
            'sitio_web',
            'notas',
            'contactos_count',
            'proyectos_count',
            'created_at',
            'updated_at'
        ]


class ContactoSerializer(serializers.ModelSerializer):
    empresa_nombre = serializers.CharField(source='empresa.nombre', read_only=True)
    pulso_count = serializers.IntegerField(source='evaluaciones_pulso.count', read_only=True)
    ultimo_pulso = serializers.SerializerMethodField()

    class Meta:
        model = Contacto
        fields = [
            'id',
            'nombre_completo',
            'primer_nombre',
            'segundo_nombre',
            'apellidos',
            'telefono',
            'email',
            'ciudad',
            'pais',
            'rol',
            'empresa',
            'empresa_nombre',
            'tipo_persona',
            'tipo_relacion',
            'canal_entrada',
            'pulso_vital',
            'fase_red',
            'siguiente_accion',
            'notas',
            'is_active',
            'pulso_count',
            'ultimo_pulso',
            'created_at',
            'updated_at'
        ]

    def get_ultimo_pulso(self, obj):
        ultima = obj.evaluaciones_pulso.first()
        if ultima:
            return {
                'id': ultima.id,
                'total': float(ultima.total),
                'clasificacion': ultima.clasificacion,
                'clasificacion_label': ultima.clasificacion_label,
                'fecha': ultima.created_at.isoformat(),
            }
        return None


class ProyectoSerializer(serializers.ModelSerializer):
    empresa_nombre = serializers.CharField(source='empresa.nombre', read_only=True)
    contacto_nombre = serializers.CharField(source='contacto.nombre_completo', read_only=True)
    probabilidad = serializers.FloatField(read_only=True)
    monto_ponderado = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)
    flujo_display = serializers.CharField(source='get_flujo_display', read_only=True)

    class Meta:
        model = Proyecto
        fields = [
            'id',
            'titulo',
            'flujo',
            'flujo_display',
            'empresa',
            'empresa_nombre',
            'contacto',
            'contacto_nombre',
            'monto_proyectado',
            'monto_ponderado',
            'probabilidad',
            'estado',
            'estado_display',
            'linea_operativa',
            'categoria',
            'brief_url',
            'proposal_url',
            'proximo_paso',
            'fecha_limite',
            'notas',
            'created_at',
            'updated_at'
        ]


# ─────────────────────────────────────────────────────────────
# Pulso Relacional Serializer
# ─────────────────────────────────────────────────────────────

class PulsoRelacionalSerializer(serializers.ModelSerializer):
    contacto_nombre = serializers.CharField(source='contacto.nombre_completo', read_only=True)
    evaluado_por_nombre = serializers.SerializerMethodField()
    total = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    clasificacion = serializers.CharField(read_only=True)
    clasificacion_label = serializers.CharField(read_only=True)

    class Meta:
        model = PulsoRelacional
        fields = [
            'id',
            'contacto',
            'contacto_nombre',
            'evaluado_por',
            'evaluado_por_nombre',
            'afinidad_adn',
            'recomendar',
            'bidireccionalidad',
            'vulnerabilidad_sandler',
            'insider_cialdini',
            'mapa_de_vida',
            'total',
            'clasificacion',
            'clasificacion_label',
            'notas',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['evaluado_por', 'total', 'clasificacion', 'clasificacion_label']

    def get_evaluado_por_nombre(self, obj):
        if obj.evaluado_por:
            return obj.evaluado_por.get_full_name() or obj.evaluado_por.username
        return None

    def create(self, validated_data):
        validated_data['evaluado_por'] = self.context['request'].user
        return super().create(validated_data)


# ─────────────────────────────────────────────────────────────
# Actividad Serializer
# ─────────────────────────────────────────────────────────────

class ActividadSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.SerializerMethodField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)

    class Meta:
        model = Actividad
        fields = [
            'id',
            'tipo',
            'tipo_display',
            'descripcion',
            'usuario',
            'usuario_nombre',
            'empresa',
            'contacto',
            'proyecto',
            'created_at',
        ]
        read_only_fields = ['usuario', 'created_at']

    def get_usuario_nombre(self, obj):
        if obj.usuario:
            return obj.usuario.get_full_name() or obj.usuario.username
        return 'Sistema'

