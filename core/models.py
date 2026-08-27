from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _


class TimeStampedModel(models.Model):
    """
    Clase base abstracta que proporciona marcas de tiempo automáticas
    para creación y última modificación.
    """
    created_at = models.DateTimeField(
        auto_now_add=True, 
        verbose_name=_("Fecha de Creación")
    )
    updated_at = models.DateTimeField(
        auto_now=True, 
        verbose_name=_("Última Actualización")
    )

    class Meta:
        abstract = True


class Empresa(TimeStampedModel):
    """
    Modelo representativo de empresas, constructoras, aliados y clientes corporativos.
    Estructurado a partir del catálogo 'master_empresas' del ecosistema CNTXT.
    """
    nombre = models.CharField(
        max_length=255, 
        unique=True,
        db_index=True, 
        verbose_name=_("Nombre de la Empresa")
    )
    sector = models.CharField(
        max_length=150, 
        blank=True, 
        default="General / Comercial", 
        verbose_name=_("Sector")
    )
    nit = models.CharField(
        max_length=50, 
        blank=True, 
        default="", 
        verbose_name=_("NIT / Identificación Tributaria")
    )
    ciudad = models.CharField(
        max_length=100, 
        blank=True, 
        default="", 
        verbose_name=_("Ciudad")
    )
    sitio_web = models.CharField(
        max_length=255, 
        blank=True, 
        default="", 
        verbose_name=_("Sitio Web")
    )
    notas = models.TextField(
        blank=True, 
        default="", 
        verbose_name=_("Notas")
    )

    class Meta:
        verbose_name = _("Empresa")
        verbose_name_plural = _("Empresas")
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Contacto(TimeStampedModel):
    """
    Modelo de Contacto con todas las clasificaciones operativas R.E.D.
    (Tipo de Persona, Tipo de Relación, Canal de Entrada, Pulso Vital y Fase).
    """

    class TipoPersona(models.TextChoices):
        NATURAL = 'natural', _('Persona Natural')
        JURIDICA = 'juridica', _('Persona Jurídica')

    class TipoRelacion(models.TextChoices):
        PROSPECTO = 'prospecto', _('Prospecto / Lead')
        CLIENTE_BRONZE = 'cliente_bronze', _('Cliente Bronze')
        CLIENTE_SILVER = 'cliente_silver', _('Cliente Silver')
        CLIENTE_GOLD = 'cliente_gold', _('Cliente Gold')
        CLIENTE_PLATINUM = 'cliente_platinum', _('Cliente Platinum')
        ALIADO = 'aliado', _('Aliado Estratégico')
        PROVEEDOR = 'proveedor', _('Proveedor')
        INTERNO = 'interno', _('Equipo Interno / CNTXT')
        OTRO = 'otro', _('Otro')

    class CanalEntrada(models.TextChoices):
        REFERIDO = 'referido', _('Referido / Recomendación')
        WHATSAPP = 'whatsapp', _('WhatsApp Directo')
        INSTAGRAM = 'instagram', _('Instagram')
        LINKEDIN = 'linkedin', _('LinkedIn')
        FERIA_EVENTO = 'feria_evento', _('Feria / Evento Comercial')
        WEB = 'web', _('Sitio Web')
        DIRECTO = 'directo', _('Contacto Directo / Networking')
        OTRO = 'otro', _('Otro')

    class PulsoVital(models.IntegerChoices):
        PULSO_1 = 1, _('1 - Pulso Bajo / En Frío')
        PULSO_2 = 2, _('2 - Pulso Estable / Tibio')
        PULSO_3 = 3, _('3 - Pulso Activo / Caliente')
        PULSO_4 = 4, _('4 - Pulso Vital / Máxima Prioridad')

    class FaseRED(models.TextChoices):
        FASE_R = 'R', _('R - Relación / Reconocimiento')
        FASE_D = 'D', _('D - Desarrollo / Decisión')
        FASE_E = 'E', _('E - Estructuración / Ejecución')

    # Datos Principales
    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contactos',
        verbose_name=_("Empresa")
    )
    nombre_completo = models.CharField(
        max_length=255, 
        db_index=True, 
        verbose_name=_("Nombre Completo")
    )
    telefono = models.CharField(
        max_length=50, 
        blank=True, 
        default="", 
        verbose_name=_("Teléfono / Celular")
    )
    email = models.EmailField(
        blank=True, 
        default="", 
        verbose_name=_("Correo Electrónico")
    )
    rol = models.CharField(
        max_length=150, 
        blank=True, 
        default="", 
        verbose_name=_("Cargo / Rol")
    )

    # Clasificaciones R.E.D.
    tipo_persona = models.CharField(
        max_length=20,
        choices=TipoPersona.choices,
        default=TipoPersona.NATURAL,
        blank=True,
        verbose_name=_("Tipo de Persona")
    )
    tipo_relacion = models.CharField(
        max_length=30,
        choices=TipoRelacion.choices,
        default=TipoRelacion.PROSPECTO,
        blank=True,
        verbose_name=_("Tipo de Relación")
    )
    canal_entrada = models.CharField(
        max_length=30,
        choices=CanalEntrada.choices,
        default=CanalEntrada.DIRECTO,
        blank=True,
        verbose_name=_("Canal de Entrada")
    )
    pulso_vital = models.PositiveSmallIntegerField(
        choices=PulsoVital.choices,
        default=PulsoVital.PULSO_1,
        validators=[MinValueValidator(1), MaxValueValidator(4)],
        verbose_name=_("Pulso Vital (1 al 4)"),
        help_text=_("Nivel de calor/pulso vital del contacto (1 al 4)")
    )
    fase_red = models.CharField(
        max_length=1,
        choices=FaseRED.choices,
        default=FaseRED.FASE_R,
        verbose_name=_("Fase R.E.D. (R, D, E)")
    )

    notas = models.TextField(
        blank=True, 
        default="", 
        verbose_name=_("Notas")
    )
    is_active = models.BooleanField(
        default=True, 
        verbose_name=_("Activo")
    )

    class Meta:
        verbose_name = _("Contacto")
        verbose_name_plural = _("Contactos")
        ordering = ['nombre_completo']

    def __str__(self):
        if self.empresa:
            return f"{self.nombre_completo} ({self.empresa.nombre})"
        return self.nombre_completo


class Proyecto(TimeStampedModel):
    """
    Modelo de Proyecto / Oportunidad en el Pipeline R.E.D.
    Integra estados del embudo de conversión y campos de clasificación C.O.R.
    """

    class Estado(models.TextChoices):
        MQL = 'mql', _('🩸 MQL | Plasma (10%)')
        CONVERSACION = 'conversacion', _('💓 1ra Conversación (20%)')
        SQL = 'sql', _('🔬 SQL | Válvula (40%)')
        PROPUESTA = 'propuesta', _('⚡ Propuesta Presentada (60%)')
        NEGOCIACION = 'negociacion', _('🫀 En Negociación (80%)')
        EJECUCION = 'ejecucion', _('🧬 Tejido Consolidado (100%)')
        PAUSA = 'pausa', _('⏸️ Estasis / Pausa (0%)')

    class LineaOperativa(models.TextChoices):
        LO_01 = 'cor_lo_01', _('C.O.R. | LO. 0.1. Estructuración y Gerencia')
        LO_02 = 'cor_lo_02', _('C.O.R. | L.O. 02. Diseño Arquitectónico')
        LO_03 = 'cor_lo_03', _('C.O.R. | L.O. 03. Visualización Arquitectónica')
        LO_04 = 'cor_lo_04', _('C.O.R. | L.O. 04. Tecnología y Ux')
        LO_05 = 'cor_lo_05', _('C.O.R. | L.O. 05. Gestión Urbana')
        LO_06 = 'cor_lo_06', _('C.O.R. | L.O. 06. Construcción de Proyectos')
        LO_07 = 'cor_lo_07', _('C.O.R. | L.O. 07. Educación y Formación')

    class Categoria(models.TextChoices):
        CAT_01 = 'cor_cat_01', _('C.O.R. | 01. Parcelaciones y Condominios')
        CAT_02 = 'cor_cat_02', _('C.O.R. | 02. Edificación en Altura')
        CAT_03 = 'cor_cat_03', _('C.O.R. | 03. Vivienda Campestre')
        CAT_04 = 'cor_cat_04', _('C.O.R. | 04. Comercial')
        CAT_08 = 'cor_cat_08', _('C.O.R. | 08. Hotelería y Hospitality')

    # Relaciones y Datos Principales
    titulo = models.CharField(
        max_length=255, 
        db_index=True, 
        verbose_name=_("Título del Proyecto")
    )
    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='proyectos',
        verbose_name=_("Empresa")
    )
    contacto = models.ForeignKey(
        Contacto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='proyectos',
        verbose_name=_("Contacto Principal")
    )

    # Métricas Financieras y Estado
    monto_proyectado = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        default=Decimal('0.00'), 
        verbose_name=_("Monto Proyectado ($)")
    )
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.MQL,
        db_index=True,
        verbose_name=_("Estado del Pipeline")
    )

    # Campos C.O.R.
    linea_operativa = models.CharField(
        max_length=50,
        choices=LineaOperativa.choices,
        blank=True,
        default="",
        verbose_name=_("Línea Operativa (C.O.R.)")
    )
    categoria = models.CharField(
        max_length=50,
        choices=Categoria.choices,
        blank=True,
        default="",
        verbose_name=_("Categoría (C.O.R.)")
    )
    brief_url = models.CharField(
        max_length=500,
        blank=True,
        default="",
        verbose_name=_("Link del Brief")
    )
    proposal_url = models.CharField(
        max_length=500,
        blank=True,
        default="",
        verbose_name=_("Link de la Propuesta")
    )

    # Campos Operativos Adicionales
    proximo_paso = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name=_("Próximo Paso / Next Step")
    )
    fecha_limite = models.DateField(
        null=True,
        blank=True,
        verbose_name=_("Fecha Límite / Due Date")
    )
    notas = models.TextField(
        blank=True,
        default="",
        verbose_name=_("Notas")
    )

    class Meta:
        verbose_name = _("Proyecto")
        verbose_name_plural = _("Proyectos")
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.titulo} - {self.get_estado_display()}"

    @property
    def probabilidad(self) -> float:
        """Retorna la probabilidad según el estado en el embudo."""
        prob_map = {
            self.Estado.MQL: 0.10,
            self.Estado.CONVERSACION: 0.20,
            self.Estado.SQL: 0.40,
            self.Estado.PROPUESTA: 0.60,
            self.Estado.NEGOCIACION: 0.80,
            self.Estado.EJECUCION: 1.00,
            self.Estado.PAUSA: 0.00,
        }
        return prob_map.get(self.estado, 0.00)

    @property
    def monto_ponderado(self) -> Decimal:
        """Calcula el valor ponderado en función de la probabilidad."""
        return self.monto_proyectado * Decimal(str(self.probabilidad))
