from collections import Counter, defaultdict

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_GET, require_POST

from .forms import (
    ActionItemForm, CheckInForm, CycleEditForm, CycleForm, KeyResultForm, KpiForm,
    LineCyclePlanForm, LineForm, ObjectiveForm,
)
from .models import ActionItem, CheckIn, Cycle, KeyResult, Kpi, Line, LineCyclePlan, Objective, _pct


def _active_cycle(request):
    cycle_id = request.GET.get("cycle") or request.POST.get("cycle")
    if cycle_id:
        cycle = Cycle.objects.filter(pk=cycle_id).first()
        if cycle:
            return cycle
    return Cycle.objects.filter(is_active=True).first() or Cycle.objects.first()


def _objective_card_html(request, objective):
    return render_to_string(
        "okr/partials/objective_card.html", {"objective": objective}, request=request
    )


def _at_risk(cycle):
    """KRs marcados en ámbar o rojo para el ciclo dado, rojo primero — el
    juicio del owner, no el cálculo matemático. Usado tanto en el home de
    Seguimiento (franja corta) como en Analítica (listado completo)."""
    at_risk = []
    if not cycle:
        return at_risk
    plans = (
        LineCyclePlan.objects.filter(cycle=cycle)
        .select_related("line")
        .prefetch_related("objectives__key_results")
    )
    for plan in plans:
        for objective in plan.objectives.all():
            for kr in objective.key_results.all():
                if kr.confidence in ("rojo", "ambar"):
                    at_risk.append({"line": plan.line, "objective": objective, "kr": kr})
    at_risk.sort(key=lambda r: r["kr"].confidence != "rojo")
    return at_risk


def _line_trend(cycle):
    """Serie de tendencia por línea a partir de check-ins reales: por cada
    fecha con al menos un check-in, el promedio de avance (valor/meta) de
    los check-ins de esa línea ese día. Una línea solo aparece si tiene 2+
    fechas distintas — con 1 sola no hay tendencia que mostrar, se llena
    sola con el uso."""
    if not cycle:
        return []
    checkins = CheckIn.objects.filter(
        kpi__key_result__objective__line_cycle_plan__cycle=cycle
    ).select_related("kpi", "kpi__key_result__objective__line_cycle_plan__line")

    by_line_date = defaultdict(list)
    lines_by_id = {}
    for c in checkins:
        line = c.kpi.key_result.objective.line_cycle_plan.line
        lines_by_id[line.id] = line
        by_line_date[(line.id, c.created_at.date())].append(_pct(c.value, c.kpi.target, c.kpi.baseline))

    series = []
    for line_id, line in lines_by_id.items():
        points = sorted(
            (date, sum(vals) / len(vals))
            for (lid, date), vals in by_line_date.items() if lid == line_id
        )
        if len(points) >= 2:
            series.append({"line": line, "points": points})
    series.sort(key=lambda s: s["line"].order)
    return series


@login_required
@require_POST
def toggle_view_mode(request):
    current = request.session.get("okr_view_mode", "edicion")
    request.session["okr_view_mode"] = "dashboard" if current == "edicion" else "edicion"
    next_url = request.POST.get("next") or "/"
    if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
        next_url = "/"
    return redirect(next_url)


@login_required
def seguimiento_home(request):
    cycle = _active_cycle(request)
    lines = []
    overall_pct = 0
    total_objectives = 0
    if cycle:
        plans_by_line = {
            p.line_id: p for p in LineCyclePlan.objects.filter(cycle=cycle).select_related("line")
        }
        for line in Line.objects.all():
            lines.append({"line": line, "plan": plans_by_line.get(line.id)})
        weighted_sum = 0
        for plan in plans_by_line.values():
            n = plan.objectives.count()
            total_objectives += n
            weighted_sum += plan.pct * n
        overall_pct = round(weighted_sum / total_objectives) if total_objectives else 0
    return render(
        request, "okr/seguimiento_home.html",
        {
            "cycle": cycle, "cycles": Cycle.objects.all(), "lines": lines,
            "overall_pct": overall_pct, "total_objectives": total_objectives,
        },
    )


@login_required
def seguimiento_line(request, line_code):
    line = get_object_or_404(Line, code=line_code)
    cycle = _active_cycle(request)
    plan = None
    if cycle:
        plan, _created = LineCyclePlan.objects.get_or_create(
            line=line, cycle=cycle, defaults={"status": "pendiente"}
        )
        plan = (
            LineCyclePlan.objects.filter(pk=plan.pk)
            .prefetch_related(
                "objectives__key_results__kpis__checkins",
                "objectives__key_results__action_items",
            )
            .first()
        )
    return render(
        request, "okr/seguimiento_line.html",
        {"cycle": cycle, "cycles": Cycle.objects.all(), "line": line, "plan": plan},
    )


@login_required
def line_new(request):
    cycle = _active_cycle(request)
    if request.method == "POST":
        form = LineForm(request.POST)
        if form.is_valid():
            line = form.save()
            entry = {"line": line, "plan": None}
            card_html = render_to_string(
                "okr/partials/line_card.html", {"entry": entry, "cycle": cycle}, request=request
            )
            trigger_html = render_to_string("okr/partials/line_new_trigger.html", {}, request=request)
            oob = f'<div id="lines-grid" hx-swap-oob="beforeend">{card_html}</div>'
            return HttpResponse(trigger_html + oob)
    else:
        form = LineForm()
    return render(
        request, "okr/partials/line_form.html",
        {
            "form": form, "line": None, "action_url": "/systems/new/",
            "target": "#line-new-trigger", "swap": "innerHTML",
        },
    )


@login_required
def line_edit(request, pk):
    line = get_object_or_404(Line, pk=pk)
    cycle = _active_cycle(request)
    if request.method == "POST":
        form = LineForm(request.POST, instance=line)
        if form.is_valid():
            form.save()
            plan = LineCyclePlan.objects.filter(line=line, cycle=cycle).first() if cycle else None
            entry = {"line": line, "plan": plan}
            return render(request, "okr/partials/line_card.html", {"entry": entry, "cycle": cycle})
    else:
        form = LineForm(instance=line)
    return render(
        request, "okr/partials/line_form.html",
        {
            "form": form, "line": line, "action_url": f"/systems/{line.id}/edit/",
            "target": f"#line-card-{line.id}", "swap": "outerHTML",
        },
    )


@login_required
def plan_edit(request, pk):
    plan = get_object_or_404(LineCyclePlan, pk=pk)
    if request.method == "POST":
        form = LineCyclePlanForm(request.POST, instance=plan)
        if form.is_valid():
            form.save()
            return render(request, "okr/partials/plan_summary.html", {"plan": plan, "line": plan.line})
    else:
        form = LineCyclePlanForm(instance=plan)
    return render(
        request, "okr/partials/plan_form.html",
        {
            "form": form, "plan": plan, "action_url": f"/plans/{plan.id}/edit/",
            "target": f"#plan-summary-{plan.id}", "swap": "outerHTML",
        },
    )


@login_required
def objective_form(request, plan_id):
    plan = get_object_or_404(LineCyclePlan, pk=plan_id)
    if request.method == "POST":
        form = ObjectiveForm(request.POST, line_cycle_plan=plan)
        if form.is_valid():
            objective = form.save(commit=False)
            objective.line_cycle_plan = plan
            objective.save()
            card_html = _objective_card_html(request, objective)
            trigger_html = render_to_string(
                "okr/partials/_objective_new_button.html", {"plan": plan}, request=request
            )
            oob = f'<div id="objectives-{plan.id}" hx-swap-oob="beforeend">{card_html}</div>'
            return HttpResponse(trigger_html + oob)
    else:
        form = ObjectiveForm(line_cycle_plan=plan)
    return render(
        request, "okr/partials/objective_form.html",
        {"form": form, "plan": plan, "action_url": f"/objectives/plan/{plan.id}/new/"},
    )


@login_required
def objective_edit(request, pk):
    objective = get_object_or_404(Objective, pk=pk)
    if request.method == "POST":
        form = ObjectiveForm(request.POST, instance=objective, line_cycle_plan=objective.line_cycle_plan)
        if form.is_valid():
            form.save()
            return render(request, "okr/partials/objective_card.html", {"objective": objective, "open": True})
    else:
        form = ObjectiveForm(instance=objective, line_cycle_plan=objective.line_cycle_plan)
    return render(
        request, "okr/partials/objective_form.html",
        {"form": form, "objective": objective, "action_url": f"/objectives/{objective.id}/edit/"},
    )


@login_required
@require_POST
def objective_delete(request, pk):
    objective = get_object_or_404(Objective, pk=pk)
    objective.delete()
    return HttpResponse("")


@login_required
def kr_form(request, objective_id):
    objective = get_object_or_404(Objective, pk=objective_id)
    if request.method == "POST":
        form = KeyResultForm(request.POST)
        if form.is_valid():
            kr = form.save(commit=False)
            kr.objective = objective
            kr.save()
            return render(request, "okr/partials/objective_card.html", {"objective": objective, "open": True})
    else:
        form = KeyResultForm()
    return render(
        request, "okr/partials/kr_form.html",
        {"form": form, "objective": objective, "action_url": f"/krs/objective/{objective.id}/new/"},
    )


@login_required
def kr_edit(request, pk):
    kr = get_object_or_404(KeyResult, pk=pk)
    if request.method == "POST":
        form = KeyResultForm(request.POST, instance=kr)
        if form.is_valid():
            form.save()
            return render(
                request, "okr/partials/objective_card.html",
                {"objective": kr.objective, "open": True, "open_kr_id": kr.id},
            )
    else:
        form = KeyResultForm(instance=kr)
    return render(
        request, "okr/partials/kr_form.html",
        {"form": form, "objective": kr.objective, "action_url": f"/krs/{kr.id}/edit/"},
    )


@login_required
@require_POST
def kr_delete(request, pk):
    kr = get_object_or_404(KeyResult, pk=pk)
    objective = kr.objective
    kr.delete()
    return render(request, "okr/partials/objective_card.html", {"objective": objective, "open": True})


@login_required
@require_POST
def kr_confidence(request, pk):
    kr = get_object_or_404(KeyResult, pk=pk)
    value = request.POST.get("confidence", "")
    if value in dict(KeyResult.CONFIDENCE_CHOICES):
        kr.confidence = value
        kr.save(update_fields=["confidence"])
    return render(
        request, "okr/partials/objective_card.html",
        {"objective": kr.objective, "open": True, "open_kr_id": kr.id},
    )


@login_required
def kpi_form(request, kr_id):
    kr = get_object_or_404(KeyResult, pk=kr_id)
    if request.method == "POST":
        form = KpiForm(request.POST)
        if form.is_valid():
            kpi = form.save(commit=False)
            kpi.key_result = kr
            kpi.save()
            return render(
                request, "okr/partials/objective_card.html",
                {"objective": kr.objective, "open": True, "open_kr_id": kr.id},
            )
    else:
        form = KpiForm()
    return render(
        request, "okr/partials/kpi_form.html",
        {"form": form, "kr": kr, "action_url": f"/kpis/kr/{kr.id}/new/"},
    )


@login_required
def kpi_edit(request, pk):
    kpi = get_object_or_404(Kpi, pk=pk)
    if request.method == "POST":
        form = KpiForm(request.POST, instance=kpi)
        if form.is_valid():
            form.save()
            return render(
                request, "okr/partials/objective_card.html",
                {"objective": kpi.key_result.objective, "open": True, "open_kr_id": kpi.key_result_id},
            )
    else:
        form = KpiForm(instance=kpi)
    return render(
        request, "okr/partials/kpi_form.html",
        {"form": form, "kr": kpi.key_result, "action_url": f"/kpis/{kpi.id}/edit/"},
    )


@login_required
@require_POST
def kpi_delete(request, pk):
    kpi = get_object_or_404(Kpi, pk=pk)
    objective = kpi.key_result.objective
    kr_id = kpi.key_result_id
    kpi.delete()
    return render(
        request, "okr/partials/objective_card.html",
        {"objective": objective, "open": True, "open_kr_id": kr_id},
    )


@login_required
@require_POST
def kpi_checkin(request, pk):
    kpi = get_object_or_404(Kpi, pk=pk)
    form = CheckInForm(request.POST)
    if form.is_valid():
        checkin = form.save(commit=False)
        checkin.kpi = kpi
        checkin.created_by = request.user
        checkin.save()
    return render(
        request, "okr/partials/objective_card.html",
        {"objective": kpi.key_result.objective, "open": True, "open_kr_id": kpi.key_result_id},
    )


@login_required
def action_new(request, kr_id):
    kr = get_object_or_404(KeyResult, pk=kr_id)
    if request.method == "POST":
        form = ActionItemForm(request.POST)
        if form.is_valid():
            item = form.save(commit=False)
            item.key_result = kr
            item.save()
            return render(
                request, "okr/partials/objective_card.html",
                {"objective": kr.objective, "open": True, "open_kr_id": kr.id},
            )
    else:
        form = ActionItemForm()
    return render(
        request, "okr/partials/action_form.html",
        {"form": form, "kr": kr, "action_url": f"/actions/kr/{kr.id}/new/"},
    )


@login_required
@require_POST
def action_toggle(request, pk):
    item = get_object_or_404(ActionItem, pk=pk)
    item.is_done = not item.is_done
    item.save(update_fields=["is_done"])
    return render(
        request, "okr/partials/objective_card.html",
        {"objective": item.key_result.objective, "open": True, "open_kr_id": item.key_result_id},
    )


@login_required
def cycles(request):
    if request.method == "POST":
        form = CycleForm(request.POST)
        if form.is_valid():
            cycle = form.save()
            source = form.cleaned_data.get("duplicate_from")
            if source:
                _duplicate_cycle(source, cycle)
            return redirect(f"/?cycle={cycle.id}")
    else:
        form = CycleForm()
    return render(request, "okr/cycles.html", {"form": form, "cycles": Cycle.objects.all()})


@login_required
def cycle_edit(request, pk):
    cycle = get_object_or_404(Cycle, pk=pk)
    if request.method == "POST":
        form = CycleEditForm(request.POST, instance=cycle)
        if form.is_valid():
            form.save()
            return render(request, "okr/partials/cycle_row.html", {"c": cycle})
    else:
        form = CycleEditForm(instance=cycle)
    return render(
        request, "okr/partials/cycle_form.html",
        {
            "form": form, "cycle": cycle, "action_url": f"/cycles/{cycle.id}/edit/",
            "target": f"#cycle-row-{cycle.id}", "swap": "outerHTML",
        },
    )


@login_required
@require_POST
def cycle_delete(request, pk):
    cycle = get_object_or_404(Cycle, pk=pk)
    cycle.delete()
    return HttpResponse("")


def _duplicate_cycle(source_cycle, target_cycle):
    for plan in LineCyclePlan.objects.filter(cycle=source_cycle):
        new_plan = LineCyclePlan.objects.create(
            line=plan.line, cycle=target_cycle, status=plan.status,
            intro_text=plan.intro_text, summary_text=plan.summary_text,
            deliverable=plan.deliverable, lead_label=plan.lead_label,
            closing_quote=plan.closing_quote, closing_quote_label=plan.closing_quote_label,
        )
        for objective in plan.objectives.all():
            new_objective = Objective.objects.create(
                line_cycle_plan=new_plan, code=objective.code, title=objective.title,
                description=objective.description, owner_label=objective.owner_label,
                weight=objective.weight, priority=objective.priority,
                is_backlog=objective.is_backlog, order=objective.order,
            )
            for kr in objective.key_results.all():
                new_kr = KeyResult.objects.create(
                    objective=new_objective, tag_label=kr.tag_label, text=kr.text,
                    weight=kr.weight, evolution_tag=kr.evolution_tag,
                    status_note=kr.status_note, extra_note=kr.extra_note, order=kr.order,
                )
                for kpi in kr.kpis.all():
                    Kpi.objects.create(
                        key_result=new_kr, name=kpi.name, target=kpi.target,
                        unit=kpi.unit, order=kpi.order,
                    )
                for action in kr.action_items.all():
                    ActionItem.objects.create(
                        key_result=new_kr, text=action.text, order=action.order,
                    )


@login_required
def analytics(request):
    cycle = _active_cycle(request)
    lines_data = []
    at_risk = _at_risk(cycle)
    line_trend = _line_trend(cycle)
    trend_by_line = {s["line"].id: s["points"] for s in line_trend}
    if cycle:
        risk_by_line = Counter(r["line"].id for r in at_risk)
        plans = (
            LineCyclePlan.objects.filter(cycle=cycle)
            .select_related("line")
            .prefetch_related("objectives__key_results__kpis__checkins")
        )
        for plan in plans:
            points = trend_by_line.get(plan.line_id)
            delta = round(points[-1][1] - points[0][1]) if points and len(points) >= 2 else None
            lines_data.append({
                "line": plan.line, "plan": plan, "pct": plan.pct,
                "objectives_count": plan.objectives.count(),
                "at_risk_count": risk_by_line.get(plan.line_id, 0),
                "delta": delta,
                "delta_label": f"{delta:+d}%" if delta is not None else None,
            })
        lines_data.sort(key=lambda d: d["pct"])
    total_objectives = sum(d["objectives_count"] for d in lines_data)
    overall_pct = (
        round(sum(d["pct"] * d["objectives_count"] for d in lines_data) / total_objectives)
        if total_objectives else 0
    )
    return render(
        request, "okr/analytics.html",
        {
            "cycle": cycle, "cycles": Cycle.objects.all(), "lines_data": lines_data,
            "at_risk": at_risk, "line_trend": line_trend,
            "overall_pct": overall_pct, "total_objectives": total_objectives,
        },
    )


@require_GET
def api_okr_objectives_kpis(request):
    """
    Endpoint JSON para consultar objetivos y KPIs de OKRs.
    Parámetros opcionales:
    - line: código de línea ('neo', 'idi', 'red', 'cash', 'cor', 'bons')
    - cycle: ID de ciclo (si no se envía, usa el ciclo activo)
    """
    from django.http import JsonResponse
    cycle = _active_cycle(request)
    if not cycle:
        return JsonResponse({"status": "error", "message": "No active cycle found"}, status=404)

    line_code = request.GET.get("line", "").strip().lower()
    plans = LineCyclePlan.objects.filter(cycle=cycle).select_related("line").prefetch_related(
        "objectives__key_results__kpis"
    )
    if line_code:
        plans = plans.filter(line__code=line_code)

    lines_data = []
    for plan in plans:
        objs_data = []
        for obj in plan.objectives.all():
            kpis_data = []
            for kr in obj.key_results.all():
                for kpi in kr.kpis.all():
                    kpis_data.append({
                        "id": kpi.id,
                        "kr_id": kr.id,
                        "kr_tag": kr.tag_label,
                        "name": kpi.name,
                        "current": float(kpi.current),
                        "target": float(kpi.target),
                        "baseline": float(kpi.baseline) if kpi.baseline is not None else 0.0,
                        "unit": kpi.unit or "",
                        "display": f"{kpi.name} (Meta: {kpi.target}{kpi.unit or ''})"
                    })
            objs_data.append({
                "id": obj.id,
                "code": obj.code,
                "title": obj.title,
                "description": obj.description or "",
                "kpis": kpis_data
            })
        lines_data.append({
            "line_code": plan.line.code,
            "line_name": plan.line.name,
            "line_full_name": plan.line.full_name,
            "line_color": plan.line.color_hex,
            "objectives": objs_data
        })

    all_objectives = []
    for l_item in lines_data:
        for obj_item in l_item.get("objectives", []):
            item_copy = dict(obj_item)
            item_copy["line_code"] = l_item.get("line_code")
            item_copy["line_name"] = l_item.get("line_name")
            all_objectives.append(item_copy)

    return JsonResponse({
        "status": "success",
        "cycle": {
            "id": cycle.id,
            "name": cycle.name,
            "is_active": cycle.is_active
        } if cycle else None,
        "objectives": all_objectives,
        "lines": lines_data
    })
