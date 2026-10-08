from django.conf import settings
from django.db import models
from django.utils import timezone


def _pct(current, target, baseline=0):
    """% de avance, recortado a [0, 100]. Mide el recorrido entre baseline y
    target, no el valor absoluto — así una meta de bajar (incluso a negativo)
    también se puede medir como avance. baseline == target -> 0 (evita
    división por cero)."""
    span = target - baseline
    if not span:
        return 0
    return max(0, min(100, round((current - baseline) / span * 100)))


class Line(models.Model):
    """Una de las 6 líneas de negocio de CNTXT (NEO, IDI, RED, CASH, COR, BONS)."""

    code = models.SlugField(max_length=10, unique=True, verbose_name="Código")
    name = models.CharField(max_length=60, verbose_name="Nombre")
    full_name = models.CharField(max_length=120, blank=True, verbose_name="Nombre completo")
    color_hex = models.CharField(max_length=7, help_text="Ej. #A67C52", verbose_name="Color")
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Orden")

    class Meta:
        ordering = ["order", "code"]
        verbose_name = "Línea"
        verbose_name_plural = "Líneas"

    def __str__(self):
        return self.name


class Cycle(models.Model):
    """Un período de OKR (ej. 'Q3 2026'). Reemplaza el nombre del archivo
    como forma de agrupar objetivos por trimestre/semestre — permite
    comparar un ciclo contra el siguiente en vez de reescribir un HTML."""

    name = models.CharField(max_length=60, unique=True, verbose_name="Nombre")
    starts_on = models.DateField(verbose_name="Inicio")
    ends_on = models.DateField(verbose_name="Fin")
    is_active = models.BooleanField(default=False, verbose_name="Activo")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Creado")

    class Meta:
        ordering = ["-starts_on"]
        verbose_name = "Ciclo"
        verbose_name_plural = "Ciclos"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_active:
            Cycle.objects.exclude(pk=self.pk).update(is_active=False)


class LineCyclePlan(models.Model):
    """El plan de una línea para un ciclo dado: el párrafo de 'Cuadro de
    Mando Integral', el entregable del semestre, quién lidera, y si ya
    está definido o sigue pendiente."""

    STATUS_CHOICES = [
        ("definido", "Definido"),
        ("parcial", "Parcial"),
        ("pendiente", "Pendiente de definir"),
    ]

    line = models.ForeignKey(Line, on_delete=models.CASCADE, related_name="plans", verbose_name="Línea")
    cycle = models.ForeignKey(Cycle, on_delete=models.CASCADE, related_name="line_plans", verbose_name="Ciclo")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="pendiente", verbose_name="Estado")
    intro_text = models.TextField(blank=True, verbose_name="Introducción")
    summary_text = models.TextField(blank=True, help_text="Objetivo del ciclo", verbose_name="Objetivo del ciclo")
    deliverable = models.CharField(max_length=200, blank=True, verbose_name="Entregable")
    lead_label = models.CharField(max_length=120, blank=True, verbose_name="Líder")
    closing_quote = models.TextField(blank=True, verbose_name="Cita de cierre")
    closing_quote_label = models.CharField(max_length=120, blank=True, verbose_name="Etiqueta de la cita")

    class Meta:
        unique_together = [("line", "cycle")]
        ordering = ["line__order"]
        verbose_name = "Plan de línea"
        verbose_name_plural = "Planes de línea"

    def __str__(self):
        return f"{self.line.code} · {self.cycle.name}"

    @property
    def pct(self):
        """Promedio simple entre objetivos — el peso por objetivo ya no se
        pide ni se edita, así que no puede quedar en 0 y anular el avance
        real de un objetivo."""
        objectives = list(self.objectives.all())
        if not objectives:
            return 0
        return round(sum(o.pct for o in objectives) / len(objectives))


class Objective(models.Model):
    PRIORITY_CHOICES = [
        ("critica", "Crítica"),
        ("alta", "Alta"),
        ("media", "Media"),
        ("baja", "Baja"),
    ]

    line_cycle_plan = models.ForeignKey(
        LineCyclePlan, on_delete=models.CASCADE, related_name="objectives", verbose_name="Plan de línea"
    )
    code = models.CharField(max_length=20, help_text="Ej. O1, O.T.1", verbose_name="Código")
    title = models.CharField(max_length=300, verbose_name="Título")
    description = models.TextField(blank=True, verbose_name="Descripción")
    owner_label = models.CharField(max_length=150, blank=True, verbose_name="Responsable")
    weight = models.PositiveSmallIntegerField(
        default=1, help_text="Peso dentro del promedio de la línea", verbose_name="Peso"
    )
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="media", verbose_name="Prioridad")
    is_backlog = models.BooleanField(
        default=False, help_text="Backlog: posible desarrollo, no prioritario este ciclo",
        verbose_name="Backlog",
    )
    aligns_to = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="aligned_children",
        verbose_name="Alinea a",
    )
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Orden")

    class Meta:
        ordering = ["order", "code"]
        verbose_name = "Objetivo"
        verbose_name_plural = "Objetivos"

    def __str__(self):
        return f"{self.code} · {self.title}"

    @property
    def pct(self):
        """Promedio simple entre KRs — el peso por KR ya no se pide ni se
        edita, así que no puede quedar un valor residual que anule el avance
        real de un KR."""
        krs = list(self.key_results.all())
        if not krs:
            return 0
        return round(sum(kr.pct for kr in krs) / len(krs))


class KeyResult(models.Model):
    EVOLUTION_CHOICES = [
        ("", "—"),
        ("nuevo", "Nuevo"),
        ("evoluciona", "Evoluciona"),
        ("consolida", "Consolida"),
        ("mantiene", "Mantiene"),
    ]
    CONFIDENCE_CHOICES = [
        ("", "Sin evaluar"),
        ("verde", "Verde — en curso"),
        ("ambar", "Ámbar — en riesgo"),
        ("rojo", "Rojo — bloqueado"),
    ]

    objective = models.ForeignKey(Objective, on_delete=models.CASCADE, related_name="key_results", verbose_name="Objetivo")
    tag_label = models.CharField(max_length=60, help_text="Ej. 'KR 1 · Adopción COR' o 'NEO_VCD'", verbose_name="Etiqueta")
    text = models.TextField(verbose_name="Texto")
    weight = models.PositiveSmallIntegerField(
        default=1, help_text="Peso dentro del promedio del objetivo", verbose_name="Peso"
    )
    evolution_tag = models.CharField(max_length=12, choices=EVOLUTION_CHOICES, blank=True, verbose_name="Evolución")
    status_note = models.CharField(max_length=150, blank=True, help_text="Ej. 'Ventana: Julio'", verbose_name="Nota de estado")
    extra_note = models.TextField(blank=True, verbose_name="Nota adicional")
    confidence = models.CharField(max_length=6, choices=CONFIDENCE_CHOICES, blank=True, verbose_name="Confianza")
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Orden")

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Key Result"
        verbose_name_plural = "Key Results"

    def __str__(self):
        return f"{self.tag_label} · {self.objective.code}"

    @property
    def pct(self):
        kpis = list(self.kpis.all())
        if not kpis:
            return 0
        return round(sum(k.pct for k in kpis) / len(kpis))


class ActionItem(models.Model):
    """Una 'acción clave' de un KR — ahora marcable, no solo un <li> suelto."""

    key_result = models.ForeignKey(KeyResult, on_delete=models.CASCADE, related_name="action_items", verbose_name="Key Result")
    text = models.CharField(max_length=400, verbose_name="Texto")
    is_done = models.BooleanField(default=False, verbose_name="Hecho")
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Orden")

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "Acción"
        verbose_name_plural = "Acciones"

    def __str__(self):
        return self.text[:60]


class Kpi(models.Model):
    key_result = models.ForeignKey(KeyResult, on_delete=models.CASCADE, related_name="kpis", verbose_name="Key Result")
    name = models.CharField(max_length=200, verbose_name="Nombre")
    baseline = models.FloatField(
        default=0, verbose_name="Valor de inicio",
        help_text="Desde dónde partís. Permite medir avance aunque la meta sea bajar (incluso a negativo).",
    )
    target = models.FloatField(verbose_name="Meta")
    unit = models.CharField(max_length=20, blank=True, help_text="Ej. '%', 'COP', '#'", verbose_name="Unidad")
    order = models.PositiveSmallIntegerField(default=0, verbose_name="Orden")

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "KPI"
        verbose_name_plural = "KPIs"

    def __str__(self):
        return self.name

    @property
    def latest_checkin(self):
        return self.checkins.order_by("-created_at", "-id").first()

    @property
    def history(self):
        """Check-ins en orden cronológico (más viejo primero), para graficar
        tendencia. Usa self.checkins.all() en vez de un nuevo order_by() para
        aprovechar el prefetch_related ya cargado por la vista."""
        items = list(self.checkins.all())
        items.reverse()
        return items

    @property
    def current(self):
        latest = self.latest_checkin
        return latest.value if latest else self.baseline

    @property
    def pct(self):
        return _pct(self.current, self.target, self.baseline)


class CheckIn(models.Model):
    """Un punto de la serie histórica de un KPI. Nunca se sobreescribe —
    reemplaza el patrón anterior de 'current' como único valor guardado."""

    kpi = models.ForeignKey(Kpi, on_delete=models.CASCADE, related_name="checkins", verbose_name="KPI")
    value = models.FloatField(verbose_name="Valor")
    note = models.CharField(max_length=300, blank=True, verbose_name="Nota")
    created_at = models.DateTimeField(default=timezone.now, verbose_name="Fecha")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        verbose_name="Registrado por",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Check-in"
        verbose_name_plural = "Check-ins"

    def __str__(self):
        return f"{self.kpi.name} = {self.value} ({self.created_at:%Y-%m-%d})"
