from django.urls import path

from . import views

urlpatterns = [
    path("", views.seguimiento_home, name="seguimiento_home"),
    path("modo/", views.toggle_view_mode, name="toggle_view_mode"),
    path("cycles/", views.cycles, name="cycles"),
    path("cycles/<int:pk>/edit/", views.cycle_edit, name="cycle_edit"),
    path("cycles/<int:pk>/delete/", views.cycle_delete, name="cycle_delete"),
    path("analytics/", views.analytics, name="analytics"),
    path("systems/new/", views.line_new, name="line_new"),
    path("systems/<int:pk>/edit/", views.line_edit, name="line_edit"),
    path("plans/<int:pk>/edit/", views.plan_edit, name="plan_edit"),
    path("objectives/plan/<int:plan_id>/new/", views.objective_form, name="objective_new"),
    path("objectives/<int:pk>/edit/", views.objective_edit, name="objective_edit"),
    path("objectives/<int:pk>/delete/", views.objective_delete, name="objective_delete"),
    path("krs/objective/<int:objective_id>/new/", views.kr_form, name="kr_new"),
    path("krs/<int:pk>/edit/", views.kr_edit, name="kr_edit"),
    path("krs/<int:pk>/delete/", views.kr_delete, name="kr_delete"),
    path("krs/<int:pk>/confidence/", views.kr_confidence, name="kr_confidence"),
    path("kpis/kr/<int:kr_id>/new/", views.kpi_form, name="kpi_new"),
    path("kpis/<int:pk>/edit/", views.kpi_edit, name="kpi_edit"),
    path("kpis/<int:pk>/delete/", views.kpi_delete, name="kpi_delete"),
    path("kpis/<int:pk>/checkin/", views.kpi_checkin, name="kpi_checkin"),
    path("actions/kr/<int:kr_id>/new/", views.action_new, name="action_new"),
    path("actions/<int:pk>/toggle/", views.action_toggle, name="action_toggle"),
    # Catch-all de código de línea (neo, idi, red, cash, cor, bons) — SIEMPRE
    # al final: cualquier ruta literal de arriba debe ganarle a esta.
        path("api/objectives-kpis/", views.api_okr_objectives_kpis, name="api_okr_objectives_kpis"),
    path("<slug:line_code>/", views.seguimiento_line, name="seguimiento_line"),
]
