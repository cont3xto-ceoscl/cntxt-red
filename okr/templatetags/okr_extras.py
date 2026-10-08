from django import template
from django.utils.formats import date_format
from django.utils.safestring import mark_safe

register = template.Library()

RING_CIRCUMFERENCE = 138.23  # 2 * pi * r22, mismo radio que el reporte original

CONFIDENCE_META = {
    "verde": {"label": "En curso", "hex": "#6FA96F"},
    "ambar": {"label": "En riesgo", "hex": "#D9A441"},
    "rojo": {"label": "Bloqueado", "hex": "#D9534F"},
}

EVOLUTION_LABELS = {
    "nuevo": "Nuevo",
    "evoluciona": "Evoluciona",
    "consolida": "Consolida",
    "mantiene": "Mantiene",
}

PRIORITY_META = {
    "critica": {"label": "Crítica", "hex": "#D9534F"},
    "alta": {"label": "Alta", "hex": "#CE7A3E"},
    "media": {"label": "Media", "hex": "#8a8a85"},
    "baja": {"label": "Baja", "hex": "#5f5f5a"},
}


@register.filter
def ring_offset(pct):
    pct = max(0, min(100, pct or 0))
    return round(RING_CIRCUMFERENCE * (1 - pct / 100), 2)


@register.simple_tag
def ring_circumference():
    return RING_CIRCUMFERENCE


@register.filter
def confidence_hex(code):
    return CONFIDENCE_META.get(code, {}).get("hex", "#8a8a85")


@register.filter
def confidence_label(code):
    return CONFIDENCE_META.get(code, {}).get("label", "Sin evaluar")


@register.filter
def evolution_label(code):
    return EVOLUTION_LABELS.get(code, code)


@register.filter
def priority_hex(code):
    return PRIORITY_META.get(code, {}).get("hex", "#8a8a85")


@register.filter
def priority_label(code):
    return PRIORITY_META.get(code, {}).get("label", code)


@register.filter
def mul(value, arg):
    try:
        return float(value) * float(arg)
    except (TypeError, ValueError):
        return 0


@register.simple_tag
def trend_chart(series, width=680, height=220):
    """Gráfico de líneas: avance en el tiempo, una serie por línea de
    negocio, a partir de check-ins reales agregados por día. Vacío si
    ninguna línea tiene todavía 2+ fechas con check-in."""
    if not series:
        return ""
    all_dates = sorted({d for s in series for d, _ in s["points"]})
    min_date, max_date = all_dates[0], all_dates[-1]
    span_days = (max_date - min_date).days or 1

    pad_l, pad_r, pad_t, pad_b = 34, 46, 14, 24
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b

    def xy(d, pct):
        x = pad_l + (d - min_date).days / span_days * plot_w
        y = pad_t + (1 - pct / 100) * plot_h
        return x, y

    parts = []
    for pct in (0, 25, 50, 75, 100):
        _, y = xy(min_date, pct)
        parts.append(
            f'<line x1="{pad_l}" y1="{y:.1f}" x2="{width - pad_r}" y2="{y:.1f}" '
            f'stroke="#2a2a2a" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{pad_l - 8}" y="{y + 3:.1f}" text-anchor="end" font-size="9" '
            f'font-family="monospace" fill="#737373">{pct}%</text>'
        )

    x0, _ = xy(min_date, 0)
    x1, _ = xy(max_date, 0)
    parts.append(
        f'<text x="{x0:.1f}" y="{height - 6}" text-anchor="start" font-size="9" '
        f'font-family="monospace" fill="#737373">{date_format(min_date, "d M")}</text>'
    )
    parts.append(
        f'<text x="{x1:.1f}" y="{height - 6}" text-anchor="end" font-size="9" '
        f'font-family="monospace" fill="#737373">{date_format(max_date, "d M")}</text>'
    )

    for s in series:
        color = s["line"].color_hex
        pts = [xy(d, p) for d, p in s["points"]]
        pts_str = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        parts.append(
            f'<polyline points="{pts_str}" fill="none" stroke="{color}" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
        for x, y in pts:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.5" fill="{color}"/>')
        lx, ly = pts[-1]
        parts.append(
            f'<text x="{lx + 7:.1f}" y="{ly + 3:.1f}" font-size="10" font-family="monospace" '
            f'font-weight="700" fill="{color}">{s["line"].code.upper()}</text>'
        )

    inner = "".join(parts)
    svg = (
        f'<svg viewBox="0 0 {width} {height}" class="w-full h-auto" role="img" '
        f'aria-label="Tendencia de avance por línea en el tiempo">{inner}</svg>'
    )
    return mark_safe(svg)
