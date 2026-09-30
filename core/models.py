from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from django.db.models.signals import post_save
from django.dispatch import receiver


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
        B2C = 'b2c', _('Persona Natural (B2C)')
        B2B = 'b2b', _('Persona Jurídica (B2B)')

    class TipoRelacion(models.TextChoices):
        PROSPECTO      = 'prospecto',       _('Prospecto')
        LEAD           = 'lead',            _('Lead / Prospecto')
        GROWTH         = 'growth',          _('Growth Partner')
        CLIENTE_BLACK  = 'cliente_black',   _('Cliente Black')
        CLIENTE_GOLD   = 'cliente_gold',    _('Cliente Gold')
        CLIENTE_SILVER = 'cliente_silver',  _('Cliente Silver')
        CLIENTE_BRONZE = 'cliente_bronze',  _('Cliente Bronze')
        EMBAJADOR      = 'embajador',       _('Embajador de Marca')
        ALIADO         = 'aliado',          _('Aliado Estratégico')
        ALIADOS        = 'aliados',         _('Aliados Estratégicos')
        PROVEEDOR      = 'proveedor',       _('Proveedor')
        INTERNO        = 'interno',         _('Equipo Interno / CNTXT')
        EQUIPO         = 'equipo',          _('Equipo CNTXT')
        MEDIA          = 'media',           _('Media & Influencers')
        SERVICIOS_CLAVES = 'servicios_claves', _('Servicios Claves')
        SERVICIOS_AUX  = 'servicios_aux',   _('Servicios Auxiliares')
        CANDIDATOS     = 'candidatos',      _('Candidatos y Talento')
        MENTORES       = 'mentores',        _('Mentores y Asesores')
        OTRO           = 'otro',            _('Otro')

    class CanalEntrada(models.TextChoices):
        REFERIDO = 'referido', _('Referido / Recomendación')
        REFERIDOS = 'referidos', _('Referidos')
        WHATSAPP = 'whatsapp', _('WhatsApp Directo')
        INSTAGRAM = 'instagram', _('Instagram')
        LINKEDIN = 'linkedin', _('LinkedIn')
        FERIA_EVENTO = 'feria_evento', _('Feria / Evento Comercial')
        FERIAS = 'ferias', _('Ferias o Activaciones')
        WEB = 'web', _('Sitio Web')
        DIRECTO = 'directo', _('Contacto Directo / Networking')
        PROSPECCION = 'prospeccion', _('Prospección Activa')
        OFICINAS = 'oficinas', _('Oficinas CNTXT')
        CAPITAL = 'capital', _('Capital Relacional')
        FB = 'fb', _('Media | Facebook')
        IG = 'ig', _('Media | Instagram')
        GG = 'gg', _('Media | Google')
        GMAPS = 'gmaps', _('Media | Google Maps')
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
    primer_nombre = models.CharField(
        max_length=100,
        blank=True,
        default="",
        verbose_name=_("Primer Nombre")
    )
    segundo_nombre = models.CharField(
        max_length=100,
        blank=True,
        default="",
        verbose_name=_("Segundo Nombre")
    )
    apellidos = models.CharField(
        max_length=150,
        blank=True,
        default="",
        verbose_name=_("Apellidos")
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
    ciudad = models.CharField(
        max_length=150,
        blank=True,
        default="",
        verbose_name=_("Ciudad")
    )
    pais = models.CharField(
        max_length=100,
        blank=True,
        default="Colombia",
        verbose_name=_("País")
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

    siguiente_accion = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name=_("Siguiente Acción / Próximo Paso")
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

    class Flujo(models.TextChoices):
        B2B = 'b2b', _('Flujo de Proyectos MADE B2B')
        B2C = 'b2c', _('Proyectos MADE B2C')
        SELECT = 'select', _('Proyectos SELECT')
        SHOWROOM = 'showroom', _('ShowRoom CNTXT')

    class Estado(models.TextChoices):
        # 1. B2B (Principal)
        MQL = 'mql', _('🩸 MQL | Plasma (10%)')
        CONVERSACION = 'conversacion', _('💓 1ra Conversación (20%)')
        SQL = 'sql', _('🔬 SQL | Válvula (40%)')
        PROPUESTA = 'propuesta', _('⚡ Propuesta Presentada (60%)')
        NEGOCIACION = 'negociacion', _('🫀 En Negociación (80%)')
        EJECUCION = 'ejecucion', _('🧬 Tejido Consolidado (100%)')
        PAUSA = 'pausa', _('⏸️ Estasis / Pausa (0%)')

        # 2. B2C (Vivienda Campestre & Reformas Familiares)
        B2C_SUENO = 'b2c_sueno', _('🏡 Sueño Familiar | MQL (10%)')
        B2C_VISITA = 'b2c_visita', _('🌿 Visita a Lote / Entrevista (20%)')
        B2C_ANTEPROYECTO = 'b2c_anteproyecto', _('📐 Diagnóstico & Concepto (40%)')
        B2C_PROPUESTA = 'b2c_propuesta', _('✨ Propuesta de Diseño (60%)')
        B2C_ACUERDO = 'b2c_acuerdo', _('🤝 Decisión Familiar (80%)')
        B2C_OBRA = 'b2c_obra', _('🏗️ Hogar en Construcción (100%)')
        B2C_PAUSA = 'b2c_pausa', _('⏸️ Proyecto en Pausa (0%)')

        # 3. SELECT (Catálogo Rápido <= 15 días, 5M, 7M, 10M COP)
        SEL_LEAD = 'sel_lead', _('⚡ Lead Catálogo (15%)')
        SEL_SELECCION = 'sel_seleccion', _('📋 Selección Modelo (35%)')
        SEL_COTIZACION = 'sel_cotizacion', _('📑 Orden & Paquete (60%)')
        SEL_CIERRE = 'sel_cierre', _('🚀 Compra & Entrega (100%)')
        SEL_PAUSA = 'sel_pausa', _('⏸️ Descartado / Pausa (0%)')

        # 4. SHOWROOM CNTXT (Comercialización Inmobiliaria)
        SHW_PROSPECTO = 'shw_prospecto', _('🎯 Prospecto Interesado (10%)')
        SHW_EXPERIENCIA = 'shw_experiencia', _('🏛️ Visita / Recorrido (25%)')
        SHW_SEPARACION = 'shw_separacion', _('🔒 Separación de Unidad (50%)')
        SHW_PROMESA = 'shw_promesa', _('✍️ Promesa Compraventa (75%)')
        SHW_ESCRITURA = 'shw_escritura', _('🔑 Escrituración & Entrega (100%)')
        SHW_DESISTIDO = 'shw_desistido', _('⏸️ Desistido / Pausa (0%)')

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
    flujo = models.CharField(
        max_length=20,
        choices=Flujo.choices,
        default=Flujo.B2B,
        db_index=True,
        verbose_name=_("Flujo de Proyecto")
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
        max_length=50,
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
            # 1. B2B
            self.Estado.MQL: 0.10,
            self.Estado.CONVERSACION: 0.20,
            self.Estado.SQL: 0.40,
            self.Estado.PROPUESTA: 0.60,
            self.Estado.NEGOCIACION: 0.80,
            self.Estado.EJECUCION: 1.00,
            self.Estado.PAUSA: 0.00,

            # 2. B2C
            self.Estado.B2C_SUENO: 0.10,
            self.Estado.B2C_VISITA: 0.20,
            self.Estado.B2C_ANTEPROYECTO: 0.40,
            self.Estado.B2C_PROPUESTA: 0.60,
            self.Estado.B2C_ACUERDO: 0.80,
            self.Estado.B2C_OBRA: 1.00,
            self.Estado.B2C_PAUSA: 0.00,

            # 3. SELECT
            self.Estado.SEL_LEAD: 0.15,
            self.Estado.SEL_SELECCION: 0.35,
            self.Estado.SEL_COTIZACION: 0.60,
            self.Estado.SEL_CIERRE: 1.00,
            self.Estado.SEL_PAUSA: 0.00,

            # 4. SHOWROOM CNTXT
            self.Estado.SHW_PROSPECTO: 0.10,
            self.Estado.SHW_EXPERIENCIA: 0.25,
            self.Estado.SHW_SEPARACION: 0.50,
            self.Estado.SHW_PROMESA: 0.75,
            self.Estado.SHW_ESCRITURA: 1.00,
            self.Estado.SHW_DESISTIDO: 0.00,
        }
        return prob_map.get(self.estado, 0.00)

    @property
    def monto_ponderado(self) -> Decimal:
        """Calcula el valor ponderado en función de la probabilidad."""
        return self.monto_proyectado * Decimal(str(self.probabilidad))


# ─────────────────────────────────────────────────────────────
# NUEVOS MODELOS: Auth RBAC + Pulso Relacional + Actividad
# ─────────────────────────────────────────────────────────────

class PerfilUsuario(TimeStampedModel):
    """
    Extiende el User de Django con rol RBAC y datos de perfil CNTXT.
    Se crea automáticamente al crear un nuevo User vía señal post_save.
    """

    class Rol(models.TextChoices):
        SUPERADMIN      = 'superadmin',      _('Superadmin')
        CEO_COO         = 'ceo_coo',         _('CEO / COO')
        COORDINADORA    = 'coordinadora',    _('Coordinadora')
        DIRECTOR        = 'director',        _('Director')
        GROWTH_PARTNER  = 'growth_partner',  _('Growth Partner')

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='perfil',
        verbose_name=_("Usuario")
    )
    rol = models.CharField(
        max_length=30,
        choices=Rol.choices,
        default=Rol.GROWTH_PARTNER,
        verbose_name=_("Rol en el Sistema")
    )
    telefono = models.CharField(
        max_length=50,
        blank=True,
        default='',
        verbose_name=_("Teléfono")
    )
    avatar = models.ImageField(
        upload_to='avatars/',
        null=True,
        blank=True,
        verbose_name=_("Foto de Perfil")
    )

    class Meta:
        verbose_name = _("Perfil de Usuario")
        verbose_name_plural = _("Perfiles de Usuarios")

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} [{self.get_rol_display()}]"


@receiver(post_save, sender=User)
def crear_perfil_usuario(sender, instance, created, **kwargs):
    """Crea automáticamente un PerfilUsuario al crear un nuevo User."""
    if created:
        PerfilUsuario.objects.get_or_create(user=instance)


@receiver(post_save, sender=User)
def guardar_perfil_usuario(sender, instance, **kwargs):
    """Guarda el perfil al guardar el User."""
    if hasattr(instance, 'perfil'):
        instance.perfil.save()


class PulsoRelacional(TimeStampedModel):
    """
    Matriz de Intensidad Relacional — 100 puntos distribuidos en 6 pilares CNTXT.

    Clasificación automática:
      P1: Sin Pulso    (0-25 pts)
      P2: Pulso Débil  (26-50 pts)
      P3: Pulso Medio  (51-75 pts)
      P4: Pulso Vital  (76-100 pts)
    """
    contacto = models.ForeignKey(
        Contacto,
        on_delete=models.CASCADE,
        related_name='evaluaciones_pulso',
        verbose_name=_("Contacto Evaluado")
    )
    evaluado_por = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evaluaciones_realizadas',
        verbose_name=_("Evaluado Por")
    )

    # Pilar 1 — Afinidad ADN (máx 25 pts)
    afinidad_adn = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('25'))],
        verbose_name=_("Afinidad ADN (0-25)")
    )
    # Pilar 2 — Recomendar / Advocacy (máx 25 pts)
    recomendar = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('25'))],
        verbose_name=_("Recomendar / Advocacy (0-25)")
    )
    # Pilar 3 — Bidireccionalidad (máx 20 pts)
    bidireccionalidad = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('20'))],
        verbose_name=_("Bidireccionalidad (0-20)")
    )
    # Pilar 4 — Vulnerabilidad Sandler (máx 10 pts)
    vulnerabilidad_sandler = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('10'))],
        verbose_name=_("Vulnerabilidad Sandler (0-10)")
    )
    # Pilar 5 — Insider Cialdini / Comunidad (máx 10 pts)
    insider_cialdini = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('10'))],
        verbose_name=_("Insider Cialdini / Comunidad (0-10)")
    )
    # Pilar 6 — Mapa de Vida / Claridad (máx 10 pts)
    mapa_de_vida = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('10'))],
        verbose_name=_("Mapa de Vida / Claridad (0-10)")
    )
    notas = models.TextField(
        blank=True,
        default='',
        verbose_name=_("Notas de la Evaluación")
    )

    class Meta:
        verbose_name = _("Pulso Relacional")
        verbose_name_plural = _("Pulsos Relacionales")
        ordering = ['-created_at']

    def __str__(self):
        return f"Pulso de {self.contacto} — {self.total:.1f} pts ({self.clasificacion})"

    @property
    def total(self) -> Decimal:
        """Suma total de los 6 pilares (0-100)."""
        return (
            self.afinidad_adn +
            self.recomendar +
            self.bidireccionalidad +
            self.vulnerabilidad_sandler +
            self.insider_cialdini +
            self.mapa_de_vida
        )

    @property
    def clasificacion(self) -> str:
        """Clasifica el pulso según el puntaje total."""
        total = float(self.total)
        if total <= 25:
            return 'P1'
        elif total <= 50:
            return 'P2'
        elif total <= 75:
            return 'P3'
        else:
            return 'P4'

    @property
    def clasificacion_label(self) -> str:
        """Retorna la etiqueta descriptiva de la clasificación."""
        labels = {
            'P1': 'Sin Pulso',
            'P2': 'Pulso Débil',
            'P3': 'Pulso Medio',
            'P4': 'Pulso Vital',
        }
        return labels.get(self.clasificacion, 'Sin Clasificar')


class Actividad(TimeStampedModel):
    """
    Registro de actividades del sistema (feed de historial).
    Se crea automáticamente desde los ViewSets al realizar acciones CRUD.
    """

    class TipoActividad(models.TextChoices):
        CONTACTO_CREADO     = 'contacto_creado',     _('Contacto Creado')
        CONTACTO_EDITADO    = 'contacto_editado',    _('Contacto Editado')
        CONTACTO_ELIMINADO  = 'contacto_eliminado',  _('Contacto Eliminado')
        EMPRESA_CREADA      = 'empresa_creada',      _('Empresa Creada')
        EMPRESA_EDITADA     = 'empresa_editada',     _('Empresa Editada')
        EMPRESA_ELIMINADA   = 'empresa_eliminada',   _('Empresa Eliminada')
        PROYECTO_CREADO     = 'proyecto_creado',     _('Proyecto Creado')
        PROYECTO_EDITADO    = 'proyecto_editado',    _('Proyecto Editado')
        PROYECTO_ELIMINADO  = 'proyecto_eliminado',  _('Proyecto Eliminado')
        PULSO_EVALUADO      = 'pulso_evaluado',      _('Pulso Relacional Evaluado')
        ESTADO_CAMBIADO     = 'estado_cambiado',     _('Estado de Proyecto Cambiado')
        LOGIN               = 'login',               _('Inicio de Sesión')
        OTRO                = 'otro',                _('Otra Actividad')

    tipo = models.CharField(
        max_length=30,
        choices=TipoActividad.choices,
        default=TipoActividad.OTRO,
        db_index=True,
        verbose_name=_("Tipo de Actividad")
    )
    descripcion = models.TextField(
        verbose_name=_("Descripción")
    )
    usuario = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actividades',
        verbose_name=_("Usuario")
    )
    empresa = models.ForeignKey(
        Empresa,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actividades',
        verbose_name=_("Empresa Relacionada")
    )
    contacto = models.ForeignKey(
        Contacto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actividades',
        verbose_name=_("Contacto Relacionado")
    )
    proyecto = models.ForeignKey(
        Proyecto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actividades',
        verbose_name=_("Proyecto Relacionado")
    )

    class Meta:
        verbose_name = _("Actividad")
        verbose_name_plural = _("Actividades")
        ordering = ['-created_at']

    def __str__(self):
        usuario_str = self.usuario.get_full_name() or self.usuario.username if self.usuario else 'Sistema'
        return f"[{self.get_tipo_display()}] {usuario_str} — {self.created_at.strftime('%d/%m/%Y %H:%M')}"
