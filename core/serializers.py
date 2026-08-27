from rest_framework import serializers
from .models import Empresa, Contacto, Proyecto


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

    class Meta:
        model = Contacto
        fields = [
            'id',
            'nombre_completo',
            'telefono',
            'email',
            'rol',
            'empresa',
            'empresa_nombre',
            'tipo_persona',
            'tipo_relacion',
            'canal_entrada',
            'pulso_vital',
            'fase_red',
            'notas',
            'is_active',
            'created_at',
            'updated_at'
        ]


class ProyectoSerializer(serializers.ModelSerializer):
    empresa_nombre = serializers.CharField(source='empresa.nombre', read_only=True)
    contacto_nombre = serializers.CharField(source='contacto.nombre_completo', read_only=True)
    probabilidad = serializers.FloatField(read_only=True)
    monto_ponderado = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Proyecto
        fields = [
            'id',
            'titulo',
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
